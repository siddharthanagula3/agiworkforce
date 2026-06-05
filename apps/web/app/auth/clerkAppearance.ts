export const agiClerkAppearance = {
  variables: {
    colorPrimary: 'hsl(190, 78%, 34%)',
    colorBackground: 'hsl(218, 26%, 15%)',
    colorText: 'hsl(210, 26%, 98%)',
    colorTextSecondary: 'hsl(214, 22%, 82%)',
    colorInputBackground: 'hsl(210, 29%, 97%)',
    colorInputText: 'hsl(218, 26%, 15%)',
    colorInputBorder: 'hsl(210 26% 98% / 0.22)',
    colorDanger: 'hsl(3, 51%, 61%)',
    borderRadius: '0.875rem',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'mx-auto w-full max-w-[33rem]',
    card: 'border border-white/10 shadow-2xl shadow-black/30 sm:rounded-[1.75rem]',
    socialButtonsBlockButton: 'border border-white/10',
    dividerLine: 'bg-white/10',
    formFieldInput: 'focus:ring-2',
    formButtonPrimary: 'font-semibold shadow-none',
    footerActionLink: 'font-semibold',
  },
} as const;
