/** Verify transient appearance through real routing, forms and browser-storage boundaries. */
import { StrictMode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';
import { AppShell } from '../src/components/AppShell.jsx';
import { AppearanceToggle } from '../src/components/AppearanceToggle.jsx';
import { Navbar } from '../src/components/Navbar.jsx';
import { getInitialAppearance, normalizeAppearance, toggleAppearance } from '../src/utils/appearance.js';
import { post, user, session } from './fixtures.js';

const admin = { userId: 'writespace-demo-admin', username: 'admin', displayName: 'Admin', role: 'admin' };

/** Seed initialized storage before installing observers, keeping bootstrap writes out of appearance assertions. */
function seed(identity = null, posts = [post]) {
  localStorage.setItem('writespace_bootstrap_v1', JSON.stringify({ version: 1, initialized: true }));
  localStorage.setItem('writespace_posts', JSON.stringify(posts));
  localStorage.setItem('writespace_users', JSON.stringify([user]));
  if (identity) localStorage.setItem('writespace_session', JSON.stringify(identity));
}

/** Render the real application with a single initial browser entry. */
function enter(path = '/') {
  window.history.replaceState({}, '', path);
  return render(<App />);
}

/** Assert root semantics, exactly one control, and the currently offered action. */
function expectMode(mode) {
  const button = screen.getByRole('button', { name: `Switch to ${mode === 'light' ? 'dark' : 'light'} mode` });
  expect(button).toHaveTextContent(`${mode === 'light' ? 'Light' : 'Dark'} mode`);
  expect(button).toHaveAttribute('aria-pressed', String(mode === 'dark'));
  expect(screen.getAllByRole('button', { name: /Switch to .* mode/ })).toHaveLength(1);
  const root = screen.getByRole('main').parentElement;
  expect(root).toHaveAttribute('data-appearance', mode);
  expect(root.style.colorScheme).toBe(mode);
  return button;
}

/** Activate an actual shared primary-navigation link. */
async function navigate(actor, name) {
  await actor.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name, exact: true }));
}

describe('pure transient appearance', () => {
  it('starts light without consulting storage or system preferences', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(getInitialAppearance()).toBe('light');
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([['light', 'dark'], ['dark', 'light']])('switches %s to %s', (current, next) => {
    expect(toggleAppearance(current)).toBe(next);
    expect(normalizeAppearance(current)).toBe(current);
  });

  it.each([undefined, null, '', 'Dark', 'system', 0, false, {}, [], ['dark']].map((value) => [value]))(
    'falls back light without coercing invalid value %j', (value) => {
      expect(normalizeAppearance(value)).toBe('light');
      expect(toggleAppearance(value)).toBe('light');
    },
  );
});

describe('shared appearance components', () => {
  it.each(['light', 'dark'])('exposes %s state, explicit action and native keyboard callback', async (appearance) => {
    const actor = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(<AppearanceToggle appearance={appearance} onToggle={onToggle} />);
    const next = toggleAppearance(appearance);
    const button = screen.getByRole('button', { name: `Switch to ${next} mode` });
    expect(button).toHaveTextContent(`${appearance === 'light' ? 'Light' : 'Dark'} mode`);
    expect(button).toHaveAttribute('aria-pressed', String(appearance === 'dark'));
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await actor.tab();
    expect(button).toHaveFocus();
    await actor.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<AppearanceToggle appearance={next} onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: `Switch to ${appearance} mode` })).toHaveAttribute('aria-pressed', String(next === 'dark'));
    await actor.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(2);
    await actor.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(3);
  });

  it.each(['light', 'dark'])('applies %s variables to one root without extra routers or landmarks', (appearance) => {
    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppShell appearance={appearance} onToggleAppearance={() => {}} onLogout={() => {}}>
          <main id="main-content">Existing route content</main>
        </AppShell>
      </MemoryRouter>,
    );
    expectMode(appearance);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(container.firstChild.style.getPropertyValue('--color-surface')).toBe(appearance === 'light' ? '255 255 255' : '36 34 43');
    expect(container.firstChild.style.getPropertyValue('--color-primary-text-700')).toBe(appearance === 'light' ? '67 56 202' : '165 180 252');
  });

  it('keeps additive Navbar defaults and the one control outside the closed mobile disclosure', async () => {
    const actor = userEvent.setup();
    render(<MemoryRouter><Navbar session={session} onLogout={() => {}} /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const toggle = screen.getByRole('button', { name: 'Switch to dark mode' });
    expect(nav).toHaveClass('hidden');
    expect(nav).not.toContainElement(toggle);
    expect(toggle).toBeVisible();
    expect(within(nav).queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(nav).toHaveClass('flex');
    expect(screen.getAllByRole('button', { name: /Switch to/ })).toHaveLength(1);
    await actor.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(toggle).toBeVisible();
  });
});

