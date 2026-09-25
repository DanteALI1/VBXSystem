"""Scanner module API: registry, jobs, findings ingest."""

from __future__ import annotations

import hashlib
import os
import threading

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import require_permissions
from app.core.config import get_settings
from app.core.rate_limit import rate_limit
from app.db import SessionLocal, get_db
from app.models import User
from app.schemas import (
    AssetCreateIn,
    AssetDeleteOut,
    AssetDetailOut,
    AssetListOut,
    AssetMergeIn,
    AssetMergeOut,
    AssetOut,
    AssetOwnerOptionOut,
    AssetOwnersOut,
    AssetPromoteOut,
    AssetTagsOut,
    AssetUpdateIn,
    FindingListOut,
    FindingOut,
    FindingTicketOut,
    ModuleListOut,
    ModuleOut,
    ModuleRegisterIn,
    ModuleRegisterOut,
    ModuleScanStatsOut,
    ModuleSettingsOut,
    ModuleSettingsUpdate,
    ModuleShodanKeyOut,
    ModuleWorkerConfigOut,
    NucleiTagOut,
    NucleiTemplateOut,
    NucleiTemplatesListOut,
    NucleiTemplatesStatusOut,
    NucleiTemplatesSyncOut,
    NucleiTemplatesUploadOut,
    ScanCredentialCreateIn,
    ScanCredentialDeleteOut,
    ScanCredentialInternalOut,
    ScanCredentialListOut,
    ScanCredentialOut,
    ScanCredentialUpdateIn,
    ScanEnqueueIn,
    ScanJobClaimIn,
    ScanJobClaimOut,
    ScanJobHeartbeatIn,
    ScanJobListOut,
    ScanJobOut,
    ScanJobResultsIn,
    ScanJobResultsOut,
)
from app.services import artifacts as artifacts_svc
from app.services import modules as module_svc
from app.services import nuclei_templates as nuclei_tpl
from app.services import scan_credentials as cred_svc
from app.services import tickets as ticket_svc
from app.services.auth_helpers import write_audit
from app.services.csv_export import dicts_to_csv
from app.services.sync_jobs import enqueue_sync, process_sync_run

router = APIRouter(tags=["modules"])

# Internal module endpoints: 120 req/min per token fingerprint + IP (fail-open if Redis down).
_MODULE_RL_LIMIT = 120
_MODULE_RL_WINDOW = 60


def _module_rl_limit() -> int:
    """High limit under pytest / VBX_MODULE_RATE_LIMIT override so tests stay stable."""
    raw = os.environ.get("VBX_MODULE_RATE_LIMIT", "").strip()
    if raw.isdigit():
        return max(1, int(raw))
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return 10_000
    if get_settings().vbx_profile.strip().lower() in {"test", "dev"}:
        return max(_MODULE_RL_LIMIT, 600)
    return _MODULE_RL_LIMIT


def _module_rate_limit(request: Request, token: str) -> None:
    digest = hashlib.sha256((token or "").encode("utf-8")).hexdigest()[:16] or "none"
    rate_limit(
        request,
        f"modules:{digest}",
        limit=_module_rl_limit(),
        window=_MODULE_RL_WINDOW,
    )


def require_module_token(
    request: Request,
    db: Session = Depends(get_db),
    x_module_token: str | None = Header(default=None, alias="X-Module-Token"),
    x_module_id: str | None = Header(default=None, alias="X-Module-Id"),
) -> str | None:
    """Accept shared VBX_MODULE_TOKEN or a per-module token (optional X-Module-Id scope)."""
    provided = (x_module_token or "").strip()
    mid = (x_module_id or "").strip().lower() or None
    shared = module_svc.shared_module_token()
    has_any_per = bool(module_svc.list_module_token_status(db)) or any(
        module_svc.get_module_token_plain(db, k) for k in ("nmap", "shodan", "zap", "nuclei", "gowitness")
    )
    if not shared and not has_any_per:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VBX_MODULE_TOKEN is not configured",
        )
    if not module_svc.verify_module_token(db, provided, module_id=mid):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid module token")
    _module_rate_limit(request, provided)
    return mid


