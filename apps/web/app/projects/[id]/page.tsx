'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { FolderOpen } from 'lucide-react';
import {
  ProjectHeader,
  ModelSelector,
  useChatProjectStore as useProjectStore,
  useChatModelStore,
} from '@agiworkforce/unified-chat';
import {
  SYNCED_APP_SURFACES,
  summarizeProjectHeader,
  type ProjectRecord,
  type ProjectAccentColor,
} from '@agiworkforce/types';
import { KnowledgeFilesPanel } from '@/features/projects/components/KnowledgeFilesPanel';
import { ChatComposerNew } from '@/features/chat/components/Composer/ChatComposerNew';
import { useProjectMetaStore } from '@/features/projects/stores/project-meta-store';
import { useChatStore } from '@/stores/chatStore';

/**
 * /projects/[id] · per-project detail view, three-pane layout.
 *
 * Left pane:  narrow nav rail (back, chats tab, sources tab).
 * Center pane: chat list + embedded composer. Model selector in header.
 * Right pane: knowledge panel (memory note, instructions editor, files).
 *
 * Fixes 47, 48, 50, 51 (2026-05-24).
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

/** Format a date string into a short human-readable label. */
function formatChatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Capacity thresholds (single definition · used by CapacityBanners +
// CapacityFilesHeader below)
// ---------------------------------------------------------------------------
const MAX_KNOWLEDGE_FILES = 20;
const MAX_KNOWLEDGE_BYTES = 50 * 1024 * 1024; // 50 MiB display cap

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params?.id;
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjectStore((s) => s.updateProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  // Per-project model selection.
  // On mount: apply any saved per-project model to the global model store so
  // the ModelSelector and inference layer both pick it up.
  // On every global model change: persist back to the per-project store.
  const globalModelId = useChatModelStore((s) => s.selectedModelId);
  const setGlobalModel = useChatModelStore((s) => s.selectModel);
  const projectModelId = useProjectMetaStore((s) =>
    projectId ? s.getProjectModel(projectId) : undefined,
  );
  const setProjectModel = useProjectMetaStore((s) => s.setProjectModel);

  // Sync project's saved model into global store on mount
  useEffect(() => {
    if (projectId && projectModelId) {
      setGlobalModel(projectModelId);
    }
    // Only run on mount (projectId/projectModelId are stable on first render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Persist global model changes back to per-project store
  useEffect(() => {
    if (projectId && globalModelId) {
      setProjectModel(projectId, globalModelId);
    }
  }, [projectId, globalModelId, setProjectModel]);

  // Active model for this project: project-specific > global (for display only)
  const activeModelId = projectModelId ?? globalModelId;

  const [tab, setTab] = useState<Tab>('chats');
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState('');

  const handleProjectSend = useCallback(
    (content: string) => {
      if (!project) return;
      try {
        sessionStorage.setItem('agi.project.pendingMessage', content);
        sessionStorage.setItem('agi.project.pendingProjectId', project.id);
      } catch {
        // sessionStorage unavailable
      }
      setActiveProject(project.id);
      router.push(`/chat?project=${encodeURIComponent(project.id)}`);
    },
    [project, router, setActiveProject],
  );

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

  // Web conversation store — used to look up real titles and dates for the chats list.
  const allConversations = useChatStore((s) => s.conversations);
  const conversationMeta = useMemo(() => {
    const map = new Map<string, { title: string; updatedAt: string }>();
    allConversations.forEach((c) => {
      map.set(c.id, { title: c.title, updatedAt: c.updatedAt });
    });
    return map;
  }, [allConversations]);

  if (!project || !headerPresentation) {
    return (
      <main
        data-design="agi"
        style={{
          minHeight: '100vh',
          background: 'var(--agi-bg-2)',
          padding: '48px 32px',
          color: 'var(--agi-ink)',
        }}
      >
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <button
            type="button"
            onClick={() => router.push('/projects')}
            style={{
              border: '1px solid var(--agi-rule-strong)',
              background: 'transparent',
              color: 'var(--agi-ink-2)',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              cursor: 'pointer',
            }}
            data-testid="project-detail-back"
          >
            Back to projects
          </button>
          <h1
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 22,
              color: 'var(--agi-ink)',
              margin: '24px 0 8px',
            }}
          >
            Project not found
          </h1>
          <p style={{ fontSize: 13, color: 'var(--agi-ink-2)', margin: 0 }}>
            This project does not exist on this device. It may live on another device, or it was
            deleted. Cloud sync arrives with Cloud Managed.
          </p>
        </div>
      </main>
    );
  }

  const conversationIds = project.conversationIds ?? [];

  return (
    <main
      data-design="agi"
      style={{ minHeight: '100vh', background: 'var(--agi-bg-2)', color: 'var(--agi-ink)' }}
    >
      {/* Three-pane grid: nav rail | center | right knowledge panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '52px 1fr 300px',
          gridTemplateRows: '100vh',
          maxWidth: 1400,
          margin: '0 auto',
        }}
        className="project-detail-grid"
      >
        {/* ------------------------------------------------------------------ */}
        {/* LEFT: narrow nav rail                                              */}
        {/* ------------------------------------------------------------------ */}
        <aside
          data-testid="project-detail-nav"
          style={{
            borderRight: '1px solid var(--agi-rule)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 16,
            gap: 8,
          }}
        >
          {/* Back */}
          <button
            type="button"
            onClick={() => router.push('/projects')}
            aria-label="Back to projects"
            data-testid="project-detail-back"
            title="Back to projects"
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--agi-ink-2)',
              fontSize: 16,
            }}
          >
            &larr;
          </button>

          <div style={{ width: 24, height: 1, background: 'var(--agi-rule)', margin: '4px 0' }} />

          {/* Chats tab */}
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'chats'}
            onClick={() => setTab('chats')}
            data-testid="project-detail-tab-chats"
            title="Chats"
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: 'none',
              background: tab === 'chats' ? 'var(--agi-bg-3)' : 'transparent',
              cursor: 'pointer',
              color: tab === 'chats' ? 'var(--agi-ink)' : 'var(--agi-ink-2)',
              fontSize: 15,
            }}
          >
            &#128172;
          </button>

          {/* Sources tab */}
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'sources'}
            onClick={() => setTab('sources')}
            data-testid="project-detail-tab-sources"
            title="Sources"
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: 'none',
              background: tab === 'sources' ? 'var(--agi-bg-3)' : 'transparent',
              cursor: 'pointer',
              color: tab === 'sources' ? 'var(--agi-ink)' : 'var(--agi-ink-2)',
              fontSize: 15,
            }}
          >
            &#128196;
          </button>
        </aside>

        {/* ------------------------------------------------------------------ */}
        {/* CENTER: project header + chat panel + composer                     */}
        {/* ------------------------------------------------------------------ */}
        <section
          data-testid="project-detail-center"
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRight: '1px solid var(--agi-rule)',
          }}
        >
          {/* ChatGPT-style header: FolderOpen icon + project name + model selector */}
          <div
            style={{
              padding: '16px 24px 12px',
              borderBottom: '1px solid var(--agi-rule)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <FolderOpen
                style={{ width: 22, height: 22, flexShrink: 0, color: 'var(--agi-amber)' }}
                aria-hidden="true"
              />
              <h1
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 20,
                  fontWeight: 500,
                  color: 'var(--agi-ink)',
                  margin: 0,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {project.name}
              </h1>
            </div>

            {/* Model selector for this project */}
            <div style={{ flexShrink: 0 }}>
              <ModelSelector
                onSettingsClick={() => router.push('/settings/general')}
                onProPlusRequired={() => {
                  /* waitlist-gated in v1 */
                }}
              />
            </div>
          </div>

          {/* ProjectHeader provides description/instructions summary — shown below the title bar */}
          <div style={{ padding: '8px 24px 0', flexShrink: 0 }}>
            <ProjectHeader presentation={headerPresentation} />
          </div>

          {/* Horizontal tab bar: Chats | Sources */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              borderBottom: '1px solid var(--agi-rule)',
              padding: '0 24px',
              flexShrink: 0,
            }}
            role="tablist"
            aria-label="Project tabs"
          >
            {(['chats', 'sources'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                data-testid={`project-detail-tab-${t}`}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: tab === t ? '2px solid var(--agi-amber)' : '2px solid transparent',
                  color: tab === t ? 'var(--agi-ink)' : 'var(--agi-ink-2)',
                  fontSize: 13,
                  fontWeight: tab === t ? 600 : 400,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  marginBottom: -1,
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {t === 'chats' ? 'Chats' : 'Sources'}
              </button>
            ))}
          </div>

          {/* Capacity / limit banners */}
          <CapacityBanners
            conversationCount={conversationIds.length}
            projectModelId={activeModelId}
          />

          {/* Tab body */}
          <div
            style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}
            data-testid={`project-detail-panel-${tab}`}
          >
            {tab === 'chats' ? (
              conversationIds.length === 0 ? (
                <EmptyState
                  title="No chats in this project yet"
                  detail="Use the composer below to start a conversation. Project instructions and files will be carried in automatically."
                />
              ) : (
                <ul
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: 0,
                    margin: 0,
                  }}
                >
                  {conversationIds.map((conversationId) => {
                    const meta = conversationMeta.get(conversationId);
                    const title =
                      meta?.title && meta.title !== 'New Chat'
                        ? meta.title
                        : (meta?.title ?? 'Untitled chat');
                    const dateLabel = formatChatDate(meta?.updatedAt);
                    return (
                      <li
                        key={conversationId}
                        style={{
                          listStyle: 'none',
                          border: '1px solid var(--agi-rule)',
                          borderRadius: 10,
                          overflow: 'hidden',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveProject(project.id);
                            router.push(`/chat/${encodeURIComponent(conversationId)}`);
                          }}
                          title={title}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            width: '100%',
                            background: 'transparent',
                            border: 0,
                            padding: '10px 14px',
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background =
                              'var(--agi-bg-3)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          }}
                        >
                          <span
                            style={{
                              color: 'var(--agi-ink)',
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
                          {dateLabel && (
                            <span
                              style={{
                                color: 'var(--agi-ink-2)',
                                fontSize: 11,
                                flexShrink: 0,
                              }}
                            >
                              {dateLabel}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              <KnowledgeFilesPanel projectId={project.id} />
            )}
          </div>

          {/* Composer pinned to bottom of center pane */}
          {tab === 'chats' && (
            <div
              data-testid="project-detail-composer"
              style={{
                borderTop: '1px solid var(--agi-rule)',
                padding: '16px 24px 20px',
                flexShrink: 0,
                background: 'var(--agi-bg-2)',
              }}
            >
              <ChatComposerNew
                onSend={handleProjectSend}
                placeholder={`New chat in ${project.name}`}
                promptCompletionEnabled={false}
              />
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* RIGHT: knowledge panel (memory, instructions, files)               */}
        {/* ------------------------------------------------------------------ */}
        <aside
          data-testid="project-detail-right"
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--agi-bg-3)',
          }}
        >
          <div
            style={{
              padding: '16px 20px 12px',
              borderBottom: '1px solid var(--agi-rule)',
              flexShrink: 0,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--agi-ink-2)',
                margin: 0,
              }}
            >
              Project knowledge
            </p>
          </div>

          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
            }}
          >
            {/* Memory section */}
            <section aria-label="Memory">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--agi-ink)', margin: 0 }}>
                  Memory
                </p>
                <span
                  title="Only you can see this memory"
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: 'var(--agi-ink-2)',
                    border: '1px solid var(--agi-rule)',
                    borderRadius: 6,
                    padding: '2px 6px',
                  }}
                >
                  Only you
                </span>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--agi-ink-2)',
                  lineHeight: 1.55,
                  margin: 0,
                  fontStyle: 'italic',
                }}
              >
                No project memories yet. Memories will appear here when the assistant remembers
                something about this project.
              </p>
            </section>

            {/* Instructions section */}
            <section aria-label="Instructions">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--agi-ink)', margin: 0 }}>
                  Instructions
                </p>
                {!editingInstructions ? (
                  <button
                    type="button"
                    onClick={() => {
                      setInstructionsDraft(project.instructions ?? '');
                      setEditingInstructions(true);
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--agi-rule)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 11,
                      color: 'var(--agi-ink-2)',
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        updateProject(project.id, {
                          instructions: instructionsDraft.trim() || undefined,
                        });
                        setEditingInstructions(false);
                      }}
                      style={{
                        background: 'var(--agi-amber)',
                        border: 'none',
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: 11,
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingInstructions(false)}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--agi-rule)',
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: 11,
                        color: 'var(--agi-ink-2)',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {editingInstructions ? (
                <textarea
                  value={instructionsDraft}
                  onChange={(e) => setInstructionsDraft(e.target.value)}
                  placeholder="Tell the assistant how to behave in this project..."
                  autoFocus
                  style={{
                    width: '100%',
                    minHeight: 100,
                    background: 'var(--agi-bg-2)',
                    border: '1px solid var(--agi-rule-strong)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 12,
                    color: 'var(--agi-ink)',
                    lineHeight: 1.55,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              ) : project.instructions ? (
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--agi-ink-2)',
                    lineHeight: 1.55,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {project.instructions}
                </p>
              ) : (
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--agi-ink-2)',
                    lineHeight: 1.55,
                    margin: 0,
                    fontStyle: 'italic',
                  }}
                >
                  No instructions. Click Edit to add instructions the assistant will follow in this
                  project.
                </p>
              )}
            </section>

            {/* Files section (knowledge files) */}
            <section aria-label="Files">
              <CapacityFilesHeader />
              <KnowledgeFilesPanel projectId={project.id} />
            </section>
          </div>
        </aside>
      </div>

      {/* Responsive: on small screens collapse to single column */}
      <style>{`
        @media (max-width: 767px) {
          .project-detail-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto !important;
          }
        }
        @media (max-width: 1023px) {
          .project-detail-grid {
            grid-template-columns: 52px 1fr !important;
          }
          [data-testid="project-detail-right"] {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Capacity banners (Fix 51)
// ---------------------------------------------------------------------------

interface CapacityBannersProps {
  conversationCount: number;
  projectModelId: string;
}

function CapacityBanners({ conversationCount, projectModelId: _modelId }: CapacityBannersProps) {
  const warnings: string[] = [];

  if (conversationCount >= MAX_KNOWLEDGE_FILES * 4) {
    warnings.push(
      `This project has ${conversationCount} conversations. Consider archiving older ones for performance.`,
    );
  }

  if (warnings.length === 0) return null;

  return (
    <div style={{ padding: '0 24px' }}>
      {warnings.map((w) => (
        <div
          key={w}
          role="alert"
          style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(200,137,42,0.1)',
            border: '1px solid rgba(200,137,42,0.3)',
            fontSize: 12,
            color: 'var(--agi-amber)',
            lineHeight: 1.5,
          }}
        >
          {w}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Files section header (shows capacity info)
// ---------------------------------------------------------------------------
function CapacityFilesHeader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--agi-ink)', margin: 0 }}>Files</p>
      <span style={{ fontSize: 10, color: 'var(--agi-ink-2)' }}>
        Max {MAX_KNOWLEDGE_FILES} files / {MAX_KNOWLEDGE_BYTES / (1024 * 1024)} MiB
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  title: string;
  detail: string;
}

function EmptyState({ title, detail }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px' }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--agi-ink)', margin: '0 0 6px' }}>
        {title}
      </p>
      <p
        style={{
          fontSize: 12,
          color: 'var(--agi-ink-2)',
          margin: '0 auto',
          maxWidth: 480,
          lineHeight: 1.55,
        }}
      >
        {detail}
      </p>
    </div>
  );
}
