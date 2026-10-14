/** Exercise the whole local schema and non-destructive failure contract. */
import { describe, expect, it, vi } from 'vitest';
import {
  POSTS_KEY,
  USERS_KEY,
  SESSION_KEY,
  DEMO_ADMIN,
  readCollection,
  readSession,
  writeValue,
  clearSession,
} from '../src/utils/storage.js';
import { post, user, session, secondUser, makePost } from './fixtures.js';

/** Seed deliberately raw values to test the read boundary independently of writes. */
function seed(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Verify corruption is reported without touching any stored bytes. */
function expectCorrupt(key, value, code = 'invalid-record') {
  seed(key, value);
  const raw = localStorage.getItem(key);
  const write = vi.spyOn(Storage.prototype, 'setItem');
  const remove = vi.spyOn(Storage.prototype, 'removeItem');
  expect(readCollection(key)).toEqual({ ok: false, value: [], code });
  expect(localStorage.getItem(key)).toBe(raw);
  expect(write).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
}

describe('collection reads', () => {
  it('exports exactly the approved key values and fixed administrator', () => {
    expect([POSTS_KEY, USERS_KEY, SESSION_KEY]).toEqual([
      'writespace_posts', 'writespace_users', 'writespace_session',
    ]);
    expect(DEMO_ADMIN).toEqual({
      userId: 'writespace-demo-admin', username: 'admin', displayName: 'Admin', role: 'admin',
    });
  });

  it.each([POSTS_KEY, USERS_KEY])('returns missing as empty without initializing %s', (key) => {
    expect(readCollection(key)).toEqual({ ok: true, value: [], source: 'missing' });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it.each([[POSTS_KEY, [post]], [USERS_KEY, [user, secondUser]], [POSTS_KEY, []], [USERS_KEY, []]])(
    'reads valid stored records for %s', (key, value) => {
      seed(key, value);
      expect(readCollection(key)).toEqual({ ok: true, value, source: 'stored' });
    },
  );

  it('accepts a registered admin and a post owned by the synthetic admin', () => {
    seed(USERS_KEY, [{ ...user, role: 'admin' }]);
    seed(POSTS_KEY, [{ ...post, authorId: DEMO_ADMIN.userId, authorName: 'Admin' }]);
    expect(readCollection(USERS_KEY).ok).toBe(true);
    expect(readCollection(POSTS_KEY).ok).toBe(true);
  });

  it('rejects unsupported keys before reading storage', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    expect(readCollection(SESSION_KEY)).toEqual({ ok: false, value: [], code: 'invalid-shape' });
    expect(readCollection('unrelated')).toEqual({ ok: false, value: [], code: 'invalid-shape' });
    expect(get).not.toHaveBeenCalled();
  });

  it('preserves invalid JSON rather than repairing it', () => {
    localStorage.setItem(POSTS_KEY, '{broken');
    expect(readCollection(POSTS_KEY)).toEqual({ ok: false, value: [], code: 'invalid-json' });
    expect(localStorage.getItem(POSTS_KEY)).toBe('{broken');
  });

  it.each([null, {}, 'text', 2, true])('rejects non-array collections: %j', (value) => {
    expectCorrupt(POSTS_KEY, value, 'invalid-shape');
  });

  it.each([null, [], false, 'text', 3])('rejects non-record collection entries: %j', (record) => {
    expectCorrupt(POSTS_KEY, [post, record]);
  });

  it.each(['id', 'title', 'content', 'createdAt', 'authorId', 'authorName'])(
    'rejects missing required post field %s', (field) => {
      const invalid = { ...post };
      delete invalid[field];
      expectCorrupt(POSTS_KEY, [invalid]);
    },
  );

  it.each(['id', 'title', 'content', 'createdAt', 'authorId', 'authorName'])(
    'rejects non-string post field %s', (field) => expectCorrupt(POSTS_KEY, [{ ...post, [field]: 42 }]),
  );

  it.each(['title', 'content', 'authorName'])(
    'rejects blank post text %s', (field) => expectCorrupt(POSTS_KEY, [{ ...post, [field]: ' \n ' }]),
  );

  it.each(['not-a-uuid', '8b1a849e-32e6-0d5a-87f1-3f99c5f0f135', '8b1a849e-32e6-4d5a-07f1-3f99c5f0f135'])(
    'rejects invalid post UUID %s', (id) => expectCorrupt(POSTS_KEY, [{ ...post, id }]),
  );

  it('rejects invalid author identity but permits orphaned valid author UUIDs', () => {
    expectCorrupt(POSTS_KEY, [{ ...post, authorId: 'unknown' }]);
    seed(POSTS_KEY, [post]);
    expect(readCollection(POSTS_KEY).ok).toBe(true);
    expect(localStorage.getItem(USERS_KEY)).toBeNull();
  });

  it.each([
    'invalid', '2026-10-14', '2026-02-30T12:00:00.000Z', '2026-13-14T12:00:00Z',
    '2026-10-00T12:00:00Z', '2026-10-14T24:00:00Z', '2026-10-14T12:60:00Z',
    '2026-10-14T12:00:60Z', '2026-10-14T12:00:00+24:00', '2026-10-14T12:00:00+01:60',
  ])('rejects impossible/non-ISO timestamps %s', (createdAt) => {
    expectCorrupt(POSTS_KEY, [{ ...post, createdAt }]);
  });

  it.each(['2024-02-29T23:59:59Z', '2026-10-14T12:30:00+02:00'])(
    'accepts valid leap day and offset ISO timestamps %s', (createdAt) => {
      seed(POSTS_KEY, [{ ...post, createdAt }]);
      expect(readCollection(POSTS_KEY).ok).toBe(true);
    },
  );

  it('rejects duplicate post IDs, including UUID letter casing', () => {
    expectCorrupt(POSTS_KEY, [post, { ...post, id: post.id.toUpperCase() }]);
  });

  it.each(['id', 'displayName', 'username', 'password', 'role', 'createdAt'])(
    'rejects missing required account field %s', (field) => {
      const invalid = { ...user };
      delete invalid[field];
      expectCorrupt(USERS_KEY, [invalid]);
    },
  );

  it.each(['id', 'displayName', 'username', 'password', 'role', 'createdAt'])(
    'rejects wrong account field type %s', (field) => expectCorrupt(USERS_KEY, [{ ...user, [field]: {} }]),
  );

  it.each([
    ['id', 'writespace-demo-admin'], ['id', 'unknown'], ['displayName', ' '],
    ['username', ''], ['username', ' jamie'], ['username', 'jamie '], ['username', 'ADMIN'],
    ['password', ''], ['password', ' \n'], ['role', 'owner'], ['createdAt', 'not-a-time'],
  ])('rejects invalid account %s=%s', (field, value) => {
    expectCorrupt(USERS_KEY, [{ ...user, [field]: value }]);
  });

  it('rejects duplicate usernames case-insensitively', () => {
    expectCorrupt(USERS_KEY, [user, { ...secondUser, username: 'JAMIE' }]);
  });

  it('rejects duplicate user IDs', () => {
    expectCorrupt(USERS_KEY, [user, { ...secondUser, id: user.id }]);
  });

  it('preserves exact password whitespace and accepts mixed-case trimmed usernames', () => {
    const account = { ...user, username: 'Jamie', password: ' demo-only ' };
    seed(USERS_KEY, [account]);
    expect(readCollection(USERS_KEY).value).toEqual([account]);
  });

  it('reads large valid collections without truncation', () => {
    const posts = Array.from({ length: 1000 }, (_, index) => ({
      ...makePost(1), id: `8b1a849e-32e6-4d5a-87f1-${String(index).padStart(12, '0')}`,
    }));
    seed(POSTS_KEY, posts);
    expect(readCollection(POSTS_KEY).value).toHaveLength(1000);
  });

  it('distinguishes thrown storage reads from malformed JSON', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new SyntaxError('access failed'); });
    expect(readCollection(POSTS_KEY)).toEqual({ ok: false, value: [], code: 'storage-unavailable' });
  });

  it('catches an unavailable localStorage property', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('', 'SecurityError'); });
    expect(readCollection(USERS_KEY).code).toBe('storage-unavailable');
    expect(readSession().code).toBe('storage-unavailable');
    expect(clearSession().code).toBe('storage-unavailable');
    expect(writeValue(POSTS_KEY, [post]).code).toBe('storage-unavailable');
  });
});

