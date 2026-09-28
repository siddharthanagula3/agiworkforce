'use client';

import { useId, useState, type FormEvent } from 'react';

import { addCsrfHeaders } from '@/lib/client/csrf';

export type NoticeType = 'copyright' | 'trademark' | 'impersonation';

type StatementId = 'goodFaith' | 'accurate' | 'authorized';

interface NoticeTypeCopy {
  label: string;
  holderLabel: string;
  claimLabel: string;
  claimHint: string;
  statements: ReadonlyArray<{ id: StatementId; label: string }>;
}

const ACCURATE_STATEMENT = {
  id: 'accurate',
  label: 'The information in this notice is accurate.',
} as const;

const NOTICE_TYPES: Record<NoticeType, NoticeTypeCopy> = {
  copyright: {
    label: 'Copyright',
    holderLabel: 'Rights holder, if not you (optional)',
    claimLabel: 'The work you say is infringed',
    claimHint:
      'Describe the copyrighted work and where the original can be seen. A registration number helps but is not required.',
    statements: [
      {
        id: 'goodFaith',
        label:
          'I have a good-faith belief that the use is not authorised by the rights holder, its agent, or the law.',
      },
      ACCURATE_STATEMENT,
      {
        id: 'authorized',
        label:
          'Under penalty of perjury, I am the rights holder or authorised to act on the rights holder’s behalf.',
      },
    ],
  },
  trademark: {
    label: 'Trademark',
    holderLabel: 'Mark owner, if not you (optional)',
    claimLabel: 'The mark you say is infringed',
    claimHint:
      'Name the mark, the goods or services it covers and where it is registered. A registration number helps but is not required.',
    statements: [
      {
        id: 'goodFaith',
        label:
          'I have a good-faith belief that the use of the mark is not authorised by its owner, its agent, or the law.',
      },
      ACCURATE_STATEMENT,
      { id: 'authorized', label: 'I am the mark owner or authorised to act on its behalf.' },
    ],
  },
  impersonation: {
    label: 'Impersonation',
    holderLabel: 'Person or organisation impersonated, if not you (optional)',
    claimLabel: 'How the material impersonates them',
    claimHint:
      'Say who is being impersonated and what in the material presents itself as them, for example a name, likeness, logo or claimed affiliation.',
    statements: [
      {
        id: 'goodFaith',
        label:
          'I have a good-faith belief that the material impersonates the person or organisation named.',
      },
      ACCURATE_STATEMENT,
      {
        id: 'authorized',
        label: 'I am the person or organisation impersonated, or authorised to act for them.',
      },
    ],
  },
};

const NOTICE_TYPE_ORDER: readonly NoticeType[] = ['copyright', 'trademark', 'impersonation'];

type FormState = 'idle' | 'submitting' | 'error';

interface Result {
  reference: string;
  operatorNotified: boolean;
}

