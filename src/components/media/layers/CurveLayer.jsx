import { line, curveCatmullRom } from 'd3-shape';
import { resolveColor } from './colorTokens';

const MAX_POINTS = 2000;

/**
 * CurveLayer — renders a smooth curve from sampled points.
 * Uses d3-shape catmull-rom interpolation.
 */
export default function CurveLayer({ layer, xScale, yScale }) {
  const { source, color, id, label } = layer;
  if (!source?.points?.length) return null;

  const points = source.points.slice(0, MAX_POINTS);
  const strokeColor = resolveColor(color);

  const pathGen = line()
    .x((d) => xScale(d[0]))
    .y((d) => yScale(d[1]))
    .curve(curveCatmullRom.alpha(0.5));

  const d = pathGen(points);
  if (!d) return null;

  return (
    <path
      d={d}
      fill="none"
      style={{ stroke: strokeColor }}
      strokeWidth={2}
      data-layer-id={id}
      aria-label={label || id}
    />
  );
}
