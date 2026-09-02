import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { NoteList } from '@/features/marketing/components/pages/company/shared';
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

const SUMMARY: readonly LedgerRow[] = [
  {
    label: 'Only your own accounts',
    value:
      "Point the agent at systems and accounts you are authorized to use. Not someone else's inbox, not a site you were asked to stay off, not an account you share credentials into.",
  },
  {
    label: 'The sandbox is for your work',
    value:
      'Code runs in an isolated cloud sandbox. Use it for your own compute. Not for mining, scanning, flooding, or building malware.',
  },
  {
    label: 'Connectors ask first',
    value:
      'Every connector and MCP tool requires approval by default. Built-in web search, page fetch, and sandbox tools do not. See the full authority map on agent permissions.',
  },
  {
    label: 'A block is absolute',
    value:
      'A tool you block is refused on the server before it runs. Nothing in the app or the API can override that.',
  },
  {
    label: 'You can revoke everything',
    value:
      "Disconnect a connector, reset a tool's saved permission, or remove a site from the browser allowlist, all listed on the agent permissions page.",
  },
  {
    label: 'Breaking these rules costs access',
    value:
      'The ladder is rate limiting, then server-side tool refusal, then account suspension or ban, then termination. Suspension is enforced on every request.',
  },
];

const LIMITS: readonly LedgerRow[] = [
  {
    label: 'Per-user request ceiling',
    value:
      'Chat completions are rate limited per authenticated user: 30 requests per minute at the time of writing. The limiter is fail-closed: if the rate-limit store is unavailable, requests are refused rather than allowed through.',
  },
  {
    label: 'Per-IP request ceiling',
    value:
      "A separate, broader pre-authentication ceiling applies per IP address (1,500 requests per minute at the time of writing) so a shared network cannot consume one user's quota. It is also fail-closed.",
  },
  {
    label: 'Conversation operations',
    value: 'Conversation create/update/delete operations are limited to 60 per minute per user.',
  },
  {
    label: 'API key scopes',
    value:
      'The public API supports exactly three scopes: models:read, inference:write, and usage:read. There is no scope that grants connector access, sandbox control, or administrative action. Do not represent otherwise to your own users.',
  },
  {
    label: 'Key handling',
    value:
      'API keys are issued to one account. Do not share, resell, sublicense, or embed a key in a distributed client where a third party can extract it. Activity through your key is your responsibility.',
  },
  {
    label: 'Connector and sandbox ceilings',
    value:
      'The number of connector tools available to your account and the number of concurrent sandboxes you may hold are capped by plan. Do not run multiple accounts to defeat a cap.',
  },
  {
    label: 'Crawling this site',
    value:
      'Our crawler policy is published at /robots.txt and is part of these rules. Application routes are disallowed for all crawlers, and Common Crawl (CCBot) is disallowed entirely.',
  },
];

const ENFORCEMENT: readonly LedgerRow[] = [
  {
    label: '1 · Rate limiting',
    value:
      'Requests over a published ceiling are refused. On the security-sensitive limiters, an unavailable rate-limit store also results in refusal rather than access.',
  },
  {
    label: '2 · Server-side tool refusal',
    value:
      'A tool you have blocked is refused on the server before execution, on both the streaming tool loop and the approval-resume path. This applies to a request from our own app and to a request you construct yourself against the API.',
  },
  {
    label: '3 · Account suspension or ban',
    value:
      'An account status of suspended or banned is checked on every authenticated request and returns a 403. The check fails closed by default: if the status cannot be read after a retry, the request is refused with a 503 rather than allowed through.',
  },
  {
    label: '4 · Termination',
    value:
      'Material breach may end your access entirely under the termination section of the terms of service, which also states what happens to your data and which clauses survive.',
  },
];

