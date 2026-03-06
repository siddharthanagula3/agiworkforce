/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand colors (from desktop globals.css)
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
        teal: {
          50: '#8fd9e3',
          100: '#7dd3df',
          200: '#5ac7d7',
          300: '#3ab5c5',
          400: '#2d9ba8',
          500: '#21808d',
          600: '#196068',
          700: '#124043',
          800: '#0a201e',
          900: '#000000',
        },
        charcoal: {
          700: '#363838',
          800: '#2a2c2c',
          900: '#1f2121',
        },
        // Surface colors
        surface: {
          base: '#0f0f0f',
          elevated: '#1a1a1a',
          overlay: '#242424',
          hover: '#2e2e2e',
        },
        // Agent status colors
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
