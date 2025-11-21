/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      // Typography - Premium font stack
      fontFamily: {
        sans: [
          'Söhne',
          'FK Grotesk',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: ['Söhne Mono', 'Monaco', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      // Enhanced color system for Agentic Workspace
      colors: {
        // Base system colors
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Focus Mode Colors (Claude + Perplexity patterns)
        'terra-cotta': {
          DEFAULT: '#C15F3C',
          50: '#F9E8E1',
          100: '#F5D4C8',
          200: '#ECAD96',
          300: '#E38664',
          400: '#DA7332',
          500: '#C15F3C',
          600: '#9A4C30',
          700: '#743924',
          800: '#4D2618',
          900: '#27130C',
        },
        'warm-peach': {
          DEFAULT: '#F5C1A9',
          50: '#FFFFFF',
          100: '#FEF9F6',
          200: '#FCE8DD',
          300: '#FAD7C4',
          400: '#F7C9B6',
          500: '#F5C1A9',
          600: '#F0A481',
          700: '#EB8759',
          800: '#E66A31',
          900: '#C64F14',
        },
        teal: {
          DEFAULT: '#21808D',
          50: '#8FD9E3',
          100: '#7DD3DF',
          200: '#5AC7D7',
          300: '#3AB5C5',
          400: '#2D9BA8',
          500: '#21808D',
          600: '#196068',
          700: '#124043',
          800: '#0A201E',
          900: '#000000',
        },
        // Agent Status Colors
        'agent-thinking': '#A855F7', // Purple 500
        'agent-active': '#3B82F6', // Blue 500
        'agent-success': '#10B981', // Emerald 500
        'agent-error': '#EF4444', // Red 500
        'agent-warning': '#F59E0B', // Amber 500
        // Glassmorphism
        'surface-floating': 'rgba(255, 255, 255, 0.08)',
        'surface-floating-hover': 'rgba(255, 255, 255, 0.12)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Enhanced box shadows for halo effects
      boxShadow: {
        'halo-default': '0 0 40px rgba(113, 113, 122, 0.3)',
        'halo-research': '0 0 40px rgba(168, 85, 247, 0.4)',
        'halo-coder': '0 0 40px rgba(59, 130, 246, 0.4)',
        'halo-web': '0 0 40px rgba(33, 128, 141, 0.4)',
        'halo-academic': '0 0 40px rgba(245, 193, 169, 0.4)',
        'halo-terra': '0 0 40px rgba(193, 95, 60, 0.4)',
      },
      // Custom keyframes and animations
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'slide-up': {
          from: { transform: 'translateY(10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          from: { transform: 'translateY(-10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-out': 'fade-out 0.2s ease-out',
        'slide-up': 'slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slide-down 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
      // Spring animation timing functions
      transitionTimingFunction: {
        'spring-bouncy': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring-smooth': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
      // Backdrop blur utilities
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        DEFAULT: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '40px',
        '3xl': '64px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
