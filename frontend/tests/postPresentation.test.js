/** Prove deterministic ordering, exact previews, and timezone-independent dates. */
import { describe, expect, it } from 'vitest';
import { excerpt, formatDate, sortPosts } from '../src/utils/postPresentation.js';
import { makePost } from './fixtures.js';

describe('sortPosts', () => {
  it('returns newest first without mutating the input', () => {
    const posts = Object.freeze([makePost(1), makePost(3), makePost(2)]);
    expect(sortPosts(posts).map((post) => post.title)).toEqual(['Story 3', 'Story 2', 'Story 1']);
    expect(posts.map((post) => post.title)).toEqual(['Story 1', 'Story 3', 'Story 2']);
  });

  it('sorts equal timestamps by ascending stable ID regardless of input order', () => {
    const first = makePost(1);
    const second = { ...makePost(2), createdAt: first.createdAt };
    expect(sortPosts([second, first])).toEqual([first, second]);
    expect(sortPosts([first, second])).toEqual([first, second]);
  });

  it('leaves equivalent comparison keys stable', () => {
    const post = makePost(1);
    const other = { ...post, title: 'Same key' };
    expect(sortPosts([post, other])).toEqual([post, other]);
  });

  it('compares timestamps rather than lexical timezone representations', () => {
    const older = { ...makePost(1), createdAt: '2026-10-14T12:00:00+02:00' };
    const newer = { ...makePost(2), createdAt: '2026-10-14T11:00:00Z' };
    expect(sortPosts([older, newer])).toEqual([newer, older]);
  });

  it('handles empty and singleton collections with a fresh array', () => {
    const empty = [];
    const one = [makePost(1)];
    expect(sortPosts(empty)).toEqual([]);
    expect(sortPosts(empty)).not.toBe(empty);
    expect(sortPosts(one)).toEqual(one);
    expect(sortPosts(one)).not.toBe(one);
  });
});

describe('excerpt', () => {
  it.each([0, 1, 119, 120, 121, 10000])('returns the first 120 characters at length %s', (length) => {
    const content = 'x'.repeat(length);
    expect(excerpt(content)).toBe(content.slice(0, 120));
    expect(excerpt(content)).toHaveLength(Math.min(length, 120));
  });

  it('preserves line breaks and plain markup as text, without appending an ellipsis', () => {
    const content = '<script>not executed</script>\nSecond line';
    expect(excerpt(content)).toBe(content);
    expect(excerpt('x'.repeat(121))).toBe('x'.repeat(120));
  });
});

describe('formatDate', () => {
  it('renders the exact English MMM DD, YYYY format', () => {
    expect(formatDate('2026-10-14T12:30:00.000Z')).toBe('Oct 14, 2026');
    expect(formatDate('2026-01-01T00:00:00.000Z')).toBe('Jan 01, 2026');
  });

  it('uses UTC consistently across timezone boundaries', () => {
    expect(formatDate('2026-01-01T00:30:00+02:00')).toBe('Dec 31, 2025');
  });

  it.each(['bad timestamp', '', undefined, null, 42])('returns safe empty text for invalid standalone input %j', (value) => {
    expect(formatDate(value)).toBe('');
  });
});
