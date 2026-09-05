'use client';

import { useCallback, useMemo, useState } from 'react';
import { ProjectGallery, ProjectCard } from '@agiworkforce/unified-chat';
import type { Project, ProjectGalleryCreateInput } from '@agiworkforce/unified-chat';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreateProjectDialog } from '@features/chat/components/dialogs/CreateProjectDialog';
import { ProjectSettingsDialog } from '@features/projects/components/ProjectSettingsDialog';
import { useManagedCloudProjects, useProjectStore } from '@features/projects';
import { webManagedCloudProjects } from '@/features/projects/services/managed-cloud-projects';
import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/user-error-message';
import { ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';

type SortMode = 'updated' | 'created' | 'name' | 'starred';

const SORT_LABELS: Record<SortMode, string> = {
  updated: 'Updated (newest)',
  created: 'Created (newest)',
  name: 'Name (A-Z)',
  starred: 'Starred first',
};

function sortProjects(projects: Project[], mode: SortMode): Project[] {
  const active = projects.filter((p) => !p.isArchived);
  return [...active].sort((a, b) => {
    switch (mode) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'created':
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      case 'starred':
        if ((b.starred ?? false) !== (a.starred ?? false)) {
          return (b.starred ? 1 : 0) - (a.starred ? 1 : 0);
        }
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
      case 'updated':
      default:
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    }
  });
}

