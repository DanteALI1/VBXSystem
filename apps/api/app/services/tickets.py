"""Ticket domain: lifecycle, SLA, permissions, notifications hooks."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import user_permissions
from app.models import (
    CveRecord,
    Finding,
    Group,
    NotificationPreference,
    Ticket,
    TicketComment,
    TicketEvent,
    User,
    utcnow,
)
from app.services.auth_helpers import get_setting, set_setting, write_audit
from app.services.crypto_secrets import decrypt_secret
from app.services.smtp_service import send_smtp_message

STATUSES = ("new", "in_progress", "waiting", "resolved", "pending_close", "closed")

TRANSITIONS: dict[str, set[str]] = {
    "new": {"in_progress", "waiting", "pending_close", "closed"},
    "in_progress": {"waiting", "resolved", "pending_close", "closed"},
    "waiting": {"in_progress", "resolved", "pending_close", "closed"},
    "resolved": {"pending_close", "closed", "in_progress"},
    "pending_close": {"closed", "in_progress"},
    "closed": {"in_progress"},  # reopen — manage only
}

DEFAULT_SLA_HOURS: dict[str, int] = {
    "CRITICAL": 24,
    "HIGH": 72,
    "MEDIUM": 168,
    "LOW": 336,
}

OPEN_STATUSES = frozenset({"new", "in_progress", "waiting", "resolved", "pending_close"})

SETTING_TICKET_AUTO_RULES = "ticket_auto_rules_json"

_SEV_RANK = {"CRITICAL": 5, "HIGH": 4, "MEDIUM": 3, "LOW": 2, "INFO": 1}
_SEVERITY_GTE_RE = re.compile(
    r"^\s*severity\s*>=\s*(CRITICAL|HIGH|MEDIUM|LOW|INFO)\s*$",
    re.IGNORECASE,
)
_CVE_MATCH_RE = re.compile(r"^\s*cve_match\s*:\s*(CVE-\d{4}-\d+)\s*$", re.IGNORECASE)
_IS_KEV_RE = re.compile(r"^\s*is_kev\s*$", re.IGNORECASE)


def severity_rank(severity: str | None) -> int:
    return _SEV_RANK.get((severity or "MEDIUM").upper(), 3)


def sla_hours_map(db: Session) -> dict[str, int]:
    raw = get_setting(db, "ticket_sla_hours_json", "")
    out = dict(DEFAULT_SLA_HOURS)
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                for k, v in data.items():
                    try:
                        out[str(k).upper()] = max(1, int(v))
                    except (TypeError, ValueError):
                        continue
        except json.JSONDecodeError:
            pass
    return out


def resolve_sla_hours(db: Session, severity: str, explicit: int | None = None) -> int:
    if explicit is not None and explicit > 0:
        return int(explicit)
    return sla_hours_map(db).get((severity or "MEDIUM").upper(), DEFAULT_SLA_HOURS["MEDIUM"])


def compute_due_at(created: datetime, hours: int) -> datetime:
    base = created if created.tzinfo else created.replace(tzinfo=timezone.utc)
    return base + timedelta(hours=hours)


def is_overdue(ticket: Ticket, now: datetime | None = None) -> bool:
    if ticket.status not in OPEN_STATUSES:
        return False
    due = ticket.due_date
    if not due:
        return False
    now = now or utcnow()
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    return due < now


def can_manage(user: User) -> bool:
    perms = user_permissions(user)
    return "*" in perms or "tickets:manage" in perms or user.is_super_admin


def can_write(user: User) -> bool:
    perms = user_permissions(user)
    return can_manage(user) or "tickets:write" in perms


def can_read(user: User) -> bool:
    perms = user_permissions(user)
    return can_write(user) or "tickets:read" in perms


def can_view_ticket(user: User, ticket: Ticket) -> bool:
    if can_manage(user):
        return True
    if ticket.created_by_id == user.id or ticket.assignee_user_id == user.id:
        return True
    if ticket.group_id and any(g.id == ticket.group_id for g in user.groups):
        return True
    return False


def can_confirm_close(user: User, ticket: Ticket) -> bool:
    if can_manage(user):
        return True
    return ticket.assignee_user_id == user.id


def _add_event(
    db: Session,
    ticket_id: int,
    *,
    actor_user_id: int | None,
    event_type: str,
    message: str,
    meta: dict | None = None,
) -> TicketEvent:
    ev = TicketEvent(
        ticket_id=ticket_id,
        actor_user_id=actor_user_id,
        event_type=event_type,
        message=message,
        meta_json=json.dumps(meta or {}, ensure_ascii=False),
        created_at=utcnow(),
    )
    db.add(ev)
    return ev


def _notify_assignee(db: Session, ticket: Ticket, message: str) -> None:
    if not ticket.assignee_user_id:
        return
    pref = db.get(NotificationPreference, ticket.assignee_user_id)
    if pref and not pref.ticket_events:
        return
    assignee = db.get(User, ticket.assignee_user_id)
    if not assignee or not assignee.email:
        return
    # optional email if SMTP host configured and reachable
    host = get_setting(db, "smtp_host", "")
    if not host:
        return
    try:
        port = int(get_setting(db, "smtp_port", "1025") or "1025")
        pwd = decrypt_secret(get_setting(db, "smtp_password_enc", ""))
        send_smtp_message(
            host=host,
            port=port,
            username=get_setting(db, "smtp_username", ""),
            password=pwd,
            use_tls=get_setting(db, "smtp_use_tls", "false") == "true",
            from_addr=get_setting(db, "smtp_from", "vbx@localhost"),
            to_addr=assignee.email,
            subject=f"[VBX] Заявка #{ticket.id}: {ticket.title[:80]}",
            body=message,
            timeout=5.0,
        )
    except Exception:
        # never fail ticket ops on mail errors
        return


def _parse_when(when: Any) -> dict[str, Any]:
    """Normalize rule.when into {severity_gte?, is_kev?, cve_match?}."""
    out: dict[str, Any] = {}
    if when is None:
        return out
    if isinstance(when, str):
        s = when.strip()
        m = _SEVERITY_GTE_RE.match(s)
        if m:
            out["severity_gte"] = m.group(1).upper()
            return out
        if _IS_KEV_RE.match(s):
            out["is_kev"] = True
            return out
        m = _CVE_MATCH_RE.match(s)
        if m:
            out["cve_match"] = m.group(1).upper()
            return out
        # bare CVE id
        if re.match(r"^CVE-\d{4}-\d+$", s, re.IGNORECASE):
            out["cve_match"] = s.upper()
            return out
        return out
    if isinstance(when, dict):
        if when.get("severity_gte"):
            out["severity_gte"] = str(when["severity_gte"]).upper().strip()
        # also accept severity_min / "severity>="
        for alt in ("severity_min", "severity>="):
            if when.get(alt) and "severity_gte" not in out:
                out["severity_gte"] = str(when[alt]).upper().strip()
        if "is_kev" in when:
            out["is_kev"] = bool(when["is_kev"])
        if when.get("cve_match"):
            out["cve_match"] = str(when["cve_match"]).upper().strip()
        if when.get("min_risk") is not None:
            try:
                out["min_risk"] = int(when["min_risk"])
            except (TypeError, ValueError):
                pass
        if when.get("priority"):
            out["priority"] = str(when["priority"]).strip().lower()
        return out
    return out


def normalize_auto_rules(raw: Any) -> list[dict[str, Any]]:
    """Validate and normalize auto-rules list for storage/API."""
    if not isinstance(raw, list):
        return []
    cleaned: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        action = str(item.get("action") or "create_ticket").strip().lower()
        if action not in ("create_ticket", "set_status", "set_priority", "assign", "add_tag"):
            continue
        when = _parse_when(item.get("when"))
        if not when:
            continue
        enabled = item.get("enabled", True)
        if isinstance(enabled, str):
            enabled = enabled.strip().lower() in {"1", "true", "yes", "on"}
        rule: dict[str, Any] = {
            "when": when,
            "action": action,
            "enabled": bool(enabled),
        }
        if action == "set_status":
            rule["status"] = str(item.get("status") or "triaged").strip().lower()
        elif action == "set_priority":
            pri = str(item.get("priority") or "high").strip().lower()
            if pri not in ("low", "medium", "high", "urgent"):
                pri = "high"
            rule["priority"] = pri
        elif action == "assign":
            try:
                rule["assignee_user_id"] = int(item.get("assignee_user_id"))
            except (TypeError, ValueError):
                continue
        elif action == "add_tag":
            tags = item.get("tags") or item.get("tag")
            if isinstance(tags, str):
                tags = [tags]
            if not isinstance(tags, list) or not tags:
                continue
            rule["tags"] = [str(t).strip()[:64] for t in tags if str(t).strip()]
        cleaned.append(rule)
    return cleaned


def load_auto_rules(db: Session) -> list[dict[str, Any]]:
    raw = get_setting(db, SETTING_TICKET_AUTO_RULES, "")
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return normalize_auto_rules(data)


def save_auto_rules(
    db: Session,
    rules: list[Any],
    *,
    actor_user_id: int | None = None,
) -> list[dict[str, Any]]:
    cleaned = normalize_auto_rules(rules)
    set_setting(db, SETTING_TICKET_AUTO_RULES, json.dumps(cleaned, ensure_ascii=False))
    if actor_user_id is not None:
        write_audit(
            db,
            action="tickets.auto_rules",
            actor_user_id=actor_user_id,
            resource="ticket_auto_rules",
            details=f"rules={len(cleaned)}",
        )
    return cleaned


def _finding_cve_ids(finding: Finding) -> list[str]:
    try:
        data = json.loads(finding.linked_cve_ids_json or "[]")
    except Exception:
        data = []
    if not isinstance(data, list):
        return []
    return [str(c).upper().strip() for c in data if str(c).strip()]


def _finding_is_kev(db: Session, cve_ids: list[str]) -> bool:
    if not cve_ids:
        return False
    row = (
        db.query(CveRecord.id)
        .filter(CveRecord.id.in_(cve_ids), CveRecord.is_cisa_kev.is_(True))
        .first()
    )
    return row is not None


def rule_matches_finding(db: Session, rule: dict[str, Any], finding: Finding) -> bool:
    when = rule.get("when") if isinstance(rule.get("when"), dict) else _parse_when(rule.get("when"))
    if not when:
        return False
    cve_ids = _finding_cve_ids(finding)
    if when.get("severity_gte"):
        if severity_rank(finding.severity) < severity_rank(str(when["severity_gte"])):
            return False
    if when.get("is_kev") is True:
        if not _finding_is_kev(db, cve_ids):
            return False
    if when.get("cve_match"):
        needle = str(when["cve_match"]).upper().strip()
        if needle not in cve_ids:
            return False
    if when.get("min_risk") is not None:
        try:
            if int(finding.risk_score or 0) < int(when["min_risk"]):
                return False
        except (TypeError, ValueError):
            return False
    if when.get("priority"):
        if (finding.priority or "") != str(when["priority"]).strip().lower():
            return False
    return True


def resolve_auto_ticket_actor(db: Session, preferred_user_id: int | None = None) -> User | None:
    if preferred_user_id:
        u = db.get(User, preferred_user_id)
        if u and u.status == "active" and can_write(u):
            return u
    # Prefer super-admin, then any active user with tickets:write
    for u in (
        db.query(User)
        .filter(User.status == "active")
        .order_by(User.is_super_admin.desc(), User.id.asc())
        .all()
    ):
        if can_write(u):
            return u
    return None


def auto_create_ticket_for_finding(
    db: Session,
    finding: Finding,
    *,
    actor: User | None = None,
    preferred_user_id: int | None = None,
) -> Ticket | None:
    """Create at most one ticket per finding. Returns None if skipped or already linked."""
    if finding.ticket_id:
        return None
    actor = actor or resolve_auto_ticket_actor(db, preferred_user_id)
    if not actor:
        return None

    cves = _finding_cve_ids(finding)
    try:
        bdus = json.loads(finding.linked_bdu_ids_json or "[]")
    except Exception:
        bdus = []
    if not isinstance(bdus, list):
        bdus = []
    linked_cve = cves[0] if cves else None
    linked_bdu = str(bdus[0]).strip() if bdus else None
    try:
        evidence = json.loads(finding.evidence_json or "{}")
    except Exception:
        evidence = {}
    desc_parts = [
        f"[Авто] Finding #{finding.id} из модуля `{finding.module_id}` (job #{finding.scan_job_id}).",
    ]
    if isinstance(evidence, dict) and evidence:
        desc_parts.append(f"Evidence: {json.dumps(evidence, ensure_ascii=False)[:2000]}")
    if len(cves) > 1:
        desc_parts.append("CVEs: " + ", ".join(cves))

    ticket, _warning = create_ticket(
        db,
        actor=actor,
        title=finding.title or f"Finding #{finding.id}",
        description="\n".join(desc_parts),
        severity=(finding.severity or "MEDIUM").upper(),
        linked_cve_id=linked_cve,
        linked_bdu_id=linked_bdu,
        warn_duplicate=False,
    )
    finding.ticket_id = ticket.id
    db.commit()
    db.refresh(finding)
    write_audit(
        db,
        action="tickets.auto_create",
        actor_user_id=actor.id,
        resource=f"finding:{finding.id}",
        details=f"ticket:{ticket.id}",
    )
    return ticket


def evaluate_auto_rules_for_findings(
    db: Session,
    findings: list[Finding],
    *,
    preferred_user_id: int | None = None,
) -> int:
    """Evaluate auto-rules: create tickets and/or set finding status. Returns tickets created."""
    rules = [r for r in load_auto_rules(db) if r.get("enabled", True)]
    if not rules or not findings:
        return 0
    actor = resolve_auto_ticket_actor(db, preferred_user_id)
    created = 0
    for finding in findings:
        status = (finding.status or "open").lower()
        if status not in {"open", "triaged", "new"}:
            continue
        matched_rules = [rule for rule in rules if rule_matches_finding(db, rule, finding)]
        if not matched_rules:
            continue
        for rule in matched_rules:
            action = rule.get("action") or "create_ticket"
            if action == "set_status":
                st = str(rule.get("status") or "triaged").strip().lower()
                if st and finding.status != st:
                    finding.status = st
                    db.commit()
            elif action == "set_priority":
                pri = str(rule.get("priority") or "high").strip().lower()
                finding.priority = pri
                db.commit()
            elif action == "assign":
                aid = rule.get("assignee_user_id")
                if aid:
                    finding.assignee_user_id = int(aid)
                    db.commit()
            elif action == "add_tag":
                try:
                    from app.services.projects import finding_tags

                    cur = set(finding_tags(finding))
                    cur.update(rule.get("tags") or [])
                    finding.tags_json = json.dumps(sorted(cur), ensure_ascii=False)
                    db.commit()
                except Exception:
                    pass
            elif action == "create_ticket":
                if finding.ticket_id or not actor:
                    continue
                ticket = auto_create_ticket_for_finding(db, finding, actor=actor)
                if ticket:
                    created += 1
                    break
    return created


def create_ticket(
    db: Session,
    *,
    actor: User,
    title: str,
    description: str = "",
    severity: str = "MEDIUM",
    linked_cve_id: str | None = None,
    linked_bdu_id: str | None = None,
    assignee_user_id: int | None = None,
    group_id: int | None = None,
    due_date: datetime | None = None,
    sla_hours: int | None = None,
    warn_duplicate: bool = True,
) -> tuple[Ticket, str | None]:
    if not can_write(actor):
        raise PermissionError("Недостаточно прав для создания заявки")

    warning = None
    if warn_duplicate and (linked_cve_id or linked_bdu_id):
        q = db.query(Ticket).filter(Ticket.status.notin_(["closed", "resolved"]))
        if linked_cve_id:
            q = q.filter(Ticket.linked_cve_id == linked_cve_id.upper())
        if linked_bdu_id:
            q = q.filter(Ticket.linked_bdu_id == linked_bdu_id)
        existing = q.order_by(Ticket.id.desc()).first()
        if existing:
            warning = f"Уже есть открытая заявка #{existing.id} по этой уязвимости"

    if linked_cve_id:
        linked_cve_id = linked_cve_id.upper().strip()
    if group_id and not db.get(Group, group_id):
        raise ValueError("Группа не найдена")
    if assignee_user_id and not db.get(User, assignee_user_id):
        raise ValueError("Исполнитель не найден")
    if assignee_user_id and not can_manage(actor) and assignee_user_id != actor.id:
        raise PermissionError("Назначать других пользователей может только ticket_manager/admin")

    sev = (severity or "MEDIUM").upper()
    created = utcnow()
    hours = resolve_sla_hours(db, sev, sla_hours)
    due = due_date or compute_due_at(created, hours)

    ticket = Ticket(
        title=(title or "").strip() or "Без названия",
        description=description or "",
        severity=sev,
        status="new",
        linked_cve_id=linked_cve_id,
        linked_bdu_id=linked_bdu_id,
        assignee_user_id=assignee_user_id,
        group_id=group_id,
        created_by_id=actor.id,
        due_date=due,
        sla_hours=hours,
        created_at=created,
        updated_at=created,
    )
    db.add(ticket)
    db.flush()
    _add_event(db, ticket.id, actor_user_id=actor.id, event_type="created", message="Заявка создана")
    if assignee_user_id:
        _add_event(
            db,
            ticket.id,
            actor_user_id=actor.id,
            event_type="assign",
            message=f"Назначен пользователь #{assignee_user_id}",
            meta={"assignee_user_id": assignee_user_id},
        )
    db.commit()
    db.refresh(ticket)
    write_audit(db, action="tickets.create", actor_user_id=actor.id, resource=f"ticket:{ticket.id}")
    _notify_assignee(db, ticket, f"Вам назначена заявка #{ticket.id}: {ticket.title}")
    return ticket, warning


def list_tickets(
    db: Session,
    user: User,
    *,
    status: str | None = None,
    assignee: str | None = None,
    severity: str | None = None,
    vuln: str | None = None,
    group_id: int | None = None,
    overdue: bool | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    if not can_read(user):
        raise PermissionError("Недостаточно прав")
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    q = db.query(Ticket)
    if not can_manage(user):
        group_ids = [g.id for g in user.groups]
        clauses = [Ticket.created_by_id == user.id, Ticket.assignee_user_id == user.id]
        if group_ids:
            clauses.append(Ticket.group_id.in_(group_ids))
        q = q.filter(or_(*clauses))
    if status:
        q = q.filter(Ticket.status == status)
    if severity:
        q = q.filter(Ticket.severity == severity.upper())
    if group_id is not None:
        q = q.filter(Ticket.group_id == group_id)
    if assignee == "me":
        q = q.filter(Ticket.assignee_user_id == user.id)
    elif assignee == "unassigned":
        q = q.filter(Ticket.assignee_user_id.is_(None))
    elif assignee and assignee.isdigit():
        q = q.filter(Ticket.assignee_user_id == int(assignee))
    if vuln:
        like = f"%{vuln.strip()}%"
        q = q.filter(or_(Ticket.linked_cve_id.ilike(like), Ticket.linked_bdu_id.ilike(like), Ticket.title.ilike(like)))
    if overdue:
        now = utcnow()
        q = q.filter(
            Ticket.status.in_(list(OPEN_STATUSES)),
            Ticket.due_date.isnot(None),
            Ticket.due_date < now,
        )
    total = q.count()
    rows = q.order_by(Ticket.updated_at.desc(), Ticket.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "results": [_ticket_out(db, t) for t in rows]}


def export_tickets_rows(
    db: Session,
    user: User,
    *,
    status: str | None = None,
    assignee: str | None = None,
    severity: str | None = None,
    vuln: str | None = None,
    group_id: int | None = None,
    overdue: bool | None = None,
    limit: int = 2000,
) -> list[dict]:
    limit = min(max(1, limit), 5000)
    results: list[dict] = []
    page = 1
    total = None
    while len(results) < limit:
        chunk = list_tickets(
            db,
            user,
            status=status,
            assignee=assignee,
            severity=severity,
            vuln=vuln,
            group_id=group_id,
            overdue=overdue,
            page=page,
            page_size=100,
        )
        if total is None:
            total = int(chunk.get("total") or 0)
        batch = chunk.get("results") or []
        if not batch:
            break
        results.extend(batch)
        if len(results) >= total:
            break
        page += 1
        if page > 60:
            break
    return results[:limit]


def get_ticket(db: Session, user: User, ticket_id: int) -> dict:
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise LookupError("Заявка не найдена")
    if not can_view_ticket(user, ticket):
        raise PermissionError("Нет доступа к заявке")
    comments = (
        db.query(TicketComment).filter_by(ticket_id=ticket.id).order_by(TicketComment.id.asc()).all()
    )
    events = db.query(TicketEvent).filter_by(ticket_id=ticket.id).order_by(TicketEvent.id.asc()).all()
    out = _ticket_out(db, ticket)
    out["comments"] = [
        {
            "id": c.id,
            "author_user_id": c.author_user_id,
            "author_name": _user_name(db, c.author_user_id),
            "body": c.body,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in comments
    ]
    out["events"] = [
        {
            "id": e.id,
            "actor_user_id": e.actor_user_id,
            "actor_name": _user_name(db, e.actor_user_id),
            "event_type": e.event_type,
            "message": e.message,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]
    return out


def transition_status(db: Session, user: User, ticket_id: int, new_status: str) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise LookupError("Заявка не найдена")
    if not can_view_ticket(user, ticket):
        raise PermissionError("Нет доступа")
    new_status = new_status.strip().lower()
    if new_status not in STATUSES:
        raise ValueError(f"Неизвестный статус: {new_status}")
    allowed = TRANSITIONS.get(ticket.status, set())
    if new_status not in allowed:
        raise ValueError(f"Переход {ticket.status} → {new_status} запрещён")

    # Confirm-close: pending_close → closed only assignee or manager
    if ticket.status == "pending_close" and new_status == "closed":
        if not can_confirm_close(user, ticket):
            raise PermissionError("Подтвердить закрытие может только исполнитель или ticket_manager")
    elif new_status == "closed" and not can_manage(user) and ticket.created_by_id != user.id and ticket.assignee_user_id != user.id:
        raise PermissionError("Закрытие недоступно")

    if ticket.status == "closed" and new_status == "in_progress" and not can_manage(user):
        raise PermissionError("Переоткрытие только для ticket_manager/admin")
    if not can_write(user) and not can_manage(user):
        raise PermissionError("Недостаточно прав")

    old = ticket.status
    ticket.status = new_status
    ticket.updated_at = utcnow()
    _add_event(
        db,
        ticket.id,
        actor_user_id=user.id,
        event_type="status",
        message=f"Статус: {old} → {new_status}",
        meta={"from": old, "to": new_status},
    )
    db.commit()
    db.refresh(ticket)
    write_audit(db, action="tickets.status", actor_user_id=user.id, resource=f"ticket:{ticket.id}", details=f"{old}->{new_status}")
    _notify_assignee(db, ticket, f"Статус заявки #{ticket.id} изменён: {old} → {new_status}")
    return ticket


def assign_ticket(
    db: Session,
    user: User,
    ticket_id: int,
    *,
    assignee_user_id: int | None = None,
    group_id: int | None = None,
) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise LookupError("Заявка не найдена")
    if not can_manage(user):
        raise PermissionError("Назначение доступно ticket_manager/admin")
    if assignee_user_id is not None and assignee_user_id != 0 and not db.get(User, assignee_user_id):
        raise ValueError("Исполнитель не найден")
    if group_id is not None and group_id != 0 and not db.get(Group, group_id):
        raise ValueError("Группа не найдена")

    if assignee_user_id is not None:
        ticket.assignee_user_id = None if assignee_user_id == 0 else assignee_user_id
    if group_id is not None:
        ticket.group_id = None if group_id == 0 else group_id
    ticket.updated_at = utcnow()
    _add_event(
        db,
        ticket.id,
        actor_user_id=user.id,
        event_type="assign",
        message=f"Назначение: user={ticket.assignee_user_id}, group={ticket.group_id}",
        meta={"assignee_user_id": ticket.assignee_user_id, "group_id": ticket.group_id},
    )
    db.commit()
    db.refresh(ticket)
    write_audit(db, action="tickets.assign", actor_user_id=user.id, resource=f"ticket:{ticket.id}")
    _notify_assignee(db, ticket, f"Вам назначена заявка #{ticket.id}: {ticket.title}")
    return ticket


def add_comment(db: Session, user: User, ticket_id: int, body: str) -> TicketComment:
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise LookupError("Заявка не найдена")
    if not can_view_ticket(user, ticket):
        raise PermissionError("Нет доступа")
    if not can_write(user) and ticket.assignee_user_id != user.id and ticket.created_by_id != user.id:
        raise PermissionError("Недостаточно прав для комментария")
    text = (body or "").strip()
    if not text:
        raise ValueError("Пустой комментарий")
    comment = TicketComment(ticket_id=ticket.id, author_user_id=user.id, body=text, created_at=utcnow())
    db.add(comment)
    ticket.updated_at = utcnow()
    _add_event(db, ticket.id, actor_user_id=user.id, event_type="comment", message="Добавлен комментарий")
    db.commit()
    db.refresh(comment)
    _notify_assignee(db, ticket, f"Новый комментарий в заявке #{ticket.id}")
    return comment


def save_sla_map(db: Session, mapping: dict[str, int], actor_user_id: int | None = None) -> dict[str, int]:
    cleaned: dict[str, int] = {}
    for k, v in (mapping or {}).items():
        try:
            cleaned[str(k).upper()] = max(1, int(v))
        except (TypeError, ValueError):
            continue
    merged = {**DEFAULT_SLA_HOURS, **cleaned}
    set_setting(db, "ticket_sla_hours_json", json.dumps(merged))
    if actor_user_id is not None:
        write_audit(db, action="tickets.sla_map", actor_user_id=actor_user_id, resource="sla")
    return merged


def _user_name(db: Session, user_id: int | None) -> str:
    if not user_id:
        return ""
    u = db.get(User, user_id)
    if not u:
        return ""
    return u.full_name or u.username


def _ticket_out(db: Session, t: Ticket) -> dict[str, Any]:
    group_name = ""
    if t.group_id:
        g = db.get(Group, t.group_id)
        group_name = g.name if g else ""
    due_iso = t.due_date.isoformat() if t.due_date else None
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "severity": t.severity,
        "status": t.status,
        "linked_cve_id": t.linked_cve_id,
        "linked_bdu_id": t.linked_bdu_id,
        "assignee_user_id": t.assignee_user_id,
        "assignee_name": _user_name(db, t.assignee_user_id),
        "group_id": t.group_id,
        "group_name": group_name,
        "created_by_id": t.created_by_id,
        "created_by_name": _user_name(db, t.created_by_id),
        "due_date": due_iso,
        "due_at": due_iso,
        "sla_hours": t.sla_hours,
        "overdue": is_overdue(t),
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }
