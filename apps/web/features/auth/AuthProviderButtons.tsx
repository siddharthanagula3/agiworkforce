'use client';

import { Spinner } from '@agiworkforce/ui';

import { useAuthCopy } from './authCopy';
import { ProviderMark } from './ProviderMark';
import {
  AUTH_BADGE_CLASS,
  AUTH_PROVIDER_BUTTON_CLASS,
  AUTH_PROVIDER_STACK_CLASS,
} from './authStyles';
import type { AuthProvider, AuthProviderId } from './authContract';

export function AuthProviderButtons({
  providers,
  pending,
  disabled = false,
  lastUsed = null,
  lastUsedLabel,
  onStart,
}: {
  providers: readonly AuthProvider[];
  pending: AuthProviderId | null;
  disabled?: boolean;
  lastUsed?: AuthProviderId | null;
  lastUsedLabel?: string;
  onStart: (provider: AuthProviderId) => void;
}) {
  const copy = useAuthCopy();
  if (providers.length === 0) return null;

  return (
    <div className={AUTH_PROVIDER_STACK_CLASS}>
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          className={AUTH_PROVIDER_BUTTON_CLASS}
          disabled={disabled || pending !== null}
          aria-busy={pending === provider.id || undefined}
          onClick={() => onStart(provider.id)}
        >
          {pending === provider.id ? (
            <Spinner size="sm" />
          ) : (
            <ProviderMark provider={provider.id} />
          )}
          <span>
            {copy.text('flow.method.provider', 'Continue with {{provider}}', {
              provider: provider.label,
            })}
          </span>
          {lastUsed === provider.id && lastUsedLabel ? (
            <span className={AUTH_BADGE_CLASS}>{lastUsedLabel}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
