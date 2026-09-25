"""Tests for nuclei template index builder (fixture YAML files, no git)."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

os.environ.setdefault("VBX_DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("VBX_SECRET_KEY", "test-secret")
os.environ.setdefault("VBX_REDIS_URL", "redis://localhost:6379/15")

from app.core.config import get_settings
from app.services import nuclei_templates as nt

FIXTURE_OFFICIAL = """\
id: http-missing-header
info:
  name: Missing Security Header
  author: vbx-test
  severity: low
  tags: misc,headers,http
http:
  - method: GET
    path:
      - "{{BaseURL}}"
"""

FIXTURE_CVE = """\
id: CVE-2021-44228
info:
  name: Log4j RCE
  severity: critical
  tags: cve,cve2021,rce,log4j
http:
  - method: GET
    path:
      - "{{BaseURL}}"
"""

FIXTURE_CUSTOM = """\
id: custom-login-check
info:
  name: Custom Login Page Check
  severity: medium
  tags: custom,login
http:
  - method: GET
    path:
      - "{{BaseURL}}/login"
"""

FIXTURE_TAGS_LIST = """\
id: ssl-tls-check
info:
  name: TLS Check
  severity: info
  tags: [ssl, tls, network]
http:
  - method: GET
    path:
      - "{{BaseURL}}"
"""


@pytest.fixture()
def catalog_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    artifacts = tmp_path / "artifacts"
    official = artifacts / "nuclei-templates"
    custom = artifacts / "nuclei-custom"
    official.mkdir(parents=True)
    custom.mkdir(parents=True)

    (official / "http").mkdir()
    (official / "http" / "missing-header.yaml").write_text(FIXTURE_OFFICIAL, encoding="utf-8")
    (official / "cves").mkdir()
    (official / "cves" / "log4j.yaml").write_text(FIXTURE_CVE, encoding="utf-8")
    (official / "ssl").mkdir()
    (official / "ssl" / "tls.yaml").write_text(FIXTURE_TAGS_LIST, encoding="utf-8")
    (custom / "login-check.yml").write_text(FIXTURE_CUSTOM, encoding="utf-8")

    monkeypatch.setenv("VBX_ARTIFACTS_DIR", str(artifacts))
    monkeypatch.setenv("VBX_NUCLEI_TEMPLATES_DIR", str(official))
    monkeypatch.setenv("VBX_NUCLEI_CUSTOM_DIR", str(custom))
    get_settings.cache_clear()
    yield {"artifacts": artifacts, "official": official, "custom": custom}
    get_settings.cache_clear()


def test_extract_template_meta_basic():
    meta = nt.extract_template_meta(FIXTURE_OFFICIAL, rel_path="http/missing-header.yaml")
    assert meta is not None
    assert meta["id"] == "http-missing-header"
    assert meta["name"] == "Missing Security Header"
    assert meta["severity"] == "low"
    assert "headers" in meta["tags"]
    assert meta["path"] == "http/missing-header.yaml"


def test_extract_template_meta_yaml_list_tags():
    meta = nt.extract_template_meta(FIXTURE_TAGS_LIST)
    assert meta is not None
    assert set(meta["tags"]) == {"ssl", "tls", "network"}


def test_build_index_from_fixtures(catalog_dirs):
    index = nt.build_index(write=True)
    assert index["official_count"] == 3
    assert index["custom_count"] == 1
    assert index["template_count"] == 4

    ids = {t["id"] for t in index["templates"]}
    assert "CVE-2021-44228" in ids
    assert "custom-login-check" in ids
    assert "http-missing-header" in ids

    tag_map = {t["tag"]: t["count"] for t in index["tags"]}
    assert tag_map.get("cve", 0) >= 1
    assert tag_map.get("custom", 0) == 1
    assert tag_map.get("ssl", 0) >= 1

    path = nt.index_path()
    assert path.is_file()
    loaded = json.loads(path.read_text(encoding="utf-8"))
    assert loaded["template_count"] == 4


def test_list_catalog_filter_and_paginate(catalog_dirs):
    nt.build_index(write=True)

    by_tag = nt.list_catalog(tag="cve", page=1, page_size=10)
    assert by_tag["total"] == 1
    assert by_tag["templates"][0]["id"] == "CVE-2021-44228"

    by_q = nt.list_catalog(q="login", page=1, page_size=10)
    assert by_q["total"] >= 1
    assert any(t["id"] == "custom-login-check" for t in by_q["templates"])

    custom_only = nt.list_catalog(source="custom", page=1, page_size=10)
    assert custom_only["total"] == 1
    assert custom_only["templates"][0]["source"] == "custom"

    page1 = nt.list_catalog(page=1, page_size=2)
    assert len(page1["templates"]) == 2
    assert page1["total"] == 4
    page2 = nt.list_catalog(page=2, page_size=2)
    assert len(page2["templates"]) == 2


def test_save_custom_uploads(catalog_dirs):
    extra = b"""id: uploaded-extra
info:
  name: Uploaded Extra
  severity: high
  tags: upload,test
http:
  - method: GET
    path:
      - "{{BaseURL}}"
"""
    result = nt.save_custom_uploads([("extra.yaml", extra), ("bad.txt", b"nope"), ("empty.yaml", b"")])
    assert "extra.yaml" in result["saved"]
    assert result["rejected"]
    assert result["custom_count"] >= 2

    listed = nt.list_catalog(q="uploaded-extra", source="custom")
    assert listed["total"] == 1


def test_sync_skips_without_git(catalog_dirs, monkeypatch):
    monkeypatch.setattr(nt, "_git_available", lambda: False)
    stats = nt.sync_official_templates()
    assert stats.get("skipped") is True
    assert stats.get("reason") == "git_not_available"
    # Index still built from existing fixtures
    assert stats.get("template_count", 0) >= 1


def test_resolve_effective_default_templates(catalog_dirs):
    assert nt.resolve_effective_default_templates("").endswith("nuclei-templates")
    assert nt.resolve_effective_default_templates("/custom/path") == "/custom/path"
