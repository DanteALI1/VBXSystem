"""Scanner module domain: register, enqueue, claim, ingest findings."""

from __future__ import annotations

import hashlib
import ipaddress
import json
import os
import time
from datetime import timedelta
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import Asset, Finding, ModuleRegistry, ScanJob, User, utcnow
from app.services import artifacts as artifacts_svc
from app.services import module_queue as mq
from app.services import tickets as ticket_svc
from app.services.auth_helpers import get_setting, set_setting
from app.services.crypto_secrets import decrypt_secret, encrypt_secret, mask_secret
from app.services.secrets import get_secret

# Terminal / cancel statuses workers must respect on heartbeat & results
_CANCELLED_STATUSES = frozenset({"cancelled", "canceled", "aborted"})
_TERMINAL_STATUSES = frozenset({"success", "failed"}) | _CANCELLED_STATUSES
_ACTIVE_STATUSES = frozenset({"pending", "queued", "running"})

SETTING_DISABLED = "scan_modules_disabled_json"
SETTING_ALLOWLIST = "scan_allowlist"
SETTING_SHODAN_KEY = "shodan_api_key_enc"
# JSON map {module_id: fernet_ciphertext} — optional per-module worker tokens
SETTING_MODULE_TOKENS = "module_tokens_enc"
SETTING_SHODAN_MOCK = "shodan_mock"
SETTING_SHODAN_MODES = "shodan_modes_enabled_json"
SETTING_SHODAN_RATE = "shodan_rate_limit_hint"
SETTING_NMAP_PORTS = "nmap_default_ports"
SETTING_NMAP_PROFILE = "nmap_default_profile"
SETTING_NMAP_TIMING = "nmap_default_timing"
SETTING_NMAP_SV = "nmap_default_sv"
SETTING_NMAP_OS = "nmap_default_os"
SETTING_NMAP_AGGRESSIVE = "nmap_default_aggressive"
SETTING_NMAP_SCRIPTS = "nmap_default_scripts"
SETTING_NMAP_TOP_PORTS = "nmap_default_top_ports"
SETTING_NMAP_EXCLUDE = "nmap_default_exclude"
SETTING_ZAP_TIMEOUT = "zap_timeout_sec"
SETTING_ZAP_SCAN_TYPE = "zap_default_scan_type"
SETTING_ZAP_AJAX = "zap_default_ajax_spider"
SETTING_ZAP_CONTEXT = "zap_default_context_name"
SETTING_ZAP_CONTEXT_USER = "zap_default_context_user"
SETTING_NUCLEI_TEMPLATES = "nuclei_default_templates"
SETTING_NUCLEI_RATE = "nuclei_rate_limit"
SETTING_GOWITNESS_TIMEOUT = "gowitness_timeout_sec"
SETTING_GOWITNESS_RESOLUTION = "gowitness_default_resolution"
SETTING_GOWITNESS_FULLPAGE = "gowitness_default_fullpage"
SETTING_ASSETS_TAGS_TAXONOMY = "assets_tags_taxonomy_json"
DEFAULT_ASSETS_TAGS = ["prod", "stage", "dev", "dmz", "critical", "legacy", "corp-lan"]
SETTING_ZAP_CREDENTIAL = "zap_default_credential_id"

NMAP_PROFILES = ("quick", "default", "full", "udp", "vuln-scripts")
SHODAN_MODES = ("host", "search", "dns")
ZAP_SCAN_TYPES = ("baseline", "spider", "full", "api")

_SEVERITY_ALIASES = {
    "": "MEDIUM",
    "INFORMATIONAL": "INFO",
    "INFORMATION": "INFO",
    "WARN": "MEDIUM",
    "WARNING": "MEDIUM",
    "ERR": "HIGH",
    "ERROR": "HIGH",
    "FATAL": "CRITICAL",
    "UNKNOWN": "MEDIUM",
}
_KNOWN_SEVERITIES = frozenset({"CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"})
_OPEN_FINDING_STATUSES = frozenset({"open", "triaged", "new"})
_PLUGIN_KEYS = (
    "plugin_id",
    "pluginId",
    "plugin",
    "script_id",
    "scriptId",
    "nessus_plugin_id",
    "check_id",
)


