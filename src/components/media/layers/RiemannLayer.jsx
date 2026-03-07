import { resolveColor } from './colorTokens';

/**
 * RiemannLayer — renders Riemann sum rectangles under a curve.
 *
 * method: "left" | "right" | "midpoint" | "trapezoidal"
 * Requires curveData map from CartesianPlot to resolve curve id → points.
 * All colors use inline `style` so CSS custom properties resolve correctly.
 */
export default function RiemannLayer({ layer, xScale, yScale, curveData }) {
  const { curve: curveId, xMin, xMax, n, method = 'left', fill } = layer;
  if (!curveId || xMin == null || xMax == null || !n || n <= 0) return null;

  const points = curveData?.get(curveId);
  if (!points?.length) return null;

  const fillColor = resolveColor(fill);
  const dx = (xMax - xMin) / n;
  const rects = [];

  for (let i = 0; i < n; i++) {
    const xLeft = xMin + i * dx;
    const xRight = xLeft + dx;
    let height;

    if (method === 'left') {
      height = interpolateY(points, xLeft);
    } else if (method === 'right') {
      height = interpolateY(points, xRight);
    } else if (method === 'midpoint') {
      height = interpolateY(points, (xLeft + xRight) / 2);
    } else if (method === 'trapezoidal') {
      // For trapezoidal, draw a trapezoid instead of rectangle
      const yL = interpolateY(points, xLeft);
      const yR = interpolateY(points, xRight);
      const pxLeft = xScale(xLeft);
      const pxRight = xScale(xRight);
      const py0 = yScale(0);
      const pyL = yScale(yL);
      const pyR = yScale(yR);
      rects.push(
        <polygon
          key={i}
          points={`${pxLeft},${py0} ${pxLeft},${pyL} ${pxRight},${pyR} ${pxRight},${py0}`}
          style={{ fill: fillColor, stroke: fillColor }}
          opacity={0.3}
          strokeWidth={1}
        />
      );
      continue;
    }

    if (height == null) continue;

    const pxX = xScale(xLeft);
    const pxW = xScale(xRight) - xScale(xLeft);
    const py0 = yScale(0);
    const pyH = yScale(height);

    // Handle negative heights (below x-axis)
    const rectY = Math.min(py0, pyH);
    const rectH = Math.abs(pyH - py0);

    rects.push(
      <rect
        key={i}
        x={pxX}
        y={rectY}
        width={pxW}
        height={rectH}
        style={{ fill: fillColor, stroke: fillColor }}
        opacity={0.3}
        strokeWidth={1}
      />
    );
  }

  return <g>{rects}</g>;
}

/**
 * Linear interpolation of y-value at a given x from sorted points array.
 */
function interpolateY(points, x) {
  if (points.length === 0) return 0;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[points.length - 1][0]) return points[points.length - 1][1];

  for (let i = 0; i < points.length - 1; i++) {
    if (x >= points[i][0] && x <= points[i + 1][0]) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      if (x1 === x0) return y0;
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 0;
}
