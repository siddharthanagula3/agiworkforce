import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PLUGIN_CATALOG } from '@/features/plugins/data/plugins';
import { WaitlistForm } from '../byok/WaitlistForm';

export const metadata = buildMetadata({
  title: 'Plugins',
  description:
    'Plugin workflow packs that bundle skills and connectors. Browse the catalogue preview; hosted marketplace installation opens through the account-bound cloud access flow.',
  path: '/plugins',
});

function sourceLabel(source: string): string {
  if (source === 'builtin') return 'Built-in';
  if (source === 'marketplace') return 'Marketplace';
  return 'Custom';
}

export default function PluginsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">
            Workflow packs, <em>not loose parts.</em>
          </h1>
          <p className="agi-page-lede">
            Plugins bundle skills and connectors into a single install.{' '}
            <strong>
              This is a preview of the catalogue shape — hosted marketplace installation is not open
              yet.
            </strong>{' '}
            It opens through the same account-bound cloud access flow as everything else.
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
              <h3 className="agi-reason-h">Launch preview</h3>
              <p className="agi-reason-p">
                Browse the packs below while installation and permission enforcement are finalized.
                Nothing here installs yet.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section" aria-labelledby="agi-plugins-catalog-title">
          <p className="agi-section-eyebrow">Catalogue preview</p>
          <h2 id="agi-plugins-catalog-title" className="agi-section-h2">
            The first packs.
          </h2>
          <div className="agi-route-grid">
            {PLUGIN_CATALOG.map((plugin) => (
              <Link key={plugin.id} href={`/plugins/${plugin.id}`} className="agi-route-card">
                <span className="agi-route-meta">
                  {plugin.category} · {sourceLabel(plugin.source)}
                </span>
                <span className="agi-route-title">{plugin.name}</span>
                <span className="agi-route-body">{plugin.description}</span>
                {plugin.skills.length > 0 ? (
                  <span
                    className="agi-chip-row"
                    style={{ marginTop: 18 }}
                    aria-label={`Skills in ${plugin.name}`}
                  >
                    {plugin.skills.slice(0, 3).map((skill) => (
                      <span key={skill} className="agi-chip">
                        {skill}
                      </span>
                    ))}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
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
