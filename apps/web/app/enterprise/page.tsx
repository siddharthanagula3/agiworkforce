import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { LedgerSection } from '@/features/marketing/components/LandingSections';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';

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

export default function EnterprisePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI for enterprise"
          titleLines={['Pass the security review', 'before you spend anything.']}
          em="before you spend anything."
          lede="Most AI tools require you to accept their data boundary to evaluate them at all. AGI does not: run it fully local, or on your own provider keys, and no conversation content reaches our infrastructure — so the hardest question in your review is answered by architecture rather than by a promise. Identity, audit, and retention are administered by your own workspace owner, and this page states plainly which controls are built and which are commitments."
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
          Every control row below must match shipped code, in both directions:
          never name a control we do not offer, and never call a shipped,
          entitlement-gated control "roadmap". There is NO data-residency or
          region-pinning mechanism, so those rows stay cut. SSO/OIDC, SCIM
          directory sync, org audit read + JSONL export, and per-workspace
          retention are live, gated on the `enterprise_controls` /
          `audit_export` capabilities; retention enforcement is opt-in per
          workspace and fails closed, so do not restore "you set them" phrasing
          that implied it is unconditional. The four-hour SLA is a PLANNED
          target on /sla, not a binding promise — defer to /sla rather than
          restating it. Re-verify each row against the code before editing.
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
