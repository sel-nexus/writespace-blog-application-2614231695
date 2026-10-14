/** Verify dashboard derivation and real App/storage behavior without mocking application services. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';
import { adminMetrics } from '../src/utils/adminMetrics.js';
import { getSession, login, sessionForUser } from '../src/utils/auth.js';
import { readPosts } from '../src/utils/posts.js';
import { DEMO_MESSAGE, STORAGE_WARNING } from '../src/components/Notice.jsx';
import { DEMO_ADMIN, POSTS_KEY, SESSION_KEY, USERS_KEY, readCollection } from '../src/utils/storage.js';
import { makePost, post, secondUser, session, user } from './fixtures.js';

const admin = { ...secondUser, role: 'admin' };

/** Seed actual browser storage with validated fixtures and a real login result. */
function seed(posts = [post], users = [user, admin], identity = DEMO_ADMIN) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  if (identity) localStorage.setItem(SESSION_KEY, JSON.stringify(identity));
}

/** Render the real route tree at the requested initial URL. */
function enter(path = '/admin') {
  window.history.replaceState({}, '', path);
  return render(<App />);
}

/** Read both collections through the real services before pure metric derivation. */
function metrics() {
  return adminMetrics(readCollection(POSTS_KEY), readCollection(USERS_KEY));
}

/** Return the displayed value paired with its exact metric label. */
function metric(label) {
  return screen.getByText(label, { exact: true }).parentElement.querySelector('dd');
}

/** Inject only a browser read exception for one key, preserving real reads for other keys. */
function failRead(blockedKey) {
  const original = Storage.prototype.getItem;
  return vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
    if (key === blockedKey) throw new DOMException('Blocked', 'SecurityError');
    return original.call(this, key);
  });
}

describe('adminMetrics independent availability', () => {
  it('counts all stored posts as published and every registered role without a synthetic admin row', () => {
    seed([post, makePost(1)], [user, admin]);
    expect(login('admin', 'admin').ok).toBe(true);
    expect(getSession().value).toEqual(DEMO_ADMIN);
    expect(metrics()).toEqual({
      totalPosts: 2, registeredUsers: 2, publishedPosts: 2, drafts: 0,
      postsAvailable: true, usersAvailable: true, recentPosts: [post, makePost(1)],
    });
    expect(readCollection(USERS_KEY).value).toEqual([user, admin]);
    expect(readPosts().value.every((record) => !Object.hasOwn(record, 'status'))).toBe(true);
  });

  it.each(['missing', 'stored'])('reports valid %s empty collections as available zero with no recent posts', (source) => {
    if (source === 'stored') seed([], []);
    expect(metrics()).toEqual({
      totalPosts: 0, registeredUsers: 0, publishedPosts: 0, drafts: 0,
      postsAvailable: true, usersAvailable: true, recentPosts: [],
    });
    expect(readCollection(POSTS_KEY).source).toBe(source);
    expect(readCollection(USERS_KEY).source).toBe(source);
  });

  it.each([
    [true, false, null, 2],
    [false, true, 1, null],
    [true, true, null, null],
  ])('keeps counts independent for failed posts=%s users=%s', (badPosts, badUsers, postsCount, usersCount) => {
    seed();
    if (badPosts) localStorage.setItem(POSTS_KEY, '{broken');
    if (badUsers) localStorage.setItem(USERS_KEY, '{broken');
    expect(metrics()).toEqual({
      totalPosts: postsCount, registeredUsers: usersCount, publishedPosts: postsCount, drafts: 0,
      postsAvailable: !badPosts, usersAvailable: !badUsers, recentPosts: badPosts ? [] : [post],
    });
    if (badPosts) expect(localStorage.getItem(POSTS_KEY)).toBe('{broken');
    if (badUsers) expect(localStorage.getItem(USERS_KEY)).toBe('{broken');
  });

  it('sorts only five newest with stable ascending ID ties and never mutates input or stored order', () => {
    const posts = [makePost(1), makePost(6), makePost(3), makePost(5), makePost(4), makePost(2), makePost(7)];
    posts[1].createdAt = posts[6].createdAt;
    seed(posts);
    const postsRead = readCollection(POSTS_KEY);
    const usersRead = readCollection(USERS_KEY);
    const before = localStorage.getItem(POSTS_KEY);
    postsRead.value.forEach(Object.freeze);
    Object.freeze(postsRead.value);
    Object.freeze(postsRead);
    Object.freeze(usersRead.value);
    Object.freeze(usersRead);
    const result = adminMetrics(postsRead, usersRead);
    expect(result.recentPosts.map((record) => record.title)).toEqual(['Story 6', 'Story 7', 'Story 5', 'Story 4', 'Story 3']);
    result.recentPosts.pop();
    expect(postsRead.value).toEqual(posts);
    expect(localStorage.getItem(POSTS_KEY)).toBe(before);
    expect(metrics().totalPosts).toBe(7);
  });

  it.each([POSTS_KEY, USERS_KEY])('distinguishes a browser exception for %s from valid zero', (key) => {
    seed();
    const fault = failRead(key);
    const result = metrics();
    expect(result.totalPosts).toBe(key === POSTS_KEY ? null : 1);
    expect(result.registeredUsers).toBe(key === USERS_KEY ? null : 2);
    fault.mockRestore();
    expect(readPosts().value).toEqual([post]);
    expect(readCollection(USERS_KEY).value).toEqual([user, admin]);
  });
});

