from functools import lru_cache
import os

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    vbx_secret_key: str = "dev-secret-change-me"
    vbx_database_url: str = "postgresql+psycopg://vbx:vbx@localhost:5432/vbx"
    vbx_redis_url: str = "redis://localhost:6379/0"
    vbx_timezone: str = "Europe/Moscow"
    # dev | prod — prod defaults EPSS to live unless VBX_EPSS_MOCK is set
    vbx_profile: str = "dev"

    vbx_admin_username: str = "admin"
    vbx_admin_email: str = "admin@example.local"
    vbx_admin_password: str = "ChangeMe_StrongPass_123!"
    vbx_admin_full_name: str = "Главный Администратор"
    vbx_admin_org: str = ""
    vbx_admin_title: str = ""
    vbx_admin_phone: str = ""

    vbx_nvd_api_key: str = ""
    vbx_nvd_results_per_page: int = 2000
    vbx_nvd_max_pages: int = 0
    vbx_nvd_request_sleep_sec: float = 0.8
    vbx_cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    vbx_max_upload_bytes: int = 64 * 1024 * 1024
    vbx_max_bdu_upload_bytes: int = 128 * 1024 * 1024
    vbx_max_xdb_upload_bytes: int = 32 * 1024 * 1024
    vbx_upload_dir: str = "/app/uploads"
    vbx_trusted_hosts: str = ""

    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 14
    # None = derive from profile; empty env string coerced to None
    vbx_epss_mock: bool | None = None
    vbx_public_demo: bool = False

    vbx_auth_cookies: bool = False
    vbx_cookie_secure: bool = False
    vbx_access_cookie: str = "vbx_access"
    vbx_refresh_cookie: str = "vbx_refresh"

    @field_validator("vbx_epss_mock", mode="before")
    @classmethod
    def _coerce_epss_mock(cls, v):  # noqa: ANN001
        if v is None or v == "":
            return None
        if isinstance(v, bool):
            return v
        return str(v).strip().lower() in {"1", "true", "yes", "on"}

    @field_validator("vbx_auth_cookies", "vbx_cookie_secure", mode="before")
    @classmethod
    def _coerce_bool(cls, v):  # noqa: ANN001
        if isinstance(v, bool):
            return v
        if v is None or v == "":
            return False
        return str(v).strip().lower() in {"1", "true", "yes", "on"}

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.vbx_cors_origins.split(",") if o.strip()]

    @property
    def trusted_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.vbx_trusted_hosts.split(",") if h.strip()]

    @property
    def sync_database_url(self) -> str:
        return self.vbx_database_url

    def epss_mock_effective(self) -> bool:
        """If VBX_EPSS_MOCK is set in env → that value; else live when profile=prod."""
        raw = os.environ.get("VBX_EPSS_MOCK")
        if raw is not None and str(raw).strip() != "":
            return str(raw).strip().lower() in {"1", "true", "yes", "on"}
        if self.vbx_epss_mock is not None:
            return self.vbx_epss_mock
        return self.vbx_profile.strip().lower() != "prod"


@lru_cache
def get_settings() -> Settings:
    return Settings()
