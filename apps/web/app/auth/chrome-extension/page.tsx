'use client';

import { useSession } from '@/lib/identity/client';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Eyebrow, Prose, Stack } from '@/features/marketing/components/system';
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
              <Eyebrow>AGI for Chrome</Eyebrow>
              <h1 className="agi-ds-h1" id="chrome-auth-title">
                {!isLoaded
                  ? 'Checking your account.'
                  : isSignedIn
                    ? 'Chrome is connected.'
                    : 'Sign in to continue.'}
              </h1>
            </div>
            {!isLoaded ? (
              <p className="agi-ds-prose" role="status">
                Checking your AGI Cloud session…
              </p>
            ) : isSignedIn ? (
              <Stack gap="tight">
                <p className="agi-ds-prose" role="status">
                  Your AGI Cloud session is ready for the browser extension.
                </p>
                <Prose size="sm">
                  Return to Chrome. The AGI side panel picks up your account when you go back to it.
                </Prose>
              </Stack>
            ) : (
              <Stack gap="tight">
                <p className="agi-ds-prose" role="alert">
                  Sign in on the web so OAuth and your existing AGI session can be securely shared
                  with the extension.
                </p>
                <ButtonRow>
                  <Button href={webSignInHref(RETURN_PATH)}>Sign in to AGI Cloud</Button>
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
