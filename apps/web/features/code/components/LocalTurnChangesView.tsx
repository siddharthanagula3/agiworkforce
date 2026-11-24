'use client';

import { turnDiffByPath } from '../code-diff';
import {
  LOCAL_CODE_COPY,
  localFileChangeLabel,
  localWorkspaceRelativePath,
  type LocalTurnChanges,
} from '../local-code';
import { ChangedFile } from './CodeDiffFile';
import styles from '../CloudCodePage.module.css';

const OPEN_WHEN_AT_MOST = 1;

/** What one turn changed, file by file, as the diff the CLI computed for it. */
export function LocalTurnChangesView({
  changes,
  workspace,
}: {
  changes: LocalTurnChanges;
  workspace: string;
}) {
  const bodies = turnDiffByPath(changes.unifiedDiff, changes.paths);
  const paths = changes.paths.length > 0 ? [...new Set(changes.paths)] : [...bodies.keys()];
  if (paths.length === 0) return null;
  const heading = LOCAL_CODE_COPY.turnChanges(paths.length);

  return (
    <section aria-label={heading} data-testid="local-turn-changes">
      <p className={styles['statusLine']}>{heading}</p>
      <div className={styles['fileList']}>
        {paths.map((path) => (
          <ChangedFile
            key={path}
            path={localWorkspaceRelativePath(path, workspace)}
            state={localFileChangeLabel(changes, path)}
            body={bodies.get(path)}
            initiallyExpanded={paths.length <= OPEN_WHEN_AT_MOST}
          />
        ))}
      </div>
    </section>
  );
}
