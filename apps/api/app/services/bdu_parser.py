from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field


CVE_RE = re.compile(r"CVE-\d{4}-\d{4,}", re.I)
BDU_RE = re.compile(r"BDU[:\-]\d{4}-\d+", re.I)


@dataclass
class ParsedBdu:
    bdu_id: str
    name: str = ""
    description: str = ""
    severity: str = ""
    severity_level: int | None = None
    status: str = ""
    solution: str = ""
    vendors: str = ""
    software_names: str = ""
    cwes: str = ""
    linked_cve_ids: list[str] = field(default_factory=list)
    identify_date: str = ""
    raw_xml: str = ""


def _text(el: ET.Element | None) -> str:
    if el is None or el.text is None:
        return ""
    return el.text.strip()


def _find_text(node: ET.Element, names: list[str]) -> str:
    for name in names:
        for child in node.iter():
            tag = child.tag.split("}")[-1].lower()
            if tag == name.lower():
                val = _text(child)
                if val:
                    return val
    return ""


def _collect_cves(node: ET.Element) -> list[str]:
    found: set[str] = set()
    blob = ET.tostring(node, encoding="unicode")
    for m in CVE_RE.findall(blob):
        found.add(m.upper())
    return sorted(found)


def _normalize_bdu_id(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    raw = raw.replace("_", "-")
    if raw.upper().startswith("BDU"):
        raw = raw.replace("BDU-", "BDU:").replace("bdu-", "BDU:")
        if ":" not in raw and "-" in raw:
            raw = raw.replace("BDU", "BDU:", 1)
    if not raw.upper().startswith("BDU:"):
        raw = f"BDU:{raw}"
    return raw.upper().replace("BDU:", "BDU:")


def parse_bdu_xml(content: str | bytes) -> list[ParsedBdu]:
    if isinstance(content, bytes):
        content = content.decode("utf-8", errors="replace")
    root = ET.fromstring(content)
    records: list[ParsedBdu] = []

    candidates = []
    for el in root.iter():
        tag = el.tag.split("}")[-1].lower()
        if tag in {"vulnerability", "vul", "item", "record"}:
            candidates.append(el)
    if not candidates and root.tag.split("}")[-1].lower() in {"vulnerability", "vul"}:
        candidates = [root]

    for node in candidates:
        bdu_id = _find_text(
            node,
            ["identifier", "id", "bdu_id", "bdu", "identificator"],
        )
        if not bdu_id:
            # try attribute
            for attr in ("id", "identifier"):
                if node.attrib.get(attr):
                    bdu_id = node.attrib[attr]
                    break
        m = BDU_RE.search(bdu_id) or BDU_RE.search(ET.tostring(node, encoding="unicode"))
        if m:
            bdu_id = m.group(0)
        bdu_id = _normalize_bdu_id(bdu_id)
        if not bdu_id or bdu_id == "BDU:":
            continue

        name = _find_text(node, ["name", "title", "vulnerability_name"])
        description = _find_text(node, ["description", "desc", "annotation"])
        severity = _find_text(node, ["severity", "danger_level", "criticality"])
        status = _find_text(node, ["status", "vul_status"])
        solution = _find_text(node, ["solution", "fix", "remediation"])
        vendors = _find_text(node, ["vendor", "vendors", "manufacturer"])
        software = _find_text(node, ["software", "product", "software_name", "affected"])
        cwes = _find_text(node, ["cwe", "cwes"])
        identify_date = _find_text(node, ["identify_date", "date", "published", "discovery_date"])
        level_raw = _find_text(node, ["severity_level", "level"])
        level = int(level_raw) if level_raw.isdigit() else None
        cves = _collect_cves(node)

        records.append(
            ParsedBdu(
                bdu_id=bdu_id,
                name=name or bdu_id,
                description=description,
                severity=severity,
                severity_level=level,
                status=status,
                solution=solution,
                vendors=vendors,
                software_names=software,
                cwes=cwes,
                linked_cve_ids=cves,
                identify_date=identify_date,
                raw_xml=ET.tostring(node, encoding="unicode"),
            )
        )
    return records


def parsed_to_standalone(parsed: ParsedBdu) -> bool:
    return len(parsed.linked_cve_ids) == 0
