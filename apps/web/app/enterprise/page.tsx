import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { LedgerSection } from '@/features/marketing/components/LandingSections';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import type { TerminalLine } from '@/features/marketing/components/DeviceMockups';

export const metadata = buildMetadata({
  title: 'Enterprise: evaluate without exposing your data',
  description:
    'Run AGI fully local or on your own provider keys, so no conversation content reaches our infrastructure. Identity, audit, and retention controls are administered by your own workspace owner, with build status stated honestly.',
  path: '/enterprise',
});

/**
 * When the enterprise control and compliance rows below were last reviewed
 * against the codebase. Rendered on the page — an undated "honest as of today"
 * is the same defect /trust was rewritten to remove (it promised "claims with
 * dates" and rendered none). Change this when you change a row.
 */
const STATUS_AS_OF = '23 August 2026';

/**
 * Verbatim output of `render_privacy_settings` and `handle_privacy_mode` in
 * apps/cli/src/claude_parity.rs. The refusal is the second branch, which fires
 * when an established session is asked to change trust boundary. The last two
 * entries are one sentence wrapped at a word break, because the frame clips at
 * roughly 64 columns. If the Rust strings change, change these.
 */
const REVIEW_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: '/privacy-settings' },
  { kind: 'out', text: 'Privacy settings' },
  { kind: 'dim', text: '  Local file access: explicit workspace roots only' },
  { kind: 'cmd', text: '/privacy-mode managed' },
  { kind: 'ok', text: 'Privacy mode was not changed.' },
  { kind: 'out', text: 'This is an established byok session; start a new managed' },
  { kind: 'out', text: 'session instead of carrying its transcript across trust' },
  { kind: 'out', text: 'boundaries.' },
];

/**
 * Field order is what `formatAuditEvent` emits; the metadata keys are the ones
 * the sanitiser in lib/security-audit.ts admits; the denial row is what the
 * export route records before it throws; newest-first matches the iterator.
 * Every value here is format, never a measurement — do not add counts.
 */
const AUDIT_EXPORT_FILENAME = 'agi-audit-<workspace-id>-2026-08-23.jsonl';

const AUDIT_EXPORT_SAMPLE = [
  '{"id":"1f8a4d6c-7b52-4a19-9e30-2c6d84b1f077","organizationId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","actorUserId":"user_31Kk8fQpZ2mXvR7d","surface":"web","action":"data_exported","resourceType":"enterprise_audit_events","resourceId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","outcome":"denied","severity":"warning","metadata":{"resourceType":"enterprise_audit_events","resourceId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","reason":"audit_export_disabled"},"createdAt":"2026-08-23T16:41:07.402Z"}',
  '{"id":"0b73e5aa-1c94-4d28-8f57-3ae0629b4d11","organizationId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","actorUserId":"user_31Kk8fQpZ2mXvR7d","surface":"web","action":"admin_policy_changed","resourceType":"organization_admin_policy","resourceId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","outcome":"success","severity":"warning","metadata":{"resourceType":"organization_admin_policy","resourceId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","role":"owner","status":"updated","changedKeys":["auditExportEnabled"]},"createdAt":"2026-08-23T09:02:44.517Z"}',
].join('\n\n');

