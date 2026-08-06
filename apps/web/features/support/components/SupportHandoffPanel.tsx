'use client';

/**
 * Presence-honest handoff.
 *
 * The rule this component exists to keep: NEVER promise a human who is not
 * there. Concretely —
 *
 *  - The live-chat control is not rendered at all unless the server said
 *    `live: true`. It is not disabled, not greyed, not "try anyway": absent.
 *    Checking, offline, at-capacity, not-configured, 404 and network failure
 *    are indistinguishable to this component because they should be
 *    indistinguishable to the user.
 *  - There is no unbounded waiting state. A `waiting` handoff always carries a
 *    deadline (enforced in `useSupportSession`), and the countdown here shows
 *    the user how long it will last before it converts.
 *  - When email is not configured, the widget says so plainly and links the
 *    published /support page rather than inventing an address. It never claims
 *    something was sent.
 *
 * All reassuring copy in the live/queued/emailed states is SERVER-authored
 * (`headline`/`detail`); the widget cannot compose a promise of its own.
 */

import { useEffect, useState, type FormEvent } from 'react';
import type { SupportHandoffView, SupportPresenceView } from '../lib/contract';
import styles from './SupportWidget.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function secondsUntil(iso: string, now: number): number {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.ceil((parsed - now) / 1000));
}

