/** Guard local demo routes using a freshly resolved identity. */
import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import { getSession } from '../utils/auth.js';
import { isAdmin } from '../utils/permissions.js';

/**
 * Render protected content or fixed anonymous/role redirects.
 * Args:
 *   children: Content to render only after session resolution.
 *   adminOnly: Whether the route requires administrator role.
 * Returns:
 *   Children, login redirect, or ordinary role-home redirect.
 */
export function ProtectedRoute({ children, adminOnly = false }) {
  const result = getSession();
  if (!result.ok || !result.value) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin(result.value)) return <Navigate to="/blogs" replace />;
  return children;
}

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
  adminOnly: PropTypes.bool,
};
