import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Eyebrow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero, FactGrid } from '@/features/marketing/components/pages/surfaces/shared';
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

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-plugins-title"
          eyebrow="Plugins"
          title="Workflow packs, not loose parts."
          lede={
            <>
              Plugins bundle skills and connectors into a single install. The catalogue below is the
              live hosted registry. <strong>{pluginAvailabilityClaim(catalog)}</strong>
            </>
          }
          ctas={[{ href: '/features/plugins', label: 'What a plugin bundles' }]}
        />

        <Section id="how-it-works" labelledBy="agi-plugins-model-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>How a plugin works</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-plugins-model-title">
                Skills plus connectors, wired once.
              </h2>
            </div>
            <FactGrid
              items={[
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
              ]}
            />
          </Stack>
        </Section>

        <Section id="catalogue" labelledBy="agi-plugins-catalog-title" rule ground="2">
          <Stack gap="loose">
            <div>
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
          </Stack>
        </Section>

        <Section id="request-access" labelledBy="agi-plugins-cta-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>At launch</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-plugins-cta-title">
                Get notified when installation opens.
              </h2>
              <Prose>
                Leave your email and we will tell you when hosted marketplace installation is live.
                Local skills and desktop workflows do not depend on it.
              </Prose>
            </div>
            <WaitlistForm source="other" ctaLabel="Request marketplace access" />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
