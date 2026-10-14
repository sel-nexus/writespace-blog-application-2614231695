/** Share the exact non-sensitive demo and failed-read messages. */
import PropTypes from 'prop-types';

export const STORAGE_WARNING = 'Local data could not be read. It has not been changed.';
export const DEMO_MESSAGE = 'Demo only: do not enter real passwords or sensitive information. '
  + 'Accounts and posts are stored in this browser and are not protected or synced.';

const messages = { demo: DEMO_MESSAGE, storage: STORAGE_WARNING };
const variants = {
  demo: 'border-border bg-surface-raised text-foreground-muted',
  storage: 'border-warning/30 bg-warning-light text-warning',
};

/**
 * Render a reusable demo notice or assertive storage warning.
 * Args:
 *   kind: demo (default) or storage.
 * Returns:
 *   An accessible notice with the approved copy.
 */
export function Notice({ kind = 'demo' }) {
  return (
    <p
      role={kind === 'storage' ? 'alert' : 'note'}
      className={`rounded-card border px-5 py-4 text-sm leading-relaxed ${variants[kind]}`}
    >
      {messages[kind]}
    </p>
  );
}

Notice.propTypes = {
  kind: PropTypes.oneOf(['demo', 'storage']),
};
