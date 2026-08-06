import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { loadPluginCatalog } from '@/features/plugins/server/registry-source';
import { isPluginEntryInstallable, type PluginRegistryEntry } from '@agiworkforce/types';
import { WaitlistForm } from '../byok/WaitlistForm';

/**
 * The plugin catalogue (CAP-046 slice 3).
 *
 * This page used to render a TypeScript fixture. It now renders the hosted
 * registry (`public.plugin_registry_entries`), so the catalogue is real data
 * with real failure modes — hence the explicit unavailable/empty branches
 * below and `loading.tsx` alongside this file.
 *
 * The copy tracks the DATA rather than a hardcoded launch claim: entries carry
 * a status, and only a `published` entry with a real artifact is installable.
 * Today every row is `preview`, so the page says installation is not open — but
 * it says it because `installableCount === 0`, not because a sentence was
 * pasted in.
 */

export const metadata = buildMetadata({
  title: 'Plugins',
  description:
    'Plugin workflow packs that bundle skills and connectors. Browse the hosted catalogue; each pack states whether it is installable yet.',
  path: '/plugins',
});

// The catalogue lives in the database, so this route cannot be baked at build
// time. Requests render against the live registry.
export const dynamic = 'force-dynamic';

function sourceLabel(source: PluginRegistryEntry['source']): string {
  if (source === 'builtin') return 'Built-in';
  if (source === 'marketplace') return 'Marketplace';
  return 'Custom';
}

function statusLabel(entry: PluginRegistryEntry): string {
  if (isPluginEntryInstallable(entry)) return 'Installable';
  if (entry.status === 'deprecated') return 'Deprecated';
  return 'Declared — not installable yet';
}

export default async function PluginsPage() {
  const catalog = await loadPluginCatalog();
  const entries = catalog.status === 'ok' ? catalog.entries : [];
  const installableCount = entries.filter(isPluginEntryInstallable).length;

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">
            Workflow packs, <em>not loose parts.</em>
          </h1>
          <p className="agi-page-lede">
            Plugins bundle skills and connectors into a single install. The catalogue below is the
            live hosted registry.{' '}
            {installableCount === 0 ? (
              <strong>
                No pack is installable yet — every entry is a declared pack with no published
                artifact.
              </strong>
            ) : (
              <strong>
                {installableCount} of {entries.length} packs are installable today; the rest are
                declared and not yet published.
              </strong>
            )}
          </p>
        </section>

        <section className="agi-section" aria-labelledby="agi-plugins-model-title">
          <p className="agi-section-eyebrow">How a plugin works</p>
          <h2 id="agi-plugins-model-title" className="agi-section-h2">
            Skills plus connectors, wired once.
          </h2>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Bundled skills</h3>
              <p className="agi-reason-p">
                Each pack ships curated skill prompts tuned for one workflow, instead of a pile of
                one-off prompts.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Connector wiring</h3>
              <p className="agi-reason-p">
                A plugin declares which connectors it needs. Connect once, and every skill in the
                pack can use it — inside the permission boundary you chose.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">What a status means</h3>
              <p className="agi-reason-p">
                A pack is only marked installable once a signed-off manifest is published and its
                checksum is recorded. Until then it is listed as declared, and nothing pretends to
                install it.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section" aria-labelledby="agi-plugins-catalog-title">
          <p className="agi-section-eyebrow">Catalogue</p>
          <h2 id="agi-plugins-catalog-title" className="agi-section-h2">
            The first packs.
          </h2>

          {catalog.status === 'unavailable' ? (
            <p className="agi-reason-p" style={{ margin: 0 }} role="status">
              The plugin registry is temporarily unreachable, so the catalogue cannot be shown right
              now. Nothing is wrong with your account — reload in a moment.
            </p>
          ) : entries.length === 0 ? (
            <p className="agi-reason-p" style={{ margin: 0 }}>
              No packs are published to the registry yet. This page will list them as soon as the
              first one lands.
            </p>
          ) : (
            <div className="agi-route-grid">
              {entries.map((entry) => (
                <Link key={entry.id} href={`/plugins/${entry.id}`} className="agi-route-card">
                  <span className="agi-route-meta">
                    {entry.category} · {sourceLabel(entry.source)} · {statusLabel(entry)}
                  </span>
                  <span className="agi-route-title">{entry.name}</span>
                  <span className="agi-route-body">{entry.description}</span>
                  {entry.declaredSkills.length > 0 ? (
                    <span
                      className="agi-chip-row"
                      style={{ marginTop: 18 }}
                      aria-label={`Skills in ${entry.name}`}
                    >
                      {entry.declaredSkills.slice(0, 3).map((skill) => (
                        <span key={skill} className="agi-chip">
                          {skill}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section
          className="agi-section"
          id="request-access"
          aria-labelledby="agi-plugins-cta-title"
        >
          <p className="agi-section-eyebrow">At launch</p>
          <h2 id="agi-plugins-cta-title" className="agi-section-h2">
            Get notified when installation opens.
          </h2>
          <p className="agi-page-lede" style={{ marginTop: 0, marginBottom: 28 }}>
            Leave your email and we will tell you when hosted marketplace installation is live.
            Local skills and desktop workflows do not depend on it.
          </p>
          <div style={{ maxWidth: 560 }}>
            <WaitlistForm source="other" ctaLabel="Request marketplace access" />
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
