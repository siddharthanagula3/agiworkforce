import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Legal | AGI Workforce',
  description:
    'Index of legal documents — terms, privacy, DPA, SLA, subprocessors, refund policy, accessibility, and trust posture.',
  alternates: { canonical: 'https://agiworkforce.com/legal' },
};

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
    body: 'Operational details — encryption, sandboxing, audit trails.',
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
            The full set of legal and trust documents for AGI Workforce.{' '}
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
