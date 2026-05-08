import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Careers | AGI Workforce',
  description: 'AGI Automation LLC is small and intentional. We do not have open roles right now.',
  alternates: { canonical: 'https://agiworkforce.com/careers' },
};

export default function CareersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Careers.</h1>
          <p className="agi-page-lede">
            AGI Automation LLC is small and intentional.{' '}
            <strong>We do not have open roles right now.</strong> If that changes we will list them
            here.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">In the meantime</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Use the product</h3>
              <p className="agi-reason-p">
                Best way to get on our radar is to ship something real with AGI Workforce — agents,
                MCP plugins, downstream tooling.
              </p>
              <Link href="/download" className="agi-cta-ghost" style={{ marginTop: 4 }}>
                Install →
              </Link>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Open source</h3>
              <p className="agi-reason-p">The CLI is on GitHub. Issues and PRs welcome.</p>
              <a
                href="https://github.com/siddharthanagula3/agiworkforce"
                target="_blank"
                rel="noopener noreferrer"
                className="agi-cta-ghost"
                style={{ marginTop: 4 }}
              >
                GitHub →
              </a>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Stay in touch</h3>
              <p className="agi-reason-p">Email us. Tell us what you&rsquo;re building.</p>
              <a
                href="mailto:contact@agiworkforce.com"
                className="agi-cta-ghost"
                style={{ marginTop: 4 }}
              >
                Email →
              </a>
            </li>
          </ul>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
