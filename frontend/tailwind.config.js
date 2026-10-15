/** Define WriteSpace's paper surfaces, editorial type, and bounded motion. */
import colors from 'tailwindcss/colors';

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Keep solid brand buttons unchanged; only tonal surfaces follow appearance.
        primary: {
          ...colors.indigo,
          50: 'rgb(var(--color-primary-50, 238 242 255) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100, 224 231 255) / <alpha-value>)',
        },
        secondary: {
          ...colors.violet,
          50: 'rgb(var(--color-secondary-50, 245 243 255) / <alpha-value>)',
          100: 'rgb(var(--color-secondary-100, 237 233 254) / <alpha-value>)',
        },
        neutral: colors.stone,
        background: 'rgb(var(--color-background, 248 247 244) / <alpha-value>)',
        surface: 'rgb(var(--color-surface, 255 255 255) / <alpha-value>)',
        'surface-raised': 'rgb(var(--color-surface-raised, 239 238 235) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground, 41 39 53) / <alpha-value>)',
        'foreground-muted': 'rgb(var(--color-foreground-muted, 96 93 107) / <alpha-value>)',
        border: 'rgb(var(--color-border, 222 220 228) / <alpha-value>)',
        ring: 'rgb(var(--color-ring, 79 70 229) / <alpha-value>)',
        success: {
          DEFAULT: 'rgb(var(--color-success, 22 101 52) / <alpha-value>)',
          light: 'rgb(var(--color-success-light, 240 253 244) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning, 133 77 14) / <alpha-value>)',
          light: 'rgb(var(--color-warning-light, 254 252 232) / <alpha-value>)',
        },
        error: {
          DEFAULT: 'rgb(var(--color-error, 153 27 27) / <alpha-value>)',
          light: 'rgb(var(--color-error-light, 254 242 242) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info, 55 48 163) / <alpha-value>)',
          light: 'rgb(var(--color-info-light, 238 242 255) / <alpha-value>)',
        },
        'focal-pink': '#f9a8d4',
      },
      // Link accents need brighter dark values, unlike solid button backgrounds.
      textColor: {
        primary: {
          700: 'rgb(var(--color-primary-text-700, 67 56 202) / <alpha-value>)',
          800: 'rgb(var(--color-primary-text-800, 55 48 163) / <alpha-value>)',
        },
        secondary: {
          700: 'rgb(var(--color-secondary-text-700, 109 40 217) / <alpha-value>)',
          800: 'rgb(var(--color-secondary-text-800, 91 33 182) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Georgia', 'Cambria', 'serif'],
        sans: ['"Trebuchet MS"', '"Gill Sans"', 'Calibri', 'sans-serif'],
      },
      fontSize: {
        hero: ['clamp(2.75rem, 5.4vw, 4.5rem)', { lineHeight: '1.08', letterSpacing: '-0.035em' }],
      },
      borderRadius: { card: '1rem' },
      boxShadow: {
        card: '0 8px 24px -18px rgb(41 39 53 / 0.28)',
        focal: '0 24px 64px -24px rgb(76 29 149 / 0.3)',
      },
      transitionDuration: { gentle: '240ms' },
      transitionTimingFunction: { gentle: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(-3deg)' },
          '50%': { transform: 'translateY(-10px) rotate(-2deg)' },
        },
      },
      animation: { float: 'float 6s ease-in-out infinite' },
    },
  },
  plugins: [],
};
