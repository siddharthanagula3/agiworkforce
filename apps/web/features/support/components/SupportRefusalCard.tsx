'use client';

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
