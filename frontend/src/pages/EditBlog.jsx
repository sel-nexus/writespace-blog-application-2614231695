/** Edit exact existing posts without changing attribution or navigating after an unsaved mutation. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Notice } from '../components/Notice.jsx';
import { PostForm } from '../components/PostForm.jsx';
import { getSession } from '../utils/auth.js';
import { canManagePost } from '../utils/permissions.js';
import { editPost, readPost } from '../utils/posts.js';
import { readCollection, USERS_KEY } from '../utils/storage.js';

/**
 * Load an exact post and fresh identity on mount or route-ID change.
 * Returns:
 *   Prefilled permitted editor, explicit missing state, storage-disabled editor, or permission redirect.
 */
export default function EditBlog() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(null);
  const [readFailed, setReadFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const post = readPost(id);
    const users = readCollection(USERS_KEY);
    const session = getSession();
    const readable = post.ok && users.ok && session.ok;
    setSnapshot({ id, post, users, session });
    setReadFailed(!readable);
    setNotFound(readable && !post.value);
    setError('');
    if (session.ok && !session.value) {
      navigate('/login', { replace: true });
    } else if (readable && post.value && !canManagePost(session.value, post.value)) {
      navigate('/blogs', { replace: true });
    }
  }, [id, navigate]);

  /**
   * Save through fresh permission checks while preserving unsaved input on failure.
   * Args:
   *   values: Validated editable text only.
   * Returns:
   *   Service result for field errors; durable success alone navigates to detail.
   */
  function handleSubmit(values) {
    const result = editPost(id, values, snapshot.session.value);
    setError('');
    if (result.ok) {
      navigate(`/blog/${result.value.id}`);
    } else if (result.code === 'unauthorized') {
      const current = getSession();
      navigate(current.ok && current.value ? '/blogs' : '/login', { replace: true });
    } else if (result.code === 'not-found') {
      setNotFound(true);
    } else if (result.readFailed) {
      setReadFailed(true);
    } else if (result.code !== 'validation') {
      setError('Post could not be saved. Nothing was saved.');
    }
    return result;
  }

  const loaded = snapshot && snapshot.id === id;
  return (
    <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      {loaded && notFound ? (
        <div className="space-y-6">
          <h1 className="font-display text-4xl">
            Post not found
          </h1>
          <Link to="/blogs" className="rounded-sm font-bold text-primary-800 hover:underline">
            Back to All Blogs
          </Link>
        </div>
      ) : (
        <div className="space-y-6 rounded-card border border-border bg-surface p-6 shadow-card md:p-10">
          <h1 className="font-display text-4xl font-bold">
            Edit post
          </h1>
          {readFailed && <Notice kind="storage" />}
          {error && (
            <p role="alert" className="rounded-xl bg-error-light p-4 text-error">
              {error}
            </p>
          )}
          {loaded ? (
            <PostForm
              key={id}
              initial={snapshot.post.ok ? snapshot.post.value ?? {} : {}}
              onSubmit={handleSubmit}
              onCancel={() => navigate(`/blog/${id}`)}
              disabled={readFailed || !canManagePost(snapshot.session.value, snapshot.post.value)}
            />
          ) : (
            <p role="status" className="text-foreground-muted">
              Loading post…
            </p>
          )}
        </div>
      )}
    </section>
  );
}
