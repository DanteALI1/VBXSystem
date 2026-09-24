from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    vbx_secret_key: str = "dev-secret-change-me"
    vbx_database_url: str = "postgresql+psycopg://vbx:vbx@localhost:5432/vbx"
    vbx_redis_url: str = "redis://localhost:6379/0"
    vbx_timezone: str = "Europe/Moscow"

    vbx_admin_username: str = "admin"
    vbx_admin_email: str = "admin@example.local"
    vbx_admin_password: str = "ChangeMe_StrongPass_123!"
    vbx_admin_full_name: str = "Главный Администратор"
    vbx_admin_org: str = ""
    vbx_admin_title: str = ""
    vbx_admin_phone: str = ""

    vbx_nvd_api_key: str = ""
    vbx_cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Upload / body limits (BDU XML, XDB CSV/JSON, CA PEM)
    vbx_max_upload_bytes: int = 64 * 1024 * 1024  # 64 MiB
    vbx_max_bdu_upload_bytes: int = 64 * 1024 * 1024
    vbx_max_xdb_upload_bytes: int = 32 * 1024 * 1024
    vbx_upload_dir: str = "/app/uploads"
    vbx_trusted_hosts: str = ""  # empty = allow all; comma-separated for prod

    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 14

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.vbx_cors_origins.split(",") if o.strip()]

    @property
    def trusted_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.vbx_trusted_hosts.split(",") if h.strip()]

    @property
    def sync_database_url(self) -> str:
        return self.vbx_database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
