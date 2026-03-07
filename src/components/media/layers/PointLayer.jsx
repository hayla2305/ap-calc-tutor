import { resolveColor } from './colorTokens';

/**
 * PointLayer — renders a single point marker on the graph.
 * marker: "open" (unfilled circle), "closed" (filled), "dot" (small filled)
 *
 * All colors use inline `style` so CSS custom properties resolve correctly.
 */
export default function PointLayer({ layer, xScale, yScale }) {
  const { at, marker = 'closed', color, radius } = layer;
  if (!at || at.length < 2) return null;

  const cx = xScale(at[0]);
  const cy = yScale(at[1]);
  const resolvedColor = resolveColor(color);

  if (marker === 'open') {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={radius || 5}
        style={{ fill: 'var(--color-bg, #1a1a2e)', stroke: resolvedColor }}
        strokeWidth={2}
      />
    );
  }

  if (marker === 'dot') {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={radius || 3}
        style={{ fill: resolvedColor }}
      />
    );
  }

  // Default: closed (filled)
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius || 5}
      style={{ fill: resolvedColor }}
    />
  );
}
