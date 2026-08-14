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
 * 2026-08-14 — completed against an enumeration of the code rather than memory.
 * A `grep` for `document.cookie`, `cookies().set`, `localStorage.setItem` and
 * `sessionStorage.setItem` across apps/web found the published table was short
 * by two cookies and silent about roughly fifteen storage keys, several of
 * which hold an identifier or a credential. Under the ePrivacy rules and the
 * DPDP notice obligation the question is "what does this site store on my
 * device", not "what does it store in a file called a cookie", so local and
 * session storage are now disclosed in the same detail.
 *
 * Two claims were checked and deliberately WRITTEN NARROWLY rather than dropped
 * or widened:
 *  - Stripe. `@stripe/stripe-js` is a real dependency and `loadStripe()` is
 *    called at features/billing/services/stripe-payments.ts:400 — but it is
 *    called INSIDE the payment-confirmation path, not at page load. So Stripe's
 *    cookies appear when you confirm a payment, and not from browsing. The row
 *    says exactly that. Do not upgrade it to "on every page"; do not delete it.
 *  - `__Host-anon-session-id` previously said "until the browsing session
 *    ends". lib/csrf.ts:276 sets `Max-Age=86400`, so it is 24 hours.
 *
 * IF YOU ADD A COOKIE OR A STORAGE KEY, ADD IT HERE IN THE SAME CHANGE.
 * The enumeration that built these tables is:
 *   grep -rn "document\.cookie\s*=\|cookies()\.set\|localStorage\.setItem\|sessionStorage\.setItem" \
 *     apps/web/{app,lib,shared,features} --include="*.ts" --include="*.tsx"
 */

interface CookieRow {
  name: string;
  category: 'Strictly necessary' | 'Functional' | 'Analytics' | 'Payment';
  controller: string;
  purpose: string;
  duration: string;
  /** Where in this repository the cookie is set. Keeps the table checkable. */
  source: string;
}

const COOKIES: CookieRow[] = [
  {
    name: 'Session cookies set by our authentication provider',
    category: 'Strictly necessary',
    controller: 'Clerk, on our behalf',
    purpose:
      'Keeps you signed in and lets server routes identify you. Without these you cannot use an account.',
    duration: 'Session and short-lived refresh cookies, managed by the provider.',
    source: 'app/layout.tsx (ClerkProvider)',
  },
  {
    name: '__Host-anon-session-id',
    category: 'Strictly necessary',
    controller: LEGAL_ENTITY,
    purpose:
      'Identifies a signed-out browser so rate limits and request-integrity checks can be applied without an account. HttpOnly, Secure and SameSite=Strict, and the __Host- prefix means the browser refuses to set it from JavaScript or from another subdomain.',
    duration: '24 hours.',
    source: 'lib/csrf.ts',
  },
  {
    name: 'agiworkforce-language',
    category: 'Strictly necessary',
    controller: LEGAL_ENTITY,
    purpose:
      'Remembers your chosen interface language so the server renders the same locale you saw last time.',
    duration: '1 year.',
    source: 'app/i18n/index.ts',
  },
  {
    name: 'sidebar:state',
    category: 'Functional',
    controller: LEGAL_ENTITY,
    purpose:
      'Remembers whether you left the sidebar open or collapsed, so the first render matches what you last chose instead of flashing to a default. Holds "true" or "false" and nothing else — no identifier.',
    duration: '7 days.',
    source: 'shared/ui/sidebar.tsx',
  },
  {
    name: '_ga and _ga_*',
    category: 'Analytics',
    controller: 'Google',
    purpose:
      'Google Analytics page-view and session measurement. These are set only after you opt in, and are not set at all until then.',
    duration: 'Up to 2 years, set by Google.',
    source: 'shared/components/AnalyticsConsentGate.tsx',
  },
  {
    name: '__stripe_mid, __stripe_sid',
    category: 'Payment',
    controller: 'Stripe',
    purpose:
      'Fraud prevention on card payments. Set by Stripe when their payment script loads, which happens only at the moment you confirm a payment — not while you browse, and not on the pricing page. If you never pay, they are never set.',
    duration: 'Up to 1 year (mid) and 30 minutes (sid), set by Stripe.',
    source: 'features/billing/services/stripe-payments.ts',
  },
];

