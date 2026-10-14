/** Read browser-local posts and delete only after fresh identity and explicit confirmation. */
import { getSession } from './auth.js';
import { canManagePost } from './permissions.js';
import { DEMO_ADMIN, POSTS_KEY, readCollection, writeValue } from './storage.js';
import { sortPosts } from './postPresentation.js';

/**
 * Read the complete post collection as a newest-first copy.
 * Returns:
 *   CollectionResult preserving source/code; failures always have value: [].
 */
export function readPosts() {
  const result = readCollection(POSTS_KEY);
  return result.ok ? { ...result, value: sortPosts(result.value) } : result;
}

/**
 * Look up an exact string ID without coercion or storage repair.
 * Args:
 *   id: Untrusted route ID.
 * Returns:
 *   Success with post/null and source, or failed read with value: null and code.
 */
export function readPost(id) {
  const result = readPosts();
  if (!result.ok) return { ...result, value: null };
  const value = typeof id === 'string' ? result.value.find((post) => post.id === id) ?? null : null;
  return { ...result, value };
}

/**
 * Derive an author marker without requiring a surviving registered account.
 * Args:
 *   post: Validated post.
 *   users: Successfully validated registered accounts, or an empty array.
 * Returns:
 *   Synthetic/registered admin role, otherwise user (including deleted authors).
 */
export function getAuthorRole(post, users = []) {
  if (post.authorId === DEMO_ADMIN.userId) return 'admin';
  return users.find((user) => user.id === post.authorId)?.role === 'admin' ? 'admin' : 'user';
}

/**
 * Delete an existing post only for the matching, freshly resolved active identity.
 * Args:
 *   id: Exact string ID of the post to delete.
 *   session: Previously resolved session; all four identity fields must match current storage.
 * Returns:
 *   Success with sorted remaining value; failure with code and optional readFailed: true.
 *   A declined confirmation returns {ok: false, code: 'cancelled'} without writing.
 * Notes:
 *   Confirmation happens once inside this service, only after validation and permission checks.
 *   Read failures never mutate posts; write failures never report a durable success.
 */
export function deletePost(id, session) {
  if (typeof id !== 'string' || !id.trim()) return { ok: false, code: 'invalid-id' };
  const posts = readPosts();
  if (!posts.ok) return { ok: false, code: posts.code, readFailed: true };
  const post = posts.value.find((record) => record.id === id);
  if (!post) return { ok: false, code: 'not-found' };
  const current = getSession();
  if (!current.ok) return { ok: false, code: current.code, readFailed: true };
  const matching = current.value && session
    && ['userId', 'username', 'displayName', 'role'].every((field) => current.value[field] === session[field]);
  if (!matching || !canManagePost(current.value, post)) return { ok: false, code: 'unauthorized' };
  if (!window.confirm('Delete this post? This cannot be undone.')) return { ok: false, code: 'cancelled' };
  const value = posts.value.filter((record) => record.id !== id);
  const saved = writeValue(POSTS_KEY, value);
  return saved.ok ? { ok: true, value } : saved;
}
