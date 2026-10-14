/** Verify reading, permissions, confirmed deletion, and real local persistence failures. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../src/App.jsx';
import Blogs from '../src/pages/Blogs.jsx';
import BlogDetail from '../src/pages/BlogDetail.jsx';
import { PostCard } from '../src/components/PostCard.jsx';
import { STORAGE_WARNING } from '../src/components/Notice.jsx';
import { sessionForUser } from '../src/utils/auth.js';
import { deletePost, getAuthorRole, readPost, readPosts } from '../src/utils/posts.js';
import { DEMO_ADMIN, POSTS_KEY, SESSION_KEY, USERS_KEY } from '../src/utils/storage.js';
import { makePost, post, secondUser, session, user } from './fixtures.js';

/**
 * Persist valid fixtures into actual jsdom localStorage.
 * Args:
 *   posts: Post snapshot.
 *   identity: Active session or null.
 *   users: Registered account snapshot.
 * Returns:
 *   Nothing; tests verify storage through subsequent reads.
 */
function seed(posts = [post], identity = session, users = [user, secondUser]) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  if (identity) localStorage.setItem(SESSION_KEY, JSON.stringify(identity));
}

/**
 * Render list/detail routes with the real browser router and shell.
 * Args:
 *   path: Initial browser URL.
 * Returns:
 *   Testing Library render result.
 */
function renderApp(path = '/blogs') {
  window.history.replaceState({}, '', path);
  return render(<App />);
}

/**
 * Simulate only a browser persistence exception, leaving reads real.
 * Args:
 *   name: Browser write exception name.
 * Returns:
 *   Spy for explicit restoration.
 */
function failWrite(name) {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', name); });
}

/**
 * Simulate a read exception for one key without replacing application helpers.
 * Args:
 *   blockedKey: Key whose browser read fails.
 * Returns:
 *   Spy for restoration before checking the preserved raw value.
 */
function failRead(blockedKey) {
  const original = Storage.prototype.getItem;
  return vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
    if (key === blockedKey) throw new DOMException('Blocked', 'SecurityError');
    return original.call(this, key);
  });
}

