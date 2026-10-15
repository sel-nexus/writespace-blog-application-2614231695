/** Verify real local auth mutations, accessible forms, guards and shell transitions. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../src/App.jsx';
import Login from '../src/pages/Login.jsx';
import Register from '../src/pages/Register.jsx';
import { AccountForm } from '../src/components/AccountForm.jsx';
import { ProtectedRoute } from '../src/components/ProtectedRoute.jsx';
import { DEMO_MESSAGE, STORAGE_WARNING } from '../src/components/Notice.jsx';
import {
  ACCOUNT_SIGN_IN_INCOMPLETE, getSession, INVALID_CREDENTIALS, login, logout,
  register, sessionForUser, SIGN_IN_UNSAVED,
} from '../src/utils/auth.js';
import { DEMO_ADMIN, INITIALIZATION_KEY, POSTS_KEY, readCollection, SESSION_KEY, USERS_KEY, writeValue } from '../src/utils/storage.js';
import { session, user } from './fixtures.js';

const registration = { displayName: ' Robin Writer ', username: ' ROBIN ', password: ' demo ', confirmPassword: ' demo ' };

/**
 * Seed exact browser-local fixtures without replacing application services.
 * Args:
 *   users: Valid accounts.
 *   identity: Optional session to persist.
 * Returns:
 *   Nothing; subsequent assertions re-read actual storage.
 */
function seed(users = [user], identity) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  if (identity) localStorage.setItem(SESSION_KEY, JSON.stringify(identity));
}

/**
 * Simulate an exception at a chosen browser write boundary only.
 * Args:
 *   key: Key whose setItem operation should fail.
 *   name: Browser exception name.
 * Returns:
 *   Spy that can be restored before a later explicit retry.
 */
function failWrite(key, name = 'QuotaExceededError') {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(storageKey, value) {
    if (storageKey === key) throw new DOMException('Blocked', name);
    original.call(this, storageKey, value);
  });
}

/**
 * Render real forms/guards with destination content isolated from future slices.
 * Args:
 *   element: Identity component to render at the root path.
 * Returns:
 *   Testing Library render result.
 */
function renderRoute(element) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={element} />
        <Route path="/login" element={<h1>Login destination</h1>} />
        <Route path="/blogs" element={<h1>Blogs destination</h1>} />
        <Route path="/admin" element={<h1>Admin destination</h1>} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Fill the actual labelled registration form through user interactions.
 * Args:
 *   actor: User-event controller.
 *   values: Account input fields.
 * Returns:
 *   Promise resolved after every field has been entered.
 */
async function fillAccount(actor, values = registration) {
  for (const [label, field] of [
    ['Display name', 'displayName'], ['Username', 'username'], ['Password', 'password'], ['Confirm password', 'confirmPassword'],
  ]) {
    await actor.type(screen.getByLabelText(label, { exact: true }), values[field]);
  }
}

/**
 * Fill and submit the actual login form through user interactions.
 * Args:
 *   actor: User-event controller.
 *   username: Exact typed username.
 *   password: Exact typed password.
 * Returns:
 *   Promise resolved after submission.
 */
