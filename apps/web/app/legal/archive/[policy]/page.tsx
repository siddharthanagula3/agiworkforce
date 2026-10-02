import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Ledger, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  archivedVersionHref,
  policyHistories,
  policyHistoryBySlug,
  versionStanding,
  type PolicyHistory,
  type PolicyVersionEntry,
} from '@/lib/legal/policy-archive';
import { buildMetadata } from '@/lib/seo/metadata';

export const dynamicParams = false;

export function generateStaticParams() {
  return policyHistories().map((history) => ({ policy: history.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ policy: string }> }) {
  const history = policyHistoryBySlug((await params).policy);
  if (!history) return {};
  return buildMetadata({
    title: `${history.label}: version history`,
    description: `Every dated version of the ${history.label.toLowerCase()}, what changed in each, and the text of earlier versions.`,
    path: `/legal/archive/${history.slug}`,
  });
}

function versionValue(history: PolicyHistory, version: PolicyVersionEntry) {
  const summary = version.summary ?? 'The earliest recorded version.';
  if (version.status === 'current') {
    return (
      <>
        {summary}{' '}
        <Link href={history.route} className="agi-ds-link">
          Current version
        </Link>
      </>
    );
  }
  const standing = versionStanding(history, version.date);
  if (version.status === 'archived') {
    return (
      <>
        {summary} {standing}{' '}
        <Link href={archivedVersionHref(history, version.date)} className="agi-ds-link">
          Read this version
        </Link>
      </>
    );
  }
  return (
    <>
      {summary} {standing} The full text of this version was not kept.
    </>
  );
}

export default async function PolicyHistoryPage({
  params,
}: {
  params: Promise<{ policy: string }>;
}) {
  const history = policyHistoryBySlug((await params).policy);
  if (!history) notFound();

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-policy-history-title"
          eyebrow={history.label}
          title="Version history."
          lede={
            <>
              Every dated version of the{' '}
              <Link href={history.route} className="agi-ds-link">
                {history.label.toLowerCase()}
              </Link>
              , newest first, with what changed in each and whether this site published it before a
              later version replaced it.
            </>
          }
          ctas={[]}
        />

        <Section id="versions" labelledBy="agi-policy-history-versions-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-policy-history-versions-title">
              Versions
            </h2>
            <Ledger
              caption="Versions"
              rows={history.versions.map((version) => ({
                label: version.date,
                value: versionValue(history, version),
              }))}
            />
            <Prose size="sm">
              A version&rsquo;s date is the day its text was settled, which can be earlier than the
              day this site published it. Earlier versions are shown for reference only; the current
              version is the one that applies.
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
