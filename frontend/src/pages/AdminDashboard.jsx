/** Present browser-local administrator counts, quick links, and confirmed post controls. */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Notice } from '../components/Notice.jsx';
import { PostCard } from '../components/PostCard.jsx';
import { adminMetrics } from '../utils/adminMetrics.js';
import { getSession } from '../utils/auth.js';
import { deletePost, getAuthorRole, readPosts } from '../utils/posts.js';
import { DEMO_ADMIN, readCollection, USERS_KEY } from '../utils/storage.js';

const quickActions = [
  { to: '/write', label: 'Write a post' },
  { to: '/blogs', label: 'All Blogs' },
  { to: '/users', label: 'Manage users' },
];
const metricLabels = [
  ['totalPosts', 'Total Posts'],
  ['registeredUsers', 'Registered Users'],
  ['publishedPosts', 'Published Posts'],
  ['drafts', 'Drafts'],
];

/**
 * Read independent local collections and fresh identity when the guarded dashboard mounts.
 * Returns:
 *   Four approved counts, demo disclaimer, explicit quick links, and newest-five post cards.
 * Notes:
 *   The external route guard owns entry. Failed mutations preserve this route and snapshot;
 *   fresh failed reads empty affected previews and invalidate their counts and controls.
 */
export default function AdminDashboard() {
  const [postsRead, setPostsRead] = useState(null);
  const [usersRead, setUsersRead] = useState(null);
  const [sessionRead, setSessionRead] = useState({ ok: true, value: null });
  const [error, setError] = useState('');
  const [readFailure, setReadFailure] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    setPostsRead(readPosts());
    setUsersRead(readCollection(USERS_KEY));
    setSessionRead(getSession());
  }, []);

  /**
   * Delegate confirmation and fresh four-field identity checks to the deletion service.
   * Args:
   *   id: Exact ID selected by explicit activation of a recent post's Delete button.
   * Returns:
   *   Nothing; only persisted success navigates to All Blogs, cancellation changes nothing.
   */
  function handleDelete(id) {
    const result = deletePost(id, sessionRead.value);
    if (result.ok) {
      navigate('/blogs');
    } else if (result.readFailed) {
      setReadFailure(true);
      const freshPosts = readPosts();
      const freshUsers = readCollection(USERS_KEY);
      setPostsRead(freshPosts);
      setUsersRead(freshUsers);
      setSessionRead(getSession());
      setError('');
    } else if (result.code !== 'cancelled') {
      setError(result.code === 'not-found' ? 'Post not found' : 'Post could not be deleted. Nothing was saved.');
    }
  }

  if (!postsRead || !usersRead) {
    return (
      <p role="status" className="mx-auto max-w-6xl px-6 py-12 text-foreground-muted">
        Reading local data…
      </p>
    );
  }
  const metrics = adminMetrics(postsRead, usersRead);
  const session = sessionRead.ok && sessionRead.value?.role === 'admin' ? sessionRead.value : null;
  const controlsAvailable = !readFailure && postsRead.ok && Boolean(session)
    && (usersRead.ok || session.userId === DEMO_ADMIN.userId);
  const recent = metrics.recentPosts;

  return (
    <section aria-labelledby="dashboard-heading" className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <h1 id="dashboard-heading" className="font-display text-4xl sm:text-5xl">
        Admin dashboard
      </h1>
      <div className="mt-6">
        <Notice />
      </div>
      <dl aria-label="Local statistics" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricLabels.map(([key, label]) => (
          <div key={key} className="min-w-0 rounded-card border border-border bg-surface p-6">
            <dt className="text-sm text-foreground-muted">
              {label}
            </dt>
            <dd className="mt-3 break-words text-3xl font-semibold tabular-nums">
              {metrics[key] ?? 'Unavailable'}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-foreground-muted">
        All stored posts are published. This local demo has no draft workflow; the fixed admin is not a registered account.
      </p>
      <nav aria-label="Quick actions" className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {quickActions.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="rounded-full border border-border bg-surface px-5 py-3 font-semibold hover:bg-surface-raised focus-visible:outline-ring"
          >
            {action.label}
          </Link>
        ))}
      </nav>
      <section aria-labelledby="recent-heading" className="mt-12">
        <h2 id="recent-heading" className="font-display text-3xl">
          Recent posts
        </h2>
        {!postsRead.ok && (
          <div aria-label="Posts read warning" className="mt-6">
            <Notice kind="storage" />
          </div>
        )}
        {!usersRead.ok && (
          <div aria-label="Users read warning" className="mt-6">
            <Notice kind="storage" />
          </div>
        )}
        {(!sessionRead.ok || (readFailure && postsRead.ok && usersRead.ok)) && <Notice kind="storage" />}
        {error && (
          <p role="alert" className="mt-6 rounded-card bg-error-light p-4 text-error">
            {error}
          </p>
        )}
        {postsRead.ok && recent.length === 0 && (
          <p className="mt-6 rounded-card bg-surface-raised p-8 text-foreground-muted">
            No posts yet — check back soon!
          </p>
        )}
        <div aria-label="Recent posts" className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {recent.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              authorRole={getAuthorRole(post, usersRead.ok ? usersRead.value : [])}
              session={controlsAvailable ? session : null}
              onDelete={controlsAvailable ? handleDelete : undefined}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

AdminDashboard.propTypes = {};
