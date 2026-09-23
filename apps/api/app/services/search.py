from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import BduRecord, CisaKev, CveBduLink, CveRecord, EpssScore


def _parse_json_list(raw: str | None) -> list:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _date_preset_start(preset: str | None) -> datetime | None:
    if not preset:
        return None
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    mapping = {
        "today": today,
        "yesterday": today - timedelta(days=1),
        "7d": today - timedelta(days=7),
        "30d": today - timedelta(days=30),
        "this_week": today - timedelta(days=today.weekday()),
        "last_week": today - timedelta(days=today.weekday() + 7),
    }
    start = mapping.get(preset)
    if preset == "yesterday":
        return start
    if preset == "last_week":
        return start
    return start


def _date_preset_end(preset: str | None) -> datetime | None:
    if preset != "yesterday" and preset != "last_week":
        return None
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if preset == "yesterday":
        return today
    if preset == "last_week":
        return today - timedelta(days=today.weekday())
    return None


def _ts(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def search_vulnerabilities(
    db: Session,
    *,
    q: str = "",
    severity: str | None = None,
    kev_only: bool = False,
    has_bdu: bool = False,
    date_preset: str | None = None,
    sort: str = "published",
    page: int = 1,
    page_size: int = 20,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    q = (q or "").strip()

    date_from = _date_preset_start(date_preset)
    date_to = _date_preset_end(date_preset)

    cve_query = db.query(CveRecord)
    if q:
        like = f"%{q}%"
        cve_query = cve_query.filter(
            or_(
                CveRecord.id.ilike(like),
                CveRecord.title.ilike(like),
                CveRecord.description.ilike(like),
                CveRecord.products.ilike(like),
            )
        )
    if severity:
        cve_query = cve_query.filter(func.upper(CveRecord.cvss_severity) == severity.upper())
    if kev_only:
        cve_query = cve_query.filter(CveRecord.is_cisa_kev.is_(True))
    if has_bdu:
        linked_ids = db.query(CveBduLink.cve_id).distinct().subquery()
        cve_query = cve_query.filter(CveRecord.id.in_(linked_ids))
    if date_from is not None:
        cve_query = cve_query.filter(CveRecord.published_at >= date_from)
    if date_to is not None:
        cve_query = cve_query.filter(CveRecord.published_at < date_to)

    if sort == "cvss":
        cve_query = cve_query.order_by(CveRecord.cvss_score.desc().nullslast(), CveRecord.id.desc())
    elif sort == "epss":
        # Order applied after merge using epss_map; keep published as DB default
        cve_query = cve_query.order_by(CveRecord.published_at.desc().nullslast(), CveRecord.id.desc())
    else:
        cve_query = cve_query.order_by(CveRecord.published_at.desc().nullslast(), CveRecord.id.desc())

    # BDU standalone search (skip when kev_only — BDU alone isn't KEV)
    bdu_items: list[dict] = []
    if not kev_only:
        bdu_query = db.query(BduRecord).filter(BduRecord.is_standalone.is_(True))
        if q:
            like = f"%{q}%"
            bdu_query = bdu_query.filter(
                or_(
                    BduRecord.id.ilike(like),
                    BduRecord.name.ilike(like),
                    BduRecord.description.ilike(like),
                    BduRecord.vendors.ilike(like),
                    BduRecord.software_names.ilike(like),
                )
            )
        if severity:
            bdu_query = bdu_query.filter(BduRecord.severity.ilike(f"%{severity}%"))
        bdu_rows = bdu_query.order_by(BduRecord.updated_at.desc()).limit(200).all()
        for b in bdu_rows:
            bdu_items.append(
                {
                    "kind": "bdu",
                    "id": b.id,
                    "title": b.name or b.id,
                    "description": (b.description or "")[:280],
                    "severity": b.severity or "",
                    "published_at": b.identify_date or None,
                    "is_cisa_kev": False,
                    "has_bdu": True,
                    "epss": None,
                    "href": f"/bdu/{b.id}",
                }
            )

    # Collect CVE page with badges
    # For mixed list: fetch enough CVEs then merge with BDU and paginate in Python for W3 simplicity
    cve_rows = cve_query.limit(500).all()
    cve_ids = [c.id for c in cve_rows]
    bdu_link_set = set()
    if cve_ids:
        bdu_link_set = {
            row.cve_id
            for row in db.query(CveBduLink.cve_id).filter(CveBduLink.cve_id.in_(cve_ids)).all()
        }
    epss_map = {}
    if cve_ids:
        for e in (
            db.query(EpssScore)
            .filter(EpssScore.cve_id.in_(cve_ids))
            .order_by(EpssScore.id.desc())
            .all()
        ):
            if e.cve_id not in epss_map:
                epss_map[e.cve_id] = {"score": e.score, "percentile": e.percentile}

    cve_items = []
    for c in cve_rows:
        cve_items.append(
            {
                "kind": "cve",
                "id": c.id,
                "title": c.title or c.id,
                "description": (c.description or "")[:280],
                "severity": c.cvss_severity or "",
                "cvss_score": c.cvss_score,
                "published_at": c.published_at.isoformat() if c.published_at else None,
                "is_cisa_kev": bool(c.is_cisa_kev),
                "has_bdu": c.id in bdu_link_set,
                "epss": epss_map.get(c.id),
                "href": f"/vuln/{c.id}",
            }
        )

    # Merge: KEV CVEs first within published ordering already applied; insert BDU after CVEs matching q
    if has_bdu:
        # already filtered CVEs; still include standalone BDU
        mixed = cve_items + bdu_items
    elif severity or date_preset:
        mixed = cve_items + ([] if severity or date_preset else bdu_items)
        # if severity/date filters are CVE-centric, still allow BDU when q matches and no severity conflict
        if q and not kev_only:
            mixed = cve_items + bdu_items
    else:
        mixed = cve_items + bdu_items

    if sort == "cvss":
        mixed.sort(key=lambda x: (x.get("cvss_score") is not None, x.get("cvss_score") or 0), reverse=True)
    elif sort == "epss":
        mixed.sort(
            key=lambda x: (
                (x.get("epss") or {}).get("score") is not None,
                (x.get("epss") or {}).get("score") or 0,
            ),
            reverse=True,
        )
    elif sort == "id":
        mixed.sort(key=lambda x: x["id"])
    else:
        # published desc; KEV rows bubble up for visual priority
        mixed.sort(
            key=lambda x: (0 if x.get("is_cisa_kev") else 1, -_ts(x.get("published_at"))),
        )

    total = len(mixed)
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": mixed[start:end],
    }


def get_cve_detail(db: Session, cve_id: str) -> dict | None:
    cve = db.get(CveRecord, cve_id.upper())
    if not cve:
        # try exact
        cve = db.get(CveRecord, cve_id)
    if not cve:
        return None

    kev = db.get(CisaKev, cve.id)
    epss = (
        db.query(EpssScore)
        .filter(EpssScore.cve_id == cve.id)
        .order_by(EpssScore.id.desc())
        .first()
    )
    links = db.query(CveBduLink).filter_by(cve_id=cve.id).all()
    bdu_ids = [l.bdu_id for l in links]
    bdus = db.query(BduRecord).filter(BduRecord.id.in_(bdu_ids)).all() if bdu_ids else []

    return {
        "id": cve.id,
        "title": cve.title or cve.id,
        "description": cve.description or "",
        "status": cve.status or "",
        "source": cve.source or "",
        "published_at": cve.published_at.isoformat() if cve.published_at else None,
        "modified_at": cve.modified_at.isoformat() if cve.modified_at else None,
        "cvss": {
            "version": cve.cvss_version,
            "score": cve.cvss_score,
            "severity": cve.cvss_severity,
            "vector": cve.cvss_vector,
            "is_remote": cve.is_remote,
        },
        "is_cisa_kev": cve.is_cisa_kev,
        "cwes": _parse_json_list(cve.cwes),
        "products": _parse_json_list(cve.products),
        "references": _parse_json_list(cve.references_json),
        "kev": None
        if not kev
        else {
            "vendor_project": kev.vendor_project,
            "product": kev.product,
            "vulnerability_name": kev.vulnerability_name,
            "date_added": kev.date_added,
            "due_date": kev.due_date,
            "required_action": kev.required_action,
            "known_ransomware": kev.known_ransomware,
            "notes": kev.notes,
        },
        "epss": None
        if not epss
        else {"score": epss.score, "percentile": epss.percentile, "scored_at": epss.scored_at},
        "bdu": [
            {
                "id": b.id,
                "name": b.name,
                "description": b.description,
                "severity": b.severity,
                "status": b.status,
                "solution": b.solution,
                "vendors": b.vendors,
                "software_names": b.software_names,
                "identify_date": b.identify_date,
            }
            for b in bdus
        ],
    }


def get_bdu_detail(db: Session, bdu_id: str) -> dict | None:
    bid = bdu_id if bdu_id.upper().startswith("BDU:") else bdu_id
    # normalize
    if not bid.upper().startswith("BDU"):
        bid = f"BDU:{bid}"
    bid = bid.replace("BDU-", "BDU:")
    b = db.get(BduRecord, bid) or db.get(BduRecord, bdu_id)
    if not b:
        # case-insensitive fallback
        b = db.query(BduRecord).filter(func.upper(BduRecord.id) == bid.upper()).one_or_none()
    if not b:
        return None
    linked = _parse_json_list(b.linked_cve_ids)
    return {
        "id": b.id,
        "name": b.name,
        "description": b.description,
        "severity": b.severity,
        "severity_level": b.severity_level,
        "status": b.status,
        "solution": b.solution,
        "vendors": b.vendors,
        "software_names": b.software_names,
        "cwes": b.cwes,
        "linked_cve_ids": linked,
        "identify_date": b.identify_date,
        "is_standalone": b.is_standalone,
    }
