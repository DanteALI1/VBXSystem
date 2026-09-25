"""Extract affected application / OS / version ranges from CPE + description."""

from __future__ import annotations

import json
import re
from typing import Any


_OS_WORDS = {
    "windows",
    "linux",
    "ubuntu",
    "debian",
    "centos",
    "rhel",
    "red hat",
    "redhat",
    "fedora",
    "suse",
    "android",
    "ios",
    "ipados",
    "macos",
    "mac os",
    "os x",
    "chrome os",
    "chromeos",
    "freebsd",
    "openbsd",
    "solaris",
    "aix",
    "hp-ux",
    "unix",
}

_CPE_RE = re.compile(
    r"^cpe:2\.3:(?P<part>[aho]):(?P<vendor>[^:]*):(?P<product>[^:]*):(?P<version>[^:]*)",
    re.I,
)

# "From 2.4.1 until 2.5.1", "versions 1.0 through 2.0", "before 3.1.2", "fixed in version 2.5.1"
_VERSION_PATTERNS = [
    re.compile(
        r"\bfrom\s+(?P<a>v?\d+(?:\.\d+){0,4})\s+(?:until|to|through|thru)\s+(?P<b>v?\d+(?:\.\d+){0,4})\b",
        re.I,
    ),
    re.compile(
        r"\bversions?\s+(?P<a>v?\d+(?:\.\d+){0,4})\s+(?:through|thru|to|until|-)\s+(?P<b>v?\d+(?:\.\d+){0,4})\b",
        re.I,
    ),
    re.compile(
        r"\b(?:prior to|before|earlier than)\s+(?:version\s+)?(?P<a>v?\d+(?:\.\d+){0,4})\b",
        re.I,
    ),
    re.compile(
        r"\b(?:fixed in|fixing in|resolved in)\s+(?:version\s+)?(?P<a>v?\d+(?:\.\d+){0,4})\b",
        re.I,
    ),
    re.compile(
        r"\baffected\s+versions?\s*[:\-]?\s*(?P<a>v?\d+(?:\.\d+){0,4}(?:\s*[-–—to]+\s*v?\d+(?:\.\d+){0,4})?)\b",
        re.I,
    ),
]

# "Termix is a ...", "In FooBar ..."
_APP_LEAD = re.compile(
    r"^(?P<name>[A-Z][A-Za-z0-9][A-Za-z0-9+._\-]{1,40})\s+(?:is|was|are|were)\s+(?:a|an|the)\b"
)
_APP_IN = re.compile(
    r"\bin\s+(?P<name>[A-Z][A-Za-z0-9][A-Za-z0-9+._\-]{1,40})\s+(?:version|before|prior|through|until)\b"
)
# NVD kernel advisories: "In the Linux kernel, the following vulnerability has been resolved:\n\nwifi: ..."
_LINUX_KERNEL = re.compile(r"\bin the linux kernel\b", re.I)
_KERNEL_SUBSYS = re.compile(
    r"vulnerability has been resolved:\s*(?P<sub>[A-Za-z0-9_+/.-]{1,40})\s*:",
    re.I | re.S,
)
# Alternate forms: "Linux kernel before 6.1.12", "A flaw was found in the Linux kernel's net/..."
_KERNEL_BEFORE = re.compile(
    r"\blinux\s+kernel\s+(?:before|prior to|up to)\s+(?:version\s+)?(?P<a>v?\d+(?:\.\d+){1,4})",
    re.I,
)
_KERNEL_NET = re.compile(
    r"\blinux\s+kernel'?s?\s+(?P<sub>(?:net|fs|drivers|mm|arch|sound|crypto|block|virt)(?:/[A-Za-z0-9_+/.-]{0,40})?)",
    re.I,
)
_KERNEL_CVE_STYLE = re.compile(
    r"\b(?:in|affecting)\s+(?:the\s+)?(?P<sub>[a-z0-9_+/.-]{2,40})\s+subsystem\s+of\s+(?:the\s+)?linux\s+kernel\b",
    re.I,
)


