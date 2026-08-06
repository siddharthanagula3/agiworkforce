'use client';

/**
 * An abstention.
 *
 * This is structurally a different thing from an answer, not a restyled one:
 * a bordered notice with its own heading element, its own `data-support-message`
 * value, a warning mark, and an escalation control attached. A user skimming the
 * panel must not be able to mistake it for a confident reply, and an automated
 * check must be able to tell them apart without inspecting CSS.
 *
 * For the four hard-abstain categories the heading NAMES the category, because
 * "I won't answer billing questions" is more useful — and more honest — than a
 * generic hedge.
 */

import type { SupportAbstentionView } from '../lib/contract';
import { ABSTENTION_HEADING } from '../lib/normalize-answer';
import { renderSupportText } from '../lib/render-text';
import { SupportCitationList } from './SupportCitationList';
import styles from './SupportWidget.module.css';

export function SupportAbstentionCard({
  abstention,
  onEscalate,
  escalateLabel = 'Send this to a person',
  escalationDisabled = false,
}: {
  abstention: SupportAbstentionView;
  onEscalate?: (() => void) | undefined;
  escalateLabel?: string;
  escalationDisabled?: boolean;
}) {
  return (
    <div
      className={styles['abstention']}
      data-support-message="abstention"
      data-support-abstention-reason={abstention.reason}
    >
      <p className={styles['abstentionHeading']}>
        <span aria-hidden="true">⚠</span>
        <span className={styles['abstentionHeadingText']}>
          {ABSTENTION_HEADING[abstention.reason]}
        </span>
      </p>
      <div className={styles['abstentionBody']}>{renderSupportText(abstention.text)}</div>

      <SupportCitationList citations={abstention.citations} label="Where to look" />

      {onEscalate ? (
        <div className={styles['cardActions']}>
          <button
            type="button"
            className={styles['ghostButton']}
            onClick={onEscalate}
            disabled={escalationDisabled}
          >
            {escalateLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
