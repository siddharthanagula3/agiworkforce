import { useState } from 'react';
import { Copy, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { cn } from '../lib/utils';

interface ActionBarProps {
  messageId: string;
  content: string;
  onRetry?: (messageId: string) => void;
  onFeedback?: (messageId: string, type: 'up' | 'down') => void;
}

export function ActionBar({ messageId, content, onRetry, onFeedback }: ActionBarProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // noop
    }
  }

  function handleFeedback(type: 'up' | 'down') {
    const next = feedback === type ? null : type;
    setFeedback(next);
    if (next !== null) {
      onFeedback?.(messageId, next);
    }
  }

  function handleRetry() {
    onRetry?.(messageId);
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={copied ? 'Copied' : 'Copy message'}
        onClick={handleCopy}
        className={cn(
          'h-8 w-8 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
          copied && 'text-[var(--chat-accent-secondary)]',
        )}
      >
        <Copy size={14} />
      </Button>

      {/* Thumbs feedback is only rendered when the host wires `onFeedback`.
          otherwise a rating would be a purely local toggle that vanishes on
          reload (a misleading dead control), so it is omitted. Desktop does not
          yet persist message reactions; this is a tracked delta. */}
      {onFeedback && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Thumbs up"
            onClick={() => handleFeedback('up')}
            className={cn(
              'h-8 w-8 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
              feedback === 'up' && 'text-[var(--chat-accent-primary-text)]',
            )}
          >
            <ThumbsUp size={14} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Thumbs down"
            onClick={() => handleFeedback('down')}
            className={cn(
              'h-8 w-8 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
              feedback === 'down' && 'text-[var(--chat-destructive-text)]',
            )}
          >
            <ThumbsDown size={14} />
          </Button>
        </>
      )}

      {/* Retry only renders when a regenerate handler is wired, an unwired
          button that does nothing is a dead control. Desktop does not yet wire
          regenerate through the runtime; tracked delta. */}
      {onRetry && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Retry"
          onClick={handleRetry}
          className="h-8 w-8 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
        >
          <RotateCcw size={14} />
        </Button>
      )}
    </div>
  );
}
