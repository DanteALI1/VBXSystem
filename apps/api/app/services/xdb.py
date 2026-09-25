"""XDB exploit metadata service — links only, no payloads."""

from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import ExploitRecord, utcnow

_CVE_RE = re.compile(r"^CVE-\d{4}-\d{4,}$", re.I)


def sanitize_url(url: str | None) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw)
    if parsed.scheme.lower() not in {"http", "https"}:
        return ""
    if not parsed.netloc:
        return ""
    # block credentials in URL
    if parsed.username or parsed.password:
        return ""
    return raw


def _parse_date(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    s = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%d.%m.%Y"):
        try:
            dt = datetime.strptime(s.replace("Z", ""), fmt.replace("Z", ""))
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _norm_cve(value: Any) -> str | None:
    if value is None or value == "":
        return None
    s = str(value).strip().upper()
    if not s:
        return None
    if not _CVE_RE.match(s):
        # still store loosely if looks like CVE-
        if s.startswith("CVE-"):
            return s
        return None
    return s


def _row_from_dict(item: dict, *, source: str = "import") -> dict | None:
    xdb_id = str(item.get("xdb_id") or item.get("id") or "").strip()
    if not xdb_id:
        return None
    repo_url = sanitize_url(item.get("repo_url") or item.get("repository") or item.get("url"))
    repo_name = str(item.get("repo_name") or item.get("repository_name") or "").strip()
    if not repo_name and repo_url:
        path = urlparse(repo_url).path.strip("/")
        repo_name = path or urlparse(repo_url).netloc
    author = str(item.get("author") or "").strip()
    return {
        "xdb_id": xdb_id[:64],
        "cve_id": _norm_cve(item.get("cve_id") or item.get("cve")),
        "published_at": _parse_date(item.get("published_at") or item.get("date")),
        "repo_url": repo_url[:1024],
        "repo_name": repo_name[:512],
        "author": author[:255],
        "source": (item.get("source") or source)[:64],
        "raw_meta": json.dumps(
            {k: v for k, v in item.items() if k not in {"raw_meta"}},
            ensure_ascii=False,
            default=str,
        )[:20000],
    }


def upsert_exploit(db: Session, data: dict) -> tuple[ExploitRecord, bool]:
    existing = db.query(ExploitRecord).filter(ExploitRecord.xdb_id == data["xdb_id"]).one_or_none()
    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        existing.updated_at = utcnow()
        return existing, False
    row = ExploitRecord(**data, created_at=utcnow(), updated_at=utcnow())
    db.add(row)
    return row, True


def import_records(db: Session, items: list[dict], *, source: str = "import") -> dict:
    created = updated = skipped = 0
    for item in items:
        if not isinstance(item, dict):
            skipped += 1
            continue
        data = _row_from_dict(item, source=source)
        if not data:
            skipped += 1
            continue
        _, is_new = upsert_exploit(db, data)
        if is_new:
            created += 1
        else:
            updated += 1
    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped, "total": created + updated}


def import_json_content(db: Session, content: str | bytes, *, source: str = "json-import") -> dict:
    if isinstance(content, bytes):
        content = content.decode("utf-8", errors="replace")
    data = json.loads(content)
    if isinstance(data, dict) and "exploits" in data:
        items = data["exploits"]
    elif isinstance(data, list):
        items = data
    else:
        raise ValueError("JSON: ожидается массив объектов или {\"exploits\": [...]}")
    if not isinstance(items, list):
        raise ValueError("JSON: exploits должен быть массивом")
    return import_records(db, items, source=source)


def import_csv_content(db: Session, content: str | bytes, *, source: str = "csv-import") -> dict:
    if isinstance(content, bytes):
        content = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise ValueError("CSV: отсутствует заголовок")
    items = [dict(row) for row in reader]
    return import_records(db, items, source=source)


