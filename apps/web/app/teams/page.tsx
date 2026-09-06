import { MIN_PURCHASABLE_SEATS } from '@agiworkforce/types';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { ConsoleWindow } from '@/features/marketing/components/FeatureScenes';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'AGI for Teams: seats, roles, and the workspace console',
  description:
    'How team membership works in AGI: seats held by members and pending invitations, the owner, admin, member and viewer roles, invitations as expiring private links, shared projects and connectors, and the workspace console that sets approved models and integrations on managed cloud.',
  path: '/teams',
});

const CONTROL_STATES = [
  {
    label: 'Enforced',
    value: 'A server-side check refuses the request, whichever client it came from.',
  },
  {
    label: 'Stated position',
    value: 'Recorded for this workspace, with nothing acting on it at runtime yet.',
  },
  {
    label: 'Not configured',
    value: 'No row has been saved here, so the shipped default applies.',
  },
] as const;

export default function TeamsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-teams-title"
          eyebrow="AGI for teams"
          title="Seats, roles, and a console that decides what each role can reach."
          lede={`Seats are the unit you buy, from ${MIN_PURCHASABLE_SEATS} up, and every active member and every pending invitation holds one. Roles run owner, admin, member and viewer, and only the first two administer anything. The console at /workspace is where they set who belongs, what is shared with them, and which models and integrations the workspace approves.`}
          ctas={[
            { href: '/pricing#pricing-team-title', label: 'Choose Team seats' },
            { href: '/contact-sales', label: 'Enterprise sales', variant: 'secondary' },
          ]}
          visual={<ConsoleWindow view="members" />}
        />

        <Section id="team-basics" labelledBy="agi-teams-basics-title" rule>
          <Stack>
            <h2 className="agi-ds-h2" id="agi-teams-basics-title">
              What a Team workspace includes.
            </h2>
            <Ledger
              caption="What a Team workspace includes"
              rows={[
                { label: 'Seats', value: `From ${MIN_PURCHASABLE_SEATS}` },
                { label: 'Roles', value: 'Owner, admin, member, viewer' },
                { label: 'Compute', value: 'Cloud · hosted by us' },
              ]}
            />
          </Stack>
        </Section>

        <Section id="membership" labelledBy="agi-teams-membership-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Membership</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-teams-membership-title">
                What an admin can change about a teammate.
              </h2>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Seats',
                  title: 'A seat is occupied before anyone accepts',
                  body: 'An active member holds a seat and so does a pending invitation, so the count an admin sees is the count that is actually spoken for. Revoking an invitation or removing a member frees its seat straight away, and leaving a workspace releases your own.',
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
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="console" labelledBy="agi-teams-console-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>The console</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-teams-console-title">
                Every control has a page, and the page says whether it binds.
              </h2>
            </div>
            <Ledger caption="What each control state means" rows={CONTROL_STATES} />
            <Prose>
              Read each row below for which of those three currently holds: a recorded position is
              never described the same way as an enforced one, which is the difference a security
              reviewer is there to find.
            </Prose>
            <Ledger
              caption="What the workspace console governs"
              rows={[
                {
                  label: 'Overview',
                  value:
                    'The posture view for the whole workspace, listing every control and which of the three states above it currently carries.',
                },
                {
                  label: 'Members',
                  value:
                    'Roles, invitations and seats, available from the Team plan up. Removing someone cuts their live sessions, device refresh tokens and API keys along with the membership row, records anything it could not reach, and leaves their personal account intact.',
                },
                {
                  label: 'Policy',
                  value:
                    'Which privacy modes the workspace allows, whether AGI managed cloud may be used at all, and which client surfaces may sync. A refusal comes back from the server before the turn runs and is written to the audit trail.',
                },
                {
                  label: 'Models',
                  value:
                    'Allowed and blocked providers and models, picked from the shipped catalog so a typo cannot become a rule that governs nothing. The check runs after auto-routing has resolved, so asking for Auto cannot reach a blocked model, and every failover candidate answers to the same saved policy the first choice answered to.',
                },
                {
                  label: 'Connectors',
                  value:
                    'Which integrations members may use, and whether they may add their own. The list is read while a member’s tool set is assembled, so a blocked connector never appears in it.',
                },
                {
                  label: 'Usage and billing',
                  value:
                    'Spend broken down by member, model and provider, alongside the plan, the seat count and invoices. An owner or admin can also set a monthly cap for the workspace and choose whether crossing it notifies or blocks.',
                },
                {
                  label: 'Identity, audit and data',
                  value:
                    'SSO, SCIM directory sync, the audit trail and its JSONL export, legal holds and retention sweeps. These sit behind the enterprise entitlement, one step above the Team plan, and /enterprise states which of them are built and which are commitments.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="teams-close" labelledBy="agi-teams-close-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Team plan</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-teams-close-title">
                {`Start at ${MIN_PURCHASABLE_SEATS} seats and add people as the work needs them.`}
              </h2>
              <Prose>
                The seat count is the only thing anyone has to settle up front, and it moves from
                the billing page whenever it needs to. Roles, shared projects, approved models and
                approved connectors are all set afterwards, from the console, by whoever holds owner
                or admin. Work a member runs locally, or on their own provider keys, never reaches
                AGI&rsquo;s servers at all, so it sits outside what this console can govern.
              </Prose>
            </div>
            <ButtonRow>
              <Button href="/pricing#pricing-team-title">{`Start with ${MIN_PURCHASABLE_SEATS} seats`}</Button>
              <Button href="/workspace" variant="secondary">
                Open the workspace console
              </Button>
              <Button href="/contact-sales" variant="secondary">
                Enterprise sales
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <MarketingFooter />
      </main>
    </div>
  );
}