def _enforce_module_scope(db: Session, token: str | None, module_id: str) -> None:
    """When a per-module token is used, it must match ``module_id`` (shared always ok)."""
    provided = (token or "").strip()
    mid = (module_id or "").strip().lower()
    if not mid:
        raise HTTPException(status_code=400, detail="module_id required")
    shared = module_svc.shared_module_token()
    if shared and module_svc.token_matches(provided, shared):
        return
    if not module_svc.verify_module_token(db, provided, module_id=mid):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Token not authorized for module «{mid}»",
        )


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


@router.get("/modules", response_model=ModuleListOut)
def list_modules(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> ModuleListOut:
    return ModuleListOut(modules=[ModuleOut(**m) for m in module_svc.list_modules(db)])


@router.get("/settings/modules", response_model=ModuleSettingsOut)
def get_module_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:admin")),
) -> ModuleSettingsOut:
    return ModuleSettingsOut(**module_svc.get_module_admin_settings(db))


@router.get("/modules/nuclei/templates", response_model=NucleiTemplatesListOut)
def list_nuclei_templates(
    q: str | None = Query(None),
    tag: str | None = Query(None),
    source: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(require_permissions("scan:read")),
) -> NucleiTemplatesListOut:
    data = nuclei_tpl.list_catalog(q=q, tag=tag, source=source, page=page, page_size=page_size)
    return NucleiTemplatesListOut(
        tags=[NucleiTagOut(**t) for t in data.get("tags") or []],
        templates=[NucleiTemplateOut(**t) for t in data.get("templates") or []],
        total=int(data.get("total") or 0),
        page=int(data.get("page") or 1),
        page_size=int(data.get("page_size") or 50),
        q=str(data.get("q") or ""),
        official_count=int(data.get("official_count") or 0),
        custom_count=int(data.get("custom_count") or 0),
        template_count=int(data.get("template_count") or 0),
        built_at=data.get("built_at"),
    )


@router.get("/modules/nuclei/templates/status", response_model=NucleiTemplatesStatusOut)
def nuclei_templates_status(
    _: User = Depends(require_permissions("scan:read")),
) -> NucleiTemplatesStatusOut:
    return NucleiTemplatesStatusOut(**nuclei_tpl.get_status())


@router.post("/settings/modules/nuclei/templates/sync", response_model=NucleiTemplatesSyncOut)
def sync_nuclei_templates(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:admin")),
) -> NucleiTemplatesSyncOut:
    """Enqueue sync_jobs ``nuclei_templates_sync`` and process in a background thread."""
    run = enqueue_sync(db, "nuclei_templates_sync", created_by=user.id)
    run_id = int(run.id)

    def _bg() -> None:
        session = SessionLocal()
        try:
            process_sync_run(session, run_id)
        except Exception:
            pass
        finally:
            session.close()

    threading.Thread(target=_bg, name=f"nuclei-sync-{run_id}", daemon=True).start()
    write_audit(
        db,
        action="modules.nuclei.templates.sync",
        actor_user_id=user.id,
        resource="nuclei_templates",
        details=f"run_id={run_id}",
    )
    return NucleiTemplatesSyncOut(
        message="Синхронизация шаблонов nuclei запущена",
        run_id=run_id,
        started=True,
        status=NucleiTemplatesStatusOut(**nuclei_tpl.get_status()),
    )


@router.post("/modules/nuclei/templates/custom", response_model=NucleiTemplatesUploadOut)
async def upload_nuclei_custom_templates(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:admin")),
) -> NucleiTemplatesUploadOut:
    if not files:
        raise HTTPException(status_code=400, detail="Нет файлов")
    max_bytes = get_settings().vbx_max_nuclei_template_bytes
    payloads: list[tuple[str, bytes]] = []
    for f in files:
        raw = await f.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Файл «{f.filename}» превышает лимит {max_bytes // 1024} КБ",
            )
        payloads.append((f.filename or "upload.yaml", raw))
    result = nuclei_tpl.save_custom_uploads(payloads)
    write_audit(
        db,
        action="modules.nuclei.templates.custom_upload",
        actor_user_id=user.id,
        resource="nuclei_custom",
        details=f"saved={result.get('saved')} rejected={result.get('rejected')}",
    )
    return NucleiTemplatesUploadOut(
        message=f"Загружено: {len(result.get('saved') or [])}",
        saved=list(result.get("saved") or []),
        rejected=list(result.get("rejected") or []),
        custom_count=int(result.get("custom_count") or 0),
        template_count=int(result.get("template_count") or 0),
        custom_path=str(result.get("custom_path") or ""),
    )


