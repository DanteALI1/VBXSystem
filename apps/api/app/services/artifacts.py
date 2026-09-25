"""Shared scanner artifact storage: copy/normalize on ingest, path-safe serving."""

from __future__ import annotations

import base64
import logging
import mimetypes
import re
import shutil
from pathlib import Path
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Worker paths often use /data while API mounts the same volume under artifacts/.
_SOURCE_ALIASES: dict[str, str] = {
    "/data": "gowitness",
}

_SAFE_NAME_RE = re.compile(r"[^\w.\-]+", re.UNICODE)
_THUMB_INLINE_MAX = 64 * 1024  # keep thumbnail_b64 in evidence when small


def artifacts_root() -> Path:
    raw = (get_settings().vbx_artifacts_dir or "/app/artifacts").strip() or "/app/artifacts"
    root = Path(raw).expanduser()
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        logger.warning("cannot create artifacts root %s: %s", root, exc)
    return root


def known_source_roots() -> list[Path]:
    """Directories the API may read from when copying worker evidence."""
    root = artifacts_root()
    roots = [
        root / "gowitness",
        root / "nuclei",
        root / "nuclei-templates",
        root / "nuclei-custom",
        root,
    ]
    # Alias mount as reported by workers (same volume, different path).
    roots.append(Path("/data"))
    return roots


def safe_filename(name: str, *, default: str = "artifact") -> str:
    base = Path(str(name or "").replace("\\", "/")).name.strip()
    if not base or base in {".", ".."}:
        return default
    cleaned = _SAFE_NAME_RE.sub("_", base).strip("._")
    if not cleaned or cleaned in {".", ".."}:
        return default
    return cleaned[:200]


def sanitize_artifact_key(key: str) -> str:
    """Normalize a relative artifact key; raise ValueError on traversal."""
    raw = str(key or "").replace("\\", "/").strip()
    if not raw or raw.startswith("/") or raw.startswith("~"):
        raise ValueError("invalid artifact key")
    parts: list[str] = []
    for part in raw.split("/"):
        if part in ("", "."):
            continue
        if part == ".." or part.startswith(".."):
            raise ValueError("path traversal rejected")
        if "\x00" in part:
            raise ValueError("invalid artifact key")
        parts.append(safe_filename(part))
    if not parts:
        raise ValueError("empty artifact key")
    return "/".join(parts)


def resolve_artifact_path(key: str, *, root: Path | None = None) -> Path:
    """Resolve key under artifacts root with traversal protection."""
    base = (root or artifacts_root()).resolve()
    rel = sanitize_artifact_key(key)
    full = (base / rel).resolve()
    try:
        full.relative_to(base)
    except ValueError as exc:
        raise ValueError("path traversal rejected") from exc
    return full


def guess_media_type(path: Path) -> str:
    mt, _ = mimetypes.guess_type(str(path))
    if mt:
        return mt
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".gif":
        return "image/gif"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".json":
        return "application/json"
    if suffix in {".html", ".htm"}:
        return "text/html"
    if suffix in {".txt", ".log"}:
        return "text/plain"
    return "application/octet-stream"


def _is_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def _map_worker_path(raw: str) -> Path | None:
    """Map worker absolute paths (/data/...) onto API mount points."""
    text = str(raw or "").replace("\\", "/").strip()
    if not text:
        return None
    for alias, module_subdir in _SOURCE_ALIASES.items():
        prefix = alias.rstrip("/")
        if text == prefix or text.startswith(prefix + "/"):
            rel = text[len(prefix) :].lstrip("/")
            candidate = artifacts_root() / module_subdir / rel
            return candidate
    return Path(text)


def locate_source_file(raw_path: str) -> Path | None:
    """Find an existing file from evidence path under known roots."""
    mapped = _map_worker_path(raw_path)
    candidates: list[Path] = []
    if mapped is not None:
        candidates.append(mapped)
    text = str(raw_path or "").replace("\\", "/").strip()
    if text:
        candidates.append(Path(text))
        name = Path(text).name
        if name:
            for root in known_source_roots():
                candidates.append(root / name)
                # Common worker layout: /data/{job_id}/file.png
                parts = Path(text).parts
                if len(parts) >= 2:
                    candidates.append(root / Path(*parts[-2:]))

    seen: set[str] = set()
    for cand in candidates:
        key = str(cand)
        if key in seen:
            continue
        seen.add(key)
        try:
            if cand.is_file():
                # Prefer files under known roots; still allow exact mapped hit.
                roots = known_source_roots()
                if any(_is_under(cand, r) for r in roots) or mapped is not None and cand == mapped:
                    return cand.resolve()
        except OSError:
            continue
    return None


