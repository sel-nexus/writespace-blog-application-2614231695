/** Own the single router and discovery shell; later slices extend this route tree. */
import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import { Navbar } from './components/Navbar.jsx';
import { Notice } from './components/Notice.jsx';
import Landing from './pages/Landing.jsx';
import NotFound from './pages/NotFound.jsx';
import Blogs from './pages/Blogs.jsx';
import BlogDetail from './pages/BlogDetail.jsx';
import WriteBlog from './pages/WriteBlog.jsx';
import EditBlog from './pages/EditBlog.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import Users from './pages/Users.jsx';
import { logout, getSession } from './utils/auth.js';
import { initializePosts } from './utils/bootstrap.js';

const protectedViews = {
  '/blogs': Blogs,
  '/blog/:id': BlogDetail,
  '/write': WriteBlog,
  '/edit/:id': EditBlog,
  '/admin': AdminDashboard,
  '/users': Users,
};

const footerLinks = [
  { to: '/', label: 'Home' },
  { to: '/blogs', label: 'All Blogs' },
  { to: '/login', label: 'Login' },
  { to: '/register', label: 'Register' },
];

/**
 * Own the only browser router while keeping navigation hooks inside its shell.
 * Returns:
 *   Shared shell and incrementally implemented route tree.
 */
export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Shell />
    </BrowserRouter>
  );
}

/**
 * Initialize local posts before mounting data views and resolve identity on known routes.
 * Returns:
 *   The discovery shell with guarded routes, initialization warnings, and safe post controls.
 * Notes:
 *   Startup writes run only in an effect and are not retried by StrictMode effect replay.
 *   Unknown routes skip bootstrap and session invalidation. Failed startup remains read-only
 *   until a new shell lifecycle; route views retain their existing fresh collection reads.
 */
function Shell() {
  const [sessionRead, setSessionRead] = useState({ ok: true, value: null });
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [bootstrap, setBootstrap] = useState(null);
  // Construct only a closure during render; storage work still happens in the effect.
  const [initializeOnce] = useState(() => {
    let result = null;
    /**
     * Resolve storage only once per shell lifecycle, including failed initialization.
     * Returns:
     *   The first bootstrap result; a new mount is required for an explicit startup retry.
     */
    return () => {
      if (result === null) result = initializePosts();
      return result;
    };
  });
  const location = useLocation();
  const navigate = useNavigate();
  const knownRoute = ['/', '/login', '/register', ...Object.keys(protectedViews)]
    .some((path) => matchPath({ path, end: true }, location.pathname));
  const bootstrapFailed = bootstrap !== null && !bootstrap.ok;

  useEffect(() => {
    if (knownRoute && bootstrap === null) setBootstrap(initializeOnce());
  }, [knownRoute, bootstrap, initializeOnce]);

  useEffect(() => {
    // Unknown routes must not trigger even best-effort session invalidation writes.
    if (knownRoute) setSessionRead(getSession());
    setLogoutFailed(false);
    const titles = {
      '/': 'WriteSpace', '/login': 'Sign in', '/register': 'Create account',
      '/blogs': 'All Blogs', '/write': 'Write a post', '/admin': 'Admin dashboard', '/users': 'Manage users',
    };
    const title = titles[location.pathname]
      ?? (location.pathname.startsWith('/blog/') ? 'Read post'
        : location.pathname.startsWith('/edit/') ? 'Edit post' : 'Page not found');
    document.title = title === 'WriteSpace' ? title : `${title} | WriteSpace`;
  }, [location.key, location.pathname]);

  /**
   * Update the shell from a session that has already been persisted.
   * Args:
   *   session: Successful login or registration identity.
   * Returns:
   *   Nothing; the next location transition also resolves storage afresh.
   */
  function handleSessionChange(session) {
    setSessionRead({ ok: true, value: session });
    setLogoutFailed(false);
  }

  /**
   * Clear local session before rendering guest navigation and returning home.
   * Returns:
   *   Nothing; failed removal preserves the current identity and route.
   */
  function handleLogout() {
    const result = logout();
    if (result.ok) {
      // The location effect sets guest state after navigation commits. A synchronous
      // shell update here would re-render the old guard during router transitions.
      navigate('/');
    } else {
      setLogoutFailed(true);
    }
  }

  return (
      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <a
          href="#main-content"
          className="sr-only z-30 rounded-full bg-surface p-3 focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Navbar session={sessionRead.ok ? sessionRead.value : null} onLogout={handleLogout} />
        {(!sessionRead.ok || logoutFailed || (knownRoute && bootstrapFailed)) && (
          <div className="mx-auto w-full max-w-6xl px-6 pt-4">
            {logoutFailed ? (
              <p role="alert" className="rounded-card bg-error-light p-4 text-error">
                Logout could not be saved. Your local session has not been cleared.
              </p>
            ) : (
              <Notice kind="storage" />
            )}
            {knownRoute && bootstrapFailed && (
              <p className="mt-2 text-sm text-error">
                Local post initialization could not be completed. Post changes are disabled.
                {bootstrap.code === 'marker-write-failed' && ' Saved posts remain available; reload to retry initialization.'}
                {bootstrap.code === 'posts-write-failed' && ' Starter posts were not saved.'}
              </p>
            )}
          </div>
        )}
        <main id="main-content" tabIndex={-1} className="flex-1">
          {knownRoute && bootstrap === null ? (
            <p role="status">Loading local posts…</p>
          ) : (
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login onSessionChange={handleSessionChange} />} />
              <Route path="/register" element={<Register onSessionChange={handleSessionChange} />} />
              {Object.keys(protectedViews).map((path) => {
                const View = protectedViews[path];
                return (
                  <Route
                    key={path}
                    path={path}
                    element={(
                      <ProtectedRoute adminOnly={path === '/admin' || path === '/users'}>
                        {bootstrapFailed && (path === '/write' || path === '/edit/:id') ? (
                          <p role="status">Post changes are disabled until local initialization succeeds.</p>
                        ) : (
                          <fieldset
                            disabled={bootstrapFailed && path !== '/users'}
                            className="m-0 min-w-0 border-0 p-0"
                            aria-label={bootstrapFailed && path !== '/users' ? 'Read-only posts' : undefined}
                          >
                            <View />
                          </fieldset>
                        )}
                      </ProtectedRoute>
                    )}
                  />
                );
              })}
              <Route path="*" element={<NotFound />} />
            </Routes>
          )}
        </main>
        <footer className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 px-6 py-8 sm:flex-row sm:items-center">
            <p className="text-sm text-foreground-muted">
              © {new Date().getFullYear()} WriteSpace
            </p>
            <nav aria-label="Footer" className="flex flex-wrap gap-5 text-sm">
              {footerLinks.map((link) => (
                <Link key={link.to} to={link.to} className="rounded-sm hover:text-primary-800 hover:underline">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </footer>
      </div>
  );
}