@router.put("/settings/modules", response_model=ModuleSettingsOut)
def put_module_settings(
    body: ModuleSettingsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:admin")),
) -> ModuleSettingsOut:
    data = module_svc.update_module_admin_settings(
        db,
        disabled_modules=body.disabled_modules,
        allowlist=body.allowlist,
        shodan_api_key=body.shodan_api_key,
        clear_shodan_api_key=body.clear_shodan_api_key,
        shodan_mock=body.shodan_mock,
        shodan_modes_enabled=body.shodan_modes_enabled,
        shodan_rate_limit_hint=body.shodan_rate_limit_hint,
        module_tokens=body.module_tokens,
        clear_module_tokens=body.clear_module_tokens,
        nmap_default_ports=body.nmap_default_ports,
        nmap_default_profile=body.nmap_default_profile,
        nmap_default_timing=body.nmap_default_timing,
        nmap_default_sv=body.nmap_default_sv,
        nmap_default_os=body.nmap_default_os,
        nmap_default_aggressive=body.nmap_default_aggressive,
        nmap_default_scripts=body.nmap_default_scripts,
        nmap_default_top_ports=body.nmap_default_top_ports,
        nmap_default_exclude=body.nmap_default_exclude,
        zap_timeout_sec=body.zap_timeout_sec,
        zap_default_scan_type=body.zap_default_scan_type,
        zap_default_ajax_spider=body.zap_default_ajax_spider,
        zap_default_context_name=body.zap_default_context_name,
        zap_default_context_user=body.zap_default_context_user,
        zap_default_credential_id=body.zap_default_credential_id,
        clear_zap_default_credential=body.clear_zap_default_credential,
        nuclei_default_templates=body.nuclei_default_templates,
        nuclei_rate_limit=body.nuclei_rate_limit,
        gowitness_timeout_sec=body.gowitness_timeout_sec,
        gowitness_default_resolution=body.gowitness_default_resolution,
        gowitness_default_fullpage=body.gowitness_default_fullpage,
    )
    write_audit(
        db,
        action="modules.settings.update",
        actor_user_id=user.id,
        resource="scan_modules",
        details=f"disabled={data.get('disabled_modules')}",
    )
    return ModuleSettingsOut(**data)


@router.get("/internal/modules/config", response_model=ModuleWorkerConfigOut)
def worker_module_config(
    db: Session = Depends(get_db),
    _: str | None = Depends(require_module_token),
) -> ModuleWorkerConfigOut:
    return ModuleWorkerConfigOut(**module_svc.get_worker_runtime_config(db))


@router.post("/internal/modules/shodan/api-key", response_model=ModuleShodanKeyOut)
def worker_fetch_shodan_api_key(
    db: Session = Depends(get_db),
    _: str | None = Depends(require_module_token),
    x_module_token: str | None = Header(default=None, alias="X-Module-Token"),
    x_module_id: str | None = Header(default=None, alias="X-Module-Id"),
) -> ModuleShodanKeyOut:
    """Shodan worker only: fetch API key once into worker memory (not via GET config)."""
    mid = (x_module_id or "").strip().lower() or "shodan"
    if mid != "shodan":
        raise HTTPException(status_code=403, detail="Only the shodan module may fetch this secret")
    _enforce_module_scope(db, x_module_token, "shodan")
    key = module_svc.resolve_shodan_api_key(db)
    return ModuleShodanKeyOut(shodan_api_key=key, shodan_api_key_set=bool(key))


@router.get("/settings/scan-credentials", response_model=ScanCredentialListOut)
def list_scan_credentials(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:admin")),
) -> ScanCredentialListOut:
    return ScanCredentialListOut(
        credentials=[ScanCredentialOut(**c) for c in cred_svc.list_credentials(db)]
    )


@router.post("/settings/scan-credentials", response_model=ScanCredentialOut)
def create_scan_credential(
    body: ScanCredentialCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:admin")),
) -> ScanCredentialOut:
    try:
        data = cred_svc.create_credential(
            db,
            name=body.name,
            kind=body.kind,
            username=body.username,
            password=body.password,
            extra=body.extra,
        )
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="scan_credentials.create",
        actor_user_id=user.id,
        resource=f"scan_credential:{data.get('id')}",
        details=f"name={body.name} kind={body.kind}",
    )
    return ScanCredentialOut(**data)


