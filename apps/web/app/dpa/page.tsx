import Link from 'next/link';
import type { Metadata } from 'next';
import { FileText, Download, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Data Processing Agreement | AGI Workforce',
  description:
    'AGI Workforce DPA template for GDPR-subject customers. Request a signed DPA from our team.',
  alternates: { canonical: 'https://agiworkforce.com/dpa' },
};

const keyClausesList = [
  {
    title: 'Roles',
    description:
      'AGI Automation LLC acts as Data Processor on behalf of the Customer (Data Controller) for processing activities covered by this DPA.',
  },
  {
    title: 'Sub-processors',
    description:
      "We maintain a list of approved sub-processors at /subprocessors. Customers will be notified of material sub-processor changes with 30 days' notice.",
  },
  {
    title: 'Data transfer mechanism',
    description:
      'For EEA/UK personal data transfers to the United States, we rely on Standard Contractual Clauses (SCCs) as approved by the European Commission.',
  },
  {
    title: 'Security measures',
    description:
      'Encryption at rest (AES-256-GCM), TLS 1.3 in transit, access controls, audit logging, and regular security reviews as detailed at /security.',
  },
  {
    title: 'Retention and deletion',
    description:
      'Customer data is retained per your account settings or contract terms. On account deletion, all personal data is purged within 30 days.',
  },
  {
    title: 'Data subject requests',
    description:
      'We assist Controllers in responding to data subject access, rectification, erasure, and portability requests within legally required timescales.',
  },
];

export default function DpaPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            {/* Disclaimer banner */}
            <div className="mx-auto mb-8 max-w-3xl rounded-md border border-[#555150]/40 bg-[#555150]/10 px-4 py-3 text-sm text-[#888480]">
              <strong className="text-[#edebe8]">Informational document.</strong> This document
              supplements our{' '}
              <Link href="/terms" className="text-[#c8892a] hover:underline">
                /terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-[#c8892a] hover:underline">
                /privacy
              </Link>
              . Last updated: 2026-05-05.
            </div>

            <div className="mx-auto max-w-3xl">
              <div className="mb-6 flex items-center gap-3">
                <FileText className="h-6 w-6 text-[#c8892a]" />
                <h1 className="text-3xl font-bold text-[#edebe8]">Data Processing Agreement</h1>
              </div>

              <p className="mb-4 text-[#888480] leading-relaxed">
                AGI Workforce offers a Data Processing Agreement (DPA) for customers subject to the
                General Data Protection Regulation (GDPR) or similar data protection laws.
              </p>
              <p className="mb-8 text-[#888480] leading-relaxed">
                To execute a DPA, contact us at{' '}
                <a href="mailto:sales@agiworkforce.com" className="text-[#c8892a] hover:underline">
                  sales@agiworkforce.com
                </a>{' '}
                or download the template below. Enterprise customers can request a pre-signed DPA as
                part of their contract.
              </p>

              {/* PDF placeholder */}
              <div className="mb-10 rounded-xl border border-[#1a1917] bg-black/50 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#c8892a]/10 border border-[#c8892a]/20">
                      <Download className="h-5 w-5 text-[#c8892a]" />
                    </div>
                    <div>
                      <div className="font-medium text-[#edebe8]">DPA Template (PDF)</div>
                      <div className="text-xs text-[#555150]">
                        Coming soon. Contact sales to request a copy now.
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full border border-[#555150]/40 px-3 py-1 text-xs text-[#888480]">
                    Coming soon
                  </span>
                </div>
              </div>

              {/* Key clauses */}
              <h2 className="mb-6 text-xl font-semibold text-[#edebe8]">Key clauses summary</h2>
              <div className="space-y-4">
                {keyClausesList.map((clause) => (
                  <div
                    key={clause.title}
                    className="flex items-start gap-4 rounded-xl border border-[#1a1917] bg-[#09090b] p-5"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#c8892a]" />
                    <div>
                      <h3 className="mb-1 font-semibold text-[#edebe8]">{clause.title}</h3>
                      <p className="text-sm text-[#888480]">{clause.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 space-y-4 text-sm text-[#888480]">
                <p>
                  This summary is not a substitute for the full DPA. The executed DPA governs in all
                  cases.
                </p>
                <p>
                  For questions:{' '}
                  <a
                    href="mailto:privacy@agiworkforce.com"
                    className="text-[#c8892a] hover:underline"
                  >
                    privacy@agiworkforce.com
                  </a>
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-4 text-sm">
                <Link href="/subprocessors" className="text-[#c8892a] hover:underline">
                  Sub-processors
                </Link>
                <Link href="/privacy" className="text-[#c8892a] hover:underline">
                  Privacy Policy
                </Link>
                <Link href="/trust" className="text-[#c8892a] hover:underline">
                  Trust Center
                </Link>
                <Link
                  href="/contact-sales"
                  className="inline-flex items-center gap-1 text-[#c8892a] hover:underline"
                >
                  Request signed DPA <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
