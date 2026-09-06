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
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { FounderBlock, NoteList } from '@/features/marketing/components/pages/company/shared';
import {
  CATALOG_AS_OF,
  MARKETING,
  POSITIONING,
  SURFACE_STATUS,
} from '../../lib/marketing-constants';
import {
  FOUNDER_NAME,
  FOUNDER_ROLE,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  REGISTERED_AGENT_ADDRESS,
} from '../../lib/legal-constants';

const PROGRESS_COUNT = 5;
const PROGRESS = RELEASES.slice(0, PROGRESS_COUNT)
  .map((release) => ({
    date: release.date,
    headline: release.headline.split(' · ')[0] ?? release.headline,
  }))
  .reverse();

export const metadata = buildMetadata({
  title: 'About: multi-provider by design',
  description:
    'AGI is built by AGI Automation LLC, an independent US company. Six surfaces over one contract layer, and a real choice of where inference runs: your hardware, your key, or our cloud.',
  path: '/about',
});

const PRINCIPLES = [
  {
    title: 'The route is always visible.',
    body: 'Local, BYOK, and managed cloud are separate trust boundaries. A Local thread stays Local. Moving work anywhere else takes a label and your consent, never a silent hand-off.',
  },
  {
    title: 'Your keys, your bill, no markup.',
    body: 'Bring your own provider keys on Desktop, CLI, and VS Code. Traffic goes straight to your provider; the keys stay encrypted on your machine. We do not sit in the middle of your spend.',
  },
  {
    title: 'One contract layer, six surfaces at different stages.',
    body: `Web, Desktop, Mobile, CLI, Chrome, and VS Code share one contract layer: the same model catalog, the same trust-boundary rules, the same capability gates. They are not all live at once. Web and CLI: ${SURFACE_STATUS.web}. Desktop: ${SURFACE_STATUS.desktop}. Mobile, Chrome, and VS Code: ${SURFACE_STATUS.mobile}. Each surface that has shipped is native to its platform rather than a wrapped web view.`,
  },
];

export default function AboutPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-about-title"
          eyebrow="About AGI"
          title="Multi-provider, by design."
          lede={`AGI is built by ${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTOR}. It is founder-led, independent, and privately held. It exists because being locked to one model lab is a bad position to be in. The bet: you, not the vendor, own the keys, the data, and the choice of model.`}
          ctas={[]}
        />

        <Section id="mission" labelledBy="agi-about-mission-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-about-mission-title">
                An AI workspace you can actually trust.
              </h2>
              <Prose>
                An AI application suite across six surfaces, with one difference that decides the
                rest: you choose whether a request runs on Local models, on your own provider keys,
                or on AGI managed cloud. That choice is architectural, not a setting bolted on late.
                These are the rules the product is built around.
              </Prose>
            </div>
            <NoteList items={PRINCIPLES} />
          </Stack>
        </Section>

        <Section id="founder" labelledBy="agi-about-founder-title" rule ground="2">
          <FounderBlock
            quote={<>&ldquo;You should own the choice of model.&rdquo;</>}
            body="AGI is built on a single conviction: the person doing the work should decide where it runs and which model answers, not a vendor lock-in. Everything here follows from that, from Local Mode that never phones home to BYOK that keeps your keys on your machine."
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
            <Link href="/changelog" className="agi-ds-timeline-more">
              Full changelog →
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
                The entity, the licence, and how the product is put together. No founding mythology,
                no team-size or funding theatre, just what can be checked.
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
                  value:
                    'Rust for the CLI and the desktop core, TypeScript and React across the app surfaces',
                },
                {
                  label: 'Surfaces',
                  value: (
                    <>
                      Web · {SURFACE_STATUS.web}. CLI · {SURFACE_STATUS.cli}. Desktop ·{' '}
                      {SURFACE_STATUS.desktop}. Mobile, Chrome, VS Code · {SURFACE_STATUS.mobile}.
                    </>
                  ),
                },
                {
                  label: 'Model catalog',
                  value: `${MARKETING.models.count} models · ${MARKETING.providers.count} provider integrations, as of ${CATALOG_AS_OF}`,
                },
                { label: 'Trust modes', value: 'Local · BYOK · Managed cloud' },
                { label: 'Data policy', value: POSITIONING.trustBoundary },
                { label: 'Set in', value: 'IBM Plex Sans & JetBrains Mono' },
                {
                  label: 'Compliance',
                  value: (
                    <>
                      No certifications held. SOC 2 is planned with no audit report and no date.{' '}
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
              Try AGI Web in the browser, or run Desktop and the CLI on your own hardware with local
              models and your own keys. Either way, you see where every request runs before it
              leaves your device.
            </Prose>
            <ButtonRow>
              <Button href="/login?redirectTo=%2F">Try AGI Web</Button>
              <Button href="/download" variant="secondary">
                Get the CLI
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
