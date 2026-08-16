'use client';

import { useState } from 'react';
import type { SupportActionFollowUp } from '../lib/contract';
import type { SupportActionFlow } from '../hooks/useSupportSession';
import { runPostFollowUp } from '../lib/support-client';
import { SupportRefusalCard } from './SupportRefusalCard';
import styles from './SupportWidget.module.css';

function FollowUpControl({ followUp }: { followUp: SupportActionFollowUp }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (followUp.mode === 'link') {
    return (
      <a className={styles['ghostButton']} href={followUp.href}>
        {followUp.label}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        className={styles['ghostButton']}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void runPostFollowUp(followUp.path).then((result) => {
            setBusy(false);
            if ('url' in result) {
              if (typeof window !== 'undefined') window.location.assign(result.url);
              return;
            }
            setError(result.error);
          });
        }}
      >
        {busy ? 'Opening…' : followUp.label}
      </button>
      {error ? <p className={styles['errorText']}>{error}</p> : null}
    </>
  );
}

export function SupportActionConfirm({
  flow,
  actionTitle,
  onPrepare,
  onConfirm,
  onCancel,
}: {
  flow: SupportActionFlow;
  actionTitle: string;
  onPrepare: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (flow.phase === 'offered') {
    return (
      <div className={styles['card']} data-support-action-state="offered">
        <p className={styles['cardTitle']}>I can do this for you</p>
        <p className={styles['cardBody']}>{actionTitle}</p>
        <p className={styles['cardBody']}>
          Nothing happens yet — I will show you exactly what it does first.
        </p>
        <div className={styles['cardActions']}>
          <button type="button" className={styles['primaryButton']} onClick={onPrepare}>
            Show me what this does
          </button>
          <button type="button" className={styles['ghostButton']} onClick={onCancel}>
            No thanks
          </button>
        </div>
      </div>
    );
  }

  if (flow.phase === 'preparing') {
    return (
      <div className={styles['card']} data-support-action-state="preparing">
        <p className={styles['cardBody']}>Checking what this would do on your account…</p>
      </div>
    );
  }

  if (flow.phase === 'refused') {
    return <SupportRefusalCard refusal={flow.refusal} />;
  }

  if (flow.phase === 'blocked') {
    return (
      <div className={styles['card']} data-support-action-state="blocked">
        <p className={styles['cardTitle']}>I cannot do that</p>
        <p className={styles['cardBody']}>{flow.message}</p>
      </div>
    );
  }

  if (flow.phase === 'confirming' || flow.phase === 'running') {
    const { proposal } = flow;
    const running = flow.phase === 'running';
    return (
      <div
        className={styles['card']}
        data-support-action-state={running ? 'running' : 'confirming'}
      >
        <p className={styles['cardTitle']}>{proposal.title}</p>
        <p className={styles['cardBody']}>{proposal.summary}</p>

        {proposal.effects.length > 0 ? (
          <ul className={styles['effects']}>
            {proposal.effects.map((effect, index) => (
              <li key={`${proposal.proposalId}-effect-${String(index)}`}>{effect}</li>
            ))}
          </ul>
        ) : null}

        <span className={styles['badge']}>
          {proposal.reversible ? 'You can undo this' : 'This cannot be undone from here'}
        </span>

        <div className={styles['cardActions']}>
          <button
            type="button"
            className={styles['primaryButton']}
            onClick={onConfirm}
            disabled={running}
          >
            {running ? 'Working…' : 'Yes, do it'}
          </button>
          <button
            type="button"
            className={styles['ghostButton']}
            onClick={onCancel}
            disabled={running}
          >
            {/* Plain ASCII apostrophe on purpose. `&rsquo;` renders U+2019, which
                silently changes the button's ACCESSIBLE NAME — voice-control
                users say "click no don't" and screen-reader users search for it.
                A typographic flourish is not worth an unaddressable control. */}
            {"No, don't"}
          </button>
        </div>
      </div>
    );
  }

  const { outcome } = flow;
  return (
    <div className={styles['card']} data-support-action-state={`done-${outcome.kind}`}>
      <p className={styles['cardTitle']}>
        {outcome.kind === 'ok' ? 'Done' : outcome.kind === 'denied' ? 'Not allowed' : 'That failed'}
      </p>
      <p className={styles['cardBody']}>{outcome.message}</p>

      {outcome.kind === 'ok' && outcome.secret ? (
        <>
          <p className={styles['cardBody']}>{outcome.secret.label}</p>
          {/* Rendered once, held in component state only. It is never written
              into the transcript, so it cannot reach the escalation email. */}
          <p className={styles['secret']}>{outcome.secret.value}</p>
        </>
      ) : null}

      {outcome.kind === 'ok' && outcome.followUp ? (
        <div className={styles['cardActions']}>
          <FollowUpControl followUp={outcome.followUp} />
        </div>
      ) : null}
    </div>
  );
}
