import { useState } from 'react';
import { Copy, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';
import { Button } from './ui/Button';
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
      // clipboard write failed silently — no toast here as ActionBar is a shared package
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
          'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
          copied && 'text-[var(--chat-accent-secondary)]',
        )}
      >
        <Copy size={14} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Thumbs up"
        onClick={() => handleFeedback('up')}
        className={cn(
          'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
          feedback === 'up' && 'text-[var(--chat-accent-primary)]',
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
          'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
          feedback === 'down' && 'text-[var(--chat-destructive)]',
        )}
      >
        <ThumbsDown size={14} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Retry"
        onClick={handleRetry}
        className="text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
      >
        <RotateCcw size={14} />
      </Button>
    </div>
  );
}
