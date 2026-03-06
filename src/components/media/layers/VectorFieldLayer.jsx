const MAX_VECTORS = 400;

/**
 * VectorFieldLayer — renders a slope/direction field from precomputed samples.
 * No runtime eval — all vectors come from the media schema.
 */
export default function VectorFieldLayer({ layer, xScale, yScale }) {
  const { samples } = layer;
  if (!samples?.length) return null;

  const capped = samples.slice(0, MAX_VECTORS);

  // Compute a consistent segment length in pixel space
  const segLen = 12;

  return (
    <g>
      {capped.map((sample, i) => {
        const { at, slope } = sample;
        if (!at || at.length < 2 || slope == null) return null;

        const cx = xScale(at[0]);
        const cy = yScale(at[1]);

        // Compute direction from slope
        // slope = dy/dx; angle = atan(slope) but y is inverted in SVG
        const angle = Math.atan(slope);
        const dx = Math.cos(angle) * segLen / 2;
        // Negate dy because SVG y increases downward
        const dy = -Math.sin(angle) * segLen / 2;

        return (
          <line
            key={i}
            x1={cx - dx}
            y1={cy - dy}
            x2={cx + dx}
            y2={cy + dy}
            stroke="var(--color-text-dim, #888)"
            strokeWidth={1}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}
