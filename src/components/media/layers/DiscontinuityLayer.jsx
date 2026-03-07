/**
 * DiscontinuityLayer — renders discontinuity markers.
 * kind: "removable" (open circle), "jump" (gap indicator), "infinite" (arrow)
 */
export default function DiscontinuityLayer({ layer, xScale, yScale }) {
  const { at, kind = 'removable' } = layer;
  if (!at || at.length < 2) return null;

  const cx = xScale(at[0]);
  const cy = yScale(at[1]);

  if (kind === 'removable') {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={5}
        style={{ fill: 'var(--color-bg, #1a1a2e)', stroke: 'var(--color-text, #e0e0e0)' }}
        strokeWidth={2}
      />
    );
  }

  if (kind === 'jump') {
    // Gap indicator: two small horizontal lines with a vertical gap
    return (
      <g>
        <line x1={cx - 6} y1={cy - 4} x2={cx + 6} y2={cy - 4} style={{ stroke: 'var(--color-text, #e0e0e0)' }} strokeWidth={2} />
        <line x1={cx - 6} y1={cy + 4} x2={cx + 6} y2={cy + 4} style={{ stroke: 'var(--color-text, #e0e0e0)' }} strokeWidth={2} />
      </g>
    );
  }

  if (kind === 'infinite') {
    // Arrow pointing up to indicate infinite discontinuity
    return (
      <g>
        <line x1={cx} y1={cy + 8} x2={cx} y2={cy - 8} style={{ stroke: 'var(--color-text, #e0e0e0)' }} strokeWidth={2} />
        <polygon points={`${cx},${cy - 12} ${cx - 4},${cy - 6} ${cx + 4},${cy - 6}`} style={{ fill: 'var(--color-text, #e0e0e0)' }} />
      </g>
    );
  }

  return null;
}
