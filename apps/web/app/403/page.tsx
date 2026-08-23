import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Access denied',
  description: 'You are signed in, but this account does not have access to this page.',
  path: '/403',
  robots: { index: false, follow: false },
});

export default function ForbiddenPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">403</p>
          <h1 className="agi-page-h1">You don&rsquo;t have access to this.</h1>
          <p className="agi-page-lede">
            You are signed in, but this account is not permitted to open this page. Signing in again
            will not change that.
          </p>
        </section>

        <section className="agi-page-section">
          <h2 className="agi-section-h2">Why you might be seeing this</h2>
          <p className="agi-page-p">
            The page belongs to a workspace you are not a member of, it needs a role your account
            does not hold, or it is limited to a plan this account is not on. If you have more than
            one account, you may be signed in as the wrong one.
          </p>
        </section>

        <section className="agi-page-section">
          <h2 className="agi-section-h2">What to do</h2>
          <p className="agi-page-p">
            If a teammate sent you the link, ask them to grant access from their workspace{' '}
            <Link className="agi-link" href="/settings/team">
              Team settings
            </Link>
            . If this is a plan limit, the{' '}
            <Link className="agi-link" href="/pricing">
              pricing page
            </Link>{' '}
            lists what each plan includes. Otherwise write to{' '}
            <a className="agi-link" href={contactMailto('Access request')}>
              {CONTACT_EMAIL}
            </a>{' '}
            with the address you tried to open.
          </p>
          <p className="agi-page-p">
            <Link className="agi-link" href="/chat">
              Back to your workspace
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
