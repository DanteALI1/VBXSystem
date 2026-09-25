from __future__ import annotations

import json
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import CveRecord, utcnow
from app.services.auth_helpers import get_setting
from app.services.crypto_secrets import decrypt_secret
from sqlalchemy import func


NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
# When store-raw is on, cap payload size; when off, keep a tiny stub.
RAW_JSON_MAX = 200_000
RAW_JSON_STUB_MAX = 256


def store_raw_json_enabled(db: Session) -> bool:
    settings = get_settings()
    return settings.cve_store_raw_json_effective(get_setting(db, "cve_store_raw_json", ""))


def encode_raw_json(db: Session, item: dict) -> str:
    if not store_raw_json_enabled(db):
        stub = {"id": (item.get("cve") or {}).get("id") or "", "stored": False}
        return json.dumps(stub, ensure_ascii=False)[:RAW_JSON_STUB_MAX]
    return json.dumps(item, ensure_ascii=False)[:RAW_JSON_MAX]


def prune_huge_raw_json(db: Session, *, min_bytes: int = 10_000, limit: int = 50_000) -> dict:
    """Null/stub oversized cves.raw_json (one-shot admin prune)."""
    q = (
        db.query(CveRecord)
        .filter(func.length(CveRecord.raw_json) >= min_bytes)
        .order_by(CveRecord.id.asc())
        .limit(max(1, min(limit, 200_000)))
    )
    updated = 0
    for row in q:
        row.raw_json = json.dumps({"id": row.id, "stored": False, "pruned": True}, ensure_ascii=False)
        updated += 1
    db.commit()
    return {"updated": updated, "min_bytes": min_bytes, "limit": limit}


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
        attack = (cvss.get("attackVector") or cvss.get("accessVector") or "").upper()
        vu = vector.upper()
        # CVSS 3.x uses AV:N; CVSS 2 uses AV:N or accessVector=NETWORK
        is_remote = (
            "AV:N" in vu
            or attack == "NETWORK"
            or "NETWORK" in vu
        )
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
                criteria = match.get("criteria")
                if not criteria:
                    continue
                entry: dict = {"cpe": criteria, "vulnerable": bool(match.get("vulnerable", True))}
                for key in (
                    "versionStartIncluding",
                    "versionStartExcluding",
                    "versionEndIncluding",
                    "versionEndExcluding",
                ):
                    if match.get(key):
                        entry[key] = match[key]
                products.append(entry)

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
        raw_json=encode_raw_json(db, item),
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


def run_nvd_sync(
    db: Session,
    *,
    results_per_page: int | None = None,
    max_pages: int | None = None,
    resume: bool = False,
    progress_cb=None,
) -> dict:
    """Pull CVE pages from NVD 2.0 API until the catalog is mirrored.

    - results_per_page defaults to 2000 (NVD maximum)
    - max_pages=0 means unlimited (full mirror ~397k CVE)
    - resume=True continues from saved nvd_mirror_cursor; False starts at 0
    """
    import time

    from app.services.auth_helpers import set_setting

    settings = get_settings()
    enc = get_setting(db, "nvd_api_key_enc", "")
    api_key = decrypt_secret(enc) or settings.vbx_nvd_api_key
    mock = get_setting(db, "nvd_mock_mode", "true" if not api_key else "false") == "true"

    if mock or not api_key:
        stats = seed_mock_cves(db)
        return stats

    page_size = results_per_page or int(settings.vbx_nvd_results_per_page or 2000)
    page_size = max(1, min(page_size, 2000))
    page_limit = settings.vbx_nvd_max_pages if max_pages is None else max_pages
    sleep_sec = float(settings.vbx_nvd_request_sleep_sec or 0.8)

    if resume:
        try:
            start_index = int(get_setting(db, "nvd_mirror_cursor", "0") or "0")
        except ValueError:
            start_index = 0
    else:
        start_index = 0
        set_setting(db, "nvd_mirror_cursor", "0")

    headers = {
        "apiKey": api_key,
        "User-Agent": "VBXSystem/0.9 (vulnerability-intelligence; on-prem)",
        "Accept": "application/json",
    }
    created_or_updated = 0
    errors: list[str] = []
    pages_ok = 0
    total_results = 0
    pages_done = 0

    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        while True:
            if page_limit and pages_done >= page_limit:
                break
            params = {"resultsPerPage": page_size, "startIndex": start_index}
            data = None
            last_exc: Exception | None = None
            for attempt in range(5):
                try:
                    resp = client.get(NVD_URL, params=params, headers=headers)
                    if resp.status_code in {403, 404, 429, 503}:
                        wait = 6 + attempt * 8
                        time.sleep(wait)
                        if attempt == 4:
                            resp.raise_for_status()
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    break
                except Exception as exc:
                    last_exc = exc
                    time.sleep(2 + attempt * 3)
            if data is None:
                errors.append(str(last_exc) if last_exc else "NVD request failed")
                break

            vulns = data.get("vulnerabilities") or []
            total_results = int(data.get("totalResults") or total_results)
            for item in vulns:
                cve_id = upsert_cve_from_nvd_item(db, item)
                if cve_id:
                    created_or_updated += 1
            db.commit()

            pages_ok += 1
            pages_done += 1
            start_index += page_size
            set_setting(db, "nvd_mirror_cursor", str(start_index))
            set_setting(db, "nvd_mirror_total", str(total_results))

            if progress_cb:
                try:
                    progress_cb(
                        {
                            "mode": "api",
                            "upserted": created_or_updated,
                            "pages": pages_ok,
                            "startIndex": start_index,
                            "totalResults": total_results,
                            "pct": round(min(100.0, 100.0 * start_index / total_results), 2)
                            if total_results
                            else 0,
                        }
                    )
                except Exception:
                    pass

            if start_index >= total_results or not vulns:
                set_setting(db, "nvd_mirror_cursor", "0")
                set_setting(db, "nvd_mirror_complete", "true")
                break
            time.sleep(sleep_sec)

    if pages_ok == 0 and errors:
        raise RuntimeError(f"NVD sync failed: {errors[0]}")
    incomplete = bool(total_results and start_index < total_results and (page_limit == 0 or pages_done < (page_limit or 0) or errors))
    # incomplete if stopped early due to errors before covering catalog
    if errors and total_results and start_index < total_results:
        incomplete = True
    return {
        "mode": "api",
        "upserted": created_or_updated,
        "pages": pages_ok,
        "startIndex": start_index,
        "totalResults": total_results,
        "complete": bool(total_results and start_index >= total_results),
        "incomplete": incomplete and not (total_results and start_index >= total_results),
        "errors": errors[:10],
    }
