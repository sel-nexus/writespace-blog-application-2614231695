/** Present reusable account fields without reading or writing persistence. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { validateAdminAccount, validateRegistration } from '../utils/validation.js';

const fields = [
  { name: 'displayName', label: 'Display name', type: 'text', autoComplete: 'nickname' },
  { name: 'username', label: 'Username', type: 'text', autoComplete: 'username' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
  { name: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' },
];
const fieldClass = 'w-full rounded-xl border border-border bg-surface px-4 py-3 '
  + 'focus:outline-none focus:ring-2 focus:ring-ring';

/**
 * Render labelled registration or administrator account-creation fields.
 * Args:
 *   initial: Initial field values, used once on mount.
 *   onSubmit: Synchronous callback receiving validated values and returning an optional result with errors/message.
 *   submitLabel: Explicit primary action label.
 *   allowRole: Show user/admin role selection and omit registration-only confirmation.
 *   onCancel: Optional explicit cancellation callback, never invoked on render.
 *   disabled: Block submission when the caller cannot mutate account data.
 *   idPrefix: Stable field ID prefix, permitting multiple independently labelled forms.
 * Returns:
 *   Accessible form with local validation and callback failure feedback; no persistence.
 */
export function AccountForm({
  initial = {}, onSubmit, submitLabel = 'Create account', allowRole = false,
  onCancel, disabled = false, idPrefix = 'account',
}) {
  const [values, setValues] = useState({
    displayName: initial.displayName ?? '',
    username: initial.username ?? '',
    password: initial.password ?? '',
    confirmPassword: initial.confirmPassword ?? '',
    role: initial.role ?? 'user',
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');

  /**
   * Validate on activation before calling the parent's mutation handler.
   * Args:
   *   event: Native form submission event.
   * Returns:
   *   Nothing; invalid or disabled forms do not invoke onSubmit.
   */
  function handleSubmit(event) {
    event.preventDefault();
    if (disabled) return;
    const nextErrors = allowRole ? validateAdminAccount(values) : validateRegistration(values);
    setErrors(nextErrors);
    setMessage('');
    if (Object.keys(nextErrors).length) return;
    const result = onSubmit({ ...values });
    if (result && !result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.message ?? '');
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {fields.filter((field) => !allowRole || field.name !== 'confirmPassword').map((field) => (
        <div key={field.name} className="space-y-2">
          <label htmlFor={`${idPrefix}-${field.name}`} className="block text-sm font-bold">
            {field.label}
          </label>
          <input
            id={`${idPrefix}-${field.name}`}
            name={field.name}
            type={field.type}
            autoComplete={field.autoComplete}
            value={values[field.name]}
            required
            aria-required="true"
            aria-invalid={Boolean(errors[field.name])}
            aria-describedby={errors[field.name] ? `${idPrefix}-${field.name}-error` : undefined}
            onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
            className={fieldClass}
          />
          {errors[field.name] && (
            <p id={`${idPrefix}-${field.name}-error`} role="alert" className="text-sm text-error">
              {errors[field.name]}
            </p>
          )}
        </div>
      ))}
      {allowRole && (
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-role`} className="block text-sm font-bold">
            Role
          </label>
          <select
            id={`${idPrefix}-role`}
            name="role"
            value={values.role}
            required
            aria-required="true"
            aria-invalid={Boolean(errors.role)}
            aria-describedby={errors.role ? `${idPrefix}-role-error` : undefined}
            onChange={(event) => setValues({ ...values, role: event.target.value })}
            className={fieldClass}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          {errors.role && (
            <p id={`${idPrefix}-role-error`} role="alert" className="text-sm text-error">
              {errors.role}
            </p>
          )}
        </div>
      )}
      {message && (
        <p role="alert" className="rounded-xl bg-error-light p-4 text-sm text-error">
          {message}
        </p>
      )}
      <div className="flex flex-col gap-3 md:flex-row">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-full bg-primary-700 px-6 py-3 font-bold text-white hover:bg-primary-800 disabled:opacity-50"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-full bg-surface-raised px-6 py-3 font-bold">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

AccountForm.propTypes = {
  initial: PropTypes.shape({
    displayName: PropTypes.string,
    username: PropTypes.string,
    password: PropTypes.string,
    confirmPassword: PropTypes.string,
    role: PropTypes.oneOf(['user', 'admin']),
  }),
  onSubmit: PropTypes.func.isRequired,
  submitLabel: PropTypes.string,
  allowRole: PropTypes.bool,
  onCancel: PropTypes.func,
  disabled: PropTypes.bool,
  idPrefix: PropTypes.string,
};
