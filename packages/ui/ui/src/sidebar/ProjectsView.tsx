'use client';

import { useMemo, useState } from 'react';
import {
  Brain,
  ChevronRight,
  File,
  FolderOpen,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Archive,
} from 'lucide-react';
import { cn } from '../cn';
import { useUiTranslation } from '../i18n';
import { Menu, MenuItem, MenuSeparator } from './Menu';
import type { SidebarProject } from './types';

export interface ProjectViewConversation {
  id: string;
  title: string;
}

export interface ProjectViewFile {
  id: string;
  name: string;
  path?: string;
  size?: number;
}

export interface ProjectViewProject extends SidebarProject {
  archived?: boolean;
  customInstructions?: string;
  conversations?: ProjectViewConversation[];
  files?: ProjectViewFile[];
  knowledgeFiles?: ProjectViewFile[];
}

export interface ProjectsViewProps {
  projects: ProjectViewProject[];
  selectedProjectId?: string | null;
  isLoading?: boolean;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onOpenProject: (id: string) => void;
  onNewChatInProject?: (id: string) => void;
  onRenameProject?: (id: string) => void;
  onOpenSettings?: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onArchiveProject?: (id: string) => void;
  onOpenConversation: (projectId: string, conversationId: string) => void;
  className?: string;
}