def list_exploits(
    db: Session,
    *,
    q: str = "",
    cve_id: str | None = None,
    author: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    sort: str = "published",
    order: str = "desc",
    page: int = 1,
    page_size: int = 25,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    query = db.query(ExploitRecord)

    q = (q or "").strip()
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                ExploitRecord.xdb_id.ilike(like),
                ExploitRecord.cve_id.ilike(like),
                ExploitRecord.repo_name.ilike(like),
                ExploitRecord.repo_url.ilike(like),
                ExploitRecord.author.ilike(like),
            )
        )
    if cve_id:
        query = query.filter(ExploitRecord.cve_id.ilike(cve_id.strip()))
    if author:
        query = query.filter(ExploitRecord.author.ilike(f"%{author.strip()}%"))
    df = _parse_date(date_from)
    dt = _parse_date(date_to)
    if df is not None:
        query = query.filter(ExploitRecord.published_at >= df)
    if dt is not None:
        # inclusive day end if date-only
        query = query.filter(ExploitRecord.published_at <= dt)

    sort_col = {
        "published": ExploitRecord.published_at,
        "xdb_id": ExploitRecord.xdb_id,
        "cve_id": ExploitRecord.cve_id,
        "repo": ExploitRecord.repo_name,
        "author": ExploitRecord.author,
    }.get(sort, ExploitRecord.published_at)

    if order.lower() == "asc":
        query = query.order_by(sort_col.asc().nullslast(), ExploitRecord.id.asc())
    else:
        query = query.order_by(sort_col.desc().nullslast(), ExploitRecord.id.desc())

    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": [_to_out(r) for r in rows],
    }


def exploits_for_cve(db: Session, cve_id: str) -> list[dict]:
    rows = (
        db.query(ExploitRecord)
        .filter(ExploitRecord.cve_id == cve_id.upper())
        .order_by(ExploitRecord.published_at.desc().nullslast())
        .limit(50)
        .all()
    )
    return [_to_out(r) for r in rows]


def _to_out(r: ExploitRecord) -> dict:
    return {
        "xdb_id": r.xdb_id,
        "cve_id": r.cve_id,
        "published_at": r.published_at.isoformat() if r.published_at else None,
        "repo_url": r.repo_url,
        "repo_name": r.repo_name,
        "author": r.author,
        "source": r.source,
    }


SAMPLE_EXPLOITS = [
    {
        "xdb_id": "XDB-2024-0001",
        "cve_id": "CVE-2024-0001",
        "date": "2024-02-10",
        "repo_url": "https://github.com/example/poc-examplesoft-rce",
        "repo_name": "example/poc-examplesoft-rce",
        "author": "researcher1",
    },
    {
        "xdb_id": "XDB-2023-44487",
        "cve_id": "CVE-2023-44487",
        "date": "2023-10-12",
        "repo_url": "https://github.com/example/http2-rapid-reset-notes",
        "repo_name": "example/http2-rapid-reset-notes",
        "author": "netsec-lab",
    },
    {
        "xdb_id": "XDB-2024-0002",
        "cve_id": "CVE-2024-0002",
        "date": "2024-03-01",
        "repo_url": "https://gitlab.com/example/localagent-privesc",
        "repo_name": "example/localagent-privesc",
        "author": "redteam-demo",
    },
    {
        "xdb_id": "XDB-2024-0099",
        "cve_id": None,
        "date": "2024-04-15",
        "repo_url": "https://github.com/example/generic-scanner-notes",
        "repo_name": "example/generic-scanner-notes",
        "author": "security-ops",
    },
]


def seed_sample_exploits(db: Session) -> dict:
    return import_records(db, SAMPLE_EXPLOITS, source="sample")


def fetch_feed_url(db: Session, url: str, *, max_bytes: int = 8 * 1024 * 1024) -> dict:
    """Simple opt-in stub: GET https URL and import JSON list or CSV of exploit metadata."""
    clean = sanitize_url(url)
    if not clean:
        raise ValueError("URL должен быть http(s) без credentials")
    import urllib.request

    req = urllib.request.Request(
        clean,
        headers={"User-Agent": "VBXSystem/0.9 (xdb-connector-stub; metadata-only)"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 — URL sanitized to http(s)
        raw = resp.read(max_bytes + 1)
        content_type = (resp.headers.get("Content-Type") or "").lower()
    if len(raw) > max_bytes:
        raise ValueError(f"Ответ превышает лимит {max_bytes // (1024 * 1024)} МБ")
    if not raw:
        raise ValueError("Пустой ответ ленты")
    text_head = raw[:64].lstrip()
    if "json" in content_type or text_head.startswith(b"[") or text_head.startswith(b"{"):
        return import_json_content(db, raw, source="url-fetch")
    return import_csv_content(db, raw, source="url-fetch")
