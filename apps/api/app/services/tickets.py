"""Ticket domain: lifecycle, permissions, notifications hooks."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import user_permissions
from app.models import (
    Group,
    NotificationPreference,
    Ticket,
    TicketComment,
    TicketEvent,
    User,
    utcnow,
)
from app.services.auth_helpers import get_setting, write_audit
from app.services.crypto_secrets import decrypt_secret
from app.services.smtp_service import send_smtp_message

STATUSES = ("new", "in_progress", "waiting", "resolved", "closed")

TRANSITIONS: dict[str, set[str]] = {
    "new": {"in_progress", "waiting", "closed"},
    "in_progress": {"waiting", "resolved", "closed"},
    "waiting": {"in_progress", "resolved", "closed"},
    "resolved": {"closed", "in_progress"},
    "closed": {"in_progress"},  # reopen — manage only
}


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

    ticket = Ticket(
        title=(title or "").strip() or "Без названия",
        description=description or "",
        severity=(severity or "MEDIUM").upper(),
        status="new",
        linked_cve_id=linked_cve_id,
        linked_bdu_id=linked_bdu_id,
        assignee_user_id=assignee_user_id,
        group_id=group_id,
        created_by_id=actor.id,
        due_date=due_date,
        created_at=utcnow(),
        updated_at=utcnow(),
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
    total = q.count()
    rows = q.order_by(Ticket.updated_at.desc(), Ticket.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "results": [_ticket_out(db, t) for t in rows]}


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
    if new_status == "closed" and not can_manage(user) and ticket.created_by_id != user.id and ticket.assignee_user_id != user.id:
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
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }
