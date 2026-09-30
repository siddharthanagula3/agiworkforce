'use client';

import { useId, useState, type FormEvent } from 'react';

import { Spinner } from '@agiworkforce/ui';

import { addCsrfHeaders } from '@/lib/client/csrf';

import {
  AUTH_ERROR_CLASS,
  AUTH_HINT_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from './authStyles';
import { SUPPORT_RECOVERY_PATH } from '@agiworkforce/cloud-contracts/support';

export type RecoveryLoss = 'password' | 'email' | 'factor';

const LOSSES: ReadonlyArray<{ id: RecoveryLoss; label: string }> = [
  { id: 'password', label: 'My password, and the reset email did not help' },
  { id: 'email', label: 'Access to the email address on the account' },
  { id: 'factor', label: 'My two-factor device and backup codes' },
];

const TEXTAREA_CLASS =
  'auth-field mt-2 w-full rounded-2xl border border-rule bg-transparent px-4 py-3 text-base text-text-primary placeholder:text-text-muted';

export function AccountRecoveryForm({ initialLoss }: { initialLoss: RecoveryLoss }) {
  const accountId = useId();
  const contactId = useId();
  const detailsId = useId();
  const [lost, setLost] = useState<RecoveryLoss>(initialLoss);
  const [accountEmail, setAccountEmail] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState(false);

  if (received) {
    return (
      <p role="status" className={`${AUTH_HINT_CLASS} mt-8`}>
        If that address belongs to an account, your request is recorded and a receipt is on its way
        to the address you gave for replies. A person checks that the account is yours before
        restoring access, and the account owner is told a recovery was requested. An account with
        Advanced Account Security recovers only with a recovery key.
      </p>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const reply = (lost === 'email' ? contactEmail : contactEmail || accountEmail).trim();
    if (!accountEmail.trim() || !reply || !details.trim()) {
      setError('Fill in every field so a person can verify the account is yours.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch(SUPPORT_RECOVERY_PATH, {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          accountEmail: accountEmail.trim(),
          contactEmail: reply,
          lost,
          details: details.trim(),
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? 'Too many requests from this network. Wait a while and try again.'
            : 'Your request was not sent. Check the email addresses and try again.',
        );
        return;
      }
      setReceived(true);
    } catch {
      setError('Your request was not sent. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-6">
      <fieldset>
        <legend className={AUTH_LABEL_CLASS}>What have you lost?</legend>
        <div className="mt-3 flex flex-col gap-2">
          {LOSSES.map((option) => (
            <label key={option.id} className="flex items-start gap-2 text-base text-text-primary">
              <input
                type="radio"
                name="lost"
                value={option.id}
                checked={lost === option.id}
                disabled={sending}
                onChange={() => setLost(option.id)}
                className="mt-1"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={accountId} className={AUTH_LABEL_CLASS}>
          Email address on the account
        </label>
        <input
          id={accountId}
          type="email"
          autoComplete="email"
          value={accountEmail}
          disabled={sending}
          onChange={(event) => setAccountEmail(event.target.value)}
          className={`${AUTH_INPUT_CLASS} mt-2`}
        />
      </div>
      <div>
        <label htmlFor={contactId} className={AUTH_LABEL_CLASS}>
          {lost === 'email' ? 'An email address we can reach you at' : 'Reply to (optional)'}
        </label>
        <input
          id={contactId}
          type="email"
          value={contactEmail}
          disabled={sending}
          onChange={(event) => setContactEmail(event.target.value)}
          className={`${AUTH_INPUT_CLASS} mt-2`}
        />
      </div>
      <div>
        <label htmlFor={detailsId} className={AUTH_LABEL_CLASS}>
          Anything that shows the account is yours
        </label>
        <textarea
          id={detailsId}
          rows={5}
          value={details}
          disabled={sending}
          placeholder="Roughly when you signed up, your plan, the last chat you remember"
          onChange={(event) => setDetails(event.target.value)}
          className={TEXTAREA_CLASS}
        />
      </div>
      {error ? (
        <p role="alert" className={AUTH_ERROR_CLASS}>
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={sending} className={AUTH_PRIMARY_BUTTON_CLASS}>
        {sending ? <Spinner size="sm" aria-hidden="true" /> : null}
        Request recovery
      </button>
    </form>
  );
}