export default function EnterprisePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI for enterprise"
          titleLines={['Your data can stay where it is', 'while the security review runs.']}
          em="stay where it is"
          lede="Most AI tools ask you to accept their data boundary before you are allowed to evaluate them. Local and BYOK invert that: a reviewer runs the product on their own hardware or their own provider contract, and the evaluation finishes without a conversation reaching AGI infrastructure. When you do buy, identity, policy, audit, and retention are administered by your own owner in a workspace console — and the two ledgers below say which of those are built and which are still only commitments."
          ctas={[
            { href: '/contact-sales', label: 'Contact sales' },
            { href: '/trust', label: 'Read the dated trust ledger' },
          ]}
          modeRibbon={[
            {
              label: 'Local',
              note: 'Runs on your hardware. No content reaches us. No account needed.',
            },
            {
              label: 'BYOK',
              note: 'Your provider contract governs the data. We are not in the path.',
            },
            {
              label: 'AGI Cloud',
              note: 'Hosted and metered by us. Public alpha, not generally available.',
            },
          ]}
          visual={
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              routeMode="byok"
              session={REVIEW_SESSION}
            />
          }
        />

        {/*
          Every control row below must match shipped code, in both directions:
          never name a control we do not offer, and never call a shipped,
          entitlement-gated control "roadmap". There is NO data-region-pinning
          mechanism, so those rows stay cut. SSO/OIDC, SCIM directory sync, org
          audit read + JSONL export, audit streaming, and per-workspace
          retention are live, gated on the `enterprise_controls` /
          `audit_export` capabilities; retention enforcement is opt-in per
          workspace and fails closed, so do not restore "you set them" phrasing
          that implied it is unconditional. The four-hour SLA is a PLANNED
          target on /sla, not a binding promise — defer to /sla rather than
          restating it.

          Two rows were wrong on 28 August 2026 and are now corrected:
            - SCIM sent buyers to /admin/directory-sync. `/admin` is the
              internal platform operator console, gated on Clerk
              publicMetadata no customer holds; the customer-facing panel is
              WorkspaceIdentityPanels at /workspace/identity.
            - Audit read "There is no SIEM stream yet." There is:
              lib/services/audit-streaming-service.ts signs batches with a
              per-workspace secret, and vercel.json drains
              /api/cron/drain-audit-streams every ten minutes. Understating a
              shipped control is the same defect as overstating one.
          Re-verify each row against the code before editing.
        */}
        <LedgerSection
          eyebrow="What an enterprise contract covers"
          title="Scoped on a contract, stated without inflation."
          rows={[
            {
              k: 'Status',
              v: `Reviewed ${STATUS_AS_OF}. SSO and directory provisioning are implemented and live, gated on the enterprise_controls entitlement that ships with the Enterprise plan — your org's owner configures both directly once that entitlement is on the account. Org audit events are recorded to an append-only table, and your owner or admin can now read and filter them in the product and download the range as JSONL. Your owner can now set a retention window per workspace and switch enforcement on, which runs a nightly sweep that permanently deletes conversations past the window, withholds anything under legal hold, and records every run so the deletion is evidenceable. Legal holds are placed and released in the product. Your owner can also switch off public sharing for the whole workspace, which refuses new anonymous links on both the chat-share and artifact-publish paths. Dedicated capacity remains a contract-scoped commitment, not a self-serve toggle; we state dates for that in writing during procurement.`,
            },
            {
              k: 'SSO',
              v: 'Implemented. SAML 2.0 and OIDC single sign-on, configured by your org owner at /workspace/identity once the account carries the enterprise_controls entitlement — domain verification and connection activation happen there, not through a separate rollout project. The limit the console states to your admin, and we will state to your reviewer: an active connection adds an authentication route without removing the others, so a member who already has a password can still sign in with it.',
            },
            {
              k: 'Directory provisioning',
              v: 'Implemented. SCIM 2.0 user and group provisioning from your IdP, with token issuance and a provisioning event log at /workspace/identity, gated on the same enterprise_controls entitlement as SSO. Deactivating a user at your IdP removes their membership; it does not yet terminate live sessions or device tokens on Desktop, Mobile, CLI, VS Code, or Chrome, and directory groups map to a role without carrying sharing grants, policy scope, or budgets.',
            },
            {
              k: 'Audit',
              v: 'Implemented, with a stated limit. Administrative and identity events are written through a security-definer function into a table the application role cannot update or delete. An owner or admin reads and filters them at /workspace/audit and exports the filtered range as JSONL; the export, and any refusal of one, is itself recorded. Streaming is built too: batches go to an HTTPS endpoint you nominate, signed with a per-workspace secret and drained on a ten-minute schedule, though that destination is configured through the API rather than from a screen. The limit worth knowing before you buy: coverage is administrative and identity events, not every action in the product, and we will tell you precisely which are captured rather than implying full coverage.',
            },
            {
              k: 'Retention',
              v: 'Your workspace owner sets a retention window between 1 and 3650 days and decides whether it is enforced. Until enforcement is on, the window is a recorded position and nothing is deleted — the product labels it that way rather than implying deletion. With it on, a nightly sweep permanently deletes workspace conversations with no activity for the window, skips any subject under legal hold, and refuses to delete at all if it cannot read the hold set. Each run is recorded with what it removed and what it withheld.',
            },
            {
              k: 'BYOK posture',
              v: 'The strongest control available today, and it needs no feature work from us: every seat can run fully local, or on your own provider keys on Desktop, CLI, and VS Code, and no conversation content reaches AGI infrastructure at all. It is architecture rather than administration — there is no org-wide BYOK enforcement, so we cannot stop a member choosing managed cloud. Requiring it org-wide is a contract-scoped commitment.',
            },
            {
              k: 'Service levels',
              v: 'Managed cloud is a public alpha. Response and uptime numbers are planned targets rather than binding commitments — see the SLA page for exactly which is which.',
            },
            {
              k: 'MSA',
              v: 'We negotiate against your procurement. No forced click-through.',
            },
          ]}
        />

        {/*
          These rows must agree with /trust, which is the dated ledger and the
          page a reviewer is sent to. Two of them did not:

            - SOC 2 read "Evidence collection is part of the Cloud release
              path." Nothing in this repository collects, stores or tracks audit
              evidence, and /trust says in terms "no auditor is engaged, and no
              audit is in progress. We are not going to describe internal work
              as an audit programme." That sentence was written when the same
              claim was cut from /trust; it survived here. It is now cut here
              too, and `compliance-claim-honesty.test.ts` fails the build if
              audit-programme language returns on any page.
            - GDPR and CCPA read "In progress", and CCPA added that export and
              deletion "are being verified". Both understate what shipped:
              /api/user/export returns account data as a download,
              /api/user/delete-account starts an enumerated erasure, and
              /api/cron/purge-deleted-accounts runs it on a schedule. A page
              that is more pessimistic than the ledger is still a page that
              disagrees with it, and a reviewer reading both gets two answers.
        */}
        <LedgerSection
          eyebrow={`Compliance posture as of ${STATUS_AS_OF}`}
          title="We claim only what is complete."
          rows={[
            {
              k: 'SOC 2 Type II',
              v: 'Not held. No report exists, no auditor is engaged, and no audit is in progress. We are not going to describe internal work as an audit programme — /trust carries the dated status.',
            },
            {
              k: 'GDPR — data subject rights',
              v: 'Implemented. Self-service export returns your account data as a download, and account deletion runs an enumerated erasure on a scheduled job. Our standard DPA is published at /dpa; we also negotiate against yours.',
            },
            {
              k: 'CCPA / CPRA',
              v: 'Implemented, through the same export and erasure paths. We do not sell personal information — the privacy policy carries that disclosure.',
            },
            { k: 'HIPAA', v: 'Not available. AGI does not offer HIPAA-covered workflows today.' },
            {
              k: 'ISO 27001',
              v: 'Not held. No certification body is engaged and no date is claimed.',
            },
            {
              k: 'Everything else',
              v: 'On the roadmap with no date until there is a date.',
            },
          ]}
        />

        <section className="agi-section" aria-labelledby="agi-enterprise-export-title">
          <p className="agi-section-eyebrow">The artifact behind the audit row</p>
          <h2 id="agi-enterprise-export-title" className="agi-section-h2">
            Your reviewer can read the export line by line.
          </h2>
          <p className="agi-fl-section-lede">
            These two rows are the shape your admin downloads. Read them together: an owner switched
            export off that morning, and the afternoon attempt to download the trail was refused —
            so the denial is in the trail, next to the change that caused it.
          </p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">{AUDIT_EXPORT_FILENAME}</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-comment">
                # newest first, one event per line, streamed as it is read
              </span>
              {'\n'}
              {AUDIT_EXPORT_SAMPLE}
            </pre>
          </div>
        </section>

        <FinalCta
          eyebrow="Start the evaluation"
          title="You can start before you talk to us."
          body="Local and BYOK need no contract, no trial, and no seat, so a reviewer can run the product on their own hardware or their own provider key while procurement is still reading. Send the questionnaire whenever you are ready and you will get direct answers, including the ones where the answer is 'not yet'."
          ctas={[{ href: '/download', label: 'Get AGI Desktop' }]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
