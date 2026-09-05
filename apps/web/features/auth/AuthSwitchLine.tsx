import Link from 'next/link';

import { AUTH_LINK_CLASS, AUTH_SWITCH_CLASS } from './authStyles';
import type { AuthMode } from './authContract';

const PROMPTS: Readonly<Record<AuthMode, { question: string; action: string }>> = {
  login: { question: "Don't have an account?", action: 'Sign up' },
  signup: { question: 'Already have an account?', action: 'Log in' },
};

export const SWITCH_INSTEAD_LABELS: Readonly<Record<AuthMode, string>> = {
  login: 'Sign up instead.',
  signup: 'Log in instead.',
};

export function AuthSwitchLine({ mode, href }: { mode: AuthMode; href: string }) {
  const prompt = PROMPTS[mode];
  return (
    <p className={AUTH_SWITCH_CLASS}>
      {prompt.question}{' '}
      <Link href={href} className={AUTH_LINK_CLASS}>
        {prompt.action}
      </Link>
    </p>
  );
}
