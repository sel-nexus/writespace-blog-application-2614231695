/** Guard browser-local records without repairing or logging private data. */
export const POSTS_KEY = 'writespace_posts';
export const USERS_KEY = 'writespace_users';
export const SESSION_KEY = 'writespace_session';
export const DEMO_ADMIN = Object.freeze({
  userId: 'writespace-demo-admin',
  username: 'admin',
  displayName: 'Admin',
  role: 'admin',
});

/** @typedef {{ok: true, value: Array, source: 'stored'|'missing'}|{ok: false, value: Array, code: string}} CollectionResult */
/** @typedef {{ok: true, value: Object|null}|{ok: false, value: null, code: string}} SessionResult */
/** @typedef {{ok: true}|{ok: false, code: string}} WriteResult */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Check a non-array record boundary. */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Reject blank text without coercing user-controlled values. */
function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Check a UUID identity, excluding the synthetic administrator. */
function isUuid(value) {
  return typeof value === 'string' && uuidPattern.test(value);
}

/** Validate a real ISO timestamp, including calendar and timezone bounds. */
function isTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second, zone] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  const validDate = Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= days;
  const validTime = Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60;
  const validZone = zone === 'Z' || (Number(zone.slice(1, 3)) < 24 && Number(zone.slice(4)) < 60);
  return validDate && validTime && validZone;
}

/** Validate every required post field without requiring a live author row. */
function isPost(post) {
  return isRecord(post)
    && isUuid(post.id)
    && isText(post.title)
    && isText(post.content)
    && isTimestamp(post.createdAt)
    && (isUuid(post.authorId) || post.authorId === DEMO_ADMIN.userId)
    && isText(post.authorName);
}

/** Validate registered accounts and reserve the fixed administrator name. */
function isUser(user) {
  return isRecord(user)
    && isUuid(user.id)
    && isText(user.displayName)
    && isText(user.username)
    && user.username === user.username.trim()
    && user.username.toLowerCase() !== 'admin'
    && isText(user.password)
    && (user.role === 'user' || user.role === 'admin')
    && isTimestamp(user.createdAt);
}

/** Check the session schema; registered identity lookup happens on reads. */
function isSession(session) {
  if (!isRecord(session)) return false;
  if (session.userId === DEMO_ADMIN.userId) {
    return Object.keys(session).length === Object.keys(DEMO_ADMIN).length
      && Object.keys(DEMO_ADMIN).every((key) => session[key] === DEMO_ADMIN[key]);
  }
  return isUuid(session.userId)
    && isText(session.username)
    && session.username === session.username.trim()
    && session.username.toLowerCase() !== 'admin'
    && isText(session.displayName)
    && (session.role === 'user' || session.role === 'admin');
}

/** Return a collection schema error, including duplicates, or null. */
function collectionError(key, value) {
  if ((key !== POSTS_KEY && key !== USERS_KEY) || !Array.isArray(value)) return 'invalid-shape';
  const validator = key === POSTS_KEY ? isPost : isUser;
  const ids = new Set();
  const names = new Set();
  for (const record of value) {
    if (!validator(record) || ids.has(record.id.toLowerCase())) return 'invalid-record';
    ids.add(record.id.toLowerCase());
    if (key === USERS_KEY) {
      const name = record.username.toLowerCase();
      if (names.has(name)) return 'invalid-record';
      names.add(name);
    }
  }
  return null;
}

/**
 * Read a complete validated collection without any mutation.
 * Args:
 *   key: POSTS_KEY or USERS_KEY.
 * Returns:
 *   CollectionResult with safe empty value on failure; raw storage is preserved.
 */
export function readCollection(key) {
  if (key !== POSTS_KEY && key !== USERS_KEY) return { ok: false, value: [], code: 'invalid-shape' };
  let raw;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return { ok: false, value: [], code: 'storage-unavailable' };
  }
  if (raw === null) return { ok: true, value: [], source: 'missing' };
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, value: [], code: 'invalid-json' };
  }
  const code = collectionError(key, value);
  return code ? { ok: false, value: [], code } : { ok: true, value, source: 'stored' };
}

/**
 * Remove only the session on explicit logout or best-effort invalidation.
 * Returns:
 *   WriteResult; failed removal never claims success.
 */
export function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
    return { ok: true };
  } catch {
    return { ok: false, code: 'storage-unavailable' };
  }
}

/** Fail closed and attempt removal without masking the original session error. */
function invalidSession(code) {
  clearSession();
  return { ok: false, value: null, code };
}

/**
 * Resolve a session against the registered identity or exact fixed administrator.
 * Returns:
 *   SessionResult suitable for route guards; failed/null means anonymous.
 * Notes:
 *   Unreadable users fail closed but are not proof of staleness, so session is preserved.
 */
export function readSession() {
  let raw;
  try {
    raw = window.localStorage.getItem(SESSION_KEY);
  } catch {
    return { ok: false, value: null, code: 'storage-unavailable' };
  }
  if (raw === null) return { ok: true, value: null };
  let session;
  try {
    session = JSON.parse(raw);
  } catch {
    return invalidSession('invalid-json');
  }
  if (!isSession(session)) return invalidSession('invalid-shape');
  if (session.userId === DEMO_ADMIN.userId) return { ok: true, value: session };
  const users = readCollection(USERS_KEY);
  if (!users.ok) {
    const code = users.code === 'storage-unavailable' ? 'storage-unavailable' : 'invalid-shape';
    return { ok: false, value: null, code };
  }
  const identity = users.value.find((user) => user.id === session.userId);
  if (!identity || ['username', 'displayName', 'role'].some((field) => identity[field] !== session[field])) {
    return invalidSession('invalid-shape');
  }
  return { ok: true, value: session };
}

/** Check a write's shape without accessing storage. */
function validValue(key, value) {
  if (key === SESSION_KEY) return isSession(value);
  return collectionError(key, value) === null;
}

/**
 * Validate, serialize, revalidate, and persist exactly once.
 * Args:
 *   key: One of the three exported storage keys.
 *   value: Full collection or session matching that key's schema.
 * Returns:
 *   WriteResult with invalid-shape, serialization-failed, quota-exceeded, or storage-unavailable.
 * Notes:
 *   Invalid payloads and serialization failures never access storage. Revalidation catches toJSON shape changes.
 *   Writes do not perform identity authorization; future mutation services own fresh reads and permission checks.
 */
export function writeValue(key, value) {
  let serialized;
  try {
    if (!validValue(key, value)) return { ok: false, code: 'invalid-shape' };
    serialized = JSON.stringify(value);
    if (typeof serialized !== 'string' || !validValue(key, JSON.parse(serialized))) {
      return { ok: false, code: 'invalid-shape' };
    }
  } catch {
    return { ok: false, code: 'serialization-failed' };
  }
  try {
    window.localStorage.setItem(key, serialized);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error?.name === 'QuotaExceededError' ? 'quota-exceeded' : 'storage-unavailable',
    };
  }
}
