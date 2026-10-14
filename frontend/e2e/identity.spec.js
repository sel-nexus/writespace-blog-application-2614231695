/** Exercise real identity journeys; browser errors are enforced by the automatic fixture. */
import { test, expect, seedLocalData, captureView } from './fixtures.js';

const account = {
  id: 'bdf27466-18c4-4b8d-9e83-10a44668c590',
  displayName: 'Jamie Writer',
  username: 'jamie',
  password: ' demo ',
  role: 'user',
  createdAt: '2026-10-14T12:30:00.000Z',
};
const identity = { userId: account.id, username: account.username, displayName: account.displayName, role: account.role };

/**
 * Enter and submit actual login fields, preserving exact password spaces.
 * Args:
 *   page: Browser page at the login form.
 *   username: Typed username.
 *   password: Typed exact password.
 * Returns:
 *   Promise resolved after the explicit submission.
 */
async function signIn(page, username, password) {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/**
 * Read actual persisted local identity without mutating it.
 * Args:
 *   page: Browser page for the current origin.
 * Returns:
 *   Promise resolving to parsed session or null.
 */
async function storedSession(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')));
}

test('register, persist, auth-route redirect, logout, guard and exact-password relogin', async ({ page }, testInfo) => {
  await seedLocalData(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Get Started Free' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Display name is required.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Display name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Display name', { exact: true }).fill('Robin Writer');
  await page.getByLabel('Username', { exact: true }).fill(' ADMIN ');
  await page.getByLabel('Password', { exact: true }).fill(' demo ');
  await page.getByLabel('Confirm password', { exact: true }).fill('mismatch');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Username is already taken.', { exact: true })).toBeVisible();
  await expect(page.getByText('Passwords do not match.', { exact: true })).toBeVisible();
  expect(await storedSession(page)).toBeNull();
  await captureView(page, testInfo, 'registration-validation');
  await page.getByLabel('Username', { exact: true }).fill(' ROBIN ');
  await page.getByLabel('Confirm password', { exact: true }).fill(' demo ');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByText('Robin Writer', { exact: true })).toBeVisible();
  await expect(nav.getByRole('img', { name: 'User avatar' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
  const saved = await storedSession(page);
  expect(saved).toMatchObject({ username: 'robin', displayName: 'Robin Writer', role: 'user' });
  const users = await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')));
  expect(users).toHaveLength(1);
  expect(users[0]).toMatchObject({ id: saved.userId, username: 'robin', role: 'user', password: ' demo ' });
  await page.reload();
  await expect(nav.getByText('Robin Writer', { exact: true })).toBeVisible();
  expect(await storedSession(page)).toEqual(saved);
  await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Register' }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await nav.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await storedSession(page)).toBeNull();
  await page.getByRole('link', { name: 'Start Reading' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 'robin', 'demo');
  await expect(page.getByText('Invalid username or password.', { exact: true })).toBeVisible();
  expect(await storedSession(page)).toBeNull();
  await signIn(page, ' ROBIN ', ' demo ');
  await expect(page).toHaveURL(/\/blogs$/);
  expect(await storedSession(page)).toEqual(saved);
});

test('guest admin guard and fixed admin login survive corrupt users, then logout returns home', async ({ page }, testInfo) => {
  await seedLocalData(page, { writespace_users: '{broken' });
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('note')).toContainText('Demo only: do not enter real passwords or sensitive information.');
  await signIn(page, 'jamie', 'wrong');
  await expect(page.getByText('Local data could not be read. It has not been changed.', { exact: true })).toBeVisible();
  await captureView(page, testInfo, 'login-storage-warning');
  await signIn(page, ' ADMIN ', 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('img', { name: 'Admin avatar' })).toBeVisible();
  await expect(nav.getByText('Admin', { exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  expect(await storedSession(page)).toEqual({
    userId: 'writespace-demo-admin', username: 'admin', displayName: 'Admin', role: 'admin',
  });
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBe('{broken');
  await page.reload();
  await expect(nav.getByRole('button', { name: 'Logout' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await nav.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await storedSession(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBe('{broken');
});

test('ordinary session is redirected out of admin-only route and mobile logout/login remains usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedLocalData(page, { writespace_users: JSON.stringify([account]), writespace_session: JSON.stringify(identity) });
  await page.goto('/users');
  await expect(page).toHaveURL(/\/blogs$/);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByText('Jamie Writer', { exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await storedSession(page)).toBeNull();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await nav.getByRole('link', { name: 'Login' }).click();
  await captureView(page, testInfo, 'mobile-login');
  await signIn(page, ' JAMIE ', ' demo ');
  await expect(page).toHaveURL(/\/blogs$/);
  expect(await storedSession(page)).toEqual(identity);
});

test('registered admin credentials land on admin home and persist their own role identity', async ({ page }) => {
  const admin = { ...account, role: 'admin' };
  await seedLocalData(page, { writespace_users: JSON.stringify([admin]) });
  await page.goto('/login');
  await signIn(page, ' JAMIE ', ' demo ');
  await expect(page).toHaveURL(/\/admin$/);
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByText('Jamie Writer', { exact: true })).toBeVisible();
  await expect(nav.getByRole('img', { name: 'Admin avatar' })).toBeVisible();
  expect(await storedSession(page)).toEqual({ ...identity, role: 'admin' });
  await nav.getByRole('link', { name: 'Users', exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  await nav.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.reload();
  expect(await storedSession(page)).toEqual({ ...identity, role: 'admin' });
});

test('stale registered identity fails closed and is cleared before login can be used', async ({ page }, testInfo) => {
  await seedLocalData(page, { writespace_users: '[]', writespace_session: JSON.stringify(identity) });
  await page.goto('/write');
  await expect(page).toHaveURL(/\/login$/);
  expect(await storedSession(page)).toBeNull();
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Logout' })).toHaveCount(0);
  await captureView(page, testInfo, 'stale-identity-login');
  await signIn(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  expect((await storedSession(page)).role).toBe('admin');
});
