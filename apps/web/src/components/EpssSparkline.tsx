"use client";

type Point = { scored_at?: string; score?: number; percentile?: number };

type Props = {
  points: Point[];
  width?: number;
  height?: number;
  className?: string;
};

/** Tiny SVG sparkline for EPSS history (0–1 scores). */
export function EpssSparkline({ points, width = 160, height = 36, className }: Props) {
  const scores = (points || [])
    .map((p) => Number(p.score))
    .filter((n) => Number.isFinite(n));
  if (scores.length < 2) {
    return (
      <div className={`text-xs text-muted ${className || ""}`}>
        {scores.length === 1 ? "Одна точка EPSS — история появится после следующих sync" : "Нет истории EPSS"}
      </div>
    );
  }
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 0.01);
  const span = max - min || 0.01;
  const coords = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * w;
    const y = pad + h - ((s - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = scores[scores.length - 1];
  const first = scores[0];
  const up = last >= first;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`EPSS history ${scores.length} points`}
      data-testid="epss-sparkline"
    >
      <polyline
        fill="none"
        stroke={up ? "currentColor" : "var(--danger, #c44)"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(" ")}
        className={up ? "text-accent" : undefined}
      />
      <circle
        cx={coords[coords.length - 1].split(",")[0]}
        cy={coords[coords.length - 1].split(",")[1]}
        r="2.2"
        className="fill-accent"
      />
    </svg>
  );
}