const PROHIBITED = [
  {
    title: '(a) Browser control: systems you are not authorized to use',
    body: "The Chrome extension can drive a browser tab through the Chrome debugger on sites you both add to your allowlist and separately grant browser control to. Do not use it to access accounts or systems you are not authorized to access; to bypass authentication, access controls, paywalls, CAPTCHAs, or bot detection; to scrape a site at a rate or in a manner the site prohibits; or to take actions in another person's account. Adding a site to your own allowlist is a statement about what you want the agent to reach. It is not permission from that site.",
  },
  {
    title: '(b) The code sandbox',
    body: (
      <>
        Model-authored code runs in an isolated ephemeral cloud sandbox with a bounded lifetime and
        a per-plan concurrency allowance. A code session carries one of three outbound network
        policies: <code>none</code> (no outbound access), <code>trusted</code> (a fixed allowlist of
        package and source hosts, everything else denied), or <code>full</code> (unrestricted
        outbound access). Choosing <code>full</code> does not widen what these rules permit: the
        restrictions below apply at every network setting. Do not use it for cryptocurrency mining
        or other resource-arbitrage workloads; for denial-of-service traffic, port scanning, or
        vulnerability scanning against systems you do not own; for developing or distributing
        malware, ransomware, or credential-cracking tooling; or to attempt to escape the sandbox,
        reach our internal network, or reach another customer&rsquo;s workload.
      </>
    ),
  },
  {
    title: '(c) Connected accounts',
    body: "Connectors let the agent act inside third-party systems on your behalf. Do not connect an account you do not own or administer, or one you are not permitted to automate. Do not use a connected account to read, send, post, or comment on behalf of people who have not authorized it, including sending mail from a connected mailbox to recipients who did not consent, or posting into a shared workspace under a colleague's identity. Do not use connectors to collect or move a third party's data out of a system that party controls.",
  },
  {
    title: '(d) Custom MCP servers',
    body: (
      <>
        You can point AGI at a remote MCP server you choose and optionally give it a bearer token.
        AGI does not vet those servers. Do not point one at an endpoint you do not control or trust,
        use one to relay another party&rsquo;s data, or use one to circumvent a limit, gate, or
        prohibition in this policy. A custom MCP server is an extension of <em>your</em> trust
        boundary, and its operator sees the conversation context you send to its tools.
      </>
    ),
  },
  {
    title: '(e) Content and conduct',
    body: 'Do not use AGI to break the law; to harass, threaten, defame, or stalk anyone; to generate child sexual abuse material; to produce non-consensual intimate imagery; to develop weapons, including chemical, biological, radiological, nuclear, or high-yield explosives; to build tooling for unlawful surveillance; or to generate fraud, phishing, or impersonation material. Do not use output to make automated decisions about a person (employment, credit, housing, insurance, medical, education, or legal status) without meaningful human review. Do not use AGI for practices prohibited under Art. 5 of the EU AI Act (Regulation (EU) 2024/1689): biometric categorisation to infer protected or sensitive attributes, real-time remote biometric identification in public spaces, social scoring, emotion inference in workplace or educational settings, or predictive policing based solely on automated profiling.',
  },
  {
    title: '(f) The service itself',
    body: 'Do not resell, sublicense, or white-label AGI without a written agreement. Do not reverse-engineer or decompile the software except where applicable law permits, and do not conduct penetration testing or load testing against the service without our written consent. If you want to test, write to us first and we will scope it. Do not misrepresent AGI-generated output as reviewed or endorsed by AGI Automation LLC.',
  },
];