def _loads_products(raw: str | list | None) -> list[Any]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _humanize(token: str) -> str:
    t = (token or "").strip().replace("_", " ").replace("%2e", ".")
    if not t or t in {"*", "-", ""}:
        return ""
    # Keep known case for short names; title-case snake_case
    if t.islower() and " " not in t and len(t) <= 24:
        return t
    return t


def _parse_cpe(cpe: str) -> dict[str, str] | None:
    m = _CPE_RE.match(cpe.strip())
    if not m:
        return None
    return {
        "part": m.group("part").lower(),
        "vendor": _humanize(m.group("vendor")),
        "product": _humanize(m.group("product")),
        "version": m.group("version") if m.group("version") not in {"*", "-"} else "",
    }


def _version_label_from_match(obj: dict) -> str:
    parts: list[str] = []
    a = obj.get("versionStartIncluding") or obj.get("versionStartExcluding")
    b = obj.get("versionEndIncluding") or obj.get("versionEndExcluding")
    if a and b:
        prefix = ">=" if obj.get("versionStartIncluding") else ">"
        suffix = "<=" if obj.get("versionEndIncluding") else "<"
        return f"{prefix}{a} {suffix}{b}"
    if obj.get("versionEndExcluding"):
        return f"< {obj['versionEndExcluding']}"
    if obj.get("versionEndIncluding"):
        return f"<= {obj['versionEndIncluding']}"
    if obj.get("versionStartIncluding"):
        return f">= {obj['versionStartIncluding']}"
    if obj.get("versionStartExcluding"):
        return f"> {obj['versionStartExcluding']}"
    return ""


def _from_cpe_list(items: list[Any]) -> tuple[list[str], list[str], list[str]]:
    apps: list[str] = []
    oses: list[str] = []
    versions: list[str] = []

    def add(bucket: list[str], value: str) -> None:
        v = value.strip()
        if not v:
            return
        low = v.lower()
        if any(x.lower() == low for x in bucket):
            return
        bucket.append(v)

    for item in items:
        cpe = ""
        extra: dict = {}
        if isinstance(item, str):
            cpe = item
        elif isinstance(item, dict):
            cpe = str(item.get("cpe") or item.get("criteria") or "")
            extra = item
        if not cpe:
            continue
        parsed = _parse_cpe(cpe)
        if not parsed:
            continue
        label = parsed["product"] or parsed["vendor"]
        if parsed["part"] == "o":
            add(oses, label or parsed["vendor"])
        elif parsed["part"] in {"a", "h"}:
            # Prefer "vendor product" when both present and different
            if parsed["vendor"] and parsed["product"] and parsed["vendor"].lower() != parsed["product"].lower():
                add(apps, f"{parsed['vendor']} {parsed['product']}")
            else:
                add(apps, label)
        ver = _version_label_from_match(extra) or parsed["version"]
        if ver:
            add(versions, ver)
    return apps[:8], oses[:6], versions[:8]


def _apps_from_text(text: str) -> list[str]:
    if not text:
        return []
    found: list[str] = []

    def add(label: str) -> None:
        v = (label or "").strip()
        if not v:
            return
        if v.lower() not in {x.lower() for x in found}:
            found.append(v)

    if _LINUX_KERNEL.search(text) or _KERNEL_BEFORE.search(text) or re.search(
        r"\blinux\s+kernel\b", text, re.I
    ):
        add("Linux kernel")
        m = _KERNEL_SUBSYS.search(text)
        if m:
            sub = m.group("sub").strip().strip("/")
            if sub and sub.lower() not in {"the", "a", "an"}:
                add(f"Linux kernel ({sub})")
        m2 = _KERNEL_NET.search(text)
        if m2:
            add(f"Linux kernel ({m2.group('sub').strip('/')})")
        m3 = _KERNEL_CVE_STYLE.search(text)
        if m3:
            add(f"Linux kernel ({m3.group('sub').strip('/')})")
        # Kernel version phrases still feed versions via _versions_from_text / _KERNEL_BEFORE
        mb = _KERNEL_BEFORE.search(text)
        if mb:
            # ensure version capture even if generic patterns miss
            pass

    first = text.strip().split(". ")[0][:200]
    for rx in (_APP_LEAD, _APP_IN):
        m = rx.search(first if rx is _APP_LEAD else text[:400])
        if m:
            name = m.group("name")
            # skip generic words
            if name.lower() in {
                "this",
                "that",
                "there",
                "when",
                "with",
                "from",
                "multiple",
                "several",
                "various",
                "an",
                "the",
                "linux",
                "a",
            }:
                continue
            if name not in found:
                found.append(name)
    return found[:4]


