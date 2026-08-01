/** @type {import('tailwindcss').Config} */
module.exports = {
  // `src/` holds every feature surface (chat, drawer, library, voice, ...).
  // Omitting it silently dropped ~900 className usages: only classes that also
  // happened to appear under app/ or components/ were compiled, so anything
  // unique to a feature (custom borders, spacing, opacity ramps) rendered as if
  // the className were absent.
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
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
        // NOTE: there is deliberately no `teal` ramp here.
        //
        // It used to be a literal teal (`500: '#21808d'`) with no var()
        // backing, so `bg-teal-500/15` painted a second hue the brand palette
        // does not have — and disagreed with the `teal` *token*
        // (src/ui/theme/tokens.ts), which resolves to the neutral foreground or
        // the user's chosen accent. Class-styled and hook-styled halves of the
        // same Dispatch card rendered in two different colours.
        //
        // Accent surfaces now come from the palette instead:
        //   bg-teal-500/N     -> style={{ backgroundColor: colors.accentSurface }}
        //   border-teal-500/N -> style={{ borderColor: colors.accentBorder }}
        //   text-teal-400     -> style={{ color: colors.teal }}
        // Do not reintroduce the ramp; `pnpm --filter @agiworkforce/mobile test`
        // has a guard asserting zero `teal-` classes survive.
        charcoal: {
          700: '#363838',
          800: '#2a2c2c',
          900: '#1f2121',
        },
        // Surface colors.
        //
        // These were compiled constants, so `bg-surface-base` pinned a screen
        // to the dark palette no matter what theme the user had chosen —
        // Companion, Compare and Schedules rendered dark inside an otherwise
        // light app. They are CSS variables now, published at runtime by
        // ThemeVars (src/ui/theme/ThemeVars.tsx) from the same tokens
        // useThemeColors() returns, so a class and a hook can no longer
        // disagree. The values here are the dark defaults, used only if a tree
        // somehow renders outside the provider.
        surface: {
          base: 'var(--agi-surface-base, #171717)',
          elevated: 'var(--agi-surface-elevated, #212121)',
          overlay: 'var(--agi-surface-overlay, #2a2a2a)',
          hover: 'var(--agi-surface-hover, #303030)',
        },
        /**
         * `white` is the app's FOREGROUND, not the colour white.
         *
         * Roughly 250 classNames use `text-white`, `text-white/60`,
         * `border-white/10` and friends as "the readable colour on this
         * surface" — which is exactly backwards in a light theme. Pointing it
         * at the foreground token keeps every one of those opacity ramps
         * meaning what its author intended in both themes.
         *
         * Where literal white IS meant — text over a camera preview, over the
         * voice gradient — use `colors.white` from the token palette, which
         * stays #ffffff.
         */
        white: 'var(--agi-fg, #f4f4f4)',
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
