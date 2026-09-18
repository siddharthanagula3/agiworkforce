'use client';

import Link from 'next/link';

import { useAuthCopy } from './authCopy';
import { AUTH_LINK_CLASS, AUTH_SWITCH_CLASS } from './authStyles';
import type { AuthMode } from './authContract';

const PROMPTS: Readonly<
  Record<AuthMode, { questionKey: string; question: string; actionKey: string; action: string }>
> = {
  login: {
    questionKey: 'flow.switch.login.question',
    question: "Don't have an account?",
    actionKey: 'flow.switch.login.action',
    action: 'Sign up',
  },
  signup: {
    questionKey: 'flow.switch.signup.question',
    question: 'Already have an account?',
    actionKey: 'flow.switch.signup.action',
    action: 'Log in',
  },
};

export const SWITCH_INSTEAD_COPY: Readonly<Record<AuthMode, { key: string; label: string }>> = {
  login: { key: 'flow.switch.login.instead', label: 'Sign up instead.' },
  signup: { key: 'flow.switch.signup.instead', label: 'Log in instead.' },
};

export function AuthSwitchLine({ mode, href }: { mode: AuthMode; href: string }) {
  const copy = useAuthCopy();
  const prompt = PROMPTS[mode];
  return (
    <p className={AUTH_SWITCH_CLASS}>
      {copy.text(prompt.questionKey, prompt.question)}{' '}
      <Link href={href} className={AUTH_LINK_CLASS}>
        {copy.text(prompt.actionKey, prompt.action)}
      </Link>
    </p>
  );
}
