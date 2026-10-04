import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  CANONICAL_POLICY_ROUTES,
  CONTACT_EMAIL,
  LEGAL_ENTITY,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';
import { REFERRAL_PROGRAM } from '@/lib/services/referral-program';
import { TRIAL_REMINDER_DAYS } from '@/lib/services/trial-reminder-service';
import { PolicyVersionsLink } from '@shared/components/legal/PolicyVersionsLink';

export const metadata = buildMetadata({
  title: 'Referral program terms',
  description:
    'Who can take part in the referral program, what the trial and the bonus credits are, and the rules that apply to them.',
  path: CANONICAL_POLICY_ROUTES.referralTerms,
});

const PRO = getBillingPlanPricing('pro').label;
const REWARD = `${REFERRAL_PROGRAM.rewardCredits.toLocaleString('en-US')} bonus credits`;

const HOW: readonly LedgerRow[] = [
  {
    label: 'Your link',
    value:
      'Settings > Referrals gives you one personal referral link. Share it only with people you know who would welcome it. Do not send spam, buy ads against the AGI Workforce name, or post your link on coupon or deal sites.',
  },
  {
    label: 'Your friend',
    value: `Opens your link, then creates a new AGI Workforce account in the same browser within ${REFERRAL_PROGRAM.attributionDays} days. An account more than a day old cannot be referred, and each account can be referred only once.`,
  },
  {
    label: 'Friend trial',
    value: `A ${REFERRAL_PROGRAM.friendTrialDays}-day free ${PRO} trial, started at checkout with a payment card. The trial terms below apply.`,
  },
  {
    label: 'Friend reward',
    value: `${REWARD} when the friend's first paid subscription invoice is paid through checkout on the web. Subscriptions bought in the App Store or Google Play do not qualify.`,
  },
  {
    label: 'Your reward',
    value: `${REWARD} once ${REFERRAL_PROGRAM.holdDays} days have passed after that invoice without a refund, chargeback or dispute.`,
  },
  {
    label: 'Limits',
    value: `A referrer can earn at most ${REFERRAL_PROGRAM.monthlyRewardCap} rewards in a calendar month and ${REFERRAL_PROGRAM.yearlyRewardCap} in a calendar year. A friend who converts beyond a limit still gets their own reward; the referrer gets nothing for that friend.`,
  },
];

const CREDITS: readonly LedgerRow[] = [
  {
    label: 'Expiry',
    value: `Bonus credits expire ${REFERRAL_PROGRAM.bonusExpiryDays} days after they are added. Whatever is unused then is removed.`,
  },
  {
    label: 'Order of use',
    value:
      "They can be used only while you are on a paid plan. They are spent after your plan's included usage and before any credits you bought, soonest expiring first.",
  },
  {
    label: 'No cash value',
    value:
      'Bonus credits are not money or legal tender. They cannot be sold, transferred to another account, exchanged for cash or refunded, and they end if the account that holds them is closed.',
  },
];

export default function ReferralTermsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-referral-terms-title"
          eyebrow="Legal"
          title="Referral program terms."
          lede={
            <>
              These terms govern the referral program run by {LEGAL_ENTITY}. They add to our{' '}
              <Link href={CANONICAL_POLICY_ROUTES.terms} className="agi-ds-link">
                terms of service
              </Link>
              , which also apply; where the two differ about the program, these terms control. Last
              updated: {POLICY_LAST_UPDATED.referralTerms}.{' '}
              <PolicyVersionsLink policy="referralTerms" />
            </>
          }
          ctas={[]}
        />

        <Section id="how" labelledBy="agi-referral-how-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-referral-how-title">
              How it works.
            </h2>
            <Prose>
              To take part you must be at least 18 and hold an AGI Workforce account in your own
              name.
            </Prose>
            <Ledger caption="How the referral program works" rows={HOW} />
          </Stack>
        </Section>

        <Section id="trial" labelledBy="agi-referral-trial-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-referral-trial-title">
              Free trial terms.
            </h2>
            <Prose>
              Before your card is taken, checkout shows the {PRO} price and the date the trial
              converts. When the trial ends it converts automatically into a paid {PRO} subscription
              at that price plus any applicable tax, billed every month, until you cancel.{' '}
              {TRIAL_REMINDER_DAYS} days before it converts we email you a reminder with the amount,
              the date and a one-click cancel link. Cancel from that link or in Settings &gt;
              Billing any time before the trial ends and you are not charged; {PRO} stays on until
              the trial ends. Once a payment is taken, our{' '}
              <Link href={CANONICAL_POLICY_ROUTES.refunds} className="agi-ds-link">
                refund policy
              </Link>{' '}
              applies.
            </Prose>
            <Prose>
              A trial is available once per person, and only to an account that has never held a
              paid subscription. Paid upgrades are opening in stages, so the trial becomes available
              when your account can upgrade.
            </Prose>
          </Stack>
        </Section>

        <Section id="credits" labelledBy="agi-referral-credits-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-referral-credits-title">
              Bonus credits.
            </h2>
            <Ledger caption="Bonus credit rules" rows={CREDITS} />
          </Stack>
        </Section>

        <Section id="abuse" labelledBy="agi-referral-abuse-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-referral-abuse-title">
              Fair use.
            </h2>
            <Prose>
              You cannot refer yourself or another account you control. To check this we compare the
              two accounts&rsquo; payment card fingerprints, device identifiers, the network each
              signed up from and their email addresses. We give no reward, and may remove a reward
              already given, for self-referral, duplicate or fake accounts, a card, device or
              network shared with the referrer, disposable or alias email addresses, or any other
              attempt to game the program. If the qualifying invoice is refunded or disputed, the
              unspent bonus credits from that referral are removed from both accounts. Abuse can
              also lead to action on the account under our terms of service.
            </Prose>
          </Stack>
        </Section>

        <Section id="changes" labelledBy="agi-referral-changes-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-referral-changes-title">
              Changes, taxes and where the program applies.
            </h2>
            <Prose>
              We may change these terms or end the program at any time by updating this page and the
              date at its top. A change does not take away bonus credits already added to an
              account, except under the fair use rules above. If we end the program, a referral
              whose qualifying invoice was paid before the end is still rewarded when its hold
              passes.
            </Prose>
            <Prose>
              You are responsible for any taxes on rewards you receive. The program is void where
              prohibited or restricted by law, and nothing in these terms limits rights you have
              under the consumer protection law where you live.
            </Prose>
            <Prose>
              If you think a reward was withheld or removed in error, email{' '}
              <a href={contactMailto('Referral program')} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>{' '}
              from the address on your account.
            </Prose>
            <ButtonRow>
              <Button href="/settings/referrals">Invite friends</Button>
              <Button href={CANONICAL_POLICY_ROUTES.terms} variant="secondary">
                Terms of service
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
