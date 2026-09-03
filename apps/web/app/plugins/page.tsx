import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import {
  Button,
  ButtonRow,
  Eyebrow,
  MarketingFooter,
  Prose,
} from '@/features/marketing/components/system';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';
import { loadPluginCatalog } from '@/features/plugins/server/registry-source';
import { pluginAvailabilityClaim } from '@/features/plugins/availability';
import {
  isPluginEntryInstallable,
  isPluginEntryWebInstallable,
  type PluginRegistryEntry,
} from '@agiworkforce/types';
import { WaitlistForm } from '../byok/WaitlistForm';

export const metadata = buildMetadata({
  title: 'Plugins',
  description:
    'Plugin workflow packs that bundle skills and connectors. Browse the hosted catalogue; each pack states whether it is installable yet.',
  path: '/plugins',
});

export const dynamic = 'force-dynamic';

function sourceLabel(source: PluginRegistryEntry['source']): string {
  if (source === 'builtin') return 'Built-in';
  if (source === 'marketplace') return 'Marketplace';
  return 'Custom';
}

function statusLabel(entry: PluginRegistryEntry): string {
  if (isPluginEntryWebInstallable(entry)) return 'Available on Web';
  if (isPluginEntryInstallable(entry)) return 'Installable';
  if (entry.status === 'deprecated') return 'Deprecated';
  return 'Declared, not installable yet';
}

export default async function PluginsPage() {
  const catalog = await loadPluginCatalog();
  const entries = catalog.status === 'ok' ? catalog.entries : [];
  const preview = entries.slice(0, 3);

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby="agi-plugins-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>Plugins</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-plugins-title">
                Workflow packs, <em className="agi-ds-accent">not loose parts.</em>
              </h1>
              <Prose size="lg">
                Plugins bundle skills and connectors into a single install. The catalogue below is
                the live hosted registry. <strong>{pluginAvailabilityClaim(catalog)}</strong>
              </Prose>
              <ButtonRow>
                <Button href="/features/plugins">What a plugin bundles</Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <div className="agi-lp-console" aria-label="Plugin registry preview">
                <div className="agi-lp-console-bar">
                  <span>Plugin registry</span>
                </div>
                <div className="agi-lp-console-body">
                  {preview.length > 0 ? (
                    <ul className="agi-ds-ledger" aria-label="A sample of the plugin registry">
                      {preview.map((entry) => (
                        <li className="agi-ds-ledger-row" key={entry.id}>
                          <span className="agi-ds-ledger-label">{entry.name}</span>
                          <span className="agi-ds-ledger-value">{statusLabel(entry)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="agi-ds-prose" data-size="sm">
                      The catalogue below has the full picture.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-plugins-model-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>How a plugin works</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-plugins-model-title">
                Skills plus connectors, wired once.
              </h2>
            </div>
            <div className="agi-ds-grid-2">
              {[
                {
                  meta: 'Skills',
                  title: 'Bundled skills',
                  body: 'Each pack ships curated skill prompts tuned for one workflow, instead of a pile of one-off prompts.',
                },
                {
                  meta: 'Connectors',
                  title: 'Connector wiring',
                  body: 'A plugin declares which connectors it needs. Connect once, and every skill in the pack can use it, inside the permission boundary you chose.',
                },
                {
                  meta: 'Status',
                  title: 'What a status means',
                  body: 'Website packs install only from reviewed embedded manifests. CLI and Desktop packs still require a separately published, integrity-pinned artifact. Until one of those paths exists, the entry remains declared and no control pretends to install it.',
                },
              ].map((item) => (
                <div className="agi-ds-card" style={{ padding: '1.5rem' }} key={item.title}>
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-plugins-catalog-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Catalogue</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-plugins-catalog-title">
                The first packs.
              </h2>
            </div>

            {catalog.status !== 'ok' ? (
              <p className="agi-ds-prose" role="status">
                The plugin registry is temporarily unreachable, so the catalogue cannot be shown
                right now. Nothing is wrong with your account. Reload in a moment.
              </p>
            ) : entries.length === 0 ? (
              <Prose>
                No packs are published to the registry yet. This page will list them as soon as the
                first one lands.
              </Prose>
            ) : (
              <LinkGrid
                items={entries.map((entry) => ({
                  meta: `${entry.category} · ${sourceLabel(entry.source)} · ${statusLabel(entry)}`,
                  title: entry.name,
                  href: `/plugins/${entry.id}`,
                  body:
                    entry.declaredSkills.length > 0 ? (
                      <>
                        {entry.description}{' '}
                        <code>{entry.declaredSkills.slice(0, 3).join(', ')}</code>
                      </>
                    ) : (
                      entry.description
                    ),
                }))}
              />
            )}
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby="agi-plugins-cta-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-plugins-cta-title">
                Get notified <em className="agi-ds-accent">when installation opens.</em>
              </h2>
              <Prose size="lg">
                Leave your email and we will tell you when hosted marketplace installation is live.
                Local skills and desktop workflows do not depend on it.
              </Prose>
              <WaitlistForm source="other" ctaLabel="Request marketplace access" />
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