def _oses_from_text(text: str) -> list[str]:
    low = (text or "").lower()
    found: list[str] = []
    for word in sorted(_OS_WORDS, key=len, reverse=True):
        if word in low:
            pretty = {
                "red hat": "Red Hat",
                "redhat": "Red Hat",
                "mac os": "macOS",
                "os x": "macOS",
                "chrome os": "Chrome OS",
                "chromeos": "Chrome OS",
                "hp-ux": "HP-UX",
                "ios": "iOS",
                "ipados": "iPadOS",
                "macos": "macOS",
            }.get(
                word,
                word.title()
                if word not in {"ios", "aix"}
                else word.upper()
                if word == "aix"
                else word.title(),
            )
            if pretty == "Ios":
                pretty = "iOS"
            if pretty.lower() not in {x.lower() for x in found}:
                found.append(pretty)
    return found[:6]


def _versions_from_text(text: str) -> list[str]:
    found: list[str] = []
    for rx in _VERSION_PATTERNS:
        for m in rx.finditer(text or ""):
            gd = m.groupdict()
            a = (gd.get("a") or "").lstrip("vV")
            b = (gd.get("b") or "").lstrip("vV")
            if a and b:
                label = f"{a} – {b}"
            elif a and "fixed" in m.group(0).lower():
                label = f"fixed in {a}"
            elif a and any(w in m.group(0).lower() for w in ("before", "prior", "earlier")):
                label = f"< {a}"
            else:
                label = a
            if label and label.lower() not in {x.lower() for x in found}:
                found.append(label)
    # Linux kernel "before X.Y.Z"
    for m in _KERNEL_BEFORE.finditer(text or ""):
        a = (m.group("a") or "").lstrip("vV")
        if a:
            label = f"< {a}"
            if label.lower() not in {x.lower() for x in found}:
                found.append(label)
    return found[:8]


def extract_affected(
    *,
    products: str | list | None = None,
    description: str = "",
    kev_product: str = "",
    kev_vendor: str = "",
) -> dict[str, Any]:
    """Return apps / oses / versions with provenance flags."""
    items = _loads_products(products)
    apps_cpe, oses_cpe, vers_cpe = _from_cpe_list(items)
    apps_txt = _apps_from_text(description or "")
    oses_txt = _oses_from_text(description or "")
    vers_txt = _versions_from_text(description or "")

    apps: list[str] = []
    for a in apps_cpe + apps_txt:
        if a.lower() not in {x.lower() for x in apps}:
            apps.append(a)
    if kev_product:
        label = kev_product if not kev_vendor else f"{kev_vendor} {kev_product}"
        if label.lower() not in {x.lower() for x in apps}:
            apps.insert(0, label)

    oses: list[str] = []
    for o in oses_cpe + oses_txt:
        if o.lower() not in {x.lower() for x in oses}:
            oses.append(o)

    versions: list[str] = []
    for v in vers_cpe + vers_txt:
        if v.lower() not in {x.lower() for x in versions}:
            versions.append(v)

    sources: list[str] = []
    if apps_cpe or oses_cpe or vers_cpe:
        sources.append("cpe")
    if apps_txt or oses_txt or vers_txt:
        sources.append("description")
    if kev_product:
        sources.append("kev")

    return {
        "apps": apps[:8],
        "oses": oses[:6],
        "versions": versions[:8],
        "app": apps[0] if apps else "",
        "os": oses[0] if oses else "",
        "version": versions[0] if versions else "",
        "sources": sources,
    }
