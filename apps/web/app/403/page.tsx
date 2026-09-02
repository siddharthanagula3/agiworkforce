import { buildMetadata } from '@/lib/seo/metadata';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Eyebrow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';
import { hasBrowserSessionCookie } from '@/lib/session-cookie';

export const metadata = buildMetadata({
  title: 'Access denied',
  description: 'You are signed in, but this account does not have access to this page.',
  path: '/403',
  robots: { index: false, follow: false },
});

export default async function ForbiddenPage() {
  const cookieStore = await cookies();
  const signedIn = hasBrowserSessionCookie(cookieStore.getAll());

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section size="sm">
          <Stack gap="loose">
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
          </Stack>
        </Section>

        <Section size="sm" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2">Why you might be seeing this.</h2>
            <Prose>
              The page belongs to a workspace you are not a member of, it needs a role your account
              does not hold, or it is limited to a plan this account is not on. If you have more
              than one account, you may be signed in as the wrong one.
            </Prose>
          </Stack>
        </Section>

        <Section size="sm" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2">What to do.</h2>
            <Prose>
              If a teammate sent you the link, ask them to grant access from their workspace{' '}
              <Link className="agi-ds-link" href="/settings/team">
                team settings
              </Link>
              . If this is a plan limit, the{' '}
              <Link className="agi-ds-link" href="/pricing">
                pricing page
              </Link>{' '}
              lists what each plan includes. Otherwise write to{' '}
              <a className="agi-ds-link" href={contactMailto('Access request')}>
                {CONTACT_EMAIL}
              </a>{' '}
              with the address you tried to open.
            </Prose>
            <Prose>
              <Link className="agi-ds-link" href="/chat">
                Back to your workspace
              </Link>
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
