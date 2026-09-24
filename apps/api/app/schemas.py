from datetime import datetime
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str = "vbx-api"


class ReadyResponse(BaseModel):
    status: str
    database: bool
    redis: bool


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)
    device_label: str = ""


class LoginResponse(BaseModel):
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    requires_2fa: bool = False
    temp_token: str | None = None
    is_new_device: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str = ""


class SessionModeOut(BaseModel):
    cookies: bool = False


class TwoFAVerifyRequest(BaseModel):
    temp_token: str
    code: str = Field(min_length=4, max_length=32)
    device_label: str = ""


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = ""
    organization: str = ""
    title: str = ""
    phone: str = ""


class MessageOut(BaseModel):
    message: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    organization: str
    title: str
    phone: str
    status: str
    is_super_admin: bool
    totp_enabled: bool
    roles: list[str]
    groups: list[str] = []

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    organization: str | None = None
    title: str | None = None
    phone: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class TotpSetupOut(BaseModel):
    secret: str
    otpauth_url: str
    qr_png_base64: str


class TotpEnableRequest(BaseModel):
    code: str


class TotpEnableOut(BaseModel):
    recovery_codes: list[str]
    message: str


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = ""
    organization: str = ""
    title: str = ""
    phone: str = ""
    roles: list[str] = ["viewer"]
    status: str = "active"


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    email: str | None = None
    organization: str | None = None
    title: str | None = None
    phone: str | None = None
    status: str | None = None
    roles: list[str] | None = None
    group_ids: list[int] | None = None


class GroupOut(BaseModel):
    id: int
    name: str
    source: str
    external_id: str | None
    description: str

    model_config = {"from_attributes": True}


class GroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    source: str = "local"
    external_id: str | None = None


class AdGroupSyncRequest(BaseModel):
    """Contract for future LDAP sync (W6)."""

    dry_run: bool = True
    ou_filter: str | None = None


class AdGroupSyncOut(BaseModel):
    status: str
    message: str
    planned: list[dict] = []
    created: int = 0
    updated: int = 0


class RoleOut(BaseModel):
    code: str
    name: str
    description: str


class SyncRunOut(BaseModel):
    id: int
    source: str
    status: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
    stats: dict = {}
    error: str = ""


class DatabaseStatsOut(BaseModel):
    db_version: str
    cve_count: int
    bdu_count: int
    bdu_mapped: int
    bdu_standalone: int
    kev_count: int
    nvd_mirror_status: str
    cache_label: str
    size_label: str
    last_nvd_new: int = 0
    last_kev_matches: int = 0


class DatabaseSettingsOut(BaseModel):
    nvd_api_key_masked: str
    nvd_api_key_configured: bool
    nvd_auto_update: bool
    nvd_auto_interval_hours: int
    nvd_mock_mode: bool
    bdu_xml_url: str = ""
    last_nvd_sync: SyncRunOut | None = None
    last_bdu_sync: SyncRunOut | None = None
    last_kev_sync: SyncRunOut | None = None
    stats: DatabaseStatsOut


class NvdKeyUpdate(BaseModel):
    api_key: str


class AutoUpdateUpdate(BaseModel):
    enabled: bool


class BduUrlUpdate(BaseModel):
    bdu_xml_url: str = ""


class SyncStartOut(BaseModel):
    run: SyncRunOut | None
    message: str


class BduUploadOut(BaseModel):
    run: SyncRunOut | None
    message: str
    filename: str


class SearchHitOut(BaseModel):
    kind: str
    id: str
    title: str
    description: str = ""
    severity: str = ""
    cvss_score: float | None = None
    published_at: str | None = None
    is_cisa_kev: bool = False
    has_bdu: bool = False
    epss: dict | None = None
    href: str


class SearchResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[SearchHitOut]


class CveDetailOut(BaseModel):
    id: str
    title: str
    description: str
    status: str = ""
    source: str = ""
    published_at: str | None = None
    modified_at: str | None = None
    cvss: dict
    is_cisa_kev: bool = False
    cwes: list = []
    products: list = []
    references: list = []
    kev: dict | None = None
    epss: dict | None = None
    bdu: list = []
    exploits: list = []


class BduDetailOut(BaseModel):
    id: str
    name: str
    description: str = ""
    severity: str = ""
    severity_level: int | None = None
    status: str = ""
    solution: str = ""
    vendors: str = ""
    software_names: str = ""
    software_versions: str = ""
    software_type: str = ""
    os_platform: str = ""
    vuln_class: str = ""
    cvss2_vector: str = ""
    cvss3_vector: str = ""
    cvss4_vector: str = ""
    exploit_status: str = ""
    fix_info: str = ""
    exploit_method: str = ""
    fix_method: str = ""
    references: list[str] = []
    published_date: str = ""
    updated_date: str = ""
    cwe_description: str = ""
    extra: dict = {}
    cwes: str = ""
    linked_cve_ids: list[str] = []
    identify_date: str = ""
    is_standalone: bool = True