describe('dashboard rendering and explicit quick actions', () => {
  it('renders exact formulas, known author roles, newest five and no action on render or rerender', () => {
    const posts = [1, 2, 3, 4, 5, 6, 7].map(makePost);
    posts[6] = { ...posts[6], authorId: admin.id, authorName: admin.displayName };
    posts[5] = { ...posts[5], authorId: DEMO_ADMIN.userId, authorName: DEMO_ADMIN.displayName };
    seed(posts);
    const before = localStorage.getItem(POSTS_KEY);
    const confirm = vi.spyOn(window, 'confirm');
    const view = enter();
    expect(screen.getByRole('heading', { name: 'Admin dashboard', exact: true })).toBeVisible();
    expect(screen.getByText(DEMO_MESSAGE)).toBeVisible();
    expect(metric('Total Posts')).toHaveTextContent(/^7$/);
    expect(metric('Registered Users')).toHaveTextContent(/^2$/);
    expect(metric('Published Posts')).toHaveTextContent(/^7$/);
    expect(metric('Drafts')).toHaveTextContent(/^0$/);
    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual(
      ['Story 7', 'Story 6', 'Story 5', 'Story 4', 'Story 3'],
    );
    expect(within(cards[0]).getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    expect(within(cards[1]).getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    expect(within(cards[2]).getByRole('img', { name: 'User avatar' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(5);
    expect(screen.getAllByRole('link', { name: 'Edit' })).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /publish|draft/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Local statistics')).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-4');
    view.rerender(<App />);
    expect(window.location.pathname).toBe('/admin');
    expect(localStorage.getItem(POSTS_KEY)).toBe(before);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    ['Write a post', '/write', 'Write a post'],
    ['All Blogs', '/blogs', 'All Blogs'],
    ['Manage users', '/users', 'Manage users'],
  ])('navigates only when quick action %s is activated', async (label, path, heading) => {
    seed();
    enter();
    const before = localStorage.getItem(POSTS_KEY);
    const action = within(screen.getByRole('navigation', { name: 'Quick actions' })).getByRole('link', { name: label, exact: true });
    expect(action).toHaveAttribute('href', path);
    expect(window.location.pathname).toBe('/admin');
    expect(localStorage.getItem(POSTS_KEY)).toBe(before);
    await userEvent.click(action);
    expect(window.location.pathname).toBe(path);
    expect(await screen.findByRole('heading', { name: heading, exact: true })).toBeVisible();
    expect(localStorage.getItem(POSTS_KEY)).toBe(before);
  });

  it('shows verified missing zeros and clear recent empty copy without creating collections', () => {
    expect(login('admin', 'admin').ok).toBe(true);
    enter();
    for (const label of ['Total Posts', 'Registered Users', 'Published Posts', 'Drafts']) {
      expect(metric(label)).toHaveTextContent(/^0$/);
    }
    expect(screen.getByText('No posts yet — check back soon!')).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText(STORAGE_WARNING)).not.toBeInTheDocument();
    expect(localStorage.getItem(POSTS_KEY)).toBeNull();
    expect(localStorage.getItem(USERS_KEY)).toBeNull();
  });

  it.each([
    [true, false, 'Unavailable', '2', 0, 1],
    [false, true, '1', 'Unavailable', 1, 1],
    [true, true, 'Unavailable', 'Unavailable', 0, 2],
  ])('shows independent corrupt states posts=%s users=%s without verified zero or repairs',
    (badPosts, badUsers, postCount, userCount, cards, warnings) => {
      seed();
      if (badPosts) localStorage.setItem(POSTS_KEY, '{broken');
      if (badUsers) localStorage.setItem(USERS_KEY, '{broken');
      enter();
      expect(metric('Total Posts').textContent).toBe(postCount);
      expect(metric('Published Posts').textContent).toBe(postCount);
      expect(metric('Registered Users').textContent).toBe(userCount);
      expect(metric('Drafts')).toHaveTextContent(/^0$/);
      expect(screen.queryAllByRole('article')).toHaveLength(cards);
      expect(screen.getAllByText(STORAGE_WARNING)).toHaveLength(warnings);
      expect(screen.queryByText('No posts yet — check back soon!')).not.toBeInTheDocument();
      if (badPosts) {
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
        expect(localStorage.getItem(POSTS_KEY)).toBe('{broken');
      }
      if (badUsers) expect(localStorage.getItem(USERS_KEY)).toBe('{broken');
    },
  );

  it('defaults unknown roles on corrupt users without hiding readable posts or synthetic admin controls', () => {
    const synthetic = { ...makePost(2), authorId: DEMO_ADMIN.userId, authorName: 'Admin' };
    seed([post, synthetic], [{ ...user, role: 'admin' }]);
    localStorage.setItem(USERS_KEY, JSON.stringify([{ ...user, role: 'unknown' }]));
    enter();
    const cards = screen.getAllByRole('article');
    expect(within(cards[0]).getByRole('img', { name: 'User avatar' })).toBeVisible();
    expect(within(cards[1]).getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Delete' }).every((button) => !button.disabled)).toBe(true);
    expect(metric('Registered Users')).toHaveTextContent('Unavailable');
    expect(metric('Total Posts')).toHaveTextContent(/^2$/);
    expect(readPosts().value).toEqual([post, synthetic]);
  });

  it.each([POSTS_KEY, USERS_KEY])('renders a warning for thrown %s reads with other counts usable', (key) => {
    seed();
    const fault = failRead(key);
    enter();
    expect(screen.getByText(STORAGE_WARNING)).toBeVisible();
    expect(metric('Total Posts').textContent).toBe(key === POSTS_KEY ? 'Unavailable' : '1');
    expect(metric('Registered Users').textContent).toBe(key === USERS_KEY ? 'Unavailable' : '2');
    fault.mockRestore();
    expect(readPosts().value).toEqual([post]);
  });
});

describe('dashboard deletion and admin boundaries via App', () => {
  it.each([DEMO_ADMIN, sessionForUser(admin)])('allows validated admin %j to delete another author and navigate only after persistence', async (identity) => {
    seed([post], [user, admin], identity);
    enter();
    // A later real storage write must survive the service's fresh read.
    const newer = makePost(20);
    localStorage.setItem(POSTS_KEY, JSON.stringify([post, newer]));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
    expect(window.location.pathname).toBe('/blogs');
    expect(readPosts().value).toEqual([newer]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(readCollection(USERS_KEY).value).toEqual([user, admin]);
    expect(getSession().value).toEqual(identity);
  });

  it('keeps route, counts, preview and durable data on declined confirmation', async () => {
    seed();
    enter();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.location.pathname).toBe('/admin');
    expect(screen.getByRole('article')).toBeVisible();
    expect(metric('Total Posts')).toHaveTextContent(/^1$/);
    expect(readPosts().value).toEqual([post]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps readable posts usable for the fixed admin when registered users are corrupt', async () => {
    seed();
    localStorage.setItem(USERS_KEY, '{broken');
    enter();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.location.pathname).toBe('/blogs');
    expect(readPosts().value).toEqual([]);
    expect(localStorage.getItem(USERS_KEY)).toBe('{broken');
    expect(getSession().value).toEqual(DEMO_ADMIN);
  });

  it('keeps a transient failed-read warning and blocks controls even when the follow-up reads succeed', async () => {
    seed();
    enter();
    const confirm = vi.spyOn(window, 'confirm');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.location.pathname).toBe('/admin');
    expect(screen.getByText(STORAGE_WARNING)).toBeVisible();
    expect(screen.getByRole('article')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(metric('Total Posts')).toHaveTextContent(/^1$/);
    expect(metric('Registered Users')).toHaveTextContent(/^2$/);
    expect(readPosts().value).toEqual([post]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['QuotaExceededError', 'SecurityError'])('preserves view and durable data on confirmed %s write failure', async (name) => {
    seed();
    enter();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', name); });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.location.pathname).toBe('/admin');
    expect(screen.getByRole('article')).toBeVisible();
    expect(metric('Total Posts')).toHaveTextContent(/^1$/);
    expect(screen.getByRole('alert')).toHaveTextContent('Post could not be deleted. Nothing was saved.');
    expect(readPosts().value).toEqual([post]);
  });

  it('retains the preview but marks failed fresh posts unavailable and removes mutations', async () => {
    seed();
    enter();
    const confirm = vi.spyOn(window, 'confirm');
    const fault = failRead(POSTS_KEY);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.location.pathname).toBe('/admin');
    expect(screen.getByRole('article')).toBeVisible();
    expect(metric('Total Posts')).toHaveTextContent('Unavailable');
    expect(metric('Registered Users')).toHaveTextContent(/^2$/);
    expect(screen.getByText(STORAGE_WARNING)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    fault.mockRestore();
    expect(readPosts().value).toEqual([post]);
  });

  it('denies a fresh unreadable registered admin identity without discarding the post snapshot', async () => {
    seed([post], [user, admin], sessionForUser(admin));
    enter();
    const fault = failRead(USERS_KEY);
    const confirm = vi.spyOn(window, 'confirm');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.location.pathname).toBe('/admin');
    expect(screen.getByRole('article')).toBeVisible();
    expect(metric('Total Posts')).toHaveTextContent(/^1$/);
    expect(metric('Registered Users')).toHaveTextContent('Unavailable');
    expect(screen.getAllByText(STORAGE_WARNING).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    fault.mockRestore();
    expect(readPosts().value).toEqual([post]);
    expect(getSession().value).toEqual(sessionForUser(admin));
  });

  it.each(['userId', 'username', 'displayName', 'role'])('rejects a changed active admin %s before confirmation', async (field) => {
    seed();
    enter();
    const replacement = field === 'userId' ? sessionForUser(admin) : { ...DEMO_ADMIN, [field]: 'changed' };
    localStorage.setItem(SESSION_KEY, JSON.stringify(replacement));
    const confirm = vi.spyOn(window, 'confirm');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.location.pathname).toBe('/admin');
    expect(screen.getByRole('article')).toBeVisible();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(readPosts().value).toEqual([post]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('shows a missing-target error without navigation or deleting other data', async () => {
    seed();
    enter();
    localStorage.setItem(POSTS_KEY, '[]');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.location.pathname).toBe('/admin');
    expect(screen.getByRole('alert')).toHaveTextContent('Post not found');
    expect(screen.getByRole('article')).toBeVisible();
    expect(readPosts().value).toEqual([]);
  });

  it.each([
    ['guest', null, '/login', 'Sign in'],
    ['ordinary user', session, '/blogs', 'All Blogs'],
    ['forged registered admin', { ...session, role: 'admin' }, '/login', 'Sign in'],
  ])('guards direct admin entry for %s without dashboard controls or post mutations', async (name, identity, path, heading) => {
    seed([post], [user, admin], identity);
    enter();
    expect(await screen.findByRole('heading', { name: heading, exact: true })).toBeVisible();
    expect(window.location.pathname).toBe(path);
    expect(screen.queryByRole('heading', { name: 'Admin dashboard' })).not.toBeInTheDocument();
    expect(readPosts().value).toEqual([post]);
    if (name === 'ordinary user') expect(getSession().value).toEqual(session);
    else expect(getSession().value).toBeNull();
  });
});
