/** Own the single router and discovery shell; later slices extend this route tree. */
import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
import { logout, getSession } from './utils/auth.js';

const protectedViews = {
  '/blogs': Blogs,
  '/blog/:id': BlogDetail,
  '/write': WriteBlog,
  '/edit/:id': EditBlog,
  '/admin': AdminDashboard,
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
 * Refresh resolved identity on mount and location transitions.
 * Returns:
 *   Existing discovery shell with identity routes and fail-closed guards.
 * Notes:
 *   Future route content remains the existing fallback until its owning slice lands.
 */
function Shell() {
  const [sessionRead, setSessionRead] = useState({ ok: true, value: null });
  const [logoutFailed, setLogoutFailed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setSessionRead(getSession());
    setLogoutFailed(false);
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
        {(!sessionRead.ok || logoutFailed) && (
          <div className="mx-auto w-full max-w-6xl px-6 pt-4">
            {logoutFailed ? (
              <p role="alert" className="rounded-card bg-error-light p-4 text-error">
                Logout could not be saved. Your local session has not been cleared.
              </p>
            ) : (
              <Notice kind="storage" />
            )}
          </div>
        )}
        <main id="main-content" tabIndex={-1} className="flex-1">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login onSessionChange={handleSessionChange} />} />
            <Route path="/register" element={<Register onSessionChange={handleSessionChange} />} />
            {['/blogs', '/blog/:id', '/write', '/edit/:id', '/admin', '/users'].map((path) => {
              const View = protectedViews[path] ?? NotFound;
              return (
                <Route
                  key={path}
                  path={path}
                  element={(
                    <ProtectedRoute adminOnly={path === '/admin' || path === '/users'}>
                      <View />
                    </ProtectedRoute>
                  )}
                />
              );
            })}
            <Route path="*" element={<NotFound />} />
          </Routes>
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