export default function ProjectsPage() {
  const router = useRouter();
  const updateProject = useProjectStore((s) => s.updateProject);
  const addProject = useProjectStore((s) => s.addProject);
  const removeProject = useProjectStore((s) => s.removeProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const { projects, status: projectStatus, error: projectError, retry } = useManagedCloudProjects();

  const [editProject, setEditProject] = useState<Project | null>(null);
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1');
  const [sortMode, setSortMode] = useState<SortMode>('updated');

  const sortedProjects = useMemo(() => sortProjects(projects, sortMode), [projects, sortMode]);
  const [showArchived, setShowArchived] = useState(false);
  const archivedProjects = useMemo(
    () =>
      projects
        .filter((p) => p.isArchived)
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [projects],
  );
  const displayProjects = showArchived ? archivedProjects : sortedProjects;

  const handleCreateProject = useCallback(
    async (input: ProjectGalleryCreateInput): Promise<Project> => {
      return webManagedCloudProjects.createProject(input);
    },
    [],
  );

  const handleArchiveProjectServer = useCallback(
    async (project: Project, alreadyRemovedFromView: boolean) => {
      if (!alreadyRemovedFromView) {
        updateProject(project.id, { isArchived: true });
      }
      try {
        await webManagedCloudProjects.updateProject(project.id, { isArchived: true });
      } catch (error) {
        updateProject(project.id, { isArchived: false });
        toast.error(toUserMessage(error, 'Failed to archive project'));
      }
    },
    [updateProject],
  );

  const handleUnarchiveProjectServer = useCallback(
    async (project: Project) => {
      updateProject(project.id, { isArchived: false });
      try {
        await webManagedCloudProjects.updateProject(project.id, { isArchived: false });
      } catch (error) {
        updateProject(project.id, { isArchived: true });
        toast.error(toUserMessage(error, 'Failed to restore project'));
      }
    },
    [updateProject],
  );

  const persistStar = useCallback(
    async (projectId: string, starred: boolean) => {
      try {
        await webManagedCloudProjects.updateProject(projectId, { starred });
      } catch (error) {
        updateProject(projectId, { starred: !starred });
        toast.error(toUserMessage(error, 'Failed to update star'));
      }
    },
    [updateProject],
  );

  const handleShareProject = useCallback(async (project: Project) => {
    const url = `${window.location.origin}/chat/projects/${encodeURIComponent(project.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Project link copied');
    } catch (error) {
      toast.error(toUserMessage(error, 'Could not copy the project link'));
    }
  }, []);

  const handleDeleteProjectServer = useCallback(
    async (project: Project, alreadyRemovedFromView: boolean) => {
      try {
        await webManagedCloudProjects.deleteProject(project.id);
        if (!alreadyRemovedFromView) removeProject(project.id);
      } catch (error) {
        if (
          alreadyRemovedFromView &&
          !useProjectStore.getState().projects.some((candidate) => candidate.id === project.id)
        ) {
          addProject(project);
        }
        toast.error(toUserMessage(error, 'Failed to delete project'));
      }
    },
    [addProject, removeProject],
  );

  const useGallery = sortMode === 'updated' && !showArchived;

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
        <div
          style={{
            maxWidth: 1024,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          {/* Page header with sort control */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              // Without wrapping, the 177px sort control held its width against
              // a 320px screen and squeezed the introduction into a 109px
              // column 304px tall - one and two words per line - while its own
              // right edge still fell outside the viewport.
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                flex: '1 1 260px',
                minWidth: 0,
              }}
            >
              <h1
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 28,
                  fontWeight: 500,
                  color: 'var(--agi-ink)',
                  margin: 0,
                }}
              >
                Projects
              </h1>
              <p
                style={{
                  fontSize: 14,
                  color: 'var(--agi-ink-2)',
                  margin: 0,
                  maxWidth: 640,
                  lineHeight: 1.55,
                }}
              >
                Group related conversations under a shared project. Each project can carry its own
                files, instructions, and chat history. Projects sync securely across your AGI Web,
                Mobile, and Desktop cloud sessions.
              </p>
            </div>

            {/* Hidden on the gallery branch, which ships its own New button. */}
            {!useGallery && projectStatus === 'ready' && (
              <button
                type="button"
                data-testid="projects-new-btn"
                onClick={() => setCreateOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  border: '1px solid transparent',
                  borderRadius: 9999,
                  background: 'var(--color-primary)',
                  color: 'var(--color-primary-foreground)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                New project
              </button>
            )}

            {/* Show archived toggle */}
            {archivedProjects.length > 0 && (
              <button
                type="button"
                data-testid="projects-show-archived-btn"
                onClick={() => setShowArchived((v) => !v)}
                aria-pressed={showArchived}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  border: '1px solid var(--agi-rule-strong)',
                  borderRadius: 9999,
                  background: showArchived ? 'var(--agi-rule)' : 'transparent',
                  color: 'var(--agi-ink-2)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {showArchived ? 'Active projects' : `Archived (${archivedProjects.length})`}
              </button>
            )}

            {/* Sort menu · the shared DropdownMenu owns Escape, arrow-key
                roving, focus return and viewport collision. The hand-rolled
                version it replaces had none of those, and styled its hover
                state by mutating inline styles, so a keyboard user saw no
                highlight at all. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="projects-sort-btn"
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--agi-rule-strong)] bg-transparent px-3.5 py-[7px] text-xs font-medium text-[var(--agi-ink-2)] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span>Sort: {SORT_LABELS[sortMode]}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[180px]"
                aria-label="Sort projects by"
              >
                {(Object.entries(SORT_LABELS) as [SortMode, string][]).map(([mode, label]) => (
                  <DropdownMenuItem
                    key={mode}
                    data-testid={`projects-sort-${mode}`}
                    onSelect={() => setSortMode(mode)}
                    className="flex items-center justify-between gap-3 text-[13px]"
                  >
                    <span
                      className={sortMode === mode ? 'font-semibold text-foreground' : undefined}
                    >
                      {label}
                    </span>
                    {sortMode === mode && (
                      <Check className="h-3.5 w-3.5 text-[var(--agi-amber)]" aria-hidden="true" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/*
            Transparent, not a tinted slab.

            This section painted `--agi-bg-3`, the marketing palette's warm
            parchment (#ebe2d1 light / #1b1810 dark), across a 480px-tall
            panel, with one small white project card floating inside it. Every
            other in-app surface (Library, Schedules, Chat) renders cards
            directly on the page background, so Projects read as a different,
            half-finished product the moment you navigated to it. The panel is
            now a plain layout container; the CARDS are the surfaces.
          */}
          <section
            style={{
              padding: '4px 0 0',
              minHeight: 320,
            }}
          >
            {projectStatus === 'loading' || projectStatus === 'idle' ? (
              <div
                role="status"
                style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--agi-ink-2)' }}
              >
                Loading projects…
              </div>
            ) : projectStatus === 'error' ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <p role="alert" style={{ color: 'var(--agi-ink-2)', margin: '0 0 12px' }}>
                  {projectError ?? 'Projects could not be loaded.'}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  style={{
                    padding: '7px 14px',
                    border: '1px solid var(--agi-rule-strong)',
                    borderRadius: 9999,
                    background: 'transparent',
                    color: 'var(--agi-ink-2)',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            ) : projectStatus === 'signed-out' ? (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--agi-ink-2)' }}>
                Sign in to view your cloud projects.
              </div>
            ) : useGallery ? (
              <ProjectGallery
                title={null}
                description=""
                layout="grid"
                onCreate={handleCreateProject}
                onSelect={(project) => {
                  router.push(`/chat/projects/${encodeURIComponent(project.id)}`);
                }}
                onShareProject={(project) => void handleShareProject(project)}
                onEditProject={(project) => setEditProject(project)}
                onArchiveProject={(project) => {
                  void handleArchiveProjectServer(project, true);
                }}
                onDeleteProject={(project) => {
                  void handleDeleteProjectServer(project, true);
                }}
                onStarProject={(id, starred) => void persistStar(id, starred)}
              />
            ) : (
              <div>
                {displayProjects.length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '48px 16px',
                      textAlign: 'center',
                    }}
                  >
                    <p style={{ fontSize: 14, color: 'var(--agi-ink-2)', margin: 0 }}>
                      {showArchived ? 'No archived projects.' : 'No projects yet.'}
                    </p>
                    {!showArchived && (
                      <>
                        <p
                          style={{
                            fontSize: 12,
                            color: 'var(--agi-ink-2)',
                            margin: 0,
                            opacity: 0.7,
                          }}
                        >
                          Group conversations, attach files, and share instructions.
                        </p>
                        <button
                          type="button"
                          data-testid="projects-empty-new-btn"
                          onClick={() => setCreateOpen(true)}
                          style={{
                            marginTop: 8,
                            padding: '8px 16px',
                            border: '1px solid transparent',
                            borderRadius: 9999,
                            background: 'var(--color-primary)',
                            color: 'var(--color-primary-foreground)',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          New project
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      // `min(260px, 100%)` keeps the 260px preferred column on
                      // wide viewports but lets it shrink to fit rather than
                      // forcing a horizontal scrollbar: a 320px phone has only
                      // 256px of content width inside this page's 32px side
                      // padding, 4px short of a bare 260px floor.
                      gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
                      gap: 12,
                    }}
                  >
                    {displayProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onSelect={(p) => {
                          setActiveProject(p.id);
                          router.push(`/chat/projects/${encodeURIComponent(p.id)}`);
                        }}
                        onShare={(p) => void handleShareProject(p)}
                        onEdit={(p) => setEditProject(p)}
                        onArchive={(p) => void handleArchiveProjectServer(p, false)}
                        onUnarchive={(p) => void handleUnarchiveProjectServer(p)}
                        onDelete={(p) => void handleDeleteProjectServer(p, false)}
                        onStarChange={(id, starred) => void persistStar(id, starred)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />

        {editProject && (
          <ProjectSettingsDialog
            open={!!editProject}
            onOpenChange={(open) => {
              if (!open) setEditProject(null);
            }}
            project={editProject}
            onUpdate={(id, updates) => updateProject(id, updates)}
            onDuplicated={retry}
            onDelete={(id) => {
              removeProject(id);
              setEditProject(null);
            }}
          />
        )}
      </main>
    </WebAppShell>
  );
}
