import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Community | AGI Workforce',
  description: 'Where to find us — GitHub for code and issues, email for everything else.',
  alternates: { canonical: 'https://agiworkforce.com/community' },
};

export default function CommunityPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Community.</h1>
          <p className="agi-page-lede">
            We don&rsquo;t run a Discord, a forum, or a Slack workspace yet.{' '}
            <strong>
              Issues, discussions, and PRs happen on GitHub. For everything else, email
              contact@agiworkforce.com.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Where to go</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">GitHub</h3>
              <p className="agi-reason-p">
                Source for the CLI, issues, PRs, discussions. The fastest way to file a bug or ask
                an engineering question.
              </p>
              <a
                href="https://github.com/siddharthanagula3/agiworkforce"
                target="_blank"
                rel="noopener noreferrer"
                className="agi-cta-ghost"
                style={{ marginTop: 4 }}
              >
                Open repo →
              </a>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Email</h3>
              <p className="agi-reason-p">
                contact@agiworkforce.com. A real human reads it. Use this for billing, partnerships,
                press, and anything that isn&rsquo;t a public engineering question.
              </p>
              <a
                href="mailto:contact@agiworkforce.com"
                className="agi-cta-ghost"
                style={{ marginTop: 4 }}
              >
                Email →
              </a>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Twitter / X</h3>
              <p className="agi-reason-p">
                @agiworkforce. We don&rsquo;t reply to support there. We do post when we ship.
              </p>
              <a
                href="https://twitter.com/agiworkforce"
                target="_blank"
                rel="noopener noreferrer"
                className="agi-cta-ghost"
                style={{ marginTop: 4 }}
              >
                Follow →
              </a>
            </li>
          </ul>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