export default function AcceptableUsePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-acceptable-use-title"
          eyebrow="Legal"
          title="Acceptable use."
          lede={
            <>
              AGI ships an agent that can search and fetch the web, run code in a cloud sandbox,
              drive a browser tab, and call tools on accounts you connect.{' '}
              <strong>
                That capability set needs rules that name the capability, not a generic template.
                This page is those rules.
              </strong>{' '}
              It sits alongside the{' '}
              <Link href="/terms" className="agi-ds-link">
                terms of service
              </Link>
              ; where they overlap, both apply. Last updated: {POLICY_LAST_UPDATED.acceptableUse}.
            </>
          }
          ctas={[]}
        />

        <Section id="summary" labelledBy="agi-acceptable-use-summary-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-acceptable-use-summary-title">
              The short version.
            </h2>
            <Ledger caption="Summary" rows={SUMMARY} />
            <Prose size="sm">
              The precise default authority for every tool (what runs without asking, what always
              asks, and how to revoke) is on{' '}
              <Link href="/agent-permissions" className="agi-ds-link">
                /agent-permissions
              </Link>
              .
            </Prose>
          </Stack>
        </Section>

        <Section id="s-01" labelledBy="agi-acceptable-use-scope-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-acceptable-use-scope-title">
              01 &middot; What this covers.
            </h2>
            <Prose>
              These rules apply to every AGI surface (web, desktop, mobile, the Chrome extension,
              the VS Code extension, and the CLI) and to all three trust boundaries: Local on-device
              execution, BYOK using your own provider keys, and Managed Cloud that AGI hosts and
              meters.
            </Prose>
            <Prose>
              <strong>Managed Cloud is in {MANAGED_CLOUD_STATUS} and open by default.</strong> Read
              this page as the rules for an alpha service, not as a general-availability contract.
              Where you use BYOK, the provider whose key you supply also applies their own terms to
              your usage, and those govern that traffic. See &ldquo;Third-party services and
              connectors&rdquo; in the{' '}
              <Link href="/terms" className="agi-ds-link">
                terms
              </Link>
              .
            </Prose>
          </Stack>
        </Section>

        <Section id="s-02" labelledBy="agi-acceptable-use-prohibited-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-acceptable-use-prohibited-title">
                02 &middot; Prohibited uses.
              </h2>
              <Prose>
                Each rule below names the capability it constrains, so you can tell whether it
                applies to what you are building.
              </Prose>
            </div>
            <NoteList items={PROHIBITED} />
          </Stack>
        </Section>

        <Section id="s-03" labelledBy="agi-acceptable-use-limits-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-acceptable-use-limits-title">
                03 &middot; Automated access and limits.
              </h2>
              <Prose>
                Programmatic use is expected and supported. These are the rules it operates under.
                The specific numbers below reflect the limits configured at the time of writing and
                may change; the enforced values are the ones in the product, and exceeding them
                returns an error rather than degrading quietly.
              </Prose>
            </div>
            <Ledger caption="Automated access limits" rows={LIMITS} />
            <Prose size="sm">
              Do not attempt to evade a limit by rotating accounts, addresses, or keys. Retry with
              backoff when you receive a rate-limit response rather than retrying immediately in a
              loop.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-04" labelledBy="agi-acceptable-use-violation-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-acceptable-use-violation-title">
                04 &middot; What happens on a violation.
              </h2>
              <Prose>
                Enforcement is a ladder, not a single switch. Which rung applies depends on severity
                and on whether the behaviour continues. Severe abuse (CSAM, credible threats, active
                attack traffic) goes straight to the top of the ladder.
              </Prose>
            </div>
            <Ledger caption="Enforcement ladder" rows={ENFORCEMENT} />
            <Prose size="sm">
              <strong>Appeals.</strong> If your account is suspended or banned and you believe it
              was wrong, email{' '}
              <a href={contactMailto(CONTACT_SUBJECTS.appeal)} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>{' '}
              with the subject &ldquo;{CONTACT_SUBJECTS.appeal}&rdquo; and the email address on the
              account. A suspension can be reversed by reinstatement; we will tell you what
              triggered it unless doing so would compromise an investigation or another
              person&rsquo;s safety.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-05" labelledBy="agi-acceptable-use-report-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-acceptable-use-report-title">
              05 &middot; Reporting abuse.
            </h2>
            <Prose>
              <strong>If an AGI agent is acting against you or your systems</strong> (unwanted
              automated traffic, messages from a connected account, or activity you did not
              authorize), email{' '}
              <a href={contactMailto(CONTACT_SUBJECTS.abuse)} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>{' '}
              with the subject &ldquo;{CONTACT_SUBJECTS.abuse}&rdquo;. Include the affected domain
              or account, timestamps with timezone, and any request identifiers, log lines, or
              message headers you have. You do not need an AGI account to report abuse.
            </Prose>
            <Prose>
              <strong>If you found a security vulnerability</strong>, use the subject line &ldquo;
              {CONTACT_SUBJECTS.security}&rdquo; and follow the guidance on{' '}
              <Link href="/security" className="agi-ds-link">
                /security
              </Link>
              .
            </Prose>
            <Prose>
              {LEGAL_ENTITY}, {NOTICE_ADDRESS}. We may update this policy with notice posted on this
              page; material changes are recorded on{' '}
              <Link href="/changelog" className="agi-ds-link">
                /changelog
              </Link>
              .
            </Prose>
            <ButtonRow>
              <Button href="/agent-permissions" variant="secondary">
                Agent permissions
              </Button>
              <Button href="/terms" variant="secondary">
                Terms
              </Button>
              <Button href="/privacy" variant="secondary">
                Privacy
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
