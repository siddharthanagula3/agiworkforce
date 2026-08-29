import { MIN_PURCHASABLE_SEATS } from '@agiworkforce/types';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { FeatureGrid, LedgerSection } from '@/features/marketing/components/LandingSections';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';

export const metadata = buildMetadata({
  title: 'AGI for Teams: seats, roles, and the workspace console',
  description:
    'How team membership works in AGI: seats held by members and pending invitations, the owner, admin, member and viewer roles, invitations as expiring private links, shared projects and connectors, and the workspace console that sets approved models and integrations on public-alpha managed cloud.',
  path: '/teams',
});

function WorkspaceConsolePanel() {
  return (
    <aside className="agi-campaign-console" aria-label="What the workspace console reports">
      <div className="agi-console-topline">
        <span>Workspace console</span>
        <span>/workspace</span>
      </div>
      <div className="agi-console-stats">
        <div className="agi-console-stat">
          <span className="agi-console-stat-value">Enforced</span>
          <span className="agi-console-stat-label">A server check refuses the request</span>
          <span className="agi-console-stat-note">
            It holds whichever client the request came from.
          </span>
        </div>
        <div className="agi-console-stat">
          <span className="agi-console-stat-value">Stated position</span>
          <span className="agi-console-stat-label">Recorded for this workspace</span>
          <span className="agi-console-stat-note">
            Nothing acts on it at runtime yet, and the console says so.
          </span>
        </div>
        <div className="agi-console-stat">
          <span className="agi-console-stat-value">Not configured</span>
          <span className="agi-console-stat-label">No row saved here</span>
          <span className="agi-console-stat-note">
            The shipped default applies until an owner saves one.
          </span>
        </div>
      </div>
      <dl className="agi-console-ledger">
        <div className="agi-console-row">
          <dt>Seats</dt>
          <dd>
            Billing writes the licensed count onto the workspace, and the write is refused when the
            number lands below the seats already occupied.
          </dd>
        </div>
        <div className="agi-console-row">
          <dt>Members</dt>
          <dd>
            Owner, admin, member, viewer. Only owner and admin can administer, and the workspace
            always keeps at least one owner.
          </dd>
        </div>
        <div className="agi-console-row">
          <dt>Invitations</dt>
          <dd>
            Hashed tokens that expire after seven days. Each pending one holds a seat until it is
            accepted, renewed, or revoked.
          </dd>
        </div>
      </dl>
    </aside>
  );
}

export default function TeamsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI for teams"
          titleLines={[
            'Give a teammate a seat and a role,',
            'and the workspace console decides',
            'what that role can reach.',
          ]}
          em="a seat and a role"
          lede={`Seats are the unit you buy, from ${MIN_PURCHASABLE_SEATS} up, and every active member and every pending invitation holds one. Roles run owner, admin, member and viewer, and only the first two administer anything. The console at /workspace is where they set who belongs, what is shared with them, and which models and integrations the workspace approves.`}
          ctas={[
            { href: '/pricing#pricing-team-title', label: 'Choose Team seats' },
            { href: '/contact-sales', label: 'Enterprise sales' },
          ]}
          modeRibbon={[
            `Seats · from ${MIN_PURCHASABLE_SEATS}`,
            'Roles · owner, admin, member, viewer',
            'Cloud · public alpha',
          ]}
          modeRibbonLabel="What a Team workspace includes"
          visual={<WorkspaceConsolePanel />}
        />

        <FeatureGrid
          eyebrow="Membership"
          title="What an admin can change about a teammate."
          items={[
            {
              meta: 'Seats',
              title: 'A seat is occupied before anyone accepts',
              body: 'An active member holds a seat and so does a pending invitation, so the count an admin sees is the count that is actually spoken for. Revoking an invitation or removing a member frees its seat straight away, and leaving a workspace releases your own.',
              href: '/pricing#pricing-team-title',
            },
            {
              meta: 'Roles',
              title: 'Owner and admin are the two that administer',
              body: 'Owner and admin invite, revoke, change another member’s role and edit workspace policy. Member and viewer do none of it. An owner who wants out nominates a successor first, and the handover and the departure run as one operation so the workspace is never left without an owner.',
            },
            {
              meta: 'Invitations',
              title: 'A private link you send yourself',
              body: 'No transactional email provider is wired up, and the product states that plainly: you create the invitation, copy the private link, and pass it on. The token is hashed, expires after seven days, and opens only for someone signing in with the address it was issued to.',
            },
            {
              meta: 'Shared work',
              title: 'Projects and connectors the workspace can open',
              body: 'Share a project and members read its instructions and knowledge files while each member’s own conversations stay private; you can withdraw any single member’s access without unsharing it from everyone. Share a remote MCP connector once and every member can call it, while its stored credential stays out of their reach.',
              href: '/features/projects',
            },
          ]}
        />

        <LedgerSection
          eyebrow="The console"
          title="Every control has a page, and the page says whether it binds."
          rows={[
            {
              k: 'Overview',
              v: 'The posture view for the whole workspace. Each control carries a label saying whether a server-side check refuses requests that violate it, whether the setting is merely recorded for now, or whether nothing has been saved at all. A recorded position never wears the same badge as an enforced one, which is the difference a security reviewer is there to find.',
            },
            {
              k: 'Members',
              v: 'Roles, invitations and seats, available from the Team plan up. Removing someone cuts their live sessions, device refresh tokens and API keys along with the membership row, records anything it could not reach, and leaves their personal account intact.',
            },
            {
              k: 'Policy',
              v: 'Which privacy modes the workspace allows, whether AGI managed cloud may be used at all, and which client surfaces may sync. A refusal comes back from the server before the turn runs and is written to the audit trail.',
            },
            {
              k: 'Models',
              v: 'Allowed and blocked providers and models, picked from the shipped catalog so a typo cannot become a rule that governs nothing. The check runs after auto-routing has resolved, so asking for Auto cannot reach a blocked model, and every failover candidate answers to the same saved policy the first choice answered to.',
            },
            {
              k: 'Connectors',
              v: 'Which integrations members may use, and whether they may add their own. The list is read while a member’s tool set is assembled, so a blocked connector never appears in it.',
            },
            {
              k: 'Usage and billing',
              v: 'Spend broken down by member, model and provider, alongside the plan, the seat count and invoices. An owner or admin can also set a monthly cap for the workspace and choose whether crossing it notifies or blocks.',
            },
            {
              k: 'Identity, audit and data',
              v: 'SSO, SCIM directory sync, the audit trail and its JSONL export, legal holds and retention sweeps. These sit behind the enterprise entitlement, one step above the Team plan, and /enterprise states which of them are built and which are commitments.',
            },
          ]}
        />

        <FinalCta
          eyebrow="Team plan"
          title={`Start at ${MIN_PURCHASABLE_SEATS} seats and add people as the work needs them.`}
          body="The seat count is the only thing anyone has to settle up front, and it moves from the billing page whenever it needs to. Roles, shared projects, approved models and approved connectors are all set afterwards, from the console, by whoever holds owner or admin. Work a member runs locally, or on their own provider keys, never reaches AGI’s servers at all, so it sits outside what this console can govern."
          ctas={[
            {
              href: '/pricing#pricing-team-title',
              label: `Start with ${MIN_PURCHASABLE_SEATS} seats`,
            },
            { href: '/workspace', label: 'Open the workspace console' },
            { href: '/contact-sales', label: 'Enterprise sales' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
