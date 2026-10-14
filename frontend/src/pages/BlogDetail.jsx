/** Render escaped full post text with safe navigation and confirmed management actions. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Notice } from '../components/Notice.jsx';
import { RoleAvatar } from '../components/RoleAvatar.jsx';
import { getSession } from '../utils/auth.js';
import { canManagePost } from '../utils/permissions.js';
import { formatDate } from '../utils/postPresentation.js';
import { deletePost, getAuthorRole, readPost } from '../utils/posts.js';
import { readCollection, USERS_KEY } from '../utils/storage.js';

/**
 * Render an exact-ID detail or the exact missing-post state.
 * Returns:
 *   Escaped plain text, author/date, safe back link, and authorized actions or storage warning.
 */
export default function BlogDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [postRead, setPostRead] = useState({ ok: true, value: null });
  const [usersRead, setUsersRead] = useState({ ok: true, value: [] });
  const [sessionRead, setSessionRead] = useState({ ok: true, value: null });
  const [error, setError] = useState('');
  useEffect(() => {
    setPostRead(readPost(id));
    setUsersRead(readCollection(USERS_KEY));
    setSessionRead(getSession());
    setError('');
  }, [id]);
  const readable = postRead.ok && usersRead.ok && sessionRead.ok;
  const post = readable ? postRead.value : null;

  /**
   * Confirm through the service and navigate only after successful persistence.
   * Returns:
   *   Nothing; declined/failed writes retain the post and route, failed reads empty presentation.
   */
  function handleDelete() {
    const result = deletePost(id, sessionRead.value);
    if (result.ok) {
      navigate('/blogs');
    } else if (result.readFailed) {
      setPostRead({ ok: false, value: null, code: result.code });
      setError('');
    } else if (result.code !== 'cancelled') {
      setError(result.code === 'not-found' ? 'Post not found' : 'Post could not be deleted. Nothing was saved.');
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <Link to="/blogs" className="rounded-sm font-bold text-primary-800 hover:underline focus-visible:outline-ring">
        Back to All Blogs
      </Link>
      <div className="mt-8">
        {!readable ? (
          <Notice kind="storage" />
        ) : !post ? (
          <h1 className="font-display text-4xl">
            Post not found
          </h1>
        ) : (
          <article className="mx-auto max-w-3xl">
            <h1 className="break-words font-display text-4xl sm:text-5xl">
              {post.title}
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
              <RoleAvatar role={getAuthorRole(post, usersRead.value)} />
              <span className="break-words font-bold">
                {post.authorName}
              </span>
              <time dateTime={post.createdAt} className="text-foreground-muted">
                {formatDate(post.createdAt)}
              </time>
            </div>
            <p className="mt-10 whitespace-pre-wrap break-words text-lg leading-relaxed">
              {post.content}
            </p>
            {canManagePost(sessionRead.value, post) && (
              <div className="mt-10 flex flex-wrap gap-4 border-t border-border pt-6">
                <Link to={`/edit/${post.id}`} className="rounded-full border border-border px-5 py-2 font-bold hover:bg-surface-raised">
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-full px-5 py-2 font-bold text-error hover:bg-error-light focus-visible:outline-ring"
                >
                  Delete
                </button>
              </div>
            )}
          </article>
        )}
        {error && (
          <p role="alert" className="mt-6 rounded-card bg-error-light p-4 text-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
