from __future__ import annotations

import json
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import CveRecord, utcnow
from app.services.auth_helpers import get_setting
from app.services.crypto_secrets import decrypt_secret


NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"


def _parse_cvss(metrics: dict) -> tuple[str, float | None, str, str, bool]:
    for key, version in (("cvssMetricV31", "3.1"), ("cvssMetricV30", "3.0"), ("cvssMetricV2", "2.0")):
        items = metrics.get(key) or []
        if not items:
            continue
        data = items[0]
        cvss = data.get("cvssData") or {}
        score = cvss.get("baseScore")
        severity = cvss.get("baseSeverity") or data.get("baseSeverity") or ""
        vector = cvss.get("vectorString") or ""
        is_remote = "NETWORK" in vector.upper() or cvss.get("accessVector") == "NETWORK"
        return version, float(score) if score is not None else None, severity, vector, bool(is_remote)
    return "", None, "", "", False


def upsert_cve_from_nvd_item(db: Session, item: dict) -> str:
    cve = item.get("cve") or {}
    cve_id = cve.get("id")
    if not cve_id:
        return ""
    descriptions = cve.get("descriptions") or []
    description = ""
    for d in descriptions:
        if d.get("lang") == "en":
            description = d.get("value") or ""
            break
    if not description and descriptions:
        description = descriptions[0].get("value") or ""

    version, score, severity, vector, is_remote = _parse_cvss(cve.get("metrics") or {})
    weaknesses = []
    for w in cve.get("weaknesses") or []:
        for desc in w.get("description") or []:
            if desc.get("value"):
                weaknesses.append(desc["value"])
    refs = [r.get("url") for r in (cve.get("references") or []) if r.get("url")]
    products = []
    for conf in cve.get("configurations") or []:
        for node in conf.get("nodes") or []:
            for match in node.get("cpeMatch") or []:
                if match.get("criteria"):
                    products.append(match["criteria"])

    published = cve.get("published")
    modified = cve.get("lastModified")

    def _dt(v: str | None):
        if not v:
            return None
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            return None

    existing = db.get(CveRecord, cve_id)
    fields = dict(
        title=f"{cve_id}",
        description=description,
        status=(cve.get("vulnStatus") or ""),
        source="nvd",
        published_at=_dt(published),
        modified_at=_dt(modified),
        cvss_version=version,
        cvss_score=score,
        cvss_severity=severity,
        cvss_vector=vector,
        is_remote=is_remote,
        cwes=json.dumps(weaknesses),
        products=json.dumps(products[:50]),
        references_json=json.dumps(refs[:30]),
        raw_json=json.dumps(item)[:200000],
        updated_at=utcnow(),
    )
    if existing:
        # preserve kev flag
        kev = existing.is_cisa_kev
        for k, v in fields.items():
            setattr(existing, k, v)
        existing.is_cisa_kev = kev
    else:
        db.add(CveRecord(id=cve_id, is_cisa_kev=False, created_at=utcnow(), **fields))
    return cve_id


def seed_mock_cves(db: Session) -> dict:
    samples = [
        {
            "id": "CVE-2024-0001",
            "description": "Mock critical remote code execution in ExampleSoft.",
            "score": 9.8,
            "severity": "CRITICAL",
            "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
            "cwes": ["CWE-94"],
            "products": [
                "cpe:2.3:a:examplesoft:examplesoft:1.0:*:*:*:*:*:*:*",
                "cpe:2.3:a:examplesoft:examplesoft:1.1:*:*:*:*:*:*:*",
            ],
            "refs": [
                "https://nvd.nist.gov/vuln/detail/CVE-2024-0001",
                "https://example.com/advisory/examplesoft-rce",
            ],
        },
        {
            "id": "CVE-2024-0002",
            "description": "Mock privilege escalation in LocalAgent.",
            "score": 7.8,
            "severity": "HIGH",
            "vector": "CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H",
            "cwes": ["CWE-269"],
            "products": ["cpe:2.3:a:localvendor:localagent:2.0:*:*:*:*:*:*:*"],
            "refs": ["https://nvd.nist.gov/vuln/detail/CVE-2024-0002"],
        },
        {
            "id": "CVE-2023-44487",
            "description": "HTTP/2 Rapid Reset (mock seed for KEV demos).",
            "score": 7.5,
            "severity": "HIGH",
            "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H",
            "cwes": ["CWE-400"],
            "products": [
                "cpe:2.3:a:apache:http_server:*:*:*:*:*:*:*:*",
                "cpe:2.3:a:nginx:nginx:*:*:*:*:*:*:*:*",
            ],
            "refs": [
                "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
                "https://nvd.nist.gov/vuln/detail/CVE-2023-44487",
            ],
        },
    ]
    created = 0
    for s in samples:
        existing = db.get(CveRecord, s["id"])
        fields = dict(
            title=s["id"],
            description=s["description"],
            status="Analyzed",
            source="nvd-mock",
            published_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
            modified_at=datetime(2024, 1, 2, tzinfo=timezone.utc),
            cvss_version="3.1",
            cvss_score=s["score"],
            cvss_severity=s["severity"],
            cvss_vector=s["vector"],
            is_remote="AV:N" in s["vector"],
            cwes=json.dumps(s.get("cwes") or ["CWE-94"]),
            products=json.dumps(s.get("products") or []),
            references_json=json.dumps(s.get("refs") or []),
            raw_json="{}",
        )
        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
            # keep kev flag
        else:
            db.add(CveRecord(id=s["id"], is_cisa_kev=False, created_at=utcnow(), **fields))
            created += 1
    db.commit()
    return {"created": created, "mode": "mock", "total": len(samples), "updated": len(samples) - created}


def run_nvd_sync(db: Session, *, results_per_page: int = 50, max_pages: int = 2) -> dict:
    settings = get_settings()
    enc = get_setting(db, "nvd_api_key_enc", "")
    api_key = decrypt_secret(enc) or settings.vbx_nvd_api_key
    mock = get_setting(db, "nvd_mock_mode", "true" if not api_key else "false") == "true"

    if mock or not api_key:
        stats = seed_mock_cves(db)
        return stats

    headers = {"apiKey": api_key}
    created_or_updated = 0
    errors: list[str] = []
    with httpx.Client(timeout=60.0) as client:
        start_index = 0
        for _ in range(max_pages):
            params = {"resultsPerPage": results_per_page, "startIndex": start_index}
            try:
                resp = client.get(NVD_URL, params=params, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                errors.append(str(exc))
                break
            for item in data.get("vulnerabilities") or []:
                cve_id = upsert_cve_from_nvd_item(db, item)
                if cve_id:
                    created_or_updated += 1
            db.commit()
            total = data.get("totalResults") or 0
            start_index += results_per_page
            if start_index >= total:
                break
    return {
        "mode": "api",
        "upserted": created_or_updated,
        "errors": errors[:10],
    }
