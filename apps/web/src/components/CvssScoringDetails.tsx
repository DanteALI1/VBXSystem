"use client";

import { CVSS_METRICS, metricWeights, parseCvssVector, type ParsedCvss } from "@/lib/cvss";

type Props = {
  score?: number | null;
  severity?: string | null;
  version?: string | null;
  vector?: string | null;
  isRemote?: boolean | null;
};

function Radar({ values }: { values: number[] }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 78;
  const n = values.length;
  const maxW = 3;

  function point(i: number, r: number) {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
  }

  const rings = [1, 2, 3].map((level) => {
    const pts = Array.from({ length: n }, (_, i) => point(i, (maxR * level) / maxW));
    return pts.map(([x, y]) => `${x},${y}`).join(" ");
  });

  const dataPts = values
    .map((w, i) => point(i, (maxR * Math.max(0, w)) / maxW))
    .map(([x, y]) => `${x},${y}`)
    .join(" ");

  const axes = Array.from({ length: n }, (_, i) => {
    const [x, y] = point(i, maxR);
    return { x, y, label: CVSS_METRICS[i].key };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-52 w-52" role="img" aria-label="CVSS radar">
      {rings.map((pts, idx) => (
        <polygon
          key={idx}
          points={pts}
          fill="none"
          stroke="rgba(148,163,184,0.25)"
          strokeWidth={1}
        />
      ))}
      {axes.map((a) => (
        <g key={a.label}>
          <line x1={cx} y1={cy} x2={a.x} y2={a.y} stroke="rgba(148,163,184,0.2)" strokeWidth={1} />
          <text
            x={a.x}
            y={a.y}
            dy={a.y < cy - 10 ? -4 : a.y > cy + 10 ? 12 : 4}
            dx={a.x < cx - 10 ? -6 : a.x > cx + 10 ? 6 : 0}
            textAnchor={a.x < cx - 10 ? "end" : a.x > cx + 10 ? "start" : "middle"}
            className="fill-muted text-[10px]"
          >
            {a.label}
          </text>
        </g>
      ))}
      <polygon points={dataPts} fill="rgba(59,130,246,0.35)" stroke="#60a5fa" strokeWidth={2} />
    </svg>
  );
}

function MetricGroup({
  label,
  options,
  selected,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected?: string;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="flex w-full overflow-hidden rounded-lg border border-border" role="group" aria-label={label}>
        {options.map((o) => {
          const active = o.value === selected;
          return (
            <div
              key={o.value}
              className={`flex-1 border-r border-border px-1.5 py-1.5 text-center text-[11px] last:border-r-0 ${
                active
                  ? "bg-accent/25 font-semibold text-accent2"
                  : "bg-surface2/40 text-muted/70"
              }`}
              aria-current={active ? "true" : undefined}
            >
              {o.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CvssScoringDetails({ score, severity, version, vector, isRemote }: Props) {
  const parsed: ParsedCvss | null = parseCvssVector(vector);
  const weights = metricWeights(parsed);
  const ver = version || parsed?.version || "3.1";

  return (
    <div className="space-y-4" data-testid="scoring-details">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Scoring</div>
        <h2 className="mt-1 font-display text-lg font-semibold">Vulnerability Scoring Details</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Common Vulnerability Scoring System (CVSS) — стандартизированная оценка критичности.
          Метрики разобраны из вектора; активные значения подсвечены.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface2/50 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs text-muted">CVSS {ver}</div>
            <div className="font-display text-4xl font-semibold tabular-nums text-text">
              {score != null ? score.toFixed(1) : "—"}
            </div>
            <div className="mt-1 text-sm font-medium text-accent2">{severity || "N/A"}</div>
          </div>
          <div className="text-right text-xs text-muted">
            <div>Remotely exploitable</div>
            <div className={`mt-0.5 font-semibold ${isRemote ? "text-warn" : "text-muted"}`}>
              {isRemote == null ? "—" : isRemote ? "Yes" : "No"}
            </div>
          </div>
        </div>
        {vector && (
          <code className="mt-3 block break-all rounded-lg bg-bg/80 px-2.5 py-2 text-[11px] text-muted">
            {vector}
          </code>
        )}
      </div>

      {parsed && (
        <>
          <div className="rounded-xl border border-border bg-surface2/40 p-3">
            <Radar values={weights} />
          </div>
          <div>
            {CVSS_METRICS.map((m) => (
              <MetricGroup
                key={m.key}
                label={`${m.label} / ${m.labelRu}`}
                options={m.options}
                selected={parsed.metrics[m.key]}
              />
            ))}
          </div>
        </>
      )}

      {!parsed && (
        <p className="text-sm text-muted">Вектор CVSS отсутствует — детальный разбор недоступен.</p>
      )}
    </div>
  );
}
