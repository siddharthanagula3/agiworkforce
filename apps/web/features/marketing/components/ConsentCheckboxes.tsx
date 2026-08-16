'use client';

import Link from 'next/link';
import { useId } from 'react';

import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import type { ConsentDecision, ConsentPurpose } from '@/lib/consent-purposes';

export function ConsentCheckboxes({
  purposes,
  value,
  onChange,
  disabled = false,
}: {
  purposes: readonly ConsentPurpose[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const groupId = useId();

  const toggle = (id: string, checked: boolean) => {
    const next = checked ? [...value, id] : value.filter((existing) => existing !== id);
    onChange(next);
  };

  return (
    <fieldset className="agi-consent-fieldset" aria-describedby={`${groupId}-notice`}>
      <legend className="agi-consent-legend">What you are agreeing to</legend>

      {purposes.map((purpose) => {
        const inputId = `${groupId}-${purpose.id}`;
        return (
          <div key={purpose.id} className="agi-consent-item">
            <label htmlFor={inputId} className="agi-consent-label">
              <input
                id={inputId}
                type="checkbox"
                name={`consent-${purpose.id}`}
                checked={value.includes(purpose.id)}
                disabled={disabled}
                onChange={(event) => toggle(purpose.id, event.target.checked)}
                className="agi-consent-checkbox"
              />
              <span>
                {purpose.label}{' '}
                <span className="agi-consent-optionality">
                  {purpose.necessaryForRequest ? '(required for this request)' : '(optional)'}
                </span>
              </span>
            </label>
            <p className="agi-consent-description">{purpose.description}</p>
          </div>
        );
      })}

      <p id={`${groupId}-notice`} className="agi-consent-notice">
        Read what we collect and why in the{' '}
        <Link
          href={CANONICAL_POLICY_ROUTES.privacy}
          target="_blank"
          rel="noopener noreferrer"
          className="agi-consent-notice-link"
        >
          privacy notice
        </Link>{' '}
        (revision {POLICY_LAST_UPDATED.privacy}), including the India-specific notice at{' '}
        <Link
          href="/privacy/india"
          target="_blank"
          rel="noopener noreferrer"
          className="agi-consent-notice-link"
        >
          /privacy/india
        </Link>
        . You can withdraw any of these at{' '}
        <Link
          href="/privacy/requests"
          target="_blank"
          rel="noopener noreferrer"
          className="agi-consent-notice-link"
        >
          /privacy/requests
        </Link>{' '}
        without losing access to anything you did not withdraw.
      </p>
    </fieldset>
  );
}

export function toConsentDecisions(
  purposes: readonly ConsentPurpose[],
  ticked: readonly string[],
): ConsentDecision[] {
  return purposes.map((purpose) => ({
    purpose: purpose.id,
    granted: ticked.includes(purpose.id),
  }));
}

export function missingRequiredConsents(
  purposes: readonly ConsentPurpose[],
  ticked: readonly string[],
): ConsentPurpose[] {
  return purposes.filter((purpose) => purpose.necessaryForRequest && !ticked.includes(purpose.id));
}
