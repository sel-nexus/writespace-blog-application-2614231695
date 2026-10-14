/** Derive only the approved local counts and newest-five preview without side effects. */
import { sortPosts } from './postPresentation.js';

/**
 * Derive independent collection availability rather than treating failed reads as zero.
 * Args:
 *   postsRead: Complete validated post read; failed values must not contribute counts or previews.
 *   usersRead: Complete validated registered-account read, excluding the synthetic demo identity.
 * Returns:
 *   Nullable post/user counts, constant zero drafts, availability flags, and a sorted recent copy.
 * Notes:
 *   Every persisted post is published; no status field or draft workflow is inferred.
 *   Inputs and their arrays are never modified; one failed read does not hide the other count.
 * @param {import('./storage.js').CollectionResult} postsRead
 * @param {import('./storage.js').CollectionResult} usersRead
 * @returns {{totalPosts: ?number, registeredUsers: ?number, publishedPosts: ?number,
 *   drafts: number, postsAvailable: boolean, usersAvailable: boolean, recentPosts: Array}}
 */
export function adminMetrics(postsRead, usersRead) {
  return {
    totalPosts: postsRead.ok ? postsRead.value.length : null,
    registeredUsers: usersRead.ok ? usersRead.value.length : null,
    publishedPosts: postsRead.ok ? postsRead.value.length : null,
    drafts: 0,
    postsAvailable: postsRead.ok,
    usersAvailable: usersRead.ok,
    recentPosts: postsRead.ok ? sortPosts(postsRead.value).slice(0, 5) : [],
  };
}
