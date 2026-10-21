import type { ScoreBand } from "../api/types";
import { BAND_META } from "../lib/format";

export function ScoreRing({ score, band, size = 168, label = "Alignment score" }: { score: number; band: ScoreBand; size?: number; label?: string }) {
  const stroke = Math.max(8, size / 14);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  return (
    <figure className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(clamped)} out of 100, ${BAND_META[band].label}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5dcc8" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={BAND_META[band].bar}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms ease-out" }}
        />
      </svg>
      <figcaption className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className="font-display font-semibold leading-none text-ink" style={{ fontSize: size * 0.3 }}>{Math.round(clamped)}</span>
        <span className="mt-1 text-xs text-muted">out of 100</span>
      </figcaption>
    </figure>
  );
}
