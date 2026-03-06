const MAX_TEXT_LENGTH = 80;

/**
 * AnnotationLayer — renders a text annotation at a coordinate.
 */
export default function AnnotationLayer({ layer, xScale, yScale }) {
  const { at, text } = layer;
  if (!at || at.length < 2 || !text) return null;

  const x = xScale(at[0]);
  const y = yScale(at[1]);
  const displayText = typeof text === 'string' ? text.slice(0, MAX_TEXT_LENGTH) : '';

  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="var(--color-text, #e0e0e0)"
      fontSize={12}
      fontFamily="system-ui, sans-serif"
    >
      {displayText}
    </text>
  );
}
