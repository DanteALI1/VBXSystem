"""Nuclei template catalog: sync official pack, index YAML, custom uploads."""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger("vbx.nuclei_templates")

REPO_URL = "https://github.com/projectdiscovery/nuclei-templates.git"
INDEX_FILENAME = "nuclei-index.json"

SETTING_AUTO_SYNC = "nuclei_templates_auto_sync"
SETTING_LAST_SYNC = "nuclei_templates_last_sync"
SETTING_LAST_STATUS = "nuclei_templates_last_sync_status"
SETTING_LAST_ERROR = "nuclei_templates_last_sync_error"
SETTING_COUNT = "nuclei_templates_count"
SETTING_CUSTOM_COUNT = "nuclei_templates_custom_count"

_SYNC_LOCK = threading.Lock()
_sync_running = False

_ID_RE = re.compile(r"(?m)^id:\s*[\"']?([^\"'\n#]+?)[\"']?\s*(?:#.*)?$")
_NAME_RE = re.compile(r"(?m)^\s+name:\s*[\"']?(.+?)[\"']?\s*(?:#.*)?$")
_SEVERITY_RE = re.compile(r"(?m)^\s+severity:\s*[\"']?(\w+)[\"']?\s*(?:#.*)?$")
_TAGS_LINE_RE = re.compile(r"(?m)^\s+tags:\s*(.+?)\s*$")


def official_dir() -> Path:
    return Path(get_settings().nuclei_templates_dir_effective())


def custom_dir() -> Path:
    return Path(get_settings().nuclei_custom_dir_effective())


def artifacts_root() -> Path:
    """Parent artifacts directory."""
    return Path(get_settings().vbx_artifacts_dir or "/app/artifacts")


def index_path() -> Path:
    # Persist on the official templates volume (survives API container restarts)
    return official_dir() / ".vbx-index.json"


def ensure_dirs() -> None:
    official_dir().mkdir(parents=True, exist_ok=True)
    custom_dir().mkdir(parents=True, exist_ok=True)
    artifacts_root().mkdir(parents=True, exist_ok=True)


def default_templates_path() -> str:
    """Path workers should use when admin setting is empty."""
    return str(official_dir())


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _git_available() -> bool:
    return shutil.which("git") is not None


def _parse_tags_value(raw: str) -> list[str]:
    text = (raw or "").strip()
    if not text:
        return []
    # Strip inline comments
    if "#" in text and not text.strip().startswith("["):
        text = text.split("#", 1)[0].strip()
    # YAML list: [a, b] or ["a", "b"]
    if text.startswith("[") and text.endswith("]"):
        inner = text[1:-1]
        parts: list[str] = []
        for chunk in inner.split(","):
            t = chunk.strip().strip("\"'")
            if t:
                parts.append(t)
        return parts
    # CSV / space-separated
    parts = []
    for chunk in text.replace(";", ",").split(","):
        t = chunk.strip().strip("\"'")
        if t:
            parts.append(t)
    return parts


def extract_template_meta(text: str, *, rel_path: str = "") -> dict[str, Any] | None:
    """Extract id/name/severity/tags from a nuclei YAML template body."""
    if not (text or "").strip():
        return None
    # Skip workflows / non-templates without id
    mid = _ID_RE.search(text)
    if not mid:
        # Fallback: filename stem as id for custom uploads that omit id
        stem = Path(rel_path).stem if rel_path else ""
        if not stem:
            return None
        tid = stem
    else:
        tid = mid.group(1).strip()
    if not tid:
        return None

    name_m = _NAME_RE.search(text)
    sev_m = _SEVERITY_RE.search(text)
    tags_m = _TAGS_LINE_RE.search(text)
    tags = _parse_tags_value(tags_m.group(1)) if tags_m else []

    return {
        "id": tid,
        "name": (name_m.group(1).strip() if name_m else tid)[:200],
        "severity": (sev_m.group(1).strip().lower() if sev_m else "info"),
        "tags": tags,
        "path": rel_path.replace("\\", "/"),
    }


def _iter_yaml_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    out: list[Path] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in {".yaml", ".yml"}:
            continue
        # Skip helper/vendor noise
        name = p.name.lower()
        if name in {"workflows.yaml", "workflows.yml"}:
            continue
        parts = {x.lower() for x in p.parts}
        if ".git" in parts:
            continue
        # Skip hidden dirs (.github, .vbx, …)
        if any(part.startswith(".") for part in p.relative_to(root).parts[:-1]):
            continue
        out.append(p)
    return out


