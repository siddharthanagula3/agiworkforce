'use client';

import { useRouter } from 'next/navigation';
import { FileCode2 } from 'lucide-react';
import { useArtifactIndex } from '@/features/chat/hooks/use-artifact-index';

export interface ProjectArtifactsPanelProps {
  projectId: string;
  projectName: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Every artifact produced in this project's chats.
 *
 * The rows come from the account-wide index scoped by the server to the
 * project's conversations, so an artifact appears here whether or not this
 * device has ever opened the chat that produced it. Opening one goes to that
 * chat, where the content is re-derived; the index stores none.
 */
export function ProjectArtifactsPanel({ projectId, projectName }: ProjectArtifactsPanelProps) {
  const router = useRouter();
  const { artifacts, loaded } = useArtifactIndex({ projectId });

  if (!loaded) {
    return (
      <p role="status" style={{ color: 'var(--agi-ink-2)', fontSize: 13, textAlign: 'center' }}>
        Loading artifacts...
      </p>
    );
  }

  if (artifacts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 16px' }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--agi-ink)', margin: '0 0 6px' }}>
          No artifacts yet
        </p>
        <p
          style={{
            fontSize: 13,
            color: 'var(--agi-ink-2)',
            margin: '0 auto',
            maxWidth: 400,
            lineHeight: 1.55,
          }}
        >
          Documents, diagrams and code that chats in {projectName} produce will collect here.
        </p>
      </div>
    );
  }

  return (
    <ul
      data-testid="project-artifacts-list"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 0, margin: 0 }}
    >
      {artifacts.map((artifact) => {
        const title = artifact.title?.trim() || 'Untitled artifact';
        const dateLabel = formatDate(artifact.createdAt);
        return (
          <li
            key={artifact.id}
            style={{
              listStyle: 'none',
              border: '1px solid var(--agi-rule)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => router.push(`/chat/${encodeURIComponent(artifact.conversationId)}`)}
              title={title}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                minHeight: 44,
                background: 'transparent',
                border: 0,
                padding: '10px 14px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <FileCode2
                size={14}
                aria-hidden
                style={{ flexShrink: 0, color: 'var(--agi-ink-2)' }}
              />
              <span
                style={{
                  color: 'hsl(var(--foreground))',
                  fontSize: 13,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  flex: 1,
                }}
              >
                {title}
              </span>
              <span style={{ color: 'var(--agi-ink-2)', fontSize: 12, flexShrink: 0 }}>
                {artifact.type}
                {dateLabel ? ` · ${dateLabel}` : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
