import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { LedgerSection } from '@/features/marketing/components/LandingSections';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Enterprise: controls your security team needs',
  description:
    'SSO, SCIM, audit export, custom retention, BYOK enforcement, and a named support contact. Scoped on a contract, with compliance status reported honestly.',
  path: '/enterprise',
});

export default function EnterprisePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI for enterprise"
          titleLines={['The same product.', 'Enterprise controls.']}
          em="Enterprise controls."
          lede="SSO, SCIM provisioning, audit export, retention windows, and org-wide BYOK enforcement. Scoped on a contract that names you. Compliance status reported honestly. Local and BYOK adoption can start before any managed compute spend exists."
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            { href: '/trust', label: 'See Trust & Compliance' },
            { href: '/byok', label: 'Read the BYOK Posture' },
          ]}
          modeRibbon={['Local · on-device', 'BYOK · enforceable', 'Cloud · public alpha']}
        />

        <LedgerSection
          eyebrow="What an enterprise contract covers"
          title="The controls, named one by one."
          rows={[
            {
              k: 'SSO',
              v: 'SAML 2.0 and OIDC. Okta, Azure AD, Google Workspace. Scoped per contract.',
            },
            {
              k: 'SCIM',
              v: 'User and group provisioning from your IdP, scoped per contract.',
            },
            {
              k: 'Audit',
              v: 'Provider labels, tool approvals, and session records, with export scoped to your review.',
            },
            {
              k: 'Retention',
              v: 'Org-level retention windows. You set them.',
            },
            {
              k: 'BYOK enforcement',
              v: 'Require BYOK across the org. Zero managed-cloud spend unless you opt in.',
            },
            {
              k: 'Residency',
              v: 'United States by default. EU on the roadmap; custom regions by contract.',
            },
            {
              k: 'SLA',
              v: 'Four-hour response target with a named support contact.',
            },
            {
              k: 'MSA',
              v: 'We negotiate against your procurement. No forced click-through.',
            },
          ]}
        />

        <LedgerSection
          eyebrow="Compliance posture, honest as of today"
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
          eyebrow={LAUNCH.publicLabel}
          title="Bring your security review."
          body="A real human answers, on a real contract. Evaluate Local, BYOK, and public-alpha managed cloud today. Enterprise controls (org seats, SSO, admin) are rolling out — request access."
          ctas={[
            { href: '/contact-sales', label: 'Contact Sales' },
            { href: '/download', label: 'Get notified' },
            { label: 'Request Enterprise Access', waitlist: true },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
