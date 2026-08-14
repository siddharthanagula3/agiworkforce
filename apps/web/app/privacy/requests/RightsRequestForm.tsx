'use client';

import { useId, useState, type FormEvent } from 'react';

import { addCsrfHeaders } from '@/lib/client/csrf';

/**
 * The DPDP rights-request form.
 *
 * Open to people without an account on purpose: rights under the Act do not
 * depend on holding one, and the people most likely to need erasure are exactly
 * those whose address sits on a list they never made an account for.
 *
 * The success copy is the careful part. Submitting records a row and returns a
 * reference — it does not notify a human, and this page will not imply that it
 * does. "We have received your request" is true; "our team has been notified"
 * would not be, and a compliance surface that overstates itself is worse than
 * one that admits its edges.
 */

const REQUEST_TYPES = [
  {
    id: 'access',
    label: 'Access — send me a summary of the personal data you hold about me',
    hint: 'If you have an account, the fastest route is the export in your account settings. Use this when you cannot sign in, or when you want the summary of who it has been shared with.',
  },
  {
    id: 'correction',
    label: 'Correction — something you hold about me is wrong or incomplete',
    hint: 'Say what is wrong and what it should be.',
  },
  {
    id: 'erasure',
    label: 'Erasure — delete personal data you hold about me',
    hint: 'If you have an account, deleting it from settings is faster and self-serve. Use this for an email address on a list, where there is no account to delete.',
  },
  {
    id: 'withdrawal',
    label: 'Withdraw consent — stop processing that depends on my consent',
    hint: 'If you are signed in, the consent panel above does this immediately. Use this for consent given against an email address without an account.',
  },
  {
    id: 'nomination',
    label: 'Nomination — record someone who may act for me if I cannot',
    hint: 'There is no nomination field in the product yet, so this is recorded manually. Give the nominee’s name and how to reach them.',
  },
  {
    id: 'grievance',
    label: 'Grievance — I am dissatisfied with how my data has been handled',
    hint: 'Describe what happened. Use this route before approaching the Data Protection Board.',
  },
] as const;

type FormState = 'idle' | 'submitting' | 'error';

export function RightsRequestForm() {
  const typeId = useId();
  const emailId = useId();
  const detailsId = useId();
  const errorId = useId();

  const [requestType, setRequestType] = useState<string>('');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [reference, setReference] = useState<string | null>(null);

  const selected = REQUEST_TYPES.find((entry) => entry.id === requestType);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'submitting') return;

    if (!requestType) {
      setErrorMsg('Choose which right you are exercising.');
      setState('error');
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorMsg('Enter an email address we can reply to.');
      setState('error');
      return;
    }

    setState('submitting');
    setErrorMsg('');

    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/privacy/requests', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          requestType,
          contactEmail: normalizedEmail,
          details: details.trim() || undefined,
        }),
      });

      if (!res.ok) {
        setErrorMsg(
          res.status === 429
            ? 'Too many requests from this network. Wait a while, or email the grievance contact above.'
            : 'Your request was not recorded, so nothing was stored. Please email the grievance contact above.',
        );
        setState('error');
        return;
      }

      const body = (await res.json()) as { reference?: string };
      // Only shown when the server actually returned one: a reference the
      // product cannot look up is worse than no reference at all.
      setReference(body.reference ?? null);
      setState('idle');
      setDetails('');
    } catch {
      setErrorMsg('Your request was not recorded, so nothing was stored.');
      setState('error');
    }
  }

  if (reference) {
    return (
      <div className="agi-callout" role="status">
        <h3 className="agi-callout-h">Request recorded — reference {reference}</h3>
        <p className="agi-callout-p">
          Keep that reference; quoting it saves you describing the request again. Two things to be
          clear about, because a compliance page that overstates itself is worthless:{' '}
          <strong>this recorded your request, it did not email anyone</strong>, and nothing in the
          product pages a person when a request arrives. If it is urgent, or if you want a human to
          confirm receipt, email the grievance contact above and quote the reference.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="agi-rights-form">
      <div className="agi-rights-field">
        <label htmlFor={typeId} className="agi-rights-label">
          Which right are you exercising?
        </label>
        <select
          id={typeId}
          name="requestType"
          required
          value={requestType}
          disabled={state === 'submitting'}
          className="agi-rights-input"
          onChange={(event) => {
            setRequestType(event.target.value);
            if (state === 'error') {
              setState('idle');
              setErrorMsg('');
            }
          }}
        >
          <option value="">Choose one…</option>
          {REQUEST_TYPES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        {selected ? <p className="agi-rights-hint">{selected.hint}</p> : null}
      </div>

      <div className="agi-rights-field">
        <label htmlFor={emailId} className="agi-rights-label">
          Email address we should reply to
        </label>
        <input
          id={emailId}
          name="contactEmail"
          type="email"
          autoComplete="email"
          required
          spellCheck={false}
          value={email}
          disabled={state === 'submitting'}
          className="agi-rights-input"
          onChange={(event) => {
            setEmail(event.target.value);
            if (state === 'error') {
              setState('idle');
              setErrorMsg('');
            }
          }}
        />
        <p className="agi-rights-hint">
          Stored in plain text, because a request we cannot reply to is not a request we can honour.
          It is used to answer you and for nothing else, and it is erased with your account if you
          have one.
        </p>
      </div>

      <div className="agi-rights-field">
        <label htmlFor={detailsId} className="agi-rights-label">
          Details (optional)
        </label>
        <textarea
          id={detailsId}
          name="details"
          rows={5}
          maxLength={4000}
          value={details}
          disabled={state === 'submitting'}
          className="agi-rights-input"
          onChange={(event) => setDetails(event.target.value)}
        />
        <p className="agi-rights-hint">
          Do not paste passwords, API keys, or anything you would not want stored. This box is saved
          verbatim.
        </p>
      </div>

      {state === 'error' && errorMsg ? (
        <p id={errorId} role="alert" aria-live="polite" className="agi-rights-error">
          {errorMsg}
        </p>
      ) : null}

      <div className="agi-cta-row">
        <button type="submit" className="agi-cta-ghost" disabled={state === 'submitting'}>
          {state === 'submitting' ? 'Recording…' : 'Record my request'}
        </button>
      </div>
    </form>
  );
}
