import type { Metadata } from 'next';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';
import {
  CampaignHero,
  FeatureGrid,
  LaunchCta,
  LedgerSection,
} from '../../../components/marketing/LandingSections';
import { LAUNCH, POSITIONING } from '../../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI vs Claude Code - Coding agents across models and surfaces',
  description:
    'Compare AGI Code with Claude Code: terminal agents, IDE extension, permissions, tests, MCP, hooks, and multi-provider routing.',
  alternates: { canonical: 'https://agiworkforce.com/compare/claude-code' },
};

export default function ClaudeCodeComparePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Comparison`}
          title="Claude Code is the control room. AGI makes the model selectable."
          lede={`Claude Code set a very high bar for terminal-native agentic coding, permissions, MCP, hooks, and autonomous edits. AGI Code competes by carrying that product pattern into a multi-provider suite with Local, BYOK, and invite-only Cloud. ${POSITIONING.trustBoundary}`}
          primaryCta={{ href: '/agi-code', label: 'See AGI Code' }}
          secondaryCta={{ href: '/vscode-extension', label: 'VS Code surface' }}
          chips={['Terminal', 'MCP', 'Hooks', 'Permissions', 'Provider routing']}
          panelTitle="Comparison frame"
          panelRows={[
            {
              k: 'Claude strength',
              v: 'Best-in-class terminal workflow and Claude model alignment',
            },
            {
              k: 'AGI bet',
              v: 'Keep the workflow, choose the provider, preserve the trust boundary',
            },
            { k: 'Must prove', v: 'Safe edits, stable sessions, IDE polish, and real tests' },
            { k: 'Launch', v: LAUNCH.allProductsLabel },
          ]}
        />

        <FeatureGrid
          eyebrow="Where Claude Code is strong"
          title="The AGI page should not pretend the competitor is weak."
          items={[
            {
              meta: 'Claude Code',
              title: 'Terminal-native depth',
              body: 'Claude Code is known for strong repository understanding, command execution, permissions, MCP, hooks, and iterative test loops.',
            },
            {
              meta: 'Claude Code',
              title: 'Claude model fit',
              body: 'The product is tuned around Anthropic models and a mature developer workflow.',
            },
            {
              meta: 'AGI',
              title: 'Provider choice by coding task',
              body: 'AGI should let developers route between Claude, OpenAI, Gemini, local models, OpenRouter, Groq, Mistral, and compatible endpoints where available.',
            },
            {
              meta: 'AGI',
              title: 'One account across six surfaces',
              body: 'A coding task should start in CLI, continue in VS Code, report to mobile, and connect with desktop Cowork when needed.',
            },
            {
              meta: 'AGI',
              title: 'Local and BYOK first',
              body: 'The go-to-market wedge is free local and BYOK developer usage, with managed cloud invite access later.',
            },
            {
              meta: 'Caution',
              title: 'Never silently cross boundaries',
              body: 'A local repo session must not become BYOK or Cloud work without an explicit context handoff, provider label, and consent.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Comparison table"
          title="How to explain the choice."
          rows={[
            {
              k: 'Best for Claude Code',
              v: 'Developers committed to Anthropic models who want the mature Claude terminal workflow.',
            },
            {
              k: 'Best for AGI',
              v: 'Developers who like Claude Code-style workflows but need local models, BYOK providers, and cross-surface continuity.',
            },
            {
              k: 'Where AGI must prove itself',
              v: 'Repository edits, slash commands, MCP diagnostics, hooks, plan mode, IDE handoff, and permission ergonomics.',
            },
            {
              k: 'Ad angle',
              v: 'Claude Code-style developer control, but with explicit BYOK and local model routing.',
            },
          ]}
        />

        <LaunchCta
          title="Use this page for high-intent Claude Code alternative searches."
          body="The honest wedge is simple: Claude Code is excellent for Claude. AGI Code is for builders who want that workflow across models."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/compare/codex', label: 'Compare Codex' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
