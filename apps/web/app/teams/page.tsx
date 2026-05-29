import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import {
  CampaignHero,
  FeatureGrid,
  LaunchCta,
  LedgerSection,
} from '../../components/marketing/LandingSections';
import { LAUNCH, POSITIONING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI for Teams - Shared projects, governance, and BYOK policy',
  description:
    'Team workspace controls for AGI: shared projects, admin policy, connector governance, usage visibility, BYOK enforcement, and invite-only managed cloud.',
  alternates: { canonical: 'https://agiworkforce.com/teams' },
};

export default function TeamsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <CampaignHero
          eyebrow={`${LAUNCH.publicLabel} · Team rollout`}
          title="A shared AI workspace without a single-provider mandate."
          lede={`Teams need the familiar workflow: chats, files, projects, artifacts, apps, and code. AGI adds model routing and explicit policy around Local, BYOK, and Cloud. ${POSITIONING.trustBoundary}`}
          primaryCta={{ href: '/contact-sales', label: 'Design a team rollout' }}
          secondaryCta={{ href: '/business', label: 'Business overview' }}
          chips={['Shared projects', 'Usage controls', 'Connector policy', 'BYOK enforcement']}
          panelTitle="Team controls"
          panelRows={[
            { k: 'Identity', v: 'Workspace accounts now; SSO/SCIM for enterprise contracts' },
            { k: 'Projects', v: 'Shared files, instructions, memory, and artifacts' },
            { k: 'Policy', v: 'Provider, connector, cloud, and data-retention controls' },
            { k: 'Launch', v: LAUNCH.date },
          ]}
        />

        <FeatureGrid
          eyebrow="Team admin"
          title="Controls that make adoption survivable."
          items={[
            {
              meta: 'Access',
              title: 'Workspace membership and roles',
              body: 'Invite team members, separate personal and work spaces, and prepare for enterprise SSO/SCIM when the account needs procurement.',
            },
            {
              meta: 'Provider policy',
              title: 'Decide which providers are allowed',
              body: 'Let a workspace require BYOK, allow approved providers only, or keep sensitive projects local until security review clears cloud use.',
            },
            {
              meta: 'Connectors',
              title: 'Govern apps and MCP tools',
              body: 'Enable services at the workspace level while keeping individual authentication and per-tool approval boundaries visible.',
              href: '/apps',
            },
            {
              meta: 'Knowledge',
              title: 'Shared projects instead of scattered prompts',
              body: 'Store files, instructions, memory, chats, and artifacts under the workstream so the team does not keep rebuilding context.',
              href: '/features/projects',
            },
            {
              meta: 'Usage',
              title: 'See Local, BYOK, and Cloud usage separately',
              body: 'Separate AGI-managed spend from provider-paid BYOK and local device work so finance can understand what is happening.',
            },
            {
              meta: 'Security',
              title: 'Audit what models and tools touched',
              body: 'Capture provider labels, tool calls, approvals, shared chats, artifact publishing, and cloud handoffs for review.',
              href: '/trust',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Rollout plan"
          title="How teams should phase AGI."
          rows={[
            {
              k: 'Phase 1',
              v: 'Start with Local and BYOK for high-signal users. No managed compute commitment needed.',
            },
            {
              k: 'Phase 2',
              v: 'Enable shared projects, apps/connectors, and provider policy for repeat workflows.',
            },
            {
              k: 'Phase 3',
              v: 'Invite selected users into Cloud for hosted sync, managed compute, and more automated workflows.',
            },
            {
              k: 'Phase 4',
              v: 'Move to enterprise controls when SSO, audit export, retention, and contract terms are required.',
            },
          ]}
        />

        <LaunchCta
          title="Run the team pilot before you buy a cloud bill."
          body="AGI is designed for the wedge you described: free Local and BYOK adoption first, then invite-only Cloud when users prove demand."
          primary={{ href: '/download', label: LAUNCH.ctaLabel }}
          secondary={{ href: '/contact-sales', label: 'Talk to sales' }}
        />
        <MarketingFooter />
      </main>
    </div>
  );
}