/**
 * Local and session storage.
 *
 * Not cookies, and disclosed anyway. The rule that matters to a reader is what
 * this site puts on their device, and several of these hold more than a
 * preference. Sorted so the ones carrying an identifier or a credential come
 * first, because those are the rows someone is actually looking for.
 */
interface StorageRow {
  key: string;
  store: 'Local storage' | 'Session storage';
  holds: string;
  clearedBy: string;
  source: string;
}

const STORAGE: StorageRow[] = [
  {
    key: 'auth_token, refresh_token',
    store: 'Local storage',
    holds:
      'Your API session credentials, encrypted before they are written. They authenticate you to our API from the browser.',
    clearedBy: 'Signing out, or clearing site data.',
    source: 'shared/lib/api.ts',
  },
  {
    key: 'user_id',
    store: 'Local storage',
    holds:
      'Your account identifier, so a crash report can be tied to a session. Written by the error-reporting wrapper. It is an identifier, which is why it is listed first rather than buried.',
    clearedBy: 'Signing out, or clearing site data.',
    source: 'shared/lib/sentry.ts',
  },
  {
    key: 'agi_secure_key',
    store: 'Local storage',
    holds:
      'A marker that a browser-held encryption key exists for this session. Not the key itself — the key material is non-extractable and held by the browser.',
    clearedBy: 'Clearing site data.',
    source: 'shared/lib/security.ts',
  },
  {
    key: 'cookie-consent',
    store: 'Local storage',
    holds:
      'Your analytics choice. Never sent to us. Anything unreadable counts as no decision, which means analytics stays off.',
    clearedBy: 'Clearing site data, which resets you to analytics off.',
    source: 'shared/lib/cookie-consent.ts',
  },
  {
    key: 'agi.privacy.shareTelemetry',
    store: 'Local storage',
    holds:
      'A device-local mirror of your error-reporting preference, so the choice applies before the server answers. Off unless you turn it on.',
    clearedBy: 'Clearing site data.',
    source: 'lib/sentry-shared.ts',
  },
  {
    key: 'agi-artifacts-store',
    store: 'Local storage',
    holds:
      'Artifacts you have open, cached so they survive a reload. This can contain content you generated.',
    clearedBy: 'Clearing site data.',
    source: 'features/chat/stores/artifacts-store.ts',
  },
  {
    key: 'agi_last_activity',
    store: 'Local storage',
    holds: 'A timestamp of your last interaction, used to time out an idle session.',
    clearedBy: 'Signing out, or clearing site data.',
    source: 'shared/hooks/useSessionTimeout.ts',
  },
  {
    key: 'theme, theme-preference',
    store: 'Local storage',
    holds:
      'Light, dark or system. Read before first paint so the page does not flash the wrong theme.',
    clearedBy: 'Clearing site data.',
    source: 'public/theme-init.js',
  },
  {
    key: 'agiworkforce-language',
    store: 'Local storage',
    holds: 'The same locale choice as the cookie above, cached for the client.',
    clearedBy: 'Clearing site data.',
    source: 'app/i18n/index.ts',
  },
  {
    key: 'agi:tts-voice-uri',
    store: 'Local storage',
    holds: 'Which system voice you picked for read-aloud.',
    clearedBy: 'Clearing site data.',
    source: 'lib/hooks/useTTS.ts',
  },
  {
    key: 'agw_onboarding_progress, help-tour-completed',
    store: 'Local storage',
    holds: 'Which onboarding steps and product tours you have finished, so they stop reappearing.',
    clearedBy: 'Clearing site data.',
    source: 'shared/components/dashboard/WelcomeBanner.tsx, features/chat/hooks/useHelpTour.ts',
  },
  {
    key: 'agi.terms-accepted-version',
    store: 'Session storage',
    holds:
      'The revision of the terms you ticked, so signing in with a provider that leaves the page and returns does not lose the click. It is consumed once the account records your acceptance.',
    clearedBy: 'Closing the tab, or completing sign-up.',
    source: 'app/signup/TermsGate.tsx',
  },
  {
    key: 'agi.team.invitation-token',
    store: 'Session storage',
    holds:
      'An invitation token carried across the sign-in redirect so the invite still applies when you land back.',
    clearedBy: 'Closing the tab, or accepting the invitation.',
    source: 'features/teams/components/TeamInvitationAcceptance.tsx',
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
          <p className="agi-section-eyebrow">01 &middot; Cookies we set</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Every cookie this site sets, including the two third parties that set their own. The
            last column names the file that sets it, so you can check this table against the code
            rather than take our word for it.
          </p>
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
                  <td style={{ width: '22%', verticalAlign: 'top' }}>
                    <code>{row.name}</code>
                    <br />
                    <span style={{ color: 'var(--agi-ink-quiet)', fontSize: 12 }}>
                      {row.source}
                    </span>
                  </td>
                  <td style={{ width: '13%', verticalAlign: 'top' }}>{row.category}</td>
                  <td style={{ verticalAlign: 'top' }}>{row.purpose}</td>
                  <td style={{ width: '18%', color: 'var(--agi-ink-quiet)', verticalAlign: 'top' }}>
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
            personal information for cross-context behavioural advertising. Only the analytics row
            needs your consent; the rest are necessary to keep you signed in, keep the site
            functional, or complete a payment you asked for.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">02 &middot; What else we put on your device</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            <strong>
              A cookie policy that only lists cookies is answering a narrower question than the one
              you asked.
            </strong>{' '}
            Most of what this product stores on your device is in local or session storage, not
            cookies &mdash; including your session credentials. None of it is a tracking technology
            and none of it is shared, but you should be able to see it, so here it is in full. The
            ones that carry an identifier or a credential are listed first.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Key</th>
                <th>Where</th>
                <th>What it holds</th>
                <th>Cleared by</th>
              </tr>
            </thead>
            <tbody>
              {STORAGE.map((row) => (
                <tr key={row.key}>
                  <td style={{ width: '22%', verticalAlign: 'top' }}>
                    <code>{row.key}</code>
                    <br />
                    <span style={{ color: 'var(--agi-ink-quiet)', fontSize: 12 }}>
                      {row.source}
                    </span>
                  </td>
                  <td style={{ width: '12%', verticalAlign: 'top' }}>{row.store}</td>
                  <td style={{ verticalAlign: 'top' }}>{row.holds}</td>
                  <td style={{ width: '18%', color: 'var(--agi-ink-quiet)', verticalAlign: 'top' }}>
                    {row.clearedBy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            Local storage survives closing the browser; session storage does not. Clearing site data
            in your browser removes both, and will sign you out.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">
            03 &middot; Two things people usually get told wrong
          </p>
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
          <p className="agi-section-eyebrow">04 &middot; Do Not Track and Global Privacy Control</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            <strong>We do not read either signal today.</strong> Browsers can send a Do Not Track
            header or a Global Privacy Control signal, and nothing in this product currently checks
            for them. We are stating that plainly rather than leaving you to assume one way or the
            other, because a site that silently ignores GPC while implying otherwise is worse than
            one that says so.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            What this does and does not cost you: analytics is opt-in here regardless, so a browser
            sending GPC already gets the outcome it is asking for &mdash; nothing loads until you
            turn it on. The signal would matter for a sale or sharing of personal data for
            advertising, and we do neither. Reading the signal explicitly is tracked as an open
            item.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">05 &middot; Your choices</p>
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
