/** Verify account services and the real route against actual localStorage with browser-boundary faults only. */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';
import Users from '../src/pages/Users.jsx';
import { UserRow } from '../src/components/UserRow.jsx';
import { STORAGE_WARNING } from '../src/components/Notice.jsx';
import { getSession, sessionForUser } from '../src/utils/auth.js';
import { createUser, deleteUser } from '../src/utils/users.js';
import { DEMO_ADMIN, POSTS_KEY, SESSION_KEY, USERS_KEY, readCollection } from '../src/utils/storage.js';
import { user, secondUser, post, session } from './fixtures.js';

const admin = { ...secondUser, role: 'admin' };
const adminSession = sessionForUser(admin);
const input = { displayName: '  New Writer  ', username: '  NeW  ', password: ' exact password ', role: 'user' };
const id = 'ac147466-18c4-4b8d-9e83-10a44668c590';
const time = '2026-11-01T10:20:30.000Z';
const corruptUsers = [
  ['{broken', 'invalid-json'], ['{}', 'invalid-shape'],
  [JSON.stringify([{ ...user, role: 'unknown' }]), 'invalid-record'],
  [JSON.stringify([user, user]), 'invalid-record'],
  [JSON.stringify([{ ...user, id: DEMO_ADMIN.userId }]), 'invalid-record'],
  [JSON.stringify([{ ...user, createdAt: 'bad' }]), 'invalid-record'],
];

/** Seed real browser data and return raw state for later preservation assertions. */
function seed(identity = DEMO_ADMIN, users = [user, admin]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  localStorage.setItem(POSTS_KEY, JSON.stringify([post]));
  if (identity) localStorage.setItem(SESSION_KEY, JSON.stringify(identity));
  else localStorage.removeItem(SESSION_KEY);
  return rawState();
}

/** Read all three keys without altering them. */
function rawState() {
  return [USERS_KEY, POSTS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key));
}

/** Render the real router at one initial path. */
function renderApp(path = '/users') {
  window.history.replaceState({}, '', path);
  return render(<App />);
}

/** Inject one browser read exception; application helpers remain real. */
function failRead(blockedKey) {
  const original = Storage.prototype.getItem;
  return vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
    if (key === blockedKey) throw new DOMException('Blocked', 'SecurityError');
    return original.call(this, key);
  });
}

/** Inject browser quota/security write exceptions, never an application-service mock. */
function failWrite(name) {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Blocked', name);
  });
}

/** Control generated browser identity and time for exact persisted-record assertions. */
function generation() {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(id);
  vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(time);
}

/** Fill the shared form through its real accessible labels. */
async function fillForm(actor, role = 'user') {
  await actor.type(screen.getByLabelText('Display name', { exact: true }), input.displayName);
  await actor.type(screen.getByLabelText('Username', { exact: true }), input.username);
  await actor.type(screen.getByLabelText('Password', { exact: true }), input.password);
  await actor.selectOptions(screen.getByLabelText('Role', { exact: true }), role);
}

/** Scope account assertions to the desktop table; jsdom does not apply Tailwind breakpoints. */
function table() {
  return within(screen.getByRole('table', { name: 'Accounts' }));
}

/** Find a desktop record by its uniquely labelled action. */
function row(username) {
  return within(table().getByRole('button', { name: `Delete ${username}`, exact: true }).closest('tr'));
}