def scan_templates_dir(root: Path, *, source: str) -> list[dict[str, Any]]:
    """Walk a directory and return template metadata entries."""
    entries: list[dict[str, Any]] = []
    if not root.is_dir():
        return entries
    root = root.resolve()
    for path in _iter_yaml_files(root):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        try:
            rel = str(path.relative_to(root))
        except ValueError:
            rel = path.name
        meta = extract_template_meta(text, rel_path=rel)
        if not meta:
            continue
        meta["source"] = source
        meta["abs_path"] = str(path)
        entries.append(meta)
    return entries


def build_index(*, write: bool = True) -> dict[str, Any]:
    """Build catalog index from official + custom dirs."""
    ensure_dirs()
    official = scan_templates_dir(official_dir(), source="official")
    custom = scan_templates_dir(custom_dir(), source="custom")
    templates = [*official, *custom]

    tag_counts: dict[str, int] = {}
    for t in templates:
        for tag in t.get("tags") or []:
            key = str(tag).strip()
            if not key:
                continue
            tag_counts[key] = tag_counts.get(key, 0) + 1

    tags = [
        {"tag": k, "count": v}
        for k, v in sorted(tag_counts.items(), key=lambda x: (-x[1], x[0].lower()))
    ]

    index: dict[str, Any] = {
        "built_at": _utcnow_iso(),
        "official_path": str(official_dir()),
        "custom_path": str(custom_dir()),
        "official_count": len(official),
        "custom_count": len(custom),
        "template_count": len(templates),
        "tags": tags,
        "templates": [
            {
                "id": t["id"],
                "name": t["name"],
                "path": t["path"],
                "tags": t.get("tags") or [],
                "severity": t.get("severity") or "info",
                "source": t.get("source") or "official",
            }
            for t in sorted(templates, key=lambda x: (x.get("source") or "", x.get("id") or ""))
        ],
    }
    if write:
        path = index_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info(
            "nuclei index built: %s templates (%s official, %s custom) → %s",
            index["template_count"],
            index["official_count"],
            index["custom_count"],
            path,
        )
    return index


def load_index() -> dict[str, Any]:
    path = index_path()
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "templates" in data:
                return data
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("failed to read nuclei index: %s", exc)
    return build_index(write=True)


def list_catalog(
    *,
    q: str | None = None,
    tag: str | None = None,
    source: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    index = load_index()
    templates: list[dict[str, Any]] = list(index.get("templates") or [])
    q_norm = (q or "").strip().lower()
    tag_norm = (tag or "").strip().lower()
    source_norm = (source or "").strip().lower()

    filtered: list[dict[str, Any]] = []
    for t in templates:
        if source_norm and str(t.get("source") or "").lower() != source_norm:
            continue
        if tag_norm:
            tags = [str(x).lower() for x in (t.get("tags") or [])]
            if tag_norm not in tags:
                continue
        if q_norm:
            hay = " ".join(
                [
                    str(t.get("id") or ""),
                    str(t.get("name") or ""),
                    str(t.get("path") or ""),
                    " ".join(str(x) for x in (t.get("tags") or [])),
                ]
            ).lower()
            if q_norm not in hay:
                continue
        filtered.append(t)

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 50), 200))
    total = len(filtered)
    start = (page - 1) * page_size
    slice_ = filtered[start : start + page_size]

    return {
        "tags": index.get("tags") or [],
        "templates": slice_,
        "total": total,
        "page": page,
        "page_size": page_size,
        "q": q or "",
        "official_count": int(index.get("official_count") or 0),
        "custom_count": int(index.get("custom_count") or 0),
        "template_count": int(index.get("template_count") or 0),
        "built_at": index.get("built_at"),
    }


