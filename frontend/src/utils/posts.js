/** Read browser-local posts and delete only after fresh identity and explicit confirmation. */
import { getSession } from './auth.js';
import { canManagePost } from './permissions.js';
import { DEMO_ADMIN, POSTS_KEY, readCollection, writeValue } from './storage.js';
import { sortPosts } from './postPresentation.js';
import { USERS_KEY } from './storage.js';
import { validatePost } from './validation.js';

/** @typedef {{id: string, title: string, content: string, createdAt: string, authorId: string, authorName: string}} Post */
/** @typedef {{ok: true, value: Post}|{ok: false, code: string, errors?: Object, readFailed?: boolean}} PostMutationResult */

/**
 * Resolve fresh readable accounts and require all supplied identity fields to match.
 * Args:
 *   session: Previously resolved identity, never authority by itself.
 * Returns:
 *   Fresh session or a fail-closed mutation failure, without changing posts.
 */
function authoringSession(session) {
  const users = readCollection(USERS_KEY);
  if (!users.ok) return { ok: false, code: users.code, readFailed: true };
  const current = getSession();
  if (!current.ok) return { ok: false, code: current.code, readFailed: true };
  const matching = current.value && session
    && ['userId', 'username', 'displayName', 'role'].every((field) => current.value[field] === session[field]);
  return matching ? current : { ok: false, code: 'unauthorized' };
}

/**
 * Create an attributed plain-text post only after validation and fresh identity resolution.
 * Args:
 *   form: Required title/content strings; extra identity, date, and author fields are ignored.
 *   session: Previously resolved identity whose four fields must match current storage.
 * Returns:
 *   PostMutationResult; success contains only the persisted post, never an unsaved candidate.
 * Notes:
 *   Trim outer whitespace, preserve inner line breaks, and write the complete fresh array once.
 * @param {Object} form
 * @param {Object|null} session
 * @returns {PostMutationResult}
 */
export function createPost(form, session) {
  const errors = validatePost(form);
  if (Object.keys(errors).length) return { ok: false, code: 'validation', errors };
  const posts = readCollection(POSTS_KEY);
  if (!posts.ok) return { ok: false, code: posts.code, readFailed: true };
  const current = authoringSession(session);
  if (!current.ok) return current;
  let value;
  try {
    value = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      content: form.content.trim(),
      createdAt: new Date().toISOString(),
      authorId: current.value.userId,
      authorName: current.value.displayName,
    };
  } catch {
    return { ok: false, code: 'identity-unavailable' };
  }
  const saved = writeValue(POSTS_KEY, [value, ...posts.value]);
  return saved.ok ? { ok: true, value } : saved;
}

/**
 * Replace only editable text on an exact existing post for its current owner or administrator.
 * Args:
 *   id: Exact untrusted post ID; missing or nonstring values cannot match.
 *   form: Required title/content; all other caller fields are ignored.
 *   session: Previously resolved identity whose four fields must match current storage.
 * Returns:
 *   PostMutationResult; missing IDs, unauthorized identities, failed reads/writes never save.
 * Notes:
 *   Preserve ID, creation time, authorship, and every other existing field in the full array.
 * @param {string} id
 * @param {Object} form
 * @param {Object|null} session
 * @returns {PostMutationResult}
 */
export function editPost(id, form, session) {
  const errors = validatePost(form);
  if (Object.keys(errors).length) return { ok: false, code: 'validation', errors };
  const posts = readCollection(POSTS_KEY);
  if (!posts.ok) return { ok: false, code: posts.code, readFailed: true };
  const post = typeof id === 'string' ? posts.value.find((record) => record.id === id) : null;
  if (!post) return { ok: false, code: 'not-found' };
  const current = authoringSession(session);
  if (!current.ok) return current;
  if (!canManagePost(current.value, post)) return { ok: false, code: 'unauthorized' };
  const value = { ...post, title: form.title.trim(), content: form.content.trim() };
  const next = posts.value.map((record) => record.id === id ? value : record);
  const saved = writeValue(POSTS_KEY, next);
  return saved.ok ? { ok: true, value } : saved;
}

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