describe('administrator creation service', () => {
  it.each([undefined, null, 3, false, [], {}, 'text'].map((value) => [value]))(
    'rejects invalid whole input %j before storage reads', (form) => {
      const before = seed();
      const blocked = failRead(USERS_KEY);
      expect(createUser(form, DEMO_ADMIN)).toEqual({
        ok: false, code: 'validation', errors: {
          displayName: 'Display name is required.', username: 'Username is required.',
          password: 'Password is required.', role: 'Choose a valid role.',
        },
      });
      blocked.mockRestore();
      expect(rawState()).toEqual(before);
    },
  );

  it.each(['displayName', 'username', 'password'].flatMap((field) => (
    [undefined, null, 2, false, {}, [], '', ' \n '].map((value) => [field, value])
  )))('rejects missing or invalid %s=%j and preserves all data', (field, value) => {
    const before = seed();
    const result = createUser({ ...input, [field]: value }, DEMO_ADMIN);
    expect(result).toMatchObject({ ok: false, code: 'validation', errors: { [field]: expect.any(String) } });
    expect(rawState()).toEqual(before);
    expect(readCollection(USERS_KEY).value).toEqual([user, admin]);
  });

  it.each([undefined, null, '', 'owner', 'Admin', 1, false, {}, []].map((value) => [value]))(
    'rejects unsupported role %j', (role) => {
      const before = seed();
      expect(createUser({ ...input, role }, DEMO_ADMIN)).toEqual({
        ok: false, code: 'validation', errors: { role: 'Choose a valid role.' },
      });
      expect(rawState()).toEqual(before);
    },
  );

  for (const role of ['user', 'admin']) {
    it.each(['  ADMIN ', ' JAMIE ', 'ROBIN'])(`rejects normalized reserved/duplicate %s for ${role}`, (username) => {
      const before = seed();
      expect(createUser({ ...input, role, username }, DEMO_ADMIN)).toEqual({
        ok: false, code: 'validation', errors: { username: 'Username is already taken.' },
      });
      expect(rawState()).toEqual(before);
    });

    it.each([DEMO_ADMIN, adminSession])(`creates ${role} with generated fields and preserves current identity %j`, (identity) => {
      seed(identity, [user]);
      // A fresh account arrives after the caller's original view snapshot.
      localStorage.setItem(USERS_KEY, JSON.stringify([user, admin]));
      const before = rawState();
      generation();
      const result = createUser({ ...input, role, id: 'forged', createdAt: 'bad', confirmPassword: 'different' }, identity);
      const value = { id, createdAt: time, displayName: 'New Writer', username: 'new', password: input.password, role };
      expect(result).toEqual({ ok: true, value });
      expect(readCollection(USERS_KEY).value).toEqual([user, admin, value]);
      expect(rawState().slice(1)).toEqual(before.slice(1));
      expect(getSession()).toEqual({ ok: true, value: identity });
    });
  }

  it('treats a missing users key as empty without inserting the built-in administrator', () => {
    seed();
    localStorage.removeItem(USERS_KEY);
    const result = createUser(input, DEMO_ADMIN);
    expect(result.ok).toBe(true);
    expect(readCollection(USERS_KEY).value).toEqual([result.value]);
    expect(getSession().value).toEqual(DEMO_ADMIN);
  });

  it('stores large escaped-looking names as plain text with exact password', () => {
    seed();
    const name = `<img onerror=alert(1)>${'x'.repeat(10000)}`;
    const result = createUser({ ...input, displayName: name }, DEMO_ADMIN);
    expect(result.ok).toBe(true);
    expect(readCollection(USERS_KEY).value.at(-1).displayName).toBe(name);
    expect(readCollection(USERS_KEY).value.at(-1).password).toBe(input.password);
  });

  it.each(['uuid', 'date'])('catches %s generation exceptions without persistence', (source) => {
    const before = seed();
    const target = source === 'uuid' ? crypto : Date.prototype;
    vi.spyOn(target, source === 'uuid' ? 'randomUUID' : 'toISOString').mockImplementation(() => { throw new Error('Unavailable'); });
    expect(createUser(input, DEMO_ADMIN)).toEqual({ ok: false, code: 'identity-unavailable' });
    expect(rawState()).toEqual(before);
  });

  it('catches a missing UUID capability without changing storage', () => {
    const before = seed();
    vi.stubGlobal('crypto', {});
    expect(createUser(input, DEMO_ADMIN)).toEqual({ ok: false, code: 'identity-unavailable' });
    expect(rawState()).toEqual(before);
  });

  it('rejects a malformed generated date at the write boundary', () => {
    const before = seed();
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('bad date');
    expect(createUser(input, DEMO_ADMIN)).toEqual({ ok: false, code: 'invalid-shape' });
    expect(rawState()).toEqual(before);
  });

  it.each(['not-a-uuid', user.id])('rejects invalid or colliding generated ID %s at write boundary', (generated) => {
    const before = seed();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(generated);
    expect(createUser(input, DEMO_ADMIN)).toEqual({ ok: false, code: 'invalid-shape' });
    expect(rawState()).toEqual(before);
  });
});

