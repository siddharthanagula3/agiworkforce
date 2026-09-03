import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  MarketingFooter,
  Prose,
} from '@/features/marketing/components/system';
import { DESKTOP_LOCAL_RUNTIMES, SURFACE_STATUS } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Local: run AGI on your own hardware, at no cost',
  description: `Run AGI locally with ${DESKTOP_LOCAL_RUNTIMES.label} on Desktop, or against a local model server from the CLI. No account is required for local mode, and nothing leaves the device unless you explicitly send it out.`,
  path: '/local',
});

const HERO_TRANSCRIPT: { kind: 'cmd' | 'out' | 'dim'; text: string }[] = [
  { kind: 'cmd', text: 'ollama pull llama3.1' },
  { kind: 'cmd', text: 'agi models scan' },
  { kind: 'out', text: 'ollama · http://localhost:11434 · 1 model' },
  { kind: 'cmd', text: 'agi --provider ollama --model llama3.1' },
];

const SURFACE_FACTS = [
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
    meta: 'Mobile · not shipped',
    title: 'Local mode on the phone',
    body: 'Local mode keeps the conversation, memory, and files on the device. The surface itself has not shipped.',
  },
] as const;

export default function LocalPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby="agi-local-hero-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>Local mode</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-local-hero-title">
                The runtime refuses <em className="agi-ds-accent">to move a local session.</em>
              </h1>
              <Prose size="lg">
                Point AGI at a model server you already run. The work happens on your hardware, with
                no AGI account and no meter, and the only route out of local mode is one you read
                before you send it.
              </Prose>
              <ButtonRow>
                <Button href="/download#cli-downloads">Get the CLI</Button>
                <Button href="/desktop" variant="secondary">
                  See AGI Desktop
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <pre className="agi-lp-terminal" aria-label="Pointing AGI at a local model server">
                {HERO_TRANSCRIPT.map((line, index) => (
                  <span className="agi-lp-terminal-line" data-kind={line.kind} key={index}>
                    {line.text}
                  </span>
                ))}
              </pre>
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-local-cost-title">
          <div className="agi-ds-container">
            <h2 className="agi-ds-h2" id="agi-local-cost-title">
              What local mode costs you.
            </h2>
            <div style={{ marginTop: '2rem' }}>
              <Ledger
                caption="Local mode cost"
                rows={[
                  { label: 'Account', value: 'Not required.' },
                  { label: 'Cost', value: '$0.00. The model runs on hardware you already own.' },
                ]}
              />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-local-surfaces-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Surfaces</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-local-surfaces-title">
                Each surface reaches local models its own way.
              </h2>
            </div>
            <div className="agi-ds-grid-2">
              {SURFACE_FACTS.map((item) => (
                <div className="agi-ds-card" style={{ padding: '1.5rem' }} key={item.title}>
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-local-setup-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
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
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-local-boundary-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>The trust boundary</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-local-boundary-title">
                The runtime checks the boundary before every request.
              </h2>
            </div>
            <Prose size="lg">
              A session carries its own privacy authority, local, byok, or managed, written down
              beside its transcript, and the runtime re-reads it before each request it builds. When
              the selected model routes somewhere that authority does not cover, the send stops
              there and the error names the one command that would carry the work across properly.
            </Prose>
            <div style={{ marginTop: '1.5rem' }}>
              <Prose size="lg">
                That command forks a second session which starts with no history at all. It runs a
                secret scan over the messages you picked, shows you the exact payload with counts of
                what was included, excluded and truncated, and completes only when you send that
                reviewed draft back word for word. The local session it forked from keeps its own
                authority and its own transcript, unchanged.
              </Prose>
            </div>
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby="agi-local-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-local-close-title">
                The machine you own <em className="agi-ds-accent">can run the model.</em>
              </h2>
              <Prose size="lg">
                Desktop carries the widest set of local runtimes. BYOK is the reviewed way out on
                the days a local model is not enough.
              </Prose>
              <ButtonRow>
                <Button href="/desktop" variant="secondary">
                  See AGI Desktop
                </Button>
                <Button href="/byok" variant="secondary">
                  How BYOK works
                </Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
