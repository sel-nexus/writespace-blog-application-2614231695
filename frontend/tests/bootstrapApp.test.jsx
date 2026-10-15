/** Exercise effect-time bootstrap with real route views, StrictMode, and browser storage. */
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';
import {
  DEMO_ADMIN, INITIALIZATION_KEY, POSTS_KEY, USERS_KEY, SESSION_KEY, readCollection,
} from '../src/utils/storage.js';
import { post } from './fixtures.js';

const marker = { version: 1, initialized: true };

/** Render the production shell under React's repeated development effects. */
function mountApp() {
  return render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

/** Persist a pre-existing local record without mocking the application. */
function store(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Deny only marker writes while preserving genuine post persistence. */
function denyMarker() {
  const setItem = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key === INITIALIZATION_KEY) throw new DOMException('', 'QuotaExceededError');
    setItem.call(this, key, value);
  });
}

/** Read the primary navigation separately from duplicate footer links. */
function primaryLink(name) {
  return within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name });
}

describe('startup discovery shell', () => {
  it('performs storage writes only after the loading view commits, not during render', () => {
    const setItem = Storage.prototype.setItem;
    const committedStates = [];
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === POSTS_KEY || key === INITIALIZATION_KEY) {
        committedStates.push(document.getElementById('main-content')?.textContent);
      }
      setItem.call(this, key, value);
    });
    mountApp();
    expect(committedStates).toEqual(['Loading local posts…', 'Loading local posts…']);
    expect(readCollection(POSTS_KEY).value.length).toBeGreaterThan(0);
  });

  it.each([POSTS_KEY, INITIALIZATION_KEY])('does not automatically retry a transient %s write failure in StrictMode', async (failedKey) => {
    const setItem = Storage.prototype.setItem;
    let failures = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === failedKey && failures === 0) {
        failures += 1;
        throw new DOMException('', 'QuotaExceededError');
      }
      setItem.call(this, key, value);
    });
    mountApp();
    expect(screen.getByText(/Local post initialization could not be completed/)).toBeInTheDocument();
    expect(localStorage.getItem(INITIALIZATION_KEY)).toBeNull();
    if (failedKey === POSTS_KEY) expect(localStorage.getItem(POSTS_KEY)).toBeNull();
    else expect(readCollection(POSTS_KEY).value.length).toBeGreaterThan(0);
    const before = { ...localStorage };
    await userEvent.setup().click(primaryLink('Login'));
    expect({ ...localStorage }).toEqual(before);
    cleanup();
    mountApp();
    expect(JSON.parse(localStorage.getItem(INITIALIZATION_KEY))).toEqual(marker);
    expect(screen.queryByText(/Local post initialization could not be completed/)).not.toBeInTheDocument();
  });

  it('seeds before previews mount, displays real persisted authors and never duplicates on rerender/remount', async () => {
    const { rerender, unmount } = mountApp();
    const stored = readCollection(POSTS_KEY);
    expect(stored.ok).toBe(true);
    expect(stored.value.length).toBeGreaterThan(0);
    for (const record of stored.value) {
      expect(await screen.findByRole('link', { name: record.title })).toBeInTheDocument();
    }
    expect(screen.getAllByText(DEMO_ADMIN.displayName).length).toBeGreaterThan(0);
    expect(screen.queryByText('No posts yet — check back soon!')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem(USERS_KEY)).toBeNull();
    const before = { ...localStorage };
    rerender(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect({ ...localStorage }).toEqual(before);
    unmount();
    mountApp();
    expect({ ...localStorage }).toEqual(before);
    expect(readCollection(POSTS_KEY).value).toEqual(stored.value);
  });

  it.each([null, []])('preserves initialized missing/empty data and exact empty copy: %j', (posts) => {
    store(INITIALIZATION_KEY, marker);
    if (posts !== null) store(POSTS_KEY, posts);
    const before = { ...localStorage };
    mountApp();
    expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
    expect({ ...localStorage }).toEqual(before);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([{ posts: [] }, { posts: [post] }])('preserves stored data without marker and finalizes only completion: %j', ({ posts }) => {
    store(POSTS_KEY, posts);
    const raw = localStorage.getItem(POSTS_KEY);
    mountApp();
    expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
    expect(JSON.parse(localStorage.getItem(INITIALIZATION_KEY))).toEqual(marker);
    if (posts.length) expect(screen.getByRole('link', { name: post.title })).toBeInTheDocument();
    else expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
  });

  it.each(['/missing', '/blog/a/extra', '/edit/a/extra'])('unknown route %s cannot seed or invalidate a session', async (path) => {
    localStorage.setItem(SESSION_KEY, '{broken');
    const before = { ...localStorage };
    window.history.replaceState({}, '', path);
    mountApp();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect({ ...localStorage }).toEqual(before);
    await userEvent.setup().click(screen.getByRole('link', { name: 'Back to Home' }));
    expect(readCollection(POSTS_KEY).value.length).toBeGreaterThan(0);
    expect(localStorage.getItem(INITIALIZATION_KEY)).not.toBeNull();
  });

  it.each([
    [INITIALIZATION_KEY, '{broken'], [INITIALIZATION_KEY, '{"version":2,"initialized":true}'],
    [POSTS_KEY, '{broken'], [POSTS_KEY, '{}'], [POSTS_KEY, '[{}]'],
  ])('shows warning and preserves malformed storage %s/%s', (key, raw) => {
    localStorage.setItem(key, raw);
    const before = { ...localStorage };
    mountApp();
    expect(screen.getByText(/Local post initialization could not be completed/)).toBeInTheDocument();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect({ ...localStorage }).toEqual(before);
  });

  it('shows storage warnings when the storage getter is denied, without crashing', () => {
    const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('', 'SecurityError');
    });
    mountApp();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Post changes are disabled/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    getter.mockRestore();
    expect(localStorage.length).toBe(0);
  });

  it('never displays unsaved starter records after post quota failure', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('', 'QuotaExceededError');
    });
    mountApp();
    expect(screen.getByText(/Starter posts were not saved/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Welcome to WriteSpace' })).not.toBeInTheDocument();
    expect(localStorage.getItem(POSTS_KEY)).toBeNull();
    expect(localStorage.getItem(INITIALIZATION_KEY)).toBeNull();
  });

  it('preserves sample reads on marker failure and completes on the next remount without duplicates', () => {
    const failure = denyMarker();
    mountApp();
    const posts = readCollection(POSTS_KEY).value;
    expect(posts.length).toBeGreaterThan(0);
    for (const record of posts) expect(screen.getByRole('link', { name: record.title })).toBeInTheDocument();
    expect(screen.getByText(/Saved posts remain available/)).toBeInTheDocument();
    expect(localStorage.getItem(INITIALIZATION_KEY)).toBeNull();
    cleanup();
    failure.mockRestore();
    mountApp();
    expect(readCollection(POSTS_KEY).value).toEqual(posts);
    expect(JSON.parse(localStorage.getItem(INITIALIZATION_KEY))).toEqual(marker);
    expect(screen.queryByText(/Local post initialization/)).not.toBeInTheDocument();
  });
});

