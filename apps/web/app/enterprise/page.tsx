import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { LedgerSection } from '@/features/marketing/components/LandingSections';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';

export const metadata = buildMetadata({
  title: 'Enterprise: evaluate without exposing your data',
  description:
    'Run AGI fully local or on your own provider keys, so no conversation content reaches our infrastructure. Identity, audit, and retention controls are contract-scoped, with build status stated honestly.',
  path: '/enterprise',
});

/**
 * When the enterprise control and compliance rows below were last reviewed
 * against the codebase. Rendered on the page — an undated "honest as of today"
 * is the same defect /trust was rewritten to remove (it promised "claims with
 * dates" and rendered none). Change this when you change a row.
 */
const STATUS_AS_OF = '23 August 2026';

export default function EnterprisePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI for enterprise"
          titleLines={['Pass the security review', 'before you spend anything.']}
          em="before you spend anything."
          lede="Most AI tools require you to accept their data boundary to evaluate them at all. AGI does not: run it fully local, or on your own provider keys, and no conversation content reaches our infrastructure — so the hardest question in your review is answered by architecture rather than by a promise. Identity, audit, and retention controls are scoped on a contract, and this page states plainly which of them are built and which are commitments."
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            { href: '/trust', label: 'See Trust & Compliance' },
            { href: '/byok', label: 'Read the BYOK Posture' },
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
        />

        {/*
          These rows previously read as SHIPPED controls ("Org-level retention
          windows. You set them.", "SAML 2.0 and OIDC. Okta, Azure AD, Google
          Workspace."). A security reviewer treats that as a product claim and
          tests it. Two rows were cut outright rather than softened:

            - Residency ("United States by default. EU on the roadmap; custom
              regions by contract") — there is NO residency or region-pinning
              mechanism anywhere in the codebase. Where the infrastructure
              happens to run is not a control we offer, and "custom regions by
              contract" promised a capability with nothing behind it.
            - The bare four-hour SLA promise — /sla states that number as a
              PLANNED target and explicitly "not a binding commitment". The same
              number cannot be planned on one page and promised on another, so
              this page now defers to /sla instead of restating it.

          AUDIT-FIX (competitive-gap-2026-08-15, G12): the identity/audit rows
          then swung too far the other way and called SSO, directory sync, and
          audit logging contract-in-progress commitments you'd have to "ask us
          about" — that was accurate when written but the concurrent workstream
          this comment flagged has since landed. AdminConsolePage.tsx's
          Identity readiness row now reads "Implemented — entitlement-gated":
          first-party SSO sign-in (lib/server/sso/clerk-enterprise-connections.ts,
          /api/admin/sso) and SCIM provisioning (/api/scim/v2) are live code
          paths, gated on the `enterprise_controls` billing capability rather
          than aspirational. The org audit trail RECORDS but is not readable:
          writes land in `enterprise_audit_events` (see
          db/neon/0087_enterprise_audit_event_writes.sql), but the
          `/organizations/:orgId/audit-events` read and `/export` endpoints
          lived in the Express gateway that was deleted on 2026-08-17, and
          nothing in apps/web replaced them — /api/settings/audit-logs reads
          `security_audit_logs`, a different table. So the row must say events
          are captured and export is unavailable, and must NOT claim the read
          path is live. Org-configurable RETENTION WINDOWS also remain
          unbuilt — that row is unchanged. Calling shipped, gated controls "roadmap" is the same
          honesty bug as overclaiming them; this page must not repeat it in
          either direction, so re-verify each row here against the code
          before editing.
        */}
        <LedgerSection
          eyebrow="What an enterprise contract covers"
          title="Scoped on a contract, stated without inflation."
          rows={[
            {
              k: 'Status',
              v: `Reviewed ${STATUS_AS_OF}. SSO and directory provisioning are implemented and live, gated on the enterprise_controls entitlement that ships with the Enterprise plan — your org's owner configures both directly once that entitlement is on the account. Org audit events are recorded to an append-only table, and your owner or admin can now read and filter them in the product and download the range as JSONL. Data retention windows and dedicated capacity remain contract-scoped commitments, not self-serve toggles; we state dates for those in writing during procurement.`,
            },
            {
              k: 'SSO',
              v: 'Implemented. SAML 2.0 and OIDC single sign-on, configured by your org owner at /settings/team once the account carries the enterprise_controls entitlement — domain verification and connection activation happen there, not through a separate rollout project.',
            },
            {
              k: 'Directory provisioning',
              v: 'Implemented. SCIM 2.0 user and group provisioning from your IdP, with token issuance and a provisioning event log at /admin/directory-sync, gated on the same enterprise_controls entitlement as SSO.',
            },
            {
              k: 'Audit',
              v: 'Implemented, with a stated limit. Administrative and identity events are recorded to an append-only table that the application role cannot update or delete. An owner or admin reads and filters them at /settings/team and exports the filtered range as JSONL; the export, and any refusal of one, is itself recorded. The limit worth knowing before you buy: coverage is administrative and identity events, not every action in the product, and we will tell you precisely which are captured rather than implying full coverage. There is no SIEM stream yet.',
            },
            {
              k: 'Retention',
              v: 'There is no per-organization retention setting today — retention follows the published platform schedule in the privacy policy. Organization-configurable windows are a contract-scoped commitment, not a shipped control.',
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

        <FinalCta
          eyebrow="Security review"
          title="Bring your security review."
          body="Send us the questionnaire. You will get direct answers, including the ones where the answer is 'not yet' — and you can start evaluating on Local or BYOK immediately, without a contract, a trial, or any data reaching us."
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            { href: '/download', label: 'Get AGI Desktop' },
            { href: '/trust', label: 'See Trust & Compliance' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
