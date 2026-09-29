'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, Share2 } from 'lucide-react';
import { Button, Spinner } from '@agiworkforce/ui';
import {
  REFERRAL_CODE_PATH,
  REFERRALS_PATH,
  ReferralCodeSchema,
  ReferralOverviewSchema,
  type ReferralOverviewResponse,
} from '@agiworkforce/cloud-contracts';
import { formatCredits } from '@agiworkforce/types';
import { safeClipboard } from '@shared/utils/browser-utils';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { SITE_NAME } from '@/lib/seo/site';
import { toUserMessage } from '@/lib/user-error-message';
import { SettingsPageLink } from '../components/SettingsSectionLink';

type ReferralOverview = ReferralOverviewResponse;
type ReferralProgram = ReferralOverview['program'];
type ReferralFriend = ReferralOverview['friends'][number];

class ReferralRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ReferralRequestError';
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (response.ok) return response.json();
  const body = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: string };
  };
  const message = typeof body.error === 'string' ? body.error : body.error?.message;
  throw new ReferralRequestError(message ?? 'Referrals could not load.', response.status);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function wholeCredits(credits: number): string {
  return formatCredits(credits, { maximumFractionDigits: 0 });
}

function friendStatus(
  friend: ReferralFriend,
  program: ReferralProgram,
): { label: string; detail: string } {
  const reward = wholeCredits(program.rewardCredits);
  switch (friend.status) {
    case 'signed_up':
      return {
        label: 'Joined',
        detail: `Your ${reward} follow their first payment after the ${program.friendTrialDays}-day trial.`,
      };
    case 'converted':
      return {
        label: 'Subscribed',
        detail: friend.rewardAt
          ? `Your ${reward} arrive on ${formatDate(friend.rewardAt)} if the payment stands.`
          : `Your ${reward} arrive ${program.holdDays} days after their first payment.`,
      };
    case 'rewarded':
      return { label: 'Reward earned', detail: `You received ${reward}.` };
    case 'capped':
      return {
        label: 'Over the reward limit',
        detail: `Rewards stop at ${program.monthlyRewardCap} a month and ${program.yearlyRewardCap} a year.`,
      };
    case 'blocked':
      return { label: 'Not eligible', detail: 'This sign-up does not qualify for a reward.' };
    case 'clawed_back':
      return {
        label: 'Payment reversed',
        detail: 'Their payment was refunded or disputed, so the rewards were removed.',
      };
  }
}

