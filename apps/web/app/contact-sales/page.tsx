import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export const metadata = buildMetadata({
  title: 'Contact sales',
  description:
    'Reach a real human about AGI Enterprise readiness, security review needs, account rollout, and managed cloud access.',
  path: '/contact-sales',
});

export default function ContactSalesPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Talk to sales.</h1>
          <p className="agi-page-lede">
            One human, one inbox.{' '}
            <strong>
              Email contact@agiworkforce.com with what you&rsquo;re trying to do, how big your team
              is, and what your security review needs.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">What to include</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Your shape</h3>
              <p className="agi-reason-p">
                Team size, surfaces (desktop, mobile, web, CLI, extensions), data residency
                requirements.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Your security review</h3>
              <p className="agi-reason-p">
                Which controls matter first? SSO and SCIM provisioning are implemented and
                configured by your org owner; audit capture is in place but extracts are supplied
                under contract; neither per-organization retention windows
                nor org-wide BYOK enforcement is shipped, and both are handled under contract. The{' '}
                <Link className="agi-link" href="/enterprise">
                  Enterprise page
                </Link>{' '}
                states which is which, row by row.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Your timeline</h3>
              <p className="agi-reason-p">
                When do you want to be live, and what blockers do you anticipate from procurement or
                compliance?
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Reach us</p>
          <div className="agi-cta-row">
            <a href="mailto:contact@agiworkforce.com" className="agi-cta-primary">
              Email contact@agiworkforce.com
            </a>
            <Link href="/enterprise" className="agi-cta-ghost">
              See what Enterprise includes →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