const malformed = [
  ['{broken', 'invalid-json'],
  ['{}', 'invalid-shape'],
  [JSON.stringify([{ ...post, createdAt: 'invalid' }]), 'invalid-record'],
];

 describe('post reading services', () => {
  it('reads a sorted copy with deterministic ID ties and does not change raw storage', () => {
    const older = makePost(1);
    const tied = { ...makePost(2), createdAt: post.createdAt };
    seed([post, older, tied]);
    const raw = localStorage.getItem(POSTS_KEY);
    expect(readPosts()).toEqual({ ok: true, source: 'stored', value: [tied, post, older] });
    expect(readPost(post.id)).toEqual({ ok: true, source: 'stored', value: post });
    const copy = readPosts().value;
    copy.pop();
    expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
  });

  it('reports missing collection as successful empty and detail as null', () => {
    expect(readPosts()).toEqual({ ok: true, value: [], source: 'missing' });
    expect(readPost(post.id)).toEqual({ ok: true, value: null, source: 'missing' });
    expect(localStorage.length).toBe(0);
  });

  it.each([undefined, null, 5, {}, [], '', 'unknown', post.id.toUpperCase()].map((id) => [id]))(
    'does not coerce or match invalid/unknown ID %j', (id) => {
      seed();
      expect(readPost(id)).toEqual({ ok: true, value: null, source: 'stored' });
      expect(JSON.parse(localStorage.getItem(POSTS_KEY))).toEqual([post]);
    },
  );

  it.each(malformed)('preserves failed collection %s with explicit code %s', (raw, code) => {
    localStorage.setItem(POSTS_KEY, raw);
    expect(readPosts()).toEqual({ ok: false, value: [], code });
    expect(readPost(post.id)).toEqual({ ok: false, value: null, code });
    expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
  });

  it('returns coded unavailable reads without losing persisted records', () => {
    seed();
    const spy = failRead(POSTS_KEY);
    expect(readPosts()).toEqual({ ok: false, value: [], code: 'storage-unavailable' });
    expect(readPost(post.id)).toEqual({ ok: false, value: null, code: 'storage-unavailable' });
    spy.mockRestore();
    expect(JSON.parse(localStorage.getItem(POSTS_KEY))).toEqual([post]);
  });

  it('derives synthetic/registered admin and defaults surviving posts of deleted authors to user', () => {
    expect(getAuthorRole({ ...post, authorId: DEMO_ADMIN.userId })).toBe('admin');
    expect(getAuthorRole(post, [{ ...user, role: 'admin' }])).toBe('admin');
    expect(getAuthorRole(post, [user])).toBe('user');
    expect(getAuthorRole(post)).toBe('user');
  });
});

 describe('confirmed deletion service', () => {
  it.each(['owner', 'synthetic admin', 'registered admin'])('allows %s and writes the full fresh remaining array', (role) => {
    const admin = { ...secondUser, role: 'admin' };
    const identity = role === 'owner' ? session : role === 'synthetic admin' ? DEMO_ADMIN : sessionForUser(admin);
    seed([post], identity, [user, admin]);
    const newer = makePost(20);
    localStorage.setItem(POSTS_KEY, JSON.stringify([post, newer]));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(deletePost(post.id, identity)).toEqual({ ok: true, value: [newer] });
    expect(readPosts().value).toEqual([newer]);
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(identity);
    expect(JSON.parse(localStorage.getItem(USERS_KEY))).toEqual([user, admin]);
  });

  it('leaves all storage unchanged when confirmation is declined', () => {
    seed();
    const before = localStorage.getItem(POSTS_KEY);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(deletePost(post.id, session)).toEqual({ ok: false, code: 'cancelled' });
    expect(localStorage.getItem(POSTS_KEY)).toBe(before);
  });

  it.each([undefined, null, 5, false, {}, [], '', '  '].map((id) => [id]))('rejects invalid deletion ID %j without actions', (id) => {
    seed();
    const confirm = vi.spyOn(window, 'confirm');
    expect(deletePost(id, session)).toEqual({ ok: false, code: 'invalid-id' });
    expect(readPosts().value).toEqual([post]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['unknown', post.id.toUpperCase()])('rejects missing exact ID %s without confirmation or writes', (id) => {
    seed();
    const confirm = vi.spyOn(window, 'confirm');
    expect(deletePost(id, session)).toEqual({ ok: false, code: 'not-found' });
    expect(readPosts().value).toEqual([post]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('rejects missing collection without creating one', () => {
    expect(deletePost(post.id, session)).toEqual({ ok: false, code: 'not-found' });
    expect(localStorage.getItem(POSTS_KEY)).toBeNull();
  });

  it.each(malformed)('never repairs failed posts %s on deletion', (raw, code) => {
    seed();
    localStorage.setItem(POSTS_KEY, raw);
    const confirm = vi.spyOn(window, 'confirm');
    expect(deletePost(post.id, session)).toEqual({ ok: false, code, readFailed: true });
    expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([POSTS_KEY, SESSION_KEY, USERS_KEY])('denies deletion when fresh %s read is unavailable', (key) => {
    seed();
    const spy = failRead(key);
    expect(deletePost(post.id, session)).toEqual({ ok: false, code: 'storage-unavailable', readFailed: true });
    spy.mockRestore();
    expect(readPosts().value).toEqual([post]);
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(session);
  });

  it.each(['no active session', 'no supplied session', 'other writer', 'changed active session', 'forged role']) (
    'denies %s without confirmation or mutation', (state) => {
      const other = sessionForUser(secondUser);
      seed([post], state === 'no active session' ? null : state === 'other writer' || state === 'changed active session' ? other : session);
      const supplied = state === 'no supplied session' ? null : state === 'other writer' ? other
        : state === 'forged role' ? { ...session, role: 'admin' } : session;
      const confirm = vi.spyOn(window, 'confirm');
      expect(deletePost(post.id, supplied)).toEqual({ ok: false, code: 'unauthorized' });
      expect(readPosts().value).toEqual([post]);
      expect(confirm).not.toHaveBeenCalled();
    },
  );

  it.each(['username', 'displayName', 'role'])('rejects supplied identity mismatched %s even if its userId owns the post', (field) => {
    seed();
    expect(deletePost(post.id, { ...session, [field]: 'changed' })).toEqual({ ok: false, code: 'unauthorized' });
    expect(readPosts().value).toEqual([post]);
  });

  it.each([['{broken', 'invalid-json'], ['{}', 'invalid-shape']])(
    'rejects malformed active session %s without post mutation or confirmation', (raw, code) => {
      seed();
      localStorage.setItem(SESSION_KEY, raw);
      const confirm = vi.spyOn(window, 'confirm');
      expect(deletePost(post.id, session)).toEqual({ ok: false, code, readFailed: true });
      expect(readPosts().value).toEqual([post]);
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
      expect(confirm).not.toHaveBeenCalled();
    },
  );

  it('denies a deleted active account even if best-effort session clearing fails', () => {
    seed([post], session, []);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('', 'SecurityError'); });
    expect(deletePost(post.id, session)).toEqual({ ok: false, code: 'invalid-shape', readFailed: true });
    expect(readPosts().value).toEqual([post]);
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(session);
  });

  it('denies stale active role and malformed users without mutating posts/users', () => {
    seed([post], session, [{ ...user, role: 'admin' }]);
    expect(deletePost(post.id, session)).toEqual({ ok: false, code: 'invalid-shape', readFailed: true });
    expect(readPosts().value).toEqual([post]);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(USERS_KEY, '{broken');
    expect(deletePost(post.id, session)).toEqual({ ok: false, code: 'invalid-shape', readFailed: true });
    expect(localStorage.getItem(USERS_KEY)).toBe('{broken');
    expect(readPosts().value).toEqual([post]);
  });

  it.each(['QuotaExceededError', 'SecurityError'])('preserves post on confirmed %s write failure', (name) => {
    seed();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    failWrite(name);
    expect(deletePost(post.id, session)).toEqual({ ok: false, code: name === 'QuotaExceededError' ? 'quota-exceeded' : 'storage-unavailable' });
    expect(readPosts().value).toEqual([post]);
  });

  it('returns serialization failure without durable deletion', () => {
    seed();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new TypeError('Blocked'); });
    expect(deletePost(post.id, session)).toEqual({ ok: false, code: 'serialization-failed' });
    expect(readPosts().value).toEqual([post]);
  });
});

 describe('reading components and route actions', () => {
  it('lists every post newest first with excerpts, UTC dates, author roles and responsive classes', () => {
    const admin = { ...secondUser, role: 'admin' };
    const posts = [makePost(1), makePost(2), { ...makePost(3), authorId: admin.id, authorName: admin.displayName }, makePost(4)];
    posts[3].content = 'x'.repeat(120) + 'HIDDEN_SUFFIX';
    seed(posts, session, [user, admin]);
    const before = localStorage.getItem(POSTS_KEY);
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'All Blogs' })).toBeInTheDocument();
    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual(['Story 4', 'Story 3', 'Story 2', 'Story 1']);
    expect(screen.getByText('x'.repeat(120))).toBeInTheDocument();
    expect(screen.queryByText(/HIDDEN_SUFFIX/)).not.toBeInTheDocument();
    expect(within(cards[0]).getByText('Oct 04, 2026')).toHaveAttribute('dateTime', posts[3].createdAt);
    expect(within(cards[1]).getByText(admin.displayName)).toBeInTheDocument();
    expect(within(cards[1]).getByRole('img', { name: 'Admin avatar' })).toBeInTheDocument();
    expect(within(cards[1]).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(cards[0].parentElement).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
    expect(screen.getByRole('heading', { level: 1 }).closest('section')).toHaveClass('max-w-6xl');
    expect(localStorage.getItem(POSTS_KEY)).toBe(before);
  });

  it.each(['missing', 'empty'])('presents ordinary %s list separately from read errors', (state) => {
    seed([]);
    if (state === 'missing') localStorage.removeItem(POSTS_KEY);
    renderApp();
    expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it.each(['/blogs', `/blog/${post.id}`].flatMap((path) => malformed.map(([raw]) => [path, raw])))(
    'shows full failed-read Notice and empty presentation at %s for %s', (path, raw) => {
      seed();
      localStorage.setItem(POSTS_KEY, raw);
      renderApp(path);
      expect(screen.getByRole('alert').textContent).toBe(STORAGE_WARNING);
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      expect(screen.queryByText('Post not found')).not.toBeInTheDocument();
      expect(screen.queryByText('No posts yet — check back soon!')).not.toBeInTheDocument();
      expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
    },
  );

  it.each(['/blogs', `/blog/${post.id}`])('shows unavailable posts safely at %s', (path) => {
    seed();
    const spy = failRead(POSTS_KEY);
    renderApp(path);
    expect(screen.getByRole('alert').textContent).toBe(STORAGE_WARNING);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    spy.mockRestore();
    expect(readPosts().value).toEqual([post]);
  });

  it.each(['/blogs', `/blog/${post.id}`])('preserves corrupt users and disables admin reading actions at %s', (path) => {
    seed([post], DEMO_ADMIN);
    localStorage.setItem(USERS_KEY, '{broken');
    renderApp(path);
    expect(screen.getByRole('alert').textContent).toBe(STORAGE_WARNING);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(readPosts().value).toEqual([post]);
    expect(localStorage.getItem(USERS_KEY)).toBe('{broken');
  });

  it('keeps posts valid after their authors are deleted and displays default user marker', () => {
    seed([post], DEMO_ADMIN, []);
    renderApp();
    const card = screen.getByRole('article');
    expect(within(card).getByText(post.authorName)).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'User avatar' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it.each([session, DEMO_ADMIN, sessionForUser(secondUser)])('renders detail and controls according to active %j', (identity) => {
    seed([post], identity);
    const confirm = vi.spyOn(window, 'confirm');
    renderApp(`/blog/${post.id}`);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(post.title);
    expect(screen.getByText(/First line/).textContent).toBe(post.content);
    expect(screen.getByText(/First line/)).toHaveClass('whitespace-pre-wrap');
    expect(within(screen.getByRole('article')).getByText(post.authorName, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Oct 14, 2026')).toHaveAttribute('dateTime', post.createdAt);
    const allowed = identity.userId !== secondUser.id;
    expect(screen.queryAllByRole('button', { name: 'Delete' })).toHaveLength(allowed ? 1 : 0);
    expect(screen.queryAllByRole('link', { name: 'Edit', exact: true })).toHaveLength(allowed ? 1 : 0);
    if (allowed) expect(screen.getByRole('link', { name: 'Edit', exact: true })).toHaveAttribute('href', `/edit/${post.id}`);
    expect(confirm).not.toHaveBeenCalled();
    expect(readPosts().value).toEqual([post]);
  });

  it('uses registered and synthetic admin SVG author markers on detail', () => {
    seed([post], DEMO_ADMIN, [{ ...user, role: 'admin' }]);
    const view = renderApp(`/blog/${post.id}`);
    expect(within(screen.getByRole('article')).getByRole('img', { name: 'Admin avatar' }).querySelector('svg')).not.toBeNull();
    view.unmount();
    seed([{ ...post, authorId: DEMO_ADMIN.userId, authorName: 'Admin' }], session);
    renderApp(`/blog/${post.id}`);
    expect(within(screen.getByRole('article')).getByRole('img', { name: 'Admin avatar' })).toBeInTheDocument();
  });

  it('escapes malicious title, author, and multiline full content without HTML injection', () => {
    const malicious = { ...post, title: '<script>title</script>', authorName: '<b>Writer</b>', content: '<img src=x onerror=alert(1)>\n' + 'x'.repeat(150) };
    seed([malicious]);
    const { container } = renderApp(`/blog/${post.id}`);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(malicious.title);
    expect(screen.getByText('<b>Writer</b>').textContent).toBe(malicious.authorName);
    expect(screen.getByText(/onerror/).textContent).toBe(malicious.content);
    expect(screen.getByText(/onerror/)).toHaveClass('whitespace-pre-wrap');
    expect(container.querySelector('script, img, b')).toBeNull();
  });

  it.each(['unknown', 'not-a-uuid', post.id.toUpperCase()])('shows exact Post not found for %s and back link works', async (id) => {
    seed();
    const actor = userEvent.setup();
    renderApp(`/blog/${id}`);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Post not found');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await actor.click(screen.getByRole('link', { name: 'Back to All Blogs' }));
    expect(window.location.pathname).toBe('/blogs');
    expect(screen.getByRole('link', { name: post.title })).toBeInTheDocument();
    expect(readPosts().value).toEqual([post]);
  });

  it('handles missing params and missing posts without coercion in standalone detail', () => {
    seed([]);
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<BlogDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Post not found' })).toBeInTheDocument();
    expect(readPosts().value).toEqual([]);
  });

  it.each(['/blogs', `/blog/${post.id}`])('redirects guests to login at %s without revealing posts', (path) => {
    seed([post], null);
    renderApp(path);
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText(post.title)).not.toBeInTheDocument();
    expect(readPosts().value).toEqual([post]);
  });

  it('navigates from list title to detail and back only on explicit activation', async () => {
    seed();
    const actor = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    renderApp();
    expect(window.location.pathname).toBe('/blogs');
    expect(confirm).not.toHaveBeenCalled();
    await actor.click(screen.getByRole('link', { name: post.title }));
    expect(window.location.pathname).toBe(`/blog/${post.id}`);
    await actor.click(screen.getByRole('link', { name: 'Back to All Blogs' }));
    expect(window.location.pathname).toBe('/blogs');
    expect(readPosts().value).toEqual([post]);
  });

  it.each(['/blogs', `/blog/${post.id}`])('declines then accepts deletion at %s with durable UI update', async (path) => {
    seed();
    const actor = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderApp(path);
    expect(confirm).not.toHaveBeenCalled();
    await actor.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(path);
    expect(readPosts().value).toEqual([post]);
    expect(screen.getByRole('heading', { name: post.title })).toBeInTheDocument();
    confirm.mockReturnValue(true);
    await actor.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(window.location.pathname).toBe('/blogs');
    expect(readPosts().value).toEqual([]);
    expect(screen.queryByRole('heading', { name: post.title })).not.toBeInTheDocument();
    expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
  });

  it.each([
    ['/blogs', 'QuotaExceededError'], ['/blogs', 'SecurityError'],
    [`/blog/${post.id}`, 'QuotaExceededError'], [`/blog/${post.id}`, 'SecurityError'],
  ])('retains visible post and route %s on confirmed %s write failure', async (path, name) => {
    seed();
    const actor = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderApp(path);
    failWrite(name);
    const title = screen.getByRole('heading', { name: post.title });
    const text = screen.getByText(/First line/).textContent;
    await actor.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert').textContent).toBe('Post could not be deleted. Nothing was saved.');
    expect(window.location.pathname).toBe(path);
    expect(screen.getByRole('heading', { name: post.title })).toBe(title);
    expect(screen.getByText(/First line/).textContent).toBe(text);
    expect(readPosts().value).toEqual([post]);
  });

  it.each(['/blogs', `/blog/${post.id}`])('empties presentation on fresh action read failure at %s without repair', async (path) => {
    seed();
    const actor = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    renderApp(path);
    localStorage.setItem(POSTS_KEY, '{broken');
    await actor.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert').textContent).toBe(STORAGE_WARNING);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
    expect(localStorage.getItem(POSTS_KEY)).toBe('{broken');
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['/blogs', `/blog/${post.id}`])('preserves visible snapshot on missing target and mismatched active session at %s', async (path) => {
    seed();
    const actor = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    renderApp(path);
    localStorage.setItem(POSTS_KEY, '[]');
    await actor.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert').textContent).toBe('Post not found');
    expect(screen.getByRole('heading', { name: post.title })).toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
    localStorage.setItem(POSTS_KEY, JSON.stringify([post]));
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionForUser(secondUser)));
    await actor.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert').textContent).toBe('Post could not be deleted. Nothing was saved.');
    expect(screen.getByRole('heading', { name: post.title })).toBeInTheDocument();
    expect(readPosts().value).toEqual([post]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('leaves unimplemented editor route as guarded fallback and edit link navigates correctly', async () => {
    seed();
    const actor = userEvent.setup();
    renderApp();
    await actor.click(screen.getByRole('link', { name: 'Edit', exact: true }));
    expect(window.location.pathname).toBe(`/edit/${post.id}`);
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(readPosts().value).toEqual([post]);
  });

  it('keeps public landing previews unmanaged even for signed-in admin', () => {
    seed([post], DEMO_ADMIN);
    renderApp('/');
    expect(screen.getByRole('link', { name: post.title })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it.each([null, session, DEMO_ADMIN, sessionForUser(secondUser)])('PostCard controls and callback activation respect %j', async (identity) => {
    const deleted = [];
    const actor = userEvent.setup();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PostCard post={post} session={identity} onDelete={(id) => deleted.push(id)} />
      </MemoryRouter>,
    );
    const allowed = identity && identity.userId !== secondUser.id;
    expect(screen.queryAllByRole('link', { name: 'Edit', exact: true })).toHaveLength(allowed ? 1 : 0);
    expect(screen.queryAllByRole('button', { name: 'Delete' })).toHaveLength(allowed ? 1 : 0);
    expect(deleted).toEqual([]);
    if (allowed) {
      expect(screen.getByRole('link', { name: 'Edit', exact: true })).toHaveAttribute('href', `/edit/${post.id}`);
      await actor.click(screen.getByRole('button', { name: 'Delete' }));
      expect(deleted).toEqual([post.id]);
    }
    expect(localStorage.length).toBe(0);
  });

  it('disables PostCard Delete without a parent handler', async () => {
    const actor = userEvent.setup();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PostCard post={post} session={session} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await actor.click(screen.getByRole('button', { name: 'Delete' }));
    expect(localStorage.length).toBe(0);
  });

  it('renders standalone Blogs with anonymous read-only controls', () => {
    seed([post], null);
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Blogs />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'All Blogs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});
