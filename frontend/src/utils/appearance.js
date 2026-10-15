/** Keep appearance transient and independent of browser storage or system preferences. */
/** @typedef {'light'|'dark'} Appearance */

/**
 * Return the neutral appearance for each new application lifecycle.
 * @returns {Appearance} Light mode, without consulting persistent preferences.
 */
export function getInitialAppearance() {
  return 'light';
}

/**
 * Validate an internal appearance value without coercion.
 * @param {unknown} value - Candidate mode.
 * @returns {Appearance} The supported mode, or light for invalid input.
 */
export function normalizeAppearance(value) {
  return value === 'dark' ? 'dark' : 'light';
}

/**
 * Switch supported modes and fail safely to light for invalid input.
 * @param {unknown} current - Current mode.
 * @returns {Appearance} Opposite supported mode, or light for invalid input.
 */
export function toggleAppearance(current) {
  if (current === 'light') return 'dark';
  return 'light';
}
