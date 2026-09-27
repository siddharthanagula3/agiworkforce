import { cookies } from 'next/headers';
import Link from 'next/link';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { AUTH_SIGNUP_PATH } from '@/features/auth/authRoutes';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { buildMetadata } from '@/lib/seo/metadata';
import {
  REFERRAL_ATTRIBUTION_COOKIE,
  REFERRAL_PROGRAM,
  REFERRAL_WELCOME_PATH,
  normalizeReferralCode,
} from '@/lib/services/referral-program';
import { TRIAL_REMINDER_DAYS } from '@/lib/services/trial-reminder-service';

export const metadata = buildMetadata({
  title: 'Your invitation',
  description: 'A friend invited you to AGI Workforce, with a free Pro trial and bonus credits.',
  path: REFERRAL_WELCOME_PATH,
  robots: { index: false, follow: false },
});

const PRO = getBillingPlanPricing('pro').label;
const REWARD = `${REFERRAL_PROGRAM.rewardCredits.toLocaleString('en-US')} bonus credits`;

const OFFER: readonly LedgerRow[] = [
  {
    label: `${PRO} trial`,
    value: `${REFERRAL_PROGRAM.friendTrialDays} days of ${PRO} free, started at checkout with a payment card. Checkout shows the price and the date the trial converts before your card is taken.`,
  },
  {
    label: 'Reminder',
    value: `${TRIAL_REMINDER_DAYS} days before the trial converts we email you the amount and the date, with a one-click cancel link. Cancel before then and you are not charged.`,
  },
  {
    label: 'Your credits',
    value: `${REWARD} when your first paid invoice is paid. They expire ${REFERRAL_PROGRAM.bonusExpiryDays} days after they are added.`,
  },
  {
    label: 'Your friend',
    value: `Can earn ${REWARD} ${REFERRAL_PROGRAM.holdDays} days after that invoice, unless it is refunded or disputed.`,
  },
];

export default async function ReferralWelcomePage() {
  const invited =
    normalizeReferralCode((await cookies()).get(REFERRAL_ATTRIBUTION_COOKIE)?.value) !== null;
  const terms = {
    href: CANONICAL_POLICY_ROUTES.referralTerms,
    label: 'Referral terms',
    variant: 'secondary' as const,
  };

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        {invited ? (
          <PageHero
            id="agi-referral-welcome-title"
            eyebrow="Invitation"
            title="A friend invited you to AGI Workforce."
            em="invited you"
            lede={`Create your account in this browser within ${REFERRAL_PROGRAM.attributionDays} days to accept. Paid upgrades are opening in stages, so your ${PRO} trial is ready when your account can upgrade.`}
            ctas={[{ href: AUTH_SIGNUP_PATH, label: 'Create your account' }, terms]}
          />
        ) : (
          <PageHero
            id="agi-referral-welcome-title"
            eyebrow="Invitation"
            title="Your invite did not reach this browser."
            em="this browser"
            lede="Open the invite link again in this browser, with cookies allowed, then create your account here."
            ctas={[terms]}
          />
        )}

        <Section id="offer" labelledBy="agi-referral-offer-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-referral-offer-title">
              What the invite includes.
            </h2>
            <Ledger caption="What the invite includes" rows={OFFER} />
            <Prose size="sm">
              The trial converts into a paid {PRO} subscription unless you cancel, and invites are
              for new accounts only. The{' '}
              <Link href={CANONICAL_POLICY_ROUTES.referralTerms} className="agi-ds-link">
                referral program terms
              </Link>{' '}
              apply.
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
