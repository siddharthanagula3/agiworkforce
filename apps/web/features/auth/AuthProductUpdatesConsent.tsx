'use client';

import { useId } from 'react';

import { PRODUCT_UPDATES_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE } from '@/lib/consent-signals';

import { useAuthCopy } from './authCopy';
import {
  AUTH_CHECKBOX_CLASS,
  AUTH_HELD_CHECK_ROW_CLASS,
  AUTH_OPTIONAL_CHECK_NOTE_CLASS,
  AUTH_OPTIONAL_CHECK_ROW_CLASS,
} from './authStyles';
import type { ProductUpdatesChoice } from './productUpdatesChoice';

export function AuthProductUpdatesConsent({
  choice,
  disabled,
  className,
}: {
  choice: ProductUpdatesChoice;
  disabled: boolean;
  className?: string;
}) {
  const copy = useAuthCopy();
  const checkboxId = useId();
  const noteId = useId();
  const held = choice.refusedBySignal;

  return (
    <div className={className} data-testid="auth-product-updates-consent">
      <label
        htmlFor={checkboxId}
        className={held ? AUTH_HELD_CHECK_ROW_CLASS : AUTH_OPTIONAL_CHECK_ROW_CLASS}
      >
        {/* Held, not disabled: a disabled box takes no focus, so a keyboard never reaches the reason. */}
        <input
          id={checkboxId}
          type="checkbox"
          checked={choice.wanted}
          disabled={disabled}
          aria-disabled={held || undefined}
          aria-describedby={held ? noteId : undefined}
          onChange={(event) => choice.choose(event.target.checked)}
          className={AUTH_CHECKBOX_CLASS}
        />
        <span>
          {copy.text('flow.consent.productUpdates', PRODUCT_UPDATES_CONSENT_PURPOSE.label)}
        </span>
      </label>
      {held ? (
        <p id={noteId} className={AUTH_OPTIONAL_CHECK_NOTE_CLASS}>
          {copy.text('flow.consent.refusedBySignal', GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE)}
        </p>
      ) : null}
    </div>
  );
}
