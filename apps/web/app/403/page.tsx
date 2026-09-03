import { buildMetadata } from '@/lib/seo/metadata';
import { cookies } from 'next/headers';
import type { CSSProperties } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Eyebrow, Prose, Section } from '@/features/marketing/components/system';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';
import { hasBrowserSessionCookie } from '@/lib/session-cookie';

export const metadata = buildMetadata({
  title: 'Access denied',
  description: 'You are signed in, but this account does not have access to this page.',
  path: '/403',
  robots: { index: false, follow: false },
});

const STATEMENT_MAX_WIDTH = '30rem';

const statementStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 'var(--agi-space-5)',
  maxWidth: STATEMENT_MAX_WIDTH,
  marginInline: 'auto',
};

export default async function ForbiddenPage() {
  const cookieStore = await cookies();
  const signedIn = hasBrowserSessionCookie(cookieStore.getAll());

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section size="sm">
          <div style={statementStyle}>
            <div>
              <Eyebrow>403</Eyebrow>
              <h1 className="agi-ds-h1">You don&rsquo;t have access to this.</h1>
            </div>
            {signedIn ? (
              <Prose>
                You are signed in, but this account is not permitted to open this page. Signing in
                again with this account will not change that.
              </Prose>
            ) : (
              <Prose>
                You are not signed in. Sign in to see whether your account has access to this page.
              </Prose>
            )}
            <Prose size="sm">
              This can mean the page belongs to a workspace you are not a member of, needs a role
              this account does not hold, or is limited to a plan this account is not on. A teammate
              can grant access from their workspace team settings; write to{' '}
              <a className="agi-ds-link" href={contactMailto('Access request')}>
                {CONTACT_EMAIL}
              </a>{' '}
              with the address you tried to open if none of that fits.
            </Prose>
            <ButtonRow>
              <Button href={signedIn ? '/chat' : '/login'}>
                {signedIn ? 'Back to your workspace' : 'Sign in'}
              </Button>
            </ButtonRow>
          </div>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
