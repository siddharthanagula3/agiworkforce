'use client';

/**
 * The only component in the widget that renders an anchor for a reply.
 *
 * Citations arrive already normalized (`normalize-answer.ts` dropped anything
 * whose URL was not a same-origin path or an http(s) URL), so this component's
 * job is presentation: real links, never colour-only, ≥24px targets, and an
 * explicit screen-reader suffix on anything that opens a new tab.
 *
 * Plain `<a>` rather than `next/link` on purpose — a citation click is a
 * deliberate exit from the widget to the documentation, and a plain anchor
 * keeps this component renderable outside a router context (including in
 * isolation tests).
 */

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
