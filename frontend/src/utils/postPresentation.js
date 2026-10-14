/** Present validated posts deterministically without modifying stored records. */

/**
 * Return a newest-first copy with ascending stable ID ties.
 * Args:
 *   posts: Validated post array.
 * Returns:
 *   A sorted copy; the input remains untouched.
 */
export function sortPosts(posts) {
  return [...posts].sort((left, right) => {
    const timeDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (timeDifference !== 0) return timeDifference;
    return left.id < right.id ? -1 : Number(left.id > right.id);
  });
}

/**
 * Return exactly the first 120 characters, without an added ellipsis.
 * Args:
 *   content: Plain text content.
 * Returns:
 *   The preview text.
 */
export function excerpt(content) {
  return content.slice(0, 120);
}

/**
 * Format a timestamp as an English calendar date, consistently in UTC.
 * Args:
 *   timestamp: ISO timestamp from a validated post.
 * Returns:
 *   MMM DD, YYYY; empty string for an invalid standalone input.
 */
export function formatDate(timestamp) {
  if (typeof timestamp !== 'string') return '';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
