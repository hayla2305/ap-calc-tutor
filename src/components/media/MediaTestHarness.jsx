import MediaRenderer from './MediaRenderer';

/**
 * MediaTestHarness — visual smoke test for all layer types.
 * Accessible via #media-test hash in the URL.
 *
 * Renders a single CartesianPlot with one instance of every layer type
 * using hardcoded test data that matches the media schema.
 */

const TEST_MEDIA = [
  {
    id: 'm_test_all_layers',
    kind: 'graph',
    version: '1.0',
    alt: 'Test graph showing all 8 layer types: curve, points, annotation, asymptotes, region, riemann rectangles, discontinuity markers, and vector field',
    graph: {
      coordinateSystem: 'cartesian',
      plotType: 'cartesian_function',
      viewport: { xMin: -2, xMax: 10, yMin: -4, yMax: 6, aspect: 1.6 },
      axes: {
        xLabel: 'x',
        yLabel: 'y',
        ticks: { x: [-2, 0, 2, 4, 6, 8, 10], y: [-4, -2, 0, 2, 4, 6] },
      },
      layers: [
        // 1. Curve — a smooth function
        {
          type: 'curve',
          id: 'f',
          label: 'f(x)',
          color: '#60a5fa',
          source: {
            kind: 'points',
            points: [
              [-2, 3], [-1, 1.5], [0, 0], [0.5, -0.5], [1, -0.8],
              [2, 0], [3, 2], [4, 3.5], [5, 4], [6, 3.5],
              [7, 2], [8, 1], [9, 2], [10, 4],
            ],
          },
        },

        // 2. Second curve (for between_curves region)
        {
          type: 'curve',
          id: 'g',
          label: 'g(x)',
          color: '#f472b6',
          source: {
            kind: 'points',
            points: [
              [-2, -1], [0, -0.5], [2, 0.5], [4, 1], [6, 1.5],
              [8, 0.5], [10, -0.5],
            ],
          },
        },

        // 3. Region — shaded area between curves f and g on [2, 6]
        {
          type: 'region',
          mode: 'between_curves',
          upper: 'f',
          lower: 'g',
          xMin: 2,
          xMax: 6,
          fill: '#a78bfa',
          opacity: 0.25,
        },

        // 4. Riemann rectangles — left sum under f on [6, 10]
        {
          type: 'riemann_rectangles',
          curve: 'f',
          interpolation: 'linear',
          xMin: 6,
          xMax: 10,
          n: 4,
          method: 'left',
          fill: '#34d399',
        },

        // 5. Points — open and closed markers
        { type: 'point', at: [2, 0], marker: 'closed', color: '#60a5fa' },
        { type: 'point', at: [0, 0], marker: 'open', color: '#f472b6' },
        { type: 'point', at: [5, 4], marker: 'dot', color: '#fbbf24' },

        // 6. Asymptotes — one vertical, one horizontal
        { type: 'asymptote', orientation: 'vertical', x: -1 },
        { type: 'asymptote', orientation: 'horizontal', y: 5 },

        // 7. Discontinuity markers — all three kinds
        { type: 'discontinuity_marker', at: [3, 2], kind: 'removable' },
        { type: 'discontinuity_marker', at: [7, 2], kind: 'jump' },
        { type: 'discontinuity_marker', at: [9, 2], kind: 'infinite' },

        // 8. Annotation
        { type: 'annotation', at: [5, -3], text: 'Region between f and g' },

        // 9. Vector field — small slope field in bottom-left area
        {
          type: 'vector_field',
          density: 12,
          samples: [
            { at: [-1.5, -2], slope: 0.5 },
            { at: [-1, -2], slope: 1 },
            { at: [-0.5, -2], slope: 1.5 },
            { at: [-1.5, -3], slope: -0.5 },
            { at: [-1, -3], slope: 0 },
            { at: [-0.5, -3], slope: 0.5 },
            { at: [0, -2], slope: 2 },
            { at: [0, -3], slope: 1 },
            { at: [0.5, -2], slope: -1 },
            { at: [0.5, -3], slope: -0.5 },
          ],
        },
      ],
    },
  },
];

// Second test: a standalone vector field (slope field problem)
const TEST_SLOPE_FIELD = [
  {
    id: 'm_test_slope_field',
    kind: 'graph',
    version: '1.0',
    alt: 'Slope field for dy/dx = x - y showing line segments at grid points',
    graph: {
      coordinateSystem: 'cartesian',
      plotType: 'slope_field',
      viewport: { xMin: -3, xMax: 3, yMin: -3, yMax: 3, aspect: 1 },
      axes: {
        xLabel: 'x',
        yLabel: 'y',
        ticks: { x: [-3, -2, -1, 0, 1, 2, 3], y: [-3, -2, -1, 0, 1, 2, 3] },
      },
      layers: [
        {
          type: 'vector_field',
          density: 12,
          samples: generateSlopeField(-3, 3, -3, 3, 0.5, (x, y) => x - y),
        },
      ],
    },
  },
];

/**
 * Generate slope field samples for a test — this is build-time only,
 * NOT runtime eval. In production, samples come from problems-media.json.
 */
function generateSlopeField(xMin, xMax, yMin, yMax, step, fn) {
  const samples = [];
  for (let x = xMin; x <= xMax; x += step) {
    for (let y = yMin; y <= yMax; y += step) {
      samples.push({ at: [x, y], slope: fn(x, y) });
    }
  }
  return samples;
}

export default function MediaTestHarness() {
  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-6 space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-2">Media Renderer Test Harness</h2>
        <p className="text-sm text-[var(--color-text-dim)] mb-4">
          Visual smoke test — one of each layer type. Tap any graph to expand full-screen.
        </p>
      </div>

      {/* Test 1: All layers on one graph */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-3">
          Test 1: All 8 Layer Types
        </h3>
        <div className="text-xs text-[var(--color-text-dim)] mb-2 space-y-1">
          <p>Blue curve (f) + pink curve (g) + purple shaded region between them [2,6]</p>
          <p>Green Riemann rectangles (left sum) under f on [6,10]</p>
          <p>Points: closed (blue, x=2), open (pink, x=0), dot (yellow, x=5)</p>
          <p>Asymptotes: vertical at x=-1, horizontal at y=5</p>
          <p>Discontinuity markers: removable (x=3), jump (x=7), infinite (x=9)</p>
          <p>Annotation text at bottom + vector field segments in bottom-left</p>
        </div>
        <MediaRenderer media={TEST_MEDIA} />
      </section>

      {/* Test 2: Slope field */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-3">
          Test 2: Slope Field (dy/dx = x - y)
        </h3>
        <div className="text-xs text-[var(--color-text-dim)] mb-2">
          <p>Dense vector field showing slope segments at grid points</p>
        </div>
        <MediaRenderer media={TEST_SLOPE_FIELD} />
      </section>

      {/* Test 3: Fallback states */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-3">
          Test 3: Fallback States
        </h3>
        <div className="space-y-2">
          <MediaRenderer media={[{ id: 'f1', kind: 'table', version: '1.0', alt: 'Test table' }]} />
          <MediaRenderer media={[{ id: 'f2', kind: 'image', version: '1.0', alt: 'Test image' }]} />
          <MediaRenderer media={[{ id: 'f3', kind: 'diagram', version: '1.0', alt: 'Test diagram' }]} />
          <MediaRenderer media={[{ id: 'f4', kind: 'unknown', version: '1.0', alt: 'Unknown type' }]} />
          <MediaRenderer media={[{ id: 'f5', kind: 'graph', version: '99.0', alt: 'Future version', graph: {} }]} />
        </div>
      </section>
    </div>
  );
}