describe('session reads and clearing', () => {
  it('treats absent sessions as anonymous without writing', () => {
    expect(readSession()).toEqual({ ok: true, value: null });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('accepts the exact fixed admin without reading users', () => {
    seed(SESSION_KEY, DEMO_ADMIN);
    localStorage.setItem(USERS_KEY, '{broken');
    expect(readSession()).toEqual({ ok: true, value: DEMO_ADMIN });
    expect(localStorage.getItem(USERS_KEY)).toBe('{broken');
  });

  it.each(['user', 'admin'])('resolves a matching registered %s identity', (role) => {
    seed(USERS_KEY, [{ ...user, role }]);
    seed(SESSION_KEY, { ...session, role });
    expect(readSession()).toEqual({ ok: true, value: { ...session, role } });
  });

  it('clears a malformed JSON session best effort', () => {
    localStorage.setItem(SESSION_KEY, '{broken');
    expect(readSession()).toEqual({ ok: false, value: null, code: 'invalid-json' });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it.each([null, [], false, 2, 'session'])('clears a wrong top-level session %j', (value) => {
    seed(SESSION_KEY, value);
    expect(readSession()).toEqual({ ok: false, value: null, code: 'invalid-shape' });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it.each(['userId', 'username', 'displayName', 'role'])('rejects missing session field %s', (field) => {
    const invalid = { ...session };
    delete invalid[field];
    seed(SESSION_KEY, invalid);
    expect(readSession().code).toBe('invalid-shape');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it.each([
    ['userId', 3], ['userId', 'unknown'], ['username', {}], ['username', ' jamie'],
    ['username', ''], ['username', 'admin'], ['displayName', null], ['displayName', ' '], ['role', 'owner'],
  ])('clears an invalid session field %s=%j', (field, value) => {
    seed(SESSION_KEY, { ...session, [field]: value });
    expect(readSession()).toEqual({ ok: false, value: null, code: 'invalid-shape' });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it.each([
    { ...DEMO_ADMIN, username: 'Admin' }, { ...DEMO_ADMIN, displayName: 'Other' },
    { ...DEMO_ADMIN, role: 'user' }, { ...DEMO_ADMIN, extra: true },
    { ...DEMO_ADMIN, userId: user.id },
  ])('rejects synthetic admin invariant violations %j', (value) => {
    seed(SESSION_KEY, value);
    expect(readSession().code).toBe('invalid-shape');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('clears stale identity when users are missing', () => {
    seed(SESSION_KEY, session);
    expect(readSession()).toEqual({ ok: false, value: null, code: 'invalid-shape' });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('clears stale identity when registered rows contain only another user', () => {
    seed(USERS_KEY, [secondUser]);
    seed(SESSION_KEY, session);
    expect(readSession().value).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(readCollection(USERS_KEY).value).toEqual([secondUser]);
  });

  it.each(['username', 'displayName', 'role'])('rejects session identity drift in %s', (field) => {
    seed(USERS_KEY, [user]);
    seed(SESSION_KEY, { ...session, [field]: field === 'role' ? 'admin' : 'other' });
    expect(readSession().code).toBe('invalid-shape');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('fails closed when stale clearing fails, retaining raw storage truthfully', () => {
    seed(SESSION_KEY, session);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readSession()).toEqual({ ok: false, value: null, code: 'invalid-shape' });
    expect(localStorage.getItem(SESSION_KEY)).toBe(JSON.stringify(session));
  });

  it('fails closed but preserves session and corrupt users when lookup is unreadable', () => {
    seed(SESSION_KEY, session);
    localStorage.setItem(USERS_KEY, '{broken');
    expect(readSession()).toEqual({ ok: false, value: null, code: 'invalid-shape' });
    expect(localStorage.getItem(SESSION_KEY)).toBe(JSON.stringify(session));
    expect(localStorage.getItem(USERS_KEY)).toBe('{broken');
  });

  it('reports unavailable users as a session storage failure, not a stale identity', () => {
    seed(SESSION_KEY, session);
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === USERS_KEY) throw new DOMException('', 'SecurityError');
      return original.call(this, key);
    });
    expect(readSession()).toEqual({ ok: false, value: null, code: 'storage-unavailable' });
    expect(localStorage.getItem(SESSION_KEY)).toBe(JSON.stringify(session));
  });

  it('clearSession removes only session and is idempotent', () => {
    seed(SESSION_KEY, DEMO_ADMIN);
    seed(USERS_KEY, [user]);
    seed(POSTS_KEY, [post]);
    expect(clearSession()).toEqual({ ok: true });
    expect(clearSession()).toEqual({ ok: true });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(readCollection(USERS_KEY).value).toEqual([user]);
    expect(readCollection(POSTS_KEY).value).toEqual([post]);
  });

  it('clearSession reports failure and leaves the persisted identity unchanged', () => {
    seed(SESSION_KEY, DEMO_ADMIN);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(clearSession()).toEqual({ ok: false, code: 'storage-unavailable' });
    expect(localStorage.getItem(SESSION_KEY)).toBe(JSON.stringify(DEMO_ADMIN));
  });
});

describe('guarded writes', () => {
  it.each([[POSTS_KEY, [post]], [USERS_KEY, [user]], [SESSION_KEY, session], [SESSION_KEY, DEMO_ADMIN]])(
    'persists valid %s payload and returns success only after writing', (key, value) => {
      expect(writeValue(key, value)).toEqual({ ok: true });
      expect(JSON.parse(localStorage.getItem(key))).toEqual(value);
    },
  );

  it.each([
    [POSTS_KEY, null], [USERS_KEY, {}], [SESSION_KEY, []], ['unknown', []],
    [POSTS_KEY, [{ ...post, title: ' ' }]], [USERS_KEY, [user, user]],
    [SESSION_KEY, { ...DEMO_ADMIN, role: 'user' }], [SESSION_KEY, undefined],
  ])('rejects invalid payload without touching storage %s', (key, value) => {
    localStorage.setItem(key, 'original bytes');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(writeValue(key, value)).toEqual({ ok: false, code: 'invalid-shape' });
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe('original bytes');
  });

  it('reports a cyclic otherwise-valid payload as serialization-failed with no store access', () => {
    seed(POSTS_KEY, [post]);
    const value = { ...post };
    value.extra = value;
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(writeValue(POSTS_KEY, [value])).toEqual({ ok: false, code: 'serialization-failed' });
    expect(write).not.toHaveBeenCalled();
    expect(readCollection(POSTS_KEY).value).toEqual([post]);
  });

  it('catches throwing toJSON separately from storage quota errors', () => {
    const value = { ...post, toJSON() { throw new DOMException('', 'QuotaExceededError'); } };
    expect(writeValue(POSTS_KEY, [value])).toEqual({ ok: false, code: 'serialization-failed' });
    expect(localStorage.getItem(POSTS_KEY)).toBeNull();
  });

  it('rejects toJSON that silently changes a valid record to an invalid shape', () => {
    const value = { ...post, toJSON() { return { ...post, title: '' }; } };
    expect(writeValue(POSTS_KEY, [value])).toEqual({ ok: false, code: 'invalid-shape' });
    expect(localStorage.getItem(POSTS_KEY)).toBeNull();
  });

  it('rejects array toJSON returning undefined without accessing storage', () => {
    const value = [post];
    value.toJSON = () => undefined;
    expect(writeValue(POSTS_KEY, value)).toEqual({ ok: false, code: 'invalid-shape' });
    expect(localStorage.getItem(POSTS_KEY)).toBeNull();
  });

  it('catches BigInt extras and throwing field access as serialization failures', () => {
    expect(writeValue(POSTS_KEY, [{ ...post, extra: 1n }]).code).toBe('serialization-failed');
    const value = { ...post };
    Object.defineProperty(value, 'title', { get() { throw new Error('bad accessor'); } });
    expect(writeValue(POSTS_KEY, [value]).code).toBe('serialization-failed');
    expect(localStorage.getItem(POSTS_KEY)).toBeNull();
  });

  it.each([
    ['QuotaExceededError', 'quota-exceeded'], ['SecurityError', 'storage-unavailable'],
    ['SyntaxError', 'storage-unavailable'], ['Error', 'storage-unavailable'],
  ])('distinguishes storage write %s and preserves prior records', (name, code) => {
    seed(POSTS_KEY, [post]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('', name); });
    expect(writeValue(POSTS_KEY, [makePost(2)])).toEqual({ ok: false, code });
    expect(readCollection(POSTS_KEY).value).toEqual([post]);
  });
});
