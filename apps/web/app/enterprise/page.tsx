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
const STATUS_AS_OF = '5 August 2026';

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

          The remaining identity/audit rows are scoped as contract commitments in
          progress, not as features you can switch on today, and the section
          carries a visible status date. CROSS-WORKFLOW DEPENDENCY: the SSO,
          directory-sync and audit-logging implementations are owned by a
          concurrent workstream; this wording must be reconciled with whatever
          that work actually lands before any of it is described as available.
        */}
        <LedgerSection
          eyebrow="What an enterprise contract covers"
          title="Scoped on a contract, stated without inflation."
          rows={[
            {
              k: 'Status',
              v: `Reviewed ${STATUS_AS_OF}. Enterprise controls are being built and are scoped per contract. Nothing below is a self-serve toggle you can enable today — treat each as a commitment we make in writing, with dates, during procurement.`,
            },
            {
              k: 'SSO',
              v: 'SAML 2.0 and OIDC single sign-on, scoped and dated in your contract. Ask us for current implementation status before you plan a rollout around it.',
            },
            {
              k: 'Directory provisioning',
              v: 'SCIM user and group provisioning from your IdP, scoped and dated in your contract.',
            },
            {
              k: 'Audit',
              v: 'Administrative and session audit records with export, scoped in your contract. We will tell you precisely which events are captured today rather than implying full coverage.',
            },
            {
              k: 'Retention',
              v: 'There is no per-organization retention setting today — retention follows the published platform schedule in the privacy policy. Organization-configurable windows are a contract-scoped commitment, not a shipped control.',
            },
            {
              k: 'BYOK enforcement',
              v: 'The strongest control available today, and it needs no feature work from us: run the org on your own provider keys, or fully local, and no conversation content reaches AGI infrastructure at all.',
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

        <LedgerSection
          eyebrow={`Compliance posture as of ${STATUS_AS_OF}`}
          title="We claim only what is complete."
          rows={[
            {
              k: 'SOC 2 Type II',
              v: 'Planned. No audit report claimed. Evidence collection is part of the Cloud release path.',
            },
            { k: 'GDPR', v: 'In progress. Standard DPA available on request.' },
            {
              k: 'CCPA',
              v: 'In progress. Export and deletion paths are being verified before broad Cloud launch.',
            },
            { k: 'HIPAA', v: 'Not available. AGI does not offer HIPAA-covered workflows today.' },
            { k: 'ISO 27001', v: 'On the roadmap. No date claimed.' },
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
