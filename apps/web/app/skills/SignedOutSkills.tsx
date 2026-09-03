'use client';

import { SignedOutSurface } from '@shared/components/marketing/SignedOutSurface';

export function SignedOutSkills() {
  return (
    <SignedOutSurface
      eyebrow="Skills"
      heading="Skills live in your workspace"
      signInHref="/login?redirectTo=%2Fskills"
      signInLabel="Sign in to browse skills"
      secondary={{ href: '/features/plugins', label: 'What plugins can do' }}
    >
      A skill is a reusable instruction set the assistant loads on demand: a house style, a review
      checklist, a domain glossary. They are scoped to your account, so browsing and installing them
      needs you signed in.
    </SignedOutSurface>
  );
}
