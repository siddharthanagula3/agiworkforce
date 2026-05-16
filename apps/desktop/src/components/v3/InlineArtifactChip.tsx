import { Box, ExternalLink } from 'lucide-react';

export interface InlineArtifactChipProps {
  title: string;
  meta?: string;
  onOpen?: () => void;
}

export function InlineArtifactChip({ title, meta, onOpen }: InlineArtifactChipProps) {
  return (
    <button
      data-v3-artifact-chip=""
      onClick={onOpen}
      title="Open artifact"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--chat-border)',
        background: 'var(--chat-surface-elevated)',
        cursor: onOpen ? 'pointer' : 'default',
        width: '100%',
        textAlign: 'left',
        marginTop: 8,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'var(--chat-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'var(--chat-text-secondary)',
        }}
      >
        <Box size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--chat-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </div>
        {meta && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--chat-text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {meta}
          </div>
        )}
      </div>
      {onOpen && (
        <ExternalLink size={14} style={{ color: 'var(--chat-text-muted)', flexShrink: 0 }} />
      )}
    </button>
  );
}
