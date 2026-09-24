from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field


CVE_RE = re.compile(r"CVE-\d{4}-\d{4,}", re.I)
BDU_RE = re.compile(r"BDU[:\-]\d{4}-\d+", re.I)
URL_RE = re.compile(r"https?://[^\s,;]+", re.I)

# Known FSTEC header names we map explicitly; the rest go to extra_json
MAPPED_HEADERS = {
    "идентификатор",
    "наименование уязвимости",
    "описание уязвимости",
    "вендор по",
    "название по",
    "версия по",
    "тип по",
    "наименование ос и тип аппаратной платформы",
    "класс уязвимости",
    "дата выявления",
    "cvss 2.0",
    "cvss 3.0",
    "cvss 4.0",
    "уровень опасности уязвимости",
    "возможные меры по устранению",
    "статус уязвимости",
    "наличие эксплойта",
    "информация об устранении",
    "ссылки на источники",
    "идентификаторы других систем описаний уязвимости",
    "прочая информация",
    "связь с инцидентами иб",
    "способ эксплуатации",
    "способ устранения",
    "дата публикации",
    "дата последнего обновления",
    "последствия эксплуатации уязвимости",
    "состояние уязвимости",
    "описание ошибки cwe",
    "тип ошибки cwe",
    "наименование",
}


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
    references: list[str] = field(default_factory=list)
    published_date: str = ""
    updated_date: str = ""
    cwe_description: str = ""
    extra: dict = field(default_factory=dict)


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


def _refs_from_text(raw: str) -> list[str]:
    if not raw:
        return []
    found = URL_RE.findall(raw.replace("–", "-").replace("—", "-"))
    # also split by newlines/commas for non-url leftovers kept as-is if look like urls
    return list(dict.fromkeys(found))[:40]


def parse_bdu_xlsx(content: bytes) -> list[ParsedBdu]:
    """Parse FSTEC vullist.xlsx (sheet «Уязвимости», header on row 3)."""
    import io

    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheet_name = "Уязвимости" if "Уязвимости" in wb.sheetnames else wb.sheetnames[0]
    ws = wb[sheet_name]

    header: list[str] = []
    records: list[ParsedBdu] = []
    for idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
        values = list(row)
        if idx < 3:
            continue
        if idx == 3:
            header = [str(c).strip() if c is not None else "" for c in values]
            continue
        if not values or values[0] is None:
            continue

        def col(*names: str) -> str:
            for name in names:
                needle = name.lower()
                for i, h in enumerate(header):
                    if h and h.lower() == needle and i < len(values) and values[i] is not None:
                        return str(values[i]).strip()
            return ""

        bdu_raw = str(values[0]).strip() if values[0] is not None else ""
        if not bdu_raw:
            bdu_raw = col("Идентификатор")
        bdu_id = _normalize_bdu_id(bdu_raw)
        if not bdu_id or bdu_id == "BDU:":
            continue

        other_ids = col("Идентификаторы других систем описаний уязвимости")
        cves = sorted({m.upper() for m in CVE_RE.findall(other_ids)})
        refs_raw = col("Ссылки на источники")
        refs = _refs_from_text(refs_raw)

        extra: dict = {}
        for i, h in enumerate(header):
            if not h or i >= len(values):
                continue
            if i == 0:
                continue
            if h.lower() in MAPPED_HEADERS:
                continue
            if values[i] is None or str(values[i]).strip() == "":
                continue
            extra[h] = str(values[i]).strip()
        # keep unmapped known leftovers that are useful
        for label, key in (
            ("Прочая информация", "other"),
            ("Связь с инцидентами ИБ", "incidents"),
            ("Последствия эксплуатации уязвимости", "impact"),
        ):
            val = col(label)
            if val:
                extra[key] = val

        records.append(
            ParsedBdu(
                bdu_id=bdu_id,
                name=col("Наименование уязвимости") or bdu_id,
                description=col("Описание уязвимости"),
                severity=col("Уровень опасности уязвимости"),
                severity_level=None,
                status=col("Статус уязвимости") or col("Состояние уязвимости"),
                solution=col("Возможные меры по устранению"),
                vendors=col("Вендор ПО"),
                software_names=col("Название ПО"),
                cwes=col("Тип ошибки CWE"),
                linked_cve_ids=cves,
                identify_date=col("Дата выявления") or col("Дата публикации"),
                software_versions=col("Версия ПО"),
                software_type=col("Тип ПО"),
                os_platform=col("Наименование ОС и тип аппаратной платформы"),
                vuln_class=col("Класс уязвимости"),
                cvss2_vector=col("CVSS 2.0"),
                cvss3_vector=col("CVSS 3.0"),
                cvss4_vector=col("CVSS 4.0"),
                exploit_status=col("Наличие эксплойта"),
                fix_info=col("Информация об устранении"),
                exploit_method=col("Способ эксплуатации"),
                fix_method=col("Способ устранения"),
                references=refs,
                published_date=col("Дата публикации"),
                updated_date=col("Дата последнего обновления"),
                cwe_description=col("Описание ошибки CWE"),
                extra=extra,
                raw_xml=json.dumps(
                    {
                        "id": bdu_id,
                        "refs_raw": refs_raw[:2000],
                        "other_ids": other_ids[:2000],
                    },
                    ensure_ascii=False,
                ),
            )
        )
    wb.close()
    return records


def parse_bdu_file(content: bytes, *, filename: str = "") -> list[ParsedBdu]:
    name = (filename or "").lower()
    if name.endswith(".xlsx") or content[:2] == b"PK":
        return parse_bdu_xlsx(content)
    return parse_bdu_xml(content)


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
