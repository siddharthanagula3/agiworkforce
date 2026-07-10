import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import { PLUGIN_CATALOG } from '@/features/plugins/data/plugins';
import { ConnectorChecklist } from './ConnectorChecklist';

interface Props {
  params: Promise<{ id: string }>;
}

function sourceLabel(source: string): string {
  if (source === 'builtin') return 'Built-in';
  if (source === 'marketplace') return 'Marketplace';
  return 'Custom';
}

export function generateStaticParams() {
  return PLUGIN_CATALOG.map((plugin) => ({ id: plugin.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const plugin = PLUGIN_CATALOG.find((p) => p.id === id);
  if (!plugin) return {};
  return buildMetadata({
    title: `${plugin.name} plugin`,
    description: plugin.description,
    path: `/plugins/${plugin.id}`,
  });
}

export default async function PluginDetailPage({ params }: Props) {
  const { id } = await params;
  const plugin = PLUGIN_CATALOG.find((p) => p.id === id);

  if (!plugin) {
    notFound();
  }

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <Link href="/plugins" className="agi-cta-ghost" style={{ paddingTop: 0 }}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Plugins
          </Link>
          <h1 className="agi-page-h1" style={{ marginTop: 18 }}>
            {plugin.name}.
          </h1>
          <p className="agi-page-lede">
            {plugin.description}{' '}
            <strong>Catalogue preview — hosted marketplace installation is not open yet.</strong>
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/plugins#request-access" className="agi-cta-primary">
              Request marketplace access
            </Link>
          </div>
        </section>

        <section className="agi-section" aria-labelledby="agi-plugin-facts-title">
          <p className="agi-section-eyebrow">The record</p>
          <h2 id="agi-plugin-facts-title" className="agi-section-h2">
            The facts, plainly stated.
          </h2>
          <dl className="agi-colophon">
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Author</dt>
              <dd className="agi-colophon-val">{plugin.author}</dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Version</dt>
              <dd className="agi-colophon-val">v{plugin.version}</dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Category</dt>
              <dd className="agi-colophon-val">{plugin.category}</dd>
            </div>
            <div className="agi-colophon-row">
              <dt className="agi-colophon-key">Source</dt>
              <dd className="agi-colophon-val">{sourceLabel(plugin.source)}</dd>
            </div>
          </dl>
        </section>

        <section className="agi-section" aria-labelledby="agi-plugin-skills-title">
          <p className="agi-section-eyebrow">Included skills</p>
          <h2 id="agi-plugin-skills-title" className="agi-section-h2">
            What the pack teaches the agent.
          </h2>
          {plugin.skills.length === 0 ? (
            <p className="agi-reason-p" style={{ margin: 0 }}>
              No skills bundled with this plugin.
            </p>
          ) : (
            <div className="agi-chip-row" aria-label={`Skills in ${plugin.name}`}>
              {plugin.skills.map((skill) => (
                <span key={skill} className="agi-chip">
                  {skill}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="agi-section" aria-labelledby="agi-plugin-connectors-title">
          <p className="agi-section-eyebrow">Required connectors</p>
          <h2 id="agi-plugin-connectors-title" className="agi-section-h2">
            Connect once, use everywhere in the pack.
          </h2>
          <ConnectorChecklist connectorIds={plugin.connectors} />
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
