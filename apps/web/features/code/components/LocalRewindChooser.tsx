'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';
import { DEVELOPER_THREAD_REVERT_RESTORES } from '@agiworkforce/local-runtime-contract';
import type { ThreadRevertRestore } from '@agiworkforce/types/protocol';
import { LOCAL_REVIEW_COPY } from '../local-code';
import styles from '../CloudCodePage.module.css';

export interface LocalRewindTarget {
  turnId: string;
  /** The turn's number in the review pane; null when only a transcript message names it. */
  index: number | null;
  /** Whether the conversation can still be cut back to before this turn. */
  conversation: boolean;
}

export interface LocalRewindChooserProps {
  target: LocalRewindTarget | null;
  /** False against a CLI that rewinds the files and the conversation only together. */
  canChooseRestore: boolean;
  onChoose: (restore: ThreadRevertRestore) => void;
  /** Offered when the CLI can summarize the conversation from a turn onward. */
  onSummarize?: () => void;
  onClose: () => void;
}

/**
 * What a rewind puts back: the files, the conversation or both, or a summary
 * of the conversation from this turn on. The choice comes before the preview,
 * so the confirmation that follows names exactly what that choice loses.
 */
export function LocalRewindChooser({
  target,
  canChooseRestore,
  onChoose,
  onSummarize,
  onClose,
}: LocalRewindChooserProps) {
  const choices = DEVELOPER_THREAD_REVERT_RESTORES.filter((restore) =>
    canChooseRestore
      ? restore === 'code' || target?.conversation === true
      : restore === 'both' && target?.conversation === true,
  );

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target?.index === null
              ? LOCAL_REVIEW_COPY.chooseHereTitle
              : LOCAL_REVIEW_COPY.chooseTitle}
          </DialogTitle>
          <DialogDescription>{LOCAL_REVIEW_COPY.checkpointScope}</DialogDescription>
        </DialogHeader>
        {target?.conversation === false && (
          <p className={styles['statusLine']}>{LOCAL_REVIEW_COPY.notRewindable}</p>
        )}
        <div className={styles['optionList']} data-testid="local-rewind-choices">
          {choices.map((restore) => (
            <button
              key={restore}
              type="button"
              className={`${styles['option']} ${styles['optionButton']}`}
              onClick={() => onChoose(restore)}
            >
              <span>
                <span className={styles['optionLabel']}>
                  {LOCAL_REVIEW_COPY.restoreLabel[restore]}
                </span>
                <span className={styles['optionCopy']}>
                  {LOCAL_REVIEW_COPY.restoreCopy[restore]}
                </span>
              </span>
            </button>
          ))}
          {onSummarize && target?.conversation === true && (
            <button
              type="button"
              className={`${styles['option']} ${styles['optionButton']}`}
              onClick={onSummarize}
            >
              <span>
                <span className={styles['optionLabel']}>{LOCAL_REVIEW_COPY.summarizeLabel}</span>
                <span className={styles['optionCopy']}>{LOCAL_REVIEW_COPY.summarizeCopy}</span>
              </span>
            </button>
          )}
          <button type="button" className={styles['secondaryButton']} onClick={onClose}>
            {LOCAL_REVIEW_COPY.chooseCancel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