@router.patch("/settings/scan-credentials/{credential_id}", response_model=ScanCredentialOut)
def patch_scan_credential(
    credential_id: int,
    body: ScanCredentialUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:admin")),
) -> ScanCredentialOut:
    try:
        data = cred_svc.update_credential(
            db,
            credential_id,
            name=body.name,
            kind=body.kind,
            username=body.username,
            password=body.password,
            clear_password=body.clear_password,
            extra=body.extra,
        )
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="scan_credentials.update",
        actor_user_id=user.id,
        resource=f"scan_credential:{credential_id}",
        details=str(body.model_dump(exclude_unset=True, exclude={"password"})),
    )
    return ScanCredentialOut(**data)


@router.delete("/settings/scan-credentials/{credential_id}", response_model=ScanCredentialDeleteOut)
def delete_scan_credential(
    credential_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:admin")),
) -> ScanCredentialDeleteOut:
    try:
        data = cred_svc.delete_credential(db, credential_id)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="scan_credentials.delete",
        actor_user_id=user.id,
        resource=f"scan_credential:{credential_id}",
        details="",
    )
    return ScanCredentialDeleteOut(
        deleted=True,
        credential=ScanCredentialOut(**data["credential"]) if data.get("credential") else None,
    )


@router.get("/internal/modules/credentials/{credential_id}", response_model=ScanCredentialInternalOut)
def worker_get_credential(
    credential_id: int,
    db: Session = Depends(get_db),
    _: str | None = Depends(require_module_token),
) -> ScanCredentialInternalOut:
    try:
        row = cred_svc.get_credential(db, credential_id)
    except Exception as exc:
        raise _http(exc) from exc
    return ScanCredentialInternalOut(**cred_svc.credential_internal(row))


@router.get("/modules/jobs", response_model=ScanJobListOut)
def list_jobs(
    module_id: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> ScanJobListOut:
    data = module_svc.list_jobs(
        db,
        module_id=module_id,
        status=status_filter,
        page=page,
        page_size=page_size,
    )
    return ScanJobListOut(**data)


@router.get("/modules/stats", response_model=ModuleScanStatsOut)
def modules_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> ModuleScanStatsOut:
    return ModuleScanStatsOut(**module_svc.get_scan_stats(db))


@router.get("/modules/jobs/export")
def jobs_export_csv(
    module_id: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(2000, ge=1, le=5000),
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
):
    results = module_svc.export_jobs_rows(
        db, module_id=module_id, status=status_filter, limit=limit
    )
    headers = (
        "id",
        "module_id",
        "status",
        "target",
        "ports",
        "error",
        "created_by",
        "created_at",
        "started_at",
        "finished_at",
    )
    rows = []
    for r in results:
        params = r.get("params") or {}
        target = params.get("target") or params.get("host") or params.get("ip") or params.get("hostname") or ""
        ports = params.get("ports")
        if isinstance(ports, list):
            ports = ",".join(str(p) for p in ports)
        rows.append(
            {
                "id": r.get("id"),
                "module_id": r.get("module_id"),
                "status": r.get("status"),
                "target": target,
                "ports": ports or "",
                "error": r.get("error") or "",
                "created_by": r.get("created_by") or "",
                "created_at": r.get("created_at") or "",
                "started_at": r.get("started_at") or "",
                "finished_at": r.get("finished_at") or "",
            }
        )
    csv_text = dicts_to_csv(headers, rows)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="scan-jobs-export.csv"'},
    )


@router.get("/modules/jobs/{job_id}", response_model=ScanJobOut)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> ScanJobOut:
    try:
        job = module_svc.get_job(db, job_id)
    except Exception as exc:
        raise _http(exc) from exc
    return ScanJobOut(**module_svc._job_out(job))


@router.post("/modules/jobs/{job_id}/cancel", response_model=ScanJobOut)
def cancel_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> ScanJobOut:
    try:
        job = module_svc.cancel_job(db, job_id, actor=user)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="modules.job.cancel",
        actor_user_id=user.id,
        resource=f"scan_job:{job_id}",
        details=f"status={job.status}",
    )
    return ScanJobOut(**module_svc._job_out(job))


