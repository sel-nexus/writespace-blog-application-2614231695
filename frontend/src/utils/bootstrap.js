/** Initialize origin-local starter posts without repairing or replacing existing data. */
import {
  DEMO_ADMIN, POSTS_KEY, readCollection, readInitializationMarker,
  writeInitializationMarker, writeValue,
} from './storage.js';

/** @typedef {{ok:true, initialized:true, seeded:boolean, posts:Array}|{ok:false, code:string, posts:Array}} BootstrapResult */

/**
 * Construct a bounded plain-text demonstration set using the existing demo author.
 * Returns:
 *   Two ordinary Post records, with browser UUIDs and ISO timestamps; no user rows.
 */
function createSamples() {
  const createdAt = new Date().toISOString();
  return [
    {
      title: 'Welcome to WriteSpace',
      content: 'Every story starts with a first sentence.\nThis local demo is a place to try yours.',
    },
    {
      title: 'Make room for your next idea',
      content: 'Keep a small notebook of observations. Choose one, and turn it into a story worth sharing.',
    },
  ].map((sample) => ({
    ...sample,
    id: crypto.randomUUID(),
    createdAt,
    authorId: DEMO_ADMIN.userId,
    authorName: DEMO_ADMIN.displayName,
  }));
}

/**
 * Seed only positively identified first use, then finalize the separate marker.
 * Returns:
 *   BootstrapResult with persisted posts on marker failure and safe empty posts on read/write failure.
 * Notes:
 *   Every invocation re-reads storage. StrictMode and later startups preserve stored arrays,
 *   including empty arrays. A partial marker failure retries only completion on the next startup.
 */
export function initializePosts() {
  const marker = readInitializationMarker();
  if (!marker.ok) return { ok: false, code: marker.code, posts: [] };
  const stored = readCollection(POSTS_KEY);
  if (!stored.ok) return { ok: false, code: stored.code, posts: [] };
  if (marker.source === 'stored') {
    return { ok: true, initialized: true, seeded: false, posts: stored.value };
  }

  let posts = stored.value;
  const seeded = stored.source === 'missing';
  if (seeded) {
    try {
      posts = createSamples();
    } catch {
      return { ok: false, code: 'posts-write-failed', posts: [] };
    }
    if (!writeValue(POSTS_KEY, posts).ok) {
      return { ok: false, code: 'posts-write-failed', posts: [] };
    }
  }
  if (!writeInitializationMarker().ok) {
    return { ok: false, code: 'marker-write-failed', posts };
  }
  return { ok: true, initialized: true, seeded, posts };
}
