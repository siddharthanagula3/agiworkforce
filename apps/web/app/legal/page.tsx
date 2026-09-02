import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Legal',
  description:
    'Index of legal documents: terms, privacy, DPA, SLA, subprocessors, refund policy, accessibility, and trust posture.',
  path: '/legal',
});

const REVISED: Readonly<Record<string, string>> = Object.fromEntries(
  (Object.keys(CANONICAL_POLICY_ROUTES) as (keyof typeof CANONICAL_POLICY_ROUTES)[])
    .filter((key) => key in POLICY_LAST_UPDATED)
    .map((key) => [
      CANONICAL_POLICY_ROUTES[key],
      POLICY_LAST_UPDATED[key as keyof typeof POLICY_LAST_UPDATED],
    ]),
);

const DOCS: { href: string; label: string; body: string }[] = [
  {
    href: '/terms',
    label: 'Terms of service',
    body: 'License terms, user responsibilities, usage policies.',
  },
  {
    href: '/privacy',
    label: 'Privacy policy',
    body: 'How we collect, use, and protect your data.',
  },
  {
    href: '/acceptable-use',
    label: 'Acceptable use policy',
    body: 'Prohibited uses, automated-access limits, and what happens on a violation.',
  },
  {
    href: '/disclaimer',
    label: 'Disclaimer',
    body: 'Accuracy limits of model output, why it is not professional advice, and third-party providers.',
  },
  {
    href: '/agent-permissions',
    label: 'Agent permissions',
    body: 'What the agent may do without asking, what always requires approval, and how to revoke access.',
  },
  {
    href: '/dpa',
    label: 'Data processing agreement',
    body: 'For customers handling EU/UK personal data.',
  },
  {
    href: '/sla',
    label: 'Service level agreement',
    body: 'Uptime targets and response-time commitments.',
  },
  {
    href: '/subprocessors',
    label: 'Subprocessors',
    body: 'Third parties that process customer data on our behalf.',
  },
  { href: '/cookies', label: 'Cookie policy', body: 'What cookies we set and why.' },
  {
    href: '/copyright',
    label: 'Copyright and IP complaints',
    body: 'How to report infringing material, what a complete notice needs, and how to counter-notify.',
  },
  {
    href: '/model-licenses',
    label: 'Model licences',
    body: 'Licence terms for every model this product can route to, generated from the model registry.',
  },
  {
    href: '/refund-policy',
    label: 'Refund policy',
    body: 'When refunds are issued and how to request one.',
  },
  { href: '/accessibility', label: 'Accessibility', body: 'WCAG 2.1 AA stance and known gaps.' },
  {
    href: '/trust',
    label: 'Trust posture',
    body: 'Compliance, audits, and security claims with honest dates.',
  },
  {
    href: '/security',
    label: 'Security',
    body: 'Operational posture across the trust boundaries, plus the coordinated vulnerability disclosure policy: scope, safe harbour, and response targets.',
  },
  {
    href: '/legal/eu-representative',
    label: 'EU representative',
    body: 'Our position under GDPR Art. 27, stated plainly rather than deferred to a launch.',
  },
  {
    href: '/mobile/legal',
    label: 'Mobile app terms and privacy',
    body: 'Surface-specific terms for AGI Mobile on iOS and Android, including platform disclosures. The documents above govern where they overlap.',
  },
  {
    href: '/data-use',
    label: 'How we use your data',
    body: 'Plain-English answers to the questions people actually ask: training, who can read your chats, selling, retention, deletion, residency, each linking to the section of the privacy policy that governs it.',
  },
  {
    href: '/privacy/india',
    label: 'India: DPDP notice',
    body: 'The itemised notice under the Digital Personal Data Protection Act, 2023: what is collected, for which purpose, who it is shared with, your rights as a Data Principal, and the grievance contact.',
  },
  {
    href: '/privacy/requests',
    label: 'Data rights and consent',
    body: 'Exercise access, correction, erasure and withdrawal, and see or change the consent recorded against your account.',
  },
];

function docRows(): LedgerRow[] {
  return DOCS.map((d) => ({
    label: d.label,
    value: (
      <>
        <Link href={d.href} className="agi-ds-link">
          {d.href}
        </Link>{' '}
        &middot; {d.body}
        {REVISED[d.href] ? (
          <>
            {' '}
            &middot; <span style={{ color: 'var(--agi-ink-2)' }}>Revised {REVISED[d.href]}</span>
          </>
        ) : null}
      </>
    ),
  }));
}

export default function LegalPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-legal-title"
          eyebrow="Legal"
          title="Legal."
          lede="The full set of legal and trust documents for AGI. We claim only what we have completed. Anything else is on the roadmap with no date until there's a date."
          ctas={[]}
        />

        <Section id="documents" labelledBy="agi-legal-documents-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-legal-documents-title">
              Documents.
            </h2>
            <Ledger caption="Legal documents" rows={docRows()} />
            <Prose size="sm">
              Dates come from the same constant each document prints at the top of itself, so this
              column cannot claim a revision the document does not. Where a document carries no date
              in that constant, no revision is shown.
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