for (const kind of ['create', 'delete']) {
  describe(`${kind} fresh authorization and storage failures`, () => {
    /** Exercise the real mutation for this branch of the shared failure contract. */
    function mutate(identity = DEMO_ADMIN) {
      return kind === 'create' ? createUser(input, identity) : deleteUser(user.id, identity);
    }

    it.each(corruptUsers)('preserves corrupt source %s with explicit %s', (raw, code) => {
      seed();
      localStorage.setItem(USERS_KEY, raw);
      const before = rawState();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      expect(mutate()).toEqual({ ok: false, code, readFailed: true });
      expect(readCollection(USERS_KEY)).toEqual({ ok: false, code, value: [] });
      expect(rawState()).toEqual(before);
      expect(confirm).not.toHaveBeenCalled();
    });

    it.each([USERS_KEY, SESSION_KEY])('fails closed on fresh %s access exceptions', (key) => {
      const before = seed();
      const blocked = failRead(key);
      expect(mutate()).toEqual({ ok: false, code: 'storage-unavailable', readFailed: true });
      blocked.mockRestore();
      expect(rawState()).toEqual(before);
    });

    it.each([null, undefined, {}, session, { ...DEMO_ADMIN, role: 'user' }].map((value) => [value]))(
      'rejects absent/nonadmin/incomplete caller %j against current fixed admin', (identity) => {
        const before = seed();
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        // Pass undefined directly to avoid the helper's default identity.
        const result = kind === 'create' ? createUser(input, identity) : deleteUser(user.id, identity);
        expect(result).toEqual({ ok: false, code: 'unauthorized' });
        expect(rawState()).toEqual(before);
        expect(confirm).not.toHaveBeenCalled();
      },
    );

    it.each(['userId', 'username', 'displayName', 'role'])('rejects stale caller %s even when its ID looks administrative', (field) => {
      const before = seed(adminSession);
      const stale = { ...adminSession, [field]: field === 'role' ? 'user' : 'changed' };
      expect(mutate(stale)).toEqual({ ok: false, code: 'unauthorized' });
      expect(rawState()).toEqual(before);
    });

    it.each([null, session])('rejects current absent or ordinary identity %j despite forged admin caller', (current) => {
      const before = seed(current);
      expect(mutate()).toEqual({ ok: false, code: 'unauthorized' });
      expect(rawState()).toEqual(before);
    });

    it.each(['{bad', '{}', JSON.stringify({ ...adminSession, displayName: 'stale' })])(
      'fails closed and clears invalid current session %s without changing collections', (raw) => {
        seed();
        localStorage.setItem(SESSION_KEY, raw);
        const before = rawState();
        expect(mutate(adminSession)).toMatchObject({ ok: false, readFailed: true });
        expect(rawState().slice(0, 2)).toEqual(before.slice(0, 2));
        expect(getSession().value).toBeNull();
      },
    );

    it('rejects an active registered admin removed since the view was read', () => {
      seed(adminSession, [user]);
      const before = rawState();
      expect(mutate(adminSession)).toEqual({ ok: false, code: 'invalid-shape', readFailed: true });
      expect(rawState().slice(0, 2)).toEqual(before.slice(0, 2));
      expect(getSession().value).toBeNull();
    });

    it.each(['username', 'displayName', 'role'])('rejects a stored administrator whose %s changed after login', (field) => {
      seed(adminSession);
      const changed = { ...admin, [field]: field === 'role' ? 'user' : 'updated' };
      localStorage.setItem(USERS_KEY, JSON.stringify([user, changed]));
      const before = rawState();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      expect(mutate(adminSession)).toEqual({ ok: false, code: 'invalid-shape', readFailed: true });
      expect(rawState().slice(0, 2)).toEqual(before.slice(0, 2));
      expect(getSession().value).toBeNull();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('rejects a different currently signed-in administrator despite both having the same role', () => {
      const before = seed(DEMO_ADMIN);
      expect(mutate(adminSession)).toEqual({ ok: false, code: 'unauthorized' });
      expect(rawState()).toEqual(before);
    });

    it.each(['QuotaExceededError', 'SecurityError'])('preserves full state on %s writes', (name) => {
      const before = seed();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      failWrite(name);
      expect(mutate()).toEqual({ ok: false, code: name === 'QuotaExceededError' ? 'quota-exceeded' : 'storage-unavailable' });
      expect(rawState()).toEqual(before);
      expect(readCollection(USERS_KEY).value).toEqual([user, admin]);
    });

    it('reports serialization exceptions without changing any storage key', () => {
      const before = seed();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new TypeError('Cannot serialize'); });
      expect(mutate()).toEqual({ ok: false, code: 'serialization-failed' });
      expect(rawState()).toEqual(before);
      expect(readCollection(USERS_KEY).value).toEqual([user, admin]);
    });
  });
}

