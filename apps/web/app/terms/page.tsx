import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Terms of service | AGI Workforce',
  description:
    'Terms of service for AGI Workforce — license, account responsibilities, payment, termination.',
  alternates: { canonical: 'https://agiworkforce.com/terms' },
};

export default function TermsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Terms of service.</h1>
          <p className="agi-page-lede">
            These terms govern your use of AGI Workforce.{' '}
            <strong>
              Plain language summary at top, formal terms below. By installing the software or
              creating an account you accept these terms.
            </strong>{' '}
            Last updated: 2026-05-08.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">01 — License</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI Automation LLC grants you a non-exclusive, non-transferable, revocable license to
            install and use AGI Workforce on devices you own or control, subject to these terms. The
            software is proprietary; you may not redistribute, decompile, or reverse-engineer it
            except as permitted by applicable law.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">02 — Your account</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            You are responsible for keeping your account credentials and master password secure. We
            cannot recover the master password used to encrypt your local key vault — see the{' '}
            <Link href="/byok" style={{ color: 'var(--agi-ink)' }}>
              BYOK posture
            </Link>
            . You are responsible for the activity that occurs through your account.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">03 — Payment, refunds, and changes</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Paid tiers (Hobby and above) are billed in advance through Stripe. You can cancel any
            time. Refund terms are at{' '}
            <Link href="/refund-policy" style={{ color: 'var(--agi-ink)' }}>
              /refund-policy
            </Link>
            . We may change pricing with 30 days&rsquo; notice; existing annual subscriptions retain
            their original price through the end of the term.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">04 — Acceptable use</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Don&rsquo;t use AGI Workforce to break the law, harass people, generate child sexual
            abuse material, or build weapons. Don&rsquo;t reverse-engineer or stress-test the
            service without our written consent. We reserve the right to suspend accounts that
            violate this section.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">05 — BYOK and provider terms</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            When you bring your own API key (BYOK) for any provider — Anthropic, OpenAI, Google,
            etc. — your use of that provider is governed by <em>their</em> terms, not ours. Provider
            charges go directly from you to them; we add zero markup and do not process those
            payments.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">06 — Termination</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            You can terminate at any time by deleting your account. We may terminate or suspend
            access for material breach of these terms, with notice where reasonable. Sections that
            by their nature should survive (license, IP, liability, governing law) survive
            termination.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">07 — Warranties and liability</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI Workforce is provided &ldquo;as is.&rdquo; We disclaim implied warranties to the
            maximum extent permitted by law. To the fullest extent permitted, our aggregate
            liability is limited to the fees you paid in the 12 months preceding the claim, or $100
            USD, whichever is greater. We are not liable for loss of profits, data, or consequential
            damages.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">08 — Governing law and disputes</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            These terms are governed by the laws of the State of Texas, USA, without regard to
            conflict-of-laws principles. Any dispute will be resolved in the state or federal courts
            located in Travis County, Texas, unless your jurisdiction&rsquo;s law requires
            otherwise.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">09 — Changes to these terms</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            We may update these terms with notice posted on this page. Material changes will be
            announced via email and via{' '}
            <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              /changelog
            </Link>
            . Continued use after changes means you accept them.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">10 — Contact</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI Automation LLC, Austin, Texas, USA. Email{' '}
            <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
              contact@agiworkforce.com
            </a>{' '}
            for any questions about these terms.
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/privacy" className="agi-cta-ghost">
              Privacy →
            </Link>
            <Link href="/dpa" className="agi-cta-ghost">
              DPA →
            </Link>
            <Link href="/refund-policy" className="agi-cta-ghost">
              Refunds →
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
