'use client';

import { useId, useState } from 'react';

import { useAuthCopy } from './authCopy';
import { ProviderMark } from './ProviderMark';
import {
  AUTH_PROVIDER_BUTTON_CLASS,
  AUTH_PROVIDER_STACK_CLASS,
  AUTH_QUIET_BUTTON_CLASS,
  AUTH_STEP_LINKS_CLASS,
} from './authStyles';
import type { AuthMethodId, AuthProvider, AuthProviderId } from './authContract';

const METHOD_DEFAULTS: Readonly<Record<AuthMethodId, { key: string; label: string }>> = {
  password: { key: 'flow.method.password', label: 'Use your password' },
  email_code: { key: 'flow.method.emailCode', label: 'Email me a code' },
  passkey: { key: 'flow.method.passkey', label: 'Use a passkey or security key' },
};

export function AuthMethodPicker({
  methods,
  providers = [],
  disabled = false,
  onChooseMethod,
  onChooseProvider,
}: {
  methods: readonly AuthMethodId[];
  providers?: readonly AuthProvider[];
  disabled?: boolean;
  onChooseMethod: (method: AuthMethodId) => void;
  onChooseProvider?: (provider: AuthProviderId) => void;
}) {
  const copy = useAuthCopy();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const total = methods.length + (onChooseProvider ? providers.length : 0);
  if (total === 0) return null;

  const only = methods[0];
  if (total === 1 && only) {
    return (
      <div className={AUTH_STEP_LINKS_CLASS} data-testid="auth-method-picker">
        <button
          type="button"
          className={AUTH_QUIET_BUTTON_CLASS}
          disabled={disabled}
          onClick={() => onChooseMethod(only)}
        >
          {copy.text(METHOD_DEFAULTS[only].key, METHOD_DEFAULTS[only].label)}
        </button>
      </div>
    );
  }

  return (
    <div className={AUTH_STEP_LINKS_CLASS} data-testid="auth-method-picker">
      <button
        type="button"
        className={AUTH_QUIET_BUTTON_CLASS}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {copy.text('flow.methodPicker.trigger', 'Try another way to sign in')}
      </button>

      {open ? (
        <div id={panelId} className={`${AUTH_PROVIDER_STACK_CLASS} w-full`}>
          {methods.map((method) => (
            <button
              key={method}
              type="button"
              className={AUTH_PROVIDER_BUTTON_CLASS}
              disabled={disabled}
              onClick={() => onChooseMethod(method)}
            >
              <span>{copy.text(METHOD_DEFAULTS[method].key, METHOD_DEFAULTS[method].label)}</span>
            </button>
          ))}
          {onChooseProvider
            ? providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={AUTH_PROVIDER_BUTTON_CLASS}
                  disabled={disabled}
                  onClick={() => onChooseProvider(provider.id)}
                >
                  <ProviderMark provider={provider.id} />
                  <span>
                    {copy.text('flow.method.provider', 'Continue with {{provider}}', {
                      provider: provider.label,
                    })}
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
