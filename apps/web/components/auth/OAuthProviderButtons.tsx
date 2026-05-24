'use client';

import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

export type OAuthProvider = 'google' | 'github';

const OAUTH_PROVIDER_FLAGS: Record<OAuthProvider, boolean> = {
  google: process.env['NEXT_PUBLIC_AUTH_GOOGLE_ENABLED'] === 'true',
  github: process.env['NEXT_PUBLIC_AUTH_GITHUB_ENABLED'] === 'true',
};

const providerButtonStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--agi-bg)',
  border: '1px solid var(--agi-rule-strong)',
  borderRadius: 14,
  color: 'var(--agi-ink)',
  cursor: 'pointer',
  display: 'flex',
  fontFamily: 'inherit',
  fontSize: 18,
  fontWeight: 700,
  justifyContent: 'center',
  minHeight: 64,
  padding: '0 20px',
  textAlign: 'center',
  transition:
    'background var(--agi-dur-fast) var(--agi-ease-out), border-color var(--agi-dur-fast) var(--agi-ease-out)',
  width: '100%',
};

const disabledProviderButtonStyle: CSSProperties = {
  cursor: 'wait',
  opacity: 0.72,
};

interface OAuthProviderButtonsProps {
  enabledProviders: OAuthProvider[];
  loadingProvider: OAuthProvider | null;
  onOAuth: (provider: OAuthProvider) => void | Promise<void>;
}

export function getEnabledOAuthProviders(): OAuthProvider[] {
  return (Object.keys(OAUTH_PROVIDER_FLAGS) as OAuthProvider[]).filter(
    (provider) => OAUTH_PROVIDER_FLAGS[provider],
  );
}

export function OAuthProviderButtons({
  enabledProviders,
  loadingProvider,
  onOAuth,
}: OAuthProviderButtonsProps) {
  const { t } = useTranslation('auth');

  const providers = (
    [
      { id: 'google', label: t('continueWithGoogle') },
      { id: 'github', label: t('continueWithGithub') },
    ] satisfies Array<{ id: OAuthProvider; label: string }>
  ).filter((provider) => enabledProviders.includes(provider.id));

  if (providers.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {providers.map((provider) => {
        const isLoading = loadingProvider === provider.id;
        const isDisabled = loadingProvider !== null;

        return (
          <button
            key={provider.id}
            type="button"
            onClick={() => onOAuth(provider.id)}
            disabled={isDisabled}
            aria-busy={isLoading}
            style={{
              ...providerButtonStyle,
              ...(isDisabled ? disabledProviderButtonStyle : null),
            }}
          >
            {isLoading ? t('redirecting') : provider.label}
          </button>
        );
      })}
    </div>
  );
}
