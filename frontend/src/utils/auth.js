/** Persist demo identity only after validation and explicit user activation. */
import { clearSession, DEMO_ADMIN, readCollection, readSession, SESSION_KEY, USERS_KEY, writeValue } from './storage.js';
import { normalizeUsername, validateRegistration } from './validation.js';
import { homeRoute } from './permissions.js';
import { STORAGE_WARNING } from '../components/Notice.jsx';

export const INVALID_CREDENTIALS = 'Invalid username or password.';
export const SIGN_IN_UNSAVED = 'Sign-in could not be saved. Please try again.';
export const ACCOUNT_SIGN_IN_INCOMPLETE = 'Your account was created but sign-in did not complete. Please sign in to continue.';

/**
 * Project a registered account into the exact session fields.
 * Args:
 *   user: Validated registered account.
 * Returns:
 *   Session object without password or account timestamp.
 */
export function sessionForUser(user) {
  return { userId: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

/**
 * Resolve current identity through the shared fail-closed storage boundary.
 * Returns:
 *   Shared SessionResult; failed or null values mean anonymous.
 */
export function getSession() {
  return readSession();
}

/**
 * Persist an exact session before reporting a role-home navigation target.
 * Args:
 *   session: Valid synthetic or registered session.
 * Returns:
 *   Success with session/redirect, or a coded unsaved failure.
 */
function signIn(session) {
  const result = writeValue(SESSION_KEY, session);
  return result.ok
    ? { ok: true, session, redirect: homeRoute(session) }
    : { ...result, message: SIGN_IN_UNSAVED };
}

/**
 * Sign in with normalized username and exact, untrimmed password.
 * Args:
 *   username: Required nonblank string username.
 *   password: Required meaningful string password, preserving spaces.
 * Returns:
 *   Auth result with session/redirect on success or errors/message/code on failure.
 * Notes:
 *   Fixed admin credentials are checked before any registered collection read.
 */
export function login(username, password) {
  const errors = {};
  if (typeof username !== 'string' || !username.trim()) errors.username = 'Username is required.';
  if (typeof password !== 'string' || !password.trim()) errors.password = 'Password is required.';
  if (Object.keys(errors).length) return { ok: false, code: 'validation', errors };
  const normalized = normalizeUsername(username);
  if (normalized === 'admin' && password === 'admin') return signIn({ ...DEMO_ADMIN });
  const users = readCollection(USERS_KEY);
  if (!users.ok) return { ok: false, code: users.code, message: STORAGE_WARNING };
  const user = users.value.find((account) => normalizeUsername(account.username) === normalized && account.password === password);
  return user ? signIn(sessionForUser(user)) : { ok: false, code: 'invalid-credentials', message: INVALID_CREDENTIALS };
}

/**
 * Register a forced ordinary account, then persist its session without rollback.
 * Args:
 *   input: Required displayName, username, password and confirmation; extra identity fields are ignored.
 * Returns:
 *   Auth success, field validation failure, coded storage failure, or accountCreated partial failure.
 * Notes:
 *   A session failure leaves the successfully written account available for later login.
 */
export function register(input) {
  let errors = validateRegistration(input);
  if (Object.keys(errors).length) return { ok: false, code: 'validation', errors };
  const users = readCollection(USERS_KEY);
  if (!users.ok) return { ok: false, code: users.code, message: STORAGE_WARNING };
  errors = validateRegistration(input, users.value);
  if (Object.keys(errors).length) return { ok: false, code: 'validation', errors };
  let account;
  try {
    account = {
      id: crypto.randomUUID(),
      displayName: input.displayName.trim(),
      username: normalizeUsername(input.username),
      password: input.password,
      role: 'user',
      createdAt: new Date().toISOString(),
    };
  } catch {
    return { ok: false, code: 'identity-unavailable', message: 'Account could not be created. Nothing was saved.' };
  }
  const saved = writeValue(USERS_KEY, [...users.value, account]);
  if (!saved.ok) return { ...saved, message: 'Account could not be saved. Please try again.' };
  const signedIn = signIn(sessionForUser(account));
  if (!signedIn.ok) return { ...signedIn, accountCreated: true, message: ACCOUNT_SIGN_IN_INCOMPLETE };
  return signedIn;
}

/**
 * Remove the local session before the caller updates identity or navigates.
 * Returns:
 *   Shared WriteResult; failed removal preserves the current view.
 */
export function logout() {
  return clearSession();
}
