/**
 * Lazy media loader for problem-bank graph data.
 *
 * Phase 1C: Infrastructure for on-demand loading of media[] arrays.
 * The media payload is code-split into a separate Vite chunk so it
 * never appears in the initial JS bundle.
 *
 * Usage:
 *   const media = await loadProblemMedia('sf_001');
 *   // Returns media array or null if no media for this problem
 */

// Module-level cache: problemId → media[] | null
const _cache = new Map();

// Lazy-loaded reference — Vite splits this into a separate chunk
let _mediaPromise = null;
let _mediaMap = null;

/**
 * Load the full media map on first call, then cache.
 * Returns the raw object from problems-media.json.
 */
async function ensureMediaLoaded() {
  if (_mediaMap) return _mediaMap;
  if (!_mediaPromise) {
    _mediaPromise = import('./problems-media.json').then((mod) => {
      _mediaMap = mod.default || mod;
      return _mediaMap;
    });
  }
  return _mediaPromise;
}

/**
 * Load media for a specific problem.
 *
 * @param {string} problemId - The problem ID (e.g. "sf_001")
 * @returns {Promise<Array|null>} The media array, or null if no media exists
 */
export async function loadProblemMedia(problemId) {
  if (_cache.has(problemId)) return _cache.get(problemId);

  const map = await ensureMediaLoaded();
  // Skip metadata keys
  const media = map[problemId] ?? null;
  const result = Array.isArray(media) ? media : null;
  _cache.set(problemId, result);
  return result;
}

/**
 * Check if a problem has media WITHOUT loading the full payload.
 * Uses the core problems.json `representation` field as a fast heuristic.
 *
 * @param {object} problem - A problem object from problems.json
 * @returns {boolean} True if the problem likely has renderable media
 */
export function problemHasMedia(problem) {
  return problem?.representation === 'graph';
}

/**
 * Preload media for a set of problem IDs (e.g. on route transition).
 * Non-blocking — fires and forgets.
 *
 * @param {string[]} problemIds
 */
export function preloadMedia(problemIds) {
  if (!problemIds || problemIds.length === 0) return;
  // Just trigger the lazy load — individual lookups will be cached
  ensureMediaLoaded();
}

/**
 * Clear the media cache (useful for testing or memory pressure).
 */
export function clearMediaCache() {
  _cache.clear();
  _mediaMap = null;
  _mediaPromise = null;
}
