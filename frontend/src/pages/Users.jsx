/** Own administrator account forms and persisted list snapshots using browser-local services. */
import { useEffect, useState } from 'react';
import { AccountForm } from '../components/AccountForm.jsx';
import { Notice } from '../components/Notice.jsx';
import { UserRow } from '../components/UserRow.jsx';
import { getSession } from '../utils/auth.js';
import { isAdmin } from '../utils/permissions.js';
import { DEMO_ADMIN, readCollection, USERS_KEY } from '../utils/storage.js';
import { createUser, deleteUser } from '../utils/users.js';

const fixedAdmin = { id: DEMO_ADMIN.userId, ...DEMO_ADMIN };

/**
 * Render the guarded account workflow with an explicit failed-read state.
 * Returns:
 *   Role-aware creation, desktop table and mobile cards; failed collection reads render safe empty registered rows.
 * Notes:
 *   Route guards own entry. Failed writes preserve rows; failed reads preserve input and route while disabling mutations.
 */
export default function Users() {
  const [usersRead, setUsersRead] = useState(null);
  const [sessionRead, setSessionRead] = useState({ ok: true, value: null });
  const [readFailed, setReadFailed] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setUsersRead(readCollection(USERS_KEY));
    setSessionRead(getSession());
  }, []);

  /** Render the fresh collection result, including safe empty rows on failure. */
  function refreshUsers() {
    const fresh = readCollection(USERS_KEY);
    setUsersRead(fresh);
    setSessionRead(getSession());
    if (!fresh.ok) setReadFailed(true);
    return fresh;
  }

  /** Preserve fields and route on failure; retain rows only when collection reads succeed. */
  function handleFailure(result, action) {
    setMessage('');
    if (result.readFailed) {
      setReadFailed(true);
      refreshUsers();
    }
    if (result.code !== 'validation') {
      setError(result.code === 'not-found' ? 'Account not found.' : `Account could not be ${action}. Nothing was saved.`);
    }
  }

  /** Create on explicit submission and reset fields only after persistence and refresh succeed. */
  function handleCreate(form) {
    setError('');
    const result = createUser(form, sessionRead.value);
    if (result.ok) {
      const fresh = refreshUsers();
      if (fresh.ok) setFormKey((key) => key + 1);
      setMessage('Account created. Your current sign-in has not changed.');
    } else {
      handleFailure(result, 'created');
    }
    return result;
  }

  /** Update the visible list only after the service confirms and persists deletion. */
  function handleDelete(id) {
    const result = deleteUser(id, sessionRead.value);
    if (result.ok) {
      setUsersRead({ ok: true, value: result.value, source: 'stored' });
      setError('');
      setMessage('Account deleted. Existing posts have not been changed.');
    } else if (result.code !== 'cancelled') {
      setError('');
      handleFailure(result, 'deleted');
    }
  }

  if (!usersRead) {
    return (
      <p role="status" className="mx-auto max-w-6xl px-6 py-12 text-foreground-muted">
        Reading local data…
      </p>
    );
  }
  const session = sessionRead.ok && isAdmin(sessionRead.value) ? sessionRead.value : null;
  const available = usersRead.ok && !readFailed && Boolean(session);
  const rows = [fixedAdmin, ...usersRead.value];
  return (
    <section aria-labelledby="users-heading" className="mx-auto max-w-6xl space-y-8 px-6 py-12 sm:py-16">
      <h1 id="users-heading" className="font-display text-4xl sm:text-5xl">
        Manage users
      </h1>
      <Notice />
      {(!usersRead.ok || !sessionRead.ok || readFailed) && <Notice kind="storage" />}
      <p role="status" aria-live="polite" className="text-sm text-success">
        {message}
      </p>
      {error && (
        <p role="alert" className="rounded-card bg-error-light p-4 text-error">
          {error}
        </p>
      )}
      <section aria-labelledby="create-account-heading" className="rounded-card border border-border bg-surface p-6">
        <h2 id="create-account-heading" className="mb-5 font-display text-2xl">
          Create account
        </h2>
        <AccountForm key={formKey} allowRole onSubmit={handleCreate} disabled={!available} idPrefix="admin-account" />
      </section>
      <section aria-labelledby="accounts-heading" className="space-y-4">
        <h2 id="accounts-heading" className="font-display text-3xl">
          Accounts
        </h2>
        <p className="text-sm text-foreground-muted">
          {usersRead.ok ? `${usersRead.value.length} registered accounts` : 'Registered accounts unavailable'}
          {' · The built-in admin is not a registered account.'}
        </p>
        {usersRead.ok && usersRead.value.length === 0 && (
          <p className="rounded-card bg-surface-raised p-5 text-foreground-muted">
            No registered accounts yet.
          </p>
        )}
        <table aria-label="Accounts" className="hidden w-full table-fixed rounded-card bg-surface text-left md:table">
          <thead>
            <tr className="text-sm text-foreground-muted">
              {['Name', 'Username', 'Role', 'Created', 'Actions'].map((label) => (
                <th key={label} scope="col" className="px-4 py-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <UserRow key={user.id} user={user} session={available ? session : null} onDelete={handleDelete} />
            ))}
          </tbody>
        </table>
        <div aria-label="Mobile accounts" className="grid gap-4 md:hidden">
          {rows.map((user) => (
            <UserRow key={user.id} user={user} session={available ? session : null} onDelete={handleDelete} mobile />
          ))}
        </div>
      </section>
    </section>
  );
}

Users.propTypes = {};
