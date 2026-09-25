"""Execute CVEQL AST via SQLAlchemy filters — never interpolate into raw SQL."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, exists, func, not_, or_
from sqlalchemy.orm import Session, Query

from app.models import CveBduLink, CveRecord, EpssScore
from app.services.affected_extract import extract_affected
from app.services.cveql_parser import (
    ALLOWED_FIELDS,
    And,
    Cmp,
    CveqlParseError,
    Or,
    parse_cveql,
)


def _latest_epss_subq(db: Session):
    return (
        db.query(EpssScore.cve_id, func.max(EpssScore.id).label("max_id"))
        .group_by(EpssScore.cve_id)
        .subquery()
    )


def _cmp_to_clause(db: Session, node: Cmp, epss_join_needed: list):
    field = node.field
    op = node.op
    val = node.value

    def apply_op(col, value):
        if op == "=":
            return col == value
        if op == "!=":
            return col != value
        if op == ">":
            return col > value
        if op == ">=":
            return col >= value
        if op == "<":
            return col < value
        if op == "<=":
            return col <= value
        if op == "~":
            return col.ilike(f"%{value}%")
        if op == "in":
            if not isinstance(value, list):
                raise CveqlParseError("Оператор in требует список значений")
            return col.in_(value)
        raise CveqlParseError(f"Оператор {op} не поддерживается для поля")

    if field == "id":
        return apply_op(CveRecord.id, str(val) if val is not None else val)
    if field == "title":
        if op not in ("=", "!=", "~"):
            raise CveqlParseError("Для title используйте = != ~")
        return apply_op(CveRecord.title, str(val))
    if field == "severity":
        if op == "~":
            return CveRecord.cvss_severity.ilike(f"%{val}%")
        if op in ("=", "!="):
            clause = func.upper(CveRecord.cvss_severity) == str(val).upper()
            return clause if op == "=" else not_(clause)
        if op == "in":
            vals = [str(v).upper() for v in val]
            return func.upper(CveRecord.cvss_severity).in_(vals)
        raise CveqlParseError("Для severity используйте = != ~ in")
    if field == "cvss_score":
        return apply_op(CveRecord.cvss_score, float(val) if not isinstance(val, list) else val)
    if field == "published":
        if isinstance(val, str):
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            except ValueError:
                raise CveqlParseError("published: ожидается ISO-дата, например 2024-01-01") from None
            return apply_op(CveRecord.published_at, dt)
        return apply_op(CveRecord.published_at, val)
    if field == "modified":
        if isinstance(val, str):
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            except ValueError:
                raise CveqlParseError("modified: ожидается ISO-дата") from None
            return apply_op(CveRecord.modified_at, dt)
        return apply_op(CveRecord.modified_at, val)
    if field == "description":
        if op not in ("=", "!=", "~"):
            raise CveqlParseError("Для description используйте = != ~")
        return apply_op(CveRecord.description, str(val))
    if field == "status":
        if op not in ("=", "!=", "~", "in"):
            raise CveqlParseError("Для status используйте = != ~ in")
        return apply_op(CveRecord.status, str(val) if op != "in" else val)
    if field == "source":
        if op not in ("=", "!=", "~", "in"):
            raise CveqlParseError("Для source используйте = != ~ in")
        return apply_op(CveRecord.source, str(val) if op != "in" else val)
    if field == "is_cisa_kev":
        if not isinstance(val, bool) and op != "in":
            raise CveqlParseError("is_cisa_kev: ожидается true/false")
        return apply_op(CveRecord.is_cisa_kev, val)
    if field == "is_remote":
        if not isinstance(val, bool) and op != "in":
            raise CveqlParseError("is_remote: ожидается true/false")
        return apply_op(CveRecord.is_remote, val)
    if field == "has_bdu":
        if not isinstance(val, bool):
            raise CveqlParseError("has_bdu: ожидается true/false")
        link_exists = exists().where(CveBduLink.cve_id == CveRecord.id)
        return link_exists if val else ~link_exists
    if field == "products.vendor.name":
        if op not in ("=", "!=", "~", "in"):
            raise CveqlParseError("Для products.vendor.name используйте = != ~ in")
        # products stored as JSON text — ilike search
        return apply_op(CveRecord.products, str(val) if op != "in" else val)
    if field in ("affected.app", "affected.os", "affected.version"):
        if op not in ("=", "~", "in"):
            raise CveqlParseError(f"Для {field} используйте = ~ in")
        needle = str(val)
        if op == "in":
            if not isinstance(val, list):
                raise CveqlParseError("Оператор in требует список")
            clauses = []
            for item in val:
                n = f"%{item}%"
                clauses.append(
                    or_(CveRecord.products.ilike(n), CveRecord.description.ilike(n), CveRecord.title.ilike(n))
                )
            return or_(*clauses) if clauses else CveRecord.id == "__none__"
        n = f"%{needle}%" if op == "~" else f"%{needle}%"
        # equality treated as case-insensitive contains (extracted labels vary)
        return or_(
            CveRecord.products.ilike(n),
            CveRecord.description.ilike(n),
            CveRecord.title.ilike(n),
        )
    if field == "epss_scores.score":
        epss_join_needed.append(True)
        # correlated: exists latest epss matching score
        latest = (
            db.query(EpssScore.id)
            .filter(EpssScore.cve_id == CveRecord.id)
            .order_by(EpssScore.id.desc())
            .limit(1)
            .correlate(CveRecord)
            .scalar_subquery()
        )
        score_col = db.query(EpssScore.score).filter(EpssScore.id == latest).correlate(CveRecord).scalar_subquery()
        def _epss_val(v):
            x = float(v)
            # Convenience: 50 → 0.50 when users type percent (column shows %)
            if x > 1.0:
                x = x / 100.0
            return x

        if isinstance(val, list):
            return apply_op(score_col, [_epss_val(v) for v in val])
        return apply_op(score_col, _epss_val(val))
    if field == "bdu.id":
        if op not in ("=", "!=", "~", "in"):
            raise CveqlParseError("Для bdu.id используйте = != ~ in")
        if op == "=":
            return exists().where(and_(CveBduLink.cve_id == CveRecord.id, CveBduLink.bdu_id == str(val)))
        if op == "!=":
            return ~exists().where(and_(CveBduLink.cve_id == CveRecord.id, CveBduLink.bdu_id == str(val)))
        if op == "~":
            return exists().where(
                and_(CveBduLink.cve_id == CveRecord.id, CveBduLink.bdu_id.ilike(f"%{val}%"))
            )
        if op == "in":
            return exists().where(and_(CveBduLink.cve_id == CveRecord.id, CveBduLink.bdu_id.in_([str(v) for v in val])))
    raise CveqlParseError(f"Поле «{field}» не поддерживается")


def _ast_to_clause(db: Session, node, epss_flag: list):
    if isinstance(node, And):
        return and_(_ast_to_clause(db, node.left, epss_flag), _ast_to_clause(db, node.right, epss_flag))
    if isinstance(node, Or):
        return or_(_ast_to_clause(db, node.left, epss_flag), _ast_to_clause(db, node.right, epss_flag))
    if isinstance(node, Cmp):
        return _cmp_to_clause(db, node, epss_flag)
    raise CveqlParseError("Некорректное AST-дерево")


def execute_cveql(db: Session, query: str, *, limit: int = 50, offset: int = 0) -> dict:
    # Export endpoints may request up to 5000; interactive UI stays ≤200 via route schema.
    limit = min(max(1, limit), 5000)
    offset = max(0, offset)
    ast = parse_cveql(query)
    epss_flag: list = []
    clause = _ast_to_clause(db, ast, epss_flag)
    q: Query = db.query(CveRecord).filter(clause)
    total = q.count()
    rows = (
        q.order_by(
            # Prefer scored CVEs so the default page is not a wall of unscored drafts
            CveRecord.cvss_score.is_(None).asc(),
            CveRecord.published_at.desc().nullslast(),
            CveRecord.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    # batch epss / bdu flags
    ids = [r.id for r in rows]
    bdu_map: dict[str, list[str]] = {}
    epss_map: dict[str, tuple[float | None, float | None]] = {}
    if ids:
        for link in db.query(CveBduLink).filter(CveBduLink.cve_id.in_(ids)).all():
            bdu_map.setdefault(link.cve_id, []).append(link.bdu_id)
        for e in db.query(EpssScore).filter(EpssScore.cve_id.in_(ids)).order_by(EpssScore.id.desc()).all():
            if e.cve_id not in epss_map:
                epss_map[e.cve_id] = (e.score, e.percentile)

    def _json_list(raw: str | None, *, limit: int = 8) -> list[str]:
        if not raw:
            return []
        try:
            import json

            data = json.loads(raw)
            if isinstance(data, list):
                out: list[str] = []
                for x in data[:limit]:
                    if isinstance(x, str):
                        out.append(x)
                    elif isinstance(x, dict):
                        out.append(str(x.get("cpe") or x.get("criteria") or x))
                return out
        except Exception:
            return []
        return []

    results = []
    for r in rows:
        score, pct = epss_map.get(r.id, (None, None))
        bdu_ids = bdu_map.get(r.id, [])
        affected = extract_affected(products=r.products, description=r.description or "")
        results.append(
            {
                "id": r.id,
                "title": (r.title or "")[:160],
                "severity": r.cvss_severity or "",
                "cvss_score": r.cvss_score,
                "cvss_version": r.cvss_version or "",
                "cvss_vector": r.cvss_vector or "",
                "published": r.published_at.isoformat() if r.published_at else None,
                "modified": r.modified_at.isoformat() if r.modified_at else None,
                "description": (r.description or "")[:240],
                "status": r.status or "",
                "source": r.source or "",
                "is_cisa_kev": bool(r.is_cisa_kev),
                "has_bdu": bool(bdu_ids),
                "is_remote": r.is_remote,
                "cwes": _json_list(r.cwes, limit=6),
                "products": _json_list(r.products, limit=4),
                "bdu_ids": bdu_ids[:6],
                "epss_score": score,
                "epss_percentile": pct,
                "affected_app": affected["app"],
                "affected_os": affected["os"],
                "affected_version": affected["version"],
                "affected_apps": affected["apps"],
                "affected_oses": affected["oses"],
                "affected_versions": affected["versions"],
                "href": f"/vuln/{r.id}",
            }
        )
    return {
        "query": query,
        "total": total,
        "limit": limit,
        "offset": offset,
        "results": results,
        "fields": sorted(ALLOWED_FIELDS.keys()),
    }


CVEQL_EXAMPLES = [
    {
        "title": "Критические CVE",
        "query": 'severity = "CRITICAL"',
    },
    {
        "title": "Высокий CVSS и KEV",
        "query": "cvss_score >= 7.0 and is_cisa_kev = true",
    },
    {
        "title": "Поиск по тексту",
        "query": 'description ~ "HTTP/2"',
    },
    {
        "title": "Есть запись БДУ",
        "query": "has_bdu = true",
    },
    {
        "title": "Высокий EPSS",
        "query": "epss_scores.score > 0.5",
    },
    {
        "title": "Список severity",
        "query": 'severity in ("CRITICAL", "HIGH")',
    },
]
