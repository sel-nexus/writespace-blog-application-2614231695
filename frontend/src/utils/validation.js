/** Validate local demo input without coercion or persistence. */

/**
 * Normalize a nonblank username using locale-independent case conversion.
 * Args:
 *   value: Required string username.
 * Returns:
 *   Trimmed lowercase username.
 * Raises:
 *   TypeError: If the value is not a nonblank string.
 */
export function normalizeUsername(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError('Username must be a nonempty string.');
  }
  return value.trim().toLowerCase();
}

/**
 * Check meaningful text while preserving meaningful password spaces.
 * Args:
 *   value: Untrusted field value.
 * Returns:
 *   Whether the value is a nonblank string.
 */
function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate required plain-text post fields for the authoring slice.
 * Args:
 *   input: Untrusted title/content fields.
 * Returns:
 *   Field error map; an empty map means valid.
 */
export function validatePost(input) {
  const errors = {};
  for (const field of ['title', 'content']) {
    if (!hasText(input?.[field])) errors[field] = `${field === 'title' ? 'Title' : 'Content'} is required.`;
  }
  return errors;
}

/**
 * Validate shared account fields and normalized username uniqueness.
 * Args:
 *   input: Display name, username and exact password fields.
 *   users: Existing account array; unreadable collections must not reach this validator.
 * Returns:
 *   Field error map, including a users error for an invalid collection argument.
 */
function validateAccount(input, users) {
  const errors = {};
  if (!hasText(input?.displayName)) errors.displayName = 'Display name is required.';
  if (!hasText(input?.password)) errors.password = 'Password is required.';
  if (!hasText(input?.username)) {
    errors.username = 'Username is required.';
  } else {
    const username = normalizeUsername(input.username);
    if (username === 'admin' || (Array.isArray(users) && users.some((user) => (
      hasText(user?.username) && normalizeUsername(user.username) === username
    )))) {
      errors.username = 'Username is already taken.';
    }
  }
  if (!Array.isArray(users)) errors.users = 'Account data is unavailable.';
  return errors;
}

/**
 * Validate self-registration without accepting a caller-supplied role.
 * Args:
 *   input: Required displayName, username, password and confirmPassword fields.
 *   users: Existing account array, defaulting to an empty collection.
 * Returns:
 *   Field errors for required values, exact password mismatch or duplicate username.
 */
export function validateRegistration(input, users = []) {
  const errors = validateAccount(input, users);
  if (!hasText(input?.confirmPassword)) {
    errors.confirmPassword = 'Confirm password is required.';
  } else if (input.confirmPassword !== input.password) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

/**
 * Validate future administrator account creation, including explicit role.
 * Args:
 *   input: Shared account fields and role; confirmation is not required.
 *   users: Existing account array.
 * Returns:
 *   Field errors; role must be exactly user or admin.
 */
export function validateAdminAccount(input, users = []) {
  const errors = validateAccount(input, users);
  if (input?.role !== 'user' && input?.role !== 'admin') errors.role = 'Choose a valid role.';
  return errors;
}
