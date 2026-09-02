import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
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
  title: 'Agent permissions',
  description:
    'What the AGI agent may do without asking, what always requires approval, which connector scopes are actually requested, and every way to revoke access.',
  path: '/agent-permissions',
});

const NO_ASK: { k: string; v: string }[] = [
  {
    k: 'Web search',
    v: 'Runs a search and reads the results. Classified as a read that accepts untrusted content and creates an egress path, because a search query is a place secrets can leak and a result page is attacker-influenced text.',
  },
  {
    k: 'Fetch a page',
    v: 'Fetches a single URL through an SSRF-guarded path. Same classification as search, for the same reasons.',
  },
  {
    k: 'Run code',
    v: 'Executes model-authored code in an isolated cloud sandbox belonging to that conversation, not on your device. Classified as an irreversible execute action that creates an egress path.',
  },
  {
    k: 'Write a file, create a folder',
    v: "Writes inside the conversation's own sandbox workspace. Not your filesystem, not your cloud storage. A file write is classified as irreversible; a folder create is reversible.",
  },
  {
    k: 'Create an Office file',
    v: 'Generates a Word document (.docx) or a PowerPoint deck (.pptx) on our servers and attaches it to the conversation for you to download. Those two formats are the whole of it: no other Office format, and no editing of a file you already have. Reversible, no egress path.',
  },
  {
    k: 'Run a skill',
    v: "Loads a skill's instructions into the turn. Skills act through the tools above and are gated by them.",
  },
];

const REVOKE: { k: string; v: string }[] = [
  {
    k: 'Disconnect a connector',
    v: 'Removes the connection and also deletes every saved per-tool permission for that connector, so a past "Always allow" cannot survive a reconnect.',
  },
  {
    k: 'Reset one tool',
    v: 'Set a single tool back to "Needs approval", or delete its saved verdict outright. This exists specifically so a one-time "Always allow" is not permanent.',
  },
  {
    k: 'Block one tool',
    v: 'A blocked tool is refused server-side before it runs, on the normal tool loop and on the approval-resume path.',
  },
  {
    k: 'Unlink GitHub',
    v: 'Disconnecting GitHub deletes your installation records so GitHub tools stop being offered. The GitHub App itself remains installed on your GitHub account until you remove it at github.com/settings/installations. Do both for full revocation.',
  },
  {
    k: 'Delete a custom MCP connector',
    v: 'Removes the server and the encrypted bearer token you supplied with it. Rotate that token on the server side too if it was ever sensitive.',
  },
  {
    k: 'Browser: remove a site',
    v: "Take a site off the extension's allowlist and the browser agent can no longer navigate to it.",
  },
  {
    k: 'Browser: re-enable the gate',
    v: 'Turn "ask before acting" back on if you previously opted into autopilot. Only an explicit opt-out disables it.',
  },
  {
    k: 'Desktop: per-tool policy',
    v: 'Desktop connector settings carry a standing Always allow / Needs approval / Blocked control per tool.',
  },
];

const DESKTOP_SCOPES: { k: string; v: string }[] = [
  {
    k: 'Gmail',
    v: 'gmail.readonly (read mail), gmail.send (send mail as you), gmail.modify (change and delete mail, including labels and trash), userinfo.email and userinfo.profile (identify which account you connected). gmail.modify is broader than reading and sending: it permits modifying and deleting messages.',
  },
  {
    k: 'Google Calendar',
    v: 'calendar.readonly (read events), calendar.events (read and write events), and auth/calendar: the unrestricted calendar scope, which is broader than the other two and makes them redundant.',
  },
  {
    k: 'Outlook Calendar',
    v: 'User.Read (basic profile), Calendars.Read, and Calendars.ReadWrite (read and write your calendars).',
  },
];

