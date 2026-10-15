import React, { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Mail } from 'lucide-react';
import { Button, useUiTranslation } from '@agiworkforce/ui';
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

const FIELD_INPUT_CLASS =
  'min-w-0 flex-1 bg-transparent py-2 text-[var(--chat-text-primary)] outline-none placeholder:text-[var(--chat-text-placeholder)] read-only:cursor-default';
const FIELD_ROW_CLASS =
  'flex items-baseline gap-3 border-b border-[var(--chat-border-subtle)] px-4 focus-within:bg-[var(--chat-surface-hover)]';
const FIELD_LABEL_CLASS = 'w-16 shrink-0 text-sm text-[var(--chat-text-secondary)]';

function useAutoHeight(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
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
  const [mailNotice, setMailNotice] = useState<'copied' | 'failed' | null>(null);
  const { copyState, copy } = useRichBlockCopy();
  const draft: EmailDraft = { ...parsed.draft, ...edits };
  const bodyRef = useAutoHeight(draft.body);

  const edit = useCallback(
    (field: keyof EmailDraft) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setEdits((current) => ({ ...current, [field]: event.target.value })),
    [],
  );

  const fieldLabels: Record<EmailField, string> = {
    to: t('richBlock.to', 'To'),
    cc: t('richBlock.cc', 'Cc'),
    bcc: t('richBlock.bcc', 'Bcc'),
    subject: t('richBlock.subject', 'Subject'),
  };
  const shownFields: EmailField[] = (['to', 'cc', 'bcc', 'subject'] as const).filter(
    (field) => field === 'to' || field === 'subject' || parsed.headerFields.includes(field),
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
    copyState === 'failed' || mailNotice ? (
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'border-b border-[var(--chat-border-subtle)] px-4 py-2 text-sm',
          copyState === 'failed' || mailNotice === 'failed'
            ? 'text-[var(--chat-destructive-text)]'
            : 'text-[var(--chat-text-secondary)]',
        )}
      >
        {mailNotice === 'failed'
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
    <RichBlockCard
      kind="email"
      icon={<Mail className="h-4 w-4" />}
      label={label}
      actions={actions}
      status={status}
    >
      {shownFields.map((field) => (
        <div key={field} className={FIELD_ROW_CLASS}>
          <label htmlFor={`${idPrefix}-${field}`} className={FIELD_LABEL_CLASS}>
            {fieldLabels[field]}
          </label>
          <input
            id={`${idPrefix}-${field}`}
            type="text"
            inputMode={field === 'subject' ? 'text' : 'email'}
            value={draft[field]}
            onChange={edit(field)}
            readOnly={streaming}
            spellCheck={field === 'subject'}
            autoComplete="off"
            className={cn(FIELD_INPUT_CLASS, field === 'subject' && 'font-medium')}
          />
        </div>
      ))}
      <label htmlFor={`${idPrefix}-body`} className="sr-only">
        {t('richBlock.body', 'Message')}
      </label>
      <textarea
        id={`${idPrefix}-body`}
        ref={bodyRef}
        value={draft.body}
        onChange={edit('body')}
        readOnly={streaming}
        rows={1}
        className="block w-full resize-none overflow-hidden bg-transparent px-4 py-3 text-[var(--chat-text-primary)] outline-none read-only:cursor-default focus-visible:bg-[var(--chat-surface-hover)]"
      />
    </RichBlockCard>
  );
}