@router.post("/internal/modules/register", response_model=ModuleRegisterOut)
def register_module(
    body: ModuleRegisterIn,
    db: Session = Depends(get_db),
    _: str | None = Depends(require_module_token),
    x_module_token: str | None = Header(default=None, alias="X-Module-Token"),
) -> ModuleRegisterOut:
    _enforce_module_scope(db, x_module_token, body.id)
    try:
        row = module_svc.register_module(
            db,
            module_id=body.id,
            version=body.version,
            capabilities=body.capabilities,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return ModuleRegisterOut(
        id=row.id,
        version=row.version,
        capabilities=module_svc._json_loads(row.capabilities_json, []),
        message="registered",
    )


@router.post("/modules/{module_id}/jobs", response_model=ScanJobOut)
def enqueue_job(
    module_id: str,
    body: ScanEnqueueIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> ScanJobOut:
    try:
        job = module_svc.enqueue_scan(db, module_id=module_id, actor=user, params=body.params)
    except Exception as exc:
        raise _http(exc) from exc
    return ScanJobOut(**module_svc._job_out(job))


@router.post("/internal/modules/jobs/claim", response_model=ScanJobClaimOut)
def claim_job(
    body: ScanJobClaimIn,
    db: Session = Depends(get_db),
    _: str | None = Depends(require_module_token),
    x_module_token: str | None = Header(default=None, alias="X-Module-Token"),
) -> ScanJobClaimOut:
    _enforce_module_scope(db, x_module_token, body.module_id)
    try:
        job = module_svc.claim_next_job(
            db, module_id=body.module_id, lease_owner=body.lease_owner
        )
    except Exception as exc:
        raise _http(exc) from exc
    if not job:
        return ScanJobClaimOut(job=None, message="no jobs")
    return ScanJobClaimOut(job=ScanJobOut(**module_svc._job_out(job)), message="claimed")


@router.post("/internal/modules/jobs/{job_id}/heartbeat", response_model=ScanJobOut)
def job_heartbeat(
    job_id: int,
    body: ScanJobHeartbeatIn,
    db: Session = Depends(get_db),
    _: str | None = Depends(require_module_token),
    x_module_token: str | None = Header(default=None, alias="X-Module-Token"),
) -> ScanJobOut:
    try:
        existing = module_svc.get_job(db, job_id)
        _enforce_module_scope(db, x_module_token, existing.module_id)
        job = module_svc.heartbeat_job(
            db,
            job_id=job_id,
            lease_owner=body.lease_owner,
            progress=body.progress,
            error=body.error,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return ScanJobOut(**module_svc._job_out(job))


@router.post("/internal/modules/jobs/{job_id}/results", response_model=ScanJobResultsOut)
def job_results(
    job_id: int,
    body: ScanJobResultsIn,
    db: Session = Depends(get_db),
    _: str | None = Depends(require_module_token),
    x_module_token: str | None = Header(default=None, alias="X-Module-Token"),
) -> ScanJobResultsOut:
    try:
        existing = module_svc.get_job(db, job_id)
        _enforce_module_scope(db, x_module_token, existing.module_id)
        data = module_svc.ingest_results(
            db,
            job_id=job_id,
            findings=body.findings,
            status=body.status,
            error=body.error or "",
            progress=body.progress,
            lease_owner=body.lease_owner,
        )
    except Exception as exc:
        raise _http(exc) from exc
    return ScanJobResultsOut(
        job=ScanJobOut(**data["job"]),
        created=int(data.get("created") or 0),
        updated=int(data.get("updated") or 0),
        findings=[FindingOut(**f) for f in data["findings"]],
        tickets_created=int(data.get("tickets_created") or 0),
        skipped_offlist=int(data.get("skipped_offlist") or 0),
        ignored=bool(data.get("ignored")),
        message=str(data.get("message") or ""),
    )


@router.get("/findings", response_model=FindingListOut)
def list_findings(
    module_id: str | None = Query(None),
    scan_job_id: int | None = Query(None),
    asset_id: int | None = Query(None),
    severity: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    priority: str | None = Query(None),
    project_id: int | None = Query(None),
    tag: str | None = Query(None),
    overdue: bool | None = Query(None),
    min_risk: int | None = Query(None),
    risk_min: int | None = Query(None, description="Alias for min_risk"),
    sort: str | None = Query(None),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:read")),
) -> FindingListOut:
    data = module_svc.list_findings(
        db,
        module_id=module_id,
        scan_job_id=scan_job_id,
        asset_id=asset_id,
        severity=severity,
        status=status_filter,
        priority=priority,
        project_id=project_id,
        tag=tag,
        overdue=overdue,
        min_risk=min_risk if min_risk is not None else risk_min,
        sort=sort,
        q=q,
        page=page,
        page_size=page_size,
        rbac_user=user,
    )
    return FindingListOut(**data)


@router.get("/findings/export")
def findings_export_csv(
    module_id: str | None = Query(None),
    scan_job_id: int | None = Query(None),
    asset_id: int | None = Query(None),
    severity: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    priority: str | None = Query(None),
    project_id: int | None = Query(None),
    tag: str | None = Query(None),
    overdue: bool | None = Query(None),
    min_risk: int | None = Query(None),
    risk_min: int | None = Query(None),
    q: str | None = Query(None),
    limit: int = Query(2000, ge=1, le=5000),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:read")),
):
    results = module_svc.export_findings_rows(
        db,
        module_id=module_id,
        scan_job_id=scan_job_id,
        asset_id=asset_id,
        severity=severity,
        status=status_filter,
        priority=priority,
        project_id=project_id,
        tag=tag,
        overdue=overdue,
        min_risk=min_risk if min_risk is not None else risk_min,
        q=q,
        limit=limit,
        rbac_user=user,
    )
    headers = (
        "id",
        "title",
        "severity",
        "status",
        "priority",
        "risk_score",
        "due_at",
        "module_id",
        "scan_job_id",
        "asset_id",
        "asset_hostname",
        "asset_ip",
        "linked_cve_ids",
        "linked_bdu_ids",
        "ticket_id",
        "tags",
        "fingerprint",
        "occurrence_count",
        "last_seen_at",
        "created_at",
    )
    rows = []
    for r in results:
        rows.append(
            {
                "id": r.get("id"),
                "title": r.get("title") or "",
                "severity": r.get("severity") or "",
                "status": r.get("status") or "",
                "priority": r.get("priority") or "",
                "risk_score": r.get("risk_score") or 0,
                "due_at": r.get("due_at") or "",
                "module_id": r.get("module_id") or "",
                "scan_job_id": r.get("scan_job_id") or "",
                "asset_id": r.get("asset_id") or "",
                "asset_hostname": r.get("asset_hostname") or "",
                "asset_ip": r.get("asset_ip") or "",
                "linked_cve_ids": ";".join(r.get("linked_cve_ids") or []),
                "linked_bdu_ids": ";".join(r.get("linked_bdu_ids") or []),
                "ticket_id": r.get("ticket_id") or "",
                "tags": ";".join(r.get("tags") or []),
                "fingerprint": r.get("fingerprint") or "",
                "occurrence_count": r.get("occurrence_count") or 1,
                "last_seen_at": r.get("last_seen_at") or "",
                "created_at": r.get("created_at") or "",
            }
        )
    csv_body = dicts_to_csv(headers, rows)
    return StreamingResponse(
        iter([csv_body]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="findings-export.csv"'},
    )


@router.get("/findings/{finding_id}", response_model=FindingOut)
def get_finding(
    finding_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:read")),
) -> FindingOut:
    try:
        finding = module_svc.get_finding(db, finding_id)
        from app.services import org_rbac

        org_rbac.assert_finding_visible(db, user, finding)
        data = module_svc.finding_detail(db, finding_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return FindingOut(**data)


@router.get("/findings/{finding_id}/artifacts/{artifact_key:path}")
def get_finding_artifact(
    finding_id: int,
    artifact_key: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
):
    """Stream an evidence file belonging to a finding (path-traversal safe)."""
    try:
        finding = module_svc.get_finding(db, finding_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    try:
        key = artifacts_svc.sanitize_artifact_key(artifact_key)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    allowed = module_svc.finding_artifact_keys(finding)
    if key not in allowed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    try:
        path = artifacts_svc.resolve_artifact_path(key)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact file missing")
    return FileResponse(
        path,
        media_type=artifacts_svc.guess_media_type(path),
        filename=path.name,
    )


@router.get("/artifacts/{artifact_key:path}")
def get_artifact(
    artifact_key: str,
    _: User = Depends(require_permissions("scan:read")),
):
    """Stream a file under VBX_ARTIFACTS_DIR (scan:read)."""
    try:
        key = artifacts_svc.sanitize_artifact_key(artifact_key)
        path = artifacts_svc.resolve_artifact_path(key)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    return FileResponse(
        path,
        media_type=artifacts_svc.guess_media_type(path),
        filename=path.name,
    )


@router.get("/assets", response_model=AssetListOut)
def list_assets(
    q: str | None = Query(None),
    segment: str | None = Query(None),
    owner_user_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:read")),
) -> AssetListOut:
    return AssetListOut(
        **module_svc.list_assets(
            db,
            q=q,
            segment=segment,
            owner_user_id=owner_user_id,
            page=page,
            page_size=page_size,
            rbac_user=user,
        )
    )


@router.get("/assets/tags", response_model=AssetTagsOut)
def assets_tags_taxonomy(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> AssetTagsOut:
    """Suggested tags taxonomy from system_settings."""
    return AssetTagsOut(tags=module_svc.get_assets_tags_taxonomy(db))


@router.get("/assets/owners", response_model=AssetOwnersOut)
def assets_owner_options(
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
) -> AssetOwnersOut:
    """Active users available as asset owners (lightweight for UI selects)."""
    return AssetOwnersOut(
        owners=[AssetOwnerOptionOut(**o) for o in module_svc.list_asset_owner_options(db)]
    )


@router.post("/assets", response_model=AssetOut)
def create_asset(
    body: AssetCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> AssetOut:
    """Manual inventory create. Permission: scan:run (operators/analysts)."""
    try:
        data = module_svc.create_asset(
            db,
            hostname=body.hostname,
            ip=body.ip,
            ports=body.ports,
            tags=body.tags,
            kind=body.kind,
            segment=body.segment,
            owner_user_id=body.owner_user_id,
            criticality=body.criticality,
            org_unit_id=body.org_unit_id,
        )
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="asset.create",
        actor_user_id=user.id,
        resource=f"asset:{data.get('id')}",
        details=f"hostname={body.hostname} ip={body.ip} segment={body.segment}",
    )
    return AssetOut(**data)


@router.get("/assets/export")
def assets_export_csv(
    q: str | None = Query(None),
    segment: str | None = Query(None),
    owner_user_id: int | None = Query(None),
    limit: int = Query(2000, ge=1, le=5000),
    db: Session = Depends(get_db),
    _: User = Depends(require_permissions("scan:read")),
):
    results = module_svc.export_assets_rows(
        db, q=q, segment=segment, owner_user_id=owner_user_id, limit=limit
    )
    headers = (
        "id",
        "label",
        "hostname",
        "ip",
        "kind",
        "segment",
        "owner_user_id",
        "owner_username",
        "ports",
        "tags",
        "findings_count",
        "last_seen_at",
        "created_at",
    )
    rows = []
    for r in results:
        ports = r.get("ports") or []
        if isinstance(ports, list):
            port_str = ";".join(
                str(p.get("port") if isinstance(p, dict) and "port" in p else p) for p in ports
            )
        else:
            port_str = str(ports)
        tags = r.get("tags") or []
        tag_str = ";".join(str(t) for t in tags) if isinstance(tags, list) else str(tags)
        rows.append(
            {
                "id": r.get("id"),
                "label": r.get("label") or "",
                "hostname": r.get("hostname") or "",
                "ip": r.get("ip") or "",
                "kind": r.get("kind") or "",
                "segment": r.get("segment") or "",
                "owner_user_id": r.get("owner_user_id") or "",
                "owner_username": r.get("owner_username") or "",
                "ports": port_str,
                "tags": tag_str,
                "findings_count": r.get("findings_count") or 0,
                "last_seen_at": r.get("last_seen_at") or "",
                "created_at": r.get("created_at") or "",
            }
        )
    csv_text = dicts_to_csv(headers, rows)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="assets-export.csv"'},
    )


@router.get("/assets/{asset_id}", response_model=AssetDetailOut)
def get_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:read")),
) -> AssetDetailOut:
    try:
        from app.services import org_rbac
        from app.models import Asset

        row = db.get(Asset, asset_id)
        if not row:
            raise LookupError("Asset not found")
        org_rbac.assert_asset_visible(db, user, row)
        data = module_svc.get_asset(db, asset_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return AssetDetailOut(
        asset=AssetOut(**data["asset"]),
        findings=[FindingOut(**f) for f in data["findings"]],
    )


@router.patch("/assets/{asset_id}", response_model=AssetOut)
def update_asset(
    asset_id: int,
    body: AssetUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> AssetOut:
    """Update inventory asset. Permission: scan:run."""
    patch = body.model_dump(exclude_unset=True)
    clear_owner = "owner_user_id" in patch and patch["owner_user_id"] is None
    clear_org = bool(patch.pop("clear_org_unit", False))
    try:
        data = module_svc.update_asset(
            db,
            asset_id,
            hostname=patch.get("hostname"),
            ip=patch.get("ip"),
            ports=patch.get("ports"),
            tags=patch.get("tags"),
            kind=patch.get("kind"),
            segment=patch.get("segment"),
            criticality=patch.get("criticality"),
            org_unit_id=patch.get("org_unit_id") if not clear_org else None,
            clear_org_unit=clear_org,
            owner_user_id=patch.get("owner_user_id") if not clear_owner else None,
            clear_owner=clear_owner,
        )
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="asset.update",
        actor_user_id=user.id,
        resource=f"asset:{asset_id}",
        details=str(patch),
    )
    return AssetOut(**data)


@router.post("/assets/{asset_id}/merge", response_model=AssetMergeOut)
def merge_asset(
    asset_id: int,
    body: AssetMergeIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> AssetMergeOut:
    """Merge source asset into target: move findings, union ports/tags, delete source."""
    try:
        data = module_svc.merge_assets(db, asset_id, body.into_asset_id)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="asset.merge",
        actor_user_id=user.id,
        resource=f"asset:{asset_id}",
        details=f"into={body.into_asset_id} moved={data.get('moved_findings')}",
    )
    return AssetMergeOut(
        source_asset_id=int(data["source_asset_id"]),
        target=AssetOut(**data["target"]),
        moved_findings=int(data.get("moved_findings") or 0),
        message=str(data.get("message") or ""),
    )


@router.delete("/assets/{asset_id}", response_model=AssetDeleteOut)
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> AssetDeleteOut:
    """Delete asset; findings stay, asset_id unlinked (NULL). Permission: scan:run."""
    try:
        data = module_svc.delete_asset(db, asset_id)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="asset.delete",
        actor_user_id=user.id,
        resource=f"asset:{asset_id}",
        details=f"unlinked={data.get('unlinked_findings')}",
    )
    return AssetDeleteOut(
        deleted=True,
        asset_id=asset_id,
        unlinked_findings=int(data.get("unlinked_findings") or 0),
        asset=AssetOut(**data["asset"]) if data.get("asset") else None,
    )


@router.post("/findings/{finding_id}/promote-asset", response_model=AssetPromoteOut)
def promote_finding_asset(
    finding_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:run")),
) -> AssetPromoteOut:
    """Promote finding evidence into inventory (create/merge узел). Permission: scan:run."""
    try:
        data = module_svc.promote_finding_to_asset(db, finding_id)
    except Exception as exc:
        raise _http(exc) from exc
    write_audit(
        db,
        action="asset.promote",
        actor_user_id=user.id,
        resource=f"finding:{finding_id}",
        details=f"asset={data['asset']['id']} created={data.get('created')}",
    )
    return AssetPromoteOut(
        asset=AssetOut(**data["asset"]),
        finding=FindingOut(**data["finding"]),
        created=bool(data.get("created")),
        merged=bool(data.get("merged")),
        message=str(data.get("message") or ""),
    )


@router.post("/findings/{finding_id}/ticket", response_model=FindingTicketOut)
def finding_to_ticket(
    finding_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("scan:read", "tickets:write")),
) -> FindingTicketOut:
    try:
        finding, ticket, warning = module_svc.create_ticket_from_finding(
            db, finding_id=finding_id, actor=user
        )
    except Exception as exc:
        raise _http(exc) from exc
    return FindingTicketOut(
        finding=FindingOut(**module_svc._finding_out(finding)),
        ticket=ticket_svc._ticket_out(db, ticket),
        warning=warning,
    )
