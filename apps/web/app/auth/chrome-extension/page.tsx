'use client';

import { useSession } from '@/lib/identity/client';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Eyebrow, Stack } from '@/features/marketing/components/system';
import {
  CREATE_ACCOUNT_LABEL,
  webEntryHref,
  webSignInHref,
} from '@/features/marketing/components/system/nav';

const RETURN_PATH = '/auth/chrome-extension';

export default function ChromeExtensionAuthCompletePage() {
  const { isLoaded, isSignedIn } = useSession();

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header minimal />
      <main id="main-content">
        <section
          aria-labelledby="chrome-auth-title"
          style={{
            maxWidth: '30rem',
            width: '100%',
            marginInline: 'auto',
            padding: 'var(--agi-section-y-md) var(--agi-gutter)',
          }}
        >
          <Stack gap="loose">
            <div>
              <Eyebrow>Extension</Eyebrow>
              <h1 className="agi-ds-h1" id="chrome-auth-title">
                {!isLoaded
                  ? 'Checking your account.'
                  : isSignedIn
                    ? 'Signed in to AGI Cloud.'
                    : 'Sign in to continue.'}
              </h1>
            </div>
            {!isLoaded ? (
              <p className="agi-ds-prose" role="status">
                Checking your Cloud session…
              </p>
            ) : isSignedIn ? (
              <p className="agi-ds-prose" role="status">
                Return to the AGI side panel in Chrome to continue with your account.
              </p>
            ) : (
              <Stack gap="tight">
                <p className="agi-ds-prose" role="alert">
                  Sign in on the web so OAuth and your existing AGI session can be securely shared
                  with the extension.
                </p>
                <ButtonRow>
                  <Button href={webSignInHref(RETURN_PATH)}>Sign in to Cloud</Button>
                  <Button href={webEntryHref(RETURN_PATH)} variant="secondary">
                    {CREATE_ACCOUNT_LABEL}
                  </Button>
                </ButtonRow>
              </Stack>
            )}
          </Stack>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
