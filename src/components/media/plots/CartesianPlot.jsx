import { useMemo, useId, useState, useRef, useEffect } from 'react';
import { scaleLinear } from 'd3-scale';
import CurveLayer from '../layers/CurveLayer';
import PointLayer from '../layers/PointLayer';
import AnnotationLayer from '../layers/AnnotationLayer';
import AsymptoteLayer from '../layers/AsymptoteLayer';
import DiscontinuityLayer from '../layers/DiscontinuityLayer';
import RegionLayer from '../layers/RegionLayer';
import RiemannLayer from '../layers/RiemannLayer';
import VectorFieldLayer from '../layers/VectorFieldLayer';

const MAX_LAYERS = 12;
const PADDING = { top: 20, right: 20, bottom: 40, left: 45 };

/**
 * CartesianPlot — coordinate system + layer pipeline.
 * Pure SVG with d3-scale for coordinate→pixel mapping.
 *
 * All colors use inline `style` (not SVG attributes) so CSS custom
 * properties resolve correctly across browsers.
 */
export default function CartesianPlot({ graph, alt }) {
  const clipId = useId();
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(500);
  const { viewport, axes, layers } = graph;
  const { xMin, xMax, yMin, yMax, aspect = 1.6 } = viewport;

  // Track actual rendered width for tick thinning on mobile
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // SVG dimensions — responsive via viewBox
  const width = 500;
  const height = Math.round(width / aspect);
  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  // d3 scales: data → pixel
  const xScale = useMemo(
    () => scaleLinear().domain([xMin, xMax]).range([PADDING.left, PADDING.left + plotW]),
    [xMin, xMax, plotW]
  );
  const yScale = useMemo(
    () => scaleLinear().domain([yMin, yMax]).range([PADDING.top + plotH, PADDING.top]),
    [yMin, yMax, plotH]
  );

  // Build curveData map: curve id → points (for Region/Riemann references)
  const curveData = useMemo(() => {
    const map = new Map();
    if (!layers) return map;
    for (const layer of layers) {
      if (layer.type === 'curve' && layer.id && layer.source?.points) {
        map.set(layer.id, layer.source.points);
      }
    }
    return map;
  }, [layers]);

  // Cap layers
  const cappedLayers = layers?.slice(0, MAX_LAYERS) || [];

  // Tick values — thin on narrow viewports (<360px)
  const rawXTicks = axes?.ticks?.x || generateTicks(xMin, xMax);
  const rawYTicks = axes?.ticks?.y || generateTicks(yMin, yMax);
  const xTicks = containerWidth < 360 ? thinTicks(rawXTicks) : rawXTicks;
  const yTicks = containerWidth < 360 ? thinTicks(rawYTicks) : rawYTicks;

  return (
    <svg
      ref={containerRef}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full min-h-[220px]"
      style={{ aspectRatio: aspect }}
      role="img"
      aria-label={alt}
    >
      <title>{alt}</title>

      {/* Grid lines */}
      <g opacity={0.15}>
        {xTicks.map((v) => (
          <line key={`gx-${v}`} x1={xScale(v)} y1={PADDING.top} x2={xScale(v)} y2={PADDING.top + plotH} style={{ stroke: 'var(--color-text, #e0e0e0)' }} strokeWidth={0.5} />
        ))}
        {yTicks.map((v) => (
          <line key={`gy-${v}`} x1={PADDING.left} y1={yScale(v)} x2={PADDING.left + plotW} y2={yScale(v)} style={{ stroke: 'var(--color-text, #e0e0e0)' }} strokeWidth={0.5} />
        ))}
      </g>

      {/* Axes */}
      <g>
        {/* X axis */}
        {yMin <= 0 && yMax >= 0 && (
          <line x1={PADDING.left} y1={yScale(0)} x2={PADDING.left + plotW} y2={yScale(0)} style={{ stroke: 'var(--color-text, #e0e0e0)' }} strokeWidth={1} />
        )}
        {/* Y axis */}
        {xMin <= 0 && xMax >= 0 && (
          <line x1={xScale(0)} y1={PADDING.top} x2={xScale(0)} y2={PADDING.top + plotH} style={{ stroke: 'var(--color-text, #e0e0e0)' }} strokeWidth={1} />
        )}

        {/* X ticks + labels */}
        {xTicks.map((v) => (
          <g key={`xt-${v}`}>
            <line x1={xScale(v)} y1={PADDING.top + plotH} x2={xScale(v)} y2={PADDING.top + plotH + 5} style={{ stroke: 'var(--color-text-dim, #888)' }} strokeWidth={1} />
            <text x={xScale(v)} y={PADDING.top + plotH + 18} textAnchor="middle" style={{ fill: 'var(--color-text-dim, #888)' }} fontSize={11} fontFamily="system-ui, sans-serif">
              {v}
            </text>
          </g>
        ))}

        {/* Y ticks + labels */}
        {yTicks.map((v) => (
          <g key={`yt-${v}`}>
            <line x1={PADDING.left - 5} y1={yScale(v)} x2={PADDING.left} y2={yScale(v)} style={{ stroke: 'var(--color-text-dim, #888)' }} strokeWidth={1} />
            <text x={PADDING.left - 10} y={yScale(v) + 4} textAnchor="end" style={{ fill: 'var(--color-text-dim, #888)' }} fontSize={11} fontFamily="system-ui, sans-serif">
              {v}
            </text>
          </g>
        ))}

        {/* Axis labels */}
        {axes?.xLabel && (
          <text x={PADDING.left + plotW / 2} y={height - 4} textAnchor="middle" style={{ fill: 'var(--color-text, #e0e0e0)' }} fontSize={13} fontFamily="system-ui, sans-serif">
            {axes.xLabel}
          </text>
        )}
        {axes?.yLabel && (
          <text x={14} y={PADDING.top + plotH / 2} textAnchor="middle" style={{ fill: 'var(--color-text, #e0e0e0)' }} fontSize={13} fontFamily="system-ui, sans-serif" transform={`rotate(-90, 14, ${PADDING.top + plotH / 2})`}>
            {axes.yLabel}
          </text>
        )}
      </g>

      {/* Plot area clip — unique ID per instance */}
      <defs>
        <clipPath id={clipId}>
          <rect x={PADDING.left} y={PADDING.top} width={plotW} height={plotH} />
        </clipPath>
      </defs>

      {/* Layer pipeline */}
      <g clipPath={`url(#${clipId})`}>
        {cappedLayers.map((layer, i) => renderLayer(layer, i, xScale, yScale, curveData, alt))}
      </g>
    </svg>
  );
}

