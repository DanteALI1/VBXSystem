"""Attack-path graph builder (asset ↔ finding ↔ CVE/BDU ↔ XDB)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import Asset, CveRecord, ExploitRecord, Finding


def build_attack_path(
    db: Session,
    *,
    asset_id: int | None = None,
    finding_id: int | None = None,
    max_nodes: int = 200,
) -> dict[str, Any]:
    if not asset_id and not finding_id:
        raise ValueError("asset_id or finding_id required")
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, str]] = []

    def add_node(nid: str, ntype: str, label: str, **extra: Any) -> None:
        if nid in nodes or len(nodes) >= max_nodes:
            return
        nodes[nid] = {"id": nid, "type": ntype, "label": label, **extra}

    def add_edge(src: str, dst: str, etype: str) -> None:
        if src in nodes and dst in nodes:
            edges.append({"source": src, "target": dst, "type": etype})

    findings: list[Finding] = []
    if finding_id:
        f = db.get(Finding, finding_id)
        if f:
            findings = [f]
            if f.asset_id:
                asset_id = f.asset_id
    if asset_id:
        asset = db.get(Asset, asset_id)
        if asset:
            add_node(
                f"asset:{asset.id}",
                "asset",
                asset.hostname or asset.ip or f"#{asset.id}",
                criticality=getattr(asset, "criticality", None) or "medium",
            )
            if not findings:
                findings = (
                    db.query(Finding)
                    .filter(Finding.asset_id == asset.id)
                    .order_by(Finding.risk_score.desc())
                    .limit(40)
                    .all()
                )

    for f in findings:
        if len(nodes) >= max_nodes:
            break
        add_node(
            f"finding:{f.id}",
            "finding",
            f.title[:80] or f"#{f.id}",
            severity=f.severity,
            risk_score=getattr(f, "risk_score", 0) or 0,
            priority=getattr(f, "priority", None) or "medium",
        )
        if f.asset_id:
            aid = f"asset:{f.asset_id}"
            if aid not in nodes:
                a = db.get(Asset, f.asset_id)
                if a:
                    add_node(aid, "asset", a.hostname or a.ip or f"#{a.id}")
            add_edge(aid, f"finding:{f.id}", "has_finding")
        try:
            cves = json.loads(f.linked_cve_ids_json or "[]")
        except json.JSONDecodeError:
            cves = []
        if not isinstance(cves, list):
            cves = []
        for cid in cves[:10]:
            cid = str(cid).upper().strip()
            if not cid:
                continue
            cve = db.get(CveRecord, cid)
            add_node(
                f"cve:{cid}",
                "cve",
                cid,
                is_cisa_kev=bool(cve.is_cisa_kev) if cve else False,
            )
            add_edge(f"finding:{f.id}", f"cve:{cid}", "links_cve")
            exploits = (
                db.query(ExploitRecord)
                .filter(ExploitRecord.cve_id == cid)
                .order_by(ExploitRecord.id.desc())
                .limit(5)
                .all()
            )
            for x in exploits:
                label = (x.repo_name or x.xdb_id or f"xdb-{x.id}")[:80]
                add_node(f"xdb:{x.id}", "exploit", label)
                add_edge(f"cve:{cid}", f"xdb:{x.id}", "has_exploit")

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "summary": {"nodes": len(nodes), "edges": len(edges)},
    }
