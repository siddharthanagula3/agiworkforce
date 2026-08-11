import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { loadPluginEntry } from '@/features/plugins/server/registry-source';
import {
  isPluginEntryInstallable,
  isPluginEntryWebInstallable,
  type PluginRegistryEntry,
} from '@agiworkforce/types';
import { ConnectorChecklist } from './ConnectorChecklist';

/**
 * One plugin, from the hosted registry (CAP-046 slice 3).
 *
 * Installation state is user-owned and authenticated, so this public detail
 * page deliberately sends Web-installable packs to the real Settings lifecycle
 * instead of pretending to install them here. Non-Web artifacts keep their
 * integrity-pinned CLI instructions below.
 */

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
  if (entry.status === 'deprecated') return 'Deprecated — do not install';
  return 'Declared — not installable yet';
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

  // A registry outage is not a 404: telling a visitor the plugin does not exist
  // when the database is merely down is a false statement about the product.
  if (result.status === 'unavailable') {
    return (
      <div data-design="agi">
        <main className="agi-shell">
          <Header />
          <section className="agi-page-hero">
            <Link href="/plugins" className="agi-cta-ghost" style={{ paddingTop: 0 }}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Plugins
            </Link>
            <h1 className="agi-page-h1" style={{ marginTop: 18 }}>
              Registry unreachable.
            </h1>
            <p className="agi-page-lede" role="status">
              The plugin registry is temporarily unavailable, so this pack cannot be shown right
              now. Reload in a moment.
            </p>
          </section>
          <MarketingFooter />
        </main>
      </div>
    );
  }

  const { entry, manifest } = result;
  const installable = isPluginEntryInstallable(entry);
  const webInstallable = isPluginEntryWebInstallable(entry);

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <Link href="/plugins" className="agi-cta-ghost" style={{ paddingTop: 0 }}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Plugins
          </Link>
          <h1 className="agi-page-h1" style={{ marginTop: 18 }}>
            {entry.name}.
          </h1>
          <p className="agi-page-lede">
            {entry.description}{' '}
            {webInstallable ? (
              <strong>Managed in Website Settings.</strong>
            ) : installable ? (
              <strong>Published — install it with the AGI CLI (see below).</strong>
            ) : entry.status === 'deprecated' ? (
              <strong>Deprecated — this pack should no longer be installed.</strong>
            ) : (
              <strong>
                Listed in the registry, with no published artifact yet — there is nothing to install
                so far.
              </strong>
            )}
          </p>
          {webInstallable ? (
            <div className="agi-cta-row" style={{ marginTop: 28 }}>
              <Link href="/apps" className="agi-cta-primary">
                Open Plugin settings
              </Link>
            </div>
          ) : !installable ? (
            <div className="agi-cta-row" style={{ marginTop: 28 }}>
              <Link href="/plugins#request-access" className="agi-cta-primary">
                Request marketplace access
              </Link>
            </div>
          ) : null}
        </section>

        <section className="agi-section" aria-labelledby="agi-plugin-facts-title">
          <p className="agi-section-eyebrow">The record</p>
          <h2 id="agi-plugin-facts-title" className="agi-section-h2">
            The facts, plainly stated.
          </h2>
          <dl className="agi-colophon">
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Publisher</dt>
              <dd className="agi-colophon-val">
                {entry.publisher.name}
                {entry.publisher.kind === 'first-party' ? ' (first-party)' : ' (third-party)'}
              </dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Version</dt>
              <dd className="agi-colophon-val">v{entry.version}</dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Category</dt>
              <dd className="agi-colophon-val">{entry.category}</dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Source</dt>
              <dd className="agi-colophon-val">{sourceLabel(entry.source)}</dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Status</dt>
              <dd className="agi-colophon-val">{statusLabel(entry)}</dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Integrity</dt>
              <dd className="agi-colophon-val">
                {entry.integrity.sha256
                  ? `sha256:${entry.integrity.sha256.slice(0, 16)}… · unsigned`
                  : 'No published checksum · unsigned'}
              </dd>
            </div>
          </dl>
        </section>

        {installable && entry.distribution ? (
          <section className="agi-section" aria-labelledby="agi-plugin-install-title">
            <p className="agi-section-eyebrow">Install</p>
            <h2 id="agi-plugin-install-title" className="agi-section-h2">
              From the CLI, with the checksum pinned.
            </h2>
            <div className="agi-terminal">
              <div className="agi-terminal-bar">agi · plugin install</div>
              <pre className="agi-terminal-pre">
                <span className="agi-terminal-prompt">$ </span>
                {`agi plugin install ${entry.distribution.manifestUrl}${
                  entry.distribution.sha256
                    ? ` --integrity sha256:${entry.distribution.sha256}`
                    : ''
                }`}
              </pre>
            </div>
          </section>
        ) : null}

        <section className="agi-section" aria-labelledby="agi-plugin-skills-title">
          <p className="agi-section-eyebrow">Declared skills</p>
          <h2 id="agi-plugin-skills-title" className="agi-section-h2">
            What the pack teaches the agent.
          </h2>
          {entry.declaredSkills.length === 0 ? (
            <p className="agi-reason-p" style={{ margin: 0 }}>
              No skills declared for this plugin.
            </p>
          ) : (
            <div className="agi-chip-row" aria-label={`Skills in ${entry.name}`}>
              {entry.declaredSkills.map((skill) => (
                <span key={skill} className="agi-chip">
                  {skill}
                </span>
              ))}
            </div>
          )}
          {manifest === null ? (
            <p className="agi-reason-p" style={{ marginTop: 18 }}>
              These are the pack&apos;s declared contents. No manifest has been published yet, so
              the exact commands, agents, and MCP servers are not final.
            </p>
          ) : null}
        </section>

        {entry.capabilities.length > 0 ? (
          <section className="agi-section" aria-labelledby="agi-plugin-capabilities-title">
            <p className="agi-section-eyebrow">Declared capabilities</p>
            <h2 id="agi-plugin-capabilities-title" className="agi-section-h2">
              What the pack says it needs.
            </h2>
            <div className="agi-chip-row" aria-label={`Capabilities for ${entry.name}`}>
              {entry.capabilities.map((capability) => (
                <span key={capability} className="agi-chip">
                  {capability}
                </span>
              ))}
            </div>
            <p className="agi-reason-p" style={{ marginTop: 18 }}>
              These are declarations shown for review. They are not enforced by a sandbox today, so
              treat them as what the author says the pack does — not as a guarantee.
            </p>
          </section>
        ) : null}

        <section className="agi-section" aria-labelledby="agi-plugin-connectors-title">
          <p className="agi-section-eyebrow">Required connectors</p>
          <h2 id="agi-plugin-connectors-title" className="agi-section-h2">
            Connect once, use everywhere in the pack.
          </h2>
          <ConnectorChecklist connectorIds={entry.requiredConnectors} />
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
