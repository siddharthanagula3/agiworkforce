export const agiClerkAppearance = {
  variables: {
    colorPrimary: '#f0a84a',
    colorBackground: '#0e0f10',
    colorText: '#f7f8f8',
    colorTextSecondary: '#b6b9c2',
    colorInputBackground: '#151618',
    colorInputText: '#f7f8f8',
    colorInputBorder: 'rgba(247, 248, 248, 0.12)',
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
