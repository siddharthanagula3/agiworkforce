import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, Copy, Maximize2, PenLine, SquarePen, X } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  useUiTranslation,
  useConfirmAction,
} from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
import {
  RICH_BLOCK_ACTION_CLASS,
  RICH_BLOCK_ICON_ACTION_CLASS,
  RichBlockCard,
  useRichBlockCopy,
  type RichBlockCopyState,
} from './RichBlockCard';
import { useRichBlockEdit } from './RichBlockEdit';

interface WritingBlockProps {
  source: string;
  streaming: boolean;
  renderBody: (text: string) => React.ReactNode;
  kind?: string;
  label?: string;
  inline?: boolean;
}

function CopyButton({
  copyState,
  onCopy,
  labels,
}: {
  copyState: RichBlockCopyState;
  onCopy: () => void;
  labels: { idle: string; copied: string; failed: string; text: string; copiedText: string };
}) {
  const label =
    copyState === 'copied' ? labels.copied : copyState === 'failed' ? labels.failed : labels.idle;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onCopy}
      className={RICH_BLOCK_ACTION_CLASS}
      aria-label={label}
    >
      {copyState === 'copied' ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {copyState === 'copied' ? labels.copiedText : labels.text}
    </Button>
  );
}

export function WritingBlock({
  source,
  streaming,
  renderBody,
  kind = 'writing',
  label: labelOverride,
  inline = false,
}: WritingBlockProps) {
  const { t } = useUiTranslation('chat');
  const editorId = useId();
  const inlineId = useId();
  const [edited, setEdited] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const inlineEditorRef = useRef<HTMLTextAreaElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const { confirm, dialog: discardDialog } = useConfirmAction();
  const { copyState, copy } = useRichBlockCopy();
  const { save, saving, error: saveError, canPersist } = useRichBlockEdit();
  const text = edited ?? source;
  const dirty = edited !== null && edited !== source;
  useLayoutEffect(() => {
    if (editing) inlineEditorRef.current?.focus();
  }, [editing]);

  if (!streaming && source.trim() === '' && edited === null) return null;

  const label = labelOverride ?? t('richBlock.writing', 'Writing');
  const copyLabels = {
    idle:
      kind === 'prompt'
        ? t('answerSurface.copyPrompt', 'Copy full prompt')
        : t('richBlock.copyWriting', 'Copy this text'),
    copied: t('richBlock.writingCopied', 'Text copied'),
    failed: t('richBlock.copyFailed', 'Copy failed, clipboard unavailable'),
    text: t('richBlock.copy', 'Copy'),
    copiedText: t('richBlock.copied', 'Copied'),
  };
  const expandLabel = t('richBlock.expandWriting', 'Open larger to read and edit');
  const closeLabel = t('richBlock.closeWriting', 'Close expanded text');
  const copyButton = (
    <CopyButton copyState={copyState} onCopy={() => void copy(text)} labels={copyLabels} />
  );

  const failedStatus =
    copyState === 'failed' || saveError ? (
      <p
        role="status"
        className="border-b border-[var(--chat-border-subtle)] px-4 py-2 text-sm text-[var(--chat-destructive-text)]"
      >
        {saveError
          ? t(
              'richBlock.saveFailed',
              'Changes could not be saved. Your draft is kept here; try again.',
            )
          : copyLabels.failed}
      </p>
    ) : null;

  return (
    <RichBlockCard
      kind={kind}
      icon={<PenLine className="h-4 w-4" />}
      label={label}
      status={failedStatus}
      actions={
        streaming ? null : (
          <>
            {copyButton}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={RICH_BLOCK_ACTION_CLASS}
              aria-label={t('richBlock.editWriting', 'Edit text')}
              ref={editTriggerRef}
              onClick={() => setEditing(true)}
            >
              <SquarePen className="h-4 w-4" aria-hidden="true" />
              {t('richBlock.edit', 'Edit')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(true)}
              className={RICH_BLOCK_ICON_ACTION_CLASS}
              aria-label={expandLabel}
              title={expandLabel}
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        )
      }
    >
      {inline || editing ? (
        <label className="block px-4 py-3" htmlFor={inlineId}>
          <span className="sr-only">{label}</span>
          <textarea
            id={inlineId}
            ref={inlineEditorRef}
            value={text}
            readOnly={streaming || saving}
            onChange={(event) => setEdited(event.target.value)}
            className="min-h-28 w-full resize-y bg-transparent text-base leading-[26px] text-[var(--chat-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus-ring)]"
          />
        </label>
      ) : (
        <div className="px-4 pt-3 pb-1 text-[var(--chat-text-primary)]">{renderBody(text)}</div>
      )}
      {dirty && !streaming ? (
        <div className="flex gap-2 border-t border-[var(--chat-border-subtle)] px-4 py-3">
          {canPersist ? (
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() =>
                void save(text).then((saved) => {
                  if (saved) {
                    setEditing(false);
                  }
                })
              }
            >
              {saving
                ? t('richBlock.saving', 'Saving…')
                : t('richBlock.saveChanges', 'Save changes')}
            </Button>
          ) : (
            <p className="text-xs text-[var(--chat-text-secondary)]">
              {t('richBlock.temporaryEdits', 'Edits are temporary in this view.')}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() =>
              confirm({
                title: t('richBlock.discardTitle', 'Discard unsaved changes?'),
                description: t(
                  'richBlock.discardDescription',
                  'Your unsaved changes to this draft will be lost.',
                ),
                confirmLabel: t('richBlock.discardChanges', 'Discard changes'),
                cancelLabel: t('richBlock.keepEditing', 'Keep editing'),
                onConfirm: () => {
                  setEdited(null);
                  setEditing(false);
                  requestAnimationFrame(() => editTriggerRef.current?.focus());
                },
              })
            }
          >
            {t('richBlock.cancelEdit', 'Cancel')}
          </Button>
        </div>
      ) : null}
      {discardDialog}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          hideCloseButton
          disableAnimation
          aria-describedby={undefined}
          className="inset-4 mx-auto flex w-auto max-w-4xl max-h-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border border-[var(--chat-border)] bg-[var(--chat-bg)] p-0 backdrop-blur-none"
        >
          <div className="flex min-h-12 items-center justify-between gap-2 border-b border-[var(--chat-border-subtle)] py-1 ps-4 pe-2">
            <DialogTitle className="flex items-center gap-2 text-sm font-medium text-[var(--chat-text-secondary)]">
              <PenLine className="h-4 w-4" aria-hidden="true" />
              {label}
            </DialogTitle>
            <div className="flex items-center gap-0.5">
              {copyButton}
              {dirty && canPersist ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    void save(text).then((saved) => {
                      if (saved) setExpanded(false);
                    })
                  }
                >
                  {saving
                    ? t('richBlock.saving', 'Saving…')
                    : t('richBlock.saveChanges', 'Save changes')}
                </Button>
              ) : null}
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={RICH_BLOCK_ICON_ACTION_CLASS}
                  aria-label={closeLabel}
                  title={closeLabel}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DialogClose>
            </div>
          </div>
          {failedStatus}
          <label htmlFor={editorId} className="sr-only">
            {t('richBlock.editWriting', 'Edit text')}
          </label>
          <textarea
            id={editorId}
            value={text}
            readOnly={streaming || saving}
            onChange={(event) => setEdited(event.target.value)}
            className={cn(
              'min-h-0 flex-1 resize-none overflow-auto overscroll-contain bg-transparent',
              'mx-auto w-full max-w-3xl px-6 py-5 text-base leading-[26px] text-[var(--chat-text-primary)]',
              'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus-ring)]',
            )}
          />
        </DialogContent>
      </Dialog>
    </RichBlockCard>
  );
}