function renderLayer(layer, i, xScale, yScale, curveData, alt) {
  switch (layer.type) {
    case 'curve':
      return <CurveLayer key={i} layer={layer} xScale={xScale} yScale={yScale} />;
    case 'point':
      return <PointLayer key={i} layer={layer} xScale={xScale} yScale={yScale} />;
    case 'annotation':
      return <AnnotationLayer key={i} layer={layer} xScale={xScale} yScale={yScale} />;
    case 'asymptote':
      return <AsymptoteLayer key={i} layer={layer} xScale={xScale} yScale={yScale} />;
    case 'discontinuity_marker':
      return <DiscontinuityLayer key={i} layer={layer} xScale={xScale} yScale={yScale} />;
    case 'region':
      return <RegionLayer key={i} layer={layer} xScale={xScale} yScale={yScale} curveData={curveData} />;
    case 'riemann_rectangles':
      return <RiemannLayer key={i} layer={layer} xScale={xScale} yScale={yScale} curveData={curveData} />;
    case 'vector_field':
      return <VectorFieldLayer key={i} layer={layer} xScale={xScale} yScale={yScale} />;
    default:
      if (import.meta.env.DEV) {
        console.warn(`CartesianPlot: unknown layer type "${layer.type}"`);
      }
      // Render visible fallback instead of silently swallowing
      return (
        <text
          key={i}
          x={xScale((xScale.domain()[0] + xScale.domain()[1]) / 2)}
          y={yScale((yScale.domain()[0] + yScale.domain()[1]) / 2)}
          textAnchor="middle"
          style={{ fill: 'var(--color-text-dim, #888)' }}
          fontSize={11}
        >
          [unsupported layer: {layer.type}]
        </text>
      );
  }
}

/**
 * Generate evenly-spaced tick values for a given range.
 */
function generateTicks(min, max, count = 6) {
  const step = (max - min) / count;
  const ticks = [];
  for (let v = min; v <= max; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

/**
 * Thin ticks for narrow viewports — show every other tick to prevent overlap.
 */
function thinTicks(ticks) {
  if (ticks.length <= 4) return ticks;
  return ticks.filter((_, i) => i % 2 === 0);
}
