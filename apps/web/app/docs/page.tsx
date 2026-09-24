import Link from 'next/link';

import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { Ledger, Prose, Section, Stack } from '@/features/marketing/components/system';
import { buildMetadata } from '@/lib/seo/metadata';
import {
  DOC_AUDIENCE_LABELS,
  DOC_MATURITY_LABELS,
  describePlans,
  describePlatforms,
  describeSegments,
} from '@/lib/support/doc-metadata';
import { documentationIndex, type DocIndexEntry } from './doc-index';

export const metadata = buildMetadata({
  title: 'Documentation',
  description:
    'Reference for every AGI surface: CLI, Desktop, Mobile, Web, Chrome, and VS Code extension.',
  path: '/docs',
});

const SURFACE_GUIDES = [
  {
    href: '/get-started',
    title: 'Start with AGI',
    body: 'Choose a route, sign in, and understand what follows your account and what stays on your device.',
  },
  {
    href: '/web',
    title: 'Web',
    body: 'Managed chat, projects, artifacts, memory, cited research, connected tools, and account settings.',
  },
  {
    href: '/mobile',
    title: 'Mobile',
    body: 'The planned iPhone and Android clients, including Cloud continuity and device-local work.',
  },
  {
    href: '/desktop',
    title: 'Desktop',
    body: 'The planned macOS app for Managed Cloud, approved folders, computer use, voice, and the trusted local host.',
  },
  {
    href: '/chrome-extension',
    title: 'Chrome',
    body: 'The planned browser side panel for page context and approvals. Answers come back from AGI Managed Cloud; pairing Desktop is an optional local road for approved handoffs.',
  },
  {
    href: '/cli',
    title: 'CLI',
    body: 'The Rust-native local developer agent for sessions, tools, diffs, reviews, sandboxed execution, and hooks.',
  },
  {
    href: '/vscode-extension',
    title: 'VS Code',
    body: 'The planned IDE client over the same host-owned developer sessions, tools, permissions, and files as the CLI.',
  },
] as const;

const REFERENCE_GUIDES = [
  {
    href: '/api-docs',
    title: 'API reference',
    body: 'OpenAI-compatible endpoints, authentication, request shapes, and response contracts.',
  },
  {
    href: '/providers',
    title: 'Providers and models',
    body: 'The current catalogue, provider routes, capability labels, and availability information.',
  },
  {
    href: '/integrations',
    title: 'Tools and integrations',
    body: 'Connected apps, MCP tools, plugins, and the trust boundary around every route.',
  },
  {
    href: '/local',
    title: 'Local mode',
    body: 'What stays on the device, which surfaces can run locally, and how an explicit handoff works.',
  },
  {
    href: '/byok',
    title: 'Bring your own key',
    body: 'Where BYOK is available, how provider credentials are stored, and what never enters account sync.',
  },
  {
    href: '/security',
    title: 'Security and trust',
    body: 'Isolation, approvals, data handling, retention, deletion, and the limits of current claims.',
  },
] as const;

function applicabilityLines(entry: DocIndexEntry): readonly string[] {
  const metadata = entry.metadata;
  if (!metadata) return [`Updated ${entry.updated}`];
  const { platforms, plans, apiVersions } = metadata.applicability;
  const first = [
    DOC_MATURITY_LABELS[metadata.maturity],
    DOC_AUDIENCE_LABELS[metadata.audience],
    describePlatforms(platforms),
    ...(apiVersions ? [`API ${apiVersions.join(', ')}`] : []),
  ].join(' · ');
  return [first, `${describePlans(plans)} · ${describeSegments(plans)} · Updated ${entry.updated}`];
}

function guideRows(guides: typeof SURFACE_GUIDES | typeof REFERENCE_GUIDES) {
  return guides.map((guide) => ({
    label: (
      <Link href={guide.href} className="agi-ds-link">
        {guide.title}
      </Link>
    ),
    value: guide.body,
  }));
}

export default function DocsPage() {
  const { groups, documentCount, newestUpdate } = documentationIndex();

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-docs-title"
          eyebrow="Documentation"
          title="Build with every AGI surface."
          em="every AGI surface."
          lede="One account connects the Cloud app surfaces. Desktop, CLI, and VS Code share a separate host-owned developer runtime. These guides state which data follows you, which tools are available, and where each trust boundary begins."
          ctas={[
            { href: '/get-started', label: 'Start here' },
            { href: '/api-docs', label: 'API reference', variant: 'secondary' },
          ]}
        />

        <Section id="surfaces" labelledBy="agi-docs-surfaces-title" rule>
          <Stack gap="loose">
            <div>
              <p className="agi-ds-eyebrow">Surface guides</p>
              <h2 className="agi-ds-h2" id="agi-docs-surfaces-title">
                Start where you work.
              </h2>
            </div>
            <Prose>
              The website is the active launch surface. The remaining guides describe the current
              implementation and release state without presenting planned clients as published.
            </Prose>
            <Ledger caption="AGI surface guides" rows={guideRows(SURFACE_GUIDES)} />
          </Stack>
        </Section>

        <Section id="reference" labelledBy="agi-docs-reference-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <p className="agi-ds-eyebrow">Reference</p>
              <h2 className="agi-ds-h2" id="agi-docs-reference-title">
                Routes, models, tools, and trust.
              </h2>
            </div>
            <Ledger caption="AGI reference guides" rows={guideRows(REFERENCE_GUIDES)} />
          </Stack>
        </Section>

        <Section id="index" labelledBy="agi-docs-index-title" rule>
          <Stack gap="loose">
            <div>
              <p className="agi-ds-eyebrow">Documentation index</p>
              <h2 className="agi-ds-h2" id="agi-docs-index-title">
                Every page, its scope, and its review date.
              </h2>
            </div>
            {groups.length > 0 ? (
              <>
                <Prose>
                  {`${documentCount} pages. Each row states its maturity, audience, supported surfaces and plans, and the date its claims were last checked${newestUpdate ? `. Newest: ${newestUpdate}` : ''}.`}
                </Prose>
                {groups.map((group) => (
                  <Stack gap="tight" key={group.id}>
                    <h3 className="agi-ds-h3">{group.label}</h3>
                    <Ledger
                      caption={`${group.label} documentation`}
                      rows={group.entries.map((entry) => ({
                        label: (
                          <Link href={entry.href} className="agi-ds-link">
                            {entry.title}
                          </Link>
                        ),
                        value: (
                          <Stack gap="tight">
                            {applicabilityLines(entry).map((line) => (
                              <span key={line}>{line}</span>
                            ))}
                          </Stack>
                        ),
                      }))}
                    />
                  </Stack>
                ))}
              </>
            ) : (
              <Prose>
                The documentation index is not loading right now. The surface and reference guides
                above still work, and the help centre reaches the same support material.
              </Prose>
            )}
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
