import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

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
    v: 'Executes model-authored code in an isolated cloud sandbox belonging to that conversation — not on your device. Classified as an irreversible execute action that creates an egress path.',
  },
  {
    k: 'Write a file, create a folder',
    v: 'Writes inside the conversation’s own sandbox workspace. Not your filesystem, not your cloud storage. A file write is classified as irreversible; a folder create is reversible.',
  },
  {
    k: 'Create an Office file',
    v: 'Generates a document, spreadsheet, or deck inside the sandbox for you to download. Reversible, no egress path.',
  },
  {
    k: 'Run a skill',
    v: 'Loads a skill’s instructions into the turn. Skills act through the tools above and are gated by them.',
  },
];

const REVOKE: { k: string; v: string }[] = [
  {
    k: 'Disconnect a connector',
    v: 'Removes the connection and also deletes every saved per-tool permission for that connector, so a past “Always allow” cannot survive a reconnect.',
  },
  {
    k: 'Reset one tool',
    v: 'Set a single tool back to “Needs approval”, or delete its saved verdict outright. This exists specifically so a one-time “Always allow” is not permanent.',
  },
  {
    k: 'Block one tool',
    v: 'A blocked tool is refused server-side before it runs, on the normal tool loop and on the approval-resume path.',
  },
  {
    k: 'Unlink GitHub',
    v: 'Disconnecting GitHub deletes your installation records so GitHub tools stop being offered. The GitHub App itself remains installed on your GitHub account until you remove it at github.com/settings/installations — do both for full revocation.',
  },
  {
    k: 'Delete a custom MCP connector',
    v: 'Removes the server and the encrypted bearer token you supplied with it. Rotate that token on the server side too if it was ever sensitive.',
  },
  {
    k: 'Browser: remove a site',
    v: 'Take a site off the extension’s allowlist and the browser agent can no longer navigate to it.',
  },
  {
    k: 'Browser: re-enable the gate',
    v: 'Turn “ask before acting” back on if you previously opted into autopilot. Only an explicit opt-out disables it.',
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
    v: 'calendar.readonly (read events), calendar.events (read and write events), and auth/calendar — the unrestricted calendar scope, which is broader than the other two and makes them redundant.',
  },
  {
    k: 'Outlook Calendar',
    v: 'User.Read (basic profile), Calendars.Read, and Calendars.ReadWrite (read and write your calendars).',
  },
];