def _json_loads(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def normalize_severity(raw: str | None) -> str:
    """Map scanner aliases to a stable severity vocabulary."""
    sev = str(raw or "MEDIUM").strip().upper()[:32]
    sev = _SEVERITY_ALIASES.get(sev, sev)
    if sev not in _KNOWN_SEVERITIES:
        return "MEDIUM"
    return sev


def _severity_rank(severity: str | None) -> int:
    return ticket_svc.severity_rank(severity)


def _norm_part(value: Any) -> str:
    return str(value or "").strip().lower()


def _evidence_port(evidence: dict[str, Any]) -> str:
    if evidence.get("port") is not None and str(evidence.get("port")).strip() != "":
        return str(evidence.get("port")).strip()
    ports = evidence.get("ports")
    if isinstance(ports, list) and ports:
        return str(ports[0]).strip()
    return ""


def _evidence_plugin_id(evidence: dict[str, Any]) -> str:
    for key in _PLUGIN_KEYS:
        if evidence.get(key) is not None and str(evidence.get(key)).strip():
            return str(evidence.get(key)).strip()
    return ""


def _primary_cve(cve_ids: list[str], evidence: dict[str, Any]) -> str:
    cleaned = sorted({str(c).upper().strip() for c in cve_ids if str(c).strip()})
    if cleaned:
        return cleaned[0]
    for key in ("cve", "cve_id", "CVE"):
        raw = evidence.get(key)
        if raw:
            return str(raw).upper().strip()
    return ""


def compute_finding_fingerprint(
    *,
    module_id: str,
    title: str,
    hostname: str = "",
    ip: str = "",
    evidence: dict[str, Any] | None = None,
    cve_ids: list[str] | None = None,
) -> str:
    """SHA-256 fingerprint for rescans dedupe.

    Canonical string (pipe-separated, lowercased identity parts):
      module_id|title|ip|hostname|port|plugin_id|primary_cve
    """
    ev = evidence if isinstance(evidence, dict) else {}
    host = _norm_part(hostname) or _norm_part(ev.get("hostname") or ev.get("host") or ev.get("fqdn"))
    addr = _norm_part(ip) or _norm_part(ev.get("ip") or ev.get("address"))
    if not host and not addr:
        target = _norm_part(ev.get("target"))
        if target:
            if _looks_like_ip(target):
                addr = target
            else:
                host = target
    port = _norm_part(_evidence_port(ev))
    plugin = _norm_part(_evidence_plugin_id(ev))
    cve = _norm_part(_primary_cve(cve_ids or [], ev))
    canonical = "|".join(
        [
            _norm_part(module_id),
            _norm_part(title),
            addr,
            host,
            port,
            plugin,
            cve,
        ]
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _looks_like_ip(value: str) -> bool:
    try:
        ipaddress.ip_address((value or "").strip())
        return True
    except ValueError:
        return False


def parse_allowlist_entries(raw: str | None) -> set[str]:
    return {x.strip().lower() for x in (raw or "").split(",") if x.strip()}


def target_allowed(target: str, allowlist: set[str]) -> bool:
    """Exact host/IP/URL-host match or IP inside an allowlisted CIDR."""
    t = (target or "").strip().lower()
    if not t or not allowlist:
        return False
    if t in allowlist:
        return True
    if "://" in t:
        host = (urlparse(t).hostname or "").lower()
    else:
        host = t
        if host.startswith("[") and "]" in host:
            host = host[1 : host.index("]")]
        if host.count(":") == 1 and not host.startswith("["):
            left, right = host.rsplit(":", 1)
            if right.isdigit():
                host = left
    if not host:
        return False
    if host in allowlist:
        return True
    for entry in allowlist:
        if "://" in entry:
            eh = (urlparse(entry).hostname or "").lower()
            if eh and eh == host:
                return True
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return False
    for entry in allowlist:
        try:
            if "/" in entry:
                if addr in ipaddress.ip_network(entry, strict=False):
                    return True
            elif addr == ipaddress.ip_address(entry):
                return True
        except ValueError:
            continue
    return False


def _job_target(params: dict | None) -> str:
    p = params or {}
    for key in ("target", "host", "ip", "url"):
        val = str(p.get(key) or "").strip()
        if val:
            return val
    # Shodan search/dns may use query as the primary input
    mode = str(p.get("mode") or "").strip().lower()
    if mode in {"search", "dns"}:
        return str(p.get("query") or "").strip()
    return ""


def _deny_enqueue_allowlist(reason: str) -> None:
    mq.incr_metric(mq.METRIC_ALLOWLIST_ENQUEUE, 1)
    raise ValueError(reason)


def _enforce_enqueue_allowlist(db: Session, params: dict | None) -> None:
    """When Core allowlist is configured, reject off-list enqueue targets."""
    entries = parse_allowlist_entries(get_setting(db, SETTING_ALLOWLIST, ""))
    if not entries:
        return
    p = params or {}
    mode = str(p.get("mode") or "").strip().lower()
    # Shodan search: query is not a single host; worker filters matches by allowlist
    if mode == "search":
        if not str(p.get("query") or p.get("target") or "").strip():
            raise ValueError("Параметр query/target обязателен для Shodan search")
        return
    target = _job_target(params)
    if not target:
        raise ValueError("Параметр target обязателен при настроенном allowlist")
    # DNS may list multiple hostnames
    if mode == "dns":
        names = [x.strip() for x in target.replace(";", ",").split(",") if x.strip()]
        for name in names:
            if not target_allowed(name, entries):
                _deny_enqueue_allowlist(f"Цель «{name}» не входит в scan allowlist")
        return
    if not target_allowed(target, entries):
        _deny_enqueue_allowlist(f"Цель «{target}» не входит в scan allowlist")


def _as_bool(raw: str | None, default: bool = False) -> bool:
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _clamp_int(raw: str | None, default: int, lo: int, hi: int) -> int:
    try:
        return max(lo, min(int(raw or default), hi))
    except (TypeError, ValueError):
        return default


def _optional_int(raw: str | None) -> int | None:
    s = (raw or "").strip()
    if not s:
        return None
    try:
        value = int(s)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _disabled_modules(db: Session) -> set[str]:
    raw = get_setting(db, SETTING_DISABLED, "[]")
    data = _json_loads(raw, [])
    if not isinstance(data, list):
        return set()
    return {str(x).strip() for x in data if str(x).strip()}


def _normalize_nmap_profile(value: str | None) -> str:
    v = (value or "default").strip().lower()
    return v if v in NMAP_PROFILES else "default"


def _normalize_zap_scan_type(value: str | None) -> str:
    v = (value or "baseline").strip().lower()
    return v if v in ZAP_SCAN_TYPES else "baseline"


def _normalize_shodan_modes(value: Any) -> list[str]:
    if isinstance(value, str):
        value = _json_loads(value, None) if value.strip().startswith("[") else [
            x.strip() for x in value.split(",") if x.strip()
        ]
    if not isinstance(value, list):
        return list(SHODAN_MODES)
    cleaned = [str(x).strip().lower() for x in value if str(x).strip().lower() in SHODAN_MODES]
    return cleaned or list(SHODAN_MODES)


def _module_tokens_enc_map(db: Session) -> dict[str, str]:
    raw = get_setting(db, SETTING_MODULE_TOKENS, "{}")
    data = _json_loads(raw, {})
    if not isinstance(data, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in data.items():
        mid = str(k).strip().lower()
        enc = str(v or "").strip()
        if mid and enc:
            out[mid] = enc
    return out


def list_module_token_status(db: Session) -> dict[str, bool]:
    """module_id → whether a per-module token is configured (DB only)."""
    return {mid: True for mid in _module_tokens_enc_map(db)}


def get_module_token_plain(db: Session, module_id: str) -> str:
    """Decrypt per-module token from DB, else env VBX_MODULE_TOKEN_<ID> / secrets backend."""
    mid = (module_id or "").strip().lower()
    if not mid:
        return ""
    enc_map = _module_tokens_enc_map(db)
    if mid in enc_map:
        plain = decrypt_secret(enc_map[mid])
        if plain:
            return plain
    env_key = f"VBX_MODULE_TOKEN_{mid.upper()}"
    return get_secret(env_key, "") or get_secret(f"module_token_{mid}", "")


def set_module_token(db: Session, module_id: str, token: str) -> None:
    mid = (module_id or "").strip().lower()
    if not mid:
        raise ValueError("module_id required")
    enc_map = _module_tokens_enc_map(db)
    tok = (token or "").strip()
    if not tok:
        enc_map.pop(mid, None)
    else:
        enc_map[mid] = encrypt_secret(tok)
    set_setting(db, SETTING_MODULE_TOKENS, json.dumps(enc_map, ensure_ascii=False))


def clear_module_token(db: Session, module_id: str) -> None:
    set_module_token(db, module_id, "")


def shared_module_token() -> str:
    """Shared fallback token: secrets backend then Settings.vbx_module_token."""
    from app.core.config import get_settings

    return (
        get_secret("VBX_MODULE_TOKEN", "")
        or (get_settings().vbx_module_token or "").strip()
    )


def token_matches(provided: str, expected: str) -> bool:
    import secrets as _secrets

    a = (provided or "").strip()
    b = (expected or "").strip()
    if not a or not b or len(a) != len(b):
        return False
    return _secrets.compare_digest(a, b)


def verify_module_token(db: Session, provided: str, *, module_id: str | None = None) -> bool:
    """True if ``provided`` is the shared token or a valid (scoped) per-module token."""
    provided = (provided or "").strip()
    if not provided:
        return False
    shared = shared_module_token()
    if shared and token_matches(provided, shared):
        return True
    mid = (module_id or "").strip().lower() or None
    if mid:
        per = get_module_token_plain(db, mid)
        return bool(per) and token_matches(provided, per)
    for mid_key in _module_tokens_enc_map(db):
        per = get_module_token_plain(db, mid_key)
        if per and token_matches(provided, per):
            return True
    for known in ("nmap", "shodan", "zap", "nuclei", "gowitness"):
        per = get_module_token_plain(db, known)
        if per and token_matches(provided, per):
            return True
    return False


def resolve_shodan_api_key(db: Session) -> str:
    """DB-encrypted key, else secrets backend / VBX_SHODAN_API_KEY (never over config GET)."""
    plain = decrypt_secret(get_setting(db, SETTING_SHODAN_KEY, ""))
    if plain:
        return plain
    return get_secret("VBX_SHODAN_API_KEY", "") or get_secret("SHODAN_API_KEY", "")


def get_module_admin_settings(db: Session) -> dict[str, Any]:
    key_plain = resolve_shodan_api_key(db)
    mock_raw = get_setting(db, SETTING_SHODAN_MOCK, "")
    shodan_mock = mock_raw.lower() in {"1", "true", "yes", "on"} if mock_raw else not bool(key_plain)
    token_status = list_module_token_status(db)
    for mid in ("nmap", "shodan", "zap", "nuclei", "gowitness"):
        if mid not in token_status and get_module_token_plain(db, mid):
            token_status[mid] = True
    return {
        "disabled_modules": sorted(_disabled_modules(db)),
        "allowlist": get_setting(db, SETTING_ALLOWLIST, ""),
        "shodan_api_key_set": bool(key_plain),
        "shodan_api_key_masked": mask_secret(key_plain) if key_plain else "",
        "shodan_mock": shodan_mock,
        "shodan_modes_enabled": _normalize_shodan_modes(
            get_setting(db, SETTING_SHODAN_MODES, json.dumps(list(SHODAN_MODES)))
        ),
        "shodan_rate_limit_hint": _clamp_int(get_setting(db, SETTING_SHODAN_RATE, "1"), 1, 1, 60),
        "module_tokens_set": token_status,
        "nmap_default_ports": get_setting(db, SETTING_NMAP_PORTS, ""),
        "nmap_default_profile": _normalize_nmap_profile(get_setting(db, SETTING_NMAP_PROFILE, "default")),
        "nmap_default_timing": _clamp_int(get_setting(db, SETTING_NMAP_TIMING, "3"), 3, 0, 5),
        "nmap_default_sv": _as_bool(get_setting(db, SETTING_NMAP_SV, "false")),
        "nmap_default_os": _as_bool(get_setting(db, SETTING_NMAP_OS, "false")),
        "nmap_default_aggressive": _as_bool(get_setting(db, SETTING_NMAP_AGGRESSIVE, "false")),
        "nmap_default_scripts": get_setting(db, SETTING_NMAP_SCRIPTS, ""),
        "nmap_default_top_ports": get_setting(db, SETTING_NMAP_TOP_PORTS, ""),
        "nmap_default_exclude": get_setting(db, SETTING_NMAP_EXCLUDE, ""),
        "zap_timeout_sec": _clamp_int(get_setting(db, SETTING_ZAP_TIMEOUT, "300"), 300, 30, 7200),
        "zap_default_scan_type": _normalize_zap_scan_type(
            get_setting(db, SETTING_ZAP_SCAN_TYPE, "baseline")
        ),
        "zap_default_ajax_spider": _as_bool(get_setting(db, SETTING_ZAP_AJAX, "false")),
        "zap_default_context_name": get_setting(db, SETTING_ZAP_CONTEXT, ""),
        "zap_default_context_user": get_setting(db, SETTING_ZAP_CONTEXT_USER, ""),
        "zap_default_credential_id": _optional_int(get_setting(db, SETTING_ZAP_CREDENTIAL, "")),
        "nuclei_default_templates": get_setting(db, SETTING_NUCLEI_TEMPLATES, ""),
        "nuclei_rate_limit": _clamp_int(get_setting(db, SETTING_NUCLEI_RATE, "150"), 150, 1, 10000),
        "gowitness_timeout_sec": _clamp_int(get_setting(db, SETTING_GOWITNESS_TIMEOUT, "60"), 60, 10, 600),
        "gowitness_default_resolution": get_setting(db, SETTING_GOWITNESS_RESOLUTION, "1440x900")
        or "1440x900",
        "gowitness_default_fullpage": _as_bool(get_setting(db, SETTING_GOWITNESS_FULLPAGE, "false")),
    }


def update_module_admin_settings(
    db: Session,
    *,
    disabled_modules: list[str] | None = None,
    allowlist: str | None = None,
    shodan_api_key: str | None = None,
    clear_shodan_api_key: bool = False,
    shodan_mock: bool | None = None,
    shodan_modes_enabled: list[str] | None = None,
    shodan_rate_limit_hint: int | None = None,
    module_tokens: dict[str, str] | None = None,
    clear_module_tokens: list[str] | None = None,
    nmap_default_ports: str | None = None,
    nmap_default_profile: str | None = None,
    nmap_default_timing: int | None = None,
    nmap_default_sv: bool | None = None,
    nmap_default_os: bool | None = None,
    nmap_default_aggressive: bool | None = None,
    nmap_default_scripts: str | None = None,
    nmap_default_top_ports: str | None = None,
    nmap_default_exclude: str | None = None,
    zap_timeout_sec: int | None = None,
    zap_default_scan_type: str | None = None,
    zap_default_ajax_spider: bool | None = None,
    zap_default_context_name: str | None = None,
    zap_default_context_user: str | None = None,
    zap_default_credential_id: int | None = None,
    clear_zap_default_credential: bool = False,
    nuclei_default_templates: str | None = None,
    nuclei_rate_limit: int | None = None,
    gowitness_timeout_sec: int | None = None,
    gowitness_default_resolution: str | None = None,
    gowitness_default_fullpage: bool | None = None,
) -> dict[str, Any]:
    if disabled_modules is not None:
        cleaned = sorted({str(x).strip() for x in disabled_modules if str(x).strip()})
        set_setting(db, SETTING_DISABLED, json.dumps(cleaned, ensure_ascii=False))
    if allowlist is not None:
        set_setting(db, SETTING_ALLOWLIST, allowlist.strip())
    if clear_shodan_api_key:
        set_setting(db, SETTING_SHODAN_KEY, "")
    elif shodan_api_key is not None and shodan_api_key.strip():
        set_setting(db, SETTING_SHODAN_KEY, encrypt_secret(shodan_api_key.strip()))
    if clear_module_tokens:
        for mid in clear_module_tokens:
            clear_module_token(db, str(mid))
    if module_tokens:
        for mid, tok in module_tokens.items():
            if tok is None:
                continue
            set_module_token(db, str(mid), str(tok))
    if shodan_mock is not None:
        set_setting(db, SETTING_SHODAN_MOCK, "true" if shodan_mock else "false")
    if shodan_modes_enabled is not None:
        set_setting(
            db,
            SETTING_SHODAN_MODES,
            json.dumps(_normalize_shodan_modes(shodan_modes_enabled), ensure_ascii=False),
        )
    if shodan_rate_limit_hint is not None:
        set_setting(db, SETTING_SHODAN_RATE, str(_clamp_int(str(shodan_rate_limit_hint), 1, 1, 60)))
    if nmap_default_ports is not None:
        set_setting(db, SETTING_NMAP_PORTS, nmap_default_ports.strip())
    if nmap_default_profile is not None:
        set_setting(db, SETTING_NMAP_PROFILE, _normalize_nmap_profile(nmap_default_profile))
    if nmap_default_timing is not None:
        set_setting(db, SETTING_NMAP_TIMING, str(_clamp_int(str(nmap_default_timing), 3, 0, 5)))
    if nmap_default_sv is not None:
        set_setting(db, SETTING_NMAP_SV, "true" if nmap_default_sv else "false")
    if nmap_default_os is not None:
        set_setting(db, SETTING_NMAP_OS, "true" if nmap_default_os else "false")
    if nmap_default_aggressive is not None:
        set_setting(db, SETTING_NMAP_AGGRESSIVE, "true" if nmap_default_aggressive else "false")
    if nmap_default_scripts is not None:
        set_setting(db, SETTING_NMAP_SCRIPTS, nmap_default_scripts.strip())
    if nmap_default_top_ports is not None:
        set_setting(db, SETTING_NMAP_TOP_PORTS, str(nmap_default_top_ports).strip())
    if nmap_default_exclude is not None:
        set_setting(db, SETTING_NMAP_EXCLUDE, nmap_default_exclude.strip())
    if zap_timeout_sec is not None:
        set_setting(db, SETTING_ZAP_TIMEOUT, str(_clamp_int(str(zap_timeout_sec), 300, 30, 7200)))
    if zap_default_scan_type is not None:
        set_setting(db, SETTING_ZAP_SCAN_TYPE, _normalize_zap_scan_type(zap_default_scan_type))
    if zap_default_ajax_spider is not None:
        set_setting(db, SETTING_ZAP_AJAX, "true" if zap_default_ajax_spider else "false")
    if zap_default_context_name is not None:
        set_setting(db, SETTING_ZAP_CONTEXT, zap_default_context_name.strip())
    if zap_default_context_user is not None:
        set_setting(db, SETTING_ZAP_CONTEXT_USER, zap_default_context_user.strip())
    if clear_zap_default_credential:
        set_setting(db, SETTING_ZAP_CREDENTIAL, "")
    elif zap_default_credential_id is not None:
        if zap_default_credential_id <= 0:
            set_setting(db, SETTING_ZAP_CREDENTIAL, "")
        else:
            from app.services import scan_credentials as cred_svc

            cred_svc.get_credential(db, zap_default_credential_id)
            set_setting(db, SETTING_ZAP_CREDENTIAL, str(zap_default_credential_id))
    if nuclei_default_templates is not None:
        set_setting(db, SETTING_NUCLEI_TEMPLATES, nuclei_default_templates.strip())
    if nuclei_rate_limit is not None:
        set_setting(db, SETTING_NUCLEI_RATE, str(_clamp_int(str(nuclei_rate_limit), 150, 1, 10000)))
    if gowitness_timeout_sec is not None:
        set_setting(
            db,
            SETTING_GOWITNESS_TIMEOUT,
            str(_clamp_int(str(gowitness_timeout_sec), 60, 10, 600)),
        )
    if gowitness_default_resolution is not None:
        set_setting(db, SETTING_GOWITNESS_RESOLUTION, gowitness_default_resolution.strip() or "1440x900")
    if gowitness_default_fullpage is not None:
        set_setting(
            db,
            SETTING_GOWITNESS_FULLPAGE,
            "true" if gowitness_default_fullpage else "false",
        )
    return get_module_admin_settings(db)


def get_worker_runtime_config(db: Session) -> dict[str, Any]:
    """Non-secret runtime settings for sidecars. Shodan key is never returned here."""
    admin = get_module_admin_settings(db)
    return {
        "allowlist": admin["allowlist"],
        "shodan_api_key_set": bool(admin["shodan_api_key_set"]),
        "shodan_mock": admin["shodan_mock"],
        "shodan_modes_enabled": admin["shodan_modes_enabled"],
        "shodan_rate_limit_hint": admin["shodan_rate_limit_hint"],
        "nmap_default_ports": admin["nmap_default_ports"],
        "nmap_default_profile": admin["nmap_default_profile"],
        "nmap_default_timing": admin["nmap_default_timing"],
        "nmap_default_sv": admin["nmap_default_sv"],
        "nmap_default_os": admin["nmap_default_os"],
        "nmap_default_aggressive": admin["nmap_default_aggressive"],
        "nmap_default_scripts": admin["nmap_default_scripts"],
        "nmap_default_top_ports": admin["nmap_default_top_ports"],
        "nmap_default_exclude": admin["nmap_default_exclude"],
        "zap_timeout_sec": admin["zap_timeout_sec"],
        "zap_default_scan_type": admin["zap_default_scan_type"],
        "zap_default_ajax_spider": admin["zap_default_ajax_spider"],
        "zap_default_context_name": admin["zap_default_context_name"],
        "zap_default_context_user": admin["zap_default_context_user"],
        "zap_default_credential_id": admin["zap_default_credential_id"],
        "nuclei_default_templates": _effective_nuclei_templates(admin["nuclei_default_templates"]),
        "nuclei_rate_limit": admin["nuclei_rate_limit"],
        "gowitness_timeout_sec": admin["gowitness_timeout_sec"],
        "gowitness_default_resolution": admin["gowitness_default_resolution"],
        "gowitness_default_fullpage": admin["gowitness_default_fullpage"],
        "disabled_modules": admin["disabled_modules"],
    }


def _effective_nuclei_templates(admin_value: str) -> str:
    """Prefer admin override; else shared catalog path for workers."""
    try:
        from app.services.nuclei_templates import resolve_effective_default_templates

        return resolve_effective_default_templates(admin_value)
    except Exception:
        return (admin_value or "").strip()

def _job_out(job: ScanJob) -> dict[str, Any]:
    return {
        "id": job.id,
        "module_id": job.module_id,
        "status": job.status,
        "kind": getattr(job, "kind", None) or "scan",
        "parent_job_id": getattr(job, "parent_job_id", None),
        "created_by": job.created_by,
        "params": _json_loads(job.params_json, {}),
        "progress": _json_loads(job.progress_json, {}),
        "error": job.error or "",
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "lease_owner": job.lease_owner,
        "leased_at": job.leased_at.isoformat() if job.leased_at else None,
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }


def _finding_out(f: Finding, asset: Asset | None = None) -> dict[str, Any]:
    evidence = _json_loads(f.evidence_json, {})
    host = ""
    ip = ""
    if asset is not None:
        host = asset.hostname or ""
        ip = asset.ip or ""
    if not host and isinstance(evidence, dict):
        host = str(evidence.get("hostname") or evidence.get("host") or "")
        url = str(evidence.get("url") or "")
        if not host and url:
            try:
                from urllib.parse import urlparse

                host = urlparse(url).hostname or ""
            except Exception:
                pass
    if not ip and isinstance(evidence, dict):
        ip = str(evidence.get("ip") or "")
    label = host or ip or ""
    return {
        "id": f.id,
        "scan_job_id": f.scan_job_id,
        "module_id": f.module_id,
        "asset_id": f.asset_id,
        "asset_hostname": host or None,
        "asset_ip": ip or None,
        "asset_label": label or None,
        "title": f.title,
        "severity": f.severity,
        "status": f.status,
        "evidence": evidence if isinstance(evidence, dict) else {},
        "raw_ref": f.raw_ref or "",
        "linked_cve_ids": _json_loads(f.linked_cve_ids_json, []),
        "linked_bdu_ids": _json_loads(f.linked_bdu_ids_json, []),
        "ticket_id": f.ticket_id,
        "fingerprint": getattr(f, "fingerprint", None) or "",
        "last_seen_at": f.last_seen_at.isoformat() if getattr(f, "last_seen_at", None) else None,
        "closed_at": f.closed_at.isoformat() if getattr(f, "closed_at", None) else None,
        "assignee_user_id": getattr(f, "assignee_user_id", None),
        "occurrence_count": int(getattr(f, "occurrence_count", None) or 1),
        "risk_score": int(getattr(f, "risk_score", None) or 0),
        "priority": getattr(f, "priority", None) or "medium",
        "due_at": f.due_at.isoformat() if getattr(f, "due_at", None) else None,
        "sla_hours": getattr(f, "sla_hours", None),
        "acceptance_reason": getattr(f, "acceptance_reason", None) or "",
        "accepted_until": f.accepted_until.isoformat() if getattr(f, "accepted_until", None) else None,
        "tags": _json_loads(getattr(f, "tags_json", None) or "[]", []),
        "external_ref": getattr(f, "external_ref", None) or "",
        "project_id": getattr(f, "project_id", None),
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


def _asset_out(a: Asset, *, findings_count: int | None = None) -> dict[str, Any]:
    owner_username = None
    if getattr(a, "owner", None) is not None:
        owner_username = a.owner.username
    out = {
        "id": a.id,
        "kind": a.kind,
        "hostname": a.hostname,
        "ip": a.ip,
        "ports": _json_loads(a.ports_json, []),
        "tags": _json_loads(a.tags_json, []),
        "segment": getattr(a, "segment", None) or "",
        "criticality": getattr(a, "criticality", None) or "medium",
        "org_unit_id": getattr(a, "org_unit_id", None),
        "owner_user_id": getattr(a, "owner_user_id", None),
        "owner_username": owner_username,
        "last_seen_at": a.last_seen_at.isoformat() if a.last_seen_at else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "label": (a.hostname or a.ip or f"asset-{a.id}"),
    }
    if findings_count is not None:
        out["findings_count"] = findings_count
    return out


def _norm_segment(segment: str | None) -> str:
    return (segment or "").strip()[:128]


def _resolve_owner_user_id(db: Session, owner_user_id: int | None) -> int | None:
    if owner_user_id is None:
        return None
    user = db.get(User, int(owner_user_id))
    if not user:
        raise ValueError(f"Владелец не найден (user_id={owner_user_id})")
    if user.status == "disabled":
        raise ValueError("Нельзя назначить отключённого пользователя владельцем")
    return user.id


def get_assets_tags_taxonomy(db: Session) -> list[str]:
    raw = get_setting(db, SETTING_ASSETS_TAGS_TAXONOMY, "")
    tags = _json_loads(raw, None)
    if not isinstance(tags, list) or not tags:
        tags = list(DEFAULT_ASSETS_TAGS)
        set_setting(db, SETTING_ASSETS_TAGS_TAXONOMY, json.dumps(tags, ensure_ascii=False))
        db.commit()
    out: list[str] = []
    seen: set[str] = set()
    for item in tags:
        s = str(item).strip()
        key = s.lower()
        if not s or key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def list_asset_owner_options(db: Session) -> list[dict[str, Any]]:
    rows = (
        db.query(User)
        .filter(User.status == "active")
        .order_by(User.username.asc())
        .limit(500)
        .all()
    )
    return [
        {"id": u.id, "username": u.username, "full_name": u.full_name or ""}
        for u in rows
    ]


def register_module(
    db: Session,
    *,
    module_id: str,
    version: str = "",
    capabilities: list | dict | None = None,
) -> ModuleRegistry:
    mid = (module_id or "").strip()
    if not mid:
        raise ValueError("module id required")
    caps = capabilities if capabilities is not None else []
    row = db.get(ModuleRegistry, mid)
    now = utcnow()
    if not row:
        row = ModuleRegistry(
            id=mid,
            version=(version or "")[:64],
            last_seen_at=now,
            capabilities_json=json.dumps(caps, ensure_ascii=False),
        )
        db.add(row)
    else:
        row.version = (version or row.version or "")[:64]
        row.last_seen_at = now
        row.capabilities_json = json.dumps(caps, ensure_ascii=False)
    db.commit()
    db.refresh(row)
    mq.set_presence(
        mid,
        {"id": mid, "version": row.version, "capabilities": caps, "last_seen_at": now.isoformat()},
    )
    return row


def list_modules(db: Session) -> list[dict[str, Any]]:
    online = mq.list_online_module_ids()
    disabled = _disabled_modules(db)
    rows = db.query(ModuleRegistry).order_by(ModuleRegistry.id.asc()).all()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        seen.add(row.id)
        caps = _json_loads(row.capabilities_json, [])
        is_online = row.id in online or mq.get_presence(row.id) is not None
        out.append(
            {
                "id": row.id,
                "version": row.version,
                "capabilities": caps,
                "online": is_online,
                "enabled": row.id not in disabled,
                "last_seen_at": row.last_seen_at.isoformat() if row.last_seen_at else None,
            }
        )
    for mid in sorted(online - seen):
        presence = mq.get_presence(mid) or {}
        out.append(
            {
                "id": mid,
                "version": str(presence.get("version") or ""),
                "capabilities": presence.get("capabilities") or [],
                "online": True,
                "enabled": mid not in disabled,
                "last_seen_at": presence.get("last_seen_at"),
            }
        )
    return out


def enqueue_scan(
    db: Session,
    *,
    module_id: str,
    actor: User,
    params: dict | None = None,
    kind: str = "scan",
    parent_job_id: int | None = None,
) -> ScanJob:
    mid = (module_id or "").strip()
    if not mid:
        raise ValueError("module id required")
    disabled = _disabled_modules(db)
    if mid in disabled:
        raise ValueError(f"Модуль «{mid}» отключён в настройках")
    _enforce_enqueue_allowlist(db, params)
    job = ScanJob(
        module_id=mid,
        status="pending",
        kind=(kind or "scan").strip()[:32] or "scan",
        parent_job_id=parent_job_id,
        created_by=actor.id,
        params_json=json.dumps(params or {}, ensure_ascii=False),
        progress_json="{}",
        error="",
        created_at=utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    mq.enqueue_job(mid, job.id)
    job.status = "queued"
    db.commit()
    db.refresh(job)
    return job


def list_jobs(
    db: Session,
    *,
    module_id: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    q = db.query(ScanJob)
    if module_id:
        q = q.filter(ScanJob.module_id == module_id.strip())
    if status:
        q = q.filter(ScanJob.status == status.strip())
    total = q.count()
    rows = (
        q.order_by(ScanJob.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": [_job_out(j) for j in rows],
    }


def get_job(db: Session, job_id: int) -> ScanJob:
    job = db.query(ScanJob).filter(ScanJob.id == job_id).first()
    if not job:
        raise LookupError("Job not found")
    return job


def get_finding(db: Session, finding_id: int) -> Finding:
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise LookupError("Finding not found")
    return finding


def finding_detail(db: Session, finding_id: int) -> dict[str, Any]:
    finding = get_finding(db, finding_id)
    asset = None
    if finding.asset_id:
        asset = db.query(Asset).filter(Asset.id == finding.asset_id).first()
    return _finding_out(finding, asset)


def finding_artifact_keys(finding: Finding) -> set[str]:
    """Collect artifact_key / thumbnail_artifact_key from evidence JSON."""
    evidence = _json_loads(finding.evidence_json, {})
    keys: set[str] = set()
    if not isinstance(evidence, dict):
        return keys
    for field in ("artifact_key", "thumbnail_artifact_key"):
        val = evidence.get(field)
        if isinstance(val, str) and val.strip():
            try:
                keys.add(artifacts_svc.sanitize_artifact_key(val.strip()))
            except ValueError:
                continue
    return keys


def cancel_job(db: Session, job_id: int, *, actor: User | None = None) -> ScanJob:
    """Cancel a pending/queued/running job. Workers must stop on heartbeat/results."""
    job = get_job(db, job_id)
    if job.status in _TERMINAL_STATUSES:
        raise ValueError(f"Job already {job.status}; cancel not allowed")
    if job.status not in _ACTIVE_STATUSES:
        raise ValueError(f"Job is {job.status}; cancel not allowed")

    # pending/queued → cancelled; running → aborted (in-flight abort)
    final = "aborted" if job.status == "running" else "cancelled"
    now = utcnow()
    job.status = final
    job.finished_at = now
    job.lease_owner = None
    job.leased_at = None
    prev = (job.error or "").strip()
    who = f"user:{actor.id}" if actor and actor.id else "api"
    note = f"cancelled by {who}"
    job.error = f"{prev} | {note}" if prev else note
    mq.remove_job(job.module_id, job.id)
    db.commit()
    db.refresh(job)
    mq.incr_metric(mq.METRIC_JOBS_CANCELLED, 1)
    mq.set_presence(
        job.module_id,
        {
            "id": job.module_id,
            "job_id": job.id,
            "status": job.status,
            "last_seen_at": now.isoformat(),
            "idle": True,
        },
    )
    return job


def get_scan_stats(db: Session) -> dict[str, Any]:
    """Lease + scan observability for /metrics and /modules/stats."""
    running = db.query(ScanJob).filter(ScanJob.status == "running").count()
    queued = (
        db.query(ScanJob)
        .filter(ScanJob.status.in_(["pending", "queued"]))
        .count()
    )
    cancelled = (
        db.query(ScanJob)
        .filter(ScanJob.status.in_(list(_CANCELLED_STATUSES)))
        .count()
    )
    raw = mq.get_all_metrics()
    wait_count = int(raw.get(mq.METRIC_CLAIM_WAIT_COUNT) or 0)
    wait_sum = int(raw.get(mq.METRIC_CLAIM_WAIT_SUM_MS) or 0)
    lat_count = int(raw.get(mq.METRIC_CLAIM_LATENCY_COUNT) or 0)
    lat_sum = int(raw.get(mq.METRIC_CLAIM_LATENCY_SUM_MS) or 0)
    return {
        "running_jobs": int(running),
        "queued_jobs": int(queued),
        "cancelled_jobs": int(cancelled),
        "stale_leases_reclaimed": int(raw.get(mq.METRIC_STALE_LEASES) or 0),
        "findings_created": int(raw.get(mq.METRIC_FINDINGS_CREATED) or 0),
        "allowlist_denials_enqueue": int(raw.get(mq.METRIC_ALLOWLIST_ENQUEUE) or 0),
        "allowlist_denials_ingest": int(raw.get(mq.METRIC_ALLOWLIST_INGEST) or 0),
        "jobs_cancelled": int(raw.get(mq.METRIC_JOBS_CANCELLED) or 0),
        "claim_wait_last_ms": int(raw.get(mq.METRIC_CLAIM_WAIT_LAST_MS) or 0),
        "claim_wait_avg_ms": round(wait_sum / wait_count, 1) if wait_count else None,
        "claim_latency_last_ms": int(raw.get(mq.METRIC_CLAIM_LATENCY_LAST_MS) or 0),
        "claim_latency_avg_ms": round(lat_sum / lat_count, 1) if lat_count else None,
        "lease_ttl_sec": _lease_ttl_seconds(),
    }


def _lease_ttl_seconds() -> int:
    try:
        return max(60, int(os.environ.get("VBX_SCAN_LEASE_TTL_SEC", "300") or "300"))
    except ValueError:
        return 300


def _reclaim_stale_leases(db: Session, *, module_id: str) -> int:
    """Return abandoned running jobs to queued when lease TTL expires."""
    cutoff = utcnow() - timedelta(seconds=_lease_ttl_seconds())
    stale = (
        db.query(ScanJob)
        .filter(
            ScanJob.module_id == module_id,
            ScanJob.status == "running",
            ScanJob.leased_at.isnot(None),
            ScanJob.leased_at < cutoff,
        )
        .all()
    )
    n = 0
    for job in stale:
        job.status = "queued"
        job.lease_owner = None
        job.leased_at = None
        suffix = "lease expired; requeued"
        prev = (job.error or "").strip()
        job.error = f"{prev} | {suffix}" if prev else suffix
        n += 1
        mq.enqueue_job(module_id, job.id)
    if n:
        db.commit()
        mq.incr_metric(mq.METRIC_STALE_LEASES, n)
    return n


def _try_claim_job_row(db: Session, job: ScanJob, *, owner: str) -> ScanJob | None:
    """Atomically transition pending/queued → running; None if lost the race."""
    now = utcnow()
    updated = (
        db.query(ScanJob)
        .filter(ScanJob.id == job.id, ScanJob.status.in_(["pending", "queued"]))
        .update(
            {
                "status": "running",
                "lease_owner": owner,
                "leased_at": now,
            },
            synchronize_session=False,
        )
    )
    if updated != 1:
        db.rollback()
        return None
    claimed = db.get(ScanJob, job.id)
    if not claimed:
        db.rollback()
        return None
    if claimed.started_at is None:
        claimed.started_at = now
    db.commit()
    db.refresh(claimed)
    return claimed


def claim_next_job(
    db: Session,
    *,
    module_id: str,
    lease_owner: str,
) -> ScanJob | None:
    t0 = time.perf_counter()
    mid = (module_id or "").strip()
    owner = (lease_owner or "").strip()[:128]
    if not mid:
        raise ValueError("module_id required")
    if not owner:
        raise ValueError("lease_owner required")
    if mid in _disabled_modules(db):
        mq.set_presence(mid, {"id": mid, "lease_owner": owner, "idle": True, "disabled": True})
        mq.record_claim_latency_ms((time.perf_counter() - t0) * 1000)
        return None

    _reclaim_stale_leases(db, module_id=mid)

    candidates: list[ScanJob] = []
    job_id = mq.claim_job_id(mid)
    if job_id is not None:
        queued = db.get(ScanJob, job_id)
        if queued and queued.module_id == mid and queued.status in {"pending", "queued"}:
            candidates.append(queued)
        elif queued and queued.status in _CANCELLED_STATUSES:
            # Drop cancelled id that lingered in the queue
            pass

    if not candidates:
        # Recover pending/queued jobs if Redis/local queue was lost
        candidates = (
            db.query(ScanJob)
            .filter(ScanJob.module_id == mid, ScanJob.status.in_(["pending", "queued"]))
            .order_by(ScanJob.id.asc())
            .limit(5)
            .all()
        )

    job: ScanJob | None = None
    for candidate in candidates:
        job = _try_claim_job_row(db, candidate, owner=owner)
        if job:
            break

    if not job:
        mq.set_presence(mid, {"id": mid, "lease_owner": owner, "idle": True})
        mq.record_claim_latency_ms((time.perf_counter() - t0) * 1000)
        return None

    now = utcnow()
    if job.created_at:
        try:
            wait_ms = max(0.0, (now - job.created_at).total_seconds() * 1000)
            mq.record_claim_wait_ms(wait_ms)
        except Exception:
            pass

    reg = db.get(ModuleRegistry, mid)
    if reg:
        reg.last_seen_at = now
        db.commit()

    mq.set_presence(
        mid,
        {
            "id": mid,
            "lease_owner": owner,
            "job_id": job.id,
            "last_seen_at": now.isoformat(),
        },
    )
    mq.record_claim_latency_ms((time.perf_counter() - t0) * 1000)
    return job


def heartbeat_job(
    db: Session,
    *,
    job_id: int,
    lease_owner: str | None = None,
    progress: dict | None = None,
    error: str | None = None,
) -> ScanJob:
    job = get_job(db, job_id)
    if job.status in _CANCELLED_STATUSES:
        raise ValueError(f"Job is {job.status}; abort work and discard results")
    if job.status not in {"running", "queued", "pending"}:
        raise ValueError(f"Job is {job.status}, heartbeat not allowed")
    now = utcnow()
    if lease_owner:
        if job.lease_owner and job.lease_owner != lease_owner:
            raise PermissionError("Lease owner mismatch")
        job.lease_owner = lease_owner[:128]
    job.leased_at = now
    if progress is not None:
        job.progress_json = json.dumps(progress, ensure_ascii=False)
    if error is not None:
        job.error = error
    db.commit()
    db.refresh(job)
    mq.set_presence(
        job.module_id,
        {
            "id": job.module_id,
            "lease_owner": job.lease_owner,
            "job_id": job.id,
            "last_seen_at": now.isoformat(),
        },
    )
    return job


def _norm_hostname(hostname: str | None) -> str:
    return (hostname or "").strip().lower()[:255]


def _norm_ip(ip: str | None) -> str:
    return (ip or "").strip().lower()[:64]


def _port_key(item: Any) -> str:
    if isinstance(item, dict):
        if "port" in item:
            return f"p:{item.get('port')}"
        return f"d:{json.dumps(item, sort_keys=True, ensure_ascii=False)}"
    return f"v:{item}"


def _merge_ports(existing: list | None, incoming: list | None) -> list:
    out: list[Any] = []
    seen: set[str] = set()
    for src in (existing or [], incoming or []):
        if not isinstance(src, list):
            continue
        for item in src:
            key = _port_key(item)
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
    return out


def _merge_tags(existing: list | None, incoming: list | None) -> list:
    out: list[Any] = []
    seen: set[str] = set()
    for src in (existing or [], incoming or []):
        if not isinstance(src, list):
            continue
        for item in src:
            key = str(item).strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(item if not isinstance(item, str) else item.strip())
    return out


def find_asset_by_identity(
    db: Session,
    *,
    hostname: str = "",
    ip: str = "",
) -> Asset | None:
    host = _norm_hostname(hostname)
    addr = _norm_ip(ip)
    row: Asset | None = None
    if addr:
        row = (
            db.query(Asset)
            .filter(Asset.ip.ilike(addr))
            .order_by(Asset.id.asc())
            .first()
        )
    if row is None and host:
        row = (
            db.query(Asset)
            .filter(Asset.hostname.ilike(host))
            .order_by(Asset.id.asc())
            .first()
        )
    return row


def upsert_asset(
    db: Session,
    *,
    hostname: str = "",
    ip: str = "",
    ports: list | None = None,
    tags: list | None = None,
    kind: str = "host",
    segment: str | None = None,
    owner_user_id: int | None = None,
    merge: bool = True,
) -> Asset | None:
    """Create or merge an asset. Matching is case-insensitive on IP/hostname.

    When merge=True (default), ports and tags are unioned; missing hostname/IP
    fields are filled in. When merge=False, provided ports/tags replace existing.
    """
    host = _norm_hostname(hostname)
    addr = _norm_ip(ip)
    if not host and not addr:
        return None

    row = find_asset_by_identity(db, hostname=host, ip=addr)
    now = utcnow()

    if row is None:
        row = Asset(
            kind=(kind or "host")[:64],
            hostname=host,
            ip=addr,
            ports_json=json.dumps(ports if ports is not None else [], ensure_ascii=False),
            tags_json=json.dumps(tags if tags is not None else [], ensure_ascii=False),
            segment=_norm_segment(segment) if segment is not None else "",
            owner_user_id=owner_user_id,
            last_seen_at=now,
            created_at=now,
        )
        db.add(row)
        db.flush()
        return row

    if host:
        row.hostname = host
    if addr:
        row.ip = addr
    if kind:
        row.kind = (kind or row.kind or "host")[:64]
    if segment is not None and (not merge or not (row.segment or "").strip()):
        row.segment = _norm_segment(segment)
    if owner_user_id is not None and (not merge or row.owner_user_id is None):
        row.owner_user_id = owner_user_id

    existing_ports = _json_loads(row.ports_json, [])
    existing_tags = _json_loads(row.tags_json, [])
    if ports is not None:
        merged_ports = _merge_ports(existing_ports, ports) if merge else ports
        row.ports_json = json.dumps(merged_ports, ensure_ascii=False)
    if tags is not None:
        merged_tags = _merge_tags(existing_tags, tags) if merge else tags
        row.tags_json = json.dumps(merged_tags, ensure_ascii=False)
    row.last_seen_at = now
    return row


def create_asset(
    db: Session,
    *,
    hostname: str = "",
    ip: str = "",
    ports: list | None = None,
    tags: list | None = None,
    kind: str = "host",
    segment: str = "",
    owner_user_id: int | None = None,
    criticality: str = "medium",
    org_unit_id: int | None = None,
) -> dict[str, Any]:
    host = _norm_hostname(hostname)
    addr = _norm_ip(ip)
    if not host and not addr:
        raise ValueError("Укажите hostname или IP")
    existing = find_asset_by_identity(db, hostname=host, ip=addr)
    if existing:
        raise ValueError(
            f"Узел уже существует (#{existing.id}): "
            f"{existing.hostname or existing.ip or existing.id}"
        )
    owner_id = _resolve_owner_user_id(db, owner_user_id)
    row = upsert_asset(
        db,
        hostname=host,
        ip=addr,
        ports=ports if ports is not None else [],
        tags=tags if tags is not None else [],
        kind=kind or "host",
        segment=segment,
        owner_user_id=owner_id,
        merge=False,
    )
    if not row:
        raise ValueError("Не удалось создать узел")
    crit = (criticality or "medium").strip().lower()
    if crit not in ("low", "medium", "high", "critical"):
        crit = "medium"
    row.criticality = crit
    if org_unit_id is not None:
        row.org_unit_id = org_unit_id
    db.commit()
    db.refresh(row)
    if row.owner_user_id:
        _ = row.owner
    return _asset_out(row, findings_count=0)


def update_asset(
    db: Session,
    asset_id: int,
    *,
    hostname: str | None = None,
    ip: str | None = None,
    ports: list | None = None,
    tags: list | None = None,
    kind: str | None = None,
    segment: str | None = None,
    owner_user_id: int | None = None,
    clear_owner: bool = False,
    criticality: str | None = None,
    org_unit_id: int | None = None,
    clear_org_unit: bool = False,
) -> dict[str, Any]:
    row = db.get(Asset, asset_id)
    if not row:
        raise LookupError("Asset not found")

    new_host = _norm_hostname(hostname) if hostname is not None else _norm_hostname(row.hostname)
    new_ip = _norm_ip(ip) if ip is not None else _norm_ip(row.ip)
    if hostname is not None or ip is not None:
        if not new_host and not new_ip:
            raise ValueError("Укажите hostname или IP")
        clash = find_asset_by_identity(db, hostname=new_host, ip=new_ip)
        if clash and clash.id != row.id:
            raise ValueError(f"Конфликт с узлом #{clash.id}")

    if hostname is not None:
        row.hostname = new_host
    if ip is not None:
        row.ip = new_ip
    if kind is not None:
        row.kind = (kind or "host")[:64]
    if ports is not None:
        row.ports_json = json.dumps(ports if isinstance(ports, list) else [], ensure_ascii=False)
    if tags is not None:
        row.tags_json = json.dumps(tags if isinstance(tags, list) else [], ensure_ascii=False)
    if segment is not None:
        row.segment = _norm_segment(segment)
    if criticality is not None:
        crit = criticality.strip().lower()
        if crit not in ("low", "medium", "high", "critical"):
            raise ValueError("invalid criticality")
        row.criticality = crit
    if clear_org_unit:
        row.org_unit_id = None
    elif org_unit_id is not None:
        row.org_unit_id = org_unit_id
    if clear_owner:
        row.owner_user_id = None
    elif owner_user_id is not None:
        row.owner_user_id = _resolve_owner_user_id(db, owner_user_id)
    row.last_seen_at = utcnow()
    db.commit()
    db.refresh(row)
    if row.owner_user_id:
        _ = row.owner
    count = db.query(Finding).filter(Finding.asset_id == row.id).count()
    return _asset_out(row, findings_count=count)


def merge_assets(db: Session, source_id: int, into_asset_id: int) -> dict[str, Any]:
    """Merge source asset into target: move findings, union ports/tags, delete source."""
    if source_id == into_asset_id:
        raise ValueError("Нельзя слить узел сам в себя")
    source = db.get(Asset, source_id)
    if not source:
        raise LookupError("Исходный узел не найден")
    target = db.get(Asset, into_asset_id)
    if not target:
        raise LookupError("Целевой узел не найден")

    moved = (
        db.query(Finding)
        .filter(Finding.asset_id == source_id)
        .update({Finding.asset_id: into_asset_id}, synchronize_session=False)
    )

    target.ports_json = json.dumps(
        _merge_ports(_json_loads(target.ports_json, []), _json_loads(source.ports_json, [])),
        ensure_ascii=False,
    )
    target.tags_json = json.dumps(
        _merge_tags(_json_loads(target.tags_json, []), _json_loads(source.tags_json, [])),
        ensure_ascii=False,
    )
    if not (target.hostname or "").strip() and (source.hostname or "").strip():
        clash = find_asset_by_identity(db, hostname=source.hostname, ip="")
        if clash is None or clash.id in (source.id, target.id):
            target.hostname = _norm_hostname(source.hostname)
    if not (target.ip or "").strip() and (source.ip or "").strip():
        clash = find_asset_by_identity(db, hostname="", ip=source.ip)
        if clash is None or clash.id in (source.id, target.id):
            target.ip = _norm_ip(source.ip)
    if not (target.segment or "").strip() and (source.segment or "").strip():
        target.segment = _norm_segment(source.segment)
    if target.owner_user_id is None and source.owner_user_id is not None:
        target.owner_user_id = source.owner_user_id
    if source.last_seen_at and (
        target.last_seen_at is None or source.last_seen_at > target.last_seen_at
    ):
        target.last_seen_at = source.last_seen_at
    else:
        target.last_seen_at = utcnow()

    source.hostname = ""
    source.ip = ""
    db.delete(source)
    db.commit()
    db.refresh(target)
    if target.owner_user_id:
        _ = target.owner
    count = db.query(Finding).filter(Finding.asset_id == target.id).count()
    return {
        "source_asset_id": source_id,
        "target": _asset_out(target, findings_count=count),
        "moved_findings": int(moved),
        "message": (
            f"Узел #{source_id} слит в #{into_asset_id}; "
            f"перенесено находок: {int(moved)}"
        ),
    }


def delete_asset(db: Session, asset_id: int) -> dict[str, Any]:
    """Delete asset; findings are kept with asset_id set to NULL (unlink)."""
    row = db.get(Asset, asset_id)
    if not row:
        raise LookupError("Asset not found")
    unlinked = (
        db.query(Finding)
        .filter(Finding.asset_id == asset_id)
        .update({Finding.asset_id: None}, synchronize_session=False)
    )
    snapshot = _asset_out(row, findings_count=0)
    db.delete(row)
    db.commit()
    return {"deleted": True, "asset_id": asset_id, "unlinked_findings": int(unlinked), "asset": snapshot}


def _extract_asset_evidence(finding: Finding, linked: Asset | None) -> dict[str, Any]:
    evidence = _json_loads(finding.evidence_json, {})
    if not isinstance(evidence, dict):
        evidence = {}

    host = str(
        evidence.get("hostname")
        or evidence.get("host")
        or evidence.get("fqdn")
        or (linked.hostname if linked else "")
        or ""
    )
    addr = str(
        evidence.get("ip")
        or evidence.get("address")
        or (linked.ip if linked else "")
        or ""
    )
    target = str(evidence.get("target") or "").strip()
    if not host and not addr and target:
        if any(c.isalpha() for c in target):
            host = target
        else:
            addr = target

    ports: list[Any] = []
    if isinstance(evidence.get("ports"), list):
        ports = list(evidence["ports"])
    elif evidence.get("port") is not None:
        ports = [evidence.get("port")]
    if linked:
        ports = _merge_ports(_json_loads(linked.ports_json, []), ports)

    tags: list[Any] = []
    if isinstance(evidence.get("tags"), list):
        tags = list(evidence["tags"])
    if linked:
        tags = _merge_tags(_json_loads(linked.tags_json, []), tags)

    kind = str(evidence.get("kind") or (linked.kind if linked else "") or "host")
    return {
        "hostname": host,
        "ip": addr,
        "ports": ports,
        "tags": tags,
        "kind": kind,
    }


def promote_finding_to_asset(db: Session, finding_id: int) -> dict[str, Any]:
    """Create or merge inventory asset from finding evidence and link the finding.

    Permission for the HTTP layer: scan:run.
    """
    finding = db.get(Finding, finding_id)
    if not finding:
        raise LookupError("Finding not found")

    linked = db.get(Asset, finding.asset_id) if finding.asset_id else None
    payload = _extract_asset_evidence(finding, linked)
    host = _norm_hostname(payload["hostname"])
    addr = _norm_ip(payload["ip"])
    if not host and not addr:
        raise ValueError("В находке нет hostname/IP для добавления в узлы")

    existing = find_asset_by_identity(db, hostname=host, ip=addr)
    created = existing is None
    asset = upsert_asset(
        db,
        hostname=host,
        ip=addr,
        ports=payload["ports"] if payload["ports"] else None,
        tags=payload["tags"] if payload["tags"] else None,
        kind=str(payload.get("kind") or "host"),
        merge=True,
    )
    if not asset:
        raise ValueError("Не удалось создать узел")

    already_linked = finding.asset_id == asset.id
    finding.asset_id = asset.id
    db.commit()
    db.refresh(finding)
    db.refresh(asset)

    if created:
        message = f"Узел #{asset.id} создан и находка привязана"
    elif already_linked:
        message = f"Находка уже связана с узлом #{asset.id}; порты/теги обновлены"
    else:
        message = f"Узел уже существует (#{asset.id}); находка привязана"

    count = db.query(Finding).filter(Finding.asset_id == asset.id).count()
    out = {
        "asset": _asset_out(asset, findings_count=count),
        "finding": _finding_out(finding, asset),
        "created": created,
        "merged": not created,
        "message": message,
    }
    if not finding.ticket_id:
        try:
            n = ticket_svc.evaluate_auto_rules_for_findings(db, [finding])
            if n:
                db.refresh(finding)
                out["finding"] = _finding_out(finding, asset)
                out["tickets_created"] = n
        except Exception:
            pass
    return out


def ingest_results(
    db: Session,
    *,
    job_id: int,
    findings: list[dict],
    status: str = "success",
    error: str = "",
    progress: dict | None = None,
    lease_owner: str | None = None,
) -> dict[str, Any]:
    job = get_job(db, job_id)
    if job.status in _CANCELLED_STATUSES:
        # Soft-ignore: keep cancel status, do not create findings
        return {
            "job": _job_out(job),
            "created": 0,
            "updated": 0,
            "findings": [],
            "skipped_offlist": 0,
            "tickets_created": 0,
            "ignored": True,
            "message": f"Job is {job.status}; results ignored",
        }
    if job.status in {"success", "failed"}:
        raise ValueError(f"Job already {job.status}; results rejected")
    if job.lease_owner:
        if not lease_owner or job.lease_owner != lease_owner:
            raise PermissionError("Lease owner mismatch")

    created: list[Finding] = []
    updated: list[Finding] = []
    touched: list[Finding] = []
    allowlist = parse_allowlist_entries(get_setting(db, SETTING_ALLOWLIST, ""))
    skipped_offlist = 0
    now = utcnow()
    for item in findings or []:
        if not isinstance(item, dict):
            continue
        asset_payload = item.get("asset") or {}
        if (not isinstance(asset_payload, dict) or not (asset_payload.get("ip") or asset_payload.get("hostname"))) and item.get(
            "target"
        ):
            t = str(item.get("target") or "").strip()
            if _looks_like_ip(t):
                asset_payload = {"hostname": "", "ip": t}
            else:
                asset_payload = {"hostname": t, "ip": ""}
        if allowlist and isinstance(asset_payload, dict):
            check_vals = [
                str(asset_payload.get("ip") or ""),
                str(asset_payload.get("hostname") or ""),
                str(item.get("target") or ""),
            ]
            if not any(v and target_allowed(v, allowlist) for v in check_vals):
                skipped_offlist += 1
                continue
        asset = None
        host = ""
        ip = ""
        if isinstance(asset_payload, dict):
            host = str(asset_payload.get("hostname") or "")
            ip = str(asset_payload.get("ip") or "")
            asset = upsert_asset(
                db,
                hostname=host,
                ip=ip,
                ports=asset_payload.get("ports") if isinstance(asset_payload.get("ports"), list) else None,
                tags=asset_payload.get("tags") if isinstance(asset_payload.get("tags"), list) else None,
                kind=str(asset_payload.get("kind") or "host"),
            )

        cve_ids = item.get("cve_ids") or item.get("linked_cve_ids") or []
        bdu_ids = item.get("bdu_ids") or item.get("linked_bdu_ids") or []
        if not isinstance(cve_ids, list):
            cve_ids = []
        if not isinstance(bdu_ids, list):
            bdu_ids = []
        cve_ids = [str(c).upper().strip() for c in cve_ids if str(c).strip()]
        bdu_ids = [str(b).strip() for b in bdu_ids if str(b).strip()]

        evidence_raw = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
        evidence = artifacts_svc.normalize_finding_evidence(
            evidence_raw,
            module_id=job.module_id,
            job_id=job.id,
        )
        title = str(item.get("title") or "Finding")[:512]
        severity = normalize_severity(item.get("severity"))
        status_val = str(item.get("status") or "open")[:32]
        fp = compute_finding_fingerprint(
            module_id=job.module_id,
            title=title,
            hostname=host,
            ip=ip,
            evidence=evidence,
            cve_ids=cve_ids,
        )

        existing = (
            db.query(Finding)
            .filter(
                Finding.fingerprint == fp,
                Finding.status.in_(list(_OPEN_FINDING_STATUSES)),
            )
            .order_by(Finding.id.desc())
            .first()
        )
        if existing:
            existing.scan_job_id = job.id
            existing.last_seen_at = now
            existing.occurrence_count = int(existing.occurrence_count or 1) + 1
            existing.evidence_json = json.dumps(evidence, ensure_ascii=False)
            existing.raw_ref = str(item.get("raw_ref") or existing.raw_ref or "")[:512]
            existing.linked_cve_ids_json = json.dumps(cve_ids, ensure_ascii=False)
            existing.linked_bdu_ids_json = json.dumps(bdu_ids, ensure_ascii=False)
            if asset and not existing.asset_id:
                existing.asset_id = asset.id
            elif asset:
                existing.asset_id = asset.id
            if _severity_rank(severity) > _severity_rank(existing.severity):
                existing.severity = severity
            if status_val in _OPEN_FINDING_STATUSES:
                existing.status = status_val
            try:
                from app.services.finding_risk import apply_risk_and_sla

                apply_risk_and_sla(db, existing, asset=asset)
            except Exception:
                pass
            updated.append(existing)
            touched.append(existing)
            continue

        finding = Finding(
            scan_job_id=job.id,
            module_id=job.module_id,
            asset_id=asset.id if asset else None,
            title=title,
            severity=severity,
            status=status_val,
            evidence_json=json.dumps(evidence, ensure_ascii=False),
            raw_ref=str(item.get("raw_ref") or "")[:512],
            linked_cve_ids_json=json.dumps(cve_ids, ensure_ascii=False),
            linked_bdu_ids_json=json.dumps(bdu_ids, ensure_ascii=False),
            fingerprint=fp,
            last_seen_at=now,
            occurrence_count=1,
            created_at=now,
        )
        db.add(finding)
        db.flush()
        try:
            from app.services.finding_risk import apply_risk_and_sla

            apply_risk_and_sla(db, finding, asset=asset)
        except Exception:
            pass
        created.append(finding)
        touched.append(finding)

    final_status = (status or "success").strip().lower()
    if final_status in {"completed", "succeeded", "ok", "done"}:
        final_status = "success"
    if final_status not in {"success", "failed", "running"}:
        final_status = "success"
    prog = dict(progress) if isinstance(progress, dict) else {}
    if skipped_offlist:
        prog["skipped_offlist"] = skipped_offlist
    if prog:
        job.progress_json = json.dumps(prog, ensure_ascii=False)
    elif progress is not None:
        job.progress_json = json.dumps(progress, ensure_ascii=False)
    if error:
        job.error = error
    if final_status != "running":
        job.status = final_status
        job.finished_at = now
    else:
        job.status = "running"
        job.leased_at = now
    db.commit()
    for f in touched:
        db.refresh(f)
    db.refresh(job)

    tickets_created = 0
    if touched:
        try:
            tickets_created = ticket_svc.evaluate_auto_rules_for_findings(
                db,
                touched,
                preferred_user_id=job.created_by,
            )
            for f in touched:
                db.refresh(f)
        except Exception:
            tickets_created = 0

    try:
        from app.services import alert_policies as policy_svc

        for f in created:
            policy_svc.evaluate_trigger(
                db,
                "finding_created",
                text=f"[VBX] Finding #{f.id}: {f.title[:120]} (risk={f.risk_score})",
                finding=f,
                job=job,
            )
        if final_status == "success":
            policy_svc.evaluate_trigger(
                db,
                "scan_completed",
                text=f"[VBX] Scan job #{job.id} ({job.module_id}) completed",
                job=job,
            )
        elif final_status == "failed":
            policy_svc.evaluate_trigger(
                db,
                "scan_failed",
                text=f"[VBX] Scan job #{job.id} ({job.module_id}) failed: {(job.error or '')[:200]}",
                job=job,
            )
    except Exception:
        pass

    if created:
        mq.incr_metric(mq.METRIC_FINDINGS_CREATED, len(created))
    if skipped_offlist:
        mq.incr_metric(mq.METRIC_ALLOWLIST_INGEST, skipped_offlist)

    mq.set_presence(
        job.module_id,
        {
            "id": job.module_id,
            "lease_owner": job.lease_owner,
            "job_id": job.id,
            "last_seen_at": now.isoformat(),
            "status": job.status,
        },
    )
    return {
        "job": _job_out(job),
        "created": len(created),
        "updated": len(updated),
        "findings": [_finding_out(f) for f in touched],
        "skipped_offlist": skipped_offlist,
        "tickets_created": tickets_created,
        "ignored": False,
        "message": "",
    }


def list_findings(
    db: Session,
    *,
    module_id: str | None = None,
    scan_job_id: int | None = None,
    asset_id: int | None = None,
    severity: str | None = None,
    status: str | None = None,
    assignee_user_id: int | None = None,
    priority: str | None = None,
    project_id: int | None = None,
    tag: str | None = None,
    overdue: bool | None = None,
    min_risk: int | None = None,
    sort: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 25,
    org_unit_ids: set[int] | None = None,
    rbac_user: Any = None,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    query = db.query(Finding).outerjoin(Asset, Finding.asset_id == Asset.id)
    if module_id:
        query = query.filter(Finding.module_id == module_id.strip())
    if scan_job_id is not None:
        query = query.filter(Finding.scan_job_id == scan_job_id)
    if asset_id is not None:
        query = query.filter(Finding.asset_id == asset_id)
    if severity:
        sev = normalize_severity(severity)
        query = query.filter(Finding.severity == sev)
    if status:
        query = query.filter(Finding.status == status.strip())
    if assignee_user_id is not None:
        query = query.filter(Finding.assignee_user_id == assignee_user_id)
    if priority:
        query = query.filter(Finding.priority == priority.strip().lower())
    if project_id is not None:
        query = query.filter(Finding.project_id == project_id)
    if tag:
        like = f'%"{tag.strip()}"%'
        query = query.filter(Finding.tags_json.ilike(like))
    if overdue is True:
        now = utcnow()
        query = query.filter(
            Finding.due_at.isnot(None),
            Finding.due_at < now,
            Finding.status.in_(["open", "triaged", "new"]),
        )
    if min_risk is not None:
        query = query.filter(Finding.risk_score >= int(min_risk))
    if rbac_user is not None and not getattr(rbac_user, "is_super_admin", False):
        from app.services import org_rbac

        ids = org_unit_ids if org_unit_ids is not None else org_rbac.user_org_unit_ids(db, rbac_user)
        if ids:
            query = query.filter(
                or_(Asset.org_unit_id.in_(list(ids)), Asset.org_unit_id.is_(None), Finding.asset_id.is_(None))
            )
        else:
            query = query.filter(or_(Asset.org_unit_id.is_(None), Finding.asset_id.is_(None)))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Finding.title.ilike(like),
                Finding.module_id.ilike(like),
                Asset.hostname.ilike(like),
                Asset.ip.ilike(like),
            )
        )
    total = query.count()
    order = Finding.risk_score.desc() if (sort or "").lower() in ("risk", "risk_score", "-risk") else Finding.id.desc()
    rows = (
        query.order_by(order)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    asset_ids = {f.asset_id for f in rows if f.asset_id}
    assets: dict[int, Asset] = {}
    if asset_ids:
        for a in db.query(Asset).filter(Asset.id.in_(asset_ids)).all():
            assets[a.id] = a
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": [_finding_out(f, assets.get(f.asset_id) if f.asset_id else None) for f in rows],
    }


def export_findings_rows(
    db: Session,
    *,
    module_id: str | None = None,
    scan_job_id: int | None = None,
    asset_id: int | None = None,
    severity: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    project_id: int | None = None,
    tag: str | None = None,
    overdue: bool | None = None,
    min_risk: int | None = None,
    q: str | None = None,
    limit: int = 2000,
    rbac_user: Any = None,
) -> list[dict[str, Any]]:
    limit = min(max(1, limit), 5000)
    results: list[dict[str, Any]] = []
    page = 1
    total = None
    while len(results) < limit:
        chunk = list_findings(
            db,
            module_id=module_id,
            scan_job_id=scan_job_id,
            asset_id=asset_id,
            severity=severity,
            status=status,
            priority=priority,
            project_id=project_id,
            tag=tag,
            overdue=overdue,
            min_risk=min_risk,
            q=q,
            page=page,
            page_size=100,
            rbac_user=rbac_user,
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


def list_assets(
    db: Session,
    *,
    q: str | None = None,
    segment: str | None = None,
    owner_user_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
    rbac_user: Any = None,
) -> dict[str, Any]:
    from sqlalchemy.orm import joinedload

    page = max(1, page)
    page_size = min(max(1, page_size), 200)
    query = db.query(Asset).options(joinedload(Asset.owner))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (Asset.hostname.ilike(like))
            | (Asset.ip.ilike(like))
            | (Asset.segment.ilike(like))
        )
    if segment is not None and str(segment).strip() != "":
        query = query.filter(Asset.segment.ilike(str(segment).strip()))
    if owner_user_id is not None:
        query = query.filter(Asset.owner_user_id == int(owner_user_id))
    if rbac_user is not None and not getattr(rbac_user, "is_super_admin", False):
        from app.services import org_rbac

        ids = org_rbac.user_org_unit_ids(db, rbac_user)
        if ids:
            query = query.filter(
                or_(Asset.org_unit_id.in_(list(ids)), Asset.org_unit_id.is_(None))
            )
        else:
            query = query.filter(Asset.org_unit_id.is_(None))
    total = query.count()
    rows = (
        query.order_by(Asset.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    counts: dict[int, int] = {}
    if rows:
        from sqlalchemy import func

        ids = [a.id for a in rows]
        for aid, cnt in (
            db.query(Finding.asset_id, func.count(Finding.id))
            .filter(Finding.asset_id.in_(ids))
            .group_by(Finding.asset_id)
            .all()
        ):
            if aid is not None:
                counts[int(aid)] = int(cnt)
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": [_asset_out(a, findings_count=counts.get(a.id, 0)) for a in rows],
    }


def export_assets_rows(
    db: Session,
    *,
    q: str | None = None,
    segment: str | None = None,
    owner_user_id: int | None = None,
    limit: int = 2000,
) -> list[dict[str, Any]]:
    limit = min(max(1, limit), 5000)
    results: list[dict[str, Any]] = []
    page = 1
    total = None
    while len(results) < limit:
        chunk = list_assets(
            db,
            q=q,
            segment=segment,
            owner_user_id=owner_user_id,
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

def export_jobs_rows(
    db: Session,
    *,
    module_id: str | None = None,
    status: str | None = None,
    limit: int = 2000,
) -> list[dict[str, Any]]:
    limit = min(max(1, limit), 5000)
    results: list[dict[str, Any]] = []
    page = 1
    total = None
    while len(results) < limit:
        chunk = list_jobs(db, module_id=module_id, status=status, page=page, page_size=100)
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


def get_asset(db: Session, asset_id: int) -> dict[str, Any]:
    from sqlalchemy.orm import joinedload

    row = (
        db.query(Asset)
        .options(joinedload(Asset.owner))
        .filter(Asset.id == asset_id)
        .first()
    )
    if not row:
        raise LookupError("Asset not found")
    findings = (
        db.query(Finding)
        .filter(Finding.asset_id == asset_id)
        .order_by(Finding.id.desc())
        .limit(200)
        .all()
    )
    return {
        "asset": _asset_out(row, findings_count=len(findings)),
        "findings": [_finding_out(f, row) for f in findings],
    }


def create_ticket_from_finding(
    db: Session,
    *,
    finding_id: int,
    actor: User,
) -> tuple[Finding, Any, str | None]:
    finding = db.get(Finding, finding_id)
    if not finding:
        raise LookupError("Finding not found")
    if finding.ticket_id:
        raise ValueError(f"Finding already linked to ticket #{finding.ticket_id}")

    cves = _json_loads(finding.linked_cve_ids_json, [])
    bdus = _json_loads(finding.linked_bdu_ids_json, [])
    linked_cve = cves[0] if cves else None
    linked_bdu = bdus[0] if bdus else None
    evidence = _json_loads(finding.evidence_json, {})
    desc_parts = [
        f"Finding #{finding.id} from module `{finding.module_id}` (job #{finding.scan_job_id}).",
    ]
    if evidence:
        desc_parts.append(f"Evidence: {json.dumps(evidence, ensure_ascii=False)[:2000]}")
    if len(cves) > 1:
        desc_parts.append("CVEs: " + ", ".join(cves))
    if len(bdus) > 1:
        desc_parts.append("BDUs: " + ", ".join(bdus))

    ticket, warning = ticket_svc.create_ticket(
        db,
        actor=actor,
        title=finding.title or f"Finding #{finding.id}",
        description="\n".join(desc_parts),
        severity=normalize_severity(finding.severity),
        linked_cve_id=linked_cve,
        linked_bdu_id=linked_bdu,
    )
    finding.ticket_id = ticket.id
    db.commit()
    db.refresh(finding)
    return finding, ticket, warning
