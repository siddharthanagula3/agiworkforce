'use client';

import { Globe } from 'lucide-react';
import { hostSupportsBrowserSignIn } from '@agiworkforce/local-runtime-contract';
import { Spinner } from '@agiworkforce/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@agiworkforce/ui/dialog';
import { AuthDivider } from '@/features/auth/AuthDivider';
import {
  AUTH_HINT_CLASS,
  AUTH_PROVIDER_BUTTON_CLASS,
  AUTH_PROVIDER_ICON_SIZE,
  AUTH_QUIET_BUTTON_CLASS,
} from '@/features/auth/authStyles';
import {
  beginBrowserSignIn,
  BROWSER_SIGN_IN_NEEDS_UPDATE,
  browserSignInIsPending,
  cancelBrowserSignIn,
  useBrowserSignInState,
} from '../lib/browser-sign-in';
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

  const supported = hostSupportsBrowserSignIn(host);
  const pending = browserSignInIsPending(state);
  const changing = state.kind === 'opening' || state.kind === 'cancelling';
  const hint = state.kind === 'failed' ? state.message : WAITING_HINT;
  const label =
    state.kind === 'opening'
      ? 'Opening your browser'
      : state.kind === 'cancelling'
        ? 'Cancelling sign-in'
        : REOPEN_LABEL;
  const title = state.kind === 'failed' ? 'Sign-in needs attention' : 'Continue in your browser';

  return (
    <div data-testid="desktop-browser-sign-in">
      <AuthDivider />
      <Dialog
        open={state.kind !== 'idle'}
        onOpenChange={(open) => {
          if (!open) void cancelBrowserSignIn();
        }}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            className={`${AUTH_PROVIDER_BUTTON_CLASS} w-full`}
            disabled={!supported}
            onClick={() => void beginBrowserSignIn()}
          >
            <Globe size={AUTH_PROVIDER_ICON_SIZE} aria-hidden="true" />
            <span>{START_LABEL}</span>
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild>
              <p role="status" aria-live="polite">
                {hint}
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className={`${AUTH_PROVIDER_BUTTON_CLASS} w-full`}
              disabled={changing || !supported}
              onClick={() => void beginBrowserSignIn()}
            >
              {changing ? (
                <Spinner size="sm" aria-hidden="true" />
              ) : (
                <Globe size={AUTH_PROVIDER_ICON_SIZE} aria-hidden="true" />
              )}
              <span>{label}</span>
            </button>
            <button
              type="button"
              className={`${AUTH_QUIET_BUTTON_CLASS} justify-center`}
              disabled={state.kind === 'cancelling'}
              onClick={() => void cancelBrowserSignIn()}
            >
              {pending ? 'Cancel sign-in' : 'Back to sign in'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <p className={AUTH_HINT_CLASS}>{supported ? START_HINT : BROWSER_SIGN_IN_NEEDS_UPDATE}</p>
    </div>
  );
}