export default function AgentPermissionsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-perm-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Agent permissions</p>
          <h1 id="agi-perm-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">What the agent may do,</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">and what it must ask.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            The exact default authority of the agent on each surface, the limits of the protections
            we ship, the connector scopes actually requested today, and every way to take access
            back.{' '}
            <strong>
              Some of this is less flattering than a marketing page would write it. That is the
              point — you cannot review a permission model you have to infer.
            </strong>{' '}
            The rules that govern how you use it are at{' '}
            <Link href="/acceptable-use" style={{ color: 'var(--agi-ink)' }}>
              /acceptable-use
            </Link>
            .
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-perm-noask-title">
          <p className="agi-fl-eyebrow">Managed Cloud &middot; no approval</p>
          <h2 id="agi-perm-noask-title" className="agi-fl-h2">
            These run without asking.
          </h2>
          <p className="agi-fl-section-lede">
            In Managed Cloud, a turn that offers no connector or MCP tool runs in automatic approval
            mode. With no saved preference of your own, the built-in tools below execute without a
            prompt. This is a deliberate design choice: each one acts inside a read-only or isolated
            boundary, and prompting on every web search would train you to click through prompts
            that matter. It is stated plainly here rather than implied away.
          </p>
          <table className="agi-ledger" style={{ marginTop: 24 }}>
            <tbody>
              {NO_ASK.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '28%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-fl-section-lede" style={{ marginTop: 20 }}>
            You can still override any of them: set a tool to &ldquo;Needs approval&rdquo; or
            &ldquo;Blocked&rdquo; and your setting takes precedence over automatic mode.
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-perm-ask-title">
          <p className="agi-fl-eyebrow">Managed Cloud &middot; approval required</p>
          <h2 id="agi-perm-ask-title" className="agi-fl-h2">
            These always ask.
          </h2>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Every connector and MCP tool</h3>
              <p className="agi-reason-p">
                When a turn carries any connector or MCP tool, the whole turn switches to manual
                approval mode. These tools cross an external or mutating boundary, so they are gated
                by default and on every turn — not once at connect time.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Anything you marked &ldquo;Needs approval&rdquo;</h3>
              <p className="agi-reason-p">
                A saved &ldquo;ask&rdquo; verdict outranks automatic mode, so you can pull any
                built-in tool back into the approval flow.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">A tool call that trips the injection escalation</h3>
              <p className="agi-reason-p">
                When untrusted content has entered the conversation, a private authenticated source
                is reachable, and the pending call can move data out of the boundary, an otherwise
                automatic approval escalates to a human decision. See the limits below.
              </p>
            </li>
          </ul>

          <h3 className="agi-fl-h2" style={{ marginTop: 48, fontSize: 'inherit' }}>
            The precedence order, in full.
          </h3>
          <table className="agi-ledger" style={{ marginTop: 16 }}>
            <tbody>
              <tr>
                <td style={{ width: '28%' }}>1. Blocked by you</td>
                <td>Denied. Nothing overrides this.</td>
              </tr>
              <tr>
                <td>2. Allowed by you, escalation triggered</td>
                <td>Asks anyway.</td>
              </tr>
              <tr>
                <td>3. Allowed by you</td>
                <td>Runs.</td>
              </tr>
              <tr>
                <td>4. &ldquo;Needs approval&rdquo; by you</td>
                <td>Asks.</td>
              </tr>
              <tr>
                <td>5. Manual mode (a connector tool is in the turn)</td>
                <td>Asks.</td>
              </tr>
              <tr>
                <td>6. Escalation triggered</td>
                <td>Asks.</td>
              </tr>
              <tr>
                <td>7. Otherwise</td>
                <td>Runs.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-perm-limits-title">
          <p className="agi-fl-eyebrow">Honest limits</p>
          <h2 id="agi-perm-limits-title" className="agi-fl-h2">
            What the injection escalation does not catch.
          </h2>
          <p className="agi-fl-section-lede">
            The escalation is a mitigation, not a proof. We publish its gaps because a reviewer will
            find them anyway, and a mitigation you can reason about is worth more than a clean claim
            you cannot.
          </p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Pasted and attached content is not counted</h3>
              <p className="agi-reason-p">
                Untrusted content is recognised when a tool fetched it — a web page, a search
                result, a pull-request diff. Content you paste or attach yourself is not counted,
                and that is a real injection vector this check does not see.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">It over-triggers on purpose</h3>
              <p className="agi-reason-p">
                Whether a sensitive source is reachable is derived from which tools were offered,
                not from what was actually read. A connector merely being available counts. We would
                rather cost you a click than miss a case.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Undeclared exfiltration is invisible</h3>
              <p className="agi-reason-p">
                Whether a call can move data out is per-tool metadata. An MCP server that phones
                home during what it declares as a read is not visible to this check — which is
                exactly why any tool we have not classified is treated as creating an egress path.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">It cannot stop you approving</h3>
              <p className="agi-reason-p">
                The check gates automatic approval only. If it escalates and you approve, the call
                runs.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-perm-block-title">
          <p className="agi-fl-eyebrow">Blocking</p>
          <h2 id="agi-perm-block-title" className="agi-fl-h2">
            A Block is enforced on the server.
          </h2>
          <p className="agi-fl-section-lede">
            Blocking a tool is not a client-side preference. The verdict is stored against your
            account and checked on the server before any side effect — on the streaming tool loop
            and again when an approval is resumed. A modified client, or a request you write
            yourself against the API, cannot execute a tool you blocked; the model is told the tool
            is blocked and instructed not to retry it.
          </p>
          <p className="agi-fl-section-lede" style={{ marginTop: 16 }}>
            <strong>One thing a Block does not do:</strong> it does not hide the tool from the
            model&rsquo;s list of available tools. The model may still attempt the call. The call is
            refused before it runs, and nothing happens.
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-perm-browser-title">
          <p className="agi-fl-eyebrow">In the browser</p>
          <h2 id="agi-perm-browser-title" className="agi-fl-h2">
            Computer use in Chrome.
          </h2>
          <p className="agi-fl-section-lede">
            The Chrome extension can drive a tab through the Chrome debugger. Starting a session is
            always an explicit action — you type a goal and click. Once running:
          </p>
          <table className="agi-ledger" style={{ marginTop: 24 }}>
            <tbody>
              <tr>
                <td style={{ width: '28%' }}>Ask before acting</td>
                <td>
                  On by default. An unset preference means ask; autopilot is an explicit opt-out you
                  have to choose.
                </td>
              </tr>
              <tr>
                <td>Unanswered approvals</td>
                <td>Denied after 30 seconds. The gate fails closed, not open.</td>
              </tr>
              <tr>
                <td>Where it can go</td>
                <td>
                  Navigation is confined to the site allowlist you maintain in extension options.
                </td>
              </tr>
              <tr>
                <td>Text leaving the page</td>
                <td>
                  Page-text summaries and field readbacks are redacted by the driver before they
                  leave.
                </td>
              </tr>
              <tr>
                <td>Screenshots</td>
                <td>
                  <strong>
                    Screenshots are not redacted and cannot be — you cannot scrub secrets out of a
                    PNG.
                  </strong>{' '}
                  They reach the Managed Cloud gateway. If a page has a secret visibly rendered on
                  it, a screenshot of that page carries it. This is a residual, accepted risk,
                  bounded by the allowlist and the approval gate.
                </td>
              </tr>
              <tr>
                <td>Where inference happens</td>
                <td>
                  Computer use requires Managed Cloud sign-in and calls the Managed Cloud gateway
                  directly from the extension.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-perm-desktop-title">
          <p className="agi-fl-eyebrow">On Desktop</p>
          <h2 id="agi-perm-desktop-title" className="agi-fl-h2">
            Local execution, local approval.
          </h2>
          <p className="agi-fl-section-lede">
            Desktop runs tools on your machine, so it carries its own gate: dangerous tools prompt
            in manual mode, per-tool approval policies are stored and reapplied, and connector
            settings expose a standing Always allow / Needs approval / Blocked control for each
            tool. Desktop is also the only surface today that completes a real OAuth flow — see the
            next section.
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-perm-connectors-title">
          <p className="agi-fl-eyebrow">Connectors</p>
          <h2 id="agi-perm-connectors-title" className="agi-fl-h2">
            What is actually requested today.
          </h2>
          <p className="agi-fl-section-lede">
            The connector directory is larger than what is connectable. This section describes the
            current state, not the roadmap.
          </p>

          <h3 className="agi-reason-h" style={{ marginTop: 32 }}>
            Managed Cloud connects exactly three kinds of thing
          </h3>
          <table className="agi-ledger" style={{ marginTop: 16 }}>
            <tbody>
              <tr>
                <td style={{ width: '28%' }}>The GitHub App</td>
                <td>
                  Three tools: read a pull-request diff, post an issue or pull-request comment, and
                  post a pull-request review. Access comes from the GitHub App installation you
                  authorize; its permission set is configured on GitHub during install and is shown
                  to you there. We do not restate it here, because it is not declared in our own
                  code and we will not guess at a permission list on your behalf.
                </td>
              </tr>
              <tr>
                <td>Operator-configured MCP servers</td>
                <td>
                  Remote MCP endpoints configured server-side by AGI. The endpoint and its
                  credentials stay server-side; nothing you supply flows into them.
                </td>
              </tr>
              <tr>
                <td>Your own remote MCP servers</td>
                <td>
                  A server URL you provide, with an optional bearer token that is encrypted at rest
                  and scoped to your account alone. Its tools are whatever that server advertises at
                  runtime.
                </td>
              </tr>
            </tbody>
          </table>

          <p className="agi-fl-section-lede" style={{ marginTop: 24 }}>
            <strong>
              Every other connector in the directory is not connectable on the web today.
            </strong>{' '}
            Attempting to connect one returns an explicit &ldquo;not implemented&rdquo; response
            rather than a fake connected state. No OAuth token for Gmail, Drive, Slack, Notion, or
            any other branded catalog connector is stored in your AGI account, because no such flow
            exists on the web. The record we keep for a connector is an enablement flag — a
            connector id, an auth type, and whether it is active. It holds no tokens and no endpoint
            URLs.
          </p>

          <h3 className="agi-reason-h" style={{ marginTop: 40 }}>
            Desktop OAuth scopes, in full
          </h3>
          <p className="agi-fl-section-lede" style={{ marginTop: 8 }}>
            On Desktop, Gmail and calendar integrations use <em>your own</em> OAuth client
            credentials with PKCE, and the resulting tokens are encrypted with a key derived from
            your machine and stored in local SQLite on that device. The provider&rsquo;s own consent
            screen shows these scopes when you authorize; we list them here so you see them before
            you get there.
          </p>
          <table className="agi-ledger" style={{ marginTop: 16 }}>
            <tbody>
              {DESKTOP_SCOPES.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '28%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-fl-section-lede" style={{ marginTop: 20 }}>
            Two of those requests are broader than the feature needs — Gmail&rsquo;s modify scope
            and Google Calendar&rsquo;s unrestricted scope. We are naming them rather than
            describing the narrower scope we wish we asked for. Narrowing them changes behaviour for
            existing connections, so it is tracked as engineering work, not a wording change.
          </p>

          <h3 className="agi-reason-h" style={{ marginTop: 40 }}>
            A custom MCP server is your trust boundary
          </h3>
          <p className="agi-fl-section-lede" style={{ marginTop: 8 }}>
            AGI does not vet the remote MCP servers you add. The operator of that server sees the
            conversation context you send to its tools, and any token you enter is transmitted to
            it. We validate that the URL resolves to a public host — private and link-local
            addresses are rejected — and we encrypt the token at rest and scope it to your account.
            That is infrastructure hygiene, not an endorsement of the server. Add servers you trust,
            the way you would add a dependency.
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-perm-revoke-title">
          <p className="agi-fl-eyebrow">Revocation</p>
          <h2 id="agi-perm-revoke-title" className="agi-fl-h2">
            Every way to take access back.
          </h2>
          <table className="agi-ledger" style={{ marginTop: 24 }}>
            <tbody>
              {REVOKE.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '28%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-fl-section-lede" style={{ marginTop: 24 }}>
            On the web today, per-tool permissions are set from the approval card shown in the
            conversation when a tool asks — that is where Always allow, Needs approval, and Blocked
            live. A standing per-tool settings panel exists on Desktop. Connecting and disconnecting
            a connector is recorded in your account&rsquo;s security audit events.
          </p>
          <div className="agi-fl-cta-row" style={{ marginTop: 32 }}>
            <Link href="/acceptable-use" className="agi-fl-cta agi-fl-cta--primary">
              Read the Acceptable Use Policy
            </Link>
            <Link href="/security" className="agi-fl-cta agi-fl-cta--ghost">
              Security Posture
            </Link>
            <Link href="/privacy" className="agi-fl-cta agi-fl-cta--ghost">
              Privacy Policy
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
