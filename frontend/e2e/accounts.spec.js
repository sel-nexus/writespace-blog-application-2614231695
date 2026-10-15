/** Exercise real local account journeys; shared fixtures fail on browser warnings/errors and preserve reload state. */
import { test, expect, seedLocalData, captureView } from './fixtures.js';

const user = {
  id: 'bdf27466-18c4-4b8d-9e83-10a44668c590', displayName: 'Jamie Writer', username: 'jamie',
  password: 'demo-only', role: 'user', createdAt: '2020-10-14T12:30:00.000Z',
};
const admin = {
  ...user, id: 'ef147466-18c4-4b8d-9e83-10a44668c590', displayName: 'Robin Admin', username: 'robin', role: 'admin',
};
const post = {
  id: '8b1a849e-32e6-4d5a-87f1-3f99c5f0f135', title: 'Keep this post', content: 'Posts survive account deletion.',
  createdAt: '2020-10-14T12:30:00.000Z', authorId: user.id, authorName: user.displayName,
};
const demoSession = { userId: 'writespace-demo-admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const writerSession = { userId: user.id, username: user.username, displayName: user.displayName, role: user.role };
const adminSession = { userId: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role };

/** Read all durable browser records without altering them. */
async function stored(page) {
  return page.evaluate(() => ({
    users: JSON.parse(localStorage.getItem('writespace_users')),
    posts: JSON.parse(localStorage.getItem('writespace_posts')),
    session: JSON.parse(localStorage.getItem('writespace_session')),
  }));
}

/** Sign in using the actual labelled login form. */
async function signIn(page, username = 'admin', password = 'admin') {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(username === 'admin' || username === 'robin' ? /\/admin$/ : /\/blogs$/);
}

/** Activate a shared navigation link, opening its mobile disclosure if necessary. */
async function navigation(page, name) {
  const primary = page.getByRole('navigation', { name: 'Primary' });
  if (!(await primary.isVisible())) await page.getByRole('button', { name: 'Open menu' }).click();
  await primary.getByRole('link', { name, exact: true }).click();
}

/** Populate role creation through shared AccountForm labels. */
async function fillAccount(page, name, username, role) {
  await page.getByLabel('Display name', { exact: true }).fill(name);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(' exact password ');
  await page.getByLabel('Role', { exact: true }).selectOption(role);
}

/** Scope desktop rows to the visible table so hidden mobile duplicates never create ambiguous selectors. */
function desktopRow(page, username) {
  return page.getByRole('table', { name: 'Accounts' }).getByRole('row').filter({
    has: page.getByRole('button', { name: `Delete ${username}`, exact: true }),
  });
}

test('admin login, quick action, create both roles, validate fields, confirm deletion, reload and log in as created user',
  async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedLocalData(page, { writespace_users: JSON.stringify([admin]), writespace_posts: JSON.stringify([post]) });
    await page.goto('/login');
    await signIn(page);
    const before = { users: [admin], posts: [post], session: demoSession };
    expect(await stored(page)).toEqual(before);
    await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link', { name: 'Manage users' }).click();
    await expect(page.getByRole('heading', { name: 'Manage users', exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Accounts' })).toBeVisible();
    await expect(page.getByLabel('Mobile accounts')).toBeHidden();
    const fixed = desktopRow(page, 'admin');
    await expect(fixed.getByText('Built-in', { exact: true })).toBeVisible();
    await expect(fixed.getByRole('button', { name: 'Delete admin', exact: true })).toBeDisabled();
    await expect(fixed.getByRole('button')).toHaveAttribute('title', 'Default admin cannot be deleted.');
    expect(await stored(page)).toEqual(before);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    for (const message of ['Display name is required.', 'Username is required.', 'Password is required.']) {
      await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    }
    expect(await stored(page)).toEqual(before);

    await fillAccount(page, '  New Writer  ', ' NeWWriter ', 'user');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const createdWriterState = await stored(page);
    const writer = createdWriterState.users.find((record) => record.username === 'newwriter');
    expect(writer).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/), createdAt: expect.any(String),
      displayName: 'New Writer', username: 'newwriter', role: 'user', password: ' exact password ',
    });
    expect(Number.isFinite(Date.parse(writer.createdAt))).toBe(true);
    expect(createdWriterState).toEqual({ ...before, users: [admin, writer] });
    await expect(desktopRow(page, 'newwriter').getByText('New Writer', { exact: true })).toBeVisible();
    await expect(desktopRow(page, 'newwriter').getByRole('img', { name: 'User avatar' })).toBeVisible();
    await expect(desktopRow(page, 'newwriter').getByRole('status')).toHaveText('User');
    await expect(page.getByLabel('Username', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Confirm password', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Account created. Your current sign-in has not changed.')).toBeVisible();

    await fillAccount(page, 'New Admin', 'newadmin', 'admin');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const createdState = await stored(page);
    const newAdmin = createdState.users.find((record) => record.username === 'newadmin');
    expect(newAdmin).toMatchObject({ displayName: 'New Admin', username: 'newadmin', role: 'admin', password: ' exact password ' });
    expect(newAdmin.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isFinite(Date.parse(newAdmin.createdAt))).toBe(true);
    expect(createdState).toEqual({ ...before, users: [admin, writer, newAdmin] });
    await expect(desktopRow(page, 'newadmin').getByRole('status')).toHaveText('Admin');
    await expect(page.getByLabel('Role', { exact: true })).toHaveValue('user');

    for (const role of ['user', 'admin']) {
      for (const username of [' NEWwriter ', ' ADMIN ']) {
        await fillAccount(page, 'Rejected account', username, role);
        await page.getByRole('button', { name: 'Create account', exact: true }).click();
        await expect(page.getByRole('alert')).toHaveText('Username is already taken.');
        await expect(page.getByLabel('Username', { exact: true })).toHaveValue(username);
        expect(await stored(page)).toEqual(createdState);
      }
    }
    await captureView(page, testInfo, 'accounts-desktop-populated-validation');
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Delete this account? This cannot be undone.');
      await dialog.dismiss();
    });
    await desktopRow(page, 'newadmin').getByRole('button').click();
    expect(await stored(page)).toEqual(createdState);
    await expect(desktopRow(page, 'newadmin')).toBeVisible();
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Delete this account? This cannot be undone.');
      await dialog.accept();
    });
    await desktopRow(page, 'newadmin').getByRole('button').click();
    await expect(desktopRow(page, 'newadmin')).toHaveCount(0);
    expect(await stored(page)).toEqual(createdWriterState);
    await expect(page).toHaveURL(/\/users$/);
    await page.reload();
    await expect(desktopRow(page, 'newwriter')).toBeVisible();
    await expect(desktopRow(page, 'newadmin')).toHaveCount(0);
    expect(await stored(page)).toEqual(createdWriterState);
    await navigation(page, 'Dashboard');
    const count = page.locator('dl > div').filter({ has: page.getByText('Registered Users', { exact: true }) }).locator('dd');
    await expect(count).toHaveText('2');
    await navigation(page, 'Users');
    await expect(page.getByRole('heading', { name: 'Manage users' })).toBeVisible();
    const primary = page.getByRole('navigation', { name: 'Primary' });
    await primary.getByRole('button', { name: 'Logout', exact: true }).click();
    await primary.getByRole('link', { name: 'Login', exact: true }).click();
    await signIn(page, 'newwriter', ' exact password ');
    await expect(page.getByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
    expect((await stored(page)).session).toEqual({
      userId: writer.id, username: writer.username, displayName: writer.displayName, role: 'user',
    });
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  },
);