describe('uncertain initialization mutation safety', () => {
  it.each(['/blogs', '/blog/' + post.id, '/admin'])('retains readable posts and disables delete controls at %s', async (path) => {
    store(SESSION_KEY, DEMO_ADMIN);
    store(POSTS_KEY, [{ ...post, authorId: DEMO_ADMIN.userId, authorName: DEMO_ADMIN.displayName }]);
    const before = localStorage.getItem(POSTS_KEY);
    denyMarker();
    window.history.replaceState({}, '', path);
    mountApp();
    expect(await screen.findByRole('heading', { name: post.title })).toBeInTheDocument();
    const deletes = screen.getAllByRole('button', { name: /delete/i });
    expect(deletes.length).toBeGreaterThan(0);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    for (const button of deletes) {
      expect(button).toBeDisabled();
      await userEvent.setup().click(button);
    }
    expect(confirm).not.toHaveBeenCalled();
    expect(localStorage.getItem(POSTS_KEY)).toBe(before);
    await userEvent.setup().click(primaryLink('Write Blog'));
    expect(screen.getByRole('status')).toHaveTextContent('Post changes are disabled');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(localStorage.getItem(POSTS_KEY)).toBe(before);
  });

  it.each(['/write', '/edit/' + post.id])('does not mount editor for uncertain marker at %s', (path) => {
    store(SESSION_KEY, DEMO_ADMIN);
    store(POSTS_KEY, [post]);
    localStorage.setItem(INITIALIZATION_KEY, '{bad');
    const before = { ...localStorage };
    window.history.replaceState({}, '', path);
    mountApp();
    expect(screen.getByRole('status')).toHaveTextContent('Post changes are disabled');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect({ ...localStorage }).toEqual(before);
  });

  it('allows normal editor controls after successful initialization', () => {
    store(SESSION_KEY, DEMO_ADMIN);
    window.history.replaceState({}, '', '/write');
    mountApp();
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
    for (const input of screen.getAllByRole('textbox')) expect(input).not.toBeDisabled();
    expect(screen.queryByText(/Post changes are disabled/)).not.toBeInTheDocument();
  });
});
