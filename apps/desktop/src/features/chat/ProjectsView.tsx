/**
 * Projects View
 *
 * Main view for managing projects in the AGI desktop app.
 * Features:
 * - List all projects with search/filter
 * - Create new project dialog
 * - Edit project settings
 * - Delete project with confirmation
 * - Show project conversations and files
 */
import { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Brain,
  Layers,
  Plus,
  Search,
  MoreHorizontal,
  FolderOpen,
  Archive,
  Trash2,
  Settings,
  MessageSquare,
  File,
  ChevronRight,
  Star,
} from 'lucide-react';
import { ProjectHeader } from '@agiworkforce/unified-chat';
import {
  SYNCED_APP_SURFACES,
  summarizeProjectHeader,
  type ProjectRecord,
  type ProjectAccentColor,
} from '@agiworkforce/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Badge } from '@/components/ui/Badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import { ProjectEditDetailsDialog } from './ProjectEditDetailsDialog';
import {
  useProjectStore,
  selectActiveProjects,
  selectArchivedProjects,
  type Project,
} from '../../stores/projectStore';
import { useUnifiedChatStore, type ConversationSummary } from '../../stores/unifiedChatStore';
import { cn } from '../../lib/utils';

/**
 * Map the Desktop-local Project store shape to the canonical
 * `summarizeProjectHeader()` input. v1 is LOCAL ONLY, so we default
 * privacy/provider modes to Local and the allowed surfaces to the three
 * consumer surfaces that sync chat (web/desktop/mobile). The Desktop
 * store doesn't track project members yet, so memberCount is omitted —
 * the shared meta row hides the missing field automatically.
 */
const ACCENT_COLOR_CLASS: Record<ProjectAccentColor, string> = {
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  zinc: 'bg-zinc-500',
};

