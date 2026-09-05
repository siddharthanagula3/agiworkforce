'use client';

import { useMenuKeyboard } from '@agiworkforce/ui';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { FolderOpen, MoreHorizontal, Settings2, Pin, PinOff } from 'lucide-react';
import { toast } from 'sonner';
import { ProjectHeader, useChatProjectStore as useProjectStore } from '@agiworkforce/unified-chat';
import {
  SYNCED_APP_SURFACES,
  summarizeProjectHeader,
  type ProjectRecord,
  type ProjectAccentColor,
} from '@agiworkforce/types';
import {
  ChatComposerNew,
  type ComposerSendMeta,
} from '@/features/chat/components/Composer/ChatComposerNew';
import { useProjectConversations } from '@/lib/hooks/useConversations';
import { SourcesPanel } from '@/features/projects/components/SourcesPanel';
import { ProjectSettingsDialog } from '@/features/projects/components/ProjectSettingsDialog';
import { useManagedCloudProjects } from '@/features/projects';
import { saveProjectChatHandoff } from '@/features/projects/lib/project-chat-handoff';
import { SchedulesPage } from '@/features/schedules';
import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { toUserMessage } from '@/lib/user-error-message';

type Tab = 'chats' | 'sources' | 'scheduled';

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

  const [tab, setTab] = useState<Tab>('chats');

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // The identical menu on the projects LIST page closes on Escape and moves
  // focus with the arrows through this hook; this one had outside-mousedown
  // only, so the same control behaved differently on the two surfaces.
  useMenuKeyboard({
    open: menuOpen,
    onClose: closeMenu,
    panelRef: menuPanelRef,
    triggerRef: menuTriggerRef,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);

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
    (
      content: string,
      attachments?: File[],
      skillId?: string,
      meta?: ComposerSendMeta,
    ): void | false => {
      if (!project) return false;
      try {
        saveProjectChatHandoff(sessionStorage, {
          content,
          projectId: project.id,
          attachments,
          skillId,
          meta: {
            // `workMode` comes from the composer, which already downgrades it to
            // 'chat' for anyone without the AGI Work entitlement
            // (`ChatComposerNew`: `workMode: canUseAgiWork ? workMode : 'chat'`).
            //
            // This used to force 'agiwork' unconditionally, overriding that
            // decision. Projects are available on every plan
            // (`projects: CLOUD_CHAT_TIERS`) but AGI Work is Pro-only
            // (`agi_work: PRO_TIERS`), so the first message sent from inside a
            // project was rejected with a 403 for every free and basic user.
            // the entitlement check the composer had already made correctly was
            // simply discarded one layer up.
            //
            // `projectId` IS still forced: the send happens on this project's
            // page, so the project scope is a property of where the user is, not
            // a composer preference.
            ...(meta ?? { workMode: 'chat', projectId: project.id }),
            projectId: project.id,
          },
        });
      } catch (error) {
        toast.error(
          toUserMessage(error, 'Could not open the project chat. Your draft is still here.'),
        );
        return false;
      }
      setActiveProject(project.id);
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
          <button
            type="button"
            onClick={retryProjects}
            style={{
              border: '1px solid var(--agi-rule-strong)',
              background: 'transparent',
              color: 'var(--agi-ink-2)',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
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
                fontFamily: 'var(--sans)',
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
          {/* Top bar: back + project actions                                  */}
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

            {/* Right side: project actions. Model choice belongs to the actual
                send-owning composer below, so this page never presents a
                second selector backed by a different store. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* "..." overflow menu */}
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button
                  ref={menuTriggerRef}
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
                    ref={menuPanelRef}
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
                      zIndex: 'var(--z-popover)',
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
                fontFamily: 'var(--sans)',
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
                <ProjectHeader compact presentation={headerPresentation} />
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
            {(['chats', 'sources', 'scheduled'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`project-detail-tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`project-detail-panel-${t}`}
                onClick={() => setTab(t)}
                data-testid={`project-detail-tab-${t}`}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom:
                    tab === t ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                  color: tab === t ? 'var(--agi-ink)' : 'var(--agi-ink-2)',
                  fontSize: 13,
                  fontWeight: tab === t ? 600 : 400,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  marginBottom: -1,
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {t === 'chats' ? 'Chats' : t === 'sources' ? 'Sources' : 'Scheduled'}
              </button>
            ))}
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Tab content                                                      */}
          {/* ---------------------------------------------------------------- */}
          <div
            style={{ flex: 1, paddingTop: 20, paddingBottom: 40 }}
            role="tabpanel"
            id={`project-detail-panel-${tab}`}
            aria-labelledby={`project-detail-tab-${tab}`}
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
                  <button
                    type="button"
                    onClick={() => void retryProjectChats()}
                    style={{
                      border: '1px solid var(--agi-rule-strong)',
                      background: 'transparent',
                      color: 'var(--agi-ink-2)',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
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
                                  fontSize: 12,
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
                        style={{
                          border: '1px solid var(--agi-rule-strong)',
                          background: 'transparent',
                          color: 'var(--agi-ink-2)',
                          padding: '6px 12px',
                          borderRadius: 8,
                          fontSize: 12,
                          cursor: isLoadingMoreProjectChats ? 'default' : 'pointer',
                          opacity: isLoadingMoreProjectChats ? 0.6 : 1,
                        }}
                      >
                        {isLoadingMoreProjectChats ? 'Loading...' : 'Load more chats'}
                      </button>
                    </div>
                  )}
                </>
              )
            ) : tab === 'sources' ? (
              <SourcesPanel projectId={project.id} />
            ) : (
              <SchedulesPage scope={{ projectId: project.id, projectName: project.name }} />
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
            onDuplicated={retryProjects}
            onDelete={handleDeleteProject}
          />
        )}
      </main>
    </WebAppShell>
  );
}

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
