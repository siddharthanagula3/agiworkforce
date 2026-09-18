import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Ledger, Section, Stack } from '@/features/marketing/components/system';
import { FactLine, PageHero } from '@/features/marketing/components/pages/surfaces/shared';

import { FORTHCOMING, RELEASE_NOTES, releaseStateLine } from './release-notes-data';

const GA_COUNT = RELEASE_NOTES.filter((note) => note.maturity === 'ga').length;

const HERO_FACTS = [
  `Dated releases: ${RELEASE_NOTES.length}`,
  ...RELEASE_NOTES.slice(0, 1).map((note) => `Newest: ${note.date}`),
  `Generally available: ${GA_COUNT}`,
  `Forthcoming: ${FORTHCOMING.length}`,
];

export function ReleaseNotesPage({ titleId }: { titleId: string }) {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id={titleId}
          eyebrow="Release notes"
          title="Every shipped feature is dated."
          em="is dated."
          lede="Every entry states which surfaces it reached and whether it is generally available, in beta or alpha. Every 'in progress' item is named openly. We do not backdate, we do not pre-announce, and we do not list things we are not actively maintaining."
          ctas={[]}
        />

        <FactLine facts={HERO_FACTS} />

        <Section id="releases" labelledBy="agi-release-notes-releases-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-release-notes-releases-title">
              Releases, newest first.
            </h2>
            <Ledger
              caption="Releases"
              rows={RELEASE_NOTES.map((note) => ({
                label: (
                  <Stack gap="tight">
                    <span>{note.date}</span>
                    <span>{releaseStateLine(note)}</span>
                  </Stack>
                ),
                value: (
                  <Stack gap="tight">
                    <strong>{note.headline}</strong>
                    {note.body.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </Stack>
                ),
              }))}
            />
          </Stack>
        </Section>

        <Section id="forthcoming" labelledBy="agi-release-notes-forthcoming-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-release-notes-forthcoming-title">
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
