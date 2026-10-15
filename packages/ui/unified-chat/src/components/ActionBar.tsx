import { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitFork,
  RotateCcw,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';
import { reportClientFailure } from '../lib/client-failures';
import { cn } from '../lib/utils';

export interface RegenerateModelOption {
  id: string;
  name: string;
}

/**
 * Message actions a host offers only when it can carry them out. Each slot is
 * rendered when its handler is present and left out otherwise, so a surface
 * that cannot branch, speak or switch models shows no control for it.
 */
export type MessageFeedback = 'up' | 'down';

/** This reply's place among the sibling conversations branching produced. */
export interface MessageVariantPager {
  /** Zero-based position of the conversation on screen among its siblings. */
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  /** True while a turn streams: paging mid-turn is not offered. */
  disabled?: boolean;
}

export interface MessageActionSlots {
  /** Called with null when the rating is taken back. The host persists it. */
  onFeedback?: (messageId: string, feedback: MessageFeedback | null) => void;
  /** Ratings the host has stored, so a reload shows what was chosen. */
  feedbackByMessageId?: Readonly<Record<string, MessageFeedback>>;
  /** The sibling pager for a message, or null where it has none. */
  getVariantPager?: (messageId: string) => MessageVariantPager | null;
  onBranch?: (messageId: string) => void;
  /** The message a branch is being created from, while that request runs. */
  branchingMessageId?: string | null;
  onReadAloud?: (messageId: string, content: string) => void;
  /** The message currently being spoken, so its control reads as Stop. */
  readingAloudMessageId?: string | null;
  onRegenerateWithModel?: (messageId: string, modelId: string) => void;
  regenerateModelOptions?: readonly RegenerateModelOption[];
}

interface ActionBarProps {
  messageId: string;
  content: string;
  /** The model that wrote this reply, marked in the regenerate menu. */
  model?: string;
  onRetry?: (messageId: string) => void;
  slots?: MessageActionSlots;
}

const ICON_BUTTON_CLASS =
  'h-8 w-8 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]';

export function ActionBar({ messageId, content, model, onRetry, slots }: ActionBarProps) {
  const [copied, setCopied] = useState(false);
  const onFeedback = slots?.onFeedback;
  const storedFeedback = slots?.feedbackByMessageId?.[messageId] ?? null;
  const [localFeedback, setLocalFeedback] = useState<{
    stored: MessageFeedback | null;
    value: MessageFeedback | null;
  }>({ stored: storedFeedback, value: storedFeedback });
  // The host's stored rating wins whenever it changes; between changes the
  // click shows at once instead of waiting for the host to save it.
  const feedback = localFeedback.stored === storedFeedback ? localFeedback.value : storedFeedback;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      reportClientFailure({ failure: 'code_copy', detail: 'permission_denied' });
      return;
    }
  }

  function handleFeedback(type: MessageFeedback) {
    const next = feedback === type ? null : type;
    setLocalFeedback({ stored: storedFeedback, value: next });
    onFeedback?.(messageId, next);
  }

  function handleRetry() {
    onRetry?.(messageId);
  }

  const onBranch = slots?.onBranch;
  const isBranching = slots?.branchingMessageId === messageId;
  const onReadAloud = slots?.onReadAloud;
  const isReadingAloud = slots?.readingAloudMessageId === messageId;
  const onRegenerateWithModel = slots?.onRegenerateWithModel;
  const regenerateModelOptions = slots?.regenerateModelOptions ?? [];
  const variantPager = slots?.getVariantPager?.(messageId) ?? null;

  return (
    <div className="flex items-center gap-1 mt-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={copied ? 'Copied' : 'Copy message'}
        onClick={handleCopy}
        className={cn(ICON_BUTTON_CLASS, copied && 'text-[var(--chat-accent-secondary)]')}
      >
        <Copy size={14} />
      </Button>

      {/* Thumbs are rendered only when the host persists them through
          `onFeedback`; a rating that vanished on reload would be a dead control. */}
      {onFeedback && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Thumbs up"
            aria-pressed={feedback === 'up'}
            onClick={() => handleFeedback('up')}
            className={cn(
              ICON_BUTTON_CLASS,
              feedback === 'up' && 'text-[var(--chat-accent-primary-text)]',
            )}
          >
            <ThumbsUp size={14} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Thumbs down"
            aria-pressed={feedback === 'down'}
            onClick={() => handleFeedback('down')}
            className={cn(
              ICON_BUTTON_CLASS,
              feedback === 'down' && 'text-[var(--chat-destructive-text)]',
            )}
          >
            <ThumbsDown size={14} />
          </Button>
        </>
      )}

      {variantPager && variantPager.total > 1 && (
        <div className="flex items-center" data-testid="variant-pager">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous conversation"
            disabled={variantPager.disabled || variantPager.index <= 0}
            onClick={variantPager.onPrevious}
            className={ICON_BUTTON_CLASS}
          >
            <ChevronLeft size={14} />
          </Button>
          <span
            aria-hidden="true"
            className="min-w-[2.5rem] px-0.5 text-center font-mono text-xs tabular-nums text-[var(--chat-text-muted)]"
          >
            {variantPager.index + 1}/{variantPager.total}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next conversation"
            disabled={variantPager.disabled || variantPager.index >= variantPager.total - 1}
            onClick={variantPager.onNext}
            className={ICON_BUTTON_CLASS}
          >
            <ChevronRight size={14} />
          </Button>
          <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {`Conversation ${variantPager.index + 1} of ${variantPager.total}`}
          </span>
        </div>
      )}

      {/* Retry only renders when a regenerate handler is wired, an unwired
          button that does nothing is a dead control. */}
      {onRetry &&
        (onRegenerateWithModel && regenerateModelOptions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Retry" className={ICON_BUTTON_CLASS}>
                <RotateCcw size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              <DropdownMenuItem onClick={handleRetry}>
                <RotateCcw size={14} className="mr-2" aria-hidden="true" />
                Try again
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-[var(--chat-text-muted)]">
                Try again with
              </DropdownMenuLabel>
              {regenerateModelOptions.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onClick={() => onRegenerateWithModel(messageId, option.id)}
                >
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  {option.id === model && (
                    <Check size={14} className="ml-2 shrink-0" aria-hidden="true" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Retry"
            onClick={handleRetry}
            className={ICON_BUTTON_CLASS}
          >
            <RotateCcw size={14} />
          </Button>
        ))}

      {onBranch && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={isBranching ? 'Creating branch…' : 'Branch conversation from here'}
          disabled={isBranching}
          onClick={() => onBranch(messageId)}
          className={ICON_BUTTON_CLASS}
        >
          <GitFork size={14} />
        </Button>
      )}

      {onReadAloud && content.trim().length > 0 && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={isReadingAloud ? 'Stop reading message' : 'Read message aloud'}
          aria-pressed={isReadingAloud}
          onClick={() => onReadAloud(messageId, content)}
          className={ICON_BUTTON_CLASS}
        >
          {isReadingAloud ? <Square size={14} className="fill-current" /> : <Volume2 size={14} />}
        </Button>
      )}
    </div>
  );
}
