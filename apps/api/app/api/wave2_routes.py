"""Wave 2 routes: policies, jira, projects, org units, graph, reports, tags."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_permissions
from app.db import get_db
from app.models import Finding, Ticket, User
from app.schemas import (
    AlertPolicyCreateIn,
    AlertPolicyOut,
    FindingTagsBulkIn,
    JiraCreateIn,
    JiraSettingsIn,
    OrgUnitCreateIn,
    OrgUnitOut,
    ProjectCreateIn,
    ProjectOut,
    ReportGenerateIn,
    ReportTemplateOut,
    ReportTemplateSaveIn,
    UserOrgUnitsIn,
)
from app.services import alert_policies as policy_svc
from app.services import attack_path as graph_svc
from app.services import org_rbac
from app.services import projects as project_svc
from app.services import reports as report_svc
from app.services import ops_jobs as ops_svc
from app.services.auth_helpers import write_audit
from app.services.finding_risk import recompute_finding

router = APIRouter(tags=["wave2"])


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# --- risk recompute (static path before {finding_id}) ---


@router.post("/findings/recompute-risk")
def recompute_risk_bulk(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
    limit: int = Query(500, ge=1, le=5000),
) -> dict:
    from app.services.finding_risk import backfill_risk_scores

    n = backfill_risk_scores(db, limit=limit)
    write_audit(
        db,
        action="findings.recompute_risk",
        actor_user_id=user.id,
        resource="findings",
        details=f"updated={n}",
    )
    return {"updated": n}


@router.post("/findings/{finding_id}/recompute-risk")
def recompute_risk(
    finding_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:run")),
) -> dict:
    try:
        return recompute_finding(db, finding_id)
    except Exception as exc:
        raise _http(exc) from exc


# --- tags ---


@router.post("/findings/tags")
def bulk_tags(
    body: FindingTagsBulkIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> dict:
    n = project_svc.add_finding_tags(db, body.finding_ids, body.tags)
    write_audit(db, action="findings.tags", actor_user_id=user.id, resource="findings", details=f"n={n}")
    return {"updated": n}


# --- alert policies ---


@router.get("/alert-policies", response_model=list[AlertPolicyOut])
def list_policies(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("settings:write")),
) -> list[AlertPolicyOut]:
    return [AlertPolicyOut(**r) for r in policy_svc.list_policies(db)]


@router.post("/alert-policies", response_model=AlertPolicyOut)
def create_policy(
    body: AlertPolicyCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("settings:write")),
) -> AlertPolicyOut:
    row = policy_svc.create_policy(
        db,
        name=body.name,
        trigger=body.trigger,
        channels=body.channels,
        filters=body.filters,
        enabled=body.enabled,
    )
    write_audit(db, action="alert_policy.create", actor_user_id=user.id, resource=f"policy:{row['id']}")
    return AlertPolicyOut(**row)


@router.delete("/alert-policies/{policy_id}")
def delete_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("settings:write")),
) -> dict:
    try:
        policy_svc.delete_policy(db, policy_id)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(db, action="alert_policy.delete", actor_user_id=user.id, resource=f"policy:{policy_id}")
    return {"ok": True}


@router.post("/alerts/outbox/{alert_id}/retry")
def retry_outbox(
    alert_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("settings:write")),
) -> dict:
    try:
        return ops_svc.retry_alert(db, alert_id)
    except Exception as exc:
        raise _http(exc) from exc


# --- jira ---


@router.get("/settings/jira")
def get_jira(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("settings:write")),
) -> dict:
    return policy_svc.get_jira_settings(db)


@router.put("/settings/jira")
def put_jira(
    body: JiraSettingsIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("settings:write")),
) -> dict:
    data = policy_svc.save_jira_settings(db, body.model_dump(exclude_unset=True))
    write_audit(db, action="jira.settings", actor_user_id=user.id, resource="settings:jira")
    return data


@router.post("/integrations/jira/issues")
def create_jira(
    body: JiraCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> dict:
    try:
        result = policy_svc.create_jira_issue(db, summary=body.summary, description=body.description)
    except Exception as exc:
        raise _http(exc) from exc
    key = result.get("key") or ""
    if body.finding_id and key:
        f = db.get(Finding, body.finding_id)
        if f:
            f.external_ref = key
            db.commit()
    if body.ticket_id and key:
        t = db.get(Ticket, body.ticket_id)
        if t:
            t.external_ref = key
            db.commit()
    write_audit(
        db,
        action="jira.create",
        actor_user_id=user.id,
        resource=key or "jira",
        details=body.summary[:200],
    )
    return result


# --- projects ---


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> list[ProjectOut]:
    return [ProjectOut(**r) for r in project_svc.list_projects(db)]


@router.post("/projects", response_model=ProjectOut)
def create_project(
    body: ProjectCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> ProjectOut:
    try:
        row = project_svc.create_project(
            db,
            actor=user,
            name=body.name,
            description=body.description,
            org_unit_id=body.org_unit_id,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return ProjectOut(**row)


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> dict:
    try:
        project_svc.delete_project(db, project_id)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(db, action="project.delete", actor_user_id=user.id, resource=f"project:{project_id}")
    return {"ok": True}


# --- org units ---


@router.get("/org-units", response_model=list[OrgUnitOut])
def list_org_units(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("users:read")),
) -> list[OrgUnitOut]:
    return [OrgUnitOut(**r) for r in org_rbac.list_org_units(db)]


@router.post("/org-units", response_model=OrgUnitOut)
def create_org_unit(
    body: OrgUnitCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("users:write")),
) -> OrgUnitOut:
    try:
        row = org_rbac.create_org_unit(db, name=body.name, parent_id=body.parent_id)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(db, action="org_unit.create", actor_user_id=user.id, resource=f"org_unit:{row['id']}")
    return OrgUnitOut(**row)


@router.delete("/org-units/{unit_id}")
def delete_org_unit(
    unit_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("users:write")),
) -> dict:
    try:
        org_rbac.delete_org_unit(db, unit_id)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(db, action="org_unit.delete", actor_user_id=user.id, resource=f"org_unit:{unit_id}")
    return {"ok": True}


@router.put("/users/{user_id}/org-units")
def put_user_org_units(
    user_id: int,
    body: UserOrgUnitsIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permissions("users:write")),
) -> dict:
    ids = org_rbac.set_user_org_units(db, user_id, body.org_unit_ids)
    write_audit(db, action="user.org_units", actor_user_id=actor.id, resource=f"user:{user_id}")
    return {"user_id": user_id, "org_unit_ids": ids}


@router.get("/users/{user_id}/org-units")
def get_user_org_units(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("users:read")),
) -> dict:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": user_id, "org_unit_ids": sorted(org_rbac.user_org_unit_ids(db, u))}


# --- attack path ---


@router.get("/graph/attack-path")
def attack_path(
    asset_id: int | None = Query(None),
    finding_id: int | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> dict:
    try:
        return graph_svc.build_attack_path(db, asset_id=asset_id, finding_id=finding_id)
    except Exception as exc:
        raise _http(exc) from exc


# --- reports ---


@router.get("/report-templates", response_model=list[ReportTemplateOut])
def list_templates(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> list[ReportTemplateOut]:
    return [ReportTemplateOut(**r) for r in report_svc.list_templates(db)]


@router.post("/report-templates", response_model=ReportTemplateOut)
def save_template(
    body: ReportTemplateSaveIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> ReportTemplateOut:
    try:
        row = report_svc.save_template(
            db,
            actor=user,
            name=body.name,
            sections=body.sections,
            template_id=body.template_id,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return ReportTemplateOut(**row)


@router.delete("/report-templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> dict:
    try:
        report_svc.delete_template(db, template_id)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(db, action="report_template.delete", actor_user_id=user.id, resource=f"tpl:{template_id}")
    return {"ok": True}


@router.post("/reports/preview")
def preview_report(
    body: ReportGenerateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> dict:
    sections = body.sections
    if body.template_id and not sections:
        tpl = next((t for t in report_svc.list_templates(db) if t["id"] == body.template_id), None)
        sections = (tpl or {}).get("sections")
    html_doc = report_svc.render_html(
        db,
        sections=sections,
        project_id=body.project_id,
        scan_job_id=body.scan_job_id,
    )
    return {"html": html_doc}


@router.post("/reports/executive")
def executive_report(
    body: ReportGenerateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> Response:
    sections = body.sections
    if body.template_id and not sections:
        tpl = next((t for t in report_svc.list_templates(db) if t["id"] == body.template_id), None)
        sections = (tpl or {}).get("sections")
    html_doc = report_svc.render_html(
        db,
        sections=sections,
        project_id=body.project_id,
        scan_job_id=body.scan_job_id,
    )
    fmt = (body.format or "html").lower()
    if fmt == "pdf":
        try:
            data = report_svc.render_pdf_bytes(html_doc)
        except RuntimeError as exc:
            raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)) from exc
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=vbx-executive.pdf"},
        )
    return Response(
        content=html_doc.encode("utf-8"),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=vbx-executive.html"},
    )
