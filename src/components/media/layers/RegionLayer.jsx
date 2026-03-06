import { area } from 'd3-shape';

const COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * RegionLayer — renders shaded area between curves or curve-to-axis.
 *
 * mode: "between_curves" — shades between upper and lower curve references
 * mode: "curve_to_axis" — shades between a curve and the x or y axis
 *
 * Requires curveData map from CartesianPlot to resolve curve id → points.
 */
export default function RegionLayer({ layer, xScale, yScale, curveData }) {
  const { mode, fill, opacity = 0.2 } = layer;
  const fillColor = COLOR_RE.test(fill) ? fill : '#60a5fa';

  if (mode === 'curve_to_axis') {
    return renderCurveToAxis(layer, xScale, yScale, curveData, fillColor, opacity);
  }

  if (mode === 'between_curves') {
    return renderBetweenCurves(layer, xScale, yScale, curveData, fillColor, opacity);
  }

  return null;
}

function renderCurveToAxis(layer, xScale, yScale, curveData, fillColor, opacity) {
  const { curve: curveId, axis = 'x', xMin, xMax } = layer;
  const points = getCurvePoints(curveData, curveId, xMin, xMax);
  if (!points || points.length === 0) return null;

  if (axis === 'x') {
    const areaGen = area()
      .x((d) => xScale(d[0]))
      .y0(yScale(0))
      .y1((d) => yScale(d[1]));

    const d = areaGen(points);
    if (!d) return null;
    return <path d={d} fill={fillColor} opacity={opacity} />;
  }

  // axis === 'y': fill to y-axis (x=0)
  const areaGen = area()
    .y((d) => yScale(d[1]))
    .x0(xScale(0))
    .x1((d) => xScale(d[0]));

  const d = areaGen(points);
  if (!d) return null;
  return <path d={d} fill={fillColor} opacity={opacity} />;
}

function renderBetweenCurves(layer, xScale, yScale, curveData, fillColor, opacity) {
  const { upper, lower, xMin, xMax } = layer;
  const upperPts = getCurvePoints(curveData, upper, xMin, xMax);
  const lowerPts = getCurvePoints(curveData, lower, xMin, xMax);
  if (!upperPts?.length || !lowerPts?.length) return null;

  // Interpolate lower curve at upper curve x-values for alignment
  const lowerMap = new Map(lowerPts.map(([x, y]) => [x, y]));

  const areaGen = area()
    .x((d) => xScale(d[0]))
    .y0((d) => {
      const ly = lowerMap.get(d[0]);
      return yScale(ly != null ? ly : 0);
    })
    .y1((d) => yScale(d[1]));

  const d = areaGen(upperPts);
  if (!d) return null;
  return <path d={d} fill={fillColor} opacity={opacity} />;
}

/**
 * Extract points from curveData map, filtered to [xMin, xMax].
 */
function getCurvePoints(curveData, curveId, xMin, xMax) {
  if (!curveData || !curveId) return null;
  const pts = curveData.get(curveId);
  if (!pts) return null;
  if (xMin == null && xMax == null) return pts;
  return pts.filter(([x]) =>
    (xMin == null || x >= xMin) && (xMax == null || x <= xMax)
  );
}
