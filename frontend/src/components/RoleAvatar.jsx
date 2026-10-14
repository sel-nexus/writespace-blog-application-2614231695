/** Render role glyphs as SVG rather than platform-dependent emoji. */
import PropTypes from 'prop-types';
import { BookOpen, Crown } from '@phosphor-icons/react';

const variants = {
  user: 'bg-primary-100 text-primary-800',
  admin: 'bg-secondary-100 text-secondary-800',
};

/**
 * Display a role marker beside an author's or account's name.
 * Args:
 *   role: user (default) or admin.
 * Returns:
 *   A labeled role avatar containing a decorative SVG.
 */
export function RoleAvatar({ role = 'user' }) {
  const Icon = role === 'admin' ? Crown : BookOpen;
  return (
    <span
      role="img"
      aria-label={role === 'admin' ? 'Admin avatar' : 'User avatar'}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${variants[role]}`}
    >
      <Icon size={20} weight="duotone" aria-hidden="true" />
    </span>
  );
}

RoleAvatar.propTypes = {
  role: PropTypes.oneOf(['user', 'admin']),
};
