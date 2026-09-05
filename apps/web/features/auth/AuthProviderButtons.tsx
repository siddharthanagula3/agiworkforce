'use client';

import { Spinner } from '@agiworkforce/ui';

import { ProviderMark } from './ProviderMark';
import { AUTH_PROVIDER_BUTTON_CLASS, AUTH_PROVIDER_STACK_CLASS } from './authStyles';
import type { AuthProvider, AuthProviderId } from './authContract';

export function AuthProviderButtons({
  providers,
  pending,
  disabled = false,
  onStart,
}: {
  providers: readonly AuthProvider[];
  pending: AuthProviderId | null;
  disabled?: boolean;
  onStart: (provider: AuthProviderId) => void;
}) {
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
          <span>Continue with {provider.label}</span>
        </button>
      ))}
    </div>
  );
}
