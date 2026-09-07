/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // ResolveX brand — deep burgundy (primary) shading to bright red (accent),
        // derived from the ResolveX / MMCOE logo.png identity.
        brand: {
          50: '#fdf3f2',
          100: '#fbe4e2',
          200: '#f5c6c1',
          300: '#e89b93',
          400: '#d76a5f',
          500: '#c0392b', // bright red — accent / highlights
          600: '#9b1c1c', // primary burgundy — buttons, active nav, links
          700: '#7c1818', // hover / pressed
          800: '#5f1414',
          900: '#4a1012', // deepest burgundy — important headings
        },
        // Escalation / SLA-breach — deliberately vivid red, kept semantic.
        escalation: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          500: '#e11d1d',
          600: '#c81212',
          700: '#a30f0f',
        },
        // Surfaces — light, warm neutral ground with white cards.
        surface: {
          DEFAULT: '#f7f5f4', // page background
          card: '#ffffff',    // cards, sidebar, header
          border: '#e7e1de',  // hairline borders
          hover: '#f1ebe8',   // hover / subtle fills
        },
        // Charcoal ink for text.
        ink: {
          DEFAULT: '#1c1917',
          soft: '#44403c',
          muted: '#78716c',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
        'pulse-slow': 'pulse 3s infinite',
        'pop-in': 'popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'shimmer': 'shimmer 2.2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        popIn: { from: { opacity: 0, transform: 'scale(0.94) translateY(8px)' }, to: { opacity: 1, transform: 'scale(1) translateY(0)' } },
        shimmer: { from: { backgroundPosition: '-500px 0' }, to: { backgroundPosition: '500px 0' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      boxShadow: {
        'glow': '0 8px 30px -8px rgba(155, 28, 28, 0.35)',
        'card-hover': '0 12px 32px -12px rgba(28, 25, 23, 0.18)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #9b1c1c 0%, #c0392b 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #fdf3f2 0%, #fbe4e2 100%)',
      },
    },
  },
  plugins: [],
};
