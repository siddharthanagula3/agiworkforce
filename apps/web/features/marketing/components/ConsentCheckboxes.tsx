'use client';

import Link from 'next/link';
import { useId } from 'react';

import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import type { ConsentDecision, ConsentPurpose } from '@/lib/consent-purposes';

/**
 * Per-purpose opt-in checkboxes for a data-entry point.
 *
 * DPDP s.6(1) requires consent to be given by a "clear affirmative action", so
 * every box here is rendered UNTICKED and there is no pre-selection, no
 * "select all", and no styling that makes a ticked box the path of least
 * resistance. s.5 requires the notice to accompany or precede the request, so
 * the notice link is inside the same block rather than in a footer.
 *
 * s.6(1) also forbids bundling: a purpose marked `necessaryForRequest: false`
 * must never block submission. The parent form enforces that by only requiring
 * the necessary purposes; this component simply labels which is which so the
 * person can see that the optional box is genuinely optional.
 *
 * The unticked state is not "no answer". The submitting form sends a decision
 * for every purpose shown, including the ones left unticked, so the record
 * distinguishes a refusal from never having been asked.
 */
export function ConsentCheckboxes({
  purposes,
  value,
  onChange,
  disabled = false,
}: {
  purposes: readonly ConsentPurpose[];
  /** Ticked purposes, by id. Starts empty — never seed this with a purpose. */
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
                // Controlled from an empty initial array: the box is unticked on
                // first paint and stays unticked until the person clicks it.
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

/**
 * Turn the ticked set into the decision array the API expects.
 *
 * Every purpose that was ON SCREEN produces a decision, ticked or not. Sending
 * only the ticked ones would record a refusal as an absence, and an absence
 * cannot be told apart from never having asked.
 */
export function toConsentDecisions(
  purposes: readonly ConsentPurpose[],
  ticked: readonly string[],
): ConsentDecision[] {
  return purposes.map((purpose) => ({
    purpose: purpose.id,
    granted: ticked.includes(purpose.id),
  }));
}

/**
 * The required purposes that have not been ticked. Non-empty means the form
 * must not submit — not because we want the extra data, but because storing an
 * address for a purpose nobody agreed to is the thing DPDP forbids.
 */
export function missingRequiredConsents(
  purposes: readonly ConsentPurpose[],
  ticked: readonly string[],
): ConsentPurpose[] {
  return purposes.filter((purpose) => purpose.necessaryForRequest && !ticked.includes(purpose.id));
}