export function ProjectsView({
  projects,
  selectedProjectId = null,
  isLoading = false,
  onSelectProject,
  onCreateProject,
  onOpenProject,
  onNewChatInProject,
  onRenameProject,
  onOpenSettings,
  onDeleteProject,
  onArchiveProject,
  onOpenConversation,
  className,
}: ProjectsViewProps) {
  const { t } = useUiTranslation('chat');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(term) || (p.description ?? '').toLowerCase().includes(term),
    );
  }, [projects, searchQuery]);

  const selected = selectedProjectId ? projects.find((p) => p.id === selectedProjectId) : null;

  if (!isLoading && projects.length === 0) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center bg-[hsl(var(--background))]/50 p-8 text-center',
          className,
        )}
      >
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))]">
          <Layers className="h-8 w-8" />
        </div>
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
          {t('projects.emptyTitle', 'Keep related work together')}
        </h2>
        <p className="mb-6 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]">
          {t(
            'projects.emptyBody',
            'Projects give AGI shared context across chats, files, instructions, and memory.',
          )}
        </p>
        <button
          type="button"
          onClick={onCreateProject}
          className="flex items-center gap-2 rounded-lg bg-[hsl(var(--foreground))] px-4 py-2 text-sm font-medium text-[hsl(var(--background))] transition-colors hover:bg-[hsl(var(--foreground))]/90"
        >
          <Plus className="h-4 w-4" />
          {t('projects.create', 'Create project')}
        </button>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full bg-[hsl(var(--background))]', className)}>
      {/* Project list */}
      <div className="flex w-80 flex-col border-r border-[hsl(var(--border))]">
        <div className="border-b border-[hsl(var(--border))] p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[hsl(var(--foreground))]">
              <Layers className="h-5 w-5 text-blue-400" />
              {t('sidebar.projects', 'Projects')}
            </h2>
            <button
              type="button"
              onClick={onCreateProject}
              aria-label={t('projects.create', 'Create project')}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] transition-colors hover:bg-[hsl(var(--primary))]/90"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('projects.searchPlaceholder', 'Search projects...')}
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-2 pl-9 pr-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-[hsl(var(--muted-foreground))]">
              {t('projects.loading', 'Loading projects...')}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-[hsl(var(--muted-foreground))]">
              {searchQuery
                ? t('projects.noMatches', 'No projects match your search')
                : t('projects.none', 'No projects found')}
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filtered.map((project) => (
                <ProjectListItem
                  key={project.id}
                  project={project}
                  isSelected={selectedProjectId === project.id}
                  onClick={() => onSelectProject(project.id)}
                  onOpen={() => onOpenProject(project.id)}
                  onNewChat={onNewChatInProject ? () => onNewChatInProject(project.id) : undefined}
                  onRename={onRenameProject ? () => onRenameProject(project.id) : undefined}
                  onOpenSettings={onOpenSettings ? () => onOpenSettings(project.id) : undefined}
                  onArchive={onArchiveProject ? () => onArchiveProject(project.id) : undefined}
                  onDelete={() => onDeleteProject(project.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail pane */}
      <div className="flex flex-1 flex-col">
        {selected ? (
          <ProjectDetails
            project={selected}
            onOpen={() => onOpenProject(selected.id)}
            onOpenSettings={onOpenSettings ? () => onOpenSettings(selected.id) : undefined}
            onOpenConversation={(conversationId) => onOpenConversation(selected.id, conversationId)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-[hsl(var(--muted-foreground))]">
            <FolderOpen className="mb-4 h-16 w-16 opacity-30" />
            <p>{t('projects.selectPrompt', 'Select a project to view details')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface ProjectListItemProps {
  project: ProjectViewProject;
  isSelected: boolean;
  onClick: () => void;
  onOpen: () => void;
  onNewChat?: () => void;
  onRename?: () => void;
  onOpenSettings?: () => void;
  onArchive?: () => void;
  onDelete: () => void;
}

function ProjectListItem({
  project,
  isSelected,
  onClick,
  onOpen,
  onNewChat,
  onRename,
  onOpenSettings,
  onArchive,
  onDelete,
}: ProjectListItemProps) {
  const { t } = useUiTranslation('chat');

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer rounded-lg p-3 transition-colors',
        isSelected ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--accent))]/50',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg"
          style={{ backgroundColor: project.color || 'hsl(var(--primary))' }}
        >
          {project.iconEmoji ? (
            <span>{project.iconEmoji}</span>
          ) : (
            <Layers className="h-5 w-5 text-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
              {project.name}
            </h3>
            {project.archived && (
              <span className="rounded-full bg-[hsl(var(--accent))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                {t('projects.archived', 'Archived')}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
            {project.description || t('projects.noDescription', 'No description')}
          </p>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {project.conversations?.length ?? project.conversationCount ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <File className="h-3 w-3" />
              {project.files?.length ?? 0}
            </span>
          </div>
        </div>

        <Menu
          align="end"
          trigger={({ toggle }) => (
            <button
              type="button"
              aria-label={t('projects.actions', 'Project actions')}
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] opacity-0 transition-opacity hover:bg-[hsl(var(--accent))] group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <MenuItem close={close} onSelect={onOpen} icon={<FolderOpen className="h-4 w-4" />}>
                {t('projects.open', 'Open Project')}
              </MenuItem>
              {onNewChat && (
                <MenuItem close={close} onSelect={onNewChat} icon={<Plus className="h-4 w-4" />}>
                  {t('sidebar.newChatAction', 'New chat')}
                </MenuItem>
              )}
              {onRename && (
                <MenuItem close={close} onSelect={onRename} icon={<File className="h-4 w-4" />}>
                  {t('sidebar.rename', 'Rename')}
                </MenuItem>
              )}
              {onOpenSettings && (
                <MenuItem
                  close={close}
                  onSelect={onOpenSettings}
                  icon={<Settings className="h-4 w-4" />}
                >
                  {t('projects.settings', 'Project Settings')}
                </MenuItem>
              )}
              <MenuSeparator />
              {onArchive && (
                <MenuItem close={close} onSelect={onArchive} icon={<Archive className="h-4 w-4" />}>
                  {project.archived
                    ? t('projects.unarchive', 'Unarchive')
                    : t('sidebar.archive', 'Archive')}
                </MenuItem>
              )}
              <MenuItem
                close={close}
                onSelect={onDelete}
                icon={<Trash2 className="h-4 w-4" />}
                destructive
              >
                {t('sidebar.delete', 'Delete')}
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </div>
  );
}

interface ProjectDetailsProps {
  project: ProjectViewProject;
  onOpen: () => void;
  onOpenSettings?: () => void;
  onOpenConversation: (conversationId: string) => void;
}

function ProjectDetails({
  project,
  onOpen,
  onOpenSettings,
  onOpenConversation,
}: ProjectDetailsProps) {
  const { t } = useUiTranslation('chat');
  const conversations = project.conversations ?? [];
  const files = project.files ?? [];
  const knowledgeFiles = project.knowledgeFiles ?? [];

  return (
    <div className="flex-1 overflow-auto">
      <div className="border-b border-[hsl(var(--border))] p-6">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl"
                style={{ backgroundColor: project.color || 'hsl(var(--primary))' }}
              >
                {project.iconEmoji ? (
                  <span>{project.iconEmoji}</span>
                ) : (
                  <Layers className="h-6 w-6 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold text-[hsl(var(--foreground))]">
                  {project.name}
                </h1>
                {project.description && (
                  <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">
                    {project.description}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
              >
                <Settings className="h-4 w-4" />
                {t('projects.settingsShort', 'Settings')}
              </button>
            )}
            <button
              type="button"
              onClick={onOpen}
              className="flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm text-[hsl(var(--primary-foreground))] transition-colors hover:bg-[hsl(var(--primary))]/90"
            >
              <FolderOpen className="h-4 w-4" />
              {t('projects.open', 'Open Project')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 p-6">
        <div className="col-span-2 grid gap-4 md:grid-cols-3">
          {[
            {
              label: t('projects.statConversations', 'Conversations'),
              value: conversations.length,
              icon: MessageSquare,
              tone: 'text-blue-400',
            },
            {
              label: t('projects.statFiles', 'Project Files'),
              value: files.length,
              icon: File,
              tone: 'text-green-400',
            },
            {
              label: t('projects.statKnowledgeFiles', 'Knowledge Files'),
              value: knowledgeFiles.length,
              icon: Brain,
              tone: 'text-purple-400',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
            >
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <item.icon className={cn('h-4 w-4', item.tone)} />
                <span>{item.label}</span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Custom instructions */}
        <div className="col-span-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
            <Sparkles className="h-4 w-4 text-amber-500" />
            {t('projects.customInstructions', 'Custom Instructions')}
          </h3>
          {project.customInstructions ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[hsl(var(--background))] p-3 font-mono text-sm text-[hsl(var(--muted-foreground))]">
              {project.customInstructions}
            </pre>
          ) : (
            <p className="text-sm italic text-[hsl(var(--muted-foreground))]">
              {t('projects.noCustomInstructions', 'No custom instructions set')}
            </p>
          )}
        </div>

        {/* Linked conversations */}
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
            <MessageSquare className="h-4 w-4 text-blue-400" />
            {t('projects.linkedConversations', 'Linked Conversations')}
            <span className="ml-auto rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              {conversations.length}
            </span>
          </h3>
          {conversations.length > 0 ? (
            <div className="max-h-60 space-y-2 overflow-auto">
              {conversations.map((conv) => (
                <button
                  type="button"
                  key={conv.id}
                  onClick={() => onOpenConversation(conv.id)}
                  className="flex w-full items-center gap-2 rounded-md bg-[hsl(var(--muted))] p-2 text-sm transition-colors hover:bg-[hsl(var(--accent))]/80"
                >
                  <MessageSquare className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                  <span className="truncate text-[hsl(var(--foreground))]">
                    {conv.title || t('projects.untitledConversation', 'Untitled Conversation')}
                  </span>
                  <ChevronRight className="ml-auto h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-[hsl(var(--muted-foreground))]">
              {t('projects.noLinkedConversations', 'No conversations linked yet')}
            </p>
          )}
        </div>

        {/* Knowledge base */}
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
            <Brain className="h-4 w-4 text-purple-400" />
            {t('projects.knowledgeBase', 'Knowledge Base')}
            <span className="ml-auto rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              {knowledgeFiles.length}
            </span>
          </h3>
          {knowledgeFiles.length > 0 ? (
            <div className="max-h-60 space-y-2 overflow-auto">
              {knowledgeFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 rounded-md bg-[hsl(var(--muted))] p-2 text-sm"
                >
                  <Brain className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[hsl(var(--foreground))]">{file.name}</div>
                    {file.path && (
                      <div className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                        {file.path}
                      </div>
                    )}
                  </div>
                  {file.size != null && (
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-[hsl(var(--muted-foreground))]">
              {t('projects.noKnowledgeFiles', 'No knowledge base files added yet')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
