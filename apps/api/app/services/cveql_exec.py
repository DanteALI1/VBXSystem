"""Execute CVEQL AST via SQLAlchemy filters — never interpolate into raw SQL."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, exists, func, not_, or_
from sqlalchemy.orm import Session, Query

from app.models import CveBduLink, CveRecord, EpssScore
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
    if field == "description":
        if op not in ("=", "!=", "~"):
            raise CveqlParseError("Для description используйте = != ~")
        return apply_op(CveRecord.description, str(val))
    if field == "is_cisa_kev":
        if not isinstance(val, bool) and op != "in":
            raise CveqlParseError("is_cisa_kev: ожидается true/false")
        return apply_op(CveRecord.is_cisa_kev, val)
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
        return apply_op(score_col, float(val) if not isinstance(val, list) else val)
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
    limit = min(max(1, limit), 200)
    offset = max(0, offset)
    ast = parse_cveql(query)
    epss_flag: list = []
    clause = _ast_to_clause(db, ast, epss_flag)
    q: Query = db.query(CveRecord).filter(clause)
    total = q.count()
    rows = q.order_by(CveRecord.published_at.desc().nullslast(), CveRecord.id.desc()).offset(offset).limit(limit).all()

    # batch epss / bdu flags
    ids = [r.id for r in rows]
    bdu_set = set()
    epss_map: dict[str, float] = {}
    if ids:
        bdu_set = {x.cve_id for x in db.query(CveBduLink.cve_id).filter(CveBduLink.cve_id.in_(ids)).all()}
        for e in db.query(EpssScore).filter(EpssScore.cve_id.in_(ids)).order_by(EpssScore.id.desc()).all():
            if e.cve_id not in epss_map:
                epss_map[e.cve_id] = e.score

    results = [
        {
            "id": r.id,
            "severity": r.cvss_severity or "",
            "cvss_score": r.cvss_score,
            "published": r.published_at.isoformat() if r.published_at else None,
            "description": (r.description or "")[:240],
            "is_cisa_kev": bool(r.is_cisa_kev),
            "has_bdu": r.id in bdu_set,
            "epss_score": epss_map.get(r.id),
            "href": f"/vuln/{r.id}",
        }
        for r in rows
    ]
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
