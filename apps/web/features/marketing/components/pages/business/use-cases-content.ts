import type { LedgerRow } from '@/features/marketing/components/system';
import type { FactItem, PageCta } from '@/features/marketing/components/pages/surfaces/shared';
import { MARKETING, MARKETING_FEATURE_MATRIX, POSITIONING } from '@/lib/marketing-constants';

export interface UseCaseVisual {
  light: string;
  dark: string;
  alt: string;
  width: number;
  height: number;
  caption?: readonly string[];
}

export interface UseCaseContent {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lede: string;
  ctas: readonly PageCta[];
  visual?: UseCaseVisual;
  factsEyebrow: string;
  factsTitle: string;
  facts: readonly FactItem[];
  ledgerEyebrow: string;
  ledgerTitle: string;
  ledgerRows: readonly LedgerRow[];
  closeTitle: string;
  closeBody: string;
  closeCtas: readonly PageCta[];
}

const STARTUP_PLAN_ROWS: LedgerRow[] = MARKETING_FEATURE_MATRIX.individual.map((plan) => ({
  label: plan.label,
  value: `${plan.price} · ${plan.billingInterval}. ${plan.bestFor}.`,
}));

export const USE_CASE_CONTENT: Record<string, UseCaseContent> = {
  startups: {
    slug: 'startups',
    metaTitle: 'Startups: ship faster, spend deliberately',
    metaDescription:
      'How startups use AGI: ship product faster with multi-provider AI, BYOK on Desktop, CLI, and VS Code, and a CLI that fits CI.',
    eyebrow: 'Use case · startups',
    title: 'Ship faster. Spend deliberately.',
    lede: 'Use the CLI in CI, the Desktop app for hard problems, and the Chrome side panel for inbox and docs once it ships. Provider spend stays under your control through your own keys on Desktop, CLI, and VS Code.',
    ctas: [
      { href: '/download', label: 'Get the CLI' },
      { href: '/pricing', label: 'See pricing', variant: 'secondary' },
    ],
    visual: {
      light: '/product/usage-light.png',
      dark: '/product/usage-dark.png',
      alt: 'The account usage screen, showing spend against the plan window',
      width: 1128,
      height: 716,
      caption: ['Account', 'Usage'],
    },
    factsEyebrow: 'Why startups pick this shape',
    factsTitle: 'Three reasons this fits a small team.',
    facts: [
      {
        meta: 'Routing',
        title: 'No lock-in',
        body: 'Provider preferences change quarterly. Switch without losing your conversation history or rebuilding your tool integrations.',
      },
      {
        meta: 'Automation',
        title: 'Real CI',
        body: 'agi exec works as a Unix tool. Pipe a task in, get structured output back, in GitHub Actions or anywhere a shell runs.',
      },
      {
        meta: 'Cost',
        title: 'Cheap experiments',
        body: 'Local mode is free. BYOK pays providers at their public rates. Managed compute is opt-in, never the default.',
      },
    ],
    ledgerEyebrow: 'What you actually get',
    ledgerTitle: 'The posture, in one table.',
    ledgerRows: [
      ...STARTUP_PLAN_ROWS,
      {
        label: 'Surfaces',
        value: `${MARKETING.surfaces.count} surfaces: Desktop, Web, Mobile, CLI, Chrome extension, VS Code extension.`,
      },
      {
        label: 'Providers',
        value: `${MARKETING.providers.display} providers wired in, plus any OpenAI-compatible endpoint.`,
      },
      { label: 'Privacy', value: POSITIONING.trustBoundary },
    ],
    closeTitle: 'Start free, route deliberately.',
    closeBody:
      'Run Local and BYOK from day one at no platform cost (Desktop and the CLI are released) and turn on managed cloud whenever you want hosted compute.',
    closeCtas: [
      { href: '/download', label: "See what's live" },
      { href: '/cli', label: 'Install the CLI', variant: 'secondary' },
      { href: '/pricing', label: 'See plans', variant: 'secondary' },
    ],
  },
  'sales-teams': {
    slug: 'sales-teams',
    metaTitle: 'Sales teams: know the account, own the context',
    metaDescription:
      'How revenue teams use AGI: research, outreach drafts, deal-room briefings, and pipeline triage with provider choice and visible routing.',
    eyebrow: 'Use case · sales teams',
    title: 'Know the account. Own the context.',
    lede: 'Research, outreach drafts, deal-room briefings, and pipeline triage. Provider choice through your own keys on Desktop, CLI, and VS Code, with a visible label on every route your account context takes.',
    ctas: [
      { href: '/login?redirectTo=%2F', label: 'Try AGI Web' },
      { href: '/byok', label: 'Set up BYOK', variant: 'secondary' },
    ],
    visual: {
      light: '/product/hero-thread-light.png',
      dark: '/product/hero-thread-dark.png',
      alt: 'A working AGI chat thread in the browser',
      width: 2392,
      height: 1244,
      caption: ['Web', 'No install'],
    },
    factsEyebrow: 'Where it shows up',
    factsTitle: 'From first touch to signed.',
    facts: [
      {
        meta: 'Research',
        title: 'Account research',
        body: 'Pull the public record on a target: filings, releases, hiring, news. Bundle it into a brief and switch providers as the question changes.',
      },
      {
        meta: 'Outreach',
        title: 'Drafts in your tone',
        body: "Draft messages in your team's voice. The model sees your prior outreach as context only when you've given it permission to.",
      },
      {
        meta: 'Deals',
        title: 'Deal-room prep',
        body: 'Cross-provider continuity matters here: long-context work for the data room, prose for the narrative summary, all in one thread.',
      },
    ],
    ledgerEyebrow: 'Posture for revenue teams',
    ledgerTitle: 'The boundaries, stated plainly.',
    ledgerRows: [
      {
        label: 'Confidentiality',
        value: 'Local Mode for sensitive deals; keys stay encrypted on your device.',
      },
      {
        label: 'BYOK',
        value: 'Pay providers directly on Desktop, CLI, and VS Code. Use your existing API budget.',
      },
      {
        label: 'Tools',
        value: 'Connect CRM and email through MCP connectors, behind explicit tool approvals.',
      },
      {
        label: 'Visibility',
        value: 'Provider labels and tool approvals stay visible on every route.',
      },
    ],
    closeTitle: 'Brief better, route deliberately.',
    closeBody:
      'Bring your own keys on Desktop, CLI, and VS Code, and keep account context under your control while the team works.',
    closeCtas: [
      { href: '/login?redirectTo=%2F', label: 'Try AGI Web' },
      { href: '/byok', label: 'Set up BYOK', variant: 'secondary' },
      { href: '/apps', label: 'Browse apps & connectors', variant: 'secondary' },
    ],
  },
  'it-providers': {
    slug: 'it-providers',
    metaTitle: 'IT service providers: runbooks that actually run',
    metaDescription:
      'How MSPs and IT shops use AGI: triage, runbooks, and scripted operations with sandboxed execution, explicit approvals, and multi-provider routing.',
    eyebrow: 'Use case · IT service providers',
    title: 'Runbooks that actually run.',
    lede: 'Triage, runbooks, and scripted operations with a real CLI. Sandboxed execution, explicit approvals, and provider routing that sends routine work to inexpensive models and saves the flagship calls for the hard cases.',
    ctas: [
      { href: '/contact-sales', label: 'Contact sales' },
      { href: '/cli', label: 'See the CLI', variant: 'secondary' },
    ],
    visual: {
      light: '/product/agents-tool-approvals-light.png',
      dark: '/product/agents-tool-approvals-dark.png',
      alt: 'The tool approvals setting in AGI, with "Ask before every action" selected',
      width: 1132,
      height: 584,
      caption: ['Settings', 'Tool approvals'],
    },
    factsEyebrow: 'Where it shows up',
    factsTitle: 'Ticket in, resolution out.',
    facts: [
      {
        meta: 'Triage',
        title: 'Classify and summarize',
        body: 'Read tickets, classify, summarize prior context, and propose next steps. Branch into deeper investigation only when the cheap path does not suffice.',
      },
      {
        meta: 'Runbooks',
        title: 'Encode and execute',
        body: 'Encode runbooks as MCP tools. The agent runs them sandboxed by default: macOS Seatbelt, Linux bwrap. Behind explicit approvals.',
      },
      {
        meta: 'Operations',
        title: 'CI-style workflows',
        body: 'agi exec in headless mode for scripted incident workflows: pipe a ticket in, get a structured response back.',
      },
    ],
    ledgerEyebrow: 'Posture',
    ledgerTitle: "Built for someone else's environment.",
    ledgerRows: [
      {
        label: 'Sandboxed tools',
        value: 'File writes, shell, and network run sandboxed by default.',
      },
      {
        label: 'Provider routing',
        value:
          'Inexpensive models for triage, flagship models for the hard cases. All in one thread.',
      },
      {
        label: 'Records',
        value: 'Resumable sessions and visible tool approvals for after-action review.',
      },
      {
        label: 'BYOK posture',
        value:
          'Every seat can run fully local, or on your own provider keys on Desktop, CLI, and VS Code, so client work need not reach our infrastructure. Requiring that org-wide is not a shipped control: no surface enforces an org policy today, so it is scoped on an enterprise contract.',
      },
    ],
    closeTitle: 'Put the agent on the bench.',
    closeBody:
      'Start with the CLI on Local and BYOK, and talk to sales when client contracts need enterprise controls.',
    closeCtas: [
      { href: '/contact-sales', label: 'Contact sales' },
      { href: '/cli', label: 'See the CLI', variant: 'secondary' },
      { href: '/enterprise', label: 'See enterprise controls', variant: 'secondary' },
    ],
  },
  consulting: {
    slug: 'consulting',
    metaTitle: 'Consulting firms: client work, across providers',
    metaDescription:
      'How consulting practices use AGI: research, deliverables, data analysis, and reporting at scale across multiple AI providers.',
    eyebrow: 'Use case · consulting',
    title: 'Client work, across providers.',
    lede: 'Research, deliverables, data analysis, and client reporting. Switch providers mid-engagement as the work changes shape, from long-context analysis to prose drafting to tool-heavy automation, without losing the thread.',
    ctas: [
      { href: '/contact-sales', label: 'Contact sales' },
      { href: '/byok', label: 'Set up BYOK', variant: 'secondary' },
    ],
    visual: {
      light: '/product/deep-research-report-light.png',
      dark: '/product/deep-research-report-dark.png',
      alt: 'A finished AGI deep research report with numbered inline citations and a sources list',
      width: 2392,
      height: 1402,
      caption: ['Deep research', 'Report'],
    },
    factsEyebrow: 'Where it shows up',
    factsTitle: 'The engagement, end to end.',
    facts: [
      {
        meta: 'Research',
        title: 'Synthesis at depth',
        body: 'Read whole repositories of prior decks, transcripts, and primary sources, then hand synthesis to the model that handles your shape of context best.',
      },
      {
        meta: 'Deliverables',
        title: 'Drafts in your house tone',
        body: 'Draft analyses, executive summaries, and slide narratives. The conversation history travels across model switches.',
      },
      {
        meta: 'Scale',
        title: 'Reporting in pipelines',
        body: 'Run the same analysis across many client datasets through the CLI, headless, in CI-style pipelines.',
      },
    ],
    ledgerEyebrow: 'What partners ask for',
    ledgerTitle: 'The posture, answered up front.',
    ledgerRows: [
      {
        label: 'Provider choice',
        value: 'BYOK on Desktop, CLI, and VS Code. Pay providers directly at their rates.',
      },
      {
        label: 'Confidentiality',
        value: 'Local Mode for sensitive engagements; keys stored encrypted on your device.',
      },
      {
        label: 'Records',
        value: 'Resumable sessions and visible tool approvals on the developer surfaces.',
      },
      {
        label: 'Team scale',
        value: 'SSO/SCIM, retention windows, and audit export scoped on enterprise contracts.',
      },
    ],
    closeTitle: 'Bring the engagement, keep the boundary.',
    closeBody:
      'Start on Local and BYOK today, and talk to sales when the practice needs enterprise controls.',
    closeCtas: [
      { href: '/contact-sales', label: 'Contact sales' },
      { href: '/byok', label: 'Set up BYOK', variant: 'secondary' },
      { href: '/enterprise', label: 'See enterprise controls', variant: 'secondary' },
    ],
  },
};

export const USE_CASE_SLUGS = Object.keys(USE_CASE_CONTENT);
