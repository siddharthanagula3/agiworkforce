import { useCallback, useState } from 'react';
import { Copy, ThumbsUp, ThumbsDown, RefreshCw, GitBranch, Check } from 'lucide-react';

export interface ResponseActionRowProps {
  content: string;
  onRegenerate?: () => void;
  onBranch?: () => void;
  onReact?: (reaction: 'thumbsUp' | 'thumbsDown') => void;
  currentReaction?: 'thumbsUp' | 'thumbsDown' | null;
}

export function ResponseActionRow({
  content,
  onRegenerate,
  onBranch,
  onReact,
  currentReaction,
}: ResponseActionRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }, [content]);

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    color: active ? 'var(--chat-accent-primary)' : 'var(--chat-text-muted)',
    transition: 'color 120ms, background 120ms',
  });

  return (
    <div
      data-v3-response-action-row=""
      style={{ display: 'flex', gap: 2, marginTop: 6, flexWrap: 'wrap' }}
    >
      <button style={btnStyle(copied)} onClick={handleCopy} title="Copy">
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>

      <button
        style={btnStyle(currentReaction === 'thumbsUp')}
        onClick={() => onReact?.('thumbsUp')}
        title="Helpful"
      >
        <ThumbsUp size={13} />
      </button>

      <button
        style={btnStyle(currentReaction === 'thumbsDown')}
        onClick={() => onReact?.('thumbsDown')}
        title="Not helpful"
      >
        <ThumbsDown size={13} />
      </button>

      {onRegenerate && (
        <button style={btnStyle()} onClick={onRegenerate} title="Regenerate">
          <RefreshCw size={13} />
          <span>Regenerate</span>
        </button>
      )}

      {onBranch && (
        <button style={btnStyle()} onClick={onBranch} title="Branch this conversation">
          <GitBranch size={13} />
          <span>Branch</span>
        </button>
      )}
    </div>
  );
}
