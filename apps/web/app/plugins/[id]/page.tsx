import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
import { loadPluginEntry } from '@/features/plugins/server/registry-source';
import {
  isPluginEntryInstallable,
  isPluginEntryWebInstallable,
  type PluginRegistryEntry,
} from '@agiworkforce/types';
import { ConnectorChecklist } from './ConnectorChecklist';

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

function sourceLabel(source: PluginRegistryEntry['source']): string {
  if (source === 'builtin') return 'Built-in';
  if (source === 'marketplace') return 'Marketplace';
  return 'Custom';
}

function statusLabel(entry: PluginRegistryEntry): string {
  if (isPluginEntryWebInstallable(entry)) return 'Available on Web';
  if (isPluginEntryInstallable(entry)) return 'Installable';
  if (entry.status === 'deprecated') return 'Deprecated: do not install';
  return 'Declared: not installable yet';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await loadPluginEntry(id);
  if (result.status !== 'ok') return {};
  return buildMetadata({
    title: `${result.entry.name} plugin`,
    description: result.entry.description,
    path: `/plugins/${result.entry.id}`,
  });
}

export default async function PluginDetailPage({ params }: Props) {
  const { id } = await params;
  const result = await loadPluginEntry(id);

  if (result.status === 'missing') {
    notFound();
  }

  if (result.status === 'unavailable') {
    return (
      <div data-design="agi" className="agi-ds-page">
        <Header />
        <main id="main-content">
          <section className="agi-lp-hero" aria-labelledby="agi-plugin-unavailable-title">
            <div className="agi-ds-container">
              <Eyebrow>Plugins</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-plugin-unavailable-title">
                Registry unreachable.
              </h1>
              <Prose size="lg">
                The plugin registry is temporarily unavailable, so this pack cannot be shown right
                now. Reload in a moment.
              </Prose>
              <ButtonRow>
                <Button href="/plugins" variant="secondary">
                  Back to plugins
                </Button>
              </ButtonRow>
            </div>
          </section>
        </main>
        <MarketingFooter />
      </div>
    );
  }

  const { entry, manifest } = result;
  const installable = isPluginEntryInstallable(entry);
  const webInstallable = isPluginEntryWebInstallable(entry);

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby="agi-plugin-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>Plugins</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-plugin-title">
                {entry.name}
              </h1>
              <Prose size="lg">
                {entry.description}{' '}
                {webInstallable ? (
                  <strong>Managed in Website Settings.</strong>
                ) : installable ? (
                  <strong>Published. Install it with the AGI CLI (see below).</strong>
                ) : entry.status === 'deprecated' ? (
                  <strong>Deprecated. This pack should no longer be installed.</strong>
                ) : (
                  <strong>
                    Listed in the registry, with no published artifact yet. There is nothing to
                    install so far.
                  </strong>
                )}
              </Prose>
              <ButtonRow>
                {webInstallable ? (
                  <Button href="/apps">Open Plugin settings</Button>
                ) : !installable ? (
                  <Button href="/plugins#request-access">Request marketplace access</Button>
                ) : null}
                <Button href="/plugins" variant="secondary">
                  Back to plugins
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <div className="agi-lp-console" aria-label={`${entry.name} record`}>
                <div className="agi-lp-console-bar">
                  <span>{entry.id}</span>
                </div>
                <div className="agi-lp-console-body">
                  <Ledger
                    caption={`${entry.name} record preview`}
                    rows={[
                      {
                        label: 'Publisher',
                        value: `${entry.publisher.name}${entry.publisher.kind === 'first-party' ? ' (first-party)' : ' (third-party)'}`,
                      },
                      { label: 'Version', value: `v${entry.version}` },
                      { label: 'Status', value: statusLabel(entry) },
                    ]}
                  />
                </div>
                <p className="agi-lp-receipt">
                  <span className="agi-lp-receipt-part">{entry.category}</span>
                  <span className="agi-lp-receipt-part">{sourceLabel(entry.source)}</span>
                  <span className="agi-lp-receipt-part">
                    {entry.integrity.sha256 ? 'checksum on file' : 'no checksum yet'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-plugin-facts-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>The record</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-plugin-facts-title">
                The facts, plainly stated.
              </h2>
            </div>
            <Ledger
              caption={`${entry.name} record`}
              rows={[
                {
                  label: 'Publisher',
                  value: `${entry.publisher.name}${entry.publisher.kind === 'first-party' ? ' (first-party)' : ' (third-party)'}`,
                },
                { label: 'Version', value: `v${entry.version}` },
                { label: 'Category', value: entry.category },
                { label: 'Source', value: sourceLabel(entry.source) },
                { label: 'Status', value: statusLabel(entry) },
                {
                  label: 'Integrity',
                  value: entry.integrity.sha256
                    ? `sha256:${entry.integrity.sha256.slice(0, 16)}… · unsigned`
                    : 'No published checksum · unsigned',
                },
              ]}
            />
          </div>
        </section>

        {installable && entry.distribution ? (
          <section className="agi-lp-section" aria-labelledby="agi-plugin-install-title">
            <div className="agi-ds-container">
              <div className="agi-lp-heading">
                <Eyebrow>Install</Eyebrow>
                <h2 className="agi-ds-h2" id="agi-plugin-install-title">
                  From the CLI, with the checksum pinned.
                </h2>
              </div>
              <Ledger
                caption="Install command"
                rows={[
                  {
                    label: 'Command',
                    value: (
                      <code>
                        {`agi plugin install ${entry.distribution.manifestUrl}${
                          entry.distribution.sha256
                            ? ` --integrity sha256:${entry.distribution.sha256}`
                            : ''
                        }`}
                      </code>
                    ),
                  },
                ]}
              />
            </div>
          </section>
        ) : null}

        <section className="agi-lp-section" aria-labelledby="agi-plugin-skills-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Declared skills</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-plugin-skills-title">
                What the pack teaches the agent.
              </h2>
            </div>
            {entry.declaredSkills.length === 0 ? (
              <Prose>No skills declared for this plugin.</Prose>
            ) : (
              <p className="agi-ds-prose" aria-label={`Skills in ${entry.name}`}>
                {entry.declaredSkills.map((skill, index) => (
                  <span key={skill}>
                    {index > 0 ? ', ' : ''}
                    <code>{skill}</code>
                  </span>
                ))}
              </p>
            )}
            {manifest === null ? (
              <div style={{ marginTop: '1rem' }}>
                <Prose size="sm">
                  These are the pack&apos;s declared contents. No manifest has been published yet,
                  so the exact commands, agents, and MCP servers are not final.
                </Prose>
              </div>
            ) : null}
          </div>
        </section>

        {entry.capabilities.length > 0 ? (
          <section className="agi-lp-section" aria-labelledby="agi-plugin-capabilities-title">
            <div className="agi-ds-container">
              <div className="agi-lp-heading">
                <Eyebrow>Declared capabilities</Eyebrow>
                <h2 className="agi-ds-h2" id="agi-plugin-capabilities-title">
                  What the pack says it needs.
                </h2>
              </div>
              <p className="agi-ds-prose" aria-label={`Capabilities for ${entry.name}`}>
                {entry.capabilities.map((capability, index) => (
                  <span key={capability}>
                    {index > 0 ? ', ' : ''}
                    <code>{capability}</code>
                  </span>
                ))}
              </p>
              <div style={{ marginTop: '1rem' }}>
                <Prose size="sm">
                  These are declarations shown for review. They are not enforced by a sandbox today,
                  so treat them as what the author says the pack does, not as a guarantee.
                </Prose>
              </div>
            </div>
          </section>
        ) : null}

        <section className="agi-lp-close" aria-labelledby="agi-plugin-connectors-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <Eyebrow>Required connectors</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-plugin-connectors-title">
                Connect once, use everywhere in the pack.
              </h2>
              <ConnectorChecklist connectorIds={entry.requiredConnectors} />
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
