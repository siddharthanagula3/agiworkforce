/**
 * Shared Clerk appearance for /login and /signup.
 *
 * Variables mirror the dark [data-design='agi'] marketing palette
 * (globals.css). Clerk computes derived shades from these, so they must be
 * literal colors, not var() references; the token-driven `.agi-auth-page`
 * override block in globals.css supplies the theme-following layer on top
 * (and flips correctly under [data-theme='light']).
 */
export const agiClerkAppearance = {
  variables: {
    // AGI signal amber: actions, links, and focus accents
    colorPrimary: '#f0a84a',
    // --agi-card dark default; CSS overrides handle light mode
    colorBackground: '#0e0f10',
    // --agi-ink dark default
    colorText: '#f7f8f8',
    colorTextSecondary: '#b6b9c2',
    // --agi-bg-3 dark: inputs sit slightly above the card surface
    colorInputBackground: '#151618',
    colorInputText: '#f7f8f8',
    colorInputBorder: 'rgba(247, 248, 248, 0.12)',
    // --agi-error
    colorDanger: '#eb5e55',
    borderRadius: '0.75rem',
    fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
  },
  options: {
    socialButtonsVariant: 'blockButton',
    socialButtonsPlacement: 'top',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'mx-auto w-full max-w-[28.5rem]',
    card: 'shadow-2xl shadow-black/30 sm:rounded-[1.25rem]',
    socialButtonsBlockButton: 'border',
    formFieldInput: 'focus:ring-2',
    formButtonPrimary: 'font-semibold shadow-none',
    footerActionLink: 'font-semibold',
  },
} as const;
