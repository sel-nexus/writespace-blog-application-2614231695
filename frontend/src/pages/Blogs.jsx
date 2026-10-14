/** Present all local posts with guarded reads and explicit owner/admin actions. */
import { useEffect, useState } from 'react';
import { Notice } from '../components/Notice.jsx';
import { PostCard } from '../components/PostCard.jsx';
import { getSession } from '../utils/auth.js';
import { deletePost, getAuthorRole, readPosts } from '../utils/posts.js';
import { readCollection, USERS_KEY } from '../utils/storage.js';

/**
 * Render the protected newest-first reading grid.
 * Returns:
 *   All Blogs heading, posts/empty presentation, and truthful storage/action errors.
 */
export default function Blogs() {
  const [postsRead, setPostsRead] = useState({ ok: true, value: [] });
  const [usersRead, setUsersRead] = useState({ ok: true, value: [] });
  const [sessionRead, setSessionRead] = useState({ ok: true, value: null });
  const [error, setError] = useState('');
  useEffect(() => {
    setPostsRead(readPosts());
    setUsersRead(readCollection(USERS_KEY));
    setSessionRead(getSession());
  }, []);
  const readable = postsRead.ok && usersRead.ok && sessionRead.ok;

  /**
   * Request a fresh authorized deletion only on button activation.
   * Args:
   *   id: Post ID selected by the reader.
   * Returns:
   *   Nothing; success updates the grid, failed writes preserve it, failed reads empty it.
   */
  function handleDelete(id) {
    const result = deletePost(id, sessionRead.value);
    if (result.ok) {
      setPostsRead({ ok: true, value: result.value, source: 'stored' });
      setError('');
    } else if (result.readFailed) {
      setPostsRead({ ok: false, value: [], code: result.code });
      setError('');
    } else if (result.code !== 'cancelled') {
      setError(result.code === 'not-found' ? 'Post not found' : 'Post could not be deleted. Nothing was saved.');
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16" aria-labelledby="blogs-heading">
      <h1 id="blogs-heading" className="font-display text-4xl sm:text-5xl">
        All Blogs
      </h1>
      <div className="mt-8">
        {!readable && <Notice kind="storage" />}
        {error && (
          <p role="alert" className="mb-6 rounded-card bg-error-light p-4 text-error">
            {error}
          </p>
        )}
        {readable && postsRead.value.length === 0 && (
          <p className="rounded-card bg-surface-raised p-8 text-foreground-muted">
            No posts yet — check back soon!
          </p>
        )}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Blog posts">
          {readable && postsRead.value.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              authorRole={getAuthorRole(post, usersRead.value)}
              session={sessionRead.value}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