export function ReferralsSection() {
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = ReferralOverviewSchema.parse(
        await readJson(await fetch(REFERRALS_PATH, { credentials: 'include', signal })),
      );
      if (loaded.code) {
        setOverview(loaded);
        return;
      }
      const created = ReferralCodeSchema.parse(
        await readJson(
          await fetch(REFERRAL_CODE_PATH, {
            method: 'POST',
            credentials: 'include',
            headers: await addCsrfHeaders(),
            signal,
          }),
        ),
      );
      setOverview({ ...loaded, code: created.code, link: created.link });
    } catch (caught) {
      if (signal.aborted) return;
      setError(toUserMessage(caught, 'Referrals could not load.'));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshVersion]);

  const copyLink = async (link: string) => {
    setNotice(null);
    const copied = await safeClipboard.writeText(link);
    setNotice(
      copied ? 'Invite link copied.' : 'Copying is blocked here. Select the link and copy it.',
    );
  };

  const shareLink = async (link: string, program: ReferralProgram) => {
    setNotice(null);
    const title = `Join me on ${SITE_NAME}`;
    const text = `Try ${SITE_NAME} with ${program.friendTrialDays} days of Pro free.`;
    if (!canShare) {
      window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${link}`)}`;
      return;
    }
    try {
      await navigator.share({ title, text, url: link });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setNotice(toUserMessage(caught, 'Sharing did not open. Copy the link instead.'));
    }
  };

  const program = overview?.program;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-h1 text-foreground">Referrals</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {program
            ? `Invite friends to ${SITE_NAME}. They get ${program.friendTrialDays} days of Pro free, and when their first payment goes through you each get ${wholeCredits(program.rewardCredits)}.`
            : `Invite friends to ${SITE_NAME} and earn bonus credits when they subscribe.`}
        </p>
      </header>

      {loading && !overview ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner size="sm" />
          <span aria-hidden="true">Loading your referrals</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6" role="alert">
          <h2 className="text-h4 text-foreground">Referrals could not load</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setRefreshVersion((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {overview && overview.link && program ? (
        <>
          <section aria-labelledby="referral-link-heading" className="space-y-3">
            <h2 id="referral-link-heading" className="text-h4 text-foreground">
              Your invite link
            </h2>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={overview.link}
                aria-label="Invite link"
                onFocus={(event) => event.currentTarget.select()}
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => void copyLink(overview.link ?? '')}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Copy link
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void shareLink(overview.link ?? '', program)}
                >
                  {canShare ? (
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Mail className="h-4 w-4" aria-hidden="true" />
                  )}
                  {canShare ? 'Share' : 'Email invite'}
                </Button>
              </div>
            </div>
            {notice ? (
              <p role="status" className="text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="referral-progress-heading" className="space-y-3">
            <h2 id="referral-progress-heading" className="text-h4 text-foreground">
              Your progress
            </h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Friends joined</dt>
                <dd className="mt-1 text-lg font-semibold text-foreground">
                  {overview.stats.joined}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Subscribed</dt>
                <dd className="mt-1 text-lg font-semibold text-foreground">
                  {overview.stats.subscribed}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Credits earned</dt>
                <dd className="mt-1 text-lg font-semibold text-foreground">
                  {wholeCredits(overview.stats.creditsEarned)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Bonus credits left</dt>
                <dd className="mt-1 text-lg font-semibold text-foreground">
                  {formatCredits(overview.bonus.availableCredits)}
                </dd>
                {overview.bonus.nextExpiry ? (
                  <dd className="mt-1 text-xs text-muted-foreground">
                    Next expiry {formatDate(overview.bonus.nextExpiry)}
                  </dd>
                ) : null}
              </div>
            </dl>
          </section>

          <section aria-labelledby="referral-friends-heading" className="space-y-3">
            <h2 id="referral-friends-heading" className="text-h4 text-foreground">
              Friends
            </h2>
            {overview.friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No one has joined with your link yet. Friends who sign up with it appear here.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {overview.friends.map((friend) => {
                  const status = friendStatus(friend, program);
                  return (
                    <li
                      key={friend.id}
                      className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Friend who joined {formatDate(friend.joinedAt)}
                        </p>
                        <p className="text-xs text-muted-foreground">{status.detail}</p>
                      </div>
                      <span className="shrink-0 text-sm text-foreground">{status.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="referral-rules-heading" className="space-y-2">
            <h2 id="referral-rules-heading" className="text-h4 text-foreground">
              How it works
            </h2>
            <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
              <li>
                A friend who signs up with your link and starts Pro gets {program.friendTrialDays}{' '}
                days free. Pro then renews at its normal price unless they cancel before the trial
                ends.
              </li>
              <li>
                When their first payment goes through they get {wholeCredits(program.rewardCredits)}
                . You get {wholeCredits(program.rewardCredits)} {program.holdDays} days later if
                that payment is not refunded or disputed.
              </li>
              <li>
                You can earn rewards for up to {program.monthlyRewardCap} friends a month and{' '}
                {program.yearlyRewardCap} a year.
              </li>
              <li>
                Bonus credits are used after your plan&apos;s included usage and before credits you
                bought. They need a paid plan to use, expire {program.bonusExpiryDays} days after
                they are granted, have no cash value and cannot be transferred.
              </li>
              <li>
                Referring yourself, duplicate accounts, and sign-ups that share your card, device or
                network do not qualify. Rewards from a refunded or disputed payment are removed. We
                may change or end the program at any time.
              </li>
              <li>
                The{' '}
                <SettingsPageLink
                  href={CANONICAL_POLICY_ROUTES.referralTerms}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  referral program terms
                </SettingsPageLink>{' '}
                apply.
              </li>
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
