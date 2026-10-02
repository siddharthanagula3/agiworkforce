import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Header } from '@shared/components/layout/Header';
import { ArchivedPolicyBody } from '@shared/components/legal/ArchivedPolicyBody';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  archivedPolicyText,
  archivedVersionHref,
  olderArchivedVersion,
  policyHistories,
  policyHistoryBySlug,
  policyHistoryHref,
  versionStanding,
} from '@/lib/legal/policy-archive';
import { buildMetadata } from '@/lib/seo/metadata';

type Params = Promise<{ policy: string; date: string }>;

export const dynamicParams = false;

export function generateStaticParams() {
  return policyHistories().flatMap((history) =>
    history.versions
      .filter((version) => version.status === 'archived')
      .map((version) => ({ policy: history.slug, date: version.date })),
  );
}

async function readVersion(params: Params) {
  const { policy, date } = await params;
  const history = policyHistoryBySlug(policy);
  const text = history ? archivedPolicyText(history.key, date) : null;
  return history && text ? { history, text } : null;
}

export async function generateMetadata({ params }: { params: Params }) {
  const version = await readVersion(params);
  if (!version) return {};
  const { history, text } = version;
  return buildMetadata({
    title: `${history.label}, version dated ${text.date}`,
    description: `The ${history.label.toLowerCase()} dated ${text.date}. ${versionStanding(history, text.date)}`,
    path: `/legal/archive/${history.slug}/${text.date}`,
    robots: { index: false, follow: true },
  });
}

export default async function ArchivedPolicyPage({ params }: { params: Params }) {
  const version = await readVersion(params);
  if (!version) notFound();
  const { history, text } = version;
  const older = olderArchivedVersion(history, text.date);

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-archived-policy-title"
          eyebrow={`${history.label}, version dated ${text.date}`}
          title={text.title}
          lede={
            <>
              <strong>{versionStanding(history, text.date)}</strong>{' '}
              <Link href={history.route} className="agi-ds-link">
                Read the current version
              </Link>{' '}
              or see the{' '}
              <Link href={policyHistoryHref(history)} className="agi-ds-link">
                version history
              </Link>
              .
            </>
          }
          ctas={[]}
        />

        <Section id="archived-text" labelledBy="agi-archived-policy-title" rule>
          <Stack gap="loose">
            <ArchivedPolicyBody blocks={text.blocks} />
            {older ? (
              <Prose size="sm">
                <Link href={archivedVersionHref(history, older)} className="agi-ds-link">
                  Previous version, dated {older}
                </Link>
              </Prose>
            ) : null}
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
