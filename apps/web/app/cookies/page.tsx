import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Container,
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { NoteList } from '@/features/marketing/components/pages/company/shared';
import { CookiePreferencesButton } from './CookiePreferencesButton';
import { PolicyContents } from '@shared/components/legal/PolicyContents';
import { LEGAL_ENTITY, POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Cookie policy',
  description:
    'The cookies AGI actually sets, who controls each one, how long it lasts, and where the consent decision is stored. Analytics is opt-in and fails closed.',
  path: '/cookies',
});

const SECTIONS = [
  '01 · Cookies we set',
  '02 · What else we put on your device',
  '03 · Two things people usually get told wrong',
  '04 · Do Not Track and Global Privacy Control',
  '05 · Your choices',
] as const;

interface CookieRow {
  name: string;
  category: 'Strictly necessary' | 'Functional' | 'Analytics' | 'Payment';
  controller: string;
  purpose: string;
  duration: string;
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
      'Fraud prevention on card payments. Set by Stripe when their payment script loads, which happens only at the moment you confirm a payment, not while you browse, and not on the pricing page. If you never pay, they are never set.',
    duration: 'Up to 1 year (mid) and 30 minutes (sid), set by Stripe.',
    source: 'features/billing/services/stripe-payments.ts',
  },
];

interface StorageRow {
  key: string;
  store: 'Local storage' | 'Session storage';
  holds: string;
  clearedBy: string;
  source: string;
}

const STORAGE: StorageRow[] = [
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
      'A marker that a browser-held encryption key exists for this session. Not the key itself: the key material is non-extractable and held by the browser.',
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

function cookieRows(rows: CookieRow[]): LedgerRow[] {
  return rows.map((row) => ({
    label: row.name,
    value: (
      <>
        <strong>{row.category}.</strong> {row.purpose}
        <br />
        <span style={{ color: 'var(--agi-ink-2)' }}>
          {row.controller} &middot; {row.duration} &middot; <code>{row.source}</code>
        </span>
      </>
    ),
  }));
}

function storageRows(rows: StorageRow[]): LedgerRow[] {
  return rows.map((row) => ({
    label: row.key,
    value: (
      <>
        <strong>{row.store}.</strong> {row.holds}
        <br />
        <span style={{ color: 'var(--agi-ink-2)' }}>
          Cleared by: {row.clearedBy} &middot; <code>{row.source}</code>
        </span>
      </>
    ),
  }));
}

const MISCONCEPTIONS = [
  {
    title: 'There is no CSRF cookie',
    body: 'Our cross-site request protection is a token carried in a request header and bound to your session, not a cookie. Earlier versions of this page listed a "CSRF token" cookie. Nothing set one, so it is gone.',
  },
  {
    title: 'Your consent choice is not stored in a cookie',
    body: (
      <>
        It is stored in your browser&rsquo;s local storage under the key <code>cookie-consent</code>
        , on your device only. It is never sent to us. Clearing site data resets it to the default,
        which is analytics off.
      </>
    ),
  },
];

export default function CookiesPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-cookies-title"
          eyebrow="Legal"
          title="Cookies."
          lede={
            <>
              We use the minimum needed to keep you signed in and the site functional. No
              advertising cookies, ever. Analytics is opt-in and the consent check fails closed: if
              we cannot read your choice, analytics stays off. Last updated:{' '}
              {POLICY_LAST_UPDATED.cookies}.
            </>
          }
          ctas={[]}
        />

        <Container className="mb-10">
          <PolicyContents sections={SECTIONS} />
        </Container>

        <Section id="s-01" labelledBy="agi-cookies-set-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-cookies-set-title">
                01 &middot; Cookies we set.
              </h2>
              <Prose>
                Every cookie this site sets, including the two third parties that set their own.
                Each row names the file that sets it, so you can check this table against the code
                rather than take our word for it.
              </Prose>
            </div>
            <Ledger caption="Cookies we set" rows={cookieRows(COOKIES)} />
            <Prose size="sm">
              We set no advertising or cross-site tracking cookies, and we do not sell or share
              personal information for cross-context behavioural advertising. Only the analytics row
              needs your consent; the rest are necessary to keep you signed in, keep the site
              functional, or complete a payment you asked for.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-02" labelledBy="agi-cookies-storage-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-cookies-storage-title">
                02 &middot; What else we put on your device.
              </h2>
              <Prose>
                <strong>
                  A cookie policy that only lists cookies is answering a narrower question than the
                  one you asked.
                </strong>{' '}
                Most of what this product stores on your device is in local or session storage, not
                cookies, including your session credentials. None of it is a tracking technology and
                none of it is shared, but you should be able to see it, so here it is in full. The
                ones that carry an identifier or a credential are listed first.
              </Prose>
            </div>
            <Ledger caption="Device storage" rows={storageRows(STORAGE)} />
            <Prose size="sm">
              Local storage survives closing the browser; session storage does not. Clearing site
              data in your browser removes both, and will sign you out.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-03" labelledBy="agi-cookies-myths-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-cookies-myths-title">
              03 &middot; Two things people usually get told wrong.
            </h2>
            <NoteList items={MISCONCEPTIONS} />
          </Stack>
        </Section>

        <Section id="s-04" labelledBy="agi-cookies-dnt-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-cookies-dnt-title">
              04 &middot; Do Not Track and Global Privacy Control.
            </h2>
            <Prose>
              <strong>We do not read either signal today.</strong> Browsers can send a Do Not Track
              header or a Global Privacy Control signal, and nothing in this product currently
              checks for them. We are stating that plainly rather than leaving you to assume one way
              or the other, because a site that silently ignores GPC while implying otherwise is
              worse than one that says so.
            </Prose>
            <Prose size="sm">
              What this does and does not cost you: analytics is opt-in here regardless, so a
              browser sending GPC already gets the outcome it is asking for: nothing loads until you
              turn it on. The signal would matter for a sale or sharing of personal data for
              advertising, and we do neither. Reading the signal explicitly is tracked as an open
              item.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-05" labelledBy="agi-cookies-choices-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-cookies-choices-title">
              05 &middot; Your choices.
            </h2>
            <Prose>
              <CookiePreferencesButton /> at any time: analytics stays off until you turn it on, and
              switching it back off stops it loading on your next page view. You can also manage
              cookies through your browser; clearing them will sign you out of any active session.
              For data export or deletion, see the{' '}
              <Link href="/privacy" className="agi-ds-link">
                privacy policy
              </Link>
              .
            </Prose>
            <ButtonRow>
              <Button href="/privacy" variant="secondary">
                Privacy
              </Button>
              <Button href="/subprocessors" variant="secondary">
                Subprocessors
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
