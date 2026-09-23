from __future__ import annotations

import json

import httpx
from sqlalchemy.orm import Session

from app.models import CisaKev, CveRecord, utcnow

KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"


def seed_mock_kev(db: Session) -> dict:
    samples = [
        {
            "cveID": "CVE-2023-44487",
            "vendorProject": "HTTP/2",
            "product": "Multiple",
            "vulnerabilityName": "HTTP/2 Rapid Reset",
            "dateAdded": "2023-10-10",
            "dueDate": "2023-11-01",
            "requiredAction": "Apply updates",
            "knownRansomwareCampaignUse": "Unknown",
            "notes": "mock",
        }
    ]
    return _upsert_kev_items(db, samples, mode="mock")


def _upsert_kev_items(db: Session, items: list[dict], mode: str) -> dict:
    upserted = 0
    matched = 0
    for item in items:
        cve_id = (item.get("cveID") or item.get("cve_id") or "").upper()
        if not cve_id:
            continue
        existing = db.get(CisaKev, cve_id)
        fields = dict(
            vendor_project=item.get("vendorProject") or "",
            product=item.get("product") or "",
            vulnerability_name=item.get("vulnerabilityName") or "",
            date_added=item.get("dateAdded") or "",
            due_date=item.get("dueDate") or "",
            required_action=item.get("requiredAction") or "",
            known_ransomware=item.get("knownRansomwareCampaignUse") or "",
            notes=item.get("notes") or "",
            raw_json=json.dumps(item),
        )
        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
        else:
            db.add(CisaKev(cve_id=cve_id, **fields))
        upserted += 1
        cve = db.get(CveRecord, cve_id)
        if cve:
            cve.is_cisa_kev = True
            cve.updated_at = utcnow()
            matched += 1
    db.commit()
    return {"mode": mode, "upserted": upserted, "matched_cves": matched}


def run_kev_sync(db: Session, *, mock_fallback: bool = True) -> dict:
    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.get(KEV_URL)
            resp.raise_for_status()
            data = resp.json()
        items = data.get("vulnerabilities") or []
        # Limit for first sync speed in on-prem bootstrap; full catalog still OK but heavy
        return _upsert_kev_items(db, items, mode="api")
    except Exception as exc:
        if mock_fallback:
            stats = seed_mock_kev(db)
            stats["warning"] = f"KEV API unavailable, mock used: {exc}"
            return stats
        raise