function WaitCountdown({ waitExpiresAt }: { waitExpiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const remaining = secondsUntil(waitExpiresAt, now);
  return (
    <p className={styles['cardBody']} data-support-wait-remaining={String(remaining)}>
      I will wait {remaining} more second{remaining === 1 ? '' : 's'}, then email this instead.
    </p>
  );
}

export function SupportHandoffPanel({
  presence,
  checking,
  handoff,
  pending,
  signedIn,
  onStart,
  onDismiss,
}: {
  presence: SupportPresenceView;
  checking: boolean;
  handoff: SupportHandoffView | null;
  pending: boolean;
  signedIn: boolean;
  onStart: (contactEmail?: string) => void;
  onDismiss: () => void;
}) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (!signedIn) {
      const normalized = email.trim().toLowerCase();
      if (!EMAIL_RE.test(normalized)) {
        setEmailError('Enter an email address so the team can reply to you.');
        return;
      }
      setEmailError('');
      onStart(normalized);
      return;
    }
    onStart();
  };

  if (handoff) {
    if (handoff.kind === 'waiting') {
      return (
        <div className={styles['card']} data-support-handoff-state="waiting">
          <p className={styles['cardTitle']}>{handoff.headline}</p>
          <p className={styles['cardBody']}>{handoff.detail}</p>
          <WaitCountdown waitExpiresAt={handoff.waitExpiresAt} />
          <p className={styles['cardBody']}>Reference {handoff.referenceId}</p>
        </div>
      );
    }

    if (handoff.kind === 'connected') {
      return (
        <div className={styles['card']} data-support-handoff-state="connected">
          <p className={styles['cardTitle']}>{handoff.headline}</p>
          <p className={styles['cardBody']}>
            {handoff.agentDisplayName
              ? `${handoff.agentDisplayName} is with you now.`
              : handoff.detail}
          </p>
          <p className={styles['cardBody']}>Reference {handoff.referenceId}</p>
        </div>
      );
    }

    if (handoff.kind === 'emailed') {
      return (
        <div className={styles['card']} data-support-handoff-state="emailed">
          <p className={styles['cardTitle']}>{handoff.headline}</p>
          <p className={styles['cardBody']}>{handoff.detail}</p>
          {handoff.emailedTo ? (
            <p className={styles['cardBody']}>Sent to {handoff.emailedTo}.</p>
          ) : null}
          {handoff.expectedReply ? (
            <p className={styles['cardBody']}>Expect a reply {handoff.expectedReply}.</p>
          ) : null}
          {handoff.referenceId ? (
            <p className={styles['cardBody']}>Reference {handoff.referenceId}</p>
          ) : null}
        </div>
      );
    }

    if (handoff.kind === 'timed_out') {
      return (
        <div className={styles['card']} data-support-handoff-state="timed_out">
          <p className={styles['cardTitle']}>{handoff.headline}</p>
          <p className={styles['cardBody']}>{handoff.detail}</p>
          <div className={styles['cardActions']}>
            <button
              type="button"
              className={styles['primaryButton']}
              disabled={pending}
              onClick={() => {
                onStart(signedIn ? undefined : email.trim().toLowerCase());
              }}
            >
              Send it by email instead
            </button>
            <button type="button" className={styles['ghostButton']} onClick={onDismiss}>
              Keep asking me instead
            </button>
          </div>
        </div>
      );
    }

    if (handoff.kind === 'undeliverable') {
      return (
        <div className={styles['card']} data-support-handoff-state="undeliverable">
          <p className={styles['cardTitle']}>{handoff.headline}</p>
          <p className={styles['cardBody']}>{handoff.detail}</p>
          <div className={styles['cardActions']}>
            {handoff.mailtoHref ? (
              <a className={styles['ghostButton']} href={handoff.mailtoHref}>
                Email the team yourself
              </a>
            ) : (
              <a className={styles['ghostButton']} href="/support">
                Contact options
              </a>
            )}
          </div>
        </div>
      );
    }

    if (handoff.kind === 'closed') {
      return (
        <div className={styles['card']} data-support-handoff-state="closed">
          <p className={styles['cardTitle']}>{handoff.headline}</p>
          <p className={styles['cardBody']}>{handoff.detail}</p>
        </div>
      );
    }

    return (
      <div className={styles['card']} data-support-handoff-state="failed">
        <p className={styles['cardTitle']}>I could not pass this on</p>
        <p className={styles['cardBody']}>{handoff.message}</p>
        <div className={styles['cardActions']}>
          <a className={styles['ghostButton']} href="/support">
            Contact options
          </a>
        </div>
      </div>
    );
  }

  // No handoff yet — offer only what is actually true right now.
  const canEmail = presence.fallback.configured;

  return (
    <form className={styles['card']} data-support-handoff-state="offer" onSubmit={submit}>
      <p className={styles['cardTitle']}>
        {checking ? 'Checking who is available…' : presence.headline}
      </p>
      <p className={styles['cardBody']}>{presence.detail}</p>

      {!signedIn ? (
        <div className={styles['emailField']}>
          <label className={styles['emailLabel']} htmlFor="support-handoff-email">
            Your email, so the team can reply
          </label>
          <input
            id="support-handoff-email"
            className={styles['emailInput']}
            type="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            aria-invalid={emailError.length > 0}
            onChange={(event) => {
              setEmail(event.target.value);
              if (emailError) setEmailError('');
            }}
          />
          {emailError ? (
            <p role="alert" className={styles['errorText']}>
              {emailError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles['cardActions']}>
        {/* Rendered ONLY when the server said a human is actually online. */}
        {presence.live && !checking ? (
          <button type="submit" className={styles['primaryButton']} disabled={pending}>
            {pending ? 'Connecting…' : 'Chat with a person now'}
          </button>
        ) : null}

        {canEmail ? (
          <button
            type={presence.live ? 'button' : 'submit'}
            className={presence.live ? styles['ghostButton'] : styles['primaryButton']}
            disabled={pending}
            onClick={
              presence.live
                ? (event) => {
                    event.preventDefault();
                    if (!signedIn) {
                      const normalized = email.trim().toLowerCase();
                      if (!EMAIL_RE.test(normalized)) {
                        setEmailError('Enter an email address so the team can reply to you.');
                        return;
                      }
                      onStart(normalized);
                      return;
                    }
                    onStart();
                  }
                : undefined
            }
          >
            {pending ? 'Sending…' : 'Send this to the support team'}
          </button>
        ) : (
          <a className={styles['ghostButton']} href="/support">
            See contact options
          </a>
        )}
      </div>

      {!canEmail ? (
        <p className={styles['cardBody']}>
          Email handoff is not configured on this deployment, so I am not going to pretend I sent
          anything.
        </p>
      ) : presence.fallback.expectedReply ? (
        <p className={styles['cardBody']}>The team replies {presence.fallback.expectedReply}.</p>
      ) : null}
    </form>
  );
}
