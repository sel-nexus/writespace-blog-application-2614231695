/** Present the current appearance and an explicit, storage-free switch action. */
import PropTypes from 'prop-types';
import { Moon, Sun } from '@phosphor-icons/react';
import { normalizeAppearance } from '../utils/appearance.js';

/**
 * Render a native keyboard-operable appearance button.
 * @param {object} props - Current mode and parent-owned toggle callback.
 * @param {'light'|'dark'} [props.appearance='light'] - Current appearance.
 * @param {Function} props.onToggle - Request an in-memory transition.
 * @returns {JSX.Element} Visible mode and accessible action with pressed state.
 */
export function AppearanceToggle({ appearance = 'light', onToggle }) {
  const dark = normalizeAppearance(appearance) === 'dark';
  const Icon = dark ? Sun : Moon;

  return (
    <button
      type="button"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      onClick={onToggle}
      className={
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border '
        + 'bg-surface px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-raised '
        + 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
      }
    >
      <Icon size={20} aria-hidden="true" />
      <span>{dark ? 'Dark mode' : 'Light mode'}</span>
    </button>
  );
}

AppearanceToggle.propTypes = {
  appearance: PropTypes.oneOf(['light', 'dark']),
  onToggle: PropTypes.func.isRequired,
};
