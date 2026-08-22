'use client';

import { useId, useState, type FormEvent } from 'react';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { SuccessState } from '@shared/components/SuccessState';

const ROLES = [
  'Software engineering',
  'Data science / ML',
  'Product management',
  'Design / UX',
  'Operations',
  'Research / Academia',
  'Student',
  'Other',
] as const;

const SURFACES = [
  { id: 'web', label: 'Web' },
  { id: 'desktop', label: 'Desktop app' },
  { id: 'mobile', label: 'Mobile app' },
  { id: 'chrome', label: 'Chrome extension' },
  { id: 'vscode', label: 'VS Code extension' },
  { id: 'cli', label: 'CLI' },
] as const;

const MAX_USE_CASE = 1500;

export function BetaApplicationForm() {
  const nameId = useId();
  const emailId = useId();
  const roleId = useId();
  const companyId = useId();
  const useCaseId = useId();
  const discordId = useId();
  const errorId = useId();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [surfaces, setSurfaces] = useState<string[]>([]);
  const [useCase, setUseCase] = useState('');
  const [discordHandle, setDiscordHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [recorded, setRecorded] = useState<{ alreadyReviewed: boolean } | null>(null);

  function toggleSurface(id: string) {
    setSurfaces((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (!fullName.trim()) {
      setErrorMsg('Tell us what to call you.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Enter an email address we can reply to.');
      return;
    }
    if (!role) {
      setErrorMsg('Choose the closest description of your work.');
      return;
    }
    if (surfaces.length === 0) {
      setErrorMsg('Pick at least one surface you would actually test.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/beta/apply', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          role,
          company: company.trim() || null,
          surfaces,
          useCase: useCase.trim() || null,
          discordHandle: discordHandle.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        const message =
          typeof (body as { message?: unknown }).message === 'string'
            ? (body as { message: string }).message
            : null;
        setErrorMsg(
          res.status === 429
            ? 'Too many applications from this network. Try again later.'
            : (message ??
              body.error ??
              'Your application was not recorded, so nothing was stored.'),
        );
        return;
      }

      const body = (await res.json()) as { alreadyReviewed?: boolean };
      setRecorded({ alreadyReviewed: body.alreadyReviewed === true });
    } catch {
      setErrorMsg('Your application was not recorded, so nothing was stored.');
    } finally {
      setSubmitting(false);
    }
  }

  if (recorded) {
    return (
      <SuccessState
        title={recorded.alreadyReviewed ? 'Application updated.' : 'Application received.'}
        description={
          recorded.alreadyReviewed
            ? 'We already reviewed an application from this address, so we updated your details rather than starting again. That earlier decision still stands.'
            : 'One application per email address — submitting again updates this one. If you are picked we email the address you gave us.'
        }
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="agi-rights-form">
      <div className="agi-rights-field">
        <label htmlFor={nameId} className="agi-rights-label">
          Your name
        </label>
        <input
          id={nameId}
          name="fullName"
          type="text"
          required
          maxLength={120}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
        />
      </div>

      <div className="agi-rights-field">
        <label htmlFor={emailId} className="agi-rights-label">
          Email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="agi-rights-field">
        <label htmlFor={roleId} className="agi-rights-label">
          What best describes your work?
        </label>
        <select
          id={roleId}
          name="role"
          required
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">Select…</option>
          {ROLES.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>

      <div className="agi-rights-field">
        <label htmlFor={companyId} className="agi-rights-label">
          Company <span>(optional)</span>
        </label>
        <input
          id={companyId}
          name="company"
          type="text"
          maxLength={120}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          autoComplete="organization"
        />
      </div>

      <fieldset className="agi-rights-field">
        <legend className="agi-rights-label">Which would you actually use?</legend>
        {SURFACES.map((surface) => (
          <label key={surface.id} className="agi-rights-check">
            <input
              type="checkbox"
              name="surfaces"
              value={surface.id}
              checked={surfaces.includes(surface.id)}
              onChange={() => toggleSurface(surface.id)}
            />
            {surface.label}
          </label>
        ))}
      </fieldset>

      <div className="agi-rights-field">
        <label htmlFor={useCaseId} className="agi-rights-label">
          What would you use it for? <span>(optional)</span>
        </label>
        <textarea
          id={useCaseId}
          name="useCase"
          rows={4}
          maxLength={MAX_USE_CASE}
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
        />
      </div>

      <div className="agi-rights-field">
        <label htmlFor={discordId} className="agi-rights-label">
          Discord handle <span>(optional)</span>
        </label>
        <input
          id={discordId}
          name="discordHandle"
          type="text"
          maxLength={64}
          value={discordHandle}
          onChange={(e) => setDiscordHandle(e.target.value)}
        />
      </div>

      {errorMsg ? (
        <p id={errorId} role="alert" className="agi-rights-error">
          {errorMsg}
        </p>
      ) : null}

      <button type="submit" className="agi-cta-primary" disabled={submitting}>
        {submitting ? 'Sending…' : 'Apply to test'}
      </button>
    </form>
  );
}
