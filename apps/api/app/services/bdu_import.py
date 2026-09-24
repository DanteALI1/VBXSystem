from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models import BduRecord, CveBduLink, CveRecord, utcnow
from app.services.bdu_parser import ParsedBdu, parse_bdu_file, parse_bdu_xml, parsed_to_standalone


def _ensure_cve_stub(db: Session, cve_id: str, description: str, seen_stubs: set[str]) -> None:
    if cve_id in seen_stubs:
        return
    if db.get(CveRecord, cve_id) is not None:
        seen_stubs.add(cve_id)
        return
    db.add(
        CveRecord(
            id=cve_id,
            title=f"{cve_id} (ожидает синхронизации NVD)",
            description=description or "",
            status="Received",
            source="bdu-link",
            cvss_version="",
            cvss_severity="",
            cvss_vector="",
            is_remote=False,
            is_cisa_kev=False,
            cwes="[]",
            products="[]",
            references_json="[]",
            raw_json="{}",
        )
    )
    seen_stubs.add(cve_id)


def upsert_bdu_records(db: Session, records: list[ParsedBdu]) -> dict:
    created = 0
    updated = 0
    linked = 0
    standalone = 0
    errors: list[str] = []
    seen_stubs: set[str] = set()

    for parsed in records:
        try:
            is_standalone = parsed_to_standalone(parsed)
            existing = db.get(BduRecord, parsed.bdu_id)
            payload = dict(
                name=parsed.name or "",
                description=parsed.description or "",
                severity=parsed.severity or "",
                severity_level=parsed.severity_level,
                status=parsed.status or "",
                solution=parsed.solution or "",
                vendors=parsed.vendors or "",
                software_names=parsed.software_names or "",
                cwes=parsed.cwes or "",
                linked_cve_ids=json.dumps(parsed.linked_cve_ids),
                identify_date=parsed.identify_date or "",
                is_standalone=is_standalone,
                raw_xml=parsed.raw_xml or "",
                software_versions=getattr(parsed, "software_versions", "") or "",
                software_type=getattr(parsed, "software_type", "") or "",
                os_platform=getattr(parsed, "os_platform", "") or "",
                vuln_class=getattr(parsed, "vuln_class", "") or "",
                cvss2_vector=getattr(parsed, "cvss2_vector", "") or "",
                cvss3_vector=getattr(parsed, "cvss3_vector", "") or "",
                cvss4_vector=getattr(parsed, "cvss4_vector", "") or "",
                exploit_status=getattr(parsed, "exploit_status", "") or "",
                fix_info=getattr(parsed, "fix_info", "") or "",
                exploit_method=getattr(parsed, "exploit_method", "") or "",
                fix_method=getattr(parsed, "fix_method", "") or "",
                references_json=json.dumps(getattr(parsed, "references", None) or [], ensure_ascii=False),
                published_date=getattr(parsed, "published_date", "") or "",
                updated_date=getattr(parsed, "updated_date", "") or "",
                cwe_description=getattr(parsed, "cwe_description", "") or "",
                extra_json=json.dumps(getattr(parsed, "extra", None) or {}, ensure_ascii=False, default=str),
                updated_at=utcnow(),
            )
            if existing:
                for k, v in payload.items():
                    setattr(existing, k, v)
                updated += 1
                row = existing
            else:
                row = BduRecord(id=parsed.bdu_id, created_at=utcnow(), **payload)
                db.add(row)
                created += 1

            # Persist BDU row before link FK touches it
            db.flush()

            db.query(CveBduLink).filter_by(bdu_id=parsed.bdu_id).delete()
            if parsed.linked_cve_ids:
                for cve_id in parsed.linked_cve_ids:
                    _ensure_cve_stub(db, cve_id, parsed.description or "", seen_stubs)
                # Stubs must exist in DB before link INSERT (bulk flush order is unsafe otherwise)
                db.flush()
                for cve_id in parsed.linked_cve_ids:
                    db.add(CveBduLink(cve_id=cve_id, bdu_id=parsed.bdu_id))
                    linked += 1
                standalone_flag = False
            else:
                standalone_flag = True
                standalone += 1
            row.is_standalone = standalone_flag

            if (created + updated) % 500 == 0:
                db.commit()
                seen_stubs.clear()
        except Exception as exc:  # pragma: no cover
            db.rollback()
            seen_stubs.clear()
            errors.append(f"{getattr(parsed, 'bdu_id', '?')}: {exc}")

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        errors.append(f"final commit: {exc}")
        raise

    return {
        "created": created,
        "updated": updated,
        "linked": linked,
        "standalone": standalone,
        "total": len(records),
        "errors": errors[:20],
    }


def import_bdu_xml_content(db: Session, content: str | bytes) -> dict:
    records = parse_bdu_xml(content)
    stats = upsert_bdu_records(db, records)
    stats["parsed"] = len(records)
    return stats


def import_bdu_content(db: Session, content: bytes, *, filename: str = "") -> dict:
    records = parse_bdu_file(content, filename=filename)
    stats = upsert_bdu_records(db, records)
    stats["parsed"] = len(records)
    stats["format"] = "xlsx" if (filename or "").lower().endswith(".xlsx") or content[:2] == b"PK" else "xml"
    return stats
