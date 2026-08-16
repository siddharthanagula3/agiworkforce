/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        'terra-cotta': {
          50: '#f9e8e1',
          100: '#f5d4c8',
          200: '#ecad96',
          300: '#e38664',
          400: '#da7332',
          500: '#da7756',
          600: '#bd5d3a',
          700: '#743924',
          800: '#4d2618',
          900: '#27130c',
        },
        charcoal: {
          700: '#363838',
          800: '#2a2c2c',
          900: '#1f2121',
        },
        surface: {
          base: 'var(--agi-surface-base, #171717)',
          elevated: 'var(--agi-surface-elevated, #212121)',
          overlay: 'var(--agi-surface-overlay, #2a2a2a)',
          hover: 'var(--agi-surface-hover, #303030)',
        },
        white: 'var(--agi-fg, #f4f4f4)',
        agent: {
          thinking: '#a855f7',
          active: '#3b82f6',
          success: '#10b981',
          error: '#ef4444',
          warning: '#f59e0b',
        },
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
        '3xl': '32px',
      },
      fontFamily: {
        sans: ['System'],
        mono: ['Menlo', 'Courier'],
      },
    },
  },
  plugins: [],
};
