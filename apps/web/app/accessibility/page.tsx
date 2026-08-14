import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export const metadata = buildMetadata({
  title: 'Accessibility',
  description:
    'How AGI supports accessibility · keyboard, screen-reader, prefers-reduced-motion, contrast.',
  path: '/accessibility',
});

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
              barrier, email contact@agiworkforce.com · we treat it as a P0.
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
                  A skip-link is mounted on every page, and keyboard reachability is a requirement
                  we hold new interactive components to. We have <em>not</em> completed a
                  keyboard-operability audit across all six surfaces and hold no VPAT, so we do not
                  claim every element passes &mdash; if you find one that does not, it is a bug and
                  we will treat it as one.
                </td>
              </tr>
              <tr>
                <td>Screen reader</td>
                <td>
                  Semantic HTML · landmarks, headings in order, lists, labelled controls. ARIA
                  labels where semantics aren&rsquo;t enough. Verified by automated scan on the
                  routes listed below, not by testing with an actual screen reader on every page.
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
                  surface, in both light and dark schemes, on the routes listed below. Tertiary copy
                  meets large-text AA.
                </td>
              </tr>
              <tr>
                <td>Focus</td>
                <td>
                  Visible focus rings are the house rule and <code>outline: none</code> is not used
                  without an explicit replacement. As with keyboard operability above, that is a
                  standard we hold components to rather than a per-element audit result &mdash; we
                  do not claim every element on every route has been checked.
                </td>
              </tr>
            </tbody>
          </table>

          <p className="agi-page-lede" style={{ marginTop: 24, fontSize: 14 }}>
            <strong>The evidence behind those rows, and its limits.</strong> An automated axe scan
            runs against WCAG 2.0 A/AA and 2.1 A/AA and currently reports{' '}
            <strong>zero violations</strong>. Its scope is five routes &mdash; the home page, the
            chat app, pricing, a feature page and the download page &mdash; each in both light and
            dark colour schemes. That is the whole basis for the conformance rows above, so read
            them as covering those routes rather than all of the site.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            Two limits worth stating rather than leaving you to infer. Automated tooling catches a
            minority of WCAG criteria &mdash; it finds a missing label and cannot tell you whether a
            heading makes sense or a focus order is logical, which is why the keyboard and focus
            rows above describe a standard we hold components to rather than an audit result. And
            the scan covers five routes out of well over a hundred. We hold no VPAT and have
            commissioned no third-party accessibility audit; if either changes, this section says so
            on the same day.
          </p>
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
