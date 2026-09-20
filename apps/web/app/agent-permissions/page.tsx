import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Container,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { PolicyContents } from '@shared/components/legal/PolicyContents';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  buildToolApprovalPolicyRows,
  buildToolApprovalToolRows,
  toolApprovalPolicySentence,
  TOOL_APPROVAL_PRECEDENCE,
} from '@/lib/tool-approval-view';

export const metadata = buildMetadata({
  title: 'Approvals',
  description:
    'What the AGI agent asks before doing, which account settings let a tool run without asking, which connector scopes are actually requested, and every way to revoke access.',
  path: '/agent-permissions',
});

const SECTIONS = [
  { label: 'By default, the agent asks', id: 'default-authority' },
  { label: 'These always ask', id: 'always-ask' },
  { label: 'What the injection escalation does not catch', id: 'honest-limits' },
  { label: 'A block is enforced on the server', id: 'blocking' },
  { label: 'Computer use in Chrome', id: 'browser-permissions' },
  { label: 'Local execution, local approval', id: 'desktop-permissions' },
  { label: 'What is actually requested today', id: 'connectors' },
  { label: 'Every way to take access back', id: 'revocation' },
] as const;

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

export default function AgentPermissionsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-perm-title"
          eyebrow="Approvals"
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
              . Last updated: {POLICY_LAST_UPDATED.agentPermissions}.
            </>
          }
          ctas={[]}
        />

        <Container>
          <div className="agi-ds-sticky-scene">
            <div className="agi-ds-sticky-pane">
              <PolicyContents sections={SECTIONS} />
            </div>
            <div className="agi-ds-sticky-flow">
              <Section id="default-authority" labelledBy="agi-perm-default-title" rule>
                <Stack gap="loose">
                  <div>
                    <Eyebrow>Managed Cloud · default authority</Eyebrow>
                    <h2 className="agi-ds-h2" id="agi-perm-default-title">
                      By default, the agent asks.
                    </h2>
                    <Prose>
                      One account-wide setting decides what may run without asking, and it governs
                      our own built-in tools as well as connectors. A new account is set to
                      &ldquo;Ask before every action&rdquo;, so in Managed Cloud every tool call
                      waits for you, the built-in tools below included. A built-in tool runs with no
                      prompt only once you choose one of the other two settings, or save
                      &ldquo;Always allow&rdquo; for that one tool.
                    </Prose>
                  </div>
                  <Ledger
                    caption="What each account default runs without asking"
                    rows={buildToolApprovalPolicyRows().map((row) => ({
                      label: row.label,
                      value: toolApprovalPolicySentence(row),
                    }))}
                  />
                  <h3 className="agi-ds-h3">The built-in tools, and what each one does.</h3>
                  <Ledger
                    caption="Built-in tools"
                    rows={buildToolApprovalToolRows().map((row) => ({
                      label: row.label,
                      value: row.description,
                    }))}
                  />
                  <Prose>
                    You can override the account default one tool at a time, in both directions: set
                    a tool to &ldquo;Always allow&rdquo; and it stops asking, set it to &ldquo;Needs
                    approval&rdquo; or &ldquo;Blocked&rdquo; and it asks or is refused whatever the
                    default says. &ldquo;Skip approvals&rdquo; is also a workspace decision: where a
                    workspace withholds it, the account falls back to asking before every action
                    rather than to the middle setting nobody chose.
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
                        title: 'Every connector and MCP tool we do not know',
                        body: 'A connector or MCP tool in the turn puts the whole turn into manual approval mode. A tool we have not classified is treated as an irreversible write that can move data out, which no account default runs on its own, so it asks under all three settings. The three GitHub tools are classified: reading a pull-request diff can run without asking, posting a comment or a review cannot.',
                      },
                      {
                        meta: 'Your setting',
                        title: 'Anything you marked "Needs approval"',
                        body: 'A saved "ask" verdict outranks automatic mode and the account default alike, so you can pull any built-in tool back into the approval flow.',
                      },
                      {
                        meta: 'Escalation',
                        title: 'A tool call that trips the injection escalation',
                        body: 'When untrusted content has entered the conversation, a private authenticated source is reachable, and the pending call can move data out of the boundary, a call that would otherwise run escalates to a human decision. On an unattended run there is nobody to ask, so it is refused. See the limits below.',
                      },
                    ]}
                  />

                  <h3 className="agi-ds-h3">The precedence order, in full.</h3>
                  <Ledger
                    caption="Approval precedence order"
                    rows={TOOL_APPROVAL_PRECEDENCE.map((row) => ({
                      label: `${row.rank}. ${row.condition}`,
                      value: row.outcome,
                    }))}
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
                      The escalation is a mitigation, not a proof. We publish its gaps because a
                      reviewer will find them anyway, and a mitigation you can reason about is worth
                      more than a clean claim you cannot.
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
                        body: 'The check turns a call that would have run into a call that asks. If it escalates and you approve, the call runs.',
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
                    Blocking a tool is not a client-side preference. The verdict is stored against
                    your account and checked on the server before any side effect, on the streaming
                    tool loop and again when an approval is resumed. A modified client, or a request
                    you write yourself against the API, cannot execute a tool you blocked; the model
                    is told the tool is blocked and instructed not to retry it.
                  </Prose>
                  <Prose>
                    <strong>What blocking does not do:</strong> it does not hide the tool from the
                    model&rsquo;s list of available tools. The model may still attempt the call. The
                    call is refused before it runs, and nothing happens.
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
                      The Chrome extension can drive a tab through the Chrome debugger, and read
                      that tab&rsquo;s console and network activity over the same attachment.
                      Starting a session is always an explicit action: you type a goal and click.
                      Once running:
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
                              Screenshots are not redacted and cannot be. You cannot scrub secrets
                              out of a PNG.
                            </strong>{' '}
                            They reach the Managed Cloud gateway. If a page has a secret visibly
                            rendered on it, a screenshot of that page carries it. This is a
                            residual, accepted risk, bounded by the allowlist and the approval gate.
                          </>
                        ),
                      },
                      {
                        label: 'Console and network capture',
                        value:
                          "The extension reads a page's console messages and the requests it makes, but only while a run is active or you turn the watch on yourself, and only on a site carrying both grants. Message text passes the same redaction as page text. A request line keeps the URL, method, status, type and timing; it drops credentials in the URL and never reads a request body or a header.",
                      },
                      {
                        label: 'Downloads',
                        value:
                          'A download starts only when you ask for one, saves to your own downloads folder, and must come from the page\u2019s own origin or another origin already on your allowlist. Chrome picks the filename.',
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
                    Desktop runs tools on your machine, so it carries its own gate: dangerous tools
                    prompt in manual mode, per-tool approval policies are stored and reapplied, and
                    connector settings expose a standing Always allow / Needs approval / Blocked
                    control for each tool. Desktop is also the only surface today that completes a
                    real OAuth flow. See the next section.
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
                      The connector directory is larger than what is connectable. This section
                      describes the current state, not the roadmap.
                    </Prose>
                  </div>

                  <h3 className="agi-ds-h3">
                    Managed Cloud connects exactly three kinds of thing.
                  </h3>
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
                    Attempting to connect one returns an explicit &ldquo;not implemented&rdquo;
                    response rather than a fake connected state. No OAuth token for Gmail, Drive,
                    Slack, Notion, or any other branded catalog connector is stored in your AGI
                    account, because no such flow exists on the web. The record we keep for a
                    connector is an enablement flag: a connector id, an auth type, and whether it is
                    active. It holds no tokens and no endpoint URLs.
                  </Prose>

                  <h3 className="agi-ds-h3">Desktop uses the managed connector service.</h3>
                  <Prose>
                    The current Electron Desktop opens the same account-scoped connector
                    authorization flow as the web app. It does not store connector OAuth tokens in a
                    local SQLite database. The provider&rsquo;s consent screen is the authoritative
                    list of scopes for a configured connector, and authorization does not finish
                    unless the managed service verifies that connection.
                  </Prose>
                  <Prose>
                    A directory entry is not proof that a connector is available. The app asks the
                    managed service which connectors are configured and reports an unavailable or
                    incomplete setup explicitly instead of inventing a successful connection.
                  </Prose>

                  <h3 className="agi-ds-h3">A custom MCP server is your trust boundary.</h3>
                  <Prose>
                    AGI does not vet the remote MCP servers you add. The operator of that server
                    sees the conversation context you send to its tools, and any token you enter is
                    transmitted to it. We validate that the URL resolves to a public host (private
                    and link-local addresses are rejected), and we encrypt the token at rest and
                    scope it to your account. That is infrastructure hygiene, not an endorsement of
                    the server. Add servers you trust, the way you would add a dependency.
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
                    On the web today, per-tool permissions are set from the approval card shown in
                    the conversation when a tool asks: that is where Always allow, Needs approval,
                    and Blocked live. A standing per-tool settings panel exists on Desktop.
                    Connecting and disconnecting a connector is recorded in your account&rsquo;s
                    security audit events.
                  </Prose>
                  <ButtonRow>
                    <Button href="/acceptable-use">Read the acceptable use policy</Button>
                    <Button href="/security" variant="secondary">
                      Security posture
                    </Button>
                    <Button href="/privacy" variant="secondary">
                      Privacy policy
                    </Button>
                  </ButtonRow>
                </Stack>
              </Section>
            </div>
          </div>
        </Container>
      </main>
      <MarketingFooter />
    </div>
  );
}
