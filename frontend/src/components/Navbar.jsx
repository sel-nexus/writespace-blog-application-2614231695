/** Present public and resolved-role links with explicit mobile and logout actions. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { BookOpen, List, X } from '@phosphor-icons/react';
import { RoleAvatar } from './RoleAvatar.jsx';

const linkStyle = 'rounded-full px-4 py-2 text-sm font-bold hover:bg-surface-raised '
  + 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';

/** Apply a visible current-route treatment. */
function navigationStyle({ isActive }) {
  return `${linkStyle} ${isActive ? 'bg-primary-50 text-primary-800' : 'text-foreground-muted'}`;
}

/**
 * Render links only from a session already resolved by the parent.
 * Args:
 *   session: Valid resolved session or null.
 *   onLogout: Explicit action callback; parent owns persistence and error state.
 * Returns:
 *   Responsive shared header, with no storage access.
 */
export function Navbar({ session = null, onLogout }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const links = session
    ? [
      { to: '/', label: 'Home' },
      { to: '/blogs', label: 'All Blogs' },
      { to: '/write', label: 'Write Blog' },
      ...(session.role === 'admin'
        ? [{ to: '/admin', label: 'Dashboard' }, { to: '/users', label: 'Users' }]
        : []),
    ]
    : [
      { to: '/', label: 'Home' },
      { to: '/blogs', label: 'All Blogs' },
      { to: '/login', label: 'Login' },
      { to: '/register', label: 'Register' },
    ];

  /** Close the mobile disclosure and request the parent's logout action. */
  function handleLogout() {
    setOpen(false);
    onLogout();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link
          to={session ? (session.role === 'admin' ? '/admin' : '/blogs') : '/'}
          className="flex items-center gap-2 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="WriteSpace home"
        >
          <BookOpen size={28} weight="duotone" className="text-primary-700" aria-hidden="true" />
          <span className="font-display text-2xl font-bold tracking-tight">
            WriteSpace
          </span>
        </Link>
        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen(!open)}
          className={`${linkStyle} md:hidden`}
        >
          {open ? <X size={24} aria-hidden="true" /> : <List size={24} aria-hidden="true" />}
        </button>
        <nav
          id="primary-navigation"
          aria-label="Primary"
          className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-2 md:flex md:w-auto md:flex-row md:flex-wrap md:items-center`}
        >
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end className={navigationStyle}>
              {link.label}
            </NavLink>
          ))}
          {session && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 md:border-t-0 md:pt-0">
              <RoleAvatar role={session.role} />
              <span className="max-w-40 break-words text-sm">
                {session.displayName}
              </span>
              <button type="button" onClick={handleLogout} className={linkStyle}>
                Logout
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

Navbar.propTypes = {
  session: PropTypes.shape({
    userId: PropTypes.string.isRequired,
    username: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['user', 'admin']).isRequired,
  }),
  onLogout: PropTypes.func.isRequired,
};
