/** Exercise each pure validation boundary without persistence or coercion. */
import { describe, expect, it } from 'vitest';
import { normalizeUsername, validateAdminAccount, validatePost, validateRegistration } from '../src/utils/validation.js';
import { user } from './fixtures.js';

const valid = { displayName: ' Writer ', username: ' Robin ', password: ' demo ', confirmPassword: ' demo ' };
const invalidValues = [undefined, null, 0, false, [], {}, '', ' \t\n '].map((value) => [value]);

describe('normalizeUsername', () => {
  it.each([[' JAMIE ', 'jamie'], ['İ', 'i\u0307'], ['I', 'i'], ['<SCRIPT>', '<script>']])(
    'normalizes %s using trim and locale-independent lowercase', (input, output) => {
      expect(normalizeUsername(input)).toBe(output);
    },
  );
  it.each(invalidValues)('rejects nonstring or blank input %j without coercion', (value) => {
    expect(() => normalizeUsername(value)).toThrow(TypeError);
  });
});

describe('validatePost', () => {
  it('accepts meaningful plain text including spaces, markup and a large body without changing it', () => {
    const input = { title: ' <script>title</script> ', content: 'x'.repeat(100000) };
    expect(validatePost(input)).toEqual({});
    expect(input.title).toBe(' <script>title</script> ');
  });
  it.each(invalidValues)('rejects invalid title and content %j', (value) => {
    expect(validatePost({ title: value, content: 'valid' })).toEqual({ title: 'Title is required.' });
    expect(validatePost({ title: 'valid', content: value })).toEqual({ content: 'Content is required.' });
  });
  it.each([undefined, null, {}, [], false, 42].map((value) => [value]))('rejects missing post fields %j', (value) => {
    expect(Object.keys(validatePost(value))).toEqual(['title', 'content']);
  });
});

describe('validateRegistration', () => {
  it('accepts meaningful exact password spaces, ignores extra role and leaves input unchanged', () => {
    const input = { ...valid, role: 'admin' };
    expect(validateRegistration(input, [user])).toEqual({});
    expect(input).toEqual({ ...valid, role: 'admin' });
  });
  for (const field of ['displayName', 'username', 'password', 'confirmPassword']) {
    it.each(invalidValues)(`rejects invalid ${field} %j`, (value) => {
      expect(validateRegistration({ ...valid, [field]: value })).toHaveProperty(field);
    });
  }
  it.each([undefined, null, {}, [], 7].map((value) => [value]))('rejects missing registration fields %j', (input) => {
    expect(Object.keys(validateRegistration(input))).toEqual(['displayName', 'password', 'username', 'confirmPassword']);
  });
  it.each(['ADMIN', ' admin ', 'JaMiE', ' jamie '])('rejects normalized duplicate or reserved %s', (username) => {
    expect(validateRegistration({ ...valid, username }, [user]).username).toBe('Username is already taken.');
  });
  it('also normalizes legacy mixed-case and padded comparison rows without mutating them', () => {
    const rows = [{ username: ' ROBIN ' }, null, {}, { username: 7 }];
    expect(validateRegistration(valid, rows).username).toBe('Username is already taken.');
    expect(rows[0].username).toBe(' ROBIN ');
  });
  it.each(['demo', ' DEMO ', ' demo  '])('rejects nonexact password confirmation %s', (confirmPassword) => {
    expect(validateRegistration({ ...valid, confirmPassword }).confirmPassword).toBe('Passwords do not match.');
  });
  it.each([null, {}, 'rows', 0])('rejects invalid users argument %j', (users) => {
    expect(validateRegistration(valid, users).users).toBe('Account data is unavailable.');
  });
});

describe('validateAdminAccount', () => {
  it.each(['user', 'admin'])('accepts explicit %s role without confirmation', (role) => {
    expect(validateAdminAccount({ ...valid, confirmPassword: undefined, role })).toEqual({});
  });
  it.each([undefined, null, '', 'owner', 'ADMIN', false, 0, {}])('rejects invalid role %j', (role) => {
    expect(validateAdminAccount({ ...valid, role }).role).toBe('Choose a valid role.');
  });
  it('shares duplicate and required field validation', () => {
    expect(validateAdminAccount({ displayName: '', username: 'ADMIN', password: '', role: 'user' })).toEqual({
      displayName: 'Display name is required.', password: 'Password is required.', username: 'Username is already taken.',
    });
    expect(validateAdminAccount(null)).toHaveProperty('role');
  });
});
