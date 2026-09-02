import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { DESKTOP_LOCAL_RUNTIMES, SURFACE_STATUS } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Local: run AGI on your own hardware, at no cost',
  description: `Run AGI locally with ${DESKTOP_LOCAL_RUNTIMES.label} on Desktop, or against a local model server from the CLI. No account is required for local mode, and nothing leaves the device unless you explicitly send it out.`,
  path: '/local',
});

export default function LocalPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-local-hero-title"
          eyebrow="Local mode"
          title="The runtime refuses to move a local session."
          lede="Point AGI at a model server you already run. The work happens on your hardware, with no AGI account and no meter, and the only route out of local mode is one you read before you send it."
          ctas={[
            { href: '/download#cli-downloads', label: 'Get the CLI' },
            { href: '/desktop', label: 'See AGI Desktop', variant: 'secondary' },
          ]}
        />

        <Section id="local-cost" labelledBy="agi-local-cost-title" rule>
          <Stack>
            <h2 className="agi-ds-h2" id="agi-local-cost-title">
              What local mode costs you.
            </h2>
            <Ledger
              caption="Local mode cost"
              rows={[
                { label: 'Account', value: 'Not required.' },
                { label: 'Cost', value: '$0.00. The model runs on hardware you already own.' },
              ]}
            />
          </Stack>
        </Section>

        <Section id="local-surfaces" labelledBy="agi-local-surfaces-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Surfaces</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-local-surfaces-title">
                Each surface reaches local models its own way.
              </h2>
            </div>
            <FactGrid
              items={[
                {
                  meta: `Desktop · ${SURFACE_STATUS.desktop}`,
                  title: 'Runtime URLs live in settings',
                  body: `${DESKTOP_LOCAL_RUNTIMES.label} each take a server URL. Desktop checks that the URL answers, lists the models the runtime reports, and refreshes the model catalog from the reply.`,
                },
                {
                  meta: `CLI · ${SURFACE_STATUS.cli}`,
                  title: 'agi models scan',
                  body: 'The CLI probes Ollama and LM Studio on loopback, prints every installed model beside its base URL, and blocks any address that is not loopback before a request is built.',
                },
                {
                  meta: `Mobile · not shipped`,
                  title: 'Local mode on the phone',
                  body: 'Local mode keeps the conversation, memory, and files on the device. The surface itself has not shipped.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="local-setup" labelledBy="agi-local-setup-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Setup</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-local-setup-title">
                You point AGI at a server you already run.
              </h2>
              <Prose>
                Nothing is installed on your behalf. Start the runtime, pull or load a model the way
                you normally would, then let AGI discover what is there and name the provider
                explicitly.
              </Prose>
            </div>
            <Ledger
              caption="Local setup commands"
              rows={[
                {
                  label: (
                    <code style={{ fontFamily: 'var(--agi-font-mono)', whiteSpace: 'nowrap' }}>
                      ollama pull &lt;model&gt;
                    </code>
                  ),
                  value: 'Pull a model into a running Ollama server.',
                },
                {
                  label: (
                    <code style={{ fontFamily: 'var(--agi-font-mono)', whiteSpace: 'nowrap' }}>
                      agi models scan
                    </code>
                  ),
                  value:
                    'List local model servers found on loopback, and the models each one reports.',
                },
                {
                  label: (
                    <code style={{ fontFamily: 'var(--agi-font-mono)' }}>
                      agi --provider ollama{' '}
                      <span style={{ whiteSpace: 'nowrap' }}>--model &lt;model&gt;</span>
                    </code>
                  ),
                  value: 'Start a session pinned to that runtime and model.',
                },
                {
                  label: (
                    <code style={{ fontFamily: 'var(--agi-font-mono)' }}>
                      agi --provider lmstudio{' '}
                      <span style={{ whiteSpace: 'nowrap' }}>--model &lt;model&gt;</span>
                    </code>
                  ),
                  value: 'Start a session pinned to an LM Studio model.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="local-boundary" labelledBy="agi-local-boundary-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>The trust boundary</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-local-boundary-title">
                The runtime checks the boundary before every request.
              </h2>
            </div>
            <Prose>
              A session carries its own privacy authority, local, byok, or managed, written down
              beside its transcript, and the runtime re-reads it before each request it builds. When
              the selected model routes somewhere that authority does not cover, the send stops
              there and the error names the one command that would carry the work across properly.
            </Prose>
            <Prose>
              That command forks a second session which starts with no history at all. It runs a
              secret scan over the messages you picked, shows you the exact payload with counts of
              what was included, excluded and truncated, and completes only when you send that
              reviewed draft back word for word. The local session it forked from keeps its own
              authority and its own transcript, unchanged.
            </Prose>
          </Stack>
        </Section>

        <Section id="local-close" labelledBy="agi-local-close-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-local-close-title">
              The machine you own can run the model.
            </h2>
            <Prose>
              Desktop carries the widest set of local runtimes. BYOK is the reviewed way out on the
              days a local model is not enough.
            </Prose>
            <ButtonRow>
              <Button href="/desktop" variant="secondary">
                See AGI Desktop
              </Button>
              <Button href="/byok" variant="secondary">
                How BYOK works
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
