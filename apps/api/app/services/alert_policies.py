"""Alert policies evaluation + Jira outbound stub."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

from sqlalchemy.orm import Session

from app.models import AlertPolicy, Finding, ScanJob, utcnow
from app.services import ops_jobs as ops_svc
from app.services.auth_helpers import get_setting, set_setting

log = logging.getLogger("vbx.alert_policies")


def _json_list(raw: str | None) -> list:
    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _json_obj(raw: str | None) -> dict:
    try:
        data = json.loads(raw or "{}")
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def list_policies(db: Session) -> list[dict[str, Any]]:
    rows = db.query(AlertPolicy).order_by(AlertPolicy.id.desc()).all()
    return [_out(r) for r in rows]


def _out(r: AlertPolicy) -> dict[str, Any]:
    return {
        "id": r.id,
        "name": r.name,
        "trigger": r.trigger,
        "filters": _json_obj(r.filters_json),
        "channels": _json_list(r.channels_json),
        "enabled": bool(r.enabled),
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def create_policy(
    db: Session,
    *,
    name: str,
    trigger: str,
    channels: list[str] | None = None,
    filters: dict | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    row = AlertPolicy(
        name=(name or "").strip()[:255] or trigger,
        trigger=(trigger or "").strip()[:64],
        filters_json=json.dumps(filters or {}, ensure_ascii=False),
        channels_json=json.dumps(channels or ["webhook"], ensure_ascii=False),
        enabled=bool(enabled),
        created_at=utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


def delete_policy(db: Session, policy_id: int) -> None:
    row = db.get(AlertPolicy, policy_id)
    if not row:
        raise LookupError("Policy not found")
    db.delete(row)
    db.commit()


def evaluate_trigger(
    db: Session,
    trigger: str,
    *,
    text: str,
    finding: Finding | None = None,
    job: ScanJob | None = None,
    extra: dict | None = None,
) -> int:
    policies = (
        db.query(AlertPolicy)
        .filter(AlertPolicy.enabled.is_(True), AlertPolicy.trigger == trigger)
        .all()
    )
    n = 0
    for p in policies:
        filters = _json_obj(p.filters_json)
        if finding and filters.get("min_risk") is not None:
            if int(finding.risk_score or 0) < int(filters["min_risk"]):
                continue
        if finding and filters.get("severity"):
            if (finding.severity or "").upper() != str(filters["severity"]).upper():
                continue
        if finding and filters.get("priority"):
            if (finding.priority or "") != str(filters["priority"]):
                continue
        payload = {
            "text": text,
            "message": text,
            "trigger": trigger,
            "finding_id": finding.id if finding else None,
            "job_id": job.id if job else None,
            **(extra or {}),
        }
        for ch in _json_list(p.channels_json) or ["webhook"]:
            ops_svc.enqueue_alert(db, channel=str(ch), payload=payload)
            n += 1
    return n


def get_jira_settings(db: Session) -> dict[str, Any]:
    return {
        "base_url": get_setting(db, "jira_base_url", ""),
        "email": get_setting(db, "jira_email", ""),
        "api_token_configured": bool(get_setting(db, "jira_api_token_enc", "")),
        "project_key": get_setting(db, "jira_project_key", ""),
        "issue_type": get_setting(db, "jira_issue_type", "Bug"),
        "dry_run": get_setting(db, "jira_dry_run", "true") == "true",
    }


def save_jira_settings(db: Session, data: dict[str, Any]) -> dict[str, Any]:
    from app.services.crypto_secrets import encrypt_secret

    mapping = {
        "base_url": "jira_base_url",
        "email": "jira_email",
        "project_key": "jira_project_key",
        "issue_type": "jira_issue_type",
    }
    for src, key in mapping.items():
        if src in data and data[src] is not None:
            set_setting(db, key, str(data[src]).strip())
    if data.get("api_token"):
        set_setting(db, "jira_api_token_enc", encrypt_secret(str(data["api_token"]).strip()))
    if "dry_run" in data and data["dry_run"] is not None:
        set_setting(db, "jira_dry_run", "true" if data["dry_run"] else "false")
    return get_jira_settings(db)


def create_jira_issue(
    db: Session,
    *,
    summary: str,
    description: str = "",
) -> dict[str, Any]:
    from app.services.crypto_secrets import decrypt_secret

    cfg = get_jira_settings(db)
    base = (cfg.get("base_url") or "").rstrip("/")
    email = cfg.get("email") or ""
    token = decrypt_secret(get_setting(db, "jira_api_token_enc", ""))
    project = cfg.get("project_key") or ""
    issue_type = cfg.get("issue_type") or "Bug"
    if cfg.get("dry_run") or not base or not token:
        key = f"DRY-{abs(hash(summary)) % 100000}"
        return {"ok": True, "dry_run": True, "key": key, "url": ""}
    import base64

    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    body = json.dumps(
        {
            "fields": {
                "project": {"key": project},
                "summary": summary[:255],
                "description": description[:4000],
                "issuetype": {"name": issue_type},
            }
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/rest/api/2/issue",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {auth}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310
        data = json.loads(resp.read().decode("utf-8"))
    key = data.get("key") or ""
    return {"ok": True, "dry_run": False, "key": key, "url": f"{base}/browse/{key}" if key else ""}
