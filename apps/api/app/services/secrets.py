"""Thin secret-manager abstraction for env / file / prefixed secrets.

Backends (in order for EnvSecretBackend):
  1. ``VBX_SECRET__<NAME>`` env (e.g. VBX_SECRET__SHODAN_API_KEY)
  2. Plain env ``NAME`` (e.g. VBX_SHODAN_API_KEY, VBX_MODULE_TOKEN)
  3. Optional ``VBX_SECRET_FILE__<NAME>`` path whose contents are the secret

DB-encrypted settings (Fernet via crypto_secrets) remain the source of truth for
admin-managed values; this layer is for injection from the host / Docker secrets.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Protocol


class SecretBackend(Protocol):
    def get(self, name: str) -> str | None: ...


class BaseSecretBackend:
    def get(self, name: str) -> str | None:
        raise NotImplementedError


class EnvSecretBackend(BaseSecretBackend):
    """Resolve secrets from process environment (and optional *_FILE paths)."""

    PREFIX = "VBX_SECRET__"
    FILE_PREFIX = "VBX_SECRET_FILE__"

    def get(self, name: str) -> str | None:
        key = (name or "").strip()
        if not key:
            return None
        # Prefixed override first (Docker/K8s secret injection pattern)
        prefixed = os.environ.get(f"{self.PREFIX}{key}")
        if prefixed is not None and str(prefixed).strip() != "":
            return str(prefixed).strip()
        file_path = os.environ.get(f"{self.FILE_PREFIX}{key}")
        if file_path and str(file_path).strip():
            try:
                with open(str(file_path).strip(), encoding="utf-8") as fh:
                    raw = fh.read().strip()
                if raw:
                    return raw
            except OSError:
                pass
        plain = os.environ.get(key)
        if plain is not None and str(plain).strip() != "":
            return str(plain).strip()
        return None


@lru_cache
def get_secret_backend() -> EnvSecretBackend:
    return EnvSecretBackend()


def get_secret(name: str, default: str = "") -> str:
    """Lookup ``name`` via the active backend; return ``default`` if missing."""
    val = get_secret_backend().get(name)
    return val if val is not None else default
