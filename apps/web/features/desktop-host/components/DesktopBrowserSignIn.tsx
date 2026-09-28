'use client';

import { Globe } from 'lucide-react';
import { AuthDivider } from '@/features/auth/AuthDivider';
import {
  AUTH_HINT_CLASS,
  AUTH_PROVIDER_BUTTON_CLASS,
  AUTH_PROVIDER_ICON_SIZE,
} from '@/features/auth/authStyles';
import { beginBrowserSignIn, useBrowserSignInState } from '../lib/browser-sign-in';
import { useElectronHost } from '../lib/host';

const START_LABEL = 'Continue in your browser';
const REOPEN_LABEL = 'Open the browser again';
const START_HINT =
  "Sign in with your browser, including your organization's single sign-on, and AGI Cloud finishes signing you in here.";
const WAITING_HINT = 'Finish signing in in your browser. AGI Cloud opens again when you are done.';

export function DesktopBrowserSignIn() {
  const host = useElectronHost();
  const state = useBrowserSignInState();
  if (!host) return null;

  const hint =
    state.kind === 'waiting' ? WAITING_HINT : state.kind === 'failed' ? state.message : START_HINT;

  return (
    <div data-testid="desktop-browser-sign-in">
      <AuthDivider />
      <button
        type="button"
        className={`${AUTH_PROVIDER_BUTTON_CLASS} w-full`}
        onClick={() => void beginBrowserSignIn()}
      >
        <Globe size={AUTH_PROVIDER_ICON_SIZE} aria-hidden="true" />
        <span>{state.kind === 'waiting' ? REOPEN_LABEL : START_LABEL}</span>
      </button>
      <p role="status" aria-live="polite" className={AUTH_HINT_CLASS}>
        {hint}
      </p>
    </div>
  );
}