test('registered admin logs in, enters via navbar and sees self/default protection on populated mobile cards',
  async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedLocalData(page, { writespace_users: JSON.stringify([user, admin]), writespace_posts: JSON.stringify([post]) });
    await page.goto('/login');
    await signIn(page, 'robin', 'demo-only');
    await navigation(page, 'Users');
    await expect(page.getByRole('heading', { name: 'Manage users' })).toBeVisible();
    const before = { users: [user, admin], posts: [post], session: adminSession };
    expect(await stored(page)).toEqual(before);
    await expect(page.getByRole('table', { name: 'Accounts', includeHidden: true })).toBeHidden();
    const cards = page.getByLabel('Mobile accounts');
    await expect(cards).toBeVisible();
    await expect(cards.getByRole('article')).toHaveCount(3);
    const self = cards.getByRole('article', { name: 'Account robin', exact: true });
    await expect(self.getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    await expect(self.getByRole('button')).toBeDisabled();
    await expect(self.getByRole('button')).toHaveAttribute('title', 'You cannot delete your current account.');
    const fixed = cards.getByRole('article', { name: 'Account admin', exact: true });
    await expect(fixed.getByRole('button')).toBeDisabled();
    await expect(fixed.getByRole('button')).toHaveAttribute('title', 'Default admin cannot be deleted.');
    await expect(fixed.getByText('Built-in', { exact: true })).toBeVisible();
    const writer = cards.getByRole('article', { name: 'Account jamie', exact: true });
    await expect(writer.getByText('Jamie Writer', { exact: true })).toBeVisible();
    await expect(writer.getByText('Created Oct 14, 2020', { exact: true })).toBeVisible();
    await expect(writer.getByRole('status')).toHaveText('User');
    await captureView(page, testInfo, 'accounts-mobile-populated');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    page.once('dialog', async (dialog) => { await dialog.dismiss(); });
    await writer.getByRole('button').click();
    expect(await stored(page)).toEqual(before);
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await writer.getByRole('button').click();
    await expect(writer).toHaveCount(0);
    expect(await stored(page)).toEqual({ ...before, users: [admin] });
    await page.reload();
    await expect(cards.getByRole('article')).toHaveCount(2);
    expect(await stored(page)).toEqual({ ...before, users: [admin] });
  },
);

