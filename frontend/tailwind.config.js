/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"',
          '"SF Pro Text"', 'Inter', '"Segoe UI"', 'Roboto', 'sans-serif',
        ],
      },
      colors: {
        dark: {
          900: '#0a0a0f',
          800: '#0f0f1a',
          700: '#151525',
          600: '#1a1a2e',
          500: '#232340',
        },
        light: {
          900: '#f8f9fa',
          800: '#f0f2f5',
          700: '#e8ebef',
          600: '#dfe3e8',
          500: '#c4cad1',
        },
        accent: {
          cyan: '#00f0ff',
          purple: '#a855f7',
          blue: '#3b82f6',
          pink: '#ec4899',
        },
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
        'gradient': 'gradient 8s ease infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%': { boxShadow: '0 0 20px rgba(0,240,255,0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(0,240,255,0.6)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'gradient': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