async function submitLogin(actor, username = 'admin', password = 'admin') {
  await actor.type(screen.getByLabelText('Username', { exact: true }), username);
  await actor.type(screen.getByLabelText('Password', { exact: true }), password);
  await actor.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('auth services and durable outcomes', () => {
  it('projects only session fields and resolves a stored registered identity', () => {
    expect(sessionForUser(user)).toEqual(session);
    seed([user], session);
    expect(getSession()).toEqual({ ok: true, value: session });
    expect(getSession().value).not.toHaveProperty('password');
  });

  it('checks normalized admin/admin before corrupt registered data and persists the exact fixed session', () => {
    localStorage.setItem(USERS_KEY, '{broken');
    expect(login(' ADMIN ', 'admin')).toEqual({ ok: true, session: DEMO_ADMIN, redirect: '/admin' });
    expect(getSession()).toEqual({ ok: true, value: DEMO_ADMIN });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(DEMO_ADMIN);
    expect(localStorage.getItem(USERS_KEY)).toBe('{broken');
  });

  it('admin login does not require registered storage to be readable', () => {
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (key === USERS_KEY) throw new DOMException('', 'SecurityError');
      return original.call(this, key);
    });
    expect(login('admin', 'admin').ok).toBe(true);
    expect(getSession().value).toEqual(DEMO_ADMIN);
  });

  it.each(['user', 'admin'])('routes a registered %s to role home and preserves exact meaningful password spaces', (role) => {
    const account = { ...user, username: 'JaMiE', password: ' demo ', role };
    seed([account]);
    const result = login(' JAMIE ', ' demo ');
    expect(result).toEqual({ ok: true, session: sessionForUser(account), redirect: role === 'admin' ? '/admin' : '/blogs' });
    expect(getSession().value).toEqual(sessionForUser(account));
    expect(readCollection(USERS_KEY).value).toEqual([account]);
  });

  it.each([['jamie', 'wrong'], ['missing', 'demo-only'], ['admin', ' admin '], ['jamie', 'demo-only ']])(
    'rejects incorrect exact credentials %s/%s without any mutation', (username, password) => {
      seed();
      expect(login(username, password)).toEqual({ ok: false, code: 'invalid-credentials', message: INVALID_CREDENTIALS });
      expect(getSession().value).toBeNull();
      expect(readCollection(USERS_KEY).value).toEqual([user]);
    },
  );

  it.each([undefined, null, 0, false, {}, [], '', ' \t '].map((value) => [value]))(
    'validates invalid credential types/values %j before writes', (value) => {
    expect(login(value, 'password').errors).toHaveProperty('username');
    expect(login('username', value).errors).toHaveProperty('password');
    expect(localStorage.length).toBe(0);
  });

  it.each(['{broken', '{}', JSON.stringify([{ ...user, role: 'owner' }])])(
    'distinguishes unreadable account data %s from invalid credentials and preserves raw', (raw) => {
      localStorage.setItem(USERS_KEY, raw);
      expect(login('jamie', 'demo-only').message).toBe(STORAGE_WARNING);
      expect(register(registration).message).toBe(STORAGE_WARNING);
      expect(localStorage.getItem(USERS_KEY)).toBe(raw);
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    },
  );

  it('returns explicit storage read failures without writes', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('', 'SecurityError'); });
    expect(login('jamie', 'demo-only')).toMatchObject({ ok: false, code: 'storage-unavailable', message: STORAGE_WARNING });
    expect(register(registration)).toMatchObject({ ok: false, code: 'storage-unavailable', message: STORAGE_WARNING });
    expect(getSession()).toEqual({ ok: false, value: null, code: 'storage-unavailable' });
    spy.mockRestore();
    expect(localStorage.length).toBe(0);
  });

  it.each(['QuotaExceededError', 'SecurityError'])('does not sign in on %s and preserves previous durable session', (name) => {
    seed([user], session);
    failWrite(SESSION_KEY, name);
    expect(login('admin', 'admin')).toEqual({
      ok: false, code: name === 'QuotaExceededError' ? 'quota-exceeded' : 'storage-unavailable', message: SIGN_IN_UNSAVED,
    });
    expect(getSession().value).toEqual(session);
  });

  it('returns serialization failure without changing the session', () => {
    seed([user], session);
    const spy = vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new TypeError('Serialization unavailable'); });
    expect(login('admin', 'admin')).toMatchObject({ ok: false, code: 'serialization-failed', message: SIGN_IN_UNSAVED });
    spy.mockRestore();
    expect(getSession().value).toEqual(session);
  });

  it('registers a UUID/time-generated forced user before persisting the matching session', () => {
    seed();
    const before = Date.now();
    const input = { ...registration, role: 'admin', id: 'injected', createdAt: 'injected', userId: 'injected' };
    const result = register(input);
    const rows = readCollection(USERS_KEY);
    expect(rows.ok).toBe(true);
    expect(rows.value).toHaveLength(2);
    const account = rows.value[1];
    expect(account).toMatchObject({ displayName: 'Robin Writer', username: 'robin', password: ' demo ', role: 'user' });
    expect(account.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(account.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(account.createdAt)).toBeLessThanOrEqual(Date.now());
    expect(result).toEqual({ ok: true, session: sessionForUser(account), redirect: '/blogs' });
    expect(getSession().value).toEqual(sessionForUser(account));
    expect(account).not.toHaveProperty('confirmPassword');
    expect(input.role).toBe('admin');
  });

  it.each([undefined, null, {}, { ...registration, confirmPassword: 'mismatch' },
    { ...registration, username: 'ADMIN' }, { ...registration, password: 7 }])(
    'does not create account/session for invalid registration %j', (input) => {
      seed();
      expect(register(input)).toMatchObject({ ok: false, code: 'validation' });
      expect(readCollection(USERS_KEY).value).toEqual([user]);
      expect(getSession().value).toBeNull();
    },
  );

  it('rejects a freshly read normalized duplicate and supports missing users as empty', () => {
    seed();
    expect(register({ ...registration, username: ' JAMIE ' }).errors.username).toBe('Username is already taken.');
    expect(readCollection(USERS_KEY).value).toEqual([user]);
    localStorage.removeItem(USERS_KEY);
    expect(register(registration).ok).toBe(true);
    expect(readCollection(USERS_KEY).value).toHaveLength(1);
    expect(getSession().value.username).toBe('robin');
  });

  it('fails safely if UUID generation is unavailable', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('Unavailable'); });
    expect(register(registration)).toMatchObject({ ok: false, code: 'identity-unavailable' });
    expect(localStorage.length).toBe(0);
  });

  it.each(['QuotaExceededError', 'SecurityError'])('preserves accounts and does not write a session when users write throws %s', (name) => {
    seed();
    failWrite(USERS_KEY, name);
    expect(register(registration)).toMatchObject({ ok: false, code: name === 'QuotaExceededError' ? 'quota-exceeded' : 'storage-unavailable' });
    expect(readCollection(USERS_KEY).value).toEqual([user]);
    expect(getSession().value).toBeNull();
  });

  it('reports a partial account save without rollback or signed-in result, and later login succeeds', () => {
    seed();
    const spy = failWrite(SESSION_KEY);
    expect(register(registration)).toEqual({
      ok: false, code: 'quota-exceeded', accountCreated: true, message: ACCOUNT_SIGN_IN_INCOMPLETE,
    });
    expect(readCollection(USERS_KEY).value.map((account) => account.username)).toEqual(['jamie', 'robin']);
    expect(getSession().value).toBeNull();
    spy.mockRestore();
    expect(login('robin', ' demo ').ok).toBe(true);
    expect(getSession().value.username).toBe('robin');
  });

  it('removes only session on successful logout and is idempotent', () => {
    seed([user], session);
    expect(logout()).toEqual({ ok: true });
    expect(getSession().value).toBeNull();
    expect(readCollection(USERS_KEY).value).toEqual([user]);
    expect(logout()).toEqual({ ok: true });
  });

  it('preserves session after failed logout and still fails closed for stale identity when clearing fails', () => {
    seed([user], session);
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('', 'SecurityError'); });
    expect(logout()).toEqual({ ok: false, code: 'storage-unavailable' });
    expect(getSession().value).toEqual(session);
    localStorage.setItem(USERS_KEY, '[]');
    expect(getSession()).toEqual({ ok: false, value: null, code: 'invalid-shape' });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(session);
    spy.mockRestore();
    expect(getSession().ok).toBe(false);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it.each(['username', 'displayName', 'role'])('invalidates stale registered %s rather than trusting a saved session', (field) => {
    seed([{ ...user, [field]: field === 'role' ? 'admin' : 'changed' }], session);
    expect(getSession()).toEqual({ ok: false, value: null, code: 'invalid-shape' });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it.each(['{broken', '{}', JSON.stringify({ ...session, role: 'owner' })])('clears malformed session %s', (raw) => {
    localStorage.setItem(SESSION_KEY, raw);
    expect(getSession()).toMatchObject({ ok: false, value: null });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe('protected and authenticated routes', () => {
  it('renders children for a fresh ordinary identity without mutating storage', () => {
    seed([user], session);
    renderRoute(<ProtectedRoute><h1>Protected content</h1></ProtectedRoute>);
    expect(screen.getByRole('heading', { name: 'Protected content' })).toBeInTheDocument();
    expect(getSession().value).toEqual(session);
  });

  it.each([null, 'corrupt', 'stale', 'unreadable'])('redirects %s identity to login', (state) => {
    if (state === 'corrupt') localStorage.setItem(SESSION_KEY, '{}');
    if (state === 'stale') seed([], session);
    if (state === 'unreadable') {
      seed([user], session);
      localStorage.setItem(USERS_KEY, '{broken');
    }
    renderRoute(<ProtectedRoute><h1>Protected content</h1></ProtectedRoute>);
    expect(screen.getByRole('heading', { name: 'Login destination' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Protected content' })).not.toBeInTheDocument();
  });

  it('redirects ordinary identity away from admin-only content', () => {
    seed([user], session);
    renderRoute(<ProtectedRoute adminOnly><h1>Protected admin</h1></ProtectedRoute>);
    expect(screen.getByRole('heading', { name: 'Blogs destination' })).toBeInTheDocument();
  });

  it('renders admin-only children for fixed admin even with corrupt users', () => {
    writeValue(SESSION_KEY, DEMO_ADMIN);
    localStorage.setItem(USERS_KEY, '{broken');
    renderRoute(<ProtectedRoute adminOnly><h1>Protected admin</h1></ProtectedRoute>);
    expect(screen.getByRole('heading', { name: 'Protected admin' })).toBeInTheDocument();
  });

  it.each(['login', 'register'])('redirects authenticated visitors of %s to registered admin home', (page) => {
    seed([{ ...user, role: 'admin' }], { ...session, role: 'admin' });
    renderRoute(page === 'login' ? <Login /> : <Register />);
    expect(screen.getByRole('heading', { name: 'Admin destination' })).toBeInTheDocument();
    expect(getSession().value.role).toBe('admin');
  });

  it.each(['login', 'register'])('redirects ordinary authenticated visitors of %s to blogs', (page) => {
    seed([user], session);
    renderRoute(page === 'login' ? <Login /> : <Register />);
    expect(screen.getByRole('heading', { name: 'Blogs destination' })).toBeInTheDocument();
  });
});

describe('identity forms and shell interactions', () => {
  it('renders login demo notice, validates required fields and shows exact invalid credentials without actions on render', async () => {
    const actor = userEvent.setup();
    renderRoute(<Login />);
    expect(screen.getByRole('note')).toHaveTextContent(DEMO_MESSAGE);
    expect(localStorage.length).toBe(0);
    await actor.click(screen.getByRole('button', { name: 'Sign in' }));
    for (const field of ['Username', 'Password']) {
      const input = screen.getByLabelText(field, { exact: true });
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('required');
      expect(document.getElementById(input.getAttribute('aria-describedby'))).toHaveAttribute('role', 'alert');
    }
    await submitLogin(actor, 'missing', 'wrong');
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    expect(getSession().value).toBeNull();
  });

  it('signs in through the shell, updates role navbar immediately, logs out home and can sign in again', async () => {
    const actor = userEvent.setup();
    window.history.replaceState({}, '', '/login');
    render(<App />);
    await submitLogin(actor);
    expect(window.location.pathname).toBe('/admin');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByText('Admin')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(getSession().value).toEqual(DEMO_ADMIN);
    await actor.click(screen.getByRole('button', { name: 'Logout' }));
    expect(window.location.pathname).toBe('/');
    expect(getSession().value).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Login' })).toBeInTheDocument();
    await actor.click(within(nav).getByRole('link', { name: 'Login' }));
    await submitLogin(actor);
    expect(getSession().value).toEqual(DEMO_ADMIN);
  });

  it('keeps login route and guest navbar on failed session save', async () => {
    const actor = userEvent.setup();
    failWrite(SESSION_KEY);
    window.history.replaceState({}, '', '/login');
    render(<App />);
    await submitLogin(actor);
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByRole('alert')).toHaveTextContent(SIGN_IN_UNSAVED);
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    expect(getSession().value).toBeNull();
  });

  it('distinguishes failed login collection read from bad credentials in the form', async () => {
    const actor = userEvent.setup();
    localStorage.setItem(USERS_KEY, '{broken');
    renderRoute(<Login />);
    await submitLogin(actor, 'jamie', 'demo-only');
    expect(screen.getByRole('alert')).toHaveTextContent(STORAGE_WARNING);
    expect(localStorage.getItem(USERS_KEY)).toBe('{broken');
    expect(getSession().value).toBeNull();
  });

  it('registers through actual fields, hides role selector, updates navbar, and survives shell remount', async () => {
    const actor = userEvent.setup();
    // This identity workflow starts from an intentionally empty, initialized blog.
    localStorage.setItem(POSTS_KEY, '[]');
    localStorage.setItem(INITIALIZATION_KEY, JSON.stringify({ version: 1, initialized: true }));
    const before = { ...localStorage };
    window.history.replaceState({}, '', '/register');
    const view = render(<App />);
    expect(screen.getByRole('note')).toHaveTextContent(DEMO_MESSAGE);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect({ ...localStorage }).toEqual(before);
    await fillAccount(actor);
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(window.location.pathname).toBe('/blogs');
    expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveTextContent('Robin Writer');
    const savedSession = getSession().value;
    expect(savedSession.role).toBe('user');
    expect(readCollection(USERS_KEY).value[0].id).toBe(savedSession.userId);
    view.unmount();
    render(<App />);
    expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveTextContent('Robin Writer');
    expect(getSession().value).toEqual(savedSession);
  });

  it('shows normalized duplicate registration without saving or navigating', async () => {
    const actor = userEvent.setup();
    seed();
    window.history.replaceState({}, '', '/register');
    render(<App />);
    await fillAccount(actor, { ...registration, username: ' JAMIE ' });
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Username is already taken.');
    expect(window.location.pathname).toBe('/register');
    expect(readCollection(USERS_KEY).value).toEqual([user]);
    expect(getSession().value).toBeNull();
  });

  it('shows partial registration truthfully and stays guest until later explicit login', async () => {
    const actor = userEvent.setup();
    const spy = failWrite(SESSION_KEY);
    window.history.replaceState({}, '', '/register');
    render(<App />);
    await fillAccount(actor);
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent(ACCOUNT_SIGN_IN_INCOMPLETE);
    expect(window.location.pathname).toBe('/register');
    expect(readCollection(USERS_KEY).value[0].username).toBe('robin');
    expect(getSession().value).toBeNull();
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    spy.mockRestore();
    await actor.click(screen.getByRole('link', { name: 'Sign in' }));
    await submitLogin(actor, 'robin', ' demo ');
    expect(window.location.pathname).toBe('/blogs');
    expect(getSession().value.username).toBe('robin');
  });

  it('blocks registration mutation when account storage is corrupt', async () => {
    const actor = userEvent.setup();
    localStorage.setItem(USERS_KEY, '{broken');
    renderRoute(<Register />);
    expect(screen.getByRole('alert')).toHaveTextContent(STORAGE_WARNING);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
    await fillAccount(actor);
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(localStorage.getItem(USERS_KEY)).toBe('{broken');
    expect(getSession().value).toBeNull();
  });

  it('refreshes stale identity on a clicked location transition and fails closed', async () => {
    const actor = userEvent.setup();
    seed([user], session);
    render(<App />);
    localStorage.setItem(USERS_KEY, '[]');
    await actor.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'All Blogs' }));
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    expect(getSession().value).toBeNull();
  });

  it('keeps route and signed-in navbar on failed logout, then permits explicit retry', async () => {
    const actor = userEvent.setup();
    seed([user], session);
    window.history.replaceState({}, '', '/blogs');
    render(<App />);
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('', 'SecurityError'); });
    await actor.click(screen.getByRole('button', { name: 'Logout' }));
    expect(window.location.pathname).toBe('/blogs');
    expect(screen.getByRole('alert')).toHaveTextContent('Logout could not be saved.');
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(getSession().value).toEqual(session);
    spy.mockRestore();
    await actor.click(screen.getByRole('button', { name: 'Logout' }));
    expect(window.location.pathname).toBe('/');
    expect(getSession().value).toBeNull();
  });

  it('presents AccountForm initial values and admin role, invoking submit and cancel only on activation', async () => {
    const actor = userEvent.setup();
    const submitted = [];
    let cancelled = false;
    render(
      <AccountForm
        initial={registration}
        allowRole
        onSubmit={(values) => {
          submitted.push(values);
          return { ok: true };
        }}
        submitLabel="Add account"
        onCancel={() => { cancelled = true; }}
        idPrefix="admin-account"
      />,
    );
    expect(submitted).toEqual([]);
    expect(cancelled).toBe(false);
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveValue(registration.displayName);
    await actor.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'admin');
    await actor.click(screen.getByRole('button', { name: 'Add account' }));
    expect(submitted).toEqual([{ ...registration, role: 'admin' }]);
    expect(localStorage.length).toBe(0);
    await actor.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancelled).toBe(true);
  });

  it('validates AccountForm required and mismatch errors with label associations before callbacks', async () => {
    const actor = userEvent.setup();
    const submitted = [];
    render(<AccountForm onSubmit={(values) => submitted.push(values)} />);
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    for (const label of ['Display name', 'Username', 'Password', 'Confirm password']) {
      const input = screen.getByLabelText(label, { exact: true });
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-required', 'true');
      expect(document.getElementById(input.getAttribute('aria-describedby'))).toHaveAttribute('role', 'alert');
    }
    expect(submitted).toEqual([]);
    await fillAccount(actor, { ...registration, confirmPassword: 'different' });
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(submitted).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it('renders AccountForm callback errors and supports callbacks without a result', async () => {
    const actor = userEvent.setup();
    const view = render(<AccountForm initial={registration} onSubmit={() => ({
      ok: false, errors: { username: 'Duplicate from service' }, message: 'Save failed',
    })} />);
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Duplicate from service')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Save failed')).toHaveAttribute('role', 'alert');
    view.rerender(<AccountForm initial={registration} onSubmit={() => undefined} />);
    await actor.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});
