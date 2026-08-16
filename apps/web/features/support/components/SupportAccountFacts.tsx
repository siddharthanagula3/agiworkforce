'use client';

import type { SupportAccountFact } from '../lib/contract';
import styles from './SupportWidget.module.css';

export function SupportAccountFacts({
  planLabel,
  facts,
}: {
  planLabel: string | null;
  facts: SupportAccountFact[];
}) {
  if (facts.length === 0 && !planLabel) return null;

  return (
    <details className={styles['facts']} data-support-account-facts="">
      <summary className={styles['factsSummary']}>
        What I can see about your account{planLabel ? ` · ${planLabel}` : ''}
      </summary>
      <dl className={styles['factsList']}>
        {facts.map((fact) => (
          <div key={fact.label} style={{ display: 'contents' }}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
