/** Verify bootstrap state transitions and guarded marker/storage failures without repairing bytes. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializePosts } from '../src/utils/bootstrap.js';
import {
  DEMO_ADMIN, INITIALIZATION_KEY, POSTS_KEY, USERS_KEY, SESSION_KEY,
  readCollection, readInitializationMarker, writeInitializationMarker, writeValue,
} from '../src/utils/storage.js';
import { post, user, session } from './fixtures.js';

const marker = { version: 1, initialized: true };

/** Persist an explicit pre-existing value in actual jsdom localStorage. */
function store(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Return every persisted byte so failures can prove no silent repairs occurred. */
function snapshot() {
  return { ...localStorage };
}

beforeEach(() => {
  vi.useRealTimers();
  let number = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => (
    `8b1a849e-32e6-4d5a-87f1-${String(++number).padStart(12, '0')}`
  ));
  vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-10-14T12:30:00.000Z');
});

describe('marker protocol', () => {
  it('distinguishes missing from the exact persisted completion marker', () => {
    expect(readInitializationMarker()).toEqual({ ok: true, value: null, source: 'missing' });
    expect(writeInitializationMarker()).toEqual({ ok: true });
    expect(readInitializationMarker()).toEqual({ ok: true, value: marker, source: 'stored' });
    expect(localStorage.getItem(INITIALIZATION_KEY)).toBe(JSON.stringify(marker));
    expect(readCollection(INITIALIZATION_KEY)).toEqual({ ok: false, value: [], code: 'invalid-shape' });
  });

  it.each(['{broken', '', 'undefined'])('preserves invalid marker JSON: %s', (raw) => {
    localStorage.setItem(INITIALIZATION_KEY, raw);
    const before = snapshot();
    expect(readInitializationMarker()).toEqual({ ok: false, value: null, code: 'invalid-json' });
    expect(initializePosts()).toEqual({ ok: false, code: 'invalid-json', posts: [] });
    expect(snapshot()).toEqual(before);
  });

  it.each([null, [], {}, 1, 'done', { version: 2, initialized: true },
    { version: '1', initialized: true }, { version: 1, initialized: false },
    { version: 1, initialized: 'true' }, { version: 1 }, { initialized: true },
    { ...marker, extra: true }])('rejects unsupported marker shape: %j', (value) => {
    store(INITIALIZATION_KEY, value);
    store(POSTS_KEY, [post]);
    const before = snapshot();
    expect(readInitializationMarker()).toEqual({ ok: false, value: null, code: 'invalid-shape' });
    expect(initializePosts()).toEqual({ ok: false, code: 'invalid-shape', posts: [] });
    expect(snapshot()).toEqual(before);
    expect(writeValue(INITIALIZATION_KEY, value)).toEqual({ ok: false, code: 'invalid-shape' });
    expect(snapshot()).toEqual(before);
  });

  it('returns serialization-failed for a throwing marker getter without accessing storage', () => {
    const value = { initialized: true, get version() { throw new Error('private'); } };
    expect(writeValue(INITIALIZATION_KEY, value)).toEqual({ ok: false, code: 'serialization-failed' });
    expect(snapshot()).toEqual({});
  });

  it('rejects marker toJSON changes and catches serialization exceptions', () => {
    const changed = Object.defineProperty({ ...marker }, 'toJSON', { value: () => ({ version: 9 }) });
    expect(writeValue(INITIALIZATION_KEY, changed)).toEqual({ ok: false, code: 'invalid-shape' });
    const throwing = Object.defineProperty({ ...marker }, 'toJSON', {
      value: () => { throw new Error('private'); },
    });
    expect(writeValue(INITIALIZATION_KEY, throwing)).toEqual({ ok: false, code: 'serialization-failed' });
    expect(snapshot()).toEqual({});
  });

  it.each(['SecurityError', 'QuotaExceededError'])('reports direct marker write %s', (name) => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('', name); });
    expect(writeInitializationMarker()).toEqual({
      ok: false, code: name === 'QuotaExceededError' ? 'quota-exceeded' : 'storage-unavailable',
    });
    expect(snapshot()).toEqual({});
  });
});