describe('account deletion service', () => {
  it.each([undefined, null, false, 1, {}, [], '', ' \n '].map((value) => [value]))(
    'rejects invalid ID %j before storage and confirmation', (target) => {
      const before = seed();
      const blocked = failRead(USERS_KEY);
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      expect(deleteUser(target, DEMO_ADMIN)).toEqual({ ok: false, code: 'invalid-id' });
      blocked.mockRestore();
      expect(rawState()).toEqual(before);
      expect(confirm).not.toHaveBeenCalled();
    },
  );

  it.each([id, ` ${user.id} `])('does not mutate or confirm missing exact target %s', (target) => {
    const before = seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(deleteUser(target, DEMO_ADMIN)).toEqual({ ok: false, code: 'not-found' });
    expect(rawState()).toEqual(before);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('protects synthetic administrator before asking for confirmation', () => {
    const before = seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(deleteUser(DEMO_ADMIN.userId, DEMO_ADMIN)).toEqual({ ok: false, code: 'protected-user' });
    expect(rawState()).toEqual(before);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('protects the current registered administrator before confirmation', () => {
    const before = seed(adminSession);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(deleteUser(admin.id, adminSession)).toEqual({ ok: false, code: 'protected-user' });
    expect(rawState()).toEqual(before);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('declining a single confirmation leaves state unchanged', () => {
    const before = seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(deleteUser(user.id, DEMO_ADMIN)).toEqual({ ok: false, code: 'cancelled' });
    expect(rawState()).toEqual(before);
    expect(confirm).toHaveBeenCalledExactlyOnceWith('Delete this account? This cannot be undone.');
  });

  it('handles unavailable confirmation without claiming deletion', () => {
    const before = seed();
    vi.spyOn(window, 'confirm').mockImplementation(() => { throw new Error('Unavailable'); });
    expect(deleteUser(user.id, DEMO_ADMIN)).toEqual({ ok: false, code: 'confirmation-unavailable' });
    expect(rawState()).toEqual(before);
  });

  it.each([['user', user, DEMO_ADMIN], ['admin', admin, DEMO_ADMIN], ['other user', user, adminSession]])(
    'deletes %s from the full fresh collection but never cascades posts or replaces login', (label, target, identity) => {
      seed(identity, [user]);
      localStorage.setItem(USERS_KEY, JSON.stringify([user, admin]));
      const before = rawState();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const expected = [user, admin].filter((record) => record.id !== target.id);
      expect(deleteUser(target.id, identity)).toEqual({ ok: true, value: expected });
      expect(readCollection(USERS_KEY).value).toEqual(expected);
      expect(rawState().slice(1)).toEqual(before.slice(1));
      expect(getSession().value).toEqual(identity);
      expect(confirm).toHaveBeenCalledTimes(1);
    },
  );

  it('a deleted account cannot later resolve its old session', () => {
    seed();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(deleteUser(user.id, DEMO_ADMIN).ok).toBe(true);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    expect(getSession()).toEqual({ ok: false, code: 'invalid-shape', value: null });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(readCollection(POSTS_KEY).value).toEqual([post]);
  });
});

describe('real account route and reusable rows', () => {
  it('renders details, desktop/mobile classes and protected control without implicit mutations', () => {
    const before = seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderApp();
    expect(screen.getByRole('heading', { name: 'Manage users' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveClass('hidden', 'md:table');
    expect(screen.getByLabelText('Mobile accounts')).toHaveClass('md:hidden');
    expect(table().getAllByRole('columnheader')).toHaveLength(5);
    for (const header of table().getAllByRole('columnheader')) expect(header).toHaveAttribute('scope', 'col');
    expect(row('jamie').getByRole('img', { name: 'User avatar' })).toBeInTheDocument();
    expect(row('robin').getByRole('status')).toHaveTextContent('Admin');
    expect(row('jamie').getByText('Oct 14, 2026')).toBeInTheDocument();
    expect(row('admin').getByText('Built-in')).toBeInTheDocument();
    expect(row('admin').getByRole('button')).toBeDisabled();
    expect(row('admin').getByRole('button')).toHaveAttribute('title', 'Default admin cannot be deleted.');
    expect(screen.getByText(/2 registered accounts/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();
    expect(rawState()).toEqual(before);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['user', 'admin'])('creates %s through real labels, resets only success and keeps the route/session', async (role) => {
    const actor = userEvent.setup();
    const before = seed();
    generation();
    renderApp();
    await fillForm(actor, role);
    await actor.click(screen.getByRole('button', { name: 'Create account', exact: true }));
    expect(row('new').getByText('New Writer')).toBeInTheDocument();
    expect(row('new').getByRole('status')).toHaveTextContent(role === 'admin' ? 'Admin' : 'User');
    expect(screen.getByLabelText('Username', { exact: true })).toHaveValue('');
    expect(screen.getByLabelText('Role', { exact: true })).toHaveValue('user');
    expect(screen.getByText('Account created. Your current sign-in has not changed.')).toHaveAttribute('aria-live', 'polite');
    expect(readCollection(USERS_KEY).value.at(-1)).toMatchObject({ id, createdAt: time, role, password: input.password });
    expect(rawState().slice(1)).toEqual(before.slice(1));
    expect(window.location.pathname).toBe('/users');
  });

  it('shows associated required errors and retains values on duplicate and reserved errors', async () => {
    const actor = userEvent.setup();
    const before = seed();
    renderApp();
    await actor.click(screen.getByRole('button', { name: 'Create account', exact: true }));
    for (const label of ['Display name', 'Username', 'Password']) {
      const field = screen.getByLabelText(label, { exact: true });
      expect(field).toHaveAttribute('aria-required', 'true');
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(document.getElementById(field.getAttribute('aria-describedby'))).toHaveAttribute('role', 'alert');
    }
    await fillForm(actor);
    for (const name of [' JAMIE ', ' ADMIN ']) {
      await actor.clear(screen.getByLabelText('Username', { exact: true }));
      await actor.type(screen.getByLabelText('Username', { exact: true }), name);
      await actor.click(screen.getByRole('button', { name: 'Create account', exact: true }));
      expect(screen.getByRole('alert')).toHaveTextContent('Username is already taken.');
      expect(screen.getByLabelText('Username', { exact: true })).toHaveValue(name);
      expect(rawState()).toEqual(before);
    }
    expect(window.location.pathname).toBe('/users');
  });

  it.each(['QuotaExceededError', 'SecurityError', 'serialization', 'generation'])(
    'preserves form and list on create %s failure with explicit error', async (fault) => {
      const actor = userEvent.setup();
      const before = seed();
      renderApp();
      await fillForm(actor);
      if (fault === 'serialization') {
        const original = JSON.stringify;
        vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
          if (Array.isArray(value) && value.some((record) => record?.username === 'new')) throw new TypeError('Cannot serialize accounts');
          return original(value, ...args);
        });
      } else if (fault === 'generation') {
        vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('Bad'); });
      } else {
        failWrite(fault);
      }
      await actor.click(screen.getByRole('button', { name: 'Create account', exact: true }));
      expect(screen.getByRole('alert')).toHaveTextContent('Account could not be created. Nothing was saved.');
      expect(screen.getByLabelText('Username', { exact: true })).toHaveValue(input.username);
      expect(table().queryByRole('button', { name: 'Delete new' })).not.toBeInTheDocument();
      expect(rawState()).toEqual(before);
      expect(window.location.pathname).toBe('/users');
    },
  );

  it('declines then accepts deletion through the real row and reflects only persisted results', async () => {
    const actor = userEvent.setup();
    const before = seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderApp();
    await actor.click(row('jamie').getByRole('button'));
    expect(rawState()).toEqual(before);
    expect(row('jamie').getByText('Jamie Writer')).toBeInTheDocument();
    confirm.mockReturnValue(true);
    await actor.click(row('jamie').getByRole('button'));
    expect(table().queryByRole('button', { name: 'Delete jamie' })).not.toBeInTheDocument();
    expect(readCollection(USERS_KEY).value).toEqual([admin]);
    expect(rawState().slice(1)).toEqual(before.slice(1));
    expect(screen.getByText('Account deleted. Existing posts have not been changed.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/users');
  });

  it.each(['QuotaExceededError', 'SecurityError'])('failed deletion %s preserves the visible row and shows unsaved error', async (fault) => {
    const actor = userEvent.setup();
    const before = seed();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderApp();
    failWrite(fault);
    await actor.click(row('jamie').getByRole('button'));
    expect(row('jamie').getByText('Jamie Writer')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Account could not be deleted. Nothing was saved.');
    expect(rawState()).toEqual(before);
    expect(window.location.pathname).toBe('/users');
  });

  it.each(['create', 'delete'])('late unreadable users during %s preserve snapshot and disable all mutations', async (kind) => {
    const actor = userEvent.setup();
    seed();
    renderApp();
    if (kind === 'create') await fillForm(actor);
    localStorage.setItem(USERS_KEY, '{broken');
    const before = rawState();
    await actor.click(kind === 'create' ? screen.getByRole('button', { name: 'Create account', exact: true }) : row('jamie').getByRole('button'));
    expect(screen.getByText(STORAGE_WARNING)).toBeInTheDocument();
    expect(row('jamie').getByText('Jamie Writer')).toBeInTheDocument();
    expect(row('jamie').getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
    expect(rawState()).toEqual(before);
    expect(window.location.pathname).toBe('/users');
  });

  it.each(['corrupt', 'unavailable'])('initial %s users show a safe empty warning and disabled mutations', (fault) => {
    seed();
    if (fault === 'corrupt') localStorage.setItem(USERS_KEY, '{broken');
    const before = rawState();
    const blocked = fault === 'unavailable' ? failRead(USERS_KEY) : null;
    renderApp();
    expect(screen.getByText(STORAGE_WARNING)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
    expect(table().getAllByRole('row')).toHaveLength(2);
    expect(screen.queryByText('No registered accounts yet.')).not.toBeInTheDocument();
    blocked?.mockRestore();
    expect(rawState()).toEqual(before);
  });

  it('missing users render an empty registered state and never persist the display-only fixed row', () => {
    seed();
    localStorage.removeItem(USERS_KEY);
    const before = rawState();
    renderApp();
    expect(screen.getByText('No registered accounts yet.')).toBeInTheDocument();
    expect(screen.getByText(/0 registered accounts/)).toBeInTheDocument();
    expect(rawState()).toEqual(before);
  });

  it('disables current registered self with a truthful tooltip', () => {
    seed(adminSession);
    renderApp();
    expect(row('robin').getByRole('button')).toBeDisabled();
    expect(row('robin').getByRole('button')).toHaveAttribute('title', 'You cannot delete your current account.');
  });

  it('missing target after mount preserves UI but reports not found without confirmation', async () => {
    const actor = userEvent.setup();
    seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderApp();
    localStorage.setItem(USERS_KEY, JSON.stringify([admin]));
    const before = rawState();
    await actor.click(row('jamie').getByRole('button'));
    expect(row('jamie').getByText('Jamie Writer')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Account not found.');
    expect(rawState()).toEqual(before);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([null, session])('real guard rejects guest/ordinary users %j without mutation', async (identity) => {
    const before = seed(identity);
    renderApp();
    expect(await screen.findByRole('heading', { name: identity ? 'All Blogs' : 'Sign in', exact: true })).toBeInTheDocument();
    expect(window.location.pathname).toBe(identity ? '/blogs' : '/login');
    expect(screen.queryByRole('heading', { name: 'Manage users' })).not.toBeInTheDocument();
    expect(rawState()).toEqual(before);
  });

  it('isolated page fails closed with no active admin and cannot submit even by form event', () => {
    seed(null);
    render(<Users />);
    const button = screen.getByRole('button', { name: 'Create account', exact: true });
    expect(button).toBeDisabled();
    const before = rawState();
    fireEvent.submit(button.closest('form'));
    expect(rawState()).toEqual(before);
  });

  it('mobile reusable row escapes content and invokes only the explicit exact-ID callback', async () => {
    const actor = userEvent.setup();
    const onDelete = vi.fn();
    const displayName = '<script>alert(1)</script>';
    const { container } = render(
      <UserRow user={{ ...user, displayName }} session={DEMO_ADMIN} onDelete={onDelete} mobile />,
    );
    expect(screen.getByRole('article', { name: 'Account jamie' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: displayName })).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('Created Oct 14, 2026')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    await actor.click(screen.getByRole('button', { name: 'Delete jamie' }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(user.id);
  });

  it('row without an action callback remains disabled', () => {
    render(
      <table>
        <tbody>
          <UserRow user={user} session={DEMO_ADMIN} />
        </tbody>
      </table>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Account deletion is unavailable.');
  });
});
