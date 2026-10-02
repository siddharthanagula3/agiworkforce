import Link from 'next/link';

import { Header } from '@shared/components/layout/Header';
import { releasePath } from '@/lib/changelog-entries';
import { policyChanges } from '@/lib/legal/policy-archive';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Ledger, Prose, Section, Stack } from '@/features/marketing/components/system';
import { FactLine, PageHero } from '@/features/marketing/components/pages/surfaces/shared';

import { ATOM_MEDIA_TYPE, CHANGELOG_FEED_PATH } from './changelog-feed';
import { FORTHCOMING, RELEASE_NOTES, releaseStateLine } from './release-notes-data';

const GA_COUNT = RELEASE_NOTES.filter((note) => note.maturity === 'ga').length;

const HERO_FACTS = [
  `Dated releases: ${RELEASE_NOTES.length}`,
  ...RELEASE_NOTES.slice(0, 1).map((note) => `Newest: ${note.date}`),
  `Generally available: ${GA_COUNT}`,
  `Forthcoming: ${FORTHCOMING.length}`,
];

const LEDE =
  "Every release states which surfaces it reached and whether it is generally available, in beta or alpha. Every 'in progress' item is named openly. We do not backdate, we do not pre-announce, and we do not list things we are not actively maintaining.";

const POLICY_CHANGES = policyChanges();

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
          lede={
            <>
              {LEDE}{' '}
              <a
                href={CHANGELOG_FEED_PATH}
                rel="alternate"
                type={ATOM_MEDIA_TYPE}
                className="agi-ds-link"
              >
                Subscribe with the Atom feed
              </a>
              .
            </>
          }
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
                    <Link href={releasePath(note)} className="agi-ds-link">
                      <strong>{note.headline}</strong>
                    </Link>
                    {note.body.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </Stack>
                ),
              }))}
            />
          </Stack>
        </Section>

        <Section id="policy-changes" labelledBy="agi-release-notes-policy-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-release-notes-policy-title">
                Policy changes, newest first.
              </h2>
              <Prose>
                Each time a policy is revised, the revision is listed here with its date and what
                changed. The subprocessor list is one of these policies, so a new or replaced
                subprocessor is listed here with the date the list changed. The Atom feed carries
                these and the releases above.
              </Prose>
            </div>
            <Ledger
              caption="Policy changes"
              rows={POLICY_CHANGES.map((change) => ({
                label: change.date,
                value: (
                  <Stack gap="tight">
                    <Link href={change.href} className="agi-ds-link">
                      <strong>{change.history.label} updated</strong>
                    </Link>
                    <span>{change.summary}</span>
                  </Stack>
                ),
              }))}
            />
          </Stack>
        </Section>

        <Section id="forthcoming" labelledBy="agi-release-notes-forthcoming-title" rule>
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
