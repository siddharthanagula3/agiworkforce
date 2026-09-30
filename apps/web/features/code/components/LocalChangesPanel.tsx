'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, RefreshCw, Undo2, X } from '@agiworkforce/icons';
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
import { LocalFileEditor } from './LocalFileEditor';
import { LocalPullRequest } from './LocalPullRequest';
import { LocalTerminal } from './LocalTerminal';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;

function LocalChangedFile({
  change,
  body,
  busy,
  onEdit,
  onDiscard,
}: {
  change: WorkingTreeChange;
  body: string | undefined;
  busy: boolean;
  onEdit: (() => void) | null;
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
        {onEdit && (
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={`${LOCAL_CODE_COPY.editFile} ${change.path}`}
            disabled={busy}
            onClick={onEdit}
          >
            <Pencil size={GLYPH_SIZE} aria-hidden="true" />
          </button>
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
  title: string;
  refreshKey: number;
  sessionBusy: boolean;
  onReview: () => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function LocalChangesPanel({
  rootId,
  title,
  refreshKey,
  sessionBusy,
  onReview,
  onClose,
  onDirtyChange,
}: LocalChangesPanelProps) {
  const [changes, setChanges] = useState<WorkingTreeChanges | null>(null);
  const [repository, setRepository] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const { confirm, dialog } = useConfirmAction();

  useEffect(() => {
    onDirtyChange?.(editorDirty);
  }, [editorDirty, onDirtyChange]);

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
      setRevision((count) => count + 1);
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

  const leaveEditor = (proceed: () => void) => {
    if (editing === null || !editorDirty) {
      proceed();
      return;
    }
    confirm({
      title: LOCAL_CODE_COPY.discardEditsTitle,
      description: LOCAL_CODE_COPY.discardEditsDescription(editing),
      confirmLabel: LOCAL_CODE_COPY.discardFileEdits,
      onConfirm: proceed,
    });
  };

  const openEditor = (path: string) => {
    if (path !== editing)
      leaveEditor(() => {
        setEditorDirty(false);
        setEditing(path);
      });
  };

  const diffs = diffByPath(changes?.diff ?? '');
  const folderPath = (path: string): string | null => {
    const prefix = changes?.folderPrefix ?? '';
    return path.startsWith(prefix) ? path.slice(prefix.length) : null;
  };

  return (
    <aside className={styles['changes']} aria-label={CODE_COPY.changesHeading}>
      <div className={styles['changesHeader']}>
        <span className={styles['changesBranch']}>
          <span>{CODE_COPY.changesHeading}</span>
        </span>
        <div className={styles['changesActions']}>
          {changes !== null && changes.files.length > 0 && (
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={sessionBusy}
              onClick={onReview}
            >
              {LOCAL_CODE_COPY.reviewCode}
            </button>
          )}
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
            onClick={() => leaveEditor(onClose)}
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
            {changes.files.map((change) => {
              const editable = change.state === 'deleted' ? null : folderPath(change.path);
              return (
                <LocalChangedFile
                  key={change.path}
                  change={change}
                  body={diffs.get(change.path)}
                  busy={busy}
                  onEdit={editable === null ? null : () => openEditor(editable)}
                  onDiscard={() => discard(change.path)}
                />
              );
            })}
          </div>
        )}

        {editing !== null && (
          <LocalFileEditor
            rootId={rootId}
            path={editing}
            refreshKey={revision}
            onDirtyChange={setEditorDirty}
            onSaved={() => void load()}
            onClose={() => {
              setEditorDirty(false);
              setEditing(null);
            }}
          />
        )}

        {changes?.diffTruncated && (
          <p className={styles['formHelp']}>{CODE_COPY.changesDiffTruncated}</p>
        )}

        <LocalPullRequest rootId={rootId} title={title} refreshKey={refreshKey} />

        <LocalTerminal rootId={rootId} onCommandFinished={() => void load()} />
      </div>
      {dialog}
    </aside>
  );
}
