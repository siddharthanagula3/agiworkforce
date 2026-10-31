import React, { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, SquarePen } from 'lucide-react';
import { Button, Input, Textarea, useConfirmAction, useUiTranslation } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
import {
  RICH_BLOCK_ACTION_CLASS,
  RICH_BLOCK_ICON_ACTION_CLASS,
  RichBlockCard,
  useRichBlockCopy,
} from './RichBlockCard';
import {
  emailMailtoLink,
  emailPlainText,
  type EmailDraft,
  type EmailField,
  type ParsedEmailBlock,
} from './richBlocks';
import { useRichBlockEdit } from './RichBlockEdit';

const FIELD_INPUT_CLASS =
  'h-auto min-h-11 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-2 text-[length:var(--chat-type-writing-subject-size)] leading-[var(--chat-type-writing-subject-height)] [font-weight:var(--chat-type-writing-subject-weight)] text-[var(--chat-text-primary)] shadow-none placeholder:text-[var(--chat-text-placeholder)] focus-visible:ring-inset focus-visible:ring-[var(--chat-focus-ring)] focus-visible:ring-offset-0 read-only:cursor-default';
const FIELD_ROW_CLASS = 'flex items-start gap-3 border-b border-[var(--chat-border-subtle)] px-5';
const FIELD_LABEL_CLASS =
  'w-14 shrink-0 py-2.5 text-sm leading-6 text-[var(--chat-text-secondary)]';

function useAutoHeight(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    };
    resize();
    if (typeof ResizeObserver === 'undefined') return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.clientWidth;
      if (nextWidth === width) return;
      width = nextWidth;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);
  return ref;
}

interface EmailBlockProps {
  parsed: ParsedEmailBlock;
  streaming: boolean;
}