describe('real application appearance lifecycle', () => {
  it('retains dark through public login and registration navigation with no storage writes/removals', async () => {
    seed();
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const removals = vi.spyOn(Storage.prototype, 'removeItem');
    const actor = userEvent.setup();
    enter();
    await screen.findByRole('heading', { level: 1 });
    await actor.click(expectMode('light'));
    expectMode('dark');
    await navigate(actor, 'Login');
    await screen.findByRole('heading', { name: 'Sign in', exact: true });
    expectMode('dark');
    await navigate(actor, 'Register');
    await screen.findByLabelText('Display name', { exact: true });
    expectMode('dark');
    await navigate(actor, 'Home');
    expectMode('dark');
    expect(writes).not.toHaveBeenCalled();
    expect(removals).not.toHaveBeenCalled();
  });

  it.each([session, admin])('keeps reading/editing/writing and role navigation stable for $role without storage mutation', async (identity) => {
    seed(identity);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const removals = vi.spyOn(Storage.prototype, 'removeItem');
    const actor = userEvent.setup();
    enter('/blogs');
    await screen.findByRole('heading', { name: 'All Blogs', exact: true });
    await actor.click(expectMode('light'));
    await actor.click(screen.getByRole('link', { name: post.title, exact: true }));
    await screen.findByRole('heading', { name: post.title, exact: true });
    expectMode('dark');
    await actor.click(screen.getByRole('link', { name: 'Edit', exact: true }));
    expect(await screen.findByLabelText('Title', { exact: true })).toHaveValue(post.title);
    expectMode('dark');
    await actor.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    await navigate(actor, 'Write Blog');
    const title = await screen.findByLabelText('Title', { exact: true });
    const content = screen.getByLabelText('Content', { exact: true });
    await actor.type(title, 'Unsaved title');
    await actor.type(content, 'Unsaved content');
    await actor.click(expectMode('dark'));
    expect(title).toHaveValue('Unsaved title');
    expect(content).toHaveValue('Unsaved content');
    expect(title).toBe(screen.getByLabelText('Title', { exact: true }));
    await actor.click(expectMode('light'));
    await actor.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    if (identity.role === 'admin') {
      await navigate(actor, 'Dashboard');
      await screen.findByRole('heading', { name: /dashboard/i });
      expectMode('dark');
      await navigate(actor, 'Users');
      await screen.findByRole('heading', { name: 'Manage users', exact: true });
      expectMode('dark');
    } else {
      expect(screen.queryByRole('link', { name: 'Users', exact: true })).not.toBeInTheDocument();
    }
    await navigate(actor, 'Home');
    expectMode('dark');
    // Unknown URLs have no app link; exercise BrowserRouter's actual history listener.
    await act(async () => {
      window.history.pushState({}, '', '/appearance-unknown');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(window.location.pathname).toBe('/appearance-unknown');
    expectMode('dark');
    await actor.click(within(screen.getByRole('navigation', { name: 'Footer' })).getByRole('link', { name: 'Home' }));
    expectMode('dark');
    expect(writes).not.toHaveBeenCalled();
    expect(removals).not.toHaveBeenCalled();
  });

  it('resets light on remount without persisting appearance or resurrecting an initialized empty store', async () => {
    seed(null, []);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const actor = userEvent.setup();
    const view = enter();
    await screen.findByRole('heading', { level: 1 });
    await actor.click(expectMode('light'));
    expectMode('dark');
    view.unmount();
    enter();
    await screen.findByRole('heading', { level: 1 });
    expectMode('light');
    expect(JSON.parse(localStorage.getItem('writespace_posts'))).toEqual([]);
    expect(writes).not.toHaveBeenCalled();
  });

  it('still toggles when storage is denied without retrying failed bootstrap or losing login input', async () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    const actor = userEvent.setup();
    enter('/login');
    const username = await screen.findByLabelText('Username', { exact: true });
    await actor.type(username, 'still here');
    const markerReadsBefore = read.mock.calls.filter(([key]) => key === 'writespace_bootstrap_v1').length;
    await actor.click(expectMode('light'));
    expectMode('dark');
    expect(username).toHaveValue('still here');
    // Login still performs its existing identity read on render; startup must not retry.
    expect(read.mock.calls.filter(([key]) => key === 'writespace_bootstrap_v1')).toHaveLength(markerReadsBefore);
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByText(/Post changes are disabled/)).toBeVisible();
  });

  it('preserves first-use StrictMode bootstrap: toggles do not duplicate startup writes', async () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const actor = userEvent.setup();
    render(<StrictMode><App /></StrictMode>);
    await screen.findByRole('heading', { level: 1 });
    const raw = localStorage.getItem('writespace_posts');
    expect(JSON.parse(raw).length).toBeGreaterThan(0);
    expect(writes.mock.calls.map(([key]) => key)).toEqual(['writespace_posts', 'writespace_bootstrap_v1']);
    await actor.click(expectMode('light'));
    await actor.click(expectMode('dark'));
    expect(writes).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
  });
});
