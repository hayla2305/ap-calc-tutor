const MAX_TEXT_LENGTH = 80;

/**
 * AnnotationLayer — renders a text annotation at a coordinate.
 * Uses inline style for CSS custom property support in SVG.
 */
export default function AnnotationLayer({ layer, xScale, yScale }) {
  const { at, text } = layer;
  if (!at || at.length < 2 || !text) return null;

  const x = xScale(at[0]);
  const y = yScale(at[1]);
  const displayText = typeof text === 'string' ? text.slice(0, MAX_TEXT_LENGTH) : '';

  return (
    <g>
      {/* Background pill for readability */}
      <rect
        x={x - displayText.length * 3.5 - 6}
        y={y - 10}
        width={displayText.length * 7 + 12}
        height={20}
        rx={4}
        style={{ fill: 'var(--color-bg, #1a1a2e)' }}
        opacity={0.85}
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: 'var(--color-text, #e0e0e0)' }}
        fontSize={13}
        fontWeight="500"
        fontFamily="system-ui, sans-serif"
      >
        {displayText}
      </text>
    </g>
  );
}
