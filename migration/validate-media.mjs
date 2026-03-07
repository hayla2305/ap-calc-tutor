#!/usr/bin/env node
/**
 * validate-media.mjs — Structural validator for problems-media.json
 *
 * Enforces:
 *  - Required fields (id, kind, version, alt, graph)
 *  - Version is "1.0"
 *  - Viewport has required numeric fields
 *  - Layer count <= MAX_LAYERS (12)
 *  - Layer types from allowed set
 *  - Per-layer-type key allowlists (additionalProperties: false)
 *  - Curve points are arrays of [x, y] (max 2000)
 *  - Vector field samples max 400 (error, not warn)
 *  - Point markers are valid enum values
 *  - Region/Riemann curve references resolve
 *  - plotType/coordinateSystem compatibility
 *  - Alt text quality guard: flags answer-bearing patterns
 *  - No duplicate media IDs
 *
 * Usage:  node migration/validate-media.mjs
 * Exit 0 = pass, Exit 1 = failures
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mediaPath = resolve(__dirname, '../src/data/problems-media.json');

const MAX_LAYERS = 12;
const MAX_POINTS = 2000;
const MAX_VECTORS = 400;

const VALID_LAYER_TYPES = new Set([
  'curve', 'point', 'annotation', 'asymptote',
  'discontinuity_marker', 'region', 'riemann_rectangles', 'vector_field',
]);
const VALID_MARKERS = new Set(['open', 'closed', 'dot']);
const VALID_ORIENTATIONS = new Set(['vertical', 'horizontal']);
const VALID_DISCONTINUITY_KINDS = new Set(['jump', 'removable', 'infinite']);
const VALID_REGION_MODES = new Set(['between_curves', 'curve_to_axis']);

// ── Per-layer-type key allowlists (additionalProperties: false) ──
const ALLOWED_KEYS = {
  curve:                new Set(['type', 'id', 'label', 'color', 'source']),
  point:                new Set(['type', 'at', 'marker', 'color', 'radius']),
  annotation:           new Set(['type', 'at', 'text', 'color', 'fontSize']),
  asymptote:            new Set(['type', 'orientation', 'x', 'y', 'color', 'label']),
  discontinuity_marker: new Set(['type', 'at', 'kind', 'color']),
  region:               new Set(['type', 'mode', 'upper', 'lower', 'curve', 'axis', 'xMin', 'xMax', 'fill', 'opacity']),
  riemann_rectangles:   new Set(['type', 'curve', 'xMin', 'xMax', 'n', 'method', 'fill']),
  vector_field:         new Set(['type', 'samples', 'density', 'color']),
};

// ── Top-level media item allowed keys ──
const ALLOWED_ITEM_KEYS = new Set(['id', 'kind', 'version', 'alt', 'graph']);

// ── Graph object allowed keys ──
const ALLOWED_GRAPH_KEYS = new Set(['coordinateSystem', 'plotType', 'viewport', 'axes', 'layers']);

// ── plotType/coordinateSystem compatibility ──
const VALID_PLOT_COMBOS = new Set([
  'cartesian:cartesian_function',
  'cartesian:slope_field',
]);

// ── Alt text answer-reveal patterns ──
// These are flagged as WARNINGS for manual review — the alt should describe
// the graph, not state the conclusion the student needs to reach.
const ALT_BANNED_PATTERNS = [
  /\binflection point\b/i,
  /\babsolute (minimum|maximum)\b/i,
  /\blocal (min|max|minimum|maximum) of f\b/i,
  /\bf is (increasing|decreasing)\b/i,
  /\bf is concave (up|down)\b/i,
  /\bconverges to\b/i,
  /\bdiverges\b/i,
];

let errors = 0;
let warnings = 0;
const seenIds = new Set();

function err(problemId, mediaIdx, msg) {
  console.error(`  ERROR [${problemId}][${mediaIdx}]: ${msg}`);
  errors++;
}

function warn(problemId, mediaIdx, msg) {
  console.warn(`  WARN  [${problemId}][${mediaIdx}]: ${msg}`);
  warnings++;
}

function inBounds(val, min, max, tolerance = 0.1) {
  const range = max - min;
  return val >= min - range * tolerance && val <= max + range * tolerance;
}

function checkUnknownKeys(obj, allowed, problemId, mediaIdx, context) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      err(problemId, mediaIdx, `${context}: unknown field "${key}"`);
    }
  }
}

// ── Load ──
let data;
try {
  data = JSON.parse(readFileSync(mediaPath, 'utf-8'));
} catch (e) {
  console.error(`Failed to read ${mediaPath}: ${e.message}`);
  process.exit(1);
}

const problemKeys = Object.keys(data).filter(k => !k.startsWith('_'));
console.log(`Validating ${problemKeys.length} problem keys...\n`);

for (const problemId of problemKeys) {
  const mediaArr = data[problemId];

  if (!Array.isArray(mediaArr)) {
    err(problemId, '-', 'Value is not an array');
    continue;
  }

  mediaArr.forEach((item, idx) => {
    // ── Required top-level fields ──
    if (!item.id) err(problemId, idx, 'Missing "id"');
    if (!item.kind) err(problemId, idx, 'Missing "kind"');
    if (!item.version) err(problemId, idx, 'Missing "version"');
    if (!item.alt) err(problemId, idx, 'Missing "alt"');

    // ── Unknown top-level keys ──
    checkUnknownKeys(item, ALLOWED_ITEM_KEYS, problemId, idx, 'media item');

    // ── Duplicate ID check ──
    if (item.id) {
      if (seenIds.has(item.id)) err(problemId, idx, `Duplicate media id: "${item.id}"`);
      seenIds.add(item.id);
    }

    // ── Version check ──
    if (item.version && item.version !== '1.0') {
      err(problemId, idx, `Unsupported version "${item.version}" (expected "1.0")`);
    }

    // ── Alt text quality guard ──
    if (item.alt) {
      for (const pattern of ALT_BANNED_PATTERNS) {
        if (pattern.test(item.alt)) {
          warn(problemId, idx, `Alt text may reveal answer — flagged pattern: ${pattern}. Review: "${item.alt.substring(0, 80)}"`);
          break;
        }
      }
    }

    // Only validate graph kind for now
    if (item.kind !== 'graph') {
      warn(problemId, idx, `Non-graph kind "${item.kind}" — skipping graph validation`);
      return;
    }

    const { graph } = item;
    if (!graph) {
      err(problemId, idx, 'Missing "graph" object');
      return;
    }

    // ── Unknown graph keys ──
    checkUnknownKeys(graph, ALLOWED_GRAPH_KEYS, problemId, idx, 'graph');

    // ── plotType/coordinateSystem compatibility ──
    const combo = `${graph.coordinateSystem}:${graph.plotType}`;
    if (!VALID_PLOT_COMBOS.has(combo)) {
      err(problemId, idx, `Unsupported plotType/coordinateSystem combo: "${combo}"`);
    }

    // ── Viewport ──
    const vp = graph.viewport;
    if (!vp) {
      err(problemId, idx, 'Missing "graph.viewport"');
      return;
    }
    for (const field of ['xMin', 'xMax', 'yMin', 'yMax']) {
      if (typeof vp[field] !== 'number') {
        err(problemId, idx, `viewport.${field} is not a number`);
      }
    }
    if (vp.xMin >= vp.xMax) err(problemId, idx, 'viewport.xMin >= xMax');
    if (vp.yMin >= vp.yMax) err(problemId, idx, 'viewport.yMin >= yMax');

    // ── Layers ──
    const layers = graph.layers;
    if (!layers || !Array.isArray(layers)) {
      err(problemId, idx, 'Missing or non-array "graph.layers"');
      return;
    }
    if (layers.length > MAX_LAYERS) {
      err(problemId, idx, `${layers.length} layers exceeds MAX_LAYERS=${MAX_LAYERS}`);
    }
    if (layers.length === 0) {
      warn(problemId, idx, 'Empty layers array');
    }

    // Build curve ID set for reference resolution
    const curveIds = new Set();
    layers.forEach(l => { if (l.type === 'curve' && l.id) curveIds.add(l.id); });

    layers.forEach((layer, li) => {
      if (!layer.type) {
        err(problemId, idx, `Layer[${li}]: missing "type"`);
        return;
      }
      if (!VALID_LAYER_TYPES.has(layer.type)) {
        err(problemId, idx, `Layer[${li}]: unknown type "${layer.type}"`);
        return;
      }

      // ── Per-layer unknown key check ──
      const allowed = ALLOWED_KEYS[layer.type];
      if (allowed) {
        checkUnknownKeys(layer, allowed, problemId, idx, `Layer[${li}] ${layer.type}`);
      }

      switch (layer.type) {
        case 'curve': {
          if (!layer.source?.points || !Array.isArray(layer.source.points)) {
            err(problemId, idx, `Layer[${li}] curve: missing source.points array`);
            break;
          }
          if (layer.source.points.length > MAX_POINTS) {
            err(problemId, idx, `Layer[${li}] curve: ${layer.source.points.length} points exceeds ${MAX_POINTS}`);
          }
          for (const pt of layer.source.points) {
            if (!Array.isArray(pt) || pt.length < 2) {
              err(problemId, idx, `Layer[${li}] curve: invalid point ${JSON.stringify(pt)}`);
              break;
            }
          }
          break;
        }
        case 'point': {
          if (!Array.isArray(layer.at) || layer.at.length < 2) {
            err(problemId, idx, `Layer[${li}] point: missing or invalid "at"`);
            break;
          }
          if (layer.marker && !VALID_MARKERS.has(layer.marker)) {
            err(problemId, idx, `Layer[${li}] point: invalid marker "${layer.marker}"`);
          }
          // Bounds check
          if (!inBounds(layer.at[0], vp.xMin, vp.xMax)) {
            warn(problemId, idx, `Layer[${li}] point: x=${layer.at[0]} outside viewport [${vp.xMin}, ${vp.xMax}]`);
          }
          if (!inBounds(layer.at[1], vp.yMin, vp.yMax)) {
            warn(problemId, idx, `Layer[${li}] point: y=${layer.at[1]} outside viewport [${vp.yMin}, ${vp.yMax}]`);
          }
          break;
        }
        case 'annotation': {
          if (!Array.isArray(layer.at) || layer.at.length < 2) {
            err(problemId, idx, `Layer[${li}] annotation: missing or invalid "at"`);
          }
          if (!layer.text) {
            err(problemId, idx, `Layer[${li}] annotation: missing "text"`);
          }
          if (layer.text && layer.text.length > 80) {
            err(problemId, idx, `Layer[${li}] annotation: text "${layer.text.substring(0, 40)}..." exceeds 80 chars`);
          }
          break;
        }
        case 'asymptote': {
          if (!layer.orientation || !VALID_ORIENTATIONS.has(layer.orientation)) {
            err(problemId, idx, `Layer[${li}] asymptote: invalid orientation "${layer.orientation}"`);
          }
          if (layer.orientation === 'vertical' && typeof layer.x !== 'number') {
            err(problemId, idx, `Layer[${li}] asymptote: vertical asymptote missing numeric "x"`);
          }
          if (layer.orientation === 'horizontal' && typeof layer.y !== 'number') {
            err(problemId, idx, `Layer[${li}] asymptote: horizontal asymptote missing numeric "y"`);
          }
          break;
        }
        case 'discontinuity_marker': {
          if (!layer.kind || !VALID_DISCONTINUITY_KINDS.has(layer.kind)) {
            err(problemId, idx, `Layer[${li}] discontinuity: invalid kind "${layer.kind}"`);
          }
          if (!Array.isArray(layer.at) || layer.at.length < 2) {
            err(problemId, idx, `Layer[${li}] discontinuity: missing or invalid "at"`);
          }
          break;
        }
        case 'region': {
          if (!layer.mode || !VALID_REGION_MODES.has(layer.mode)) {
            err(problemId, idx, `Layer[${li}] region: invalid mode "${layer.mode}"`);
          }
          if (layer.mode === 'between_curves') {
            if (!layer.upper) err(problemId, idx, `Layer[${li}] region: missing "upper" curve ref`);
            if (!layer.lower) err(problemId, idx, `Layer[${li}] region: missing "lower" curve ref`);
            if (layer.upper && !curveIds.has(layer.upper)) {
              err(problemId, idx, `Layer[${li}] region: upper ref "${layer.upper}" not found in curves`);
            }
            if (layer.lower && !curveIds.has(layer.lower)) {
              err(problemId, idx, `Layer[${li}] region: lower ref "${layer.lower}" not found in curves`);
            }
          }
          if (layer.mode === 'curve_to_axis') {
            if (!layer.curve) {
              err(problemId, idx, `Layer[${li}] region: curve_to_axis missing "curve" ref`);
            } else if (!curveIds.has(layer.curve)) {
              err(problemId, idx, `Layer[${li}] region: curve ref "${layer.curve}" not found`);
            }
          }
          break;
        }
        case 'riemann_rectangles': {
          if (!layer.curve) {
            err(problemId, idx, `Layer[${li}] riemann: missing "curve" ref`);
          } else if (!curveIds.has(layer.curve)) {
            err(problemId, idx, `Layer[${li}] riemann: curve "${layer.curve}" not found`);
          }
          if (typeof layer.xMin !== 'number') err(problemId, idx, `Layer[${li}] riemann: missing numeric "xMin"`);
          if (typeof layer.xMax !== 'number') err(problemId, idx, `Layer[${li}] riemann: missing numeric "xMax"`);
          if (typeof layer.n !== 'number' || layer.n <= 0) err(problemId, idx, `Layer[${li}] riemann: missing or invalid "n"`);
          break;
        }
        case 'vector_field': {
          if (!Array.isArray(layer.samples)) {
            err(problemId, idx, `Layer[${li}] vector_field: missing "samples" array`);
            break;
          }
          if (layer.samples.length > MAX_VECTORS) {
            err(problemId, idx, `Layer[${li}] vector_field: ${layer.samples.length} samples exceeds MAX_VECTORS=${MAX_VECTORS}`);
          }
          for (let si = 0; si < layer.samples.length; si++) {
            const s = layer.samples[si];
            if (!Array.isArray(s.at) || s.at.length < 2) {
              err(problemId, idx, `Layer[${li}] vector_field sample[${si}]: invalid "at"`);
              break;
            }
            if (typeof s.slope !== 'number' && s.slope !== Infinity && s.slope !== -Infinity) {
              err(problemId, idx, `Layer[${li}] vector_field sample[${si}]: invalid slope`);
              break;
            }
          }
          break;
        }
      }
    });
  });
}

// ── Summary ──
console.log('');
if (errors > 0) {
  console.error(`FAIL: ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
} else {
  console.log(`PASS: ${problemKeys.length} problems, ${seenIds.size} media entries, 0 errors, ${warnings} warning(s)`);
  process.exit(0);
}
