export const agiClerkAppearance = {
  variables: {
    colorPrimary: '#d4a85f',
    colorBackground: '#161713',
    colorText: '#f2eadc',
    colorTextSecondary: '#c8c0b2',
    colorInputBackground: '#f7f2e8',
    colorInputText: '#1b1c18',
    colorInputBorder: 'rgba(226, 220, 207, 0.26)',
    colorDanger: '#f08a7f',
    borderRadius: '0.875rem',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'mx-auto w-full max-w-[33rem]',
    card: 'border border-white/10 bg-[#161713] text-[#f2eadc] shadow-2xl shadow-black/40 sm:rounded-[1.75rem]',
    headerTitle: 'text-[#f2eadc]',
    headerSubtitle: 'text-[#c8c0b2]',
    socialButtonsBlockButton:
      'border border-white/10 bg-[#202119] text-[#f2eadc] hover:bg-[#292a22]',
    socialButtonsBlockButtonText: 'text-[#f2eadc]',
    dividerLine: 'bg-white/10',
    dividerText: 'text-[#938b7d]',
    formFieldLabel: 'text-[#c8c0b2]',
    formFieldInput:
      'border-white/15 bg-[#f7f2e8] text-[#1b1c18] placeholder:text-[#6f685e] focus:border-[#d4a85f] focus:ring-[#d4a85f]',
    formFieldInputShowPasswordButton: 'text-[#4c463f] hover:text-[#1b1c18]',
    formFieldErrorText: 'text-[#f08a7f]',
    formButtonPrimary:
      'bg-[#d4b06d] font-semibold text-[#181914] shadow-none hover:bg-[#e1bf7b] focus:ring-[#d4a85f]',
    footer: 'bg-[#141511] text-[#938b7d]',
    footerActionText: 'text-[#938b7d]',
    footerActionLink: 'font-semibold text-[#d4a85f] hover:text-[#e5c77f]',
    identityPreviewText: 'text-[#f2eadc]',
    identityPreviewEditButton: 'text-[#d4a85f]',
    alertText: 'text-[#f2eadc]',
    formResendCodeLink: 'text-[#d4a85f]',
  },
} as const;
