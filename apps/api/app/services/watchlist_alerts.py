"""Enqueue alerts when new CVEs match org watchlist entries."""

from __future__ import annotations

import logging
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import CveRecord, OrgWatchlistEntry
from app.services.auth_helpers import get_setting
from app.services import ops_jobs as ops_svc

log = logging.getLogger("vbx.watchlist_alerts")


def maybe_alert_cves(db: Session, cve_ids: Iterable[str]) -> int:
    """If watchlist alerts enabled, enqueue alerts for matching CVE ids. Returns count."""
    if get_setting(db, "watchlist_alerts_enabled", "true") != "true":
        return 0
    ids = [str(x).strip().upper() for x in cve_ids if x]
    if not ids:
        return 0
    entries = (
        db.query(OrgWatchlistEntry)
        .filter(OrgWatchlistEntry.kind == "cve", OrgWatchlistEntry.value.in_(ids))
        .all()
    )
    if not entries:
        # also match vendor/product loosely against products blob
        vendor_prod = (
            db.query(OrgWatchlistEntry)
            .filter(OrgWatchlistEntry.kind.in_(["vendor", "product"]))
            .all()
        )
        if not vendor_prod:
            return 0
        matched_ids: list[str] = []
        for cid in ids[:50]:
            cve = db.get(CveRecord, cid)
            if not cve:
                continue
            blob = f"{(cve.products or '')} {(cve.title or '')}".lower()
            for e in vendor_prod:
                if (e.value or "").lower() in blob:
                    matched_ids.append(cid)
                    break
        ids = matched_ids
        if not ids:
            return 0
    else:
        ids = sorted({e.value for e in entries})

    channels: list[str] = []
    if get_setting(db, "alert_webhook_url", "").strip():
        channels.append("webhook")
    if get_setting(db, "telegram_enabled", "false") == "true":
        channels.append("telegram")
    if get_setting(db, "alert_email_to", "").strip():
        channels.append("email")
    if not channels:
        channels = ["webhook"]  # still queue for visibility in outbox

    text = "Watchlist match: " + ", ".join(ids[:20])
    n = 0
    for ch in channels:
        payload = {
            "text": text,
            "message": text,
            "cve_ids": ids[:50],
            "to": get_setting(db, "alert_email_to", ""),
            "subject": "VBX watchlist alert",
        }
        try:
            ops_svc.enqueue_alert(db, channel=ch, payload=payload)
            n += 1
        except Exception as exc:  # noqa: BLE001
            log.warning("watchlist alert enqueue failed: %s", exc)

    try:
        from app.services import alert_policies as policy_svc

        n += policy_svc.evaluate_trigger(
            db,
            "watchlist",
            text=text,
            extra={"cve_ids": ids[:50]},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("watchlist policy evaluate failed: %s", exc)
    return n
