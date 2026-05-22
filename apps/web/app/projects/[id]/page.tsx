'use client';

import { useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ProjectHeader, useChatProjectStore as useProjectStore } from '@agiworkforce/unified-chat';
import {
  SYNCED_APP_SURFACES,
  summarizeProjectHeader,
  type ProjectRecord,
  type ProjectAccentColor,
} from '@agiworkforce/types';
import { KnowledgeFilesPanel } from '@/features/projects/components/KnowledgeFilesPanel';

/**
 * /projects/[id] — per-project detail view on web.
 *
 * Closes round-10 TODO #45 (the parity gap surfaced by the ChatGPT
 * project-detail comparison). Renders the shared `ProjectHeader` primitive
 * at the top, then Chats + Sources tabs. Selecting a chat routes to
 * `/chat?project=<id>&conversation=<id>` so the existing chat shell still
 * owns the active conversation.
 *
 * v1 LOCAL-ONLY: project metadata persists via the shared `useProjectStore`
 * (zustand) on this device only — same as the /projects hub.
 *
 * Round-10 visual-verification follow-up, 2026-05-21.
 */

type Tab = 'chats' | 'sources';

const VALID_ACCENT_COLORS = new Set<ProjectAccentColor>([
  'emerald',
  'sky',
  'amber',
  'rose',
  'violet',
  'zinc',
]);

function normalizeAccent(value: string | undefined): ProjectAccentColor | null {
  if (!value) return null;
  return VALID_ACCENT_COLORS.has(value as ProjectAccentColor)
    ? (value as ProjectAccentColor)
    : null;
}

/**
 * Format a conversation id as a readable label. The project store only
 * tracks ids — titles live in the chat store and aren't joined here in
 * v1 LOCAL ONLY. Show a short, human-friendly form so users see
 * "Conversation 01h8x9…" instead of an opaque 36-character UUID.
 */
function conversationLabel(conversationId: string): string {
  const trimmed = conversationId.trim();
  if (!trimmed) return 'Untitled conversation';
  const head = trimmed.slice(0, 8);
  return `Conversation ${head}${trimmed.length > 8 ? '…' : ''}`;
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params?.id;
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const [tab, setTab] = useState<Tab>('chats');

  const headerPresentation = useMemo(() => {
    if (!project) return null;
    const record: ProjectRecord = {
      id: project.id,
      ownerUserId: 'local-user',
      name: project.name,
      description: project.description ?? null,
      defaultPrivacyMode: 'local',
      defaultProviderMode: 'Local',
      allowedSurfaces: [...SYNCED_APP_SURFACES],
      instructions: project.instructions ?? null,
      iconEmoji: project.iconEmoji ?? null,
      accentColor: normalizeAccent(project.accentColor),
      knowledgeFileCount: null,
      memberCount: null,
      lastUsedAt: project.updatedAt,
      importedFrom: 'manual',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    return summarizeProjectHeader({ project: record });
  }, [project]);

  if (!project || !headerPresentation) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: '#0d0c0a',
          padding: '48px 32px',
          color: '#e8e4db',
        }}
      >
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <button
            type="button"
            onClick={() => router.push('/projects')}
            style={{
              border: '1px solid rgba(255, 235, 205, 0.16)',
              background: 'transparent',
              color: '#b3aea4',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              cursor: 'pointer',
            }}
            data-testid="project-detail-back"
          >
            ← Back to projects
          </button>
          <h1
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 22,
              color: '#e8e4db',
              margin: '24px 0 8px',
            }}
          >
            Project not found
          </h1>
          <p style={{ fontSize: 13, color: '#b3aea4', margin: 0 }}>
            This project doesn’t exist on this device. It may live on another device, or it was
            deleted. Cloud sync arrives with Cloud Managed.
          </p>
        </div>
      </main>
    );
  }

  const conversationIds = project.conversationIds ?? [];

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0d0c0a',
        padding: '48px 32px',
        color: '#e8e4db',
      }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <button
          type="button"
          onClick={() => router.push('/projects')}
          style={{
            alignSelf: 'flex-start',
            border: '1px solid rgba(255, 235, 205, 0.16)',
            background: 'transparent',
            color: '#b3aea4',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            cursor: 'pointer',
          }}
          data-testid="project-detail-back"
        >
          ← Back to projects
        </button>

        <ProjectHeader presentation={headerPresentation} />

        <nav
          role="tablist"
          aria-label="Project sections"
          data-testid="project-detail-tabs"
          style={{ display: 'flex', gap: 4, marginTop: 8 }}
        >
          {(
            [
              {
                id: 'chats',
                label: `Chats${conversationIds.length ? ` (${conversationIds.length})` : ''}`,
              },
              { id: 'sources', label: 'Sources' },
            ] as { id: Tab; label: string }[]
          ).map((entry) => (
            <button
              key={entry.id}
              role="tab"
              type="button"
              aria-selected={tab === entry.id}
              data-testid={`project-detail-tab-${entry.id}`}
              onClick={() => setTab(entry.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 9999,
                border: '1px solid rgba(255, 235, 205, 0.16)',
                background: tab === entry.id ? '#1a1915' : 'transparent',
                color: tab === entry.id ? '#e8e4db' : '#b3aea4',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <section
          data-testid={`project-detail-panel-${tab}`}
          style={{
            border: '1px solid rgba(255, 235, 205, 0.08)',
            borderRadius: 16,
            background: '#1a1915',
            padding: '20px 24px',
            minHeight: 240,
          }}
        >
          {tab === 'chats' ? (
            conversationIds.length === 0 ? (
              <EmptyState
                title="No chats in this project yet"
                detail="Start a conversation — project instructions and files will be carried in."
                primaryLabel="Start a chat"
                onPrimary={() => {
                  setActiveProject(project.id);
                  router.push(`/chat?project=${encodeURIComponent(project.id)}`);
                }}
              />
            ) : (
              <ul
                style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 0, margin: 0 }}
              >
                {conversationIds.map((conversationId) => (
                  <li
                    key={conversationId}
                    style={{
                      listStyle: 'none',
                      border: '1px solid rgba(255, 235, 205, 0.08)',
                      borderRadius: 12,
                      padding: '10px 14px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveProject(project.id);
                        router.push(
                          `/chat?project=${encodeURIComponent(project.id)}&conversation=${encodeURIComponent(conversationId)}`,
                        );
                      }}
                      title={conversationId}
                      style={{
                        background: 'transparent',
                        border: 0,
                        padding: 0,
                        color: '#e8e4db',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      {conversationLabel(conversationId)}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <KnowledgeFilesPanel projectId={project.id} />
          )}
        </section>
      </div>
    </main>
  );
}

interface EmptyStateProps {
  title: string;
  detail: string;
  primaryLabel?: string;
  onPrimary?: () => void;
}

function EmptyState({ title, detail, primaryLabel, onPrimary }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px' }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#e8e4db', margin: '0 0 6px' }}>{title}</p>
      <p
        style={{
          fontSize: 12,
          color: '#b3aea4',
          margin: '0 auto',
          maxWidth: 480,
          lineHeight: 1.55,
        }}
      >
        {detail}
      </p>
      {primaryLabel && onPrimary ? (
        <button
          type="button"
          onClick={onPrimary}
          style={{
            marginTop: 16,
            padding: '8px 16px',
            borderRadius: 9999,
            border: 'none',
            background: '#da7756',
            color: '#fff',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {primaryLabel}
        </button>
      ) : null}
    </div>
  );
}
