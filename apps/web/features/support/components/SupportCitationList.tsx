'use client';

import type { SupportCitation } from '../lib/contract';
import { isInternalCitationUrl } from '../lib/normalize-answer';
import styles from './SupportWidget.module.css';

export function SupportCitationList({
  citations,
  label = 'Sources',
}: {
  citations: SupportCitation[];
  label?: string;
}) {
  if (citations.length === 0) return null;

  return (
    <>
      <p className={styles['citationsLabel']}>{label}</p>
      <ul className={styles['citations']} data-support-citations="">
        {citations.map((citation) => {
          const internal = isInternalCitationUrl(citation.url);
          return (
            <li key={citation.id} className={styles['citationItem']}>
              <a
                className={styles['citationLink']}
                href={citation.url}
                data-support-citation=""
                {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              >
                {citation.title}
                {internal ? null : <span className="sr-only"> (opens in a new tab)</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}
