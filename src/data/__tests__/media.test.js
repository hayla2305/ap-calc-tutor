/**
 * Media data structural tests.
 *
 * These run in Node (no DOM) and validate:
 *  1. problems-media.json structural invariants
 *  2. Every media key maps to a real problem in problems.json
 *  3. Every problem with representation:"graph" has a media entry
 *  4. Snapshot of the problem key → media ID mapping (catches accidental edits)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mediaData = JSON.parse(readFileSync(resolve(__dirname, '../problems-media.json'), 'utf-8'));
const problemsData = JSON.parse(readFileSync(resolve(__dirname, '../problems.json'), 'utf-8'));

const mediaKeys = Object.keys(mediaData).filter(k => !k.startsWith('_'));
const problemIds = new Set(problemsData.map(p => p.id));
const graphProblems = problemsData.filter(p => p.representation === 'graph');

describe('problems-media.json structural invariants', () => {
  it('has at least 16 problem keys', () => {
    expect(mediaKeys.length).toBeGreaterThanOrEqual(16);
  });

  it('every entry is a non-empty array', () => {
    for (const key of mediaKeys) {
      expect(Array.isArray(mediaData[key]), `${key} should be an array`).toBe(true);
      expect(mediaData[key].length, `${key} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('every media item has required fields (id, kind, version, alt)', () => {
    for (const key of mediaKeys) {
      for (const item of mediaData[key]) {
        expect(item.id, `${key}: missing id`).toBeTruthy();
        expect(item.kind, `${key}: missing kind`).toBeTruthy();
        expect(item.version, `${key}: missing version`).toBe('1.0');
        expect(item.alt, `${key}: missing alt`).toBeTruthy();
      }
    }
  });

  it('no duplicate media IDs across all entries', () => {
    const allIds = [];
    for (const key of mediaKeys) {
      for (const item of mediaData[key]) {
        allIds.push(item.id);
      }
    }
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });

  it('every graph has valid viewport', () => {
    for (const key of mediaKeys) {
      for (const item of mediaData[key]) {
        if (item.kind !== 'graph') continue;
        const vp = item.graph?.viewport;
        expect(vp, `${key}: missing viewport`).toBeTruthy();
        expect(vp.xMin).toBeLessThan(vp.xMax);
        expect(vp.yMin).toBeLessThan(vp.yMax);
      }
    }
  });

  it('every graph has <= 12 layers', () => {
    for (const key of mediaKeys) {
      for (const item of mediaData[key]) {
        if (item.kind !== 'graph') continue;
        expect(item.graph.layers.length, `${key}: too many layers`).toBeLessThanOrEqual(12);
      }
    }
  });

  it('all layer types are from the valid set', () => {
    const valid = new Set([
      'curve', 'point', 'annotation', 'asymptote',
      'discontinuity_marker', 'region', 'riemann_rectangles', 'vector_field',
    ]);
    for (const key of mediaKeys) {
      for (const item of mediaData[key]) {
        if (item.kind !== 'graph') continue;
        for (const layer of item.graph.layers) {
          expect(valid.has(layer.type), `${key}: unknown layer type "${layer.type}"`).toBe(true);
        }
      }
    }
  });
});

describe('media ↔ problems cross-reference', () => {
  it('every media key maps to a real problem in problems.json', () => {
    for (const key of mediaKeys) {
      expect(problemIds.has(key), `media key "${key}" has no matching problem`).toBe(true);
    }
  });

  it('every problem with representation:"graph" has a media entry', () => {
    const missing = graphProblems.filter(p => !mediaData[p.id]);
    expect(missing.map(p => p.id), 'graph problems missing media').toEqual([]);
  });
});

describe('key → ID mapping snapshot', () => {
  it('matches the expected mapping', () => {
    const mapping = {};
    for (const key of mediaKeys.sort()) {
      mapping[key] = mediaData[key].map(m => m.id);
    }
    expect(mapping).toMatchSnapshot();
  });
});
