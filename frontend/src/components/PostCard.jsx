/** Render a plain-text preview with optional explicit owner/admin management controls. */
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { RoleAvatar } from './RoleAvatar.jsx';
import { DEMO_ADMIN } from '../utils/storage.js';
import { excerpt, formatDate } from '../utils/postPresentation.js';
import { canManagePost } from '../utils/permissions.js';

/**
 * Present a validated post and its protected detail link.
 * Args:
 *   post: Post record containing id, title, content, createdAt, authorId, authorName.
 *   authorRole: Optional known role; synthetic admin authors always use admin.
 *   session: Optional resolved identity; absent by default so public previews have no controls.
 *   onDelete: Optional parent callback receiving the post ID on explicit activation.
 * Returns:
 *   Escaped preview, author/date, and optional authorized Edit link/Delete button.
 * Notes:
 *   Persistence and confirmation belong to the parent's deletion service, not this card.
 */
export function PostCard({ post, authorRole = 'user', session = null, onDelete }) {
  const role = post.authorId === DEMO_ADMIN.userId ? 'admin' : authorRole;
  return (
    <article
      className="flex h-full min-w-0 flex-col rounded-card border border-border bg-surface p-6 shadow-card"
    >
      <time dateTime={post.createdAt} className="text-sm text-foreground-muted">
        {formatDate(post.createdAt)}
      </time>
      <h3 className="mt-3 break-words font-display text-2xl leading-snug">
        <Link
          to={`/blog/${post.id}`}
          className="rounded-sm hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {post.title}
        </Link>
      </h3>
      <p className="mt-4 flex-1 whitespace-pre-wrap break-words leading-relaxed text-foreground-muted">
        {excerpt(post.content)}
      </p>
      <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
        <RoleAvatar role={role} />
        <span className="min-w-0 break-words text-sm font-bold">
          {post.authorName}
        </span>
      </div>
      {canManagePost(session, post) && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to={`/edit/${post.id}`} className="rounded-full border border-border px-4 py-2 font-bold hover:bg-surface-raised">
            Edit
          </Link>
          <button
            type="button"
            disabled={!onDelete}
            onClick={() => onDelete(post.id)}
            className="rounded-full px-4 py-2 font-bold text-error hover:bg-error-light disabled:opacity-50 focus-visible:outline-ring"
          >
            Delete
          </button>
        </div>
      )}
    </article>
  );
}

PostCard.propTypes = {
  post: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    createdAt: PropTypes.string.isRequired,
    authorId: PropTypes.string.isRequired,
    authorName: PropTypes.string.isRequired,
  }).isRequired,
  authorRole: PropTypes.oneOf(['user', 'admin']),
  session: PropTypes.shape({
    userId: PropTypes.string.isRequired,
    username: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['user', 'admin']).isRequired,
  }),
  onDelete: PropTypes.func,
};