def _persist_sync_meta(
    *,
    status: str,
    error: str = "",
    official_count: int = 0,
    custom_count: int = 0,
) -> None:
    """Best-effort persist status into system_settings (opens own session)."""
    try:
        from app.db import SessionLocal
        from app.services.auth_helpers import set_setting

        db = SessionLocal()
        try:
            set_setting(db, SETTING_LAST_SYNC, _utcnow_iso())
            set_setting(db, SETTING_LAST_STATUS, status)
            set_setting(db, SETTING_LAST_ERROR, (error or "")[:2000])
            set_setting(db, SETTING_COUNT, str(official_count))
            set_setting(db, SETTING_CUSTOM_COUNT, str(custom_count))
        finally:
            db.close()
    except Exception as exc:  # pragma: no cover
        logger.warning("could not persist nuclei sync meta: %s", exc)


def get_status() -> dict[str, Any]:
    ensure_dirs()
    index: dict[str, Any] = {}
    path = index_path()
    if path.is_file():
        try:
            index = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            index = {}

    auto = True
    last_sync = None
    last_status = "never"
    last_error = ""
    try:
        from app.db import SessionLocal
        from app.services.auth_helpers import get_setting

        db = SessionLocal()
        try:
            auto_raw = get_setting(db, SETTING_AUTO_SYNC, "")
            if auto_raw.strip():
                auto = auto_raw.strip().lower() in {"1", "true", "yes", "on"}
            else:
                auto = bool(get_settings().nuclei_templates_auto_sync)
            last_sync = get_setting(db, SETTING_LAST_SYNC, "") or None
            last_status = get_setting(db, SETTING_LAST_STATUS, "never") or "never"
            last_error = get_setting(db, SETTING_LAST_ERROR, "") or ""
        finally:
            db.close()
    except Exception:
        auto = bool(get_settings().nuclei_templates_auto_sync)

    global _sync_running
    if _sync_running:
        last_status = "running"

    return {
        "last_sync_at": last_sync,
        "last_sync_status": last_status,
        "last_sync_error": last_error,
        "template_count": int(index.get("template_count") or index.get("official_count") or 0),
        "official_count": int(index.get("official_count") or 0),
        "custom_count": int(index.get("custom_count") or 0),
        "official_path": str(official_dir()),
        "custom_path": str(custom_dir()),
        "auto_sync": auto,
        "index_built_at": index.get("built_at"),
        "git_available": _git_available(),
        "sync_running": _sync_running,
    }


def _run_git(args: list[str], *, cwd: Path | None = None, timeout: int = 600) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def sync_official_templates(*, force: bool = False) -> dict[str, Any]:
    """git clone/pull projectdiscovery/nuclei-templates (shallow). Skip if no git."""
    ensure_dirs()
    dest = official_dir()

    if not _git_available():
        msg = "git not available; skipping nuclei templates sync"
        logger.warning(msg)
        index = build_index(write=True)
        stats = {
            "skipped": True,
            "reason": "git_not_available",
            "error": msg,
            "official_count": index.get("official_count", 0),
            "custom_count": index.get("custom_count", 0),
            "template_count": index.get("template_count", 0),
            "path": str(dest),
        }
        _persist_sync_meta(
            status="skipped",
            error=msg,
            official_count=int(stats["official_count"] or 0),
            custom_count=int(stats["custom_count"] or 0),
        )
        return stats

    try:
        if (dest / ".git").is_dir():
            logger.info("nuclei templates: git pull in %s", dest)
            proc = _run_git(["git", "pull", "--ff-only"], cwd=dest, timeout=600)
            action = "pull"
        else:
            # Fresh clone into dest (must be empty or non-existent for clean clone)
            if dest.exists() and any(dest.iterdir()) and not force:
                # Dir has content but no .git — rebuild index only
                logger.warning(
                    "nuclei templates dir exists without .git (%s); indexing as-is",
                    dest,
                )
                index = build_index(write=True)
                stats = {
                    "skipped": False,
                    "action": "index_only",
                    "reason": "directory_exists_without_git",
                    "official_count": index.get("official_count", 0),
                    "custom_count": index.get("custom_count", 0),
                    "template_count": index.get("template_count", 0),
                    "path": str(dest),
                }
                _persist_sync_meta(
                    status="success",
                    official_count=int(stats["official_count"] or 0),
                    custom_count=int(stats["custom_count"] or 0),
                )
                return stats
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists() and force:
                shutil.rmtree(dest)
            logger.info("nuclei templates: shallow clone into %s", dest)
            proc = _run_git(
                ["git", "clone", "--depth", "1", REPO_URL, str(dest)],
                timeout=900,
            )
            action = "clone"

        if proc.returncode != 0:
            err = ((proc.stderr or proc.stdout or "")[:1500]).strip() or f"git {action} failed"
            logger.error("nuclei templates sync failed: %s", err)
            _persist_sync_meta(status="failed", error=err)
            return {
                "skipped": False,
                "action": action,
                "ok": False,
                "error": err,
                "path": str(dest),
            }

        index = build_index(write=True)
        stats = {
            "skipped": False,
            "action": action,
            "ok": True,
            "official_count": index.get("official_count", 0),
            "custom_count": index.get("custom_count", 0),
            "template_count": index.get("template_count", 0),
            "path": str(dest),
            "built_at": index.get("built_at"),
        }
        _persist_sync_meta(
            status="success",
            official_count=int(stats["official_count"] or 0),
            custom_count=int(stats["custom_count"] or 0),
        )
        return stats
    except subprocess.TimeoutExpired:
        err = "git sync timed out"
        logger.error(err)
        _persist_sync_meta(status="failed", error=err)
        return {"skipped": False, "ok": False, "error": err, "path": str(dest)}
    except Exception as exc:
        err = str(exc)[:1500]
        logger.exception("nuclei templates sync error")
        _persist_sync_meta(status="failed", error=err)
        return {"skipped": False, "ok": False, "error": err, "path": str(dest)}


