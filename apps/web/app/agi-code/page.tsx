import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import {
  CampaignHero,
  FeatureGrid,
  LaunchCta,
  LedgerSection,
  RouteMap,
} from '../../components/marketing/LandingSections';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Code - Coding agents across CLI, desktop, web, and VS Code',
  description:
    'AGI Code brings Codex and Claude Code-style workflows to a multi-provider, Local, BYOK, and invite-only Cloud product suite.',
  alternates: { canonical: 'https://agiworkforce.com/agi-code' },
};

export default function AgiCodePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Developer surface`}
          title="A coding agent suite where the model is not the product prison."
          lede="Codex and Claude Code set the bar: terminal agents, IDE extensions, cloud tasks, diffs, tests, permissions, and parallel work. AGI Code targets that workflow while letting builders choose local models, BYOK providers, or invite-only AGI Cloud."
          primaryCta={{ href: '/cli', label: 'Open CLI page' }}
          secondaryCta={{ href: '/vscode-extension', label: 'VS Code extension' }}
          chips={['CLI', 'VS Code', 'Desktop Code', 'Worktrees', 'Permissions']}
          panelTitle="AGI Code"
          panelRows={[
            { k: 'CLI', v: 'Sessions, tools, permissions, hooks, MCP, and slash commands' },
            { k: 'IDE', v: 'Sidebar chat, diffs, model picker, context files, and reviews' },
            { k: 'Desktop', v: 'GUI wrapper for code sessions and local runtime management' },
            { k: 'Cloud', v: 'Invite-only background tasks when managed controls are ready' },
          ]}
        />

        <FeatureGrid
          eyebrow="Developer parity"
          title="The core AGI Code checklist."
          items={[
            {
              meta: 'Terminal',
              title: 'Agentic CLI',
              body: 'Read files, edit patches, run tests, inspect git, manage permissions, compact context, and resume sessions from the terminal.',
              href: '/cli',
            },
            {
              meta: 'IDE',
              title: 'VS Code and Cursor-style extension',
              body: 'Chat, edit, review, accept/reject diffs, @-mention files, and switch models without leaving the editor.',
              href: '/vscode-extension',
            },
            {
              meta: 'Multi-agent',
              title: 'Parallel work with isolation',
              body: 'Use worktrees or sandboxes for separate tasks so multiple agents can implement, test, and prepare PRs in parallel.',
            },
            {
              meta: 'Safety',
              title: 'Permissions before power',
              body: 'Ask, accept edits, plan, auto, and bypass-style modes need visible tool inputs, command risk, and workspace scope.',
            },
            {
              meta: 'Models',
              title: 'Use the model fit for the job',
              body: 'Route quick edits to fast models, hard debugging to frontier reasoning models, and private experiments to local models.',
            },
            {
              meta: 'Cloud invite',
              title: 'Background automation later',
              body: 'Cloud coding tasks should stay invite-only until metering, abuse, logs, and environment controls are production-ready.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="What the ads should say"
          title="Developer positioning against Codex and Claude Code."
          rows={[
            {
              k: 'Core claim',
              v: 'AGI Code gives developers a coding-agent workflow across CLI, desktop, web, and VS Code with Local, BYOK, and Cloud invite modes.',
            },
            {
              k: 'Differentiator',
              v: 'OpenAI and Anthropic ship excellent agents locked to their model ecosystems. AGI makes provider choice the default.',
            },
            {
              k: 'Proof to show',
              v: 'Demos should show model switching, permission prompts, file diffs, test loops, and provider labels in one session.',
            },
            {
              k: 'Risk to avoid',
              v: 'Do not imply managed cloud coding is public before invite access and control-plane readiness.',
            },
          ]}
        />

        <RouteMap
          eyebrow="Developer pages"
          title="Split developer traffic by workflow."
          routes={[
            {
              meta: 'Terminal',
              title: 'CLI',
              body: 'The command-line coding surface.',
              href: '/cli',
            },
            {
              meta: 'Editor',
              title: 'VS Code',
              body: 'Editor-native chat, diffs, and reviews.',
              href: '/vscode-extension',
            },
            {
              meta: 'Compare',
              title: 'AGI vs Codex',
              body: 'How provider choice changes the Codex-style workflow.',
              href: '/compare/codex',
            },
            {
              meta: 'Compare',
              title: 'AGI vs Claude Code',
              body: 'Where Claude Code wins and where AGI differs.',
              href: '/compare/claude-code',
            },
          ]}
        />

        <LaunchCta
          title="Ship the developer product as a suite, not a terminal-only utility."
          body="Your target users need the same task to move between CLI, editor, desktop, web, and mobile approvals without losing context or provider choice."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/compare/codex', label: 'Compare with Codex' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
