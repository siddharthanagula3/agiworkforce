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
    <fieldset className="agi-ds-fieldset" aria-describedby={`${groupId}-notice`}>
      <legend className="agi-ds-fieldset-legend">What you are agreeing to</legend>

      {purposes.map((purpose) => {
        const inputId = `${groupId}-${purpose.id}`;
        return (
          <div key={purpose.id} className="agi-ds-consent-item">
            <label htmlFor={inputId} className="agi-ds-consent-item-label">
              {/* `.agi-ds-checkbox` is a 16x16 box with no hit-area
                  expansion, under the 24x24 target minimum. The wrapping
                  `<label>` already extends the click target sideways across
                  the text, but a single-line purpose renders under 24px
                  tall. Extending via a wrapper span's pseudo-element (rather
                  than one on the input itself, which has inconsistent
                  cross-browser support for generated content on form
                  controls) keeps the drawn checkbox the same size. */}
              <span className="relative inline-flex shrink-0 before:absolute before:-inset-2 before:content-['']">
                <input
                  id={inputId}
                  type="checkbox"
                  name={`consent-${purpose.id}`}
                  checked={value.includes(purpose.id)}
                  disabled={disabled}
                  onChange={(event) => toggle(purpose.id, event.target.checked)}
                  className="agi-ds-checkbox"
                />
              </span>
              <span>
                {purpose.label}{' '}
                <span className="agi-ds-consent-optionality">
                  {purpose.necessaryForRequest ? '(required for this request)' : '(optional)'}
                </span>
              </span>
            </label>
            <p className="agi-ds-consent-item-description">{purpose.description}</p>
          </div>
        );
      })}

      <p id={`${groupId}-notice`} className="agi-ds-consent-notice">
        Read what we collect and why in the{' '}
        <Link
          href={CANONICAL_POLICY_ROUTES.privacy}
          target="_blank"
          rel="noopener noreferrer"
          className="agi-ds-link"
        >
          privacy notice
        </Link>{' '}
        (revision {POLICY_LAST_UPDATED.privacy}), including the India-specific notice at{' '}
        <Link
          href="/privacy/india"
          target="_blank"
          rel="noopener noreferrer"
          className="agi-ds-link"
        >
          /privacy/india
        </Link>
        . You can withdraw any of these at{' '}
        <Link
          href="/privacy/requests"
          target="_blank"
          rel="noopener noreferrer"
          className="agi-ds-link"
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