test('guest initial direct users entry redirects to login without altering records', async ({ page }) => {
  await seedLocalData(page, { writespace_users: JSON.stringify([user]), writespace_posts: JSON.stringify([post]) });
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Manage users' })).toHaveCount(0);
  expect(await stored(page)).toEqual({ users: [user], posts: [post], session: null });
});

test('ordinary initial direct users entry returns to blogs without administrator controls', async ({ page }) => {
  await seedLocalData(page, {
    writespace_users: JSON.stringify([user]), writespace_posts: JSON.stringify([post]),
    writespace_session: JSON.stringify(writerSession),
  });
  await page.goto('/users');
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  expect(await stored(page)).toEqual({ users: [user], posts: [post], session: writerSession });
});

test('missing users stay missing on read and show the display-only fixed administrator and empty state', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedLocalData(page, { writespace_bootstrap_v1: JSON.stringify({ version: 1, initialized: true }) });
  await page.goto('/login');
  await signIn(page);
  await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link', { name: 'Manage users' }).click();
  await expect(page.getByText('No registered accounts yet.', { exact: true })).toBeVisible();
  await expect(page.getByText(/0 registered accounts/)).toBeVisible();
  await expect(desktopRow(page, 'admin').getByText('Built-in')).toBeVisible();
  expect(await stored(page)).toEqual({ users: null, posts: null, session: demoSession });
  await captureView(page, testInfo, 'accounts-empty');
});

test('corrupt users show warning and disabled creation without overwriting raw data', async ({ page }, testInfo) => {
  await seedLocalData(page, { writespace_users: '{broken', writespace_posts: JSON.stringify([post]) });
  await page.goto('/login');
  await signIn(page);
  await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link', { name: 'Manage users' }).click();
  await expect(page.getByText('Local data could not be read. It has not been changed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
  await expect(page.getByText('No registered accounts yet.', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBe('{broken');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts')))).toEqual([post]);
  await captureView(page, testInfo, 'accounts-corrupt');
});