class DashboardKpiOut(BaseModel):
    cves_today: int
    cves_today_delta_pct: float | None = None
    cves_week: int
    cves_week_delta_pct: float | None = None
    kev_week: int
    kev_total: int
    kev_catalog: int


class DashboardHitOut(BaseModel):
    id: str
    title: str
    summary: str = ""
    severity: str = ""
    cvss_score: float | None = None
    published_at: str | None = None
    is_cisa_kev: bool = False
    reason: str = ""  # watchlist | kev_new | kev | epss | critical
    vendor: str = ""
    product: str = ""
    kev_date_added: str | None = None
    epss_score: float | None = None
    href: str


class SyncHealthItemOut(BaseModel):
    source: str
    status: str
    finished_at: str | None = None
    error: str = ""


class EpssRowOut(BaseModel):
    cve_id: str
    score: float
    percentile: float = 0.0
    scored_at: str = ""
    severity: str = ""
    title: str = ""
    is_cisa_kev: bool = False
    href: str
    previous_score: float | None = None
    delta: float | None = None


class DashboardCatalogStatsOut(BaseModel):
    cve_total: int = 0
    bdu_total: int = 0
    local_total: int = 0
    kev_catalog: int = 0
    epss_scored: int = 0


class DashboardOut(BaseModel):
    kpis: DashboardKpiOut
    catalog_stats: DashboardCatalogStatsOut = DashboardCatalogStatsOut()
    chart_range: str
    activity: list[dict]
    attention_feed: list[DashboardHitOut] = []
    attention_window_days: int = 30
    attention_epss_min: float = 0.7
    recent_critical: list[DashboardHitOut] = []
    recent_kev: list[DashboardHitOut] = []
    epss_top: list[EpssRowOut] = []
    epss_deltas: list[EpssRowOut] = []
    sync_health: dict[str, SyncHealthItemOut | None]


class EpssOverviewOut(BaseModel):
    top_predictions: list[EpssRowOut]
    top_deltas: list[EpssRowOut]
    total_scored: int


class CveqlExampleOut(BaseModel):
    title: str
    query: str


class CveqlHelpOut(BaseModel):
    fields: list[str]
    operators: list[str]
    examples: list[CveqlExampleOut]
    notes: str = ""


class CveqlHitOut(BaseModel):
    id: str
    severity: str = ""
    cvss_score: float | None = None
    published: str | None = None
    description: str = ""
    is_cisa_kev: bool = False
    has_bdu: bool = False
    epss_score: float | None = None
    href: str


class CveqlExecuteOut(BaseModel):
    query: str
    total: int
    limit: int
    offset: int
    results: list[CveqlHitOut]
    fields: list[str] = []


class ExploitOut(BaseModel):
    xdb_id: str
    cve_id: str | None = None
    published_at: str | None = None
    repo_url: str = ""
    repo_name: str = ""
    author: str = ""
    source: str = ""


class ExploitListOut(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[ExploitOut]


class ExploitImportOut(BaseModel):
    message: str
    created: int = 0
    updated: int = 0
    skipped: int = 0
    total: int = 0


class NotificationPrefsOut(BaseModel):
    new_vulns: bool = True
    kev_updates: bool = True
    nvd_sync: bool = True
    bdu_import: bool = False
    ticket_events: bool = True
    channel_toast: bool = True
    channel_modal: bool = False


class SecuritySettingsOut(BaseModel):
    force_2fa: bool = False
    new_device_alerts: bool = True
    mtls_enabled: bool = False
    mtls_ca_configured: bool = False
    mtls_instructions: str = ""


class AuditLogOut(BaseModel):
    id: int
    actor_user_id: int | None = None
    action: str
    resource: str = ""
    details: str = ""
    ip_address: str | None = None
    created_at: datetime | None = None


class IntegrationsOut(BaseModel):
    smtp: dict
    ldap: dict
    sso: dict


class ApiKeyOut(BaseModel):
    id: int
    name: str
    prefix: str
    scopes: list[str] = []
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
    last_used_at: datetime | None = None
    created_at: datetime | None = None


class ApiKeyCreatedOut(ApiKeyOut):
    secret: str


class TicketOut(BaseModel):
    id: int
    title: str
    description: str = ""
    severity: str = "MEDIUM"
    status: str = "new"
    linked_cve_id: str | None = None
    linked_bdu_id: str | None = None
    assignee_user_id: int | None = None
    assignee_name: str = ""
    group_id: int | None = None
    group_name: str = ""
    created_by_id: int | None = None
    created_by_name: str = ""
    due_date: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class TicketListOut(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[TicketOut]


class TicketCommentOut(BaseModel):
    id: int
    author_user_id: int | None = None
    author_name: str = ""
    body: str
    created_at: str | None = None


class TicketEventOut(BaseModel):
    id: int
    actor_user_id: int | None = None
    actor_name: str = ""
    event_type: str
    message: str
    created_at: str | None = None


class TicketDetailOut(TicketOut):
    comments: list[TicketCommentOut] = []
    events: list[TicketEventOut] = []


class TicketCreateOut(BaseModel):
    ticket: TicketOut
    warning: str | None = None
