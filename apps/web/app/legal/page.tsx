import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export const metadata = buildMetadata({
  title: 'Legal',
  description:
    'Index of legal documents: terms, privacy, DPA, SLA, subprocessors, refund policy, accessibility, and trust posture.',
  path: '/legal',
});

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
  // Both of these were published and reachable, but only from the sitemap or a
  // cross-link buried inside another policy. A procurement reviewer starts here,
  // so every published legal document has to be listed here.
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
];

export default function LegalPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Legal.</h1>
          <p className="agi-page-lede">
            The full set of legal and trust documents for AGI.{' '}
            <strong>
              We claim only what we have completed. Anything else is on the roadmap with no date
              until there&rsquo;s a date.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Documents</p>
          <table className="agi-ledger">
            <tbody>
              {DOCS.map((d) => (
                <tr key={d.href}>
                  <td style={{ width: '28%' }}>
                    <Link href={d.href} style={{ color: 'var(--agi-ink)', fontWeight: 600 }}>
                      {d.label}
                    </Link>
                  </td>
                  <td>{d.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
