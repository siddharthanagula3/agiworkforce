'use client';

import type { ReactNode } from 'react';
import styles from '../CloudCodePage.module.css';

export interface LocalListNoticeProps {
  line: string;
  summary: string;
  items: readonly string[];
  actions?: ReactNode;
  testId?: string;
}

/** A status line whose full list sits in a disclosure under it. */
export function LocalListNotice({ line, summary, items, actions, testId }: LocalListNoticeProps) {
  return (
    <div className={styles['notice']} role="status" data-testid={testId}>
      <div className={styles['testsNoticeBody']}>
        <span>{line}</span>
        {items.length > 0 && (
          <details>
            <summary>{summary}</summary>
            <pre className={styles['activityOutput']}>{items.join('\n')}</pre>
          </details>
        )}
      </div>
      {actions !== undefined && <span className={styles['noticeActions']}>{actions}</span>}
    </div>
  );
}
