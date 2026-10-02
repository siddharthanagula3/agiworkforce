import Link from 'next/link';

import { Header } from '@shared/components/layout/Header';
import { releasePath } from '@/lib/changelog-entries';
import {
  POLICY_PUBLICATION_FLOOR,
  policyChangeTitle,
  policyChanges,
  unpublishedStanding,
} from '@/lib/legal/policy-archive';
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
  "Every release states which surfaces it reached and whether it is generally available, in beta or alpha. Every 'in progress' item is named openly. Forthcoming items are listed separately with their target, which stays to be announced until a date is set, and we do not list things we are not actively maintaining.";

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
                We began keeping dated version histories for our policies on 21 September 2026.
                Every revision after that day that moves a policy&rsquo;s date is listed here with
                the date and what changed, and so is the first version of every policy introduced
                after that day, and so are that day&rsquo;s revisions of the privacy policy, the
                mobile app&rsquo;s terms and privacy policy, the subprocessor list and the trust
                posture. A correction that leaves a policy&rsquo;s date unchanged is not listed. The
                subprocessor list is one of these policies, so a subprocessor added or replaced
                since 21 September 2026 is listed here with the date the list changed. The Atom feed
                carries these and the releases above.
              </Prose>
              <Prose>
                A policy&rsquo;s date is the day its text was settled, not the day it was published
                on this site, which can be later. On {POLICY_PUBLICATION_FLOOR.label} this site was
                still serving versions dated before 21 September 2026, so no version listed here
                with a date before {POLICY_PUBLICATION_FLOOR.label} had been published on this site
                before that day. The window to object to a new subprocessor, set in{' '}
                <Link href="/dpa#s-05" className="agi-ds-link">
                  section 05 of our data processing addendum
                </Link>
                , runs from the day the change is first published on{' '}
                <Link href="/subprocessors" className="agi-ds-link">
                  /subprocessors
                </Link>
                , not from the date listed here.
              </Prose>
            </div>
            <Ledger
              caption="Policy changes"
              rows={POLICY_CHANGES.map((change) => {
                const unpublished = unpublishedStanding(change);
                return {
                  label: change.date,
                  value: (
                    <Stack gap="tight">
                      <Link
                        href={change.href}
                        className="agi-ds-link"
                        aria-label={`${policyChangeTitle(change)} ${change.date}`}
                      >
                        <strong>{policyChangeTitle(change)}</strong>
                      </Link>
                      <span>{change.summary}</span>
                      {unpublished ? <span>{unpublished}</span> : null}
                    </Stack>
                  ),
                };
              })}
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
                value: `${row.detail} Target: ${row.target}.`,
              }))}
            />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
