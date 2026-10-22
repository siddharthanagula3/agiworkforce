import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { GENERATED_NOTICES_FILE, NOTICES_URL, loadThirdPartyNotices } from './load-notices';
import { summarizeNotices, type NoticesSummary } from './notices';
import { OpenSourceNotices } from './OpenSourceNotices';
import './open-source.css';

export const dynamic = 'force-static';

export const metadata = buildMetadata({
  title: 'Open source licenses',
  description:
    'Third-party notices for the open source packages bundled in our apps, generated from their dependency manifests.',
  path: '/legal/open-source',
});

function lede(summary: NoticesSummary): string {
  return `Third-party notices for the ${summary.packageCount} open source packages bundled in ${summary.products.join(', ')}, generated from their dependency manifests.`;
}

export default function OpenSourceLicensesPage() {
  const notices = loadThirdPartyNotices();
  const summary = notices ? summarizeNotices(notices) : null;
  if (!summary && process.env.NODE_ENV === 'production') {
    throw new Error(`${GENERATED_NOTICES_FILE} is missing; the web build generates it.`);
  }

  return (
    <div data-design="agi" className="agi-ds-page agi-oss">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-open-source-title"
          eyebrow="Legal"
          title="Open source licenses."
          lede={summary ? lede(summary) : 'Third-party notices for bundled dependencies.'}
          ctas={[]}
        />
        {summary ? (
          <OpenSourceNotices summary={summary} url={NOTICES_URL} />
        ) : (
          <Section id="notices" labelledBy="agi-open-source-title" rule>
            <p className="agi-oss-meta">
              Notices are generated at build time. Run pnpm --filter @agiworkforce/web notices to
              see them here.
            </p>
          </Section>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}