export function CopyrightNoticeForm({
  reportedUrl,
  initialType,
}: {
  reportedUrl: string;
  initialType: NoticeType;
}) {
  const urlId = useId();
  const nameId = useId();
  const emailId = useId();
  const phoneId = useId();
  const addressId = useId();
  const holderId = useId();
  const workId = useId();
  const signatureId = useId();

  const [noticeType, setNoticeType] = useState<NoticeType>(initialType);
  const [contentUrl, setContentUrl] = useState(reportedUrl);
  const [reporterName, setReporterName] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');
  const [reporterAddress, setReporterAddress] = useState('');
  const [rightsHolder, setRightsHolder] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [signature, setSignature] = useState('');
  const [affirmed, setAffirmed] = useState<Record<StatementId, boolean>>({
    goodFaith: false,
    accurate: false,
    authorized: false,
  });

  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  const copy = NOTICE_TYPES[noticeType];
  const contactRequired = noticeType !== 'impersonation';

  function clearError() {
    if (state === 'error') {
      setState('idle');
      setErrorMsg('');
    }
  }

  function fail(message: string) {
    setErrorMsg(message);
    setState('error');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'submitting') return;

    if (!copy.statements.every((statement) => affirmed[statement.id])) {
      fail('A notice is only actionable with all three statements affirmed.');
      return;
    }

    setState('submitting');
    setErrorMsg('');

    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch('/api/copyright-notice', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          noticeType,
          contentUrl: contentUrl.trim(),
          reporterName: reporterName.trim(),
          reporterEmail: reporterEmail.trim().toLowerCase(),
          reporterPhone: reporterPhone.trim() || undefined,
          reporterAddress: reporterAddress.trim() || undefined,
          rightsHolder: rightsHolder.trim() || undefined,
          workDescription: workDescription.trim(),
          signature: signature.trim(),
          goodFaith: true,
          accurate: true,
          authorized: true,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          fail(
            'Nothing is published at that URL any more, so there is nothing to remove. If you found it elsewhere on this site, paste that link instead.',
          );
          return;
        }
        if (response.status === 400) {
          fail(
            'That link is not a shared conversation or published artifact from this site. Copy the full URL from the page you found.',
          );
          return;
        }
        if (response.status === 429) {
          fail(
            'Too many notices from this network. Wait a while, or email the IP mailbox instead.',
          );
          return;
        }
        fail('Your notice was not recorded. Email the IP mailbox so it still reaches a person.');
        return;
      }

      const body = (await response.json()) as Partial<Result>;
      setResult({
        reference: body.reference ?? '',
        operatorNotified: body.operatorNotified === true,
      });
      setState('idle');
    } catch {
      fail('Your notice was not recorded. Email the IP mailbox so it still reaches a person.');
    }
  }

  if (result) {
    return (
      <div className="agi-ds-stack" data-gap="tight" role="status">
        <h3 className="agi-ds-h3">
          {noticeType === 'impersonation' ? 'Report' : 'Notice'} recorded, reference{' '}
          {result.reference}
        </h3>
        <p className="agi-ds-prose" data-size="sm">
          The notice is in the operator queue with the exact link you reported.{' '}
          <strong>Nothing has been removed yet</strong>, a person reviews the notice and then
          disables the link, because an unreviewed report must not be able to take someone else’s
          page offline.{' '}
          {result.operatorNotified ? (
            <>
              The IP contact has been notified by email. Nobody is paged, so quote the reference if
              you follow up.
            </>
          ) : (
            <>
              <strong>The email notification could not be delivered</strong>, so email the IP
              contact and quote the reference to be certain a person sees it.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="agi-ds-form">
      <fieldset className="agi-ds-fieldset">
        <legend className="agi-ds-fieldset-legend">What you are reporting</legend>
        {NOTICE_TYPE_ORDER.map((type) => (
          <label key={type} className="agi-ds-consent-item-label">
            <input
              type="radio"
              name="noticeType"
              value={type}
              checked={noticeType === type}
              disabled={state === 'submitting'}
              className="agi-ds-checkbox"
              onChange={() => {
                setNoticeType(type);
                setAffirmed({ goodFaith: false, accurate: false, authorized: false });
                clearError();
              }}
            />
            {NOTICE_TYPES[type].label}
          </label>
        ))}
      </fieldset>

      <div className="agi-ds-field">
        <label htmlFor={urlId} className="agi-ds-field-label">
          Link to the material
        </label>
        <input
          id={urlId}
          name="contentUrl"
          type="text"
          required
          spellCheck={false}
          value={contentUrl}
          disabled={state === 'submitting'}
          className="agi-ds-input"
          onChange={(event) => {
            setContentUrl(event.target.value);
            clearError();
          }}
        />
        <p className="agi-ds-hint">
          The full URL of the shared conversation or published artifact. The form checks that it
          still resolves to something public before it records anything: a description alone cannot
          identify the material.
        </p>
      </div>

      <div className="agi-ds-field">
        <label htmlFor={nameId} className="agi-ds-field-label">
          Your full name
        </label>
        <input
          id={nameId}
          name="reporterName"
          type="text"
          required
          value={reporterName}
          disabled={state === 'submitting'}
          className="agi-ds-input"
          onChange={(event) => {
            setReporterName(event.target.value);
            clearError();
          }}
        />
      </div>

      <div className="agi-ds-field">
        <label htmlFor={emailId} className="agi-ds-field-label">
          Email address we should reply to
        </label>
        <input
          id={emailId}
          name="reporterEmail"
          type="email"
          autoComplete="email"
          required
          spellCheck={false}
          value={reporterEmail}
          disabled={state === 'submitting'}
          className="agi-ds-input"
          onChange={(event) => {
            setReporterEmail(event.target.value);
            clearError();
          }}
        />
      </div>

      <div className="agi-ds-field">
        <label htmlFor={phoneId} className="agi-ds-field-label">
          {contactRequired ? 'Telephone number' : 'Telephone number (optional)'}
        </label>
        <input
          id={phoneId}
          name="reporterPhone"
          type="tel"
          autoComplete="tel"
          required={contactRequired}
          value={reporterPhone}
          disabled={state === 'submitting'}
          className="agi-ds-input"
          onChange={(event) => {
            setReporterPhone(event.target.value);
            clearError();
          }}
        />
      </div>

      <div className="agi-ds-field">
        <label htmlFor={addressId} className="agi-ds-field-label">
          {contactRequired ? 'Mailing address' : 'Mailing address (optional)'}
        </label>
        <textarea
          id={addressId}
          name="reporterAddress"
          rows={3}
          required={contactRequired}
          maxLength={500}
          value={reporterAddress}
          disabled={state === 'submitting'}
          className="agi-ds-input"
          onChange={(event) => {
            setReporterAddress(event.target.value);
            clearError();
          }}
        />
        <p className="agi-ds-hint">
          Your name, address, phone, and email are forwarded to the operator and, if the publisher
          counter-notifies, they see the notice. Send only what you are willing to have passed on.
        </p>
      </div>

      <div className="agi-ds-field">
        <label htmlFor={holderId} className="agi-ds-field-label">
          {copy.holderLabel}
        </label>
        <input
          id={holderId}
          name="rightsHolder"
          type="text"
          maxLength={200}
          value={rightsHolder}
          disabled={state === 'submitting'}
          className="agi-ds-input"
          onChange={(event) => setRightsHolder(event.target.value)}
        />
      </div>

      <div className="agi-ds-field">
        <label htmlFor={workId} className="agi-ds-field-label">
          {copy.claimLabel}
        </label>
        <textarea
          id={workId}
          name="workDescription"
          rows={5}
          required
          maxLength={2000}
          value={workDescription}
          disabled={state === 'submitting'}
          className="agi-ds-input"
          onChange={(event) => {
            setWorkDescription(event.target.value);
            clearError();
          }}
        />
        <p className="agi-ds-hint">{copy.claimHint}</p>
      </div>

      <fieldset className="agi-ds-fieldset">
        <legend className="agi-ds-fieldset-legend">Statements</legend>
        {copy.statements.map((statement) => (
          <label key={statement.id} className="agi-ds-consent-item-label">
            <input
              type="checkbox"
              name={statement.id}
              checked={affirmed[statement.id]}
              disabled={state === 'submitting'}
              className="agi-ds-checkbox"
              onChange={(event) => {
                setAffirmed((current) => ({ ...current, [statement.id]: event.target.checked }));
                clearError();
              }}
            />
            {statement.label}
          </label>
        ))}
      </fieldset>

      <div className="agi-ds-field">
        <label htmlFor={signatureId} className="agi-ds-field-label">
          Signature
        </label>
        <input
          id={signatureId}
          name="signature"
          type="text"
          required
          value={signature}
          disabled={state === 'submitting'}
          className="agi-ds-input"
          onChange={(event) => {
            setSignature(event.target.value);
            clearError();
          }}
        />
        <p className="agi-ds-hint">Typing your full name here counts as an electronic signature.</p>
      </div>

      {state === 'error' && errorMsg ? (
        <p role="alert" aria-live="polite" className="agi-ds-form-error">
          {errorMsg}
        </p>
      ) : null}

      <div className="agi-ds-btn-row">
        <button
          type="submit"
          className="agi-ds-btn"
          data-variant="primary"
          disabled={state === 'submitting'}
        >
          {state === 'submitting'
            ? 'Recording…'
            : noticeType === 'impersonation'
              ? 'Send report'
              : 'Send notice'}
        </button>
      </div>
    </form>
  );
}
