"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { buildQs } from "@/lib/queryString";
import { useAuth } from "@/lib/useAuth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type GraphNode = {
  id: string;
  type: string;
  label: string;
  severity?: string;
  risk_score?: number;
  is_cisa_kev?: boolean;
  [key: string]: unknown;
};

type GraphEdge = { source: string; target: string; type?: string };

type GraphOut = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary?: { nodes?: number; edges?: number };
};

/** Avoid purple — teal for exploits */
const TYPE_COLOR: Record<string, string> = {
  asset: "#3d8bfd",
  finding: "#e8a838",
  cve: "#e35d6a",
  exploit: "#2a9d8f",
};

function layoutNodes(nodes: GraphNode[], width: number, height: number) {
  const byType: Record<string, GraphNode[]> = {};
  for (const n of nodes) {
    (byType[n.type] ||= []).push(n);
  }
  const layers = ["asset", "finding", "cve", "exploit"];
  const positions: Record<string, { x: number; y: number }> = {};
  const usableW = width - 80;
  const usableH = height - 60;
  layers.forEach((layer, li) => {
    const group = byType[layer] || [];
    const x = 40 + (usableW * (li + 0.5)) / Math.max(layers.length, 1);
    group.forEach((n, i) => {
      const y =
        group.length === 1
          ? height / 2
          : 40 + (usableH * (i + 0.5)) / group.length;
      positions[n.id] = { x, y };
    });
  });
  Object.keys(byType).forEach((t) => {
    if (layers.includes(t)) return;
    (byType[t] || []).forEach((n, i) => {
      positions[n.id] = { x: width / 2, y: 40 + i * 40 };
    });
  });

  // light force-ish separation
  const ids = Object.keys(positions);
  for (let iter = 0; iter < 10; iter++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = positions[ids[i]];
        const b = positions[ids[j]];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 56) {
          const f = ((56 - dist) / dist) * 0.4;
          a.x -= dx * f;
          a.y -= dy * f;
          b.x += dx * f;
          b.y += dy * f;
        }
      }
    }
  }
  for (const p of Object.values(positions)) {
    p.x = Math.max(24, Math.min(width - 24, p.x));
    p.y = Math.max(24, Math.min(height - 24, p.y));
  }
  return positions;
}

function nodeHref(n: GraphNode): string | null {
  if (n.type === "asset") return `/assets/${String(n.id).replace("asset:", "")}`;
  if (n.type === "finding") return `/findings`;
  if (n.type === "cve") return `/vuln/${encodeURIComponent(n.label)}`;
  if (n.type === "exploit") return `/xdb`;
  return null;
}

export default function AttackPathGraphPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user, "scan:read");
  const router = useRouter();
  const sp = useSearchParams();

  const [assetId, setAssetId] = useState(sp.get("asset_id") || "");
  const [findingId, setFindingId] = useState(sp.get("finding_id") || "");
  const [data, setData] = useState<GraphOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!assetId.trim() && !findingId.trim()) {
      setErr("Укажите asset_id или finding_id");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const qs = buildQs({
        asset_id: assetId.trim() || undefined,
        finding_id: findingId.trim() || undefined,
      });
      const res = await api<GraphOut>(`/graph/attack-path?${qs}`);
      setData(res);
      setSelected(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [assetId, findingId]);

  useEffect(() => {
    if (!canRead) return;
    if (sp.get("asset_id") || sp.get("finding_id")) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, sp.get("asset_id"), sp.get("finding_id")]);

  const W = 900;
  const H = 480;
  const pos = useMemo(
    () => (data ? layoutNodes(data.nodes || [], W, H) : {}),
    [data],
  );
  const typeCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const n of data?.nodes || []) {
      const t = (n.type || "other").toLowerCase();
      out[t] = (out[t] || 0) + 1;
    }
    return out;
  }, [data]);

  if (!canRead) {
    return (
      <div className="space-y-4" data-testid="graph-page">
        <h1 className="font-display text-2xl font-semibold">Attack path</h1>
        <Card>Нет права scan:read.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="graph-page">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Attack path
        </h1>
        <p className="mt-1 text-sm text-muted">
          Asset → Finding → CVE → Exploit (vanilla SVG)
        </p>
      </div>
      <Card className="flex flex-wrap items-end gap-3">
        <Input
          label="asset_id"
          className="w-32"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          inputMode="numeric"
        />
        <Input
          label="finding_id"
          className="w-32"
          value={findingId}
          onChange={(e) => setFindingId(e.target.value)}
          inputMode="numeric"
        />
        <Button type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} />
          {loading ? "…" : "Построить"}
        </Button>
        {data ? (
          <span className="flex flex-wrap items-center gap-2 pb-2 text-sm text-muted">
            <span>
              nodes {data.summary?.nodes ?? data.nodes?.length ?? 0} · edges{" "}
              {data.summary?.edges ?? data.edges?.length ?? 0}
            </span>
            {(["asset", "finding", "cve", "exploit"] as const).map((t) =>
              typeCounts[t] ? (
                <span key={t} className="inline-flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: TYPE_COLOR[t] }}
                  />
                  {t}: {typeCounts[t]}
                </span>
              ) : null,
            )}
          </span>
        ) : null}
        {selected ? <Badge>{selected}</Badge> : null}
      </Card>
      {err ? (
        <Card className="border-danger/40 text-sm text-danger" role="alert">
          {err}
        </Card>
      ) : null}
      {data ? (
        <Card className="overflow-auto p-2">
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full max-w-full bg-surface2/20"
            role="img"
            aria-label="Attack path graph"
          >
            {(data.edges || []).map((e, i) => {
              const a = pos[e.source];
              const b = pos[e.target];
              if (!a || !b) return null;
              return (
                <line
                  key={`${e.source}-${e.target}-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={1.5}
                  opacity={0.75}
                />
              );
            })}
            {(data.nodes || []).map((n) => {
              const p = pos[n.id];
              if (!p) return null;
              const fill = TYPE_COLOR[n.type] || "#64748b";
              const href = nodeHref(n);
              const active = selected === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelected(n.id);
                    if (href) router.push(href);
                  }}
                >
                  <circle
                    r={active ? 16 : 14}
                    fill={fill}
                    opacity={0.9}
                    stroke={active ? "#fff" : "transparent"}
                    strokeWidth={2}
                  />
                  <title>{`${n.type}: ${n.label}`}</title>
                  <text
                    y={28}
                    textAnchor="middle"
                    className="text-[10px]"
                    style={{ fill: "var(--text, #e8eaed)" }}
                  >
                    {(n.label || "").slice(0, 22)}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="mt-2 flex flex-wrap gap-3 px-2 text-xs text-muted">
            {Object.entries(TYPE_COLOR).map(([t, c]) => (
              <span key={t} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: c }}
                />
                {t}
              </span>
            ))}
          </div>
        </Card>
      ) : (
        !loading &&
        !err && (
          <Card className="text-sm text-muted">
            Укажите asset_id или finding_id в query или форме.
          </Card>
        )
      )}
    </div>
  );
}
