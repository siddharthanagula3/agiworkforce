import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Accessibility | AGI Workforce',
  description:
    'How AGI Workforce supports accessibility — keyboard, screen-reader, prefers-reduced-motion, contrast.',
  alternates: { canonical: 'https://agiworkforce.com/accessibility' },
};

export default function AccessibilityPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Accessibility.</h1>
          <p className="agi-page-lede">
            We aim for WCAG 2.1 AA across the web app and the marketing site.{' '}
            <strong>
              Below is what we&rsquo;ve done, what is in flight, and the known gaps. If you hit a
              barrier, email contact@agiworkforce.com — we treat it as a P0.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">What we&rsquo;ve done</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Keyboard</td>
                <td>
                  Every interactive element is reachable and operable from the keyboard. Skip-link
                  at the top of each page.
                </td>
              </tr>
              <tr>
                <td>Screen reader</td>
                <td>
                  Semantic HTML throughout — landmarks, headings in order, lists, labelled controls.
                  ARIA labels where semantics aren&rsquo;t enough.
                </td>
              </tr>
              <tr>
                <td>Reduced motion</td>
                <td>
                  <code>prefers-reduced-motion: reduce</code> short-circuits decorative animations
                  site-wide.
                </td>
              </tr>
              <tr>
                <td>Contrast</td>
                <td>
                  Body text and primary UI surfaces meet AA contrast against the warm-near-black
                  surface. Tertiary copy meets large-text AA.
                </td>
              </tr>
              <tr>
                <td>Focus</td>
                <td>
                  Visible focus rings on every interactive element. No <code>outline: none</code>{' '}
                  without an explicit replacement.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Known gaps</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Live transcripts</h3>
              <p className="agi-reason-p">
                Voice features in the desktop app do not yet ship live transcripts. Tracking it as a
                P1.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Color-only signals</h3>
              <p className="agi-reason-p">
                A handful of status badges still rely on color alone. We&rsquo;re adding text labels
                where this is the case.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Long forms</h3>
              <p className="agi-reason-p">
                A few legacy forms have inconsistent error-summary placement. We&rsquo;re
                standardizing on a top-of-form summary.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Report a barrier</p>
          <div className="agi-cta-row">
            <a href="mailto:contact@agiworkforce.com" className="agi-cta-primary">
              Email contact@agiworkforce.com
            </a>
            <Link href="/security" className="agi-cta-ghost">
              Security posture →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
