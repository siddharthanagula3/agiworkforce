'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Undo2, X } from '@agiworkforce/icons';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import type { WorkingTreeChange, WorkingTreeChanges } from '@agiworkforce/local-runtime-contract';
import {
  discardDeveloperSessionChanges,
  readDeveloperSessionChanges,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { CODE_COPY, changeStateLabel } from '../code-surface';
import { diffByPath } from '../code-diff';
import { LOCAL_CODE_COPY } from '../local-code';
import { DiffBody } from './CodeChangesPanel';
import { LocalTerminal } from './LocalTerminal';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;

function LocalChangedFile({
  change,
  body,
  busy,
  onDiscard,
}: {
  change: WorkingTreeChange;
  body: string | undefined;
  busy: boolean;
  onDiscard: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();
  const label = (
    <>
      <span className={styles['fileStatus']}>{changeStateLabel(change.state)}</span>
      <span className={styles['fileName']}>{change.path}</span>
    </>
  );

  return (
    <div className={styles['fileBlock']}>
      <div className={styles['fileSelectRow']}>
        {body ? (
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
            {label}
          </button>
        ) : (
          <div className={styles['fileRow']}>{label}</div>
        )}
        <button
          type="button"
          className={styles['headerButton']}
          aria-label={`${CODE_COPY.changesDiscardFile} ${change.path}`}
          disabled={busy || change.state === 'conflicted'}
          onClick={onDiscard}
        >
          <Undo2 size={GLYPH_SIZE} aria-hidden="true" />
        </button>
      </div>
      {body && expanded && (
        <div id={regionId}>
          <DiffBody body={body} />
        </div>
      )}
    </div>
  );
}

export interface LocalChangesPanelProps {
  rootId: string;
  refreshKey: number;
  onClose: () => void;
}

export function LocalChangesPanel({ rootId, refreshKey, onClose }: LocalChangesPanelProps) {
  const [changes, setChanges] = useState<WorkingTreeChanges | null>(null);
  const [repository, setRepository] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmAction();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const read = await readDeveloperSessionChanges(rootId);
      setRepository(read !== null);
      setChanges(read);
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.changesFailed));
    } finally {
      setLoading(false);
    }
  }, [rootId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const discard = (path: string) => {
    confirm({
      title: CODE_COPY.changesDiscardTitle,
      description: `${CODE_COPY.changesDiscardDescription} ${path}`,
      confirmLabel: CODE_COPY.changesDiscardConfirm,
      onConfirm: async () => {
        setBusy(true);
        setError(null);
        try {
          await discardDeveloperSessionChanges(rootId, [path]);
          await load();
        } catch (cause: unknown) {
          setError(toUserMessage(cause, LOCAL_CODE_COPY.discardFailed));
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const diffs = diffByPath(changes?.diff ?? '');

  return (
    <aside className={styles['changes']} aria-label={CODE_COPY.changesHeading}>
      <div className={styles['changesHeader']}>
        <span className={styles['changesBranch']}>
          <span>{CODE_COPY.changesHeading}</span>
        </span>
        <div className={styles['changesActions']}>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={CODE_COPY.changesRefresh}
            disabled={loading || busy}
            onClick={() => void load()}
          >
            <RefreshCw size={GLYPH_SIZE} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={CODE_COPY.closeChanges}
            onClick={onClose}
          >
            <X size={GLYPH_SIZE} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles['changesBody']}>
        {error !== null && (
          <p className={styles['changesEmpty']} role="alert">
            {error}
          </p>
        )}

        {loading && changes === null && (
          <div className={styles['changesEmpty']}>
            <Spinner size="sm" aria-label={CODE_COPY.changesLoading} />
          </div>
        )}

        {!loading && !repository && (
          <p className={styles['changesEmpty']}>{LOCAL_CODE_COPY.changesNotRepository}</p>
        )}

        {changes !== null && changes.files.length === 0 && (
          <p className={styles['changesEmpty']}>{CODE_COPY.changesNone}</p>
        )}

        {changes !== null && changes.files.length > 0 && (
          <div className={styles['fileList']}>
            {changes.files.map((change) => (
              <LocalChangedFile
                key={change.path}
                change={change}
                body={diffs.get(change.path)}
                busy={busy}
                onDiscard={() => discard(change.path)}
              />
            ))}
          </div>
        )}

        {changes?.diffTruncated && (
          <p className={styles['formHelp']}>{CODE_COPY.changesDiffTruncated}</p>
        )}

        <LocalTerminal rootId={rootId} onCommandFinished={() => void load()} />
      </div>
      {dialog}
    </aside>
  );
}
