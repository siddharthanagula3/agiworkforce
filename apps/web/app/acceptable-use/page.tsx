import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  LEGAL_ENTITY,
  MANAGED_CLOUD_STATUS,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Acceptable use policy',
  description:
    'What you may and may not do with an agent that browses the web, runs code in a sandbox, and acts on connected accounts. Prohibited uses, automated-access limits, and what happens on a violation.',
  path: '/acceptable-use',
});

const SUMMARY: { k: string; v: string }[] = [
  {
    k: 'Only your own accounts',
    v: 'Point the agent at systems and accounts you are authorized to use. Not someone else’s inbox, not a site you were asked to stay off, not an account you share credentials into.',
  },
  {
    k: 'The sandbox is for your work',
    v: 'Code runs in an isolated cloud sandbox. Use it for your own compute. Not for mining, scanning, flooding, or building malware.',
  },
  {
    k: 'Connectors ask first',
    v: 'Every connector and MCP tool requires approval by default. Built-in web search, page fetch, and sandbox tools do not — see the full authority map on agent permissions.',
  },
  {
    k: 'A Block is absolute',
    v: 'A tool you block is refused on the server before it runs. Nothing in the app or the API can override that.',
  },
  {
    k: 'You can revoke everything',
    v: 'Disconnect a connector, reset a tool’s saved permission, or remove a site from the browser allowlist — all listed on the agent permissions page.',
  },
  {
    k: 'Breaking these rules costs access',
    v: 'The ladder is rate limiting, then server-side tool refusal, then account suspension or ban, then termination. Suspension is enforced on every request.',
  },
];

const LIMITS: { k: string; v: string }[] = [
  {
    k: 'Per-user request ceiling',
    v: 'Chat completions are rate limited per authenticated user — 30 requests per minute at the time of writing. The limiter is fail-closed: if the rate-limit store is unavailable, requests are refused rather than allowed through.',
  },
  {
    k: 'Per-IP request ceiling',
    v: 'A separate, broader pre-authentication ceiling applies per IP address (1,500 requests per minute at the time of writing) so a shared network cannot consume one user’s quota. It is also fail-closed.',
  },
  {
    k: 'Conversation operations',
    v: 'Conversation create/update/delete operations are limited to 60 per minute per user.',
  },
  {
    k: 'API key scopes',
    v: 'The public API supports exactly three scopes: models:read, inference:write, and usage:read. There is no scope that grants connector access, sandbox control, or administrative action. Do not represent otherwise to your own users.',
  },
  {
    k: 'Key handling',
    v: 'API keys are issued to one account. Do not share, resell, sublicense, or embed a key in a distributed client where a third party can extract it. Activity through your key is your responsibility.',
  },
  {
    k: 'Connector and sandbox ceilings',
    v: 'The number of connector tools available to your account and the number of concurrent sandboxes you may hold are capped by plan. Do not run multiple accounts to defeat a cap.',
  },
  {
    k: 'Crawling this site',
    v: 'Our crawler policy is published at /robots.txt and is part of these rules. Application routes are disallowed for all crawlers, and Common Crawl (CCBot) is disallowed entirely.',
  },
];

const ENFORCEMENT: { k: string; v: string }[] = [
  {
    k: '1 · Rate limiting',
    v: 'Requests over a published ceiling are refused. On the security-sensitive limiters, an unavailable rate-limit store also results in refusal rather than access.',
  },
  {
    k: '2 · Server-side tool refusal',
    v: 'A tool you have blocked is refused on the server before execution, on both the streaming tool loop and the approval-resume path. This applies to a request from our own app and to a request you construct yourself against the API.',
  },
  {
    k: '3 · Account suspension or ban',
    v: 'An account status of suspended or banned is checked on every authenticated request and returns a 403. The check fails closed by default: if the status cannot be read after a retry, the request is refused with a 503 rather than allowed through.',
  },
  {
    k: '4 · Termination',
    v: 'Material breach may end your access entirely under the “Termination” section of the Terms of Service, which also states what happens to your data and which clauses survive.',
  },
];

