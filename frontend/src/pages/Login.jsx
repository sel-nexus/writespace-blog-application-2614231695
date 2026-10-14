/** Present local credential entry with explicit saved-session navigation. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Notice } from '../components/Notice.jsx';
import { getSession, login } from '../utils/auth.js';
import { homeRoute } from '../utils/permissions.js';

/**
 * Render sign-in or redirect an already authenticated identity to role home.
 * Args:
 *   onSessionChange: Callback receiving a successfully persisted session.
 * Returns:
 *   Centred solid-surface login view with exact invalid-credential feedback.
 */
export default function Login({ onSessionChange }) {
  const [values, setValues] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const current = getSession();

  /**
   * Sign in only on submission and navigate only after successful persistence.
   * Args:
   *   event: Form submission event.
   * Returns:
   *   Nothing; failures keep the form and route unchanged.
   */
  function handleSubmit(event) {
    event.preventDefault();
    const result = login(values.username, values.password);
    setErrors(result.errors ?? {});
    setMessage(result.message ?? '');
    if (result.ok) {
      onSessionChange?.(result.session);
      navigate(result.redirect, { replace: true });
    }
  }

  if (current.ok && current.value) return <Navigate to={homeRoute(current.value)} replace />;

  return (
    <section aria-labelledby="login-title" className="mx-auto w-full max-w-xl px-6 py-12 md:py-20">
      <div className="space-y-6 rounded-card border border-border bg-surface p-6 shadow-card md:p-10">
        <div className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-widest text-primary-800">
            Your local writing space
          </p>
          <h1 id="login-title" className="font-display text-4xl font-bold">
            Sign in
          </h1>
          <p className="text-foreground-muted">
            Demo administrator: username admin, password admin.
          </p>
        </div>
        <Notice kind="demo" />
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {['username', 'password'].map((field) => (
            <div key={field} className="space-y-2">
              <label htmlFor={`login-${field}`} className="block text-sm font-bold">
                {field === 'username' ? 'Username' : 'Password'}
              </label>
              <input
                id={`login-${field}`}
                name={field}
                type={field === 'password' ? 'password' : 'text'}
                autoComplete={field === 'password' ? 'current-password' : 'username'}
                required
                aria-required="true"
                aria-invalid={Boolean(errors[field])}
                aria-describedby={errors[field] ? `login-${field}-error` : undefined}
                value={values[field]}
                onChange={(event) => setValues({ ...values, [field]: event.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors[field] && (
                <p id={`login-${field}-error`} role="alert" className="text-sm text-error">
                  {errors[field]}
                </p>
              )}
            </div>
          ))}
          {message && (
            <p role="alert" className="rounded-xl bg-error-light p-4 text-sm text-error">
              {message}
            </p>
          )}
          <button type="submit" className="w-full rounded-full bg-primary-700 px-6 py-3 font-bold text-white hover:bg-primary-800">
            Sign in
          </button>
        </form>
        <p className="text-sm text-foreground-muted">
          New here?{' '}
          <Link to="/register" className="font-bold text-primary-800 underline">
            Create an account
          </Link>
        </p>
      </div>
    </section>
  );
}

Login.propTypes = { onSessionChange: PropTypes.func };
