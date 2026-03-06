const COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * PointLayer — renders a single point marker on the graph.
 * marker: "open" (unfilled circle), "closed" (filled), "dot" (small filled)
 */
export default function PointLayer({ layer, xScale, yScale }) {
  const { at, marker = 'closed', color, radius } = layer;
  if (!at || at.length < 2) return null;

  const cx = xScale(at[0]);
  const cy = yScale(at[1]);
  const strokeColor = COLOR_RE.test(color) ? color : '#60a5fa';

  if (marker === 'open') {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={radius || 5}
        fill="var(--color-bg, #1a1a2e)"
        stroke={strokeColor}
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
        fill={strokeColor}
      />
    );
  }

  // Default: closed (filled)
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius || 5}
      fill={strokeColor}
    />
  );
}