export default function AcceptableUsePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Acceptable use.</h1>
          <p className="agi-page-lede">
            AGI ships an agent that can search and fetch the web, run code in a cloud sandbox, drive
            a browser tab, and call tools on accounts you connect.{' '}
            <strong>
              That capability set needs rules that name the capability, not a generic template. This
              page is those rules.
            </strong>{' '}
            It sits alongside the{' '}
            <Link href="/terms" style={{ color: 'var(--agi-ink)' }}>
              Terms of Service
            </Link>
            ; where they overlap, both apply. Last updated: {POLICY_LAST_UPDATED.acceptableUse}.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">The short version</p>
          <table className="agi-ledger">
            <tbody>
              {SUMMARY.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '30%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 20 }}>
            The precise default authority for every tool — what runs without asking, what always
            asks, and how to revoke — is on{' '}
            <Link href="/agent-permissions" style={{ color: 'var(--agi-ink)' }}>
              /agent-permissions
            </Link>
            .
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">01 &middot; What this covers</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            These rules apply to every AGI surface — web, desktop, mobile, the Chrome extension, the
            VS Code extension, and the CLI — and to all three trust boundaries: Local on-device
            execution, BYOK using your own provider keys, and Managed Cloud that AGI hosts and
            meters.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>Managed Cloud is in {MANAGED_CLOUD_STATUS} and open by default.</strong> Read
            this page as the rules for an alpha service, not as a general-availability contract.
            Where you use BYOK, the provider whose key you supply also applies their own terms to
            your usage, and those govern that traffic — see &ldquo;Third-party services and
            connectors&rdquo; in the{' '}
            <Link href="/terms" style={{ color: 'var(--agi-ink)' }}>
              Terms
            </Link>
            .
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">02 &middot; Prohibited uses</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Each rule below names the capability it constrains, so you can tell whether it applies
            to what you are building.
          </p>

          <h3 className="agi-reason-h" style={{ marginTop: 28 }}>
            (a) Browser control &mdash; systems you are not authorized to use
          </h3>
          <p className="agi-page-lede" style={{ marginTop: 8 }}>
            The Chrome extension can drive a browser tab through the Chrome debugger on sites you
            add to your allowlist. Do not use it to access accounts or systems you are not
            authorized to access; to bypass authentication, access controls, paywalls, CAPTCHAs, or
            bot detection; to scrape a site at a rate or in a manner the site prohibits; or to take
            actions in another person&rsquo;s account. Adding a site to your own allowlist is a
            statement about what you want the agent to reach. It is not permission from that site.
          </p>

          <h3 className="agi-reason-h" style={{ marginTop: 28 }}>
            (b) The code sandbox
          </h3>
          <p className="agi-page-lede" style={{ marginTop: 8 }}>
            Model-authored code runs in an isolated ephemeral cloud sandbox with a bounded lifetime
            and a per-plan concurrency allowance. A Code session carries one of three outbound
            network policies — <code>none</code> (no outbound access), <code>trusted</code> (a fixed
            allowlist of package and source hosts, everything else denied), or <code>full</code>{' '}
            (unrestricted outbound access). Choosing <code>full</code> does not widen what these
            rules permit: the restrictions below apply at every network setting. Do not use it for
            cryptocurrency mining or other resource-arbitrage workloads; for denial-of-service
            traffic, port scanning, or vulnerability scanning against systems you do not own; for
            developing or distributing malware, ransomware, or credential-cracking tooling; or to
            attempt to escape the sandbox, reach our internal network, or reach another
            customer&rsquo;s workload.
          </p>

          <h3 className="agi-reason-h" style={{ marginTop: 28 }}>
            (c) Connected accounts
          </h3>
          <p className="agi-page-lede" style={{ marginTop: 8 }}>
            Connectors let the agent act inside third-party systems on your behalf. Do not connect
            an account you do not own or administer, or one you are not permitted to automate. Do
            not use a connected account to read, send, post, or comment on behalf of people who have
            not authorized it — including sending mail from a connected mailbox to recipients who
            did not consent, or posting into a shared workspace under a colleague&rsquo;s identity.
            Do not use connectors to collect or move a third party&rsquo;s data out of a system that
            party controls.
          </p>

          <h3 className="agi-reason-h" style={{ marginTop: 28 }}>
            (d) Custom MCP servers
          </h3>
          <p className="agi-page-lede" style={{ marginTop: 8 }}>
            You can point AGI at a remote MCP server you choose and optionally give it a bearer
            token. AGI does not vet those servers. Do not point one at an endpoint you do not
            control or trust, use one to relay another party&rsquo;s data, or use one to circumvent
            a limit, gate, or prohibition in this policy. A custom MCP server is an extension of{' '}
            <em>your</em> trust boundary, and its operator sees the conversation context you send to
            its tools.
          </p>

          <h3 className="agi-reason-h" style={{ marginTop: 28 }}>
            (e) Content and conduct
          </h3>
          <p className="agi-page-lede" style={{ marginTop: 8 }}>
            Do not use AGI to break the law; to harass, threaten, defame, or stalk anyone; to
            generate child sexual abuse material; to produce non-consensual intimate imagery; to
            develop weapons, including chemical, biological, radiological, nuclear, or high-yield
            explosives; to build tooling for unlawful surveillance; or to generate fraud, phishing,
            or impersonation material. Do not use output to make automated decisions about a person
            &mdash; employment, credit, housing, insurance, education, or legal status — without
            meaningful human review.
          </p>

          <h3 className="agi-reason-h" style={{ marginTop: 28 }}>
            (f) The service itself
          </h3>
          <p className="agi-page-lede" style={{ marginTop: 8 }}>
            Do not resell, sublicense, or white-label AGI without a written agreement. Do not
            reverse-engineer or decompile the software except where applicable law permits, and do
            not conduct penetration testing or load testing against the service without our written
            consent — if you want to test, write to us first and we will scope it. Do not
            misrepresent AGI-generated output as reviewed or endorsed by AGI Automation LLC.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">03 &middot; Automated access and limits</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Programmatic use is expected and supported. These are the rules it operates under. The
            specific numbers below reflect the limits configured at the time of writing and may
            change; the enforced values are the ones in the product, and exceeding them returns an
            error rather than degrading quietly.
          </p>
          <table className="agi-ledger" style={{ marginTop: 20 }}>
            <tbody>
              {LIMITS.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '30%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 20 }}>
            Do not attempt to evade a limit by rotating accounts, addresses, or keys. Retry with
            backoff when you receive a rate-limit response rather than retrying immediately in a
            loop.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">04 &middot; What happens on a violation</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Enforcement is a ladder, not a single switch. Which rung applies depends on severity and
            on whether the behaviour continues. Severe abuse — CSAM, credible threats, active attack
            traffic — goes straight to the top of the ladder.
          </p>
          <table className="agi-ledger" style={{ marginTop: 20 }}>
            <tbody>
              {ENFORCEMENT.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '30%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 20 }}>
            <strong>Appeals.</strong> If your account is suspended or banned and you believe it was
            wrong, email{' '}
            <a href={contactMailto(CONTACT_SUBJECTS.appeal)} style={{ color: 'var(--agi-ink)' }}>
              {CONTACT_EMAIL}
            </a>{' '}
            with the subject &ldquo;{CONTACT_SUBJECTS.appeal}&rdquo; and the email address on the
            account. A suspension can be reversed by reinstatement; we will tell you what triggered
            it unless doing so would compromise an investigation or another person&rsquo;s safety.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">05 &middot; Reporting abuse</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            <strong>If an AGI agent is acting against you or your systems</strong> — unwanted
            automated traffic, messages from a connected account, or activity you did not authorize
            — email{' '}
            <a href={contactMailto(CONTACT_SUBJECTS.abuse)} style={{ color: 'var(--agi-ink)' }}>
              {CONTACT_EMAIL}
            </a>{' '}
            with the subject &ldquo;{CONTACT_SUBJECTS.abuse}&rdquo;. Include the affected domain or
            account, timestamps with timezone, and any request identifiers, log lines, or message
            headers you have. You do not need an AGI account to report abuse.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>If you found a security vulnerability</strong>, use the subject line &ldquo;
            {CONTACT_SUBJECTS.security}&rdquo; and follow the guidance on{' '}
            <Link href="/security" style={{ color: 'var(--agi-ink)' }}>
              /security
            </Link>
            .
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            {LEGAL_ENTITY}, {NOTICE_ADDRESS}. We may update this policy with notice posted on this
            page; material changes are recorded on{' '}
            <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              /changelog
            </Link>
            .
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/agent-permissions" className="agi-cta-ghost">
              Agent permissions &rarr;
            </Link>
            <Link href="/terms" className="agi-cta-ghost">
              Terms &rarr;
            </Link>
            <Link href="/privacy" className="agi-cta-ghost">
              Privacy &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