export function EmailBlock({ parsed, streaming }: EmailBlockProps) {
  const { t } = useUiTranslation('chat');
  const idPrefix = useId();
  const [edits, setEdits] = useState<Partial<EmailDraft>>({});
  const [dirty, setDirty] = useState(false);
  const [showEmptyFields, setShowEmptyFields] = useState(false);
  const [focusedField, setFocusedField] = useState<EmailField | null>(null);
  const { confirm, dialog: discardDialog } = useConfirmAction();
  const [mailNotice, setMailNotice] = useState<'copied' | 'failed' | null>(null);
  const { copyState, copy } = useRichBlockCopy();
  const { save, saving, error: saveError, canPersist } = useRichBlockEdit();
  const draft: EmailDraft = { ...parsed.draft, ...edits };
  const bodyRef = useAutoHeight(draft.body);
  const subjectRef = useAutoHeight(draft.subject);

  const edit = useCallback(
    (field: keyof EmailDraft) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value =
          field === 'subject' ? event.target.value.replace(/[\r\n]/g, '') : event.target.value;
        setEdits((current) => ({ ...current, [field]: value }));
        setDirty(true);
      },
    [],
  );

  const fieldLabels: Record<EmailField, string> = {
    to: t('richBlock.to', 'To'),
    cc: t('richBlock.cc', 'Cc'),
    bcc: t('richBlock.bcc', 'Bcc'),
    subject: t('richBlock.subject', 'Subject'),
  };
  const shownFields: EmailField[] = (['to', 'cc', 'bcc', 'subject'] as const).filter(
    (field) =>
      (field === 'to' || field === 'subject' || parsed.headerFields.includes(field)) &&
      (field === 'subject' ||
        draft[field].trim() !== '' ||
        showEmptyFields ||
        focusedField === field),
  );

  const mailto = emailMailtoLink(draft);
  const handleOpenInMail = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (mailto.bodyIncluded) {
      setMailNotice(null);
      return;
    }
    event.preventDefault();
    const copied = await copy(draft.body);
    setMailNotice(copied ? 'copied' : 'failed');
    if (copied) window.location.href = mailto.href;
  };

  const copyLabel =
    copyState === 'copied'
      ? t('richBlock.emailCopied', 'Email copied')
      : copyState === 'failed'
        ? t('richBlock.copyFailed', 'Copy failed, clipboard unavailable')
        : t('richBlock.copyEmail', 'Copy email');
  const openLabel = t('richBlock.openInMail', 'Open in mail app');
  const label = t('richBlock.email', 'Email');

  const actions = streaming ? null : (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={RICH_BLOCK_ACTION_CLASS}
        aria-label={t('richBlock.editEmail', 'Edit email')}
        aria-pressed={showEmptyFields}
        onClick={() => {
          setShowEmptyFields((current) => !current);
          subjectRef.current?.focus();
        }}
      >
        <SquarePen className="h-4 w-4" aria-hidden="true" />
        {t('richBlock.edit', 'Edit')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void copy(emailPlainText(draft))}
        className={RICH_BLOCK_ICON_ACTION_CLASS}
        aria-label={copyLabel}
        title={copyLabel}
      >
        {copyState === 'copied' ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className={RICH_BLOCK_ACTION_CLASS}
        aria-label={openLabel}
        title={openLabel}
      >
        <a href={mailto.href} onClick={(event) => void handleOpenInMail(event)}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span className="max-sm:sr-only">{openLabel}</span>
        </a>
      </Button>
    </>
  );

  const status =
    copyState === 'failed' || mailNotice || saveError ? (
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'px-5 py-3 text-sm leading-6',
          copyState === 'failed' || mailNotice === 'failed' || saveError
            ? 'text-[var(--chat-destructive-text)]'
            : 'text-[var(--chat-text-secondary)]',
        )}
      >
        {saveError
          ? t(
              'richBlock.saveFailed',
              'Changes could not be saved. Your draft is kept here; try again.',
            )
          : mailNotice === 'failed'
            ? t(
                'richBlock.mailCopyFailed',
                'This message is too long for a mail link and could not be copied, so the mail app was not opened. Try again.',
              )
            : copyState === 'failed'
              ? copyLabel
              : t(
                  'richBlock.bodyCopiedForMail',
                  'This message is too long for a mail link, so it was copied. Paste it into the new email.',
                )}
      </p>
    ) : null;

  return (
    <RichBlockCard kind="email" label={label} actions={actions} status={status}>
      {shownFields.map((field) => {
        const properties = {
          id: `${idPrefix}-${field}`,
          value: draft[field],
          onChange: edit(field),
          onFocus: () => setFocusedField(field),
          onBlur: () => setFocusedField(null),
          readOnly: streaming || saving,
          spellCheck: field === 'subject',
          autoComplete: 'off',
        };
        return (
          <div key={field} className={FIELD_ROW_CLASS}>
            <label htmlFor={`${idPrefix}-${field}`} className={FIELD_LABEL_CLASS}>
              {fieldLabels[field]}
            </label>
            {field === 'subject' ? (
              <Textarea
                {...properties}
                ref={subjectRef}
                rows={1}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
                className={cn(FIELD_INPUT_CLASS, 'resize-none overflow-hidden')}
              />
            ) : (
              <Input {...properties} type="text" inputMode="email" className={FIELD_INPUT_CLASS} />
            )}
          </div>
        );
      })}
      <label htmlFor={`${idPrefix}-body`} className="sr-only">
        {t('richBlock.body', 'Message')}
      </label>
      <Textarea
        id={`${idPrefix}-body`}
        ref={bodyRef}
        value={draft.body}
        onChange={edit('body')}
        readOnly={streaming || saving}
        rows={1}
        className="block min-h-0 w-full resize-none overflow-hidden rounded-none border-0 bg-transparent px-5 py-4 text-[length:var(--chat-type-body-size)] leading-[var(--chat-type-body-height)] [font-weight:var(--chat-type-body-weight)] text-[var(--chat-text-primary)] shadow-none focus-visible:ring-inset focus-visible:ring-[var(--chat-focus-ring)] focus-visible:ring-offset-0 read-only:cursor-default"
      />
      {dirty && !streaming ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--chat-border-subtle)] px-5 py-3">
          {canPersist ? (
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() =>
                void save(emailPlainText(draft)).then((saved) => {
                  if (saved) {
                    setDirty(false);
                    setShowEmptyFields(false);
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
            size="sm"
            variant="ghost"
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
                  setEdits({});
                  setDirty(false);
                  setShowEmptyFields(false);
                  requestAnimationFrame(() => subjectRef.current?.focus());
                },
              })
            }
          >
            {t('richBlock.cancelEdit', 'Cancel')}
          </Button>
        </div>
      ) : null}
      {discardDialog}
    </RichBlockCard>
  );
}
