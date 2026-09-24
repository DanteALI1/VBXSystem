from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, BduRecord, CveBduLink, CveRecord
from app.services.bdu_import import import_bdu_content, import_bdu_xml_content
from app.services.bdu_parser import parse_bdu_file, parse_bdu_xml, parsed_to_standalone
from app.services.nvd_sync import seed_mock_cves
from app.services.kev_sync import seed_mock_kev


FIXTURE = Path(__file__).parent / "fixtures" / "sample_bdu.xml"
FIXTURE_XLSX = Path(__file__).parent / "fixtures" / "sample_bdu.xlsx"


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_parse_bdu_xml_counts():
    records = parse_bdu_xml(FIXTURE.read_text(encoding="utf-8"))
    assert len(records) == 2
    by_id = {r.bdu_id: r for r in records}
    assert "CVE-2024-0001" in by_id["BDU:2024-00001"].linked_cve_ids
    assert parsed_to_standalone(by_id["BDU:2024-00002"]) is True
    assert parsed_to_standalone(by_id["BDU:2024-00001"]) is False


def test_bdu_merge_rules():
    db = _session()
    seed_mock_cves(db)
    stats = import_bdu_xml_content(db, FIXTURE.read_text(encoding="utf-8"))
    assert stats["parsed"] == 2
    assert stats["standalone"] == 1
    assert stats["linked"] >= 1

    linked = db.get(BduRecord, "BDU:2024-00001")
    alone = db.get(BduRecord, "BDU:2024-00002")
    assert linked is not None and linked.is_standalone is False
    assert alone is not None and alone.is_standalone is True
    assert db.query(CveBduLink).filter_by(bdu_id="BDU:2024-00001").count() == 1
    assert db.get(CveRecord, "CVE-2024-0001") is not None


def test_kev_marks_cve():
    db = _session()
    seed_mock_cves(db)
    stats = seed_mock_kev(db)
    assert stats["matched_cves"] >= 1
    cve = db.get(CveRecord, "CVE-2023-44487")
    assert cve is not None and cve.is_cisa_kev is True


def test_bdu_reimport_idempotent():
    db = _session()
    content = FIXTURE.read_text(encoding="utf-8")
    import_bdu_xml_content(db, content)
    stats2 = import_bdu_xml_content(db, content)
    assert stats2["updated"] == 2
    assert db.query(BduRecord).count() == 2


def test_parse_and_import_bdu_xlsx():
    records = parse_bdu_file(FIXTURE_XLSX.read_bytes(), filename="sample_bdu.xlsx")
    assert len(records) == 2
    by_id = {r.bdu_id: r for r in records}
    assert "CVE-2024-0001" in by_id["BDU:2024-00001"].linked_cve_ids
    assert parsed_to_standalone(by_id["BDU:2024-00002"]) is True

    db = _session()
    seed_mock_cves(db)
    stats = import_bdu_content(db, FIXTURE_XLSX.read_bytes(), filename="sample_bdu.xlsx")
    assert stats["parsed"] == 2
    assert stats["format"] == "xlsx"
    row = db.get(BduRecord, "BDU:2024-00001")
    alone = db.get(BduRecord, "BDU:2024-00002")
    assert row is not None and alone is not None
    # Enrichment columns present after 0009 (may be empty on minimal fixture)
    assert hasattr(row, "software_versions")
    assert hasattr(row, "cvss3_vector")
    assert hasattr(row, "references_json")
    assert alone.references_json is not None
