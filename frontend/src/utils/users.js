/** Manage registered demo accounts without changing posts or replacing the active session. */
import { getSession } from './auth.js';
import { canDeleteUser, isAdmin } from './permissions.js';
import { DEMO_ADMIN, readCollection, USERS_KEY, writeValue } from './storage.js';
import { normalizeUsername, validateAdminAccount } from './validation.js';

/** @typedef {{ok:true, value:Object|Object[]}|{ok:false, code:string, errors?:Object, readFailed?:boolean}} UserMutationResult */

/**
 * Require a fresh administrator whose four identity fields match the caller.
 * Args:
 *   session: Previously resolved identity, not authority by itself.
 * Returns:
 *   Current session result or a coded, fail-closed failure.
 */
function currentAdmin(session) {
  const current = getSession();
  if (!current.ok) return { ok: false, code: current.code, readFailed: true };
  const matching = current.value && session
    && ['userId', 'username', 'displayName', 'role'].every((field) => current.value[field] === session[field]);
  return matching && isAdmin(current.value) ? current : { ok: false, code: 'unauthorized' };
}

/**
 * Create a validated ordinary or administrator account after fresh reads.
 * Args:
 *   form: Required displayName, username, exact password and user/admin role; extra fields are ignored.
 *   session: Previously resolved administrator identity matching current storage.
 * Returns:
 *   Persisted account on success; validation, generation, read or write failure otherwise.
 * Notes:
 *   Append to the full fresh array once. Never create or replace the login session.
 * @param {Object} form
 * @param {Object|null} session
 * @returns {UserMutationResult}
 */
export function createUser(form, session) {
  let errors = validateAdminAccount(form);
  if (Object.keys(errors).length) return { ok: false, code: 'validation', errors };
  const users = readCollection(USERS_KEY);
  if (!users.ok) return { ok: false, code: users.code, readFailed: true };
  const current = currentAdmin(session);
  if (!current.ok) return current;
  errors = validateAdminAccount(form, users.value);
  if (Object.keys(errors).length) return { ok: false, code: 'validation', errors };
  let value;
  try {
    value = {
      id: crypto.randomUUID(),
      displayName: form.displayName.trim(),
      username: normalizeUsername(form.username),
      password: form.password,
      role: form.role,
      createdAt: new Date().toISOString(),
    };
  } catch {
    return { ok: false, code: 'identity-unavailable' };
  }
  const saved = writeValue(USERS_KEY, [...users.value, value]);
  return saved.ok ? { ok: true, value } : saved;
}

/**
 * Delete an exact registered account after protection checks and one confirmation.
 * Args:
 *   id: Nonblank exact target ID; synthetic administrator and current self are protected.
 *   session: Previously resolved administrator matching all current identity fields.
 * Returns:
 *   Persisted remaining array, or a coded failure; declined confirmation is cancelled.
 * Notes:
 *   Missing targets, failed reads and declined confirmation never write. Posts are never cascaded.
 * @param {string} id
 * @param {Object|null} session
 * @returns {UserMutationResult}
 */
export function deleteUser(id, session) {
  if (typeof id !== 'string' || !id.trim()) return { ok: false, code: 'invalid-id' };
  const users = readCollection(USERS_KEY);
  if (!users.ok) return { ok: false, code: users.code, readFailed: true };
  if (id === DEMO_ADMIN.userId) return { ok: false, code: 'protected-user' };
  const target = users.value.find((user) => user.id === id);
  if (!target) return { ok: false, code: 'not-found' };
  const current = currentAdmin(session);
  if (!current.ok) return current;
  if (!canDeleteUser(current.value, target)) return { ok: false, code: 'protected-user' };
  try {
    if (!window.confirm('Delete this account? This cannot be undone.')) return { ok: false, code: 'cancelled' };
  } catch {
    return { ok: false, code: 'confirmation-unavailable' };
  }
  const value = users.value.filter((user) => user.id !== id);
  const saved = writeValue(USERS_KEY, value);
  return saved.ok ? { ok: true, value } : saved;
}
