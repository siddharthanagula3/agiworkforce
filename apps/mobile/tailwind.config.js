const { agiBrandScale, agiRadii } = require('@agiworkforce/design-tokens');

const { colors: darkColors } = require('./src/ui/theme/tokens.ts');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        'terra-cotta': agiBrandScale['terra-cotta'],
        charcoal: agiBrandScale.charcoal,
        surface: {
          base: `var(--agi-surface-base, ${darkColors.surfaceBase})`,
          elevated: `var(--agi-surface-elevated, ${darkColors.surfaceElevated})`,
          overlay: `var(--agi-surface-overlay, ${darkColors.surfaceOverlay})`,
          hover: `var(--agi-surface-hover, ${darkColors.surfaceHover})`,
        },
        white: `var(--agi-fg, ${darkColors.textPrimary})`,
        agent: agiBrandScale.agent,
      },
      borderRadius: {
        sm: agiRadii.sm,
        md: agiRadii.md,
        lg: agiRadii.lg,
        xl: agiRadii.xl,
        '2xl': agiRadii['2xl'],
        '3xl': agiRadii['3xl'],
      },
      fontFamily: {
        sans: ['System'],
        mono: ['Menlo', 'Courier'],
      },
    },
  },
  plugins: [],
};
