/** Render a plain-text preview with no data mutation or ownership controls. */
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { RoleAvatar } from './RoleAvatar.jsx';
import { DEMO_ADMIN } from '../utils/storage.js';
import { excerpt, formatDate } from '../utils/postPresentation.js';

/**
 * Present a validated post and link to its future protected detail route.
 * Args:
 *   post: Post record containing id, title, content, createdAt, authorId, authorName.
 *   authorRole: Optional known role; synthetic admin authors always use admin.
 * Returns:
 *   An article with escaped preview text, author, and publication date.
 */
export function PostCard({ post, authorRole = 'user' }) {
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
};
