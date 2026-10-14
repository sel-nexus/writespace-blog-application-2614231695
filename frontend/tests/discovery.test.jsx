/** Verify public copy, guarded previews, responsive controls, and safe fallback. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import Landing from '../src/pages/Landing.jsx';
import { Navbar } from '../src/components/Navbar.jsx';
import { Notice, DEMO_MESSAGE, STORAGE_WARNING } from '../src/components/Notice.jsx';
import { PostCard } from '../src/components/PostCard.jsx';
import { RoleAvatar } from '../src/components/RoleAvatar.jsx';
import { DEMO_ADMIN, POSTS_KEY, USERS_KEY, SESSION_KEY } from '../src/utils/storage.js';
import { makePost, post, session, user } from './fixtures.js';

/** Render a shared component under the same warning-free router flags. */
function renderInRouter(component, entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {component}
    </MemoryRouter>,
  );
}

/** Persist test fixtures directly without mocking application storage helpers. */
function seed(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

describe('landing discovery', () => {
  it('renders exact tagline, named feature cards, CTA destinations and demo copy', () => {
    renderInRouter(<Landing />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your thoughts. Your space. Beautifully simple.');
    for (const name of ['Write Freely', 'Private & Local', 'Instant & Fast']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/blogs');
    expect(screen.getByRole('link', { name: 'Get Started Free' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'View all blogs' })).toHaveAttribute('href', '/blogs');
    expect(screen.getByRole('note')).toHaveTextContent(DEMO_MESSAGE);
    expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(localStorage.length).toBe(0);
  });

  it.each([1, 2, 3, 4])('shows only up to three newest posts from %s records', (count) => {
    const posts = Array.from({ length: count }, (_, index) => makePost(index + 1));
    seed(POSTS_KEY, posts);
    const before = localStorage.getItem(POSTS_KEY);
    renderInRouter(<Landing />);
    const cards = screen.getAllByRole('article').filter((article) => within(article).queryByRole('link'));
    expect(cards).toHaveLength(Math.min(count, 3));
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual(
      posts.slice().reverse().slice(0, 3).map((record) => record.title),
    );
    expect(localStorage.getItem(POSTS_KEY)).toBe(before);
  });

  it.each(['{broken', '{}', JSON.stringify([{ ...post, createdAt: 'invalid' }])])(
    'preserves corrupt raw posts and distinguishes failure from ordinary empty: %s', (raw) => {
      localStorage.setItem(POSTS_KEY, raw);
      renderInRouter(<Landing />);
      expect(screen.getByRole('alert')).toHaveTextContent(STORAGE_WARNING);
      expect(screen.queryByText('No posts yet — check back soon!')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: post.title })).not.toBeInTheDocument();
      expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
    },
  );

  it('shows a visible warning instead of crashing when reads throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('', 'SecurityError'); });
    renderInRouter(<Landing />);
    expect(screen.getByRole('alert')).toHaveTextContent(STORAGE_WARNING);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

describe('shared presentation', () => {
  it('renders title/detail link, exact 120 character excerpt, date, author and user SVG', () => {
    const content = 'x'.repeat(120) + 'HIDDEN_SUFFIX';
    renderInRouter(<PostCard post={{ ...post, content }} />);
    expect(screen.getByRole('link', { name: post.title })).toHaveAttribute('href', `/blog/${post.id}`);
    expect(screen.getByText('x'.repeat(120))).toBeInTheDocument();
    expect(screen.queryByText(/HIDDEN_SUFFIX/)).not.toBeInTheDocument();
    expect(screen.getByText('Oct 14, 2026')).toHaveAttribute('dateTime', post.createdAt);
    expect(screen.getByText(post.authorName)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'User avatar' }).querySelector('svg')).not.toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('escapes markup and retains plain text line breaks without injection', () => {
    const content = '<img src=x onerror=alert(1)>\nSecond line';
    const { container } = renderInRouter(<PostCard post={{ ...post, title: '<script>title</script>', content }} />);
    expect(screen.getByRole('link', { name: '<script>title</script>' })).toBeInTheDocument();
    expect(screen.getByText(/Second line/).textContent).toBe(content);
    expect(screen.getByText(/Second line/)).toHaveClass('whitespace-pre-wrap');
    expect(container.querySelector('script, img')).toBeNull();
  });

  it('derives the fixed admin crown and accepts an explicit registered admin author role', () => {
    const { unmount } = renderInRouter(<PostCard post={{ ...post, authorId: DEMO_ADMIN.userId }} />);
    expect(screen.getByRole('img', { name: 'Admin avatar' }).querySelector('svg')).not.toBeNull();
    unmount();
    renderInRouter(<PostCard post={post} authorRole="admin" />);
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeInTheDocument();
  });

  it.each(['user', 'admin'])('renders the %s role in its approved accent', (role) => {
    render(<RoleAvatar role={role} />);
    const avatar = screen.getByRole('img');
    expect(avatar).toHaveClass(role === 'admin' ? 'bg-secondary-100' : 'bg-primary-100');
    expect(avatar.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('defaults the avatar to the user role', () => {
    render(<RoleAvatar />);
    expect(screen.getByRole('img', { name: 'User avatar' })).toBeInTheDocument();
  });

  it('renders Notice with exact default demo copy and an assertive storage variant', () => {
    const { rerender } = render(<Notice />);
    expect(screen.getByRole('note').textContent).toBe(DEMO_MESSAGE);
    rerender(<Notice kind="storage" />);
    expect(screen.getByRole('alert').textContent).toBe(STORAGE_WARNING);
  });
});

describe('responsive navbar', () => {
  it('offers public links and marks home current without invoking logout', () => {
    const onLogout = vi.fn();
    renderInRouter(<Navbar onLogout={onLogout} />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    for (const [name, href] of [['Home', '/'], ['All Blogs', '/blogs'], ['Login', '/login'], ['Register', '/register']]) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'WriteSpace home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it.each([[session, '/blogs'], [DEMO_ADMIN, '/admin']])('uses role home and explicit role links', (identity, home) => {
    const onLogout = vi.fn();
    renderInRouter(<Navbar session={identity} onLogout={onLogout} />);
    expect(screen.getByRole('link', { name: 'WriteSpace home' })).toHaveAttribute('href', home);
    expect(screen.getByRole('link', { name: 'Write Blog' })).toHaveAttribute('href', '/write');
    expect(screen.getByText(identity.displayName)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
    if (identity.role === 'admin') {
      expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin');
      expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users');
    } else {
      expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    }
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('opens and closes the mobile disclosure through explicit buttons', async () => {
    const actor = userEvent.setup();
    renderInRouter(<Navbar onLogout={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav).toHaveClass('hidden');
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
    await actor.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(nav).not.toHaveClass('hidden');
    await actor.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(nav).toHaveClass('hidden');
  });

  it('closes the disclosure after clicking a route link', async () => {
    const actor = userEvent.setup();
    renderInRouter(<Navbar onLogout={vi.fn()} />);
    await actor.click(screen.getByRole('button', { name: 'Open menu' }));
    await actor.click(screen.getByRole('link', { name: 'All Blogs' }));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'All Blogs' })).toHaveAttribute('aria-current', 'page');
  });

  it('requests logout only on activation and closes the mobile menu', async () => {
    const actor = userEvent.setup();
    const onLogout = vi.fn();
    renderInRouter(<Navbar session={session} onLogout={onLogout} />);
    expect(onLogout).not.toHaveBeenCalled();
    await actor.click(screen.getByRole('button', { name: 'Open menu' }));
    await actor.click(screen.getByRole('button', { name: 'Logout' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('working discovery shell', () => {
  it('shows exact footer destinations/year and skip navigation without future route stubs', () => {
    render(<App />);
    const footer = screen.getByRole('navigation', { name: 'Footer' });
    for (const [name, href] of [['Home', '/'], ['All Blogs', '/blogs'], ['Login', '/login'], ['Register', '/register']]) {
      expect(within(footer).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(screen.getByText(`© ${new Date().getFullYear()} WriteSpace`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
    expect(localStorage.length).toBe(0);
  });

  it.each([['Start Reading', '/login', 'Sign in'], ['Get Started Free', '/register', 'Create account'],
    ['View all blogs', '/login', 'Sign in']])(
    'navigates only after clicking %s through identity routes and returns safely home', async (name, path, heading) => {
      const actor = userEvent.setup();
      render(<App />);
      expect(window.location.pathname).toBe('/');
      await actor.click(screen.getByRole('link', { name }));
      expect(window.location.pathname).toBe(path);
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      await actor.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Home' }));
      expect(window.location.pathname).toBe('/');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your thoughts. Your space. Beautifully simple.');
    },
  );

  it('guards a clicked preview with login without persisting or exposing full text', async () => {
    const actor = userEvent.setup();
    seed(POSTS_KEY, [post]);
    render(<App />);
    await actor.click(screen.getByRole('link', { name: post.title }));
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(localStorage.getItem(POSTS_KEY)).toBe(JSON.stringify([post]));
  });

  it('unknown routes render fallback with unchanged stored collections', async () => {
    const actor = userEvent.setup();
    seed(POSTS_KEY, [post]);
    seed(USERS_KEY, [user]);
    window.history.replaceState({}, '', '/unavailable/deep-link');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(localStorage.getItem(POSTS_KEY)).toBe(JSON.stringify([post]));
    expect(localStorage.getItem(USERS_KEY)).toBe(JSON.stringify([user]));
    await actor.click(screen.getByRole('link', { name: 'Back to Home' }));
    expect(screen.getByRole('link', { name: post.title })).toBeInTheDocument();
  });

  it('ignores stale identity, clears it and renders guest links with a visible warning', () => {
    seed(SESSION_KEY, session);
    render(<App />);
    expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveTextContent('Login');
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(STORAGE_WARNING);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('logout clears session durably and updates public navigation only on success', async () => {
    const actor = userEvent.setup();
    seed(USERS_KEY, [user]);
    seed(SESSION_KEY, session);
    seed(POSTS_KEY, [post]);
    render(<App />);
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).toBe(JSON.stringify(session));
    await actor.click(screen.getByRole('button', { name: 'Logout' }));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Login' })).toBeInTheDocument();
    expect(localStorage.getItem(USERS_KEY)).toBe(JSON.stringify([user]));
    expect(localStorage.getItem(POSTS_KEY)).toBe(JSON.stringify([post]));
    expect(window.location.pathname).toBe('/');
  });

  it('failed logout preserves the session and route and states it was not cleared', async () => {
    const actor = userEvent.setup();
    seed(SESSION_KEY, DEMO_ADMIN);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<App />);
    await actor.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Logout could not be saved. Your local session has not been cleared.');
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).toBe(JSON.stringify(DEMO_ADMIN));
    expect(window.location.pathname).toBe('/');
  });

  it('unavailable storage does not crash the shell and fails closed', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  });
});
