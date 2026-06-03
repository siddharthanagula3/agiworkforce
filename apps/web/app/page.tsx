import type { Metadata } from 'next';
import { Header } from '../components/layout/Header';
import { MarketingFooter } from '../components/marketing/MarketingFooter';
import { AgiChatDemo } from '../components/agi/AgiChatDemo';
import { LAUNCH, MARKETING, POSITIONING } from '../lib/marketing-constants';
import {
  CampaignHero,
  FeatureGrid,
  ProofStrip,
  RouteMap,
} from '../components/marketing/LandingSections';

export const metadata: Metadata = {
  title: 'AGI: Every model. Every surface. Your choice.',
  description:
    `${POSITIONING.wedge} ` +
    `${MARKETING.providers.display} AI providers in one thread, ` +
    `across desktop, web, mobile, CLI, VS Code, and Chrome. ${LAUNCH.publicLabel}.`,
  keywords: [
    'AI agent',
    'AI automation',
    'desktop AI app',
    'privacy-first AI',
    'local AI',
    'BYOK AI',
    'offline AI',
    'multi-provider AI',
    'Tauri desktop app',
    'Ollama',
    'LM Studio',
    'OpenAI',
    'Anthropic',
    'Gemini',
    'data privacy',
  ],
  openGraph: {
    title: 'AGI: Every model. Every surface. Your choice.',
    description: `${POSITIONING.wedge} ${MARKETING.providers.display} AI providers in one thread.`,
    type: 'website',
    url: 'https://agiworkforce.com',
    images: [{ url: '/app-preview.png', width: 1200, height: 630, alt: 'AGI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI: Every model. Every surface. Your choice.',
    description: `${MARKETING.providers.display} providers, ${MARKETING.surfaces.display} surfaces, one workforce. ${LAUNCH.publicLabel}.`,
    images: ['/app-preview.png'],
  },
};

export default function Home() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · ${POSITIONING.wedge}`}
          title="Every model. Every surface. Your choice."
          lede={`${MARKETING.providers.display} provider routes in one account. Try hosted Auto Economy on the web, then move serious work to local, BYOK, desktop, CLI, VS Code, Chrome, or mobile.`}
          primaryCta={{ href: '/chat', label: 'Try AGI free' }}
          secondaryCta={{ href: '/download', label: 'Install local app' }}
          chips={['Web', 'Mobile', 'Desktop', 'CLI', 'Chrome', 'VS Code']}
          panelTitle="AGI suite"
          panelRows={[
            { k: 'Modes', v: 'Web trial, Local, BYOK, and invite-only managed cloud' },
            { k: 'Surface order', v: 'Website, Desktop, Mobile, CLI, Chrome, VS Code' },
            { k: 'Boundary', v: POSITIONING.trustBoundary },
            { k: 'Launch', v: LAUNCH.date },
          ]}
        />

        <ProofStrip
          items={[
            {
              value: MARKETING.providers.display,
              label: 'Provider routes',
              note: 'Cloud, local, and OpenAI-compatible endpoints where available',
            },
            {
              value: MARKETING.surfaces.display,
              label: 'Product surfaces',
              note: 'Web, Mobile, Desktop, CLI, Chrome, VS Code',
            },
            {
              value: '3',
              label: 'Trust modes',
              note: 'Local, BYOK, Cloud invite',
            },
            {
              value: LAUNCH.shortDate,
              label: 'Public launch date',
              note: 'Campaign date locked for the launch plan',
            },
          ]}
        />

        <section className="agi-demo">
          <AgiChatDemo />
        </section>

        <FeatureGrid
          eyebrow="The wedge"
          title="Start free where AGI does not pay the compute bill."
          items={[
            {
              meta: 'Local',
              title: 'Free Local',
              body: 'Users start with supported Ollama, LM Studio, Apple, Gemini Nano, Gemma, and other on-device routes where available.',
              href: '/local',
            },
            {
              meta: 'BYOK',
              title: 'Free BYOK',
              body: 'Users bring supported provider keys and route work explicitly to the selected provider. Provider billing and retention are route-specific.',
              href: '/byok',
            },
            {
              meta: 'Web',
              title: 'Hosted trial',
              body: 'Signed-in website users can try Auto Economy with a small prompt cap while higher hosted capacity stays waitlisted.',
              href: '/chat',
            },
          ]}
        />

        <RouteMap
          eyebrow="Six products, one account"
          title="Route each visitor to the surface they care about."
          routes={[
            {
              meta: 'Website',
              title: 'AGI Web',
              body: 'Familiar browser chat, account, projects, artifacts, waitlist capture, docs, and shared conversations.',
              href: '/chat',
            },
            {
              meta: 'Desktop',
              title: 'AGI Desktop',
              body: 'Local compute host, BYOK vault, computer use, files, browser, MCP, and sync bridge.',
              href: '/desktop',
            },
            {
              meta: 'Mobile',
              title: 'AGI Mobile',
              body: 'Local chat, BYOK providers, approvals, dispatch, and cloud invite capture.',
              href: '/mobile',
            },
            {
              meta: 'CLI',
              title: 'AGI CLI',
              body: 'Agentic developer engine with sessions, tools, permissions, hooks, and MCP server mode.',
              href: '/cli',
            },
            {
              meta: 'Chrome',
              title: 'AGI in Chrome',
              body: 'Page-aware side panel routed through desktop, Local, BYOK, or invited Cloud.',
              href: '/chrome-extension',
            },
            {
              meta: 'VS Code',
              title: 'AGI in VS Code',
              body: 'Editor-native chat, model picker, diffs, slash commands, and desktop bridge.',
              href: '/vscode-extension',
            },
          ]}
        />

        <RouteMap
          eyebrow="Capability pages"
          title="The pages ads were missing."
          routes={[
            {
              meta: 'Workspace',
              title: 'Business',
              body: 'Projects, governance, apps, artifacts, research, and AGI Code.',
              href: '/business',
            },
            {
              meta: 'Developer',
              title: 'AGI Code',
              body: 'CLI, VS Code, desktop code, tests, diffs, permissions, and provider routing.',
              href: '/agi-code',
            },
            {
              meta: 'Tools',
              title: 'Apps and connectors',
              body: 'MCP, OAuth apps, local extensions, and explicit tool permissions.',
              href: '/apps',
            },
            {
              meta: 'Desktop agent',
              title: 'Cowork',
              body: 'Browser, files, apps, scheduled tasks, live artifacts, and dispatch.',
              href: '/cowork',
            },
            {
              meta: 'Creation',
              title: 'Artifacts',
              body: 'Canvas-style apps, documents, reports, code, and versions.',
              href: '/features/artifacts',
            },
            {
              meta: 'Research',
              title: 'Deep Research',
              body: 'Cited reports across web, files, projects, and connected tools.',
              href: '/features/deep-research',
            },
          ]}
        />

        <section className="agi-section">
          <div
            className="agi-callout"
            style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}
          >
            <div>
              <p className="agi-section-eyebrow" style={{ marginBottom: 8 }}>
                Launch campaign
              </p>
              <h2 className="agi-callout-h" style={{ marginBottom: 6 }}>
                {LAUNCH.allProductsLabel}.
              </h2>
              <p className="agi-callout-p">
                One message for ads: AGI gives users OpenAI and Claude-style applications without
                locking them to one company&apos;s models.
              </p>
            </div>
            <a href="/chat" className="agi-cta-primary" style={{ alignSelf: 'center' }}>
              Try web chat &rarr;
            </a>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
