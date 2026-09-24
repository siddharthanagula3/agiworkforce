'use client';

import { ClerkProvider } from '@clerk/nextjs';

const clerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to AGI',
      titleCombined: 'Sign in or create an AGI account',
      subtitle: 'Welcome back. Continue to your AGI workspace.',
      subtitleCombined: 'Use your AGI account to continue.',
    },
  },
  signUp: {
    start: {
      title: 'Create your AGI account',
      titleCombined: 'Create or sign in to AGI',
      subtitle:
        'Start with the Managed Cloud trial on the web, then move serious work to Local or BYOK.',
      subtitleCombined: 'Use your AGI account to continue.',
    },
  },
};

export default function BrowserIdentityProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={clerkLocalization} telemetry={{ disabled: true }}>
      {children}
    </ClerkProvider>
  );
}
