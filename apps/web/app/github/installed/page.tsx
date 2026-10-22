import type { Metadata } from 'next';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section } from '@/features/marketing/components/system';
import { ForgetReturnedCode } from './ForgetReturnedCode';

export const metadata: Metadata = {
  title: 'Finish in the app',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function GitHubInstallReturnPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <ForgetReturnedCode />
      <Header />
      <main id="main-content">
        <Section size="sm" labelledBy="github-installed-title">
          <h1 id="github-installed-title" className="agi-ds-h1" style={{ textAlign: 'center' }}>
            Finish in AGI Mobile
          </h1>
          <p className="agi-ds-prose" style={{ textAlign: 'center' }}>
            This GitHub connection was started on your phone. Open this link on that phone with the
            AGI Mobile installed to finish it. Nothing was linked here.
          </p>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
