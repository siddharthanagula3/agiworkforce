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
  title: 'AGI vs Codex - Coding agents with provider choice',
  description:
    'Compare AGI Code with OpenAI Codex: CLI, IDE, cloud tasks, worktrees, permissions, and the difference of Local and BYOK model routing.',
  alternates: { canonical: 'https://agiworkforce.com/compare/codex' },
};

export default function CodexComparePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Comparison`}
          title="Codex is the benchmark. AGI adds model choice."
          lede={`OpenAI Codex is a strong coding-agent product across CLI, IDE, web, and app workflows. AGI Code competes by targeting the same developer workflow while keeping Local, BYOK, and Cloud as separate trust boundaries. ${POSITIONING.trustBoundary}`}
          primaryCta={{ href: '/agi-code', label: 'See AGI Code' }}
          secondaryCta={{ href: '/cli', label: 'CLI surface' }}
          chips={['CLI', 'IDE', 'Worktrees', 'Permissions', 'BYOK']}
          panelTitle="Comparison frame"
          panelRows={[
            {
              k: 'Codex strength',
              v: 'Deep OpenAI coding-model integration and cloud task workflow',
            },
            {
              k: 'AGI bet',
              v: 'Same agentic workflow category, but across providers and local models',
            },
            { k: 'Risk', v: 'AGI must prove quality with demos, tests, and end-to-end edits' },
            { k: 'Launch', v: LAUNCH.allProductsLabel },
          ]}
        />

        <FeatureGrid
          eyebrow="Where Codex is strong"
          title="Respect the competitor and state the wedge."
          items={[
            {
              meta: 'Codex',
              title: 'OpenAI owns the model stack',
              body: 'Codex benefits from tight integration with OpenAI coding models, ChatGPT accounts, and OpenAI cloud task infrastructure.',
            },
            {
              meta: 'Codex',
              title: 'Cloud tasks and worktrees are a high bar',
              body: 'Parallel coding agents, isolated environments, PR workflows, and IDE handoff are the standard AGI must match.',
            },
            {
              meta: 'AGI',
              title: 'Provider routing is the wedge',
              body: 'AGI should let builders choose OpenAI, Anthropic, Gemini, local LLMs, OpenRouter, Groq, Mistral, xAI, DeepSeek, and compatible endpoints where available.',
            },
            {
              meta: 'AGI',
              title: 'Local and BYOK reduce launch burn',
              body: 'Users can start with their device or provider keys before AGI-managed cloud compute is broadly opened.',
            },
            {
              meta: 'AGI',
              title: 'One suite beyond code',
              body: 'AGI Code should connect to chat, artifacts, projects, apps, desktop Cowork, and mobile approvals.',
            },
            {
              meta: 'Caution',
              title: 'Do not sell cloud parity before it is gated correctly',
              body: 'Managed cloud coding should remain invite-only until metering, environment controls, abuse handling, and retention policies are proven.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Comparison table"
          title="What users need to know."
          rows={[
            {
              k: 'Best for Codex',
              v: 'Teams committed to OpenAI and wanting the most direct ChatGPT plus Codex workflow.',
            },
            {
              k: 'Best for AGI',
              v: 'Developers who want coding-agent workflows but need local models, BYOK providers, and provider switching.',
            },
            {
              k: 'Where AGI must prove itself',
              v: 'End-to-end file edits, test loops, diffs, session resume, IDE polish, worktree handling, and safe permissions.',
            },
            {
              k: 'Ad angle',
              v: 'Codex-style coding agents, but bring your own model and keep local work local.',
            },
          ]}
        />

        <LaunchCta
          title="Use this page for high-intent Codex alternative searches."
          body="The page should be honest: Codex is excellent, but users who want provider choice need AGI."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/compare/claude-code', label: 'Compare Claude Code' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
