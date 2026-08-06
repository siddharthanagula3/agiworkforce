'use client';

/**
 * What the widget renders when the action layer refuses a destructive or
 * irreversible intent (delete account, cancel subscription, change plan,
 * remove a member, transfer ownership).
 *
 * The defining property is a negative one: this component renders NO confirm
 * button, and there is no prop that could give it one. The agent explains and
 * links the real control; the user performs the change themselves in the
 * product. A test asserts the absence.
 */

import type { SupportRefusedAction } from '../lib/contract';
import styles from './SupportWidget.module.css';

export function SupportRefusalCard({ refusal }: { refusal: SupportRefusedAction }) {
  return (
    <div className={styles['card']} data-support-action-state="refused">
      <p className={styles['cardTitle']}>I am not going to do that for you</p>
      <p className={styles['cardBody']}>{refusal.explanation}</p>
      {refusal.control ? (
        <div className={styles['cardActions']}>
          <a className={styles['ghostButton']} href={refusal.control.href}>
            {refusal.control.label}
          </a>
        </div>
      ) : null}
    </div>
  );
}
