'use client';

import { useId, useState } from 'react';
import { ChevronDown, ChevronRight } from '@agiworkforce/icons';
import { diffLineKind } from '../code-diff';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;

export function DiffBody({ body }: { body: string }) {
  return (
    <pre className={styles['diff']}>
      {body.split('\n').map((line, index) => (
        <span
          key={`${index}:${line}`}
          className={`${styles['diffLine']} ${styles[`diffLine-${diffLineKind(line)}`]}`}
        >
          {line}
        </span>
      ))}
    </pre>
  );
}

export function ChangedFile({
  path,
  state,
  body,
  initiallyExpanded = false,
}: {
  path: string;
  state: string;
  body?: string;
  initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const regionId = useId();

  if (!body) {
    return (
      <div className={styles['fileRow']}>
        <span className={styles['fileStatus']}>{state}</span>
        <span className={styles['fileName']}>{path}</span>
      </div>
    );
  }

  return (
    <div className={styles['fileBlock']}>
      <button
        type="button"
        className={styles['fileRow']}
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className={styles['activityChevron']}>
          {expanded ? (
            <ChevronDown size={GLYPH_SIZE} aria-hidden="true" />
          ) : (
            <ChevronRight size={GLYPH_SIZE} aria-hidden="true" />
          )}
        </span>
        <span className={styles['fileStatus']}>{state}</span>
        <span className={styles['fileName']}>{path}</span>
      </button>
      {expanded && (
        <div id={regionId}>
          <DiffBody body={body} />
        </div>
      )}
    </div>
  );
}
