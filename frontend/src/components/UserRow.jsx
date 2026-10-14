/** Present registered and synthetic account details without persistence or implicit actions. */
import PropTypes from 'prop-types';
import { RoleAvatar } from './RoleAvatar.jsx';
import { canDeleteUser } from '../utils/permissions.js';
import { formatDate } from '../utils/postPresentation.js';
import { DEMO_ADMIN } from '../utils/storage.js';

const badgeStyles = {
  user: 'bg-primary-100 text-primary-800',
  admin: 'bg-secondary-100 text-secondary-800',
};

/**
 * Render one reusable desktop row or mobile account card.
 * Args:
 *   user: Valid registered record or synthetic display record without a creation date.
 *   session: Resolved identity, or null when mutations are disabled.
 *   onDelete: Explicit activation callback receiving the exact ID.
 *   mobile: Render a card instead of a table row.
 * Returns:
 *   Accessible details, role status and protected Delete control; no password is displayed.
 */
export function UserRow({ user, session = null, onDelete, mobile = false }) {
  const fixed = user.id === DEMO_ADMIN.userId;
  const self = user.id === session?.userId;
  const allowed = canDeleteUser(session, user) && Boolean(onDelete);
  const tooltip = fixed ? 'Default admin cannot be deleted.'
    : self ? 'You cannot delete your current account.'
      : !allowed ? 'Account deletion is unavailable.' : undefined;
  const avatar = <RoleAvatar role={user.role} />;
  const badge = (
    <span role="status" className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeStyles[user.role]}`}>
      {user.role === 'admin' ? 'Admin' : 'User'}
    </span>
  );
  const date = fixed ? 'Built-in' : formatDate(user.createdAt);
  const action = (
    <button
      type="button"
      aria-label={`Delete ${user.username}`}
      title={tooltip}
      disabled={!allowed}
      onClick={() => onDelete(user.id)}
      className="rounded-full px-4 py-2 text-sm font-bold text-error hover:bg-error-light disabled:opacity-50 focus-visible:outline-ring"
    >
      Delete
    </button>
  );

  if (mobile) {
    return (
      <article aria-label={`Account ${user.username}`} className="min-w-0 rounded-card border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          {avatar}
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-bold">
              {user.displayName}
            </h3>
            <p className="break-words text-sm text-foreground-muted">
              @{user.username}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {badge}
          <p className="text-sm text-foreground-muted">
            {fixed ? date : `Created ${date}`}
          </p>
          {action}
        </div>
      </article>
    );
  }
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          {avatar}
          <span className="min-w-0 break-words font-semibold">
            {user.displayName}
          </span>
        </div>
      </td>
      <td className="break-words px-4 py-4 text-foreground-muted">
        @{user.username}
      </td>
      <td className="px-4 py-4">
        {badge}
      </td>
      <td className="px-4 py-4 text-sm tabular-nums text-foreground-muted">
        {date}
      </td>
      <td className="px-4 py-4 text-right">
        {action}
      </td>
    </tr>
  );
}

UserRow.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired,
    username: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['user', 'admin']).isRequired,
    createdAt: PropTypes.string,
  }).isRequired,
  session: PropTypes.shape({
    userId: PropTypes.string.isRequired,
    username: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['user', 'admin']).isRequired,
  }),
  onDelete: PropTypes.func,
  mobile: PropTypes.bool,
};
