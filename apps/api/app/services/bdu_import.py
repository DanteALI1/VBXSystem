from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models import BduRecord, CveBduLink, CveRecord, utcnow
from app.services.bdu_parser import ParsedBdu, parse_bdu_xml, parsed_to_standalone


def upsert_bdu_records(db: Session, records: list[ParsedBdu]) -> dict:
    created = 0
    updated = 0
    linked = 0
    standalone = 0
    errors: list[str] = []

    for parsed in records:
        try:
            is_standalone = parsed_to_standalone(parsed)
            existing = db.get(BduRecord, parsed.bdu_id)
            payload = dict(
                name=parsed.name,
                description=parsed.description,
                severity=parsed.severity,
                severity_level=parsed.severity_level,
                status=parsed.status,
                solution=parsed.solution,
                vendors=parsed.vendors,
                software_names=parsed.software_names,
                cwes=parsed.cwes,
                linked_cve_ids=json.dumps(parsed.linked_cve_ids),
                identify_date=parsed.identify_date,
                is_standalone=is_standalone,
                raw_xml=parsed.raw_xml,
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

            # refresh links
            db.query(CveBduLink).filter_by(bdu_id=parsed.bdu_id).delete()
            if parsed.linked_cve_ids:
                for cve_id in parsed.linked_cve_ids:
                    if db.get(CveRecord, cve_id) is None:
                        # create stub CVE shell so link + later NVD enrich works
                        db.add(
                            CveRecord(
                                id=cve_id,
                                title=f"{cve_id} (ожидает синхронизации NVD)",
                                description=parsed.description or "",
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
                    db.add(CveBduLink(cve_id=cve_id, bdu_id=parsed.bdu_id))
                    linked += 1
                standalone_flag = False
            else:
                standalone_flag = True
                standalone += 1
            row.is_standalone = standalone_flag
        except Exception as exc:  # pragma: no cover
            errors.append(f"{parsed.bdu_id}: {exc}")

    db.commit()
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
