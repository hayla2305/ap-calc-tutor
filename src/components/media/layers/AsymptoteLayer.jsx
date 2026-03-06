/**
 * AsymptoteLayer — renders dashed vertical or horizontal asymptote lines.
 */
export default function AsymptoteLayer({ layer, xScale, yScale }) {
  const { orientation, x, y } = layer;

  if (orientation === 'vertical' && x != null) {
    const px = xScale(x);
    const [yTop, yBottom] = yScale.range();
    return (
      <line
        x1={px}
        y1={yTop}
        x2={px}
        y2={yBottom}
        stroke="var(--color-text-dim, #888)"
        strokeWidth={1.5}
        strokeDasharray="6 4"
      />
    );
  }

  if (orientation === 'horizontal' && y != null) {
    const py = yScale(y);
    const [xLeft, xRight] = xScale.range();
    return (
      <line
        x1={xLeft}
        y1={py}
        x2={xRight}
        y2={py}
        stroke="var(--color-text-dim, #888)"
        strokeWidth={1.5}
        strokeDasharray="6 4"
      />
    );
  }

  return null;
}
