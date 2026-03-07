/**
 * colorTokens — shared color resolution for media layers.
 *
 * Accepts:
 *   - Hex colors: #rrggbb or #rrggbbaa
 *   - Named palette tokens: "blue", "red", "green", "orange", "purple", "gray"
 *
 * Returns a valid CSS color string. Falls back to the provided default.
 */

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const NAMED_TOKENS = {
  blue:   '#60a5fa',
  red:    '#f87171',
  green:  '#4ade80',
  orange: '#fb923c',
  purple: '#c084fc',
  gray:   '#9ca3af',
};

/**
 * Resolve a color value from media schema to a CSS color.
 * @param {string|undefined} color — raw color from schema
 * @param {string} fallback — default color if invalid/missing
 * @returns {string} resolved CSS color
 */
export function resolveColor(color, fallback = '#60a5fa') {
  if (!color) return fallback;
  if (HEX_RE.test(color)) return color;
  const named = NAMED_TOKENS[color.toLowerCase()];
  if (named) return named;
  return fallback;
}
