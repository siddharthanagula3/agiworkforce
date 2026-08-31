// Values reference the [data-design='agi'] custom properties in globals.css
// instead of duplicating their hex codes. AuthShell always renders the sign-in
// card inside that scope, so these are never evaluated outside it; hardcoded
// copies had already drifted from the source palette (colorBackground was
// '#0e0f10' against --agi-card's '#131109', colorDanger '#eb5e55' against
// --agi-error's '#eb6a55'), rendering a card that didn't actually match the
// shell around it. `var()` is Clerk's documented pattern for a value that
// must track a CSS custom property.
export const agiClerkAppearance = {
  variables: {
    colorPrimary: 'var(--agi-amber)',
    colorBackground: 'var(--agi-card)',
    colorForeground: 'var(--agi-ink)',
    colorMutedForeground: 'var(--agi-ink-2)',
    colorInput: 'var(--agi-bg-2)',
    colorInputForeground: 'var(--agi-ink)',
    colorBorder: 'var(--agi-rule-strong)',
    colorDanger: 'var(--agi-error)',
    colorRing: 'var(--agi-amber)',
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
    formButtonPrimary: 'font-semibold shadow-none',
    footerActionLink: 'font-semibold',
  },
} as const;
