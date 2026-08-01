'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { FolderOpen, MoreHorizontal, Settings2, Pin, PinOff } from 'lucide-react';
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
import { ChatComposerNew } from '@/features/chat/components/Composer/ChatComposerNew';
import { useProjectMetaStore } from '@/features/projects/stores/project-meta-store';
import { useProjectConversations } from '@/lib/hooks/useConversations';
import { SourcesPanel } from '@/features/projects/components/SourcesPanel';
import { ProjectSettingsDialog } from '@/features/projects/components/ProjectSettingsDialog';
import { useManagedCloudProjects } from '@/features/projects';
import { WebAppShell } from '@shared/components/layout/WebAppShell';

/**
 * /projects/[id] - per-project detail view.
 *
 * Layout: single centered column (ChatGPT-style).
 * - FolderOpen icon + project name title
 * - "New chat in <name>" composer
 * - Chats / Sources tab bar
 * - Chat list or empty state
 *
 * Top-right: "..." menu with "Project settings" and "Pin project".
 * "Project settings" opens ProjectSettingsDialog (same modal the sidebar gear uses).
 * Knowledge files live inside the settings modal under "Files".
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
// Capacity thresholds
// ---------------------------------------------------------------------------
const MAX_CONVERSATIONS_WARN = 80;

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params?.id;
  const {
    accountId,
    projects,
    status: projectStatus,
    error: projectError,
    retry: retryProjects,
  } = useManagedCloudProjects();
  const project = projects.find((candidate) => candidate.id === projectId);
  const {
    conversations: projectConversations,
    isLoading: projectChatsLoading,
    error: projectChatsError,
    hasMore: hasMoreProjectChats,
    isLoadingMore: isLoadingMoreProjectChats,
    retry: retryProjectChats,
    loadMore: loadMoreProjectChats,
  } = useProjectConversations(projectId);
  const updateProject = useProjectStore((s) => s.updateProject);
  const removeProject = useProjectStore((s) => s.removeProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const toggleStar = useProjectStore((s) => s.toggleStar);

  // Per-project model selection.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Persist global model changes back to per-project store
  useEffect(() => {
    if (projectId && globalModelId) {
      setProjectModel(projectId, globalModelId);
    }
  }, [projectId, globalModelId, setProjectModel]);

  const [tab, setTab] = useState<Tab>('chats');

  // "..." overflow menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

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
      // `?projectId=` is the ONE canonical project entry param for /chat
      // (matches the sidebar project-row "New chat"); WebChatPage reads it to
      // preselect the project and the composer opens in AGI Work mode.
      router.push(`/chat?projectId=${encodeURIComponent(project.id)}`);
    },
    [project, router, setActiveProject],
  );

  const handleDeleteProject = useCallback(
    (id: string) => {
      removeProject(id);
      router.push('/chat/projects');
    },
    [removeProject, router],
  );

  const headerPresentation = useMemo(() => {
    if (!project) return null;
    const record: ProjectRecord = {
      id: project.id,
      ownerUserId: project.ownerUserId ?? accountId ?? '',
      organizationId: project.organizationId,
      name: project.name,
      description: project.description ?? null,
      defaultPrivacyMode: project.defaultPrivacyMode ?? 'managed',
      defaultProviderMode: project.defaultProviderMode ?? 'ManagedGateway',
      allowedSurfaces: project.allowedSurfaces ?? [...SYNCED_APP_SURFACES],
      instructions: project.instructions ?? null,
      defaultModelId: project.defaultModelId,
      iconEmoji: project.iconEmoji ?? null,
      accentColor: normalizeAccent(project.accentColor),
      knowledgeFileCount: project.knowledgeFileCount,
      memberCount: project.memberCount,
      lastUsedAt: project.lastUsedAt ?? project.updatedAt,
      importedFrom: project.importedFrom ?? 'manual',
      isArchived: project.isArchived,
      metadata: project.metadata,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    return summarizeProjectHeader({ project: record });
  }, [accountId, project]);

  // Loading state while hydrating from server
  if (projectStatus === 'loading' || projectStatus === 'idle') {
    return (
      <WebAppShell>
        <main
          data-design="agi"
          style={{
            minHeight: '100%',
            background: 'hsl(var(--background))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--agi-ink-2)',
            fontSize: 14,
          }}
        >
          Loading project...
        </main>
      </WebAppShell>
    );
  }

  if (projectStatus === 'error') {
    return (
      <WebAppShell>
        <main
          data-design="agi"
          style={{
            minHeight: '100%',
            background: 'hsl(var(--background))',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: 'var(--agi-ink-2)',
            fontSize: 14,
          }}
        >
          <p role="alert">{projectError ?? 'Projects could not be loaded.'}</p>
          <button type="button" onClick={retryProjects}>
            Retry
          </button>
        </main>
      </WebAppShell>
    );
  }

  if (!project || !headerPresentation) {
    return (
      <WebAppShell>
        <main
          data-design="agi"
          style={{
            minHeight: '100%',
            background: 'hsl(var(--background))',
            padding: '48px 32px',
            color: 'hsl(var(--foreground))',
          }}
        >
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <button
              type="button"
              onClick={() => router.push('/chat/projects')}
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
                color: 'hsl(var(--foreground))',
                margin: '24px 0 8px',
              }}
            >
              Project not found
            </h1>
            <p style={{ fontSize: 13, color: 'var(--agi-ink-2)', margin: 0 }}>
              {projectStatus === 'signed-out'
                ? 'Sign in to view this cloud project.'
                : 'This cloud project does not exist, is unavailable to this account, or was deleted.'}
            </p>
          </div>
        </main>
      </WebAppShell>
    );
  }

  return (
    <WebAppShell>
      <main
        data-design="agi"
        style={{
          minHeight: '100%',
          background: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
        }}
      >
        {/* Single centered column, ChatGPT-style */}
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100%',
          }}
        >
          {/* ---------------------------------------------------------------- */}
          {/* Top bar: back + model selector + "..." menu                      */}
          {/* ---------------------------------------------------------------- */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 0 0',
              flexShrink: 0,
            }}
          >
            {/* Back button */}
            <button
              type="button"
              onClick={() => router.push('/chat/projects')}
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

            {/* Right side: model selector + "..." menu */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ModelSelector
                onSettingsClick={() => router.push('/settings/general')}
                onProPlusRequired={() => {
                  /* waitlist-gated in v1 */
                }}
              />

              {/* "..." overflow menu */}
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  aria-label="Project options"
                  data-testid="project-detail-menu-btn"
                  onClick={() => setMenuOpen((o) => !o)}
                  style={{
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    border: '1px solid var(--agi-rule)',
                    background: menuOpen ? 'var(--agi-bg-3)' : 'transparent',
                    cursor: 'pointer',
                    color: 'var(--agi-ink-2)',
                    transition: 'background 0.12s, color 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    if (!menuOpen)
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--agi-bg-3)';
                  }}
                  onMouseLeave={(e) => {
                    if (!menuOpen)
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <MoreHorizontal style={{ width: 18, height: 18 }} aria-hidden="true" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    data-testid="project-detail-menu"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      minWidth: 180,
                      background: 'var(--agi-bg)',
                      border: '1px solid var(--agi-rule-strong)',
                      borderRadius: 10,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
                      overflow: 'hidden',
                      zIndex: 50,
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="project-detail-menu-settings"
                      onClick={() => {
                        setMenuOpen(false);
                        setSettingsOpen(true);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '10px 14px',
                        background: 'transparent',
                        border: 0,
                        textAlign: 'left',
                        fontSize: 13,
                        color: 'hsl(var(--foreground))',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--agi-bg-3)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      <Settings2
                        style={{ width: 15, height: 15, color: 'var(--agi-ink-2)' }}
                        aria-hidden="true"
                      />
                      Project settings
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      data-testid="project-detail-menu-pin"
                      onClick={() => {
                        setMenuOpen(false);
                        if (projectId) toggleStar(projectId);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '10px 14px',
                        background: 'transparent',
                        border: 0,
                        textAlign: 'left',
                        fontSize: 13,
                        color: 'hsl(var(--foreground))',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--agi-bg-3)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      {project.starred ? (
                        <PinOff
                          style={{ width: 15, height: 15, color: 'var(--agi-ink-2)' }}
                          aria-hidden="true"
                        />
                      ) : (
                        <Pin
                          style={{ width: 15, height: 15, color: 'var(--agi-ink-2)' }}
                          aria-hidden="true"
                        />
                      )}
                      {project.starred ? 'Unpin project' : 'Pin project'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Hero: FolderOpen icon + project name                             */}
          {/* ---------------------------------------------------------------- */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '48px 0 32px',
              flexShrink: 0,
            }}
          >
            {project.iconEmoji ? (
              <span style={{ fontSize: 40, lineHeight: 1, marginBottom: 12 }} aria-hidden="true">
                {project.iconEmoji}
              </span>
            ) : (
              <FolderOpen
                style={{
                  width: 40,
                  height: 40,
                  color: 'var(--agi-amber)',
                  marginBottom: 12,
                }}
                aria-hidden="true"
              />
            )}
            <h1
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 26,
                fontWeight: 600,
                color: 'hsl(var(--foreground))',
                margin: 0,
              }}
            >
              {project.name}
            </h1>

            {/* Optional project description / instructions summary */}
            {headerPresentation && (
              <div style={{ marginTop: 8, maxWidth: 540 }}>
                <ProjectHeader presentation={headerPresentation} />
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Composer                                                         */}
          {/* ---------------------------------------------------------------- */}
          <div data-testid="project-detail-composer" style={{ flexShrink: 0, marginBottom: 32 }}>
            <ChatComposerNew
              onSend={handleProjectSend}
              placeholder={`New chat in ${project.name}`}
            />
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Capacity banner                                                  */}
          {/* ---------------------------------------------------------------- */}
          {projectConversations.length >= MAX_CONVERSATIONS_WARN && (
            <div
              role="alert"
              style={{
                marginBottom: 16,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(200,137,42,0.1)',
                border: '1px solid rgba(200,137,42,0.3)',
                fontSize: 12,
                color: 'var(--agi-amber)',
                lineHeight: 1.5,
                flexShrink: 0,
              }}
            >
              This project has {hasMoreProjectChats ? 'at least ' : ''}
              {projectConversations.length} conversations. Consider archiving older ones for
              performance.
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Chats / Sources tab bar                                          */}
          {/* ---------------------------------------------------------------- */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid var(--agi-rule)',
              flexShrink: 0,
              marginBottom: 0,
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

          {/* ---------------------------------------------------------------- */}
          {/* Tab content                                                      */}
          {/* ---------------------------------------------------------------- */}
          <div
            style={{ flex: 1, paddingTop: 20, paddingBottom: 40 }}
            data-testid={`project-detail-panel-${tab}`}
          >
            {tab === 'chats' ? (
              projectChatsLoading ? (
                <p
                  role="status"
                  style={{ color: 'var(--agi-ink-2)', fontSize: 13, textAlign: 'center' }}
                >
                  Loading chats...
                </p>
              ) : projectChatsError ? (
                <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <p role="alert" style={{ color: 'var(--agi-ink-2)', fontSize: 13 }}>
                    {projectChatsError}
                  </p>
                  <button type="button" onClick={() => void retryProjectChats()}>
                    Retry
                  </button>
                </div>
              ) : projectConversations.length === 0 ? (
                <EmptyChatsState projectName={project.name} />
              ) : (
                <>
                  <ul
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: 0,
                      margin: 0,
                    }}
                  >
                    {projectConversations.map((conversation) => {
                      const title =
                        conversation.title && conversation.title !== 'New Chat'
                          ? conversation.title
                          : (conversation.title ?? 'Untitled chat');
                      const dateLabel = formatChatDate(conversation.updatedAt);
                      return (
                        <li
                          key={conversation.id}
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
                              router.push(`/chat/${encodeURIComponent(conversation.id)}`);
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
                              (e.currentTarget as HTMLButtonElement).style.background =
                                'transparent';
                            }}
                          >
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
                  {hasMoreProjectChats && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                      <button
                        type="button"
                        onClick={() => void loadMoreProjectChats()}
                        disabled={isLoadingMoreProjectChats}
                      >
                        {isLoadingMoreProjectChats ? 'Loading...' : 'Load more chats'}
                      </button>
                    </div>
                  )}
                </>
              )
            ) : (
              /* Sources tab: ChatGPT-style sources experience */
              <SourcesPanel projectId={project.id} />
            )}
          </div>
        </div>

        {/* Project Settings Modal */}
        {settingsOpen && (
          <ProjectSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            project={project}
            onUpdate={updateProject}
            onDelete={handleDeleteProject}
          />
        )}
      </main>
    </WebAppShell>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyChatsStateProps {
  projectName: string;
}

function EmptyChatsState({ projectName }: EmptyChatsStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 16px' }}>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'hsl(var(--foreground))',
          margin: '0 0 6px',
        }}
      >
        No chats yet
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
        Chats in {projectName} will live here.
      </p>
    </div>
  );
}
