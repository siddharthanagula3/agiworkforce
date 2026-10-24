import Link from 'next/link';
import { RELEASES } from '@/lib/changelog-entries';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  Eyebrow,
  ButtonRow,
  Ledger,
  Prose,
  Section,
  Stack,
  WEB_ENTRY_HREF,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/Shared';
import { FounderBlock, NoteList } from '@/features/marketing/components/pages/company/Shared';
import {
  BYOK_SURFACES,
  CATALOG_AS_OF,
  CLI_AVAILABILITY_NOTE,
  POSITIONING,
  SURFACE_NAMES,
  SURFACE_STATUS,
  surfaceAvailabilitySummary,
  surfaceCta,
} from '../../lib/marketing-constants';
import { CATALOG_SCOPES } from '../../lib/catalog-scopes';
import { SURFACE_IDS, joinSurfaceNames } from '../../lib/surface-status';
import {
  FOUNDER_NAME,
  FOUNDER_ROLE,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  REGISTERED_AGENT_ADDRESS,
} from '../../lib/legal-constants';
import '@/features/marketing/components/pages/company/company.css';

const CLI_CTA = surfaceCta('cli');

const PROGRESS_COUNT = 5;
const PROGRESS = RELEASES.slice(0, PROGRESS_COUNT)
  .map((release) => ({ date: release.date, headline: release.headline }))
  .reverse();

const SURFACE_COUNT = SURFACE_IDS.length;
const ALL_SURFACE_NAMES = joinSurfaceNames(SURFACE_IDS.map((surface) => SURFACE_NAMES[surface]));

const SURFACE_STATES = SURFACE_IDS.map(
  (surface) => `${SURFACE_NAMES[surface]} · ${SURFACE_STATUS[surface]}.`,
).join(' ');

const CERTIFICATION_STATUS =
  'No certifications held. No SOC 2 report exists, no auditor is engaged, and no audit is in progress.';

export const metadata = buildMetadata({
  title: 'About: multi-provider by design',
  description: `AGI is built by ${LEGAL_ENTITY}, an independent US company. ${SURFACE_COUNT} surfaces over one contract layer, built so that you choose where inference runs: your hardware, your key, or our cloud. ${surfaceAvailabilitySummary()}`,
  path: '/about',
});

const PRINCIPLES = [
  {
    title: 'The route is always visible.',
    body: 'Local, BYOK, and managed cloud are separate trust boundaries. A Local thread stays Local. Moving work anywhere else takes a label and your consent, never a silent hand-off.',
  },
  {
    title: 'Your keys, your bill, no markup.',
    body: `Bring your own provider keys in the CLI. ${BYOK_SURFACES.availability} Traffic goes straight to your provider, the CLI saves keys in the operating system credential store, or in owner-only files on Linux or when the keyring is turned off, and Desktop remains managed-cloud only.`,
  },
  {
    title: `One contract layer, ${SURFACE_COUNT} surfaces at different stages.`,
    body: `${ALL_SURFACE_NAMES} share one contract layer: the same model catalog, the same trust-boundary rules, the same capability gates. They are not all live at once. ${surfaceAvailabilitySummary()}`,
  },
];

export default function AboutPage() {
  return (
    <div data-design="agi" className="agi-ds-page agi-co">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-about-title"
          eyebrow="About AGI"
          title="Multi-provider, by design."
          em="by design."
          lede={`AGI is built by ${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTOR}. It is founder-led, independent, and privately held. It exists because being locked to one model lab is a bad position to be in. The bet: you, not the vendor, own the keys, the data, and the choice of model.`}
          ctas={[]}
        />

        <Section id="mission" labelledBy="agi-about-mission-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-about-mission-title">
                Model choice and data controls.
              </h2>
              <Prose>
                An AI application suite across {SURFACE_COUNT} surfaces, with one difference that
                decides the rest: it is built so that you choose whether a request runs on Local
                models, on your own provider keys, or on AGI managed cloud. That choice is
                architectural, not a setting bolted on late. These are the rules the product is
                built around.
              </Prose>
            </div>
            <NoteList items={PRINCIPLES} />
          </Stack>
        </Section>

        <Section id="founder" labelledBy="agi-about-founder-title" rule ground="2">
          <FounderBlock
            quote={<>&ldquo;You should own the choice of model.&rdquo;</>}
            body="AGI is built on a single conviction: the person doing the work should decide where it runs and which model answers, not a vendor lock-in. Everything here follows from that, from Local Mode that keeps your conversations on your device to BYOK that keeps your keys on your machine."
            id="agi-about-founder-title"
            name={FOUNDER_NAME}
            role={`${FOUNDER_ROLE}, ${LEGAL_ENTITY}`}
          />
        </Section>

        <Section id="progress" labelledBy="agi-about-progress-title" rule>
          <div>
            <Eyebrow>Path of progress</Eyebrow>
            <h2 className="agi-ds-h2" id="agi-about-progress-title">
              Every milestone, dated.
            </h2>
            <ol className="agi-ds-timeline">
              {PROGRESS.map((release) => (
                <li key={release.date}>
                  <span className="agi-ds-timeline-date">{release.date}</span>
                  <span className="agi-ds-timeline-title">{release.headline}</span>
                </li>
              ))}
            </ol>
            <Link href="/release-notes" className="agi-ds-timeline-more">
              All release notes →
            </Link>
          </div>
        </Section>

        <Section id="colophon" labelledBy="agi-about-colophon-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-about-colophon-title">
                The colophon: the facts, plainly stated.
              </h2>
              <Prose>
                Company details, ownership and product status: the entity, the licence, and how the
                product is put together.
              </Prose>
            </div>
            <Ledger
              caption="Colophon"
              rows={[
                { label: 'Company', value: `${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTOR}` },
                { label: 'Registered agent', value: REGISTERED_AGENT_ADDRESS },
                {
                  label: 'Ownership',
                  value: 'Independent and privately held. No outside funding announced.',
                },
                { label: 'License', value: 'Proprietary' },
                {
                  label: 'Built with',
                  value: 'Rust for the CLI, TypeScript and React across the app surfaces',
                },
                {
                  label: 'Surfaces',
                  value: SURFACE_STATES,
                },
                {
                  label: 'Model catalog',
                  value: `${CATALOG_SCOPES.catalogueEntries.text} · ${CATALOG_SCOPES.providerRecords.text}, as of ${CATALOG_AS_OF}`,
                },
                { label: 'Trust modes', value: 'Local · BYOK · Managed cloud' },
                { label: 'Data policy', value: POSITIONING.routeBoundary },
                { label: 'Set in', value: 'Geist' },
                {
                  label: 'Compliance',
                  value: (
                    <>
                      {CERTIFICATION_STATUS}{' '}
                      <Link href="/trust" className="agi-ds-link">
                        See the full trust posture
                      </Link>
                      .
                    </>
                  ),
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="judge" labelledBy="agi-about-close-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-about-close-title">
              Judge the bet on its merits.
            </h2>
            <Prose>
              {`Try AGI Chat in the browser. The CLI runs local models and your own keys on your own hardware. ${CLI_AVAILABILITY_NOTE} Either way, you see where every request runs before it leaves your device.`}
            </Prose>
            <ButtonRow>
              <Button href={WEB_ENTRY_HREF}>Try AGI Chat</Button>
              <Button href={CLI_CTA.href} variant="secondary">
                {CLI_CTA.label}
              </Button>
              <Button href="/trust" variant="secondary">
                See the trust posture
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
