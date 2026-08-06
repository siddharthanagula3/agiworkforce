import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { CookiePreferencesButton } from './CookiePreferencesButton';
import { LEGAL_ENTITY, POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Cookie policy',
  description:
    'The cookies AGI actually sets, who controls each one, how long it lasts, and where the consent decision is stored. Analytics is opt-in and fails closed.',
  path: '/cookies',
});

/*
 * COOKIE POLICY
 *
 * The previous version listed three categories and named no cookie, no
 * controller and no duration, and it claimed a CSRF cookie that does not exist:
 * lib/csrf.ts carries the comment "Cookie name reserved for future CSRF
 * implementation: 'csrf-token'" — the actual control is an `x-csrf-token`
 * request header bound to a session. In the EU a cookie policy is expected to
 * name what is set, so the table below does.
 *
 * If you add or remove a cookie, update this table in the same change.
 */

interface CookieRow {
  name: string;
  category: 'Strictly necessary' | 'Analytics';
  controller: string;
  purpose: string;
  duration: string;
}

const COOKIES: CookieRow[] = [
  {
    name: 'Session cookies set by our authentication provider',
    category: 'Strictly necessary',
    controller: 'Clerk, on our behalf',
    purpose:
      'Keeps you signed in and lets server routes identify you. Without these you cannot use an account.',
    duration: 'Session and short-lived refresh cookies, managed by the provider.',
  },
  {
    name: '__Host-anon-session-id',
    category: 'Strictly necessary',
    controller: LEGAL_ENTITY,
    purpose:
      'Identifies a signed-out browser so rate limits and request-integrity checks can be applied without an account. The __Host- prefix means the browser refuses to set it from JavaScript or from another subdomain.',
    duration: 'Until the browsing session ends or you clear cookies.',
  },
  {
    name: 'agiworkforce-language',
    category: 'Strictly necessary',
    controller: LEGAL_ENTITY,
    purpose:
      'Remembers your chosen interface language so the server renders the same locale you saw last time.',
    duration: '1 year.',
  },
  {
    name: '_ga and _ga_*',
    category: 'Analytics',
    controller: 'Google',
    purpose:
      'Google Analytics page-view and session measurement. These are set only after you opt in, and are not set at all until then.',
    duration: 'Up to 2 years, set by Google.',
  },
];

export default function CookiesPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Cookies.</h1>
          <p className="agi-page-lede">
            We use the minimum needed to keep you signed in and the site functional.{' '}
            <strong>
              No advertising cookies, ever. Analytics is opt-in and the consent check fails closed —
              if we cannot read your choice, analytics stays off.
            </strong>{' '}
            Last updated: {POLICY_LAST_UPDATED.cookies}.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">What we set</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Cookie</th>
                <th>Category</th>
                <th>Purpose</th>
                <th>Set by / duration</th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map((row) => (
                <tr key={row.name}>
                  <td style={{ width: '26%', verticalAlign: 'top' }}>
                    <code>{row.name}</code>
                  </td>
                  <td style={{ width: '14%', verticalAlign: 'top' }}>{row.category}</td>
                  <td style={{ verticalAlign: 'top' }}>{row.purpose}</td>
                  <td style={{ width: '20%', color: 'var(--agi-ink-quiet)' }}>
                    {row.controller}
                    <br />
                    {row.duration}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            We set no advertising or cross-site tracking cookies, and we do not sell or share
            personal information for cross-context behavioural advertising.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Two things people usually get told wrong</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">There is no CSRF cookie</h3>
              <p className="agi-reason-p">
                Our cross-site request protection is a token carried in a request header and bound
                to your session, not a cookie. Earlier versions of this page listed a &ldquo;CSRF
                token&rdquo; cookie. Nothing set one, so it is gone.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Your consent choice is not stored in a cookie</h3>
              <p className="agi-reason-p">
                It is stored in your browser&rsquo;s local storage under the key{' '}
                <code>cookie-consent</code>, on your device only. It is never sent to us. Clearing
                site data resets it to the default, which is analytics off.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Your choices</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            <CookiePreferencesButton /> at any time — analytics stays off until you turn it on, and
            switching it back off stops it loading on your next page view. You can also manage
            cookies through your browser; clearing them will sign you out of any active session. For
            data export or deletion, see the{' '}
            <Link href="/privacy" style={{ color: 'var(--agi-ink)' }}>
              privacy policy
            </Link>
            .
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/privacy" className="agi-cta-ghost">
              Privacy &rarr;
            </Link>
            <Link href="/subprocessors" className="agi-cta-ghost">
              Subprocessors &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