def run_nuclei_templates_sync(*, force: bool = False) -> dict[str, Any]:
    """Sync official pack + rebuild index. Serialized with a process lock."""
    global _sync_running
    if not _SYNC_LOCK.acquire(blocking=False):
        return {"skipped": True, "reason": "sync_already_running", "ok": False}
    _sync_running = True
    try:
        _persist_sync_meta(status="running")
        return sync_official_templates(force=force)
    finally:
        _sync_running = False
        _SYNC_LOCK.release()


def save_custom_uploads(files: list[tuple[str, bytes]]) -> dict[str, Any]:
    """Save uploaded .yaml/.yml files into custom dir and rebuild index.

    ``files`` is a list of (filename, content) pairs.
    """
    ensure_dirs()
    root = custom_dir()
    saved: list[str] = []
    rejected: list[str] = []
    max_bytes = int(getattr(get_settings(), "vbx_max_nuclei_template_bytes", 2 * 1024 * 1024) or 2 * 1024 * 1024)

    for filename, content in files:
        name = Path(filename or "").name
        if not name or ".." in name or "/" in name.replace("\\", "/"):
            rejected.append(filename or "(empty)")
            continue
        lower = name.lower()
        if not (lower.endswith(".yaml") or lower.endswith(".yml")):
            rejected.append(name)
            continue
        if len(content) > max_bytes:
            rejected.append(f"{name}: too large")
            continue
        if not content.strip():
            rejected.append(f"{name}: empty")
            continue
        # Basic sanity: must look like a template
        text = content.decode("utf-8", errors="replace")
        meta = extract_template_meta(text, rel_path=name)
        if not meta:
            rejected.append(f"{name}: missing id")
            continue
        dest = root / name
        dest.write_bytes(content)
        saved.append(name)

    index = build_index(write=True)
    return {
        "saved": saved,
        "rejected": rejected,
        "custom_count": index.get("custom_count", 0),
        "template_count": index.get("template_count", 0),
        "custom_path": str(root),
    }


def start_background_sync(*, force: bool = False, reason: str = "startup") -> bool:
    """Spawn daemon thread for sync. Returns False if already running / auto-sync off."""
    settings = get_settings()
    if reason == "startup" and not settings.nuclei_templates_auto_sync:
        logger.info("nuclei templates auto-sync disabled; skip startup sync")
        return False
    if _sync_running:
        return False

    def _target() -> None:
        logger.info("nuclei templates background sync starting (%s)", reason)
        try:
            stats = run_nuclei_templates_sync(force=force)
            logger.info("nuclei templates background sync done: %s", stats)
        except Exception:  # pragma: no cover
            logger.exception("nuclei templates background sync crashed")

    t = threading.Thread(target=_target, name=f"nuclei-templates-sync-{reason}", daemon=True)
    t.start()
    return True


def resolve_effective_default_templates(admin_value: str | None) -> str:
    """Admin override, else catalog official path."""
    raw = (admin_value or "").strip()
    if raw:
        return raw
    return default_templates_path()
