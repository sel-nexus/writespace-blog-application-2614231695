/** Apply inherited editorial tokens to the whole route tree without owning routing or storage. */
import PropTypes from 'prop-types';
import { Navbar } from './Navbar.jsx';
import { normalizeAppearance } from '../utils/appearance.js';

const appearanceTokens = {
  light: {
    '--color-background': '248 247 244',
    '--color-surface': '255 255 255',
    '--color-surface-raised': '239 238 235',
    '--color-foreground': '41 39 53',
    '--color-foreground-muted': '96 93 107',
    '--color-border': '222 220 228',
    '--color-ring': '79 70 229',
    '--color-primary-50': '238 242 255',
    '--color-primary-100': '224 231 255',
    '--color-primary-text-700': '67 56 202',
    '--color-primary-text-800': '55 48 163',
    '--color-secondary-50': '245 243 255',
    '--color-secondary-100': '237 233 254',
    '--color-secondary-text-700': '109 40 217',
    '--color-secondary-text-800': '91 33 182',
    '--color-success': '22 101 52',
    '--color-success-light': '240 253 244',
    '--color-warning': '133 77 14',
    '--color-warning-light': '254 252 232',
    '--color-error': '153 27 27',
    '--color-error-light': '254 242 242',
    '--color-info': '55 48 163',
    '--color-info-light': '238 242 255',
  },
  dark: {
    '--color-background': '26 25 31',
    '--color-surface': '36 34 43',
    '--color-surface-raised': '48 45 57',
    '--color-foreground': '245 243 247',
    '--color-foreground-muted': '190 185 200',
    '--color-border': '115 109 128',
    '--color-ring': '165 180 252',
    '--color-primary-50': '45 43 68',
    '--color-primary-100': '53 49 80',
    '--color-primary-text-700': '165 180 252',
    '--color-primary-text-800': '199 210 254',
    '--color-secondary-50': '48 39 65',
    '--color-secondary-100': '58 45 77',
    '--color-secondary-text-700': '196 181 253',
    '--color-secondary-text-800': '221 214 254',
    '--color-success': '134 239 172',
    '--color-success-light': '24 49 35',
    '--color-warning': '253 224 71',
    '--color-warning-light': '54 44 26',
    '--color-error': '252 165 165',
    '--color-error-light': '57 30 35',
    '--color-info': '199 210 254',
    '--color-info-light': '45 43 68',
  },
};

/**
 * Compose the shared header around existing shell content and landmarks.
 * @param {object} props - Shell appearance, resolved identity, actions, and content.
 * @param {'light'|'dark'} props.appearance - In-memory mode; invalid values render light.
 * @param {Function} props.onToggleAppearance - Parent-owned mode transition.
 * @param {object|null} props.session - Resolved local identity.
 * @param {Function} props.onLogout - Existing persistence-aware logout action.
 * @param {React.ReactNode} props.children - Existing warnings, main and footer.
 * @returns {JSX.Element} One semantic themed root; no additional router or main.
 */
export function AppShell({ appearance, onToggleAppearance, session = null, onLogout, children }) {
  const mode = normalizeAppearance(appearance);

  return (
    <div
      data-appearance={mode}
      style={{ ...appearanceTokens[mode], colorScheme: mode }}
      className={
        'flex min-h-screen flex-col bg-background font-sans text-foreground '
        + '[&_input]:placeholder:text-foreground-muted [&_textarea]:placeholder:text-foreground-muted '
        + '[&_input]:border-foreground-muted [&_textarea]:border-foreground-muted [&_select]:border-foreground-muted'
      }
    >
      <a
        href="#main-content"
        className="sr-only z-30 rounded-full bg-surface p-3 focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Navbar
        session={session}
        onLogout={onLogout}
        appearance={mode}
        onToggleAppearance={onToggleAppearance}
      />
      {children}
    </div>
  );
}

AppShell.propTypes = {
  appearance: PropTypes.oneOf(['light', 'dark']).isRequired,
  onToggleAppearance: PropTypes.func.isRequired,
  session: Navbar.propTypes.session,
  onLogout: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};
