import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Eyebrow, Ledger, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero, type PageCta } from '@/features/marketing/components/pages/surfaces/shared';
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
          <PageHero
            id="agi-plugin-unavailable-title"
            eyebrow="Plugins"
            title="Registry unreachable."
            lede="The plugin registry is temporarily unavailable, so this pack cannot be shown right now. Reload in a moment."
            ctas={[{ href: '/plugins', label: 'Back to plugins', variant: 'secondary' }]}
          />
        </main>
        <MarketingFooter />
      </div>
    );
  }

  const { entry, manifest } = result;
  const installable = isPluginEntryInstallable(entry);
  const webInstallable = isPluginEntryWebInstallable(entry);

  const ctas: PageCta[] = [{ href: '/plugins', label: 'Back to plugins', variant: 'secondary' }];
  if (webInstallable) {
    ctas.unshift({ href: '/apps', label: 'Open Plugin settings' });
  } else if (!installable) {
    ctas.unshift({ href: '/plugins#request-access', label: 'Request marketplace access' });
  }

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-plugin-title"
          eyebrow="Plugins"
          title={entry.name}
          lede={
            <>
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
            </>
          }
          ctas={ctas}
        />

        <Section id="the-record" labelledBy="agi-plugin-facts-title" rule>
          <Stack gap="loose">
            <div>
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
          </Stack>
        </Section>

        {installable && entry.distribution ? (
          <Section id="install" labelledBy="agi-plugin-install-title" rule ground="2">
            <Stack gap="loose">
              <div>
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
            </Stack>
          </Section>
        ) : null}

        <Section id="declared-skills" labelledBy="agi-plugin-skills-title" rule>
          <Stack gap="loose">
            <div>
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
              <Prose size="sm">
                These are the pack&apos;s declared contents. No manifest has been published yet, so
                the exact commands, agents, and MCP servers are not final.
              </Prose>
            ) : null}
          </Stack>
        </Section>

        {entry.capabilities.length > 0 ? (
          <Section
            id="declared-capabilities"
            labelledBy="agi-plugin-capabilities-title"
            rule
            ground="2"
          >
            <Stack gap="loose">
              <div>
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
              <Prose size="sm">
                These are declarations shown for review. They are not enforced by a sandbox today,
                so treat them as what the author says the pack does, not as a guarantee.
              </Prose>
            </Stack>
          </Section>
        ) : null}

        <Section id="required-connectors" labelledBy="agi-plugin-connectors-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Required connectors</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-plugin-connectors-title">
                Connect once, use everywhere in the pack.
              </h2>
            </div>
            <ConnectorChecklist connectorIds={entry.requiredConnectors} />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
