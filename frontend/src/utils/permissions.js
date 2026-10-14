/** Centralize pure demo permission predicates without storage access. */
import { DEMO_ADMIN } from './storage.js';

/**
 * Check a usable role-bearing local identity.
 * Args:
 *   session: Already resolved session or untrusted absent value.
 * Returns:
 *   Whether identity and supported role are present.
 */
function hasIdentity(session) {
  return typeof session?.userId === 'string' && session.userId.trim().length > 0
    && (session.role === 'user' || session.role === 'admin');
}

/**
 * Check administrator role, failing closed on unknown or absent roles.
 * Args:
 *   session: Resolved local identity.
 * Returns:
 *   Whether the identity is an administrator.
 */
export function isAdmin(session) {
  return hasIdentity(session) && session.role === 'admin';
}

/**
 * Permit administrators or the exact author to manage an existing post.
 * Args:
 *   session: Resolved local identity.
 *   post: Existing post with an authorId.
 * Returns:
 *   Whether UI management actions are allowed.
 */
export function canManagePost(session, post) {
  return hasIdentity(session) && typeof post?.authorId === 'string' && post.authorId.trim().length > 0
    && (isAdmin(session) || post.authorId === session.userId);
}

/**
 * Permit admin deletion except for the synthetic administrator or self.
 * Args:
 *   session: Resolved local identity.
 *   target: Existing account with an id.
 * Returns:
 *   Whether UI deletion is allowed; existence lookup remains the service's responsibility.
 */
export function canDeleteUser(session, target) {
  return isAdmin(session) && typeof target?.id === 'string' && target.id.trim().length > 0
    && target.id !== DEMO_ADMIN.userId && target.id !== session.userId;
}

/**
 * Select a fixed role home without preserving a requested route.
 * Args:
 *   session: Resolved local identity.
 * Returns:
 *   Admin home, ordinary home, or login for absent/unsupported identity.
 */
export function homeRoute(session) {
  if (!hasIdentity(session)) return '/login';
  return isAdmin(session) ? '/admin' : '/blogs';
}
