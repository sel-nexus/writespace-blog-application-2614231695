/** Define WriteSpace's paper surfaces, editorial type, and bounded motion. */
import colors from 'tailwindcss/colors';

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: colors.indigo,
        secondary: colors.violet,
        neutral: colors.stone,
        background: '#f8f7f4',
        surface: '#ffffff',
        'surface-raised': '#efeeeb',
        foreground: '#292735',
        'foreground-muted': '#605d6b',
        border: '#dedce4',
        ring: '#4f46e5',
        success: { DEFAULT: '#166534', light: '#f0fdf4' },
        warning: { DEFAULT: '#854d0e', light: '#fefce8' },
        error: { DEFAULT: '#991b1b', light: '#fef2f2' },
        info: { DEFAULT: '#3730a3', light: '#eef2ff' },
        'focal-pink': '#f9a8d4',
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
