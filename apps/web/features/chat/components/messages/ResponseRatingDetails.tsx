'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { Button, Label, Spinner, Textarea } from '@agiworkforce/ui';
import { Check, X } from '@agiworkforce/icons';
import { toast } from 'sonner';
import { cn } from '@shared/lib/utils';
import {
  RESPONSE_RATING_COMMENT_MAX_CHARS,
  RESPONSE_RATING_REASONS,
  type ResponseRatingReason,
} from '@/app/api/feedback/response-rating-contract';
import { ACTION_BUTTON_SIZE, ACTION_BUTTON_TONE, ACTION_ICON_SIZE } from './messageActionRow';

export const RESPONSE_RATING_REASON_LABELS: Record<ResponseRatingReason, string> = {
  inaccurate: 'Not factually correct',
  ignored_instructions: 'Did not follow instructions',
  incomplete: 'Incomplete response',
  unwarranted_refusal: 'Refused when it should not have',
  style: 'Wrong style or tone',
  other: 'Other',
};

export const RESPONSE_RATING_SHARING_NOTE =
  'Your rating, reason and comment are saved with your account, this chat and response IDs, and your browser and device details. The response text is not attached.';

export interface ResponseRatingDetailsInput {
  reason: ResponseRatingReason | null;
  comment: string;
}

interface ResponseRatingDetailsProps {
  onSubmit: (details: ResponseRatingDetailsInput) => Promise<void>;
  onClose: () => void;
  className?: string;
  ref?: Ref<HTMLFormElement>;
}

const REASON_CHIP_CLASS =
  'inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors duration-instant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11';

export function ResponseRatingDetails({
  onSubmit,
  onClose,
  className,
  ref,
}: ResponseRatingDetailsProps) {
  const headingId = useId();
  const commentId = useId();
  const firstReasonRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState<ResponseRatingReason | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const trimmedComment = comment.trim();
  const canSubmit = (reason !== null || trimmedComment.length > 0) && !sending;

  useEffect(() => {
    firstReasonRef.current?.focus();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setFailed(false);
    try {
      await onSubmit({ reason, comment: trimmedComment });
      toast.success('Thanks for your feedback.');
      onClose();
    } catch {
      setFailed(true);
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
    <form
      ref={ref}
      aria-labelledby={headingId}
      onSubmit={(event) => void handleSubmit(event)}
      onKeyDown={handleKeyDown}
      className={cn(
        'w-full space-y-3 rounded-[var(--chat-radius-lg)] border border-[var(--chat-border)] bg-[var(--chat-surface-base)] p-3',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p id={headingId} className="text-sm font-medium text-[var(--chat-text-primary)]">
          Tell us more
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(ACTION_BUTTON_SIZE, ACTION_BUTTON_TONE)}
          onClick={onClose}
          aria-label="Close feedback form"
        >
          <X className={ACTION_ICON_SIZE} aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Reason">
        {RESPONSE_RATING_REASONS.map((option, index) => {
          const selected = reason === option;
          return (
            <button
              key={option}
              ref={index === 0 ? firstReasonRef : undefined}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setReason(selected ? null : option);
                setFailed(false);
              }}
              className={cn(
                REASON_CHIP_CLASS,
                selected
                  ? 'border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] text-[var(--chat-text-primary)]'
                  : 'border-[var(--chat-border)] bg-[var(--chat-surface-hover)] text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-elevated)] hover:text-[var(--chat-text-primary)]',
              )}
            >
              {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              {RESPONSE_RATING_REASON_LABELS[option]}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={commentId} className="text-xs text-[var(--chat-text-secondary)]">
          Details (optional)
        </Label>
        <Textarea
          id={commentId}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
            setFailed(false);
          }}
          maxLength={RESPONSE_RATING_COMMENT_MAX_CHARS}
          rows={2}
          placeholder="What was wrong with this response?"
          className="min-h-16 resize-y border-[var(--chat-border)] bg-[var(--chat-input-bg)] text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)]"
        />
      </div>
      <p className="text-xs leading-relaxed text-[var(--chat-text-muted)]">
        {RESPONSE_RATING_SHARING_NOTE}
      </p>
      {failed && (
        <p role="alert" className="text-xs text-[var(--chat-destructive-text)]">
          Could not send that. Please try again.
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          className="pointer-coarse:min-h-11"
          disabled={!canSubmit}
          isLoading={sending}
        >
          {sending && <Spinner size="sm" aria-hidden="true" />}
          Submit
        </Button>
      </div>
    </form>
  );
}
