'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { Folder, FolderOpen, FolderPlus, RefreshCw, Settings2, Calendar, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectStore, type Project } from '@features/projects/stores/project-store';
import { ProjectSettingsDialog } from '@features/projects/components/ProjectSettingsDialog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf-token='))
      ?.split('=')[1] ?? ''
  );
}

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('supabase_access_token') : null;
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': getCsrfToken(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Project Card
// ---------------------------------------------------------------------------

interface ProjectCardProps {
  project: Project;
  isActive: boolean;
  onSelect: (id: string) => void;
  onOpenSettings: (project: Project) => void;
}

function ProjectCard({ project, isActive, onSelect, onOpenSettings }: ProjectCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(project.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(project.id);
        }
      }}
      className={`group relative cursor-pointer transition-all duration-150 ${
        isActive
          ? 'border-primary/30 bg-primary/5 shadow-sm'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/60'
      }`}
    >
      <CardContent className="p-5">
        {/* Color accent strip */}
        <div
          className="absolute left-0 top-0 h-full w-1 rounded-l-lg"
          style={{ backgroundColor: project.color }}
        />

        <div className="pl-2">
          {/* Header row */}
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {isActive ? (
                <FolderOpen className="h-5 w-5 shrink-0" style={{ color: project.color }} />
              ) : (
                <Folder className="h-5 w-5 shrink-0" style={{ color: project.color }} />
              )}
              <h3 className="truncate text-sm font-semibold text-zinc-100">{project.name}</h3>
              {isActive && (
                <Badge
                  variant="outline"
                  className="border-primary/30 bg-primary/10 text-[10px] text-primary"
                >
                  Active
                </Badge>
              )}
            </div>

            {/* Settings button — visible on hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenSettings(project);
              }}
              className="shrink-0 rounded-md p-1 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-700 hover:text-zinc-300"
              aria-label={`Settings for ${project.name}`}
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>

          {/* Description */}
          {project.description && (
            <p className="mb-3 line-clamp-2 text-xs text-zinc-400">{project.description}</p>
          )}

          {/* Instructions preview */}
          {project.instructions && (
            <p className="mb-3 line-clamp-1 rounded-md bg-zinc-800/60 px-2.5 py-1.5 text-[11px] italic text-zinc-500">
              &ldquo;{project.instructions.slice(0, 120)}
              {project.instructions.length > 120 ? '…' : ''}&rdquo;
            </p>
          )}

          {/* Footer meta */}
          <div className="flex items-center gap-3 text-[11px] text-zinc-600">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(project.updatedAt)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Projects Page
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const {
    projects,
    activeProjectId,
    createProject,
    updateProject,
    deleteProject,
    setActiveProject,
  } = useProjectStore();

  const [loading, setLoading] = useState(false);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [newName, setNewName] = useState('');

  // Sync projects from the server on mount so the page reflects persisted data
  const syncFromServer = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects?limit=100', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return; // silently fall back to local store on auth failure
      const data = (await res.json()) as {
        projects?: Array<{
          id: string;
          name: string;
          description: string;
          instructions: string;
          color: string;
          createdAt: string;
          updatedAt: string;
        }>;
      };
      // Merge server projects into local store — create any that aren't present
      const serverProjects = data.projects ?? [];
      const localIds = new Set(projects.map((p) => p.id));
      for (const sp of serverProjects) {
        if (!localIds.has(sp.id)) {
          createProject({
            name: sp.name,
            description: sp.description,
            instructions: sp.instructions,
            color: sp.color,
          });
        }
      }
    } catch {
      // Network error — local store is the source of truth
    } finally {
      setLoading(false);
    }
  }, [projects, createProject]);

  useEffect(() => {
    void syncFromServer();
    // We intentionally run this only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (id: string) => {
    setActiveProject(activeProjectId === id ? null : id);
  };

  const handleCreateInline = () => {
    const name = newName.trim();
    if (!name) {
      setIsCreatingInline(false);
      setNewName('');
      return;
    }

    const id = createProject({
      name,
      description: '',
      instructions: '',
      color: '#3b82f6',
    });

    // Persist to server in the background
    void fetch('/api/projects', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, description: '', instructions: '', color: '#3b82f6' }),
    }).catch(() => {
      // Server sync failure is non-fatal — local store already has the project
    });

    setActiveProject(id);
    setNewName('');
    setIsCreatingInline(false);
    toast.success(`Project "${name}" created`);
  };

  const handleUpdate = (
    id: string,
    updates: Partial<Pick<Project, 'name' | 'description' | 'instructions' | 'color'>>,
  ) => {
    updateProject(id, updates);

    // Persist to server in the background
    void fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    }).catch(() => {
      // Non-fatal: local store already updated
    });
  };

  const handleDelete = (id: string) => {
    deleteProject(id);

    // Persist to server in the background
    void fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).catch(() => {
      // Non-fatal
    });
  };

  return (
    <div className="space-y-6 px-6 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            Organize conversations with shared context and custom instructions — like claude.ai
            Projects.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />}
          <Button
            size="sm"
            onClick={() => setIsCreatingInline(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>

      {/* Inline create form */}
      {isCreatingInline && (
        <Card className="border-primary/20 bg-zinc-900">
          <CardContent className="p-5">
            <p className="mb-3 text-sm font-medium text-zinc-200">New project name</p>
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateInline();
                  if (e.key === 'Escape') {
                    setIsCreatingInline(false);
                    setNewName('');
                  }
                }}
                placeholder="e.g. Marketing Campaign, Q2 Planning..."
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                maxLength={200}
              />
              <Button size="sm" onClick={handleCreateInline} disabled={!newName.trim()}>
                Create
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsCreatingInline(false);
                  setNewName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project grid */}
      {projects.length === 0 && !isCreatingInline ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FolderPlus className="mb-4 h-14 w-14 text-zinc-700" />
            <h3 className="mb-2 text-lg font-semibold text-zinc-300">No projects yet</h3>
            <p className="mb-6 max-w-sm text-sm text-zinc-500">
              Projects let you group conversations and set custom instructions so the AI always has
              the right context for your work.
            </p>
            <Button onClick={() => setIsCreatingInline(true)}>
              <FolderPlus className="mr-2 h-4 w-4" />
              Create your first project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isActive={activeProjectId === project.id}
              onSelect={handleSelect}
              onOpenSettings={setSettingsProject}
            />
          ))}
        </div>
      )}

      {/* Counts footer */}
      {projects.length > 0 && (
        <p className="text-center text-xs text-zinc-600">
          {projects.length} project{projects.length !== 1 ? 's' : ''}
          {activeProjectId ? ' · 1 active' : ''}
        </p>
      )}

      {/* Settings dialog */}
      {settingsProject && (
        <ProjectSettingsDialog
          open={!!settingsProject}
          onOpenChange={(open) => {
            if (!open) setSettingsProject(null);
          }}
          project={settingsProject}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
