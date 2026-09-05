import type { Metadata } from 'next';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Ledger, Section, Stack } from '@/features/marketing/components/system';
import { FactLine, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LAUNCH } from '../../lib/marketing-constants';
import { RELEASES } from '../../lib/changelog-entries';

export const metadata: Metadata = {
  title: 'Changelog',
  description: `A dated archive of what shipped and what is aligned to the public release.`,
  alternates: { canonical: '/changelog' },
  openGraph: {
    title: 'Changelog',
    description: 'A dated archive of what shipped. Honest about what has not.',
    type: 'website',
    url: 'https://agiworkforce.com/changelog',
  },
};

const FORTHCOMING: { item: string; detail: string; quarter: string }[] = [
  { item: 'Mobile', detail: 'App Store + Play Store listings.', quarter: LAUNCH.shortLabel },
  {
    item: 'Chrome extension',
    detail: 'CWS submission once visual review clears.',
    quarter: LAUNCH.shortLabel,
  },
  {
    item: 'VS Code extension',
    detail: 'Marketplace listing planned for public launch.',
    quarter: LAUNCH.shortLabel,
  },
];

const HERO_FACTS = [
  `Dated releases: ${RELEASES.length}`,
  ...RELEASES.slice(0, 1).map((release) => `Newest: ${release.date}`),
  `Forthcoming: ${FORTHCOMING.length}`,
];

export default function ChangelogPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-changelog-title"
          eyebrow="Changelog"
          title="Every shipped feature is dated."
          lede="Every 'in progress' item is named openly. We do not backdate, we do not pre-announce, and we do not list things we are not actively maintaining."
          ctas={[]}
        />

        <FactLine facts={HERO_FACTS} />

        <Section id="releases" labelledBy="agi-changelog-releases-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-changelog-releases-title">
              Releases, newest first.
            </h2>
            <Ledger
              caption="Releases"
              rows={RELEASES.map((release) => ({
                label: release.date,
                value: (
                  <Stack gap="tight">
                    <strong>{release.headline}</strong>
                    {release.body.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </Stack>
                ),
              }))}
            />
          </Stack>
        </Section>

        <Section id="forthcoming" labelledBy="agi-changelog-forthcoming-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-changelog-forthcoming-title">
              Forthcoming.
            </h2>
            <Ledger
              caption="Forthcoming"
              rows={FORTHCOMING.map((row) => ({
                label: row.item,
                value: `${row.detail} Target: ${row.quarter}.`,
              }))}
            />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
