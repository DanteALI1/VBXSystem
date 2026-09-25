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
    # Effective permission codes (super_admin → ["*"]) for UI gating
    permissions: list[str] = []

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
    group_ids: list[int] = []
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
    cve_store_raw_json: bool = False
    last_nvd_sync: SyncRunOut | None = None
    last_bdu_sync: SyncRunOut | None = None
    last_kev_sync: SyncRunOut | None = None
    stats: DatabaseStatsOut


class NvdKeyUpdate(BaseModel):
    api_key: str


class AutoUpdateUpdate(BaseModel):
    enabled: bool


class CveStoreRawJsonUpdate(BaseModel):
    enabled: bool


class PruneRawJsonIn(BaseModel):
    min_bytes: int = 10_000
    limit: int = 50_000
    confirm: bool = False


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


class EpssHistoryPoint(BaseModel):
    scored_at: str = ""
    score: float = 0.0
    percentile: float = 0.0


class EpssHistoryOut(BaseModel):
    cve_id: str
    points: list[EpssHistoryPoint] = []


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
    epss_history: list[EpssHistoryPoint] = []
    bdu: list = []
    exploits: list = []
    affected: dict | None = None


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
    title: str = ""
    severity: str = ""
    cvss_score: float | None = None
    cvss_version: str = ""
    cvss_vector: str = ""
    published: str | None = None
    modified: str | None = None
    description: str = ""
    status: str = ""
    source: str = ""
    is_cisa_kev: bool = False
    has_bdu: bool = False
    is_remote: bool | None = None
    cwes: list[str] = []
    products: list[str] = []
    bdu_ids: list[str] = []
    epss_score: float | None = None
    epss_percentile: float | None = None
    affected_app: str = ""
    affected_os: str = ""
    affected_version: str = ""
    affected_apps: list[str] = []
    affected_oses: list[str] = []
    affected_versions: list[str] = []
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
    telegram: dict = {}


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
    due_at: str | None = None
    sla_hours: int | None = None
    overdue: bool = False
    created_at: str | None = None
    updated_at: str | None = None