describe('initialization matrix', () => {
  it('seeds bounded schema-valid plain text posts, writes posts before marker, and creates no accounts', () => {
    store(USERS_KEY, [user]);
    store(SESSION_KEY, session);
    const usersBefore = localStorage.getItem(USERS_KEY);
    const sessionBefore = localStorage.getItem(SESSION_KEY);
    const writes = [];
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      writes.push(key);
      setItem.call(this, key, value);
    });
    const result = initializePosts();
    expect(result).toMatchObject({ ok: true, initialized: true, seeded: true });
    expect(result.posts.length).toBeGreaterThan(0);
    expect(result.posts.length).toBeLessThanOrEqual(3);
    expect(readCollection(POSTS_KEY)).toEqual({ ok: true, value: result.posts, source: 'stored' });
    expect(new Set(result.posts.map((record) => record.id)).size).toBe(result.posts.length);
    for (const record of result.posts) {
      expect(Object.keys(record).sort()).toEqual(['authorId', 'authorName', 'content', 'createdAt', 'id', 'title']);
      expect(record).toMatchObject({ authorId: DEMO_ADMIN.userId, authorName: DEMO_ADMIN.displayName,
        createdAt: '2026-10-14T12:30:00.000Z' });
      expect(record.title + record.content).not.toMatch(/<[^>]+>/);
    }
    expect(writes).toEqual([POSTS_KEY, INITIALIZATION_KEY]);
    expect(readInitializationMarker().value).toEqual(marker);
    expect(localStorage.getItem(USERS_KEY)).toBe(usersBefore);
    expect(localStorage.getItem(SESSION_KEY)).toBe(sessionBefore);
    const before = snapshot();
    expect(initializePosts()).toEqual({ ok: true, initialized: true, seeded: false, posts: result.posts });
    expect(snapshot()).toEqual(before);
  });

  it('never creates a users or session key on clean first use', () => {
    initializePosts();
    expect(localStorage.getItem(USERS_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it.each([{ posts: [] }, { posts: [post] }])('only finalizes absent marker for stored posts: %j', ({ posts }) => {
    const raw = ` ${JSON.stringify(posts)} `;
    localStorage.setItem(POSTS_KEY, raw);
    expect(initializePosts()).toEqual({ ok: true, initialized: true, seeded: false, posts });
    expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
    expect(readInitializationMarker().value).toEqual(marker);
  });

  it.each([null, [], [post]])('valid marker preserves missing/empty/existing posts: %j', (posts) => {
    store(INITIALIZATION_KEY, marker);
    if (posts !== null) store(POSTS_KEY, posts);
    const before = snapshot();
    expect(initializePosts()).toEqual({ ok: true, initialized: true, seeded: false, posts: posts ?? [] });
    expect(snapshot()).toEqual(before);
  });

  it('re-reads state after deletion and after explicit clearing, rather than caching an old result', () => {
    const first = initializePosts();
    store(POSTS_KEY, []);
    expect(initializePosts().posts).toEqual([]);
    localStorage.removeItem(POSTS_KEY);
    expect(initializePosts().posts).toEqual([]);
    localStorage.clear();
    const next = initializePosts();
    expect(next.seeded).toBe(true);
    expect(next.posts.map((record) => record.id)).not.toEqual(first.posts.map((record) => record.id));
    expect(readCollection(POSTS_KEY).value).toEqual(next.posts);
  });

  it.each([
    ['{bad', 'invalid-json'], ['{}', 'invalid-shape'], ['null', 'invalid-shape'],
    [JSON.stringify([{}]), 'invalid-record'],
    [JSON.stringify([post, post]), 'invalid-record'],
    [JSON.stringify([{ ...post, title: '' }]), 'invalid-record'],
    [JSON.stringify([{ ...post, id: 'invalid' }]), 'invalid-record'],
    [JSON.stringify([{ ...post, createdAt: '2026-02-30T00:00:00Z' }]), 'invalid-record'],
  ])('preserves failed post reads and returns exact %s/%s', (raw, code) => {
    localStorage.setItem(POSTS_KEY, raw);
    const before = snapshot();
    expect(initializePosts()).toEqual({ ok: false, code, posts: [] });
    expect(snapshot()).toEqual(before);
    store(INITIALIZATION_KEY, marker);
    expect(initializePosts()).toEqual({ ok: false, code, posts: [] });
    expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
  });

  it.each([INITIALIZATION_KEY, POSTS_KEY])('fails closed when reading %s throws', (failedKey) => {
    store(POSTS_KEY, [post]);
    const before = snapshot();
    const getItem = Storage.prototype.getItem;
    const reads = [];
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      reads.push(key);
      if (key === failedKey) throw new DOMException('', 'SecurityError');
      return getItem.call(this, key);
    });
    expect(initializePosts()).toEqual({ ok: false, code: 'storage-unavailable', posts: [] });
    expect(reads).toEqual(failedKey === INITIALIZATION_KEY ? [INITIALIZATION_KEY] : [INITIALIZATION_KEY, POSTS_KEY]);
    expect(snapshot()).toEqual(before);
  });

  it('catches a denied localStorage property getter before any writes', () => {
    const before = snapshot();
    const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('', 'SecurityError');
    });
    expect(readInitializationMarker()).toEqual({ ok: false, value: null, code: 'storage-unavailable' });
    expect(initializePosts()).toEqual({ ok: false, code: 'storage-unavailable', posts: [] });
    expect(writeInitializationMarker()).toEqual({ ok: false, code: 'storage-unavailable' });
    getter.mockRestore();
    expect(snapshot()).toEqual(before);
  });

  it.each(['SecurityError', 'QuotaExceededError'])('post write %s leaves marker absent and retries first use', (name) => {
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('', name);
    });
    expect(initializePosts()).toEqual({ ok: false, code: 'posts-write-failed', posts: [] });
    expect(snapshot()).toEqual({});
    failure.mockRestore();
    const retry = initializePosts();
    expect(retry.seeded).toBe(true);
    expect(readCollection(POSTS_KEY).value).toEqual(retry.posts);
    expect(readInitializationMarker().value).toEqual(marker);
  });

  it.each([null, [], [post]])('marker partial failure preserves posts and retry never duplicates: %j', (posts) => {
    if (posts !== null) store(POSTS_KEY, posts);
    const setItem = Storage.prototype.setItem;
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === INITIALIZATION_KEY) throw new DOMException('', 'QuotaExceededError');
      setItem.call(this, key, value);
    });
    const partial = initializePosts();
    expect(partial).toMatchObject({ ok: false, code: 'marker-write-failed' });
    expect(readCollection(POSTS_KEY).value).toEqual(partial.posts);
    expect(localStorage.getItem(INITIALIZATION_KEY)).toBeNull();
    const raw = localStorage.getItem(POSTS_KEY);
    expect(initializePosts()).toEqual(partial);
    expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
    failure.mockRestore();
    expect(initializePosts()).toEqual({ ok: true, initialized: true, seeded: false, posts: partial.posts });
    expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
    expect(readInitializationMarker().value).toEqual(marker);
  });

  it.each([{ posts: [] }, { posts: [post] }])('denied marker finalization preserves pre-existing bytes: %j', ({ posts }) => {
    const raw = ` ${JSON.stringify(posts)} `;
    localStorage.setItem(POSTS_KEY, raw);
    const setItem = Storage.prototype.setItem;
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === INITIALIZATION_KEY) throw new DOMException('', 'SecurityError');
      setItem.call(this, key, value);
    });
    expect(initializePosts()).toEqual({ ok: false, code: 'marker-write-failed', posts });
    expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
    expect(readCollection(POSTS_KEY).value).toEqual(posts);
    expect(localStorage.getItem(INITIALIZATION_KEY)).toBeNull();
    failure.mockRestore();
    expect(initializePosts()).toEqual({ ok: true, initialized: true, seeded: false, posts });
    expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
  });

  it.each(['throw', 'invalid'])('fails safely when sample timestamp generation is %s', (mode) => {
    vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
      if (mode === 'throw') throw new RangeError('invalid date');
      return 'not-a-timestamp';
    });
    expect(initializePosts()).toEqual({ ok: false, code: 'posts-write-failed', posts: [] });
    expect(snapshot()).toEqual({});
  });

  it.each(['throw', 'invalid', 'duplicate'])('fails safely when UUID generation is %s', (mode) => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      if (mode === 'throw') throw new Error('unavailable');
      return mode === 'invalid' ? 'bad' : post.id;
    });
    expect(initializePosts()).toEqual({ ok: false, code: 'posts-write-failed', posts: [] });
    expect(snapshot()).toEqual({});
  });
});
