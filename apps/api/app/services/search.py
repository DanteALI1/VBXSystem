"""Vulnerability search — SQL pagination; Postgres uses pg_trgm when available."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import BduRecord, CisaKev, CveBduLink, CveRecord, EpssScore, LocalVuln
from app.services.epss_service import get_epss_history
from app.services.local_vulns import local_to_search_hit
from app.services.affected_extract import extract_affected
from app.services.xdb import exploits_for_cve


def _is_postgres(db: Session) -> bool:
    return db.get_bind().dialect.name == "postgresql"


def _text_match(db: Session, *columns, q: str):
    """ILIKE always; on Postgres also `%` (pg_trgm) so GIN indexes can help."""
    like = f"%{q}%"
    clauses = [col.ilike(like) for col in columns]
    if _is_postgres(db) and len(q) >= 3:
        for col in columns:
            # `%` operator uses gin_trgm_ops; similarity() alone often cannot.
            clauses.append(col.op("%")(q))
    return or_(*clauses)


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
    return mapping.get(preset)


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


def _cve_to_hit(c: CveRecord, *, has_bdu: bool, epss: dict | None) -> dict:
    return {
        "kind": "cve",
        "id": c.id,
        "title": c.title or c.id,
        "description": (c.description or "")[:280],
        "severity": c.cvss_severity or "",
        "cvss_score": c.cvss_score,
        "published_at": c.published_at.isoformat() if c.published_at else None,
        "is_cisa_kev": bool(c.is_cisa_kev),
        "has_bdu": has_bdu,
        "epss": epss,
        "href": f"/vuln/{c.id}",
    }


def _bdu_to_hit(b: BduRecord) -> dict:
    return {
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


def _enrich_cve_hits(db: Session, rows: list[CveRecord]) -> list[dict]:
    if not rows:
        return []
    cve_ids = [c.id for c in rows]
    bdu_link_set = {
        row.cve_id
        for row in db.query(CveBduLink.cve_id).filter(CveBduLink.cve_id.in_(cve_ids)).all()
    }
    epss_map: dict[str, dict] = {}
    for e in (
        db.query(EpssScore)
        .filter(EpssScore.cve_id.in_(cve_ids))
        .order_by(EpssScore.id.desc())
        .all()
    ):
        if e.cve_id not in epss_map:
            epss_map[e.cve_id] = {"score": e.score, "percentile": e.percentile}
    return [
        _cve_to_hit(c, has_bdu=c.id in bdu_link_set, epss=epss_map.get(c.id)) for c in rows
    ]


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
    """Search with accurate totals and SQL LIMIT/OFFSET (CVE → BDU → Local)."""
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    q = (q or "").strip()

    date_from = _date_preset_start(date_preset)
    date_to = _date_preset_end(date_preset)

    cve_query = db.query(CveRecord)
    if q:
        cve_query = cve_query.filter(
            _text_match(
                db,
                CveRecord.id,
                CveRecord.title,
                CveRecord.description,
                CveRecord.products,
                q=q,
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

    # Build ordered CVE query for fetch (count used separate un-ordered clones)
    def _order_cve(q):
        if sort == "cvss":
            return q.order_by(CveRecord.cvss_score.desc().nullslast(), CveRecord.id.desc())
        if sort == "id":
            return q.order_by(CveRecord.id.asc())
        # published + epss: KEV-first, newest; epss score applied only among loaded page via SQL join optional
        if sort == "epss":
            return q.order_by(CveRecord.published_at.desc().nullslast(), CveRecord.id.desc())
        return q.order_by(
            CveRecord.is_cisa_kev.desc(),
            CveRecord.published_at.desc().nullslast(),
            CveRecord.id.desc(),
        )

    cve_base = cve_query
    cve_total = cve_base.count()
    cve_query = _order_cve(cve_base)

    include_bdu = not kev_only
    include_local = not kev_only and not has_bdu

    bdu_query = None
    bdu_total = 0
    if include_bdu:
        bdu_base = db.query(BduRecord).filter(BduRecord.is_standalone.is_(True))
        if q:
            bdu_base = bdu_base.filter(
                _text_match(
                    db,
                    BduRecord.id,
                    BduRecord.name,
                    BduRecord.description,
                    BduRecord.vendors,
                    BduRecord.software_names,
                    q=q,
                )
            )
        if severity:
            bdu_base = bdu_base.filter(BduRecord.severity.ilike(f"%{severity}%"))
        bdu_total = bdu_base.count()
        bdu_query = bdu_base.order_by(BduRecord.updated_at.desc(), BduRecord.id.desc())

    local_query = None
    local_total = 0
    if include_local:
        local_base = db.query(LocalVuln)
        if q:
            local_base = local_base.filter(
                _text_match(
                    db,
                    LocalVuln.id,
                    LocalVuln.title,
                    LocalVuln.description,
                    LocalVuln.vendor,
                    LocalVuln.product_name,
                    q=q,
                )
            )
        if severity:
            local_base = local_base.filter(func.upper(LocalVuln.severity) == severity.upper())
        local_total = local_base.count()
        local_query = local_base.order_by(LocalVuln.created_at.desc(), LocalVuln.id.desc())

    total = cve_total + bdu_total + local_total

    # Sequential window: CVE block, then BDU, then Local (stable contract)
    offset = (page - 1) * page_size
    need = page_size
    results: list[dict] = []

    if need > 0 and offset < cve_total:
        take = min(need, cve_total - offset)
        rows = cve_query.offset(offset).limit(take).all()
        hits = _enrich_cve_hits(db, rows)
        if sort == "epss":
            hits.sort(
                key=lambda x: (
                    (x.get("epss") or {}).get("score") is not None,
                    (x.get("epss") or {}).get("score") or 0,
                ),
                reverse=True,
            )
        results.extend(hits)
        need -= len(rows)
        offset = 0
    else:
        offset = max(0, offset - cve_total)

    if need > 0 and bdu_query is not None and offset < bdu_total:
        take = min(need, bdu_total - offset)
        brows = bdu_query.offset(offset).limit(take).all()
        results.extend(_bdu_to_hit(b) for b in brows)
        need -= len(brows)
        offset = 0
    elif bdu_query is not None:
        offset = max(0, offset - bdu_total)

    if need > 0 and local_query is not None and offset < local_total:
        take = min(need, local_total - offset)
        lrows = local_query.offset(offset).limit(take).all()
        results.extend(local_to_search_hit(r) for r in lrows)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": results,
    }


def get_cve_detail(db: Session, cve_id: str) -> dict | None:
    cve = db.get(CveRecord, cve_id.upper())
    if not cve:
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
        "epss_history": get_epss_history(db, cve.id, limit=90),
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
        "exploits": exploits_for_cve(db, cve.id),
        "affected": extract_affected(
            products=cve.products,
            description=cve.description or "",
            kev_product=(kev.product if kev else "") or "",
            kev_vendor=(kev.vendor_project if kev else "") or "",
        ),
    }


def get_bdu_detail(db: Session, bdu_id: str) -> dict | None:
    bid = bdu_id if bdu_id.upper().startswith("BDU:") else bdu_id
    if not bid.upper().startswith("BDU"):
        bid = f"BDU:{bid}"
    bid = bid.replace("BDU-", "BDU:")
    b = db.get(BduRecord, bid) or db.get(BduRecord, bdu_id)
    if not b:
        b = db.query(BduRecord).filter(func.upper(BduRecord.id) == bid.upper()).one_or_none()
    if not b:
        return None
    linked = _parse_json_list(b.linked_cve_ids)
    refs = _parse_json_list(getattr(b, "references_json", None) or "[]")
    try:
        extra = json.loads(getattr(b, "extra_json", None) or "{}")
        if not isinstance(extra, dict):
            extra = {}
    except json.JSONDecodeError:
        extra = {}
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
        "software_versions": getattr(b, "software_versions", "") or "",
        "software_type": getattr(b, "software_type", "") or "",
        "os_platform": getattr(b, "os_platform", "") or "",
        "vuln_class": getattr(b, "vuln_class", "") or "",
        "cvss2_vector": getattr(b, "cvss2_vector", "") or "",
        "cvss3_vector": getattr(b, "cvss3_vector", "") or "",
        "cvss4_vector": getattr(b, "cvss4_vector", "") or "",
        "exploit_status": getattr(b, "exploit_status", "") or "",
        "fix_info": getattr(b, "fix_info", "") or "",
        "exploit_method": getattr(b, "exploit_method", "") or "",
        "fix_method": getattr(b, "fix_method", "") or "",
        "references": refs if isinstance(refs, list) else [],
        "published_date": getattr(b, "published_date", "") or "",
        "updated_date": getattr(b, "updated_date", "") or "",
        "cwe_description": getattr(b, "cwe_description", "") or "",
        "extra": extra,
        "cwes": b.cwes,
        "linked_cve_ids": linked,
        "identify_date": b.identify_date,
        "is_standalone": b.is_standalone,
    }
