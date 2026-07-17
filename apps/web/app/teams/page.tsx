import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FeatureGrid, LedgerSection } from '@/features/marketing/components/LandingSections';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI for Teams: Shared projects, governance, and BYOK policy',
  description:
    'Team workspace controls for AGI: shared projects, admin policy, connector governance, usage visibility, BYOK enforcement, and public-alpha managed cloud.',
  path: '/teams',
});

export default function TeamsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI for teams"
          titleLines={['Shared work.', 'Visible routes.']}
          em="Visible routes."
          lede="Bring chats, files, projects, artifacts, and code into one shared workspace. Explicit policy covers what runs locally, what goes through your own provider keys on Desktop and CLI, and what runs in AGI managed cloud."
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            { href: '/business', label: 'See the Business Overview' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
          modeRibbon={['Local · on-device', 'BYOK · your keys', 'Cloud · public alpha']}
        />

        <FeatureGrid
          eyebrow="Team admin"
          title="Controls that make adoption survivable."
          items={[
            {
              meta: 'Access',
              title: 'Workspace membership and roles',
              body: 'Invite team members, separate personal and work spaces, and prepare for enterprise SSO/SCIM when procurement needs it.',
            },
            {
              meta: 'Provider policy',
              title: 'Keep provider routes explicit',
              body: 'Local, BYOK, and Cloud stay separate, labeled routes for every member. Org-wide provider policy and BYOK enforcement are scoped on enterprise contracts.',
            },
            {
              meta: 'Connectors',
              title: 'Govern apps and MCP tools',
              body: 'Members connect services with individual authentication and per-tool approval boundaries that stay visible. Workspace-level connector policy is scoped on enterprise contracts.',
              href: '/apps',
            },
            {
              meta: 'Knowledge',
              title: 'Shared projects instead of scattered prompts',
              body: 'Store files, instructions, memory, chats, and artifacts under the workstream so the team stops rebuilding context.',
              href: '/features/projects',
            },
            {
              meta: 'Usage',
              title: 'Keep Local, BYOK, and Cloud spend separate',
              body: 'Local work costs nothing and BYOK bills go straight to your providers. Managed spend applies when a workspace uses AGI managed cloud.',
            },
            {
              meta: 'Security',
              title: 'Know which models and tools touched the work',
              body: 'Provider labels and tool approvals stay visible in the product. Audit export for review is scoped on enterprise contracts.',
              href: '/trust',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Rollout plan"
          title="How teams phase AGI in."
          rows={[
            {
              k: 'Phase 1',
              v: 'Start with Local and BYOK for high-signal users. No managed compute commitment needed.',
            },
            {
              k: 'Phase 2',
              v: 'Enable shared projects, apps and connectors, and provider policy for repeat workflows.',
            },
            {
              k: 'Phase 3',
              v: 'Bring users onto AGI managed cloud, open in public alpha, for hosted sync and managed compute.',
            },
            {
              k: 'Phase 4',
              v: 'Move to enterprise controls when SSO, audit export, retention, and contract terms are required.',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Pilot the workspace before you buy compute."
          body="Start the team on free Local and BYOK modes today, then move selected users onto AGI managed cloud, which is open in public alpha."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { href: '/contact-sales', label: 'Contact Sales' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
