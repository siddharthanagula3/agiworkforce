import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('v3');
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
      <button style={btnStyle(copied)} onClick={handleCopy} title={t('responseActions.copy')}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span>{copied ? t('responseActions.copied') : t('responseActions.copy')}</span>
      </button>

      <button
        style={btnStyle(currentReaction === 'thumbsUp')}
        onClick={() => onReact?.('thumbsUp')}
        title={t('responseActions.helpful')}
      >
        <ThumbsUp size={13} />
      </button>

      <button
        style={btnStyle(currentReaction === 'thumbsDown')}
        onClick={() => onReact?.('thumbsDown')}
        title={t('responseActions.notHelpful')}
      >
        <ThumbsDown size={13} />
      </button>

      {onRegenerate && (
        <button style={btnStyle()} onClick={onRegenerate} title={t('responseActions.regenerate')}>
          <RefreshCw size={13} />
          <span>{t('responseActions.regenerate')}</span>
        </button>
      )}

      {onBranch && (
        <button
          style={btnStyle()}
          onClick={onBranch}
          title={t('responseActions.branchConversation')}
        >
          <GitBranch size={13} />
          <span>{t('responseActions.branch')}</span>
        </button>
      )}
    </div>
  );
}
