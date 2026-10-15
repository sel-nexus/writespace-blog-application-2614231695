/** Exercise effect-time bootstrap with real route views, StrictMode, and browser storage. */
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';
import {
  DEMO_ADMIN, INITIALIZATION_KEY, POSTS_KEY, USERS_KEY, SESSION_KEY, readCollection,
} from '../src/utils/storage.js';
import { post, user, session } from './fixtures.js';

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
    expect(screen.getByRole('status')).toHaveTextContent('Local post initialization could not be completed. Post changes are disabled.');
    if (key === POSTS_KEY) expect(screen.getAllByRole('alert')).toHaveLength(1);
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
    expect(screen.getByRole('status', { name: 'Local post initialization' })).toHaveTextContent('Post changes are disabled');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    for (const input of screen.getAllByRole('textbox')) expect(input).toBeDisabled();
    const storageBeforeSubmit = { ...localStorage };
    await userEvent.setup().click(save);
    fireEvent.submit(save.closest('form'));
    expect({ ...localStorage }).toEqual(storageBeforeSubmit);
    expect(localStorage.getItem(POSTS_KEY)).toBe(before);
  });

  it.each(['/write', '/edit/' + post.id].flatMap((path) => [
    'corrupt-marker', 'marker-quota', 'post-quota', 'initialized-read-failure',
  ].map((failure) => [path, failure])))(
    'retains disabled editor and blocks submissions at %s after %s', async (path, failure) => {
      store(SESSION_KEY, DEMO_ADMIN);
      if (failure !== 'post-quota') store(POSTS_KEY, [post]);
      if (failure === 'corrupt-marker') localStorage.setItem(INITIALIZATION_KEY, '{bad');
      if (failure === 'marker-quota') denyMarker();
      if (failure === 'post-quota') {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new DOMException('', 'QuotaExceededError');
        });
      }
      if (failure === 'initialized-read-failure') {
        store(INITIALIZATION_KEY, marker);
        const getItem = Storage.prototype.getItem;
        let failed = false;
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
          if (key === POSTS_KEY && !failed) {
            failed = true;
            throw new DOMException('', 'SecurityError');
          }
          return getItem.call(this, key);
        });
      }
      const before = { ...localStorage };
      window.history.replaceState({}, '', path);
      mountApp();
      expect(screen.getByRole('status', { name: 'Local post initialization' })).toHaveTextContent(
        'Local post initialization could not be completed. Post changes are disabled.',
      );
      const save = screen.queryByRole('button', { name: 'Save' });
      // An absent edit target still presents Post not found, rather than inventing a form.
      if (failure === 'post-quota' && path.startsWith('/edit/')) {
        expect(screen.getByRole('heading', { name: 'Post not found' })).toBeInTheDocument();
        expect(save).not.toBeInTheDocument();
      } else {
        expect(save).toBeDisabled();
        for (const input of screen.getAllByRole('textbox')) expect(input).toBeDisabled();
        await userEvent.setup().click(save);
        fireEvent.submit(save.closest('form'));
      }
      expect(window.location.pathname).toBe(path);
      expect({ ...localStorage }).toEqual(before);
    },
  );

  it.each([
    ['admin', 'admin', DEMO_ADMIN, '/admin'],
    [user.username, user.password, session, '/blogs'],
  ])('allows validated login and logout for %s despite a corrupt marker', async (username, password, identity, destination) => {
    localStorage.setItem(INITIALIZATION_KEY, '{bad');
    store(USERS_KEY, [user]);
    const rawPosts = ` ${JSON.stringify([post])} `;
    localStorage.setItem(POSTS_KEY, rawPosts);
    const before = { ...localStorage };
    window.history.replaceState({}, '', '/login');
    mountApp();
    const actor = userEvent.setup();
    const submit = screen.getByRole('button', { name: 'Sign in' });
    expect(submit).not.toBeDisabled();
    fireEvent.submit(submit.closest('form'));
    expect(screen.getByLabelText('Username', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect({ ...localStorage }).toEqual(before);
    await actor.type(screen.getByLabelText('Username', { exact: true }), username);
    await actor.type(screen.getByLabelText('Password', { exact: true }), password);
    fireEvent.submit(submit.closest('form'));
    expect(window.location.pathname).toBe(destination);
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(identity);
    for (const button of screen.getAllByRole('button', { name: /delete/i })) expect(button).toBeDisabled();
    expect(screen.getAllByRole('status', { name: 'Local post initialization' })).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Logout' }));
    expect(window.location.pathname).toBe('/');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(primaryLink('Login')).toBeInTheDocument();
    expect({ ...localStorage }).toEqual(before);
    expect(localStorage.getItem(POSTS_KEY)).toBe(rawPosts);
  });

  it('allows registration validation and persist-first sign-in while post changes remain disabled', async () => {
    localStorage.setItem(INITIALIZATION_KEY, '{bad');
    store(USERS_KEY, [user]);
    const rawPosts = ` ${JSON.stringify([post])} `;
    localStorage.setItem(POSTS_KEY, rawPosts);
    const before = { ...localStorage };
    window.history.replaceState({}, '', '/register');
    mountApp();
    const actor = userEvent.setup();
    const submit = screen.getByRole('button', { name: 'Create account' });
    expect(submit).not.toBeDisabled();
    fireEvent.submit(submit.closest('form'));
    expect(screen.getByLabelText('Display name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect({ ...localStorage }).toEqual(before);
    for (const [label, value] of [['Display name', 'New Writer'], ['Username', 'new'], ['Password', 'exact'], ['Confirm password', 'exact']]) {
      await actor.type(screen.getByLabelText(label, { exact: true }), value);
    }
    fireEvent.submit(submit.closest('form'));
    expect(window.location.pathname).toBe('/blogs');
    const accounts = readCollection(USERS_KEY).value;
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toEqual(user);
    expect(accounts[1]).toMatchObject({ displayName: 'New Writer', username: 'new', password: 'exact', role: 'user' });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual({
      userId: accounts[1].id, username: 'new', displayName: 'New Writer', role: 'user',
    });
    await actor.click(primaryLink('Write Blog'));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    const afterRegistration = { ...localStorage };
    fireEvent.submit(save.closest('form'));
    expect({ ...localStorage }).toEqual(afterRegistration);
    expect(localStorage.getItem(POSTS_KEY)).toBe(rawPosts);
    expect(localStorage.getItem(INITIALIZATION_KEY)).toBe('{bad');
  });

  it('keeps dashboard links usable and permits account creation and deletion despite a corrupt marker', async () => {
    localStorage.setItem(INITIALIZATION_KEY, '{bad');
    store(USERS_KEY, [user]);
    store(SESSION_KEY, DEMO_ADMIN);
    const rawPosts = ` ${JSON.stringify([post])} `;
    localStorage.setItem(POSTS_KEY, rawPosts);
    window.history.replaceState({}, '', '/admin');
    mountApp();
    const actor = userEvent.setup();
    for (const button of screen.getAllByRole('button', { name: /delete/i })) expect(button).toBeDisabled();
    const manageUsers = within(screen.getByRole('main')).getByRole('link', { name: /manage users/i });
    expect(manageUsers).toHaveAttribute('href', '/users');
    // HTML fieldsets disable form controls, not anchors; dispatch the native link click.
    fireEvent.click(manageUsers);
    expect(window.location.pathname).toBe('/users');
    const submit = screen.getByRole('button', { name: 'Create account', exact: true });
    expect(submit).not.toBeDisabled();
    for (const [label, value] of [['Display name', 'New Writer'], ['Username', 'new'], ['Password', 'exact']]) {
      const input = screen.getByLabelText(label, { exact: true });
      expect(input).not.toBeDisabled();
      await actor.type(input, value);
    }
    await actor.selectOptions(screen.getByLabelText('Role', { exact: true }), 'admin');
    fireEvent.submit(submit.closest('form'));
    expect(readCollection(USERS_KEY).value.at(-1)).toMatchObject({ username: 'new', role: 'admin' });
    expect(screen.getByLabelText('Username', { exact: true })).toHaveValue('');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const accounts = within(screen.getByRole('table', { name: 'Accounts' }));
    const remove = accounts.getByRole('button', { name: 'Delete new', exact: true });
    expect(remove).not.toBeDisabled();
    await actor.click(remove);
    expect(confirm).toHaveBeenCalledOnce();
    expect(readCollection(USERS_KEY).value).toEqual([user]);
    expect(accounts.queryByRole('button', { name: 'Delete new', exact: true })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(DEMO_ADMIN);
    expect(window.location.pathname).toBe('/users');
    expect(screen.getAllByRole('status', { name: 'Local post initialization' })).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem(POSTS_KEY)).toBe(rawPosts);
    expect(localStorage.getItem(INITIALIZATION_KEY)).toBe('{bad');
  });

  it.each([
    ['/login', SESSION_KEY, 'Sign in', 'Sign-in could not be saved'],
    ['/register', USERS_KEY, 'Create account', 'Account could not be saved'],
    ['/users', USERS_KEY, 'Create account', 'Account could not be created'],
  ])('reports its own denied storage write at %s instead of silently blocking submission', async (path, failedKey, label, message) => {
    localStorage.setItem(INITIALIZATION_KEY, '{bad');
    store(USERS_KEY, [user]);
    store(POSTS_KEY, [post]);
    if (path === '/users') store(SESSION_KEY, DEMO_ADMIN);
    const before = { ...localStorage };
    const setItem = Storage.prototype.setItem;
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === failedKey) throw new DOMException('', 'SecurityError');
      setItem.call(this, key, value);
    });
    window.history.replaceState({}, '', path);
    mountApp();
    const actor = userEvent.setup();
    for (const [field, value] of [['Display name', 'New Writer'], ['Username', path === '/login' ? user.username : 'new'], ['Password', path === '/login' ? user.password : 'exact'], ['Confirm password', 'exact']]) {
      const input = screen.queryByLabelText(field, { exact: true });
      if (input) await actor.type(input, value);
    }
    const submit = screen.getByRole('button', { name: label, exact: true });
    expect(submit).not.toBeDisabled();
    fireEvent.submit(submit.closest('form'));
    expect(writes).toHaveBeenCalledWith(failedKey, expect.any(String));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getAllByRole('status', { name: 'Local post initialization' })).toHaveLength(1);
    expect(screen.getByLabelText('Username', { exact: true })).toHaveValue(path === '/login' ? user.username : 'new');
    expect(window.location.pathname).toBe(path);
    expect({ ...localStorage }).toEqual(before);
  });

  it('reports denied logout removal and allows explicit retry despite a corrupt marker', async () => {
    localStorage.setItem(INITIALIZATION_KEY, '{bad');
    store(USERS_KEY, [user]);
    store(POSTS_KEY, [post]);
    store(SESSION_KEY, session);
    const before = { ...localStorage };
    window.history.replaceState({}, '', '/blogs');
    mountApp();
    const removal = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('', 'SecurityError');
    });
    const actor = userEvent.setup();
    await actor.click(screen.getByRole('button', { name: 'Logout' }));
    expect(removal).toHaveBeenCalledWith(SESSION_KEY);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Logout could not be saved. Your local session has not been cleared.');
    expect(window.location.pathname).toBe('/blogs');
    expect({ ...localStorage }).toEqual(before);
    removal.mockRestore();
    await actor.click(screen.getByRole('button', { name: 'Logout' }));
    expect(window.location.pathname).toBe('/');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(POSTS_KEY)).toBe(before[POSTS_KEY]);
    expect(localStorage.getItem(USERS_KEY)).toBe(before[USERS_KEY]);
    expect(localStorage.getItem(INITIALIZATION_KEY)).toBe('{bad');
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
