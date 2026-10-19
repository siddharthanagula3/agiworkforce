'use client';

import { useId, useState, type FormEvent } from 'react';
import {
  PARTNER_APPLICATION_KINDS,
  PARTNER_APPLICATION_KIND_LABELS,
  PARTNER_APPLICATION_MAX_MESSAGE_LENGTH,
  PARTNER_APPLICATION_PATH,
  PartnerApplicationResponseSchema,
  type PartnerApplicationKind,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { apiErrorMessage } from '@/lib/client/api-error-message';
import { SuccessState } from '@shared/components/SuccessState';

const NOT_SENT = 'Your application was not sent, so nothing reached us. Try again.';
const MIN_MESSAGE_LENGTH = 20;

export function PartnerApplicationForm() {
  const nameId = useId();
  const emailId = useId();
  const companyId = useId();
  const websiteId = useId();
  const kindId = useId();
  const messageId = useId();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [kind, setKind] = useState<PartnerApplicationKind | ''>('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!fullName.trim() || !email.trim() || !company.trim() || !kind) {
      setError('Add your name, email, company and what you want to build.');
      return;
    }
    if (message.trim().length < MIN_MESSAGE_LENGTH) {
      setError(`Tell us a little more: at least ${MIN_MESSAGE_LENGTH} characters.`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(PARTNER_APPLICATION_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          company: company.trim(),
          website: website.trim() || null,
          kind,
          message: message.trim(),
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          response.status === 429
            ? 'Too many applications from this network. Try again later.'
            : apiErrorMessage(body, NOT_SENT),
        );
        return;
      }
      setReference(PartnerApplicationResponseSchema.parse(body).reference);
    } catch {
      setError(NOT_SENT);
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <SuccessState
        title="Application sent."
        description={`Your reference is ${reference}. We read every application and reply to the email you gave us.`}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="agi-ds-form">
      <div className="agi-ds-field">
        <label htmlFor={nameId} className="agi-ds-field-label">
          Your name
        </label>
        <input
          id={nameId}
          type="text"
          required
          maxLength={120}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          className="agi-ds-input"
        />
      </div>
      <div className="agi-ds-field">
        <label htmlFor={emailId} className="agi-ds-field-label">
          Work email
        </label>
        <input
          id={emailId}
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className="agi-ds-input"
        />
      </div>
      <div className="agi-ds-field">
        <label htmlFor={companyId} className="agi-ds-field-label">
          Company
        </label>
        <input
          id={companyId}
          type="text"
          required
          maxLength={160}
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          autoComplete="organization"
          className="agi-ds-input"
        />
      </div>
      <div className="agi-ds-field">
        <label htmlFor={websiteId} className="agi-ds-field-label">
          Website <span>(optional)</span>
        </label>
        <input
          id={websiteId}
          type="url"
          maxLength={300}
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          autoComplete="url"
          className="agi-ds-input"
        />
      </div>
      <div className="agi-ds-field">
        <label htmlFor={kindId} className="agi-ds-field-label">
          What do you want to build with us?
        </label>
        <select
          id={kindId}
          required
          value={kind}
          onChange={(event) => setKind(event.target.value as PartnerApplicationKind | '')}
          className="agi-ds-input"
        >
          <option value="">Select…</option>
          {PARTNER_APPLICATION_KINDS.map((entry) => (
            <option key={entry} value={entry}>
              {PARTNER_APPLICATION_KIND_LABELS[entry]}
            </option>
          ))}
        </select>
      </div>
      <div className="agi-ds-field">
        <label htmlFor={messageId} className="agi-ds-field-label">
          Tell us about it
        </label>
        <textarea
          id={messageId}
          rows={5}
          required
          maxLength={PARTNER_APPLICATION_MAX_MESSAGE_LENGTH}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="agi-ds-input"
        />
      </div>
      {error ? (
        <p role="alert" className="agi-ds-form-error">
          {error}
        </p>
      ) : null}
      <button type="submit" className="agi-ds-btn" data-variant="primary" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send application'}
      </button>
    </form>
  );
}
