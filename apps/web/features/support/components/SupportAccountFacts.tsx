'use client';

/**
 * "What I can see about your account", as a collapsed disclosure.
 *
 * It renders the SERVER's model-safe projection, filtered through a display
 * allowlist in `toDisplayFacts`. That is deliberate on two counts: the user can
 * see exactly what the agent was told about them, and a new key added to the
 * projection upstream cannot silently start appearing in the UI.
 *
 * Signed-out visitors never reach this component — the panel renders it only
 * when the server returned a context.
 */

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
