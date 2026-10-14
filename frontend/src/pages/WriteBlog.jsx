/** Create a browser-local post through fresh service checks and explicit save/cancel actions. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Notice } from '../components/Notice.jsx';
import { PostForm } from '../components/PostForm.jsx';
import { getSession } from '../utils/auth.js';
import { createPost, readPosts } from '../utils/posts.js';
import { readCollection, USERS_KEY } from '../utils/storage.js';

/**
 * Load fresh authoring prerequisites on mount without writing posts.
 * Returns:
 *   Focused editor; failed reads disable saving, failed writes retain values and route.
 */
export default function WriteBlog() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(null);
  const [readFailed, setReadFailed] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const posts = readPosts();
    const users = readCollection(USERS_KEY);
    const session = getSession();
    setSnapshot({ posts, users, session });
    setReadFailed(!posts.ok || !users.ok || !session.ok);
    if (session.ok && !session.value) navigate('/login', { replace: true });
  }, [navigate]);

  /**
   * Save only on activation and navigate only after durable success.
   * Args:
   *   values: Validated title/content from the presentation form.
   * Returns:
   *   Service result for field errors; failures never claim a persisted post.
   */
  function handleSubmit(values) {
    const result = createPost(values, snapshot.session.value);
    setError('');
    if (result.ok) {
      navigate(`/blog/${result.value.id}`);
    } else if (result.code === 'unauthorized') {
      const current = getSession();
      navigate(current.ok && current.value ? '/blogs' : '/login', { replace: true });
    } else if (result.readFailed) {
      setReadFailed(true);
    } else if (result.code !== 'validation') {
      setError('Post could not be saved. Nothing was saved.');
    }
    return result;
  }

  return (
    <section aria-labelledby="write-title" className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <div className="space-y-6 rounded-card border border-border bg-surface p-6 shadow-card md:p-10">
        <header className="space-y-3">
          <h1 id="write-title" className="font-display text-4xl font-bold">
            Write a post
          </h1>
          <p className="text-foreground-muted">
            A title, your words, and a little space to think. Saved only in this browser.
          </p>
        </header>
        {readFailed && <Notice kind="storage" />}
        {error && (
          <p role="alert" className="rounded-xl bg-error-light p-4 text-error">
            {error}
          </p>
        )}
        <PostForm
          onSubmit={handleSubmit}
          onCancel={() => navigate('/blogs')}
          disabled={!snapshot || readFailed || !snapshot.session.value}
        />
      </div>
    </section>
  );
}