export default function AgentPermissionsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-perm-title"
          eyebrow="Agent permissions"
          title="What the agent may do, and what it must ask."
          lede={
            <>
              The exact default authority of the agent on each surface, the limits of the
              protections we ship, the connector scopes actually requested today, and every way to
              take access back.{' '}
              <strong>
                Some of this is less flattering than a marketing page would write it. That is the
                point. You cannot review a permission model you have to infer.
              </strong>{' '}
              The rules that govern how you use it are at{' '}
              <a href="/acceptable-use" className="agi-ds-link">
                /acceptable-use
              </a>
              .
            </>
          }
          ctas={[]}
        />

        <Section id="no-ask" labelledBy="agi-perm-noask-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Managed Cloud · no approval</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-perm-noask-title">
                These run without asking.
              </h2>
              <Prose>
                In Managed Cloud, a turn that offers no connector or MCP tool runs in automatic
                approval mode. With no saved preference of your own, the built-in tools below
                execute without a prompt. This is a deliberate design choice: each one acts inside a
                read-only or isolated boundary, and prompting on every web search would train you to
                click through prompts that matter. It is stated plainly here rather than implied
                away.
              </Prose>
            </div>
            <Ledger
              caption="Tools that run without asking"
              rows={NO_ASK.map((row) => ({ label: row.k, value: row.v }))}
            />
            <Prose>
              You can still override any of them: set a tool to &ldquo;Needs approval&rdquo; or
              &ldquo;Blocked&rdquo; and your setting takes precedence over automatic mode.
            </Prose>
          </Stack>
        </Section>

        <Section id="always-ask" labelledBy="agi-perm-ask-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Managed Cloud · approval required</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-perm-ask-title">
                These always ask.
              </h2>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Connectors',
                  title: 'Every connector and MCP tool',
                  body: 'When a turn carries any connector or MCP tool, the whole turn switches to manual approval mode. These tools cross an external or mutating boundary, so they are gated by default and on every turn, not once at connect time.',
                },
                {
                  meta: 'Your setting',
                  title: 'Anything you marked "Needs approval"',
                  body: 'A saved "ask" verdict outranks automatic mode, so you can pull any built-in tool back into the approval flow.',
                },
                {
                  meta: 'Escalation',
                  title: 'A tool call that trips the injection escalation',
                  body: 'When untrusted content has entered the conversation, a private authenticated source is reachable, and the pending call can move data out of the boundary, an otherwise automatic approval escalates to a human decision. See the limits below.',
                },
              ]}
            />

            <h3 className="agi-ds-h3">The precedence order, in full.</h3>
            <Ledger
              caption="Approval precedence order"
              rows={[
                { label: '1. Blocked by you', value: 'Denied. Nothing overrides this.' },
                { label: '2. Allowed by you, escalation triggered', value: 'Asks anyway.' },
                { label: '3. Allowed by you', value: 'Runs.' },
                { label: '4. "Needs approval" by you', value: 'Asks.' },
                { label: '5. Manual mode (a connector tool is in the turn)', value: 'Asks.' },
                { label: '6. Escalation triggered', value: 'Asks.' },
                { label: '7. Otherwise', value: 'Runs.' },
              ]}
            />
          </Stack>
        </Section>

        <Section id="honest-limits" labelledBy="agi-perm-limits-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Honest limits</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-perm-limits-title">
                What the injection escalation does not catch.
              </h2>
              <Prose>
                The escalation is a mitigation, not a proof. We publish its gaps because a reviewer
                will find them anyway, and a mitigation you can reason about is worth more than a
                clean claim you cannot.
              </Prose>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Coverage',
                  title: 'Pasted and attached content is not counted',
                  body: 'Untrusted content is recognised when a tool fetched it: a web page, a search result, a pull-request diff. Content you paste or attach yourself is not counted, and that is a real injection vector this check does not see.',
                },
                {
                  meta: 'Bias',
                  title: 'It over-triggers on purpose',
                  body: 'Whether a sensitive source is reachable is derived from which tools were offered, not from what was actually read. A connector merely being available counts. We would rather cost you a click than miss a case.',
                },
                {
                  meta: 'Visibility',
                  title: 'Undeclared exfiltration is invisible',
                  body: 'Whether a call can move data out is per-tool metadata. An MCP server that phones home during what it declares as a read is not visible to this check, which is exactly why any tool we have not classified is treated as creating an egress path.',
                },
                {
                  meta: 'Override',
                  title: 'It cannot stop you approving',
                  body: 'The check gates automatic approval only. If it escalates and you approve, the call runs.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="blocking" labelledBy="agi-perm-block-title" rule ground="2">
          <Stack gap="loose">
            <Eyebrow>Blocking</Eyebrow>
            <h2 className="agi-ds-h2" id="agi-perm-block-title">
              A Block is enforced on the server.
            </h2>
            <Prose>
              Blocking a tool is not a client-side preference. The verdict is stored against your
              account and checked on the server before any side effect, on the streaming tool loop
              and again when an approval is resumed. A modified client, or a request you write
              yourself against the API, cannot execute a tool you blocked; the model is told the
              tool is blocked and instructed not to retry it.
            </Prose>
            <Prose>
              <strong>One thing a Block does not do:</strong> it does not hide the tool from the
              model&rsquo;s list of available tools. The model may still attempt the call. The call
              is refused before it runs, and nothing happens.
            </Prose>
          </Stack>
        </Section>

        <Section id="browser-permissions" labelledBy="agi-perm-browser-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>In the browser</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-perm-browser-title">
                Computer use in Chrome.
              </h2>
              <Prose>
                The Chrome extension can drive a tab through the Chrome debugger. Starting a session
                is always an explicit action: you type a goal and click. Once running:
              </Prose>
            </div>
            <Ledger
              caption="Browser computer-use permissions"
              rows={[
                {
                  label: 'Ask before acting',
                  value:
                    'On by default. An unset preference means ask; autopilot is an explicit opt-out you have to choose.',
                },
                {
                  label: 'Unanswered approvals',
                  value: 'Denied after 30 seconds. The gate fails closed, not open.',
                },
                {
                  label: 'Where it can go',
                  value:
                    'Navigation is confined to the site allowlist you maintain in extension options.',
                },
                {
                  label: 'Text leaving the page',
                  value:
                    'Page-text summaries and field readbacks are redacted by the driver before they leave.',
                },
                {
                  label: 'Screenshots',
                  value: (
                    <>
                      <strong>
                        Screenshots are not redacted and cannot be. You cannot scrub secrets out of
                        a PNG.
                      </strong>{' '}
                      They reach the Managed Cloud gateway. If a page has a secret visibly rendered
                      on it, a screenshot of that page carries it. This is a residual, accepted
                      risk, bounded by the allowlist and the approval gate.
                    </>
                  ),
                },
                {
                  label: 'Where inference happens',
                  value:
                    'Computer use requires Managed Cloud sign-in and calls the Managed Cloud gateway directly from the extension.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="desktop-permissions" labelledBy="agi-perm-desktop-title" rule ground="2">
          <Stack gap="loose">
            <Eyebrow>On Desktop</Eyebrow>
            <h2 className="agi-ds-h2" id="agi-perm-desktop-title">
              Local execution, local approval.
            </h2>
            <Prose>
              Desktop runs tools on your machine, so it carries its own gate: dangerous tools prompt
              in manual mode, per-tool approval policies are stored and reapplied, and connector
              settings expose a standing Always allow / Needs approval / Blocked control for each
              tool. Desktop is also the only surface today that completes a real OAuth flow. See the
              next section.
            </Prose>
          </Stack>
        </Section>

        <Section id="connectors" labelledBy="agi-perm-connectors-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Connectors</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-perm-connectors-title">
                What is actually requested today.
              </h2>
              <Prose>
                The connector directory is larger than what is connectable. This section describes
                the current state, not the roadmap.
              </Prose>
            </div>

            <h3 className="agi-ds-h3">Managed Cloud connects exactly three kinds of thing.</h3>
            <Ledger
              caption="What Managed Cloud connects"
              rows={[
                {
                  label: 'The GitHub App',
                  value:
                    'Three tools: read a pull-request diff, post an issue or pull-request comment, and post a pull-request review. Access comes from the GitHub App installation you authorize; its permission set is configured on GitHub during install and is shown to you there. We do not restate it here, because it is not declared in our own code and we will not guess at a permission list on your behalf.',
                },
                {
                  label: 'Operator-configured MCP servers',
                  value:
                    'Remote MCP endpoints configured server-side by AGI. The endpoint and its credentials stay server-side; nothing you supply flows into them.',
                },
                {
                  label: 'Your own remote MCP servers',
                  value:
                    'A server URL you provide, with an optional bearer token that is encrypted at rest and scoped to your account alone. Its tools are whatever that server advertises at runtime.',
                },
              ]}
            />

            <Prose>
              <strong>
                Every other connector in the directory is not connectable on the web today.
              </strong>{' '}
              Attempting to connect one returns an explicit &ldquo;not implemented&rdquo; response
              rather than a fake connected state. No OAuth token for Gmail, Drive, Slack, Notion, or
              any other branded catalog connector is stored in your AGI account, because no such
              flow exists on the web. The record we keep for a connector is an enablement flag: a
              connector id, an auth type, and whether it is active. It holds no tokens and no
              endpoint URLs.
            </Prose>

            <h3 className="agi-ds-h3">Desktop OAuth scopes, in full.</h3>
            <Prose>
              On Desktop, Gmail and calendar integrations use <em>your own</em> OAuth client
              credentials with PKCE, and the resulting tokens are encrypted with a key derived from
              your machine and stored in local SQLite on that device. The provider&rsquo;s own
              consent screen shows these scopes when you authorize; we list them here so you see
              them before you get there.
            </Prose>
            <Ledger
              caption="Desktop OAuth scopes"
              rows={DESKTOP_SCOPES.map((row) => ({ label: row.k, value: row.v }))}
            />
            <Prose>
              Two of those requests are broader than the feature needs: Gmail&rsquo;s modify scope
              and Google Calendar&rsquo;s unrestricted scope. We are naming them rather than
              describing the narrower scope we wish we asked for. Narrowing them changes behaviour
              for existing connections, so it is tracked as engineering work, not a wording change.
            </Prose>

            <h3 className="agi-ds-h3">A custom MCP server is your trust boundary.</h3>
            <Prose>
              AGI does not vet the remote MCP servers you add. The operator of that server sees the
              conversation context you send to its tools, and any token you enter is transmitted to
              it. We validate that the URL resolves to a public host (private and link-local
              addresses are rejected), and we encrypt the token at rest and scope it to your
              account. That is infrastructure hygiene, not an endorsement of the server. Add servers
              you trust, the way you would add a dependency.
            </Prose>
          </Stack>
        </Section>

        <Section id="revocation" labelledBy="agi-perm-revoke-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Revocation</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-perm-revoke-title">
                Every way to take access back.
              </h2>
            </div>
            <Ledger
              caption="Ways to revoke access"
              rows={REVOKE.map((row) => ({ label: row.k, value: row.v }))}
            />
            <Prose>
              On the web today, per-tool permissions are set from the approval card shown in the
              conversation when a tool asks: that is where Always allow, Needs approval, and Blocked
              live. A standing per-tool settings panel exists on Desktop. Connecting and
              disconnecting a connector is recorded in your account&rsquo;s security audit events.
            </Prose>
            <ButtonRow>
              <Button href="/acceptable-use">Read the Acceptable Use Policy</Button>
              <Button href="/security" variant="secondary">
                Security posture
              </Button>
              <Button href="/privacy" variant="secondary">
                Privacy policy
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