def store_bytes(
    data: bytes,
    *,
    module_id: str,
    job_id: int | str,
    filename: str,
) -> str:
    """Write bytes into artifacts/{module}/{job}/{name}; return artifact_key."""
    mod = safe_filename(module_id, default="module")
    job = safe_filename(str(job_id), default="0")
    name = safe_filename(filename, default="artifact.bin")
    key = f"{mod}/{job}/{name}"
    dest = resolve_artifact_path(key)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return key


def copy_into_artifacts(
    source: Path,
    *,
    module_id: str,
    job_id: int | str,
    filename: str | None = None,
) -> str:
    """Copy source file into normalized layout; return artifact_key."""
    name = safe_filename(filename or source.name, default="artifact.bin")
    mod = safe_filename(module_id, default="module")
    job = safe_filename(str(job_id), default="0")
    key = f"{mod}/{job}/{name}"
    dest = resolve_artifact_path(key)
    dest.parent.mkdir(parents=True, exist_ok=True)
    src = source.resolve()
    if src != dest:
        shutil.copy2(src, dest)
    return key


def normalize_finding_evidence(
    evidence: dict[str, Any] | None,
    *,
    module_id: str,
    job_id: int | str,
) -> dict[str, Any]:
    """
    Copy screenshot/artifact paths into shared artifacts root and rewrite evidence.

    Sets ``artifact_key`` (relative under VBX_ARTIFACTS_DIR). Keeps small
    ``thumbnail_b64`` inline; larger thumbs become sibling ``.thumb.png`` files.
    """
    ev: dict[str, Any] = dict(evidence) if isinstance(evidence, dict) else {}
    if not ev.get("module"):
        ev["module"] = str(module_id or "")

    path_keys = ("screenshot_path", "artifact_path")
    source_raw = ""
    for pk in path_keys:
        val = ev.get(pk)
        if isinstance(val, str) and val.strip():
            source_raw = val.strip()
            break

    artifact_key: str | None = None
    if source_raw:
        # Already a relative key under artifacts?
        try:
            existing = resolve_artifact_path(source_raw)
            if existing.is_file():
                artifact_key = sanitize_artifact_key(source_raw)
        except ValueError:
            existing = None

        if not artifact_key:
            located = locate_source_file(source_raw)
            if located is not None:
                try:
                    artifact_key = copy_into_artifacts(
                        located,
                        module_id=module_id,
                        job_id=job_id,
                        filename=located.name,
                    )
                except OSError as exc:
                    logger.warning("artifact copy failed for %s: %s", source_raw, exc)
            else:
                logger.debug("artifact source not found: %s", source_raw)

    thumb = ev.get("thumbnail_b64")
    if isinstance(thumb, str) and thumb.strip():
        raw_b64 = thumb.strip()
        # Strip data-URL prefix if present.
        if "," in raw_b64 and raw_b64.lower().startswith("data:"):
            raw_b64 = raw_b64.split(",", 1)[1]
        try:
            thumb_bytes = base64.b64decode(raw_b64, validate=False)
        except Exception:
            thumb_bytes = b""
        if thumb_bytes and len(thumb_bytes) > _THUMB_INLINE_MAX:
            try:
                thumb_name = "thumbnail.png"
                if artifact_key:
                    stem = Path(artifact_key).stem
                    thumb_name = f"{stem}.thumb.png"
                thumb_key = store_bytes(
                    thumb_bytes,
                    module_id=module_id,
                    job_id=job_id,
                    filename=thumb_name,
                )
                ev["thumbnail_artifact_key"] = thumb_key
                ev.pop("thumbnail_b64", None)
            except OSError as exc:
                logger.warning("thumbnail store failed: %s", exc)
        elif thumb_bytes:
            ev["thumbnail_b64"] = raw_b64
            ev.setdefault("thumbnail_format", "png")

    if artifact_key:
        ev["artifact_key"] = artifact_key
        # Keep original path for audit; primary reference is artifact_key.
        if "screenshot_path" in ev and not ev.get("screenshot_path_orig"):
            ev["screenshot_path_orig"] = ev.get("screenshot_path")
        if "artifact_path" in ev and not ev.get("artifact_path_orig"):
            ev["artifact_path_orig"] = ev.get("artifact_path")

    return ev