function mapDesktopProjectToHeaderRecord(project: Project): ProjectRecord {
  return {
    id: project.id,
    ownerUserId: 'local-user',
    name: project.name,
    description: project.description || null,
    defaultPrivacyMode: project.defaultPrivacyMode ?? 'local',
    defaultProviderMode: 'Local',
    allowedSurfaces: [...SYNCED_APP_SURFACES],
    instructions: project.customInstructions || null,
    iconEmoji: project.iconEmoji ?? null,
    accentColor: project.accentColor ?? null,
    knowledgeFileCount: project.knowledgeBaseFiles?.length ?? null,
    memberCount: null,
    lastUsedAt: project.updatedAt,
    importedFrom: 'manual',
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function formatRelativeFromIso(iso: string | undefined | null): string | undefined {
  if (!iso) return undefined;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return undefined;
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type FilterMode = 'all' | 'active' | 'archived';

export function ProjectsView() {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('active');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDetailsDialogOpen, setIsEditDetailsDialogOpen] = useState(false);
  const [isProjectSettingsDialogOpen, setIsProjectSettingsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // Store - use useShallow for array-returning selectors to prevent re-renders
  const projects = useProjectStore((state) => state.projects);
  const activeProjects = useProjectStore(useShallow(selectActiveProjects));
  const archivedProjects = useProjectStore(useShallow(selectArchivedProjects));
  const isLoading = useProjectStore((state) => state.isLoading);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const archiveProject = useProjectStore((state) => state.archiveProject);
  const unarchiveProject = useProjectStore((state) => state.unarchiveProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const setActiveView = useUnifiedChatStore((state) => state.setActiveView);
  const selectConversation = useUnifiedChatStore((state) => state.selectConversation);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    let baseProjects: Project[];

    switch (filterMode) {
      case 'active':
        baseProjects = activeProjects;
        break;
      case 'archived':
        baseProjects = archivedProjects;
        break;
      default:
        baseProjects = projects;
    }

    if (!searchQuery.trim()) {
      return baseProjects;
    }

    const query = searchQuery.toLowerCase();
    return baseProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.description.toLowerCase().includes(query),
    );
  }, [projects, activeProjects, archivedProjects, filterMode, searchQuery]);

  useEffect(() => {
    if (filteredProjects.length === 0) {
      if (selectedProjectId !== null) {
        setSelectedProjectId(null);
      }
      return;
    }

    if (
      !selectedProjectId ||
      !filteredProjects.some((project) => project.id === selectedProjectId)
    ) {
      const nextProject = filteredProjects[0];
      if (nextProject) {
        setSelectedProjectId(nextProject.id);
      }
    }
  }, [filteredProjects, selectedProjectId]);

  // Handlers
  const handleCreateProject = () => {
    setIsCreateDialogOpen(true);
  };

  const handleProjectCreated = (project: Project) => {
    setSelectedProjectId(project.id);
    setActiveProject(project.id);
    setFilterMode(project.isArchived ? 'archived' : 'active');
  };

  const handleEditProjectDetails = (project: Project) => {
    setEditingProject(project);
    setIsEditDetailsDialogOpen(true);
  };

  const handleOpenProjectSettings = (project: Project) => {
    setSettingsProject(project);
    setIsProjectSettingsDialogOpen(true);
  };

  const handleDeleteProject = (project: Project) => {
    setProjectToDelete(project);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (projectToDelete) {
      await deleteProject(projectToDelete.id);
      setProjectToDelete(null);
      setIsDeleteDialogOpen(false);
      if (selectedProjectId === projectToDelete.id) {
        setSelectedProjectId(null);
      }
    }
  };

  const handleArchiveProject = async (project: Project) => {
    if (project.isArchived) {
      await unarchiveProject(project.id);
    } else {
      await archiveProject(project.id);
    }
  };

  const handleOpenProject = (project: Project) => {
    setActiveProject(project.id);
    setActiveView('chat');
  };

  const handleOpenConversation = (projectId: string, conversationId: string) => {
    setActiveProject(projectId);
    selectConversation(conversationId);
    setActiveView('chat');
  };

  const handleProjectClick = (project: Project) => {
    setSelectedProjectId(project.id);
  };

  // Empty state
  if (!isLoading && projects.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background/50 p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground">
          <Layers className="h-8 w-8" />
        </div>
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-foreground">
          Keep related work together
        </h2>
        <p className="mb-6 max-w-md text-sm leading-6 text-muted-foreground">
          Projects give AGI shared context across chats, files, instructions, and memory.
        </p>
        <Button
          onClick={handleCreateProject}
          className="bg-foreground text-background hover:bg-foreground/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create project
        </Button>

        <ProjectSettingsDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          mode="create"
          onCreated={handleProjectCreated}
        />
      </div>
    );
  }

  const selectedProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)
    : null;

  return (
    <div className="flex h-full bg-background">
      {/* Projects List */}
      <div className="w-80 border-r border-border flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-400" />
              Projects
            </h2>
            <Button
              onClick={handleCreateProject}
              size="sm"
              aria-label="Create project"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="pl-9 bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 mt-3">
            {(['active', 'archived', 'all'] as FilterMode[]).map((mode) => (
              <button
                type="button"
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize',
                  filterMode === mode
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                {mode}
                <span className="ml-1.5 text-muted-foreground">
                  (
                  {mode === 'active'
                    ? activeProjects.length
                    : mode === 'archived'
                      ? archivedProjects.length
                      : projects.length}
                  )
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Projects List */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading projects...</div>
          ) : filteredProjects.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              {searchQuery ? 'No projects match your search' : 'No projects found'}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredProjects.map((project) => (
                <ProjectListItem
                  key={project.id}
                  project={project}
                  isSelected={selectedProjectId === project.id}
                  onClick={() => handleProjectClick(project)}
                  onEditDetails={() => handleEditProjectDetails(project)}
                  onOpenSettings={() => handleOpenProjectSettings(project)}
                  onDelete={() => handleDeleteProject(project)}
                  onArchive={() => handleArchiveProject(project)}
                  onOpen={() => handleOpenProject(project)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Project Details */}
      <div className="flex-1 flex flex-col">
        {selectedProject ? (
          <ProjectDetails
            project={selectedProject}
            onEditDetails={() => handleEditProjectDetails(selectedProject)}
            onOpenSettings={() => handleOpenProjectSettings(selectedProject)}
            onOpen={() => handleOpenProject(selectedProject)}
            onOpenConversation={(conversationId) =>
              handleOpenConversation(selectedProject.id, conversationId)
            }
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FolderOpen className="w-16 h-16 mb-4 opacity-30" />
            <p>Select a project to view details</p>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ProjectSettingsDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        mode="create"
        onCreated={handleProjectCreated}
      />

      <ProjectEditDetailsDialog
        open={isEditDetailsDialogOpen}
        onOpenChange={setIsEditDetailsDialogOpen}
        project={editingProject}
      />

      <ProjectSettingsDialog
        open={isProjectSettingsDialogOpen}
        onOpenChange={setIsProjectSettingsDialogOpen}
        project={settingsProject}
        mode="edit"
      />

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Project"
        description={`Are you sure you want to delete "${projectToDelete?.name}"? This action cannot be undone. All linked conversations will be unlinked but not deleted.`}
        confirmText="Delete"
        onConfirm={handleConfirmDelete}
        variant="destructive"
      />
    </div>
  );
}

// Project List Item Component
interface ProjectListItemProps {
  project: Project;
  isSelected: boolean;
  onClick: () => void;
  onEditDetails: () => void;
  onOpenSettings: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onOpen: () => void;
}

function ProjectListItem({
  project,
  isSelected,
  onClick,
  onEditDetails,
  onOpenSettings,
  onDelete,
  onArchive,
  onOpen,
}: ProjectListItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative p-3 rounded-lg cursor-pointer transition-colors',
        isSelected ? 'bg-muted' : 'hover:bg-accent/50',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Project Icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
          style={{ backgroundColor: project.color || 'var(--color-teal-500)' }}
        >
          {project.iconEmoji ? (
            <span>{project.iconEmoji}</span>
          ) : (
            <Layers className="w-5 h-5 text-white" />
          )}
        </div>

        {/* Project Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {project.accentColor && (
              <span
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  ACCENT_COLOR_CLASS[project.accentColor],
                )}
              />
            )}
            <h3 className="text-sm font-medium text-foreground truncate">{project.name}</h3>
            {project.isArchived && (
              <Badge variant="secondary" className="bg-accent text-muted-foreground text-xs">
                Archived
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {project.description || 'No description'}
          </p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {project.conversationIds.length}
            </span>
            <span className="flex items-center gap-1">
              <File className="w-3 h-3" />
              {project.files.length}
            </span>
          </div>
        </div>

        {/* Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 h-8 w-8 p-0 text-muted-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border">
            <DropdownMenuItem onClick={onOpen} className="text-foreground">
              <FolderOpen className="w-4 h-4 mr-2" />
              Open Project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEditDetails} className="text-foreground">
              <File className="w-4 h-4 mr-2" />
              Edit Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSettings} className="text-foreground">
              <Settings className="w-4 h-4 mr-2" />
              Project Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-accent" />
            <DropdownMenuItem onClick={onArchive} className="text-foreground">
              <Archive className="w-4 h-4 mr-2" />
              {project.isArchived ? 'Unarchive' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-400">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// Project Details Component
interface ProjectDetailsProps {
  project: Project;
  onEditDetails: () => void;
  onOpenSettings: () => void;
  onOpen: () => void;
  onOpenConversation: (conversationId: string) => void;
}

function ProjectDetails({
  project,
  onEditDetails,
  onOpenSettings,
  onOpen,
  onOpenConversation,
}: ProjectDetailsProps) {
  const conversations = useUnifiedChatStore((state) => state.conversations);

  // Get linked conversations
  const linkedConversations = conversations.filter((conv: ConversationSummary) =>
    project.conversationIds.includes(conv.id),
  );

  const headerPresentation = useMemo(
    () =>
      summarizeProjectHeader({
        project: mapDesktopProjectToHeaderRecord(project),
        lastUsedRelativeLabel: formatRelativeFromIso(project.updatedAt),
      }),
    [project],
  );

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <ProjectHeader presentation={headerPresentation} />
            {project.isArchived && (
              <div className="mt-2">
                <Badge variant="secondary" className="bg-accent text-muted-foreground">
                  Archived
                </Badge>
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              onClick={onEditDetails}
              className="border-border text-foreground hover:bg-accent"
            >
              <File className="w-4 h-4 mr-2" />
              Edit Details
            </Button>
            <Button
              variant="outline"
              onClick={onOpenSettings}
              className="border-border text-foreground hover:bg-accent"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            <Button onClick={onOpen} className="bg-blue-600 hover:bg-blue-700 text-white">
              <FolderOpen className="w-4 h-4 mr-2" />
              Open Project
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 grid grid-cols-2 gap-6">
        <div className="col-span-2 grid gap-4 md:grid-cols-3">
          {[
            {
              label: 'Conversations',
              value: linkedConversations.length,
              icon: MessageSquare,
              tone: 'text-blue-400',
            },
            {
              label: 'Project Files',
              value: project.files.length,
              icon: File,
              tone: 'text-green-400',
            },
            {
              label: 'Knowledge Files',
              value: project.knowledgeBaseFiles?.length ?? 0,
              icon: Brain,
              tone: 'text-purple-400',
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <item.icon className={cn('h-4 w-4', item.tone)} />
                <span>{item.label}</span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{item.value}</div>
            </div>
          ))}
        </div>

        {/* Custom Instructions */}
        <div className="col-span-2 bg-card rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-500" />
            Custom Instructions
          </h3>
          {project.customInstructions ? (
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-background rounded p-3 max-h-40 overflow-auto">
              {project.customInstructions}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">No custom instructions set</p>
          )}
        </div>

        {/* Linked Conversations */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            Linked Conversations
            <Badge variant="secondary" className="bg-muted text-muted-foreground ml-auto">
              {linkedConversations.length}
            </Badge>
          </h3>
          {linkedConversations.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-auto">
              {linkedConversations.map((conv) => (
                <button
                  type="button"
                  key={conv.id}
                  onClick={() => onOpenConversation(conv.id)}
                  className="flex w-full items-center gap-2 rounded-md bg-muted p-2 text-sm transition-colors hover:bg-accent/80"
                >
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground truncate">
                    {conv.title || 'Untitled Conversation'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No conversations linked yet</p>
          )}
        </div>

        {/* Project Files */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <File className="w-4 h-4 text-green-400" />
            Project Files
            <Badge variant="secondary" className="bg-muted text-muted-foreground ml-auto">
              {project.files.length}
            </Badge>
          </h3>
          {project.files.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-auto">
              {project.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm"
                >
                  <File className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{file.path}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No files added yet</p>
          )}
        </div>

        <div className="col-span-2 bg-card rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            Knowledge Base
            <Badge variant="secondary" className="bg-muted text-muted-foreground ml-auto">
              {project.knowledgeBaseFiles?.length ?? 0}
            </Badge>
          </h3>
          {project.knowledgeBaseFiles && project.knowledgeBaseFiles.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-auto">
              {project.knowledgeBaseFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm"
                >
                  <Brain className="w-4 h-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-foreground">{file.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{file.path}</div>
                  </div>
                  {file.size != null && (
                    <span className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No knowledge base files added yet
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
