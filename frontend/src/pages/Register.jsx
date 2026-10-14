/** Present self-registration without claiming sign-in after a partial save. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AccountForm } from '../components/AccountForm.jsx';
import { Notice } from '../components/Notice.jsx';
import { getSession, register } from '../utils/auth.js';
import { homeRoute } from '../utils/permissions.js';
import { readCollection, USERS_KEY } from '../utils/storage.js';

/**
 * Render ordinary account creation and disclose unreadable local collections.
 * Args:
 *   onSessionChange: Callback receiving a successfully persisted session only.
 * Returns:
 *   Centred solid registration view or authenticated role-home redirect.
 */
export default function Register({ onSessionChange }) {
  const [usersRead, setUsersRead] = useState({ ok: true, value: [] });
  const navigate = useNavigate();
  const current = getSession();
  useEffect(() => {
    setUsersRead(readCollection(USERS_KEY));
  }, []);

  /**
   * Create the account and notify the shell only after both writes succeed.
   * Args:
   *   values: Validated AccountForm values.
   * Returns:
   *   Auth result for inline errors, including truthful partial registration failure.
   */
  function handleSubmit(values) {
    setUsersRead(readCollection(USERS_KEY));
    const result = register(values);
    if (result.ok) {
      onSessionChange?.(result.session);
      navigate(result.redirect, { replace: true });
    }
    return result;
  }

  if (current.ok && current.value) return <Navigate to={homeRoute(current.value)} replace />;

  return (
    <section aria-labelledby="register-title" className="mx-auto w-full max-w-xl px-6 py-12 md:py-20">
      <div className="space-y-6 rounded-card border border-border bg-surface p-6 shadow-card md:p-10">
        <div className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-widest text-primary-800">
            Begin with a blank page
          </p>
          <h1 id="register-title" className="font-display text-4xl font-bold">
            Create account
          </h1>
          <p className="text-foreground-muted">
            Keep your writing in this browser. Choose demo-only credentials.
          </p>
        </div>
        <Notice kind="demo" />
        {!usersRead.ok && <Notice kind="storage" />}
        <AccountForm onSubmit={handleSubmit} disabled={!usersRead.ok} />
        <p className="text-sm text-foreground-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-primary-800 underline">
            Sign in
          </Link>
        </p>
      </div>
    </section>
  );
}

Register.propTypes = { onSessionChange: PropTypes.func };
