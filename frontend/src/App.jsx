/** Own the single router and discovery shell; later slices extend this route tree. */
import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar.jsx';
import { Notice } from './components/Notice.jsx';
import Landing from './pages/Landing.jsx';
import NotFound from './pages/NotFound.jsx';
import { clearSession, readSession } from './utils/storage.js';

const footerLinks = [
  { to: '/', label: 'Home' },
  { to: '/blogs', label: 'All Blogs' },
  { to: '/login', label: 'Login' },
  { to: '/register', label: 'Register' },
];

/**
 * Render the discovery shell from a fail-closed session result.
 * Returns:
 *   Shared navbar/footer, public landing and wildcard fallback only.
 * Notes:
 *   Explicit logout changes the rendered session only after successful removal.
 */
export default function App() {
  const [sessionRead, setSessionRead] = useState({ ok: true, value: null });
  const [logoutFailed, setLogoutFailed] = useState(false);
  useEffect(() => {
    setSessionRead(readSession());
  }, []);

  /** Clear local session on activation, preserving the view if removal fails. */
  function handleLogout() {
    const result = clearSession();
    setLogoutFailed(!result.ok);
    if (result.ok) setSessionRead({ ok: true, value: null });
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
    </BrowserRouter>
  );
}
