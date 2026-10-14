/** Present plain-text authoring fields and callback-driven actions without persistence. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { validatePost } from '../utils/validation.js';

const fieldClass = 'w-full rounded-xl border border-border bg-surface px-4 py-3 '
  + 'focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-surface-raised disabled:opacity-70';

/**
 * Render required labelled fields with local validation and a live character count.
 * Args:
 *   initial: Title/content used once at mount; callers remount for a newly loaded edit target.
 *   onSubmit: Explicit callback receiving only title/content and optionally returning field errors.
 *   onCancel: Explicit callback; cancellation never submits or validates.
 *   disabled: Disable fields and submission when local data cannot safely be mutated.
 * Returns:
 *   Accessible storage-free form with stacked small-screen and horizontal desktop actions.
 */
export function PostForm({ initial = {}, onSubmit, onCancel, disabled = false }) {
  const [values, setValues] = useState({ title: initial.title ?? '', content: initial.content ?? '' });
  const [errors, setErrors] = useState({});

  /**
   * Validate only on explicit submission before invoking the page callback.
   * Args:
   *   event: Form submit event.
   * Returns:
   *   Nothing; invalid or disabled forms do not invoke submission callbacks.
   */
  function handleSubmit(event) {
    event.preventDefault();
    if (disabled) return;
    const nextErrors = validatePost(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const result = onSubmit({ ...values });
    if (result && !result.ok) setErrors(result.errors ?? {});
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="post-title" className="block text-sm font-bold">
          Title
        </label>
        <input
          id="post-title"
          name="title"
          type="text"
          value={values.title}
          onChange={(event) => setValues({ ...values, title: event.target.value })}
          required
          aria-required="true"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'post-title-error' : undefined}
          disabled={disabled}
          className={fieldClass}
        />
        {errors.title && (
          <p id="post-title-error" role="alert" className="text-sm text-error">
            {errors.title}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="post-content" className="block text-sm font-bold">
          Content
        </label>
        <textarea
          id="post-content"
          name="content"
          value={values.content}
          onChange={(event) => setValues({ ...values, content: event.target.value })}
          required
          aria-required="true"
          aria-invalid={Boolean(errors.content)}
          aria-describedby={errors.content ? 'post-content-error post-content-count' : 'post-content-count'}
          disabled={disabled}
          className={`${fieldClass} min-h-64 resize-y leading-relaxed`}
        />
        {errors.content && (
          <p id="post-content-error" role="alert" className="text-sm text-error">
            {errors.content}
          </p>
        )}
        <p id="post-content-count" role="status" className="text-right text-sm tabular-nums text-foreground-muted">
          {values.content.length} characters
        </p>
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-full bg-primary-700 px-6 py-3 font-bold text-white hover:bg-primary-800 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full bg-surface-raised px-6 py-3 font-bold focus-visible:outline-ring"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

PostForm.propTypes = {
  initial: PropTypes.shape({ title: PropTypes.string, content: PropTypes.string }),
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
