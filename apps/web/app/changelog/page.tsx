import type { Metadata } from 'next';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Ledger, Section, Stack } from '@/features/marketing/components/system';
import { FactLine, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { DESKTOP_LOCAL_RUNTIMES, LAUNCH } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Changelog',
  description: `A dated archive of what shipped and what is aligned to the public release.`,
  alternates: { canonical: '/changelog' },
  openGraph: {
    title: 'Changelog',
    description: 'A dated archive of what shipped. Honest about what has not.',
    type: 'website',
    url: 'https://agiworkforce.com/changelog',
  },
};

interface Release {
  date: string;
  headline: string;
  body: string[];
}

const RELEASES: Release[] = [
  {
    date: '2026-07-31',
    headline: 'Agent tooling and platform maturity · live',
    body: [
      'CLI: configurable keybindings, live NDJSON event streaming, named-agent runs, session search by pull request, managed-gateway model discovery.',
      'Desktop: official MCP registry connection, menu bar residency, renderer IPC isolation, secure LLM proxy settings.',
      'Web: centralized approval inbox, live admin security console, virtualized chat transcript, account session management.',
    ],
  },
  {
    date: '2026-07-03',
    headline: 'Desktop local model providers · live',
    body: [
      `Desktop now talks to ${DESKTOP_LOCAL_RUNTIMES.label} as local, self-hosted model providers, alongside the existing BYOK provider set.`,
    ],
  },
  {
    date: '2026-06-24',
    headline: 'Local, BYOK, and cloud trust boundary · live',
    body: [
      'Fail-closed egress separation enforced across all six surfaces: local mode makes no network call to us, BYOK traffic goes straight to the provider you configured, managed cloud is metered against your plan.',
      'Canonical security policy published in SECURITY.md, naming the trust-boundary model and its known gaps.',
    ],
  },
  {
    date: '2026-05-08',
    headline: 'Marketing site redesign · live',
    body: [
      'Site-wide redesign on the new dark theme. Same surface across every marketing route.',
      'Single typeface (Geist Sans), 12-spoke brand mark, single amber accent used surgically.',
      'No version numbers, no model IDs, no vanity counts in marketing copy. /changelog is the explicit exception.',
    ],
  },
  {
    date: '2026-05-04',
    headline: 'OpenClaw porting · complete',
    body: [
      'Provider adapter interface stable. Anthropic, OpenAI, Ollama, Google adapters live.',
      'MCP transport and skills loader landed. Hook events parity in the Rust CLI. Live cross-provider demo runs through the API gateway.',
    ],
  },
  {
    date: '2026-05-03',
    headline: 'CLI v1.0 · live',
    body: [
      'Pure Rust binary on five platforms. GitHub Release, Homebrew tap auto-generated, install.sh tested.',
      'Cleanup pass: removed ~70 codex-rs port crates and a large net of dead code. Audit closed most P0/P1 items.',
    ],
  },
  {
    date: '2026-02 to 2026-05',
    headline: 'Desktop · early releases',
    body: [
      `Tauri + React desktop with release signing and installer publishing aligned to the public release path.`,
      'Public download links open only after verified GitHub release assets or configured signed-asset URLs are available.',
    ],
  },
];

const FORTHCOMING: { item: string; detail: string; quarter: string }[] = [
  { item: 'Mobile', detail: 'App Store + Play Store listings.', quarter: LAUNCH.shortLabel },
  {
    item: 'Chrome extension',
    detail: 'CWS submission once visual review clears.',
    quarter: LAUNCH.shortLabel,
  },
  {
    item: 'VS Code extension',
    detail: 'Marketplace listing planned for public launch.',
    quarter: LAUNCH.shortLabel,
  },
];

const HERO_FACTS = [
  `Dated releases: ${RELEASES.length}`,
  ...RELEASES.slice(0, 1).map((release) => `Newest: ${release.date}`),
  `Forthcoming: ${FORTHCOMING.length}`,
];

export default function ChangelogPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-changelog-title"
          eyebrow="Changelog"
          title="Every shipped feature is dated."
          lede="Every 'in progress' item is named openly. We do not backdate, we do not pre-announce, and we do not list things we are not actively maintaining."
          ctas={[]}
        />

        <FactLine facts={HERO_FACTS} />

        <Section id="releases" labelledBy="agi-changelog-releases-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-changelog-releases-title">
              Releases, newest first.
            </h2>
            <Ledger
              caption="Releases"
              rows={RELEASES.map((release) => ({
                label: release.date,
                value: (
                  <Stack gap="tight">
                    <strong>{release.headline}</strong>
                    {release.body.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </Stack>
                ),
              }))}
            />
          </Stack>
        </Section>

        <Section id="forthcoming" labelledBy="agi-changelog-forthcoming-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-changelog-forthcoming-title">
              Forthcoming.
            </h2>
            <Ledger
              caption="Forthcoming"
              rows={FORTHCOMING.map((row) => ({
                label: row.item,
                value: `${row.detail} Target: ${row.quarter}.`,
              }))}
            />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
