import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { Button, ButtonRow, Eyebrow, Prose, Section } from '@/features/marketing/components/system';
import { buildMetadata } from '@/lib/seo/metadata';
import { getNeonDb } from '@/lib/server/neon-db';
import { TRIAL_CANCEL_PATH } from '@/lib/services/trial-cancel-link';
import {
  readTrialCancellation,
  type TrialCancellation,
} from '@/lib/services/trial-reminder-service';
import { TrialCancelControls, TrialCancelled } from './TrialCancelControls';

export const metadata: Metadata = {
  ...buildMetadata({
    title: 'Cancel your trial',
    description: 'Cancel a free trial before it converts to a paid plan.',
    path: TRIAL_CANCEL_PATH,
    robots: { index: false, follow: false },
  }),
  referrer: 'no-referrer',
};

const STATEMENT_MAX_WIDTH = '32rem';

const statementStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 'var(--agi-space-5)',
  maxWidth: STATEMENT_MAX_WIDTH,
  marginInline: 'auto',
};

function firstValue(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function TrialStatus({ trial }: { trial: Exclude<TrialCancellation, { state: 'trialing' }> }) {
  if (trial.state === 'cancelled')
    return <TrialCancelled plan={trial.plan} endsOn={trial.endsOn} />;
  const ended = trial.state === 'ended';
  return (
    <>
      <div>
        <Eyebrow>Free trial</Eyebrow>
        <h1 className="agi-ds-h1">
          {ended ? 'This trial has already ended.' : 'This link has expired.'}
        </h1>
      </div>
      <Prose>
        {ended
          ? 'A trial can be cancelled from its reminder link only until it ends. To change or cancel your plan now, sign in and open Settings > Billing.'
          : 'Cancel links work until the trial ends. Sign in to see your plan and cancel it in Settings > Billing.'}
      </Prose>
      <ButtonRow>
        <Button href="/settings/billing">Manage your plan</Button>
        {ended ? (
          <Button href="/refund-policy" variant="secondary">
            Refund policy
          </Button>
        ) : null}
      </ButtonRow>
    </>
  );
}

export default async function TrialCancelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const token = firstValue((await searchParams)['token']);
  const trial = await readTrialCancellation(getNeonDb, token);

  return (
    <div data-design="agi" className="agi-ds-page">
      <main id="main-content">
        <Section size="sm">
          <div style={statementStyle} aria-live="polite">
            {trial.state === 'trialing' ? (
              <TrialCancelControls token={trial.token} plan={trial.plan} endsOn={trial.endsOn} />
            ) : (
              <TrialStatus trial={trial} />
            )}
          </div>
        </Section>
      </main>
    </div>
  );
}
