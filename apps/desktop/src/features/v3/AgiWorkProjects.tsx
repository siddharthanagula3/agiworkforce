import { ArrowLeft, FileText, MessageSquare, Plus, Settings, SquarePen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useProjectStore, type Project } from '../../stores/projectStore';
import { useChatStore } from '../../stores/chat';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';
import { ProjectSettingsDialog } from '../chat/ProjectSettingsDialog';

const PROJECT_COLORS = [
  'var(--chat-accent-secondary)',
  'var(--chat-accent-primary)',
  'var(--chat-info)',
  'var(--chat-success)',
  'var(--chat-warning)',
  'var(--chat-destructive)',
];

function projectColor(project: Project, index: number): string {
  if (project.color) return project.color;
  return PROJECT_COLORS[index % PROJECT_COLORS.length] ?? 'var(--chat-accent-secondary)';
}

function timeAgo(iso: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t('time.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('time.mAgoShort', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t('sidebar.groups.yesterday').toLowerCase();
  if (days < 7) return t('time.daysAgo', { count: days });
  return t('time.weeksAgo', { count: Math.floor(days / 7) });
}

interface AgiWorkProjectsProps {
  onCreateProject?: () => void;
  onNewChat?: (projectId: string) => void;
  onOpenConversation?: (conversationId: string) => void;
}

export function AgiWorkProjects({
  onCreateProject,
  onNewChat,
  onOpenConversation,
}: AgiWorkProjectsProps) {
  const { t } = useTranslation('v3');
  const allProjects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const isLoading = useProjectStore((state) => state.isLoading);
  const error = useProjectStore((state) => state.error);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const conversations = useChatStore((state) => state.conversations);
  const isManagedCloud = useAppModeStore(selectPrivacyMode) === 'managed';
  const projects = useMemo(
    () => allProjects.filter((project) => !project.isArchived),
    [allProjects],
  );
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const projectConversations = useMemo(
    () =>
      activeProject
        ? conversations
            .filter((conversation) => conversation.projectId === activeProject.id)
            .sort(
              (left, right) =>
                new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
            )
        : [],
    [activeProject, conversations],
  );
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);

  if (activeProject) {
    return (
      <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--chat-border-strong)]">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
          <button
            type="button"
            onClick={() => setActiveProject(null)}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
          >
            <ArrowLeft size={15} />
            All projects
          </button>

          <div className="rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-5">
            <div className="flex items-start gap-3">
              <span
                className="mt-1 h-3 w-3 shrink-0 rounded-full"
                style={{ background: projectColor(activeProject, 0) }}
              />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold text-[var(--chat-text-primary)]">
                  {activeProject.name}
                </h1>
                {activeProject.description && (
                  <p className="mt-1 text-sm leading-6 text-[var(--chat-text-secondary)]">
                    {activeProject.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSettingsProject(activeProject)}
                aria-label="Project settings"
                className="rounded-lg p-2 text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
              >
                <Settings size={16} />
              </button>
              <button
                type="button"
                onClick={() => onNewChat?.(activeProject.id)}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--chat-accent-primary)] px-3 py-2 text-xs font-medium text-[var(--chat-accent-primary-contrast)] hover:opacity-85"
              >
                <SquarePen size={14} />
                New chat
              </button>
            </div>

            {activeProject.customInstructions && (
              <div className="mt-4 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--chat-text-secondary)]">
                  <FileText size={13} />
                  Project instructions
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[var(--chat-text-muted)]">
                  {activeProject.customInstructions}
                </p>
              </div>
            )}
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--chat-text-primary)]">
                Project chats
              </h2>
              <span className="text-xs text-[var(--chat-text-muted)]">
                {projectConversations.length} {isManagedCloud ? 'synced' : 'local'}
              </span>
            </div>
            {projectConversations.length === 0 ? (
              <button
                type="button"
                onClick={() => onNewChat?.(activeProject.id)}
                className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-[var(--chat-border)] px-4 py-10 text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)]"
              >
                <MessageSquare size={24} className="mb-2 opacity-60" />
                <span className="text-sm font-medium text-[var(--chat-text-secondary)]">
                  Start the first project chat
                </span>
                <span className="mt-1 text-xs">
                  {isManagedCloud
                    ? 'Its instructions and Cloud sources will be included automatically.'
                    : 'Its instructions and Local knowledge will be included automatically.'}
                </span>
              </button>
            ) : (
              <div className="space-y-2">
                {projectConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => onOpenConversation?.(conversation.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-4 py-3 text-left hover:bg-[var(--chat-surface-hover)]"
                  >
                    <MessageSquare size={15} className="shrink-0 text-[var(--chat-text-muted)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--chat-text-primary)]">
                        {conversation.title || 'Untitled'}
                      </span>
                      {conversation.lastMessage && (
                        <span className="mt-0.5 block truncate text-xs text-[var(--chat-text-muted)]">
                          {conversation.lastMessage}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--chat-text-muted)]">
                      {timeAgo(new Date(conversation.updatedAt).toISOString(), t)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <ProjectSettingsDialog
          open={settingsProject !== null}
          onOpenChange={(next) => {
            if (!next) setSettingsProject(null);
          }}
          project={settingsProject}
          mode="edit"
        />
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--chat-border-strong)]">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-xl font-medium text-[var(--chat-text-primary)]">
              {t('agiWork.projects.title')}
            </h1>
            <button
              type="button"
              disabled={isLoading}
              onClick={onCreateProject}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--chat-accent-primary)] px-3 py-1.5 text-xs font-medium text-[var(--chat-accent-primary-contrast)] hover:opacity-85 disabled:opacity-50"
            >
              <Plus size={13} strokeWidth={2.4} />
              {t('agiWork.projects.newProject')}
            </button>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-[var(--chat-destructive)]/30 bg-[var(--chat-destructive)]/5 px-4 py-4 text-center"
            >
              <p className="text-sm text-[var(--chat-destructive)]">{error}</p>
              {projects.length > 0 ? (
                <p className="mt-1 text-xs text-[var(--chat-text-muted)]">
                  Showing the last loaded project list.
                </p>
              ) : null}
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void loadProjects()}
                className="mt-3 rounded-lg border border-[var(--chat-border)] px-3 py-1.5 text-xs font-medium text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)] disabled:opacity-50"
              >
                {isLoading ? 'Retrying…' : 'Try again'}
              </button>
            </div>
          ) : isLoading && projects.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--chat-text-muted)]">
              {t('common.loading')}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--chat-border)] px-4 py-8 text-center text-sm text-[var(--chat-text-muted)]">
              {t('agiWork.projects.empty')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {projects.map((project, index) => (
                <div
                  key={project.id}
                  className="group relative flex flex-col gap-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-4 text-left hover:bg-[var(--chat-surface-hover)]"
                >
                  <div className="flex w-full items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setActiveProject(project.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
                      aria-label={`Open ${project.name} project`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: projectColor(project, index) }}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-[var(--chat-text-primary)]">
                        {project.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsProject(project)}
                      aria-label="Project settings"
                      title={`Settings for ${project.name}`}
                      className="rounded-md p-1.5 text-[var(--chat-text-muted)] opacity-70 hover:bg-[var(--chat-surface-base)] hover:text-[var(--chat-text-primary)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)] group-hover:opacity-100"
                    >
                      <Settings size={14} aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveProject(project.id)}
                    className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
                  >
                    {project.description && (
                      <span className="line-clamp-2 text-xs leading-relaxed text-[var(--chat-text-secondary)]">
                        {project.description}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 pt-1 text-xs text-[var(--chat-text-muted)]">
                      <span>
                        {t('agiWork.projects.updated', { when: timeAgo(project.updatedAt, t) })}
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        {t('agiWork.projects.sessions', {
                          count: project.conversationCount ?? project.conversationIds.length,
                        })}
                      </span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ProjectSettingsDialog
        open={settingsProject !== null}
        onOpenChange={(next) => {
          if (!next) setSettingsProject(null);
        }}
        project={settingsProject}
        mode="edit"
      />
    </>
  );
}