class TicketListOut(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[TicketOut]


class TicketAutoRuleWhen(BaseModel):
    """Match conditions (any field present is ANDed). Prefer severity_gte / is_kev / cve_match."""

    severity_gte: str | None = None
    is_kev: bool | None = None
    cve_match: str | None = None
    min_risk: int | None = None
    priority: str | None = None


class TicketAutoRule(BaseModel):
    when: TicketAutoRuleWhen | str | dict = Field(default_factory=dict)
    action: str = "create_ticket"
    enabled: bool = True
    status: str | None = None
    priority: str | None = None
    assignee_user_id: int | None = None
    tags: list[str] | None = None
    tag: str | None = None


class TicketAutoRulesOut(BaseModel):
    rules: list[TicketAutoRule] = Field(default_factory=list)


class TicketAutoRulesIn(BaseModel):
    rules: list[TicketAutoRule] = Field(default_factory=list)


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


# --- Scanner modules ---


class ModuleOut(BaseModel):
    id: str
    version: str = ""
    capabilities: list | dict = Field(default_factory=list)
    online: bool = False
    enabled: bool = True
    last_seen_at: str | None = None


class ModuleListOut(BaseModel):
    modules: list[ModuleOut] = Field(default_factory=list)


class ModuleSettingsOut(BaseModel):
    disabled_modules: list[str] = Field(default_factory=list)
    allowlist: str = ""
    shodan_api_key_set: bool = False
    shodan_api_key_masked: str = ""
    shodan_mock: bool = True
    shodan_modes_enabled: list[str] = Field(default_factory=lambda: ["host", "search", "dns"])
    shodan_rate_limit_hint: int = 1
    module_tokens_set: dict[str, bool] = Field(default_factory=dict)
    nmap_default_ports: str = ""
    nmap_default_profile: str = "default"
    nmap_default_timing: int = 3
    nmap_default_sv: bool = False
    nmap_default_os: bool = False
    nmap_default_aggressive: bool = False
    nmap_default_scripts: str = ""
    nmap_default_top_ports: str = ""
    nmap_default_exclude: str = ""
    zap_timeout_sec: int = 300
    zap_default_scan_type: str = "baseline"
    zap_default_ajax_spider: bool = False
    zap_default_context_name: str = ""
    zap_default_context_user: str = ""
    zap_default_credential_id: int | None = None
    nuclei_default_templates: str = ""
    nuclei_rate_limit: int = 150
    gowitness_timeout_sec: int = 60
    gowitness_default_resolution: str = "1440x900"
    gowitness_default_fullpage: bool = False


class ModuleSettingsUpdate(BaseModel):
    disabled_modules: list[str] | None = None
    allowlist: str | None = None
    shodan_api_key: str | None = None
    clear_shodan_api_key: bool = False
    shodan_mock: bool | None = None
    shodan_modes_enabled: list[str] | None = None
    shodan_rate_limit_hint: int | None = None
    module_tokens: dict[str, str] | None = None
    clear_module_tokens: list[str] | None = None
    nmap_default_ports: str | None = None
    nmap_default_profile: str | None = None
    nmap_default_timing: int | None = None
    nmap_default_sv: bool | None = None
    nmap_default_os: bool | None = None
    nmap_default_aggressive: bool | None = None
    nmap_default_scripts: str | None = None
    nmap_default_top_ports: str | None = None
    nmap_default_exclude: str | None = None
    zap_timeout_sec: int | None = None
    zap_default_scan_type: str | None = None
    zap_default_ajax_spider: bool | None = None
    zap_default_context_name: str | None = None
    zap_default_context_user: str | None = None
    zap_default_credential_id: int | None = None
    clear_zap_default_credential: bool = False
    nuclei_default_templates: str | None = None
    nuclei_rate_limit: int | None = None
    gowitness_timeout_sec: int | None = None
    gowitness_default_resolution: str | None = None
    gowitness_default_fullpage: bool | None = None


class ModuleWorkerConfigOut(BaseModel):
    allowlist: str = ""
    shodan_api_key_set: bool = False
    shodan_mock: bool = False
    shodan_modes_enabled: list[str] = Field(default_factory=lambda: ["host", "search", "dns"])
    shodan_rate_limit_hint: int = 1
    nmap_default_ports: str = ""
    nmap_default_profile: str = "default"
    nmap_default_timing: int = 3
    nmap_default_sv: bool = False
    nmap_default_os: bool = False
    nmap_default_aggressive: bool = False
    nmap_default_scripts: str = ""
    nmap_default_top_ports: str = ""
    nmap_default_exclude: str = ""
    zap_timeout_sec: int = 300
    zap_default_scan_type: str = "baseline"
    zap_default_ajax_spider: bool = False
    zap_default_context_name: str = ""
    zap_default_context_user: str = ""
    zap_default_credential_id: int | None = None
    nuclei_default_templates: str = ""
    nuclei_rate_limit: int = 150
    gowitness_timeout_sec: int = 60
    gowitness_default_resolution: str = "1440x900"
    gowitness_default_fullpage: bool = False
    disabled_modules: list[str] = Field(default_factory=list)


class ModuleShodanKeyOut(BaseModel):
    shodan_api_key: str = ""
    shodan_api_key_set: bool = False


class NucleiTagOut(BaseModel):
    tag: str
    count: int = 0


class NucleiTemplateOut(BaseModel):
    id: str
    name: str = ""
    path: str = ""
    tags: list[str] = Field(default_factory=list)
    severity: str = "info"
    source: str = "official"


class NucleiTemplatesListOut(BaseModel):
    tags: list[NucleiTagOut] = Field(default_factory=list)
    templates: list[NucleiTemplateOut] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 50
    q: str = ""
    official_count: int = 0
    custom_count: int = 0
    template_count: int = 0
    built_at: str | None = None


class NucleiTemplatesStatusOut(BaseModel):
    last_sync_at: str | None = None
    last_sync_status: str = "never"
    last_sync_error: str = ""
    template_count: int = 0
    official_count: int = 0
    custom_count: int = 0
    official_path: str = ""
    custom_path: str = ""
    auto_sync: bool = True
    index_built_at: str | None = None
    git_available: bool = False
    sync_running: bool = False


class NucleiTemplatesSyncOut(BaseModel):
    message: str = ""
    run_id: int | None = None
    started: bool = False
    status: NucleiTemplatesStatusOut | None = None


class NucleiTemplatesUploadOut(BaseModel):
    message: str = ""
    saved: list[str] = Field(default_factory=list)
    rejected: list[str] = Field(default_factory=list)
    custom_count: int = 0
    template_count: int = 0
    custom_path: str = ""


class ScanCredentialOut(BaseModel):
    id: int
    name: str
    kind: str
    username: str = ""
    password_set: bool = False
    password_masked: str = ""
    extra: dict = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class ScanCredentialListOut(BaseModel):
    credentials: list[ScanCredentialOut] = Field(default_factory=list)


class ScanCredentialCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    kind: str = "http_form"
    username: str = ""
    password: str = ""
    extra: dict = Field(default_factory=dict)


class ScanCredentialUpdateIn(BaseModel):
    name: str | None = None
    kind: str | None = None
    username: str | None = None
    password: str | None = None
    clear_password: bool = False
    extra: dict | None = None


class ScanCredentialDeleteOut(BaseModel):
    deleted: bool = True
    credential: ScanCredentialOut | None = None


class ScanCredentialInternalOut(BaseModel):
    """Worker-only payload — includes plaintext password once."""

    id: int
    name: str
    kind: str
    username: str = ""
    password: str = ""
    extra: dict = Field(default_factory=dict)


class ModuleRegisterIn(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    version: str = ""
    capabilities: list | dict = Field(default_factory=list)


class ModuleRegisterOut(BaseModel):
    id: str
    version: str = ""
    capabilities: list | dict = Field(default_factory=list)
    message: str = "registered"


class ScanEnqueueIn(BaseModel):
    params: dict = Field(default_factory=dict)


class ScanJobOut(BaseModel):
    id: int
    module_id: str
    status: str
    kind: str = "scan"
    parent_job_id: int | None = None
    created_by: int | None = None
    params: dict = Field(default_factory=dict)
    progress: dict = Field(default_factory=dict)
    error: str = ""
    started_at: str | None = None
    finished_at: str | None = None
    lease_owner: str | None = None
    leased_at: str | None = None
    created_at: str | None = None


class ScanJobListOut(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[ScanJobOut]


class ScanJobClaimIn(BaseModel):
    module_id: str = Field(min_length=1, max_length=128)
    lease_owner: str = Field(min_length=1, max_length=128)


class ScanJobClaimOut(BaseModel):
    job: ScanJobOut | None = None
    message: str = ""


class ScanJobHeartbeatIn(BaseModel):
    lease_owner: str | None = None
    progress: dict | None = None
    error: str | None = None


class FindingAssetIn(BaseModel):
    ip: str = ""
    hostname: str = ""
    ports: list = Field(default_factory=list)
    tags: list | None = None
    kind: str = "host"


class FindingItemIn(BaseModel):
    title: str = "Finding"
    severity: str = "MEDIUM"
    status: str = "open"
    asset: FindingAssetIn | dict | None = None
    evidence: dict = Field(default_factory=dict)
    cve_ids: list[str] = Field(default_factory=list)
    bdu_ids: list[str] = Field(default_factory=list)
    raw_ref: str = ""
    linked_cve_ids: list[str] | None = None
    linked_bdu_ids: list[str] | None = None


class ScanJobResultsIn(BaseModel):
    """findings.v1 batch ingest."""

    findings: list[dict] = Field(default_factory=list)
    status: str = "success"
    error: str = ""
    progress: dict | None = None
    lease_owner: str | None = None


class FindingOut(BaseModel):
    id: int
    scan_job_id: int
    module_id: str
    asset_id: int | None = None
    asset_hostname: str | None = None
    asset_ip: str | None = None
    asset_label: str | None = None
    title: str = ""
    severity: str = "MEDIUM"
    status: str = "open"
    evidence: dict = Field(default_factory=dict)
    raw_ref: str = ""
    linked_cve_ids: list[str] = Field(default_factory=list)
    linked_bdu_ids: list[str] = Field(default_factory=list)
    ticket_id: int | None = None
    fingerprint: str = ""
    last_seen_at: str | None = None
    closed_at: str | None = None
    assignee_user_id: int | None = None
    occurrence_count: int = 1
    risk_score: int = 0
    priority: str = "medium"
    due_at: str | None = None
    sla_hours: int | None = None
    acceptance_reason: str = ""
    accepted_until: str | None = None
    tags: list[str] = Field(default_factory=list)
    external_ref: str = ""
    project_id: int | None = None
    created_at: str | None = None


class FindingListOut(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[FindingOut]


class FindingUpdateIn(BaseModel):
    status: str | None = None
    assignee_user_id: int | None = None
    clear_assignee: bool = False
    reason: str = ""
    priority: str | None = None
    acceptance_reason: str | None = None
    accepted_until: str | None = None
    tags: list[str] | None = None
    project_id: int | None = None
    clear_project: bool = False


class FindingBulkUpdateIn(BaseModel):
    finding_ids: list[int] = Field(default_factory=list)
    status: str | None = None
    assignee_user_id: int | None = None
    clear_assignee: bool = False
    reason: str = ""
    priority: str | None = None
    tags: list[str] | None = None
    acceptance_reason: str | None = None
    accepted_until: str | None = None


class FindingEventOut(BaseModel):
    id: int
    finding_id: int
    actor_user_id: int | None = None
    event_type: str = ""
    message: str = ""
    meta: dict = Field(default_factory=dict)
    created_at: str | None = None


class AlertPolicyOut(BaseModel):
    id: int
    name: str = ""
    trigger: str = ""
    filters: dict = Field(default_factory=dict)
    channels: list[str] = Field(default_factory=list)
    enabled: bool = True
    created_at: str | None = None


class AlertPolicyCreateIn(BaseModel):
    name: str = ""
    trigger: str
    channels: list[str] = Field(default_factory=lambda: ["webhook"])
    filters: dict = Field(default_factory=dict)
    enabled: bool = True


class ProjectOut(BaseModel):
    id: int
    name: str = ""
    description: str = ""
    org_unit_id: int | None = None
    created_by: int | None = None
    created_at: str | None = None


class ProjectCreateIn(BaseModel):
    name: str
    description: str = ""
    org_unit_id: int | None = None


class OrgUnitOut(BaseModel):
    id: int
    name: str = ""
    parent_id: int | None = None
    created_at: str | None = None


class OrgUnitCreateIn(BaseModel):
    name: str
    parent_id: int | None = None


class UserOrgUnitsIn(BaseModel):
    org_unit_ids: list[int] = Field(default_factory=list)


class ReportTemplateOut(BaseModel):
    id: int
    name: str = ""
    sections: list = Field(default_factory=list)
    updated_by: int | None = None
    created_at: str | None = None
    updated_at: str | None = None


class ReportTemplateSaveIn(BaseModel):
    name: str
    sections: list = Field(default_factory=list)
    template_id: int | None = None


class ReportGenerateIn(BaseModel):
    sections: list | None = None
    template_id: int | None = None
    project_id: int | None = None
    scan_job_id: int | None = None
    format: str = "html"


class JiraSettingsIn(BaseModel):
    base_url: str | None = None
    email: str | None = None
    api_token: str | None = None
    project_key: str | None = None
    issue_type: str | None = None
    dry_run: bool | None = None


class JiraCreateIn(BaseModel):
    summary: str
    description: str = ""
    finding_id: int | None = None
    ticket_id: int | None = None


class FindingTagsBulkIn(BaseModel):
    finding_ids: list[int] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class ScanScheduleOut(BaseModel):
    id: int
    name: str = ""
    module_id: str
    params: dict = Field(default_factory=dict)
    interval_sec: int = 3600
    enabled: bool = True
    last_run_at: str | None = None
    next_run_at: str | None = None
    created_by: int | None = None
    created_at: str | None = None


class ScanScheduleCreateIn(BaseModel):
    module_id: str
    name: str = ""
    params: dict = Field(default_factory=dict)
    interval_sec: int = 3600
    enabled: bool = True


class ScanScheduleUpdateIn(BaseModel):
    module_id: str | None = None
    name: str | None = None
    params: dict | None = None
    interval_sec: int | None = None
    enabled: bool | None = None


class SavedFilterOut(BaseModel):
    id: int
    scope: str
    name: str
    query: dict = Field(default_factory=dict)
    user_id: int
    created_at: str | None = None


class SavedFilterCreateIn(BaseModel):
    scope: str = "findings"
    name: str
    query: dict = Field(default_factory=dict)


class AlertOutboxOut(BaseModel):
    id: int
    channel: str
    payload: dict = Field(default_factory=dict)
    status: str
    attempts: int = 0
    last_error: str = ""
    created_at: str | None = None
    sent_at: str | None = None


class AlertTestIn(BaseModel):
    channel: str = "webhook"
    text: str = "VBXSystem alert test"
    to: str = ""
    subject: str = "VBXSystem alert"


class OpsDashboardOut(BaseModel):
    open_by_severity: dict[str, int] = Field(default_factory=dict)
    scan_success_rate_7d: float | None = None
    scan_jobs_7d: dict[str, int] = Field(default_factory=dict)
    active_jobs: int = 0
    top_assets_by_findings: list[dict] = Field(default_factory=list)


class JobDiffOut(BaseModel):
    job_id: int
    previous_job_id: int | None = None
    new: list[FindingOut] = Field(default_factory=list)
    fixed: list[FindingOut] = Field(default_factory=list)
    persistent: list[FindingOut] = Field(default_factory=list)
    summary: dict[str, int] = Field(default_factory=dict)


class JobSummaryOut(BaseModel):
    job: ScanJobOut
    findings_total: int = 0
    by_severity: dict[str, int] = Field(default_factory=dict)
    hosts_count: int = 0
    duration_sec: int | None = None


class AssetOut(BaseModel):
    id: int
    kind: str = "host"
    hostname: str = ""
    ip: str = ""
    ports: list = Field(default_factory=list)
    tags: list = Field(default_factory=list)
    segment: str = ""
    criticality: str = "medium"
    org_unit_id: int | None = None
    owner_user_id: int | None = None
    owner_username: str | None = None
    last_seen_at: str | None = None
    created_at: str | None = None
    label: str = ""
    findings_count: int = 0


class AssetListOut(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[AssetOut]


class AssetDetailOut(BaseModel):
    asset: AssetOut
    findings: list[FindingOut] = Field(default_factory=list)


class AssetCreateIn(BaseModel):
    hostname: str = ""
    ip: str = ""
    kind: str = "host"
    ports: list = Field(default_factory=list)
    tags: list = Field(default_factory=list)
    segment: str = ""
    criticality: str = "medium"
    org_unit_id: int | None = None
    owner_user_id: int | None = None


class AssetUpdateIn(BaseModel):
    hostname: str | None = None
    ip: str | None = None
    kind: str | None = None
    ports: list | None = None
    tags: list | None = None
    segment: str | None = None
    criticality: str | None = None
    org_unit_id: int | None = None
    clear_org_unit: bool = False
    owner_user_id: int | None = None


class AssetDeleteOut(BaseModel):
    deleted: bool = True
    asset_id: int
    unlinked_findings: int = 0
    asset: AssetOut | None = None


class AssetMergeIn(BaseModel):
    into_asset_id: int


class AssetMergeOut(BaseModel):
    source_asset_id: int
    target: AssetOut
    moved_findings: int = 0
    message: str = ""


class AssetTagsOut(BaseModel):
    tags: list[str] = Field(default_factory=list)


class AssetOwnerOptionOut(BaseModel):
    id: int
    username: str
    full_name: str = ""


class AssetOwnersOut(BaseModel):
    owners: list[AssetOwnerOptionOut] = Field(default_factory=list)


class AssetPromoteOut(BaseModel):
    """Result of promoting a finding into inventory (узел)."""

    asset: AssetOut
    finding: FindingOut
    created: bool = False
    merged: bool = False
    message: str = ""

class ScanJobResultsOut(BaseModel):
    job: ScanJobOut
    created: int = 0
    updated: int = 0
    findings: list[FindingOut] = Field(default_factory=list)
    tickets_created: int = 0
    skipped_offlist: int = 0
    ignored: bool = False
    message: str = ""


class ModuleScanStatsOut(BaseModel):
    """Lease + scan observability counters."""

    running_jobs: int = 0
    queued_jobs: int = 0
    cancelled_jobs: int = 0
    stale_leases_reclaimed: int = 0
    findings_created: int = 0
    allowlist_denials_enqueue: int = 0
    allowlist_denials_ingest: int = 0
    jobs_cancelled: int = 0
    claim_wait_last_ms: int = 0
    claim_wait_avg_ms: float | None = None
    claim_latency_last_ms: int = 0
    claim_latency_avg_ms: float | None = None
    lease_ttl_sec: int = 300


class FindingTicketOut(BaseModel):
    finding: FindingOut
    ticket: TicketOut
    warning: str | None = None
