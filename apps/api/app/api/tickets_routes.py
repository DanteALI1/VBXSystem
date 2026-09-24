from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.db import get_db
from app.models import Group, User
from app.schemas import (
    MessageOut,
    TicketCommentOut,
    TicketCreateOut,
    TicketDetailOut,
    TicketListOut,
    TicketOut,
)
from app.services import tickets as ticket_svc

router = APIRouter(prefix="/tickets", tags=["tickets"])


class TicketCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    description: str = ""
    severity: str = "MEDIUM"
    linked_cve_id: str | None = None
    linked_bdu_id: str | None = None
    assignee_user_id: int | None = None
    group_id: int | None = None
    due_date: datetime | None = None


class StatusIn(BaseModel):
    status: str


class AssignIn(BaseModel):
    assignee_user_id: int | None = None
    group_id: int | None = None


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=TicketListOut)
def list_tickets(
    status: str | None = Query(None),
    assignee: str | None = Query(None),
    severity: str | None = Query(None),
    vuln: str | None = Query(None),
    group_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("tickets:read")),
) -> TicketListOut:
    try:
        data = ticket_svc.list_tickets(
            db,
            user,
            status=status,
            assignee=assignee,
            severity=severity,
            vuln=vuln,
            group_id=group_id,
            page=page,
            page_size=page_size,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return TicketListOut(**data)


@router.post("", response_model=TicketCreateOut)
def create_ticket(
    payload: TicketCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("tickets:write")),
) -> TicketCreateOut:
    try:
        ticket, warning = ticket_svc.create_ticket(
            db,
            actor=user,
            title=payload.title,
            description=payload.description,
            severity=payload.severity,
            linked_cve_id=payload.linked_cve_id,
            linked_bdu_id=payload.linked_bdu_id,
            assignee_user_id=payload.assignee_user_id,
            group_id=payload.group_id,
            due_date=payload.due_date,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return TicketCreateOut(ticket=TicketOut(**ticket_svc._ticket_out(db, ticket)), warning=warning)


@router.get("/meta/groups", response_model=list[dict])
def ticket_groups(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("tickets:read")),
) -> list[dict]:
    rows = db.query(Group).order_by(Group.name).all()
    return [{"id": g.id, "name": g.name, "source": g.source} for g in rows]


@router.get("/{ticket_id}", response_model=TicketDetailOut)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("tickets:read")),
) -> TicketDetailOut:
    try:
        data = ticket_svc.get_ticket(db, user, ticket_id)
    except Exception as exc:
        raise _http(exc) from exc
    return TicketDetailOut(**data)


@router.post("/{ticket_id}/status", response_model=TicketOut)
def set_status(
    ticket_id: int,
    payload: StatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TicketOut:
    try:
        ticket = ticket_svc.transition_status(db, user, ticket_id, payload.status)
    except Exception as exc:
        raise _http(exc) from exc
    return TicketOut(**ticket_svc._ticket_out(db, ticket))


@router.post("/{ticket_id}/assign", response_model=TicketOut)
def assign(
    ticket_id: int,
    payload: AssignIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("tickets:manage")),
) -> TicketOut:
    try:
        ticket = ticket_svc.assign_ticket(
            db,
            user,
            ticket_id,
            assignee_user_id=payload.assignee_user_id,
            group_id=payload.group_id,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return TicketOut(**ticket_svc._ticket_out(db, ticket))


@router.post("/{ticket_id}/comments", response_model=TicketCommentOut)
def comment(
    ticket_id: int,
    payload: CommentIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TicketCommentOut:
    try:
        c = ticket_svc.add_comment(db, user, ticket_id, payload.body)
    except Exception as exc:
        raise _http(exc) from exc
    return TicketCommentOut(
        id=c.id,
        author_user_id=c.author_user_id,
        author_name=ticket_svc._user_name(db, c.author_user_id),
        body=c.body,
        created_at=c.created_at.isoformat() if c.created_at else None,
    )
