import type { Metadata } from 'next';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section } from '@/features/marketing/components/system';
import { getGitHubAppInstallUrl, isGitHubInstallationLinkingAvailable } from '@/lib/github-app';
import { appInstallRequester } from '@/lib/github-install-app-return';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Connect GitHub',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const STATE_PATTERN = /^[a-f0-9]{64}$/;

interface Props {
  searchParams: Promise<{ state?: string | string[] }>;
}

async function continueTarget(state: string | undefined) {
  if (!state || !STATE_PATTERN.test(state)) return null;
  const installUrl = isGitHubInstallationLinkingAvailable() ? getGitHubAppInstallUrl() : null;
  if (!installUrl) return null;
  const requester = await appInstallRequester(state);
  if (!requester) return null;
  const target = new URL(installUrl);
  target.searchParams.set('state', state);
  return { requester, href: target.toString() };
}

export default async function GitHubConnectPage({ searchParams }: Props) {
  const { state } = await searchParams;
  const next = await continueTarget(typeof state === 'string' ? state : undefined);

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section size="sm" labelledBy="github-connect-title">
          {next ? (
            <>
              <h1 id="github-connect-title" className="agi-ds-h1">
                {`Connecting GitHub to the AGI Workforce account ${next.requester}`}
              </h1>
              <p className="agi-ds-prose">
                Continue only if you started this from the AGI Workforce app yourself. If someone
                sent you this link, close this page: continuing would give their account access to
                the repositories you choose.
              </p>
              <p>
                <a className="agi-ds-btn" data-variant="primary" href={next.href} rel="noreferrer">
                  Continue to GitHub
                </a>
              </p>
            </>
          ) : (
            <>
              <h1 id="github-connect-title" className="agi-ds-h1">
                This GitHub link has expired
              </h1>
              <p className="agi-ds-prose">
                It was already used, has timed out, or GitHub cannot be connected right now. Start
                again from the AGI Workforce app.
              </p>
            </>
          )}
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
