"""Unit tests for affected product/OS/version extraction."""

from app.services.affected_extract import extract_affected


TERMIX = (
    "Termix is a web-based server management platform with SSH terminal, tunneling, "
    "and file editing capabilities. From 2.4.1 until 2.5.1, an authenticated Termix "
    "administrator can store attacker-controlled domain and email values through "
    "PATCH /users/acme-ssl-settings and trigger their interpolation into a certbot "
    "shell command through POST /users/acme-ssl-request. In src/backend/database/"
    "routes/acme-ssl-routes.ts, child_process.execSync invokes /bin/sh -c with those "
    "values only wrapped in double quotes, so shell metacharacters can execute "
    "arbitrary operating-system commands as the Termix backend process. Both HTTP "
    "webroot and DNS Cloudflare challenge modes are affected, and compromise "
    "exposes Termix databases, process secrets, stored credentials, and network "
    "reachability. This issue is fixed in version 2.5.1."
)


def test_termix_description_extract():
    out = extract_affected(products=[], description=TERMIX)
    assert out["app"] == "Termix"
    assert "2.4.1 – 2.5.1" in out["versions"] or any("2.4.1" in v for v in out["versions"])
    assert any("2.5.1" in v for v in out["versions"])


def test_cpe_app_and_os():
    products = [
        "cpe:2.3:a:apache:http_server:2.4.49:*:*:*:*:*:*:*",
        "cpe:2.3:o:microsoft:windows_10:1909:*:*:*:*:*:*:*",
    ]
    out = extract_affected(products=products, description="")
    assert any("http" in a.lower() or "apache" in a.lower() for a in out["apps"])
    assert any("windows" in o.lower() for o in out["oses"])
    assert "2.4.49" in out["versions"] or any("2.4.49" in v for v in out["versions"])


def test_cpe_version_range_object():
    products = [
        {
            "cpe": "cpe:2.3:a:vendor:termix:*:*:*:*:*:*:*:*",
            "versionStartIncluding": "2.4.1",
            "versionEndExcluding": "2.5.1",
        }
    ]
    out = extract_affected(products=products, description="")
    assert out["app"]
    assert any("2.4.1" in v and "2.5.1" in v for v in out["versions"])


def test_linux_kernel_subsystem():
    desc = (
        "In the Linux kernel, the following vulnerability has been resolved:\n\n"
        "wifi: mac80211: fix race in station cleanup"
    )
    out = extract_affected(products=[], description=desc)
    assert out["app"] == "Linux kernel" or any("Linux kernel" in a for a in out["apps"])
    assert any("wifi" in a.lower() for a in out["apps"])


def test_linux_kernel_before_version():
    desc = "A flaw was found in the Linux kernel's net/ipv4 stack before 6.1.12."
    out = extract_affected(products=[], description=desc)
    assert any("Linux kernel" in a for a in out["apps"])
    assert any("6.1.12" in v for v in out["versions"])
    assert any("net" in a.lower() for a in out["apps"])
