'use client';

import { useState } from 'react';
import { FolderPlus, Settings2, FolderOpen, Folder } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useProjectStore } from '../stores/project-store';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import type { Project } from '@features/projects/stores/project-store';

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
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(project.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(project.id);
        }
      }}
      className={cn(
        'group relative flex items-start gap-2.5 rounded-lg px-3 py-2.5 cursor-pointer transition-colors',
        isActive
          ? 'bg-primary/10 border border-primary/20'
          : 'hover:bg-muted/50 border border-transparent',
      )}
    >
      {/* Color dot + folder icon */}
      <div className="mt-0.5 shrink-0">
        {isActive ? (
          <FolderOpen className="h-4 w-4" style={{ color: project.color }} />
        ) : (
          <Folder className="h-4 w-4" style={{ color: project.color }} />
        )}
      </div>

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-[13px] leading-tight',
            isActive ? 'font-semibold text-foreground' : 'font-medium text-foreground',
          )}
        >
          {project.name}
        </div>
        {project.description && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{project.description}</p>
        )}
      </div>

      {/* Settings gear -- visible on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenSettings(project);
        }}
        className="mt-0.5 shrink-0 rounded-md p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
        aria-label={`Settings for ${project.name}`}
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectSidebar
// ---------------------------------------------------------------------------

export function ProjectSidebar() {
  const {
    projects,
    activeProjectId,
    createProject,
    updateProject,
    deleteProject,
    setActiveProject,
  } = useProjectStore();

  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) {
      setIsCreating(false);
      setNewName('');
      return;
    }
    const id = createProject({
      name: newName.trim(),
      description: '',
      instructions: '',
      color: '#6366f1',
    });
    setActiveProject(id);
    setNewName('');
    setIsCreating(false);
  };

  const handleSelect = (id: string) => {
    // Toggle off if already selected
    if (activeProjectId === id) {
      setActiveProject(null);
    } else {
      setActiveProject(id);
    }
  };

  return (
    <>
      <div className="space-y-1">
        {/* Section header */}
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Projects
          </span>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            aria-label="New project"
          >
            <FolderPlus className="h-3 w-3" />
          </button>
        </div>

        {/* Project list */}
        <div className="space-y-0.5 px-1">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isActive={activeProjectId === project.id}
              onSelect={handleSelect}
              onOpenSettings={setSettingsProject}
            />
          ))}

          {/* Inline create input */}
          {isCreating && (
            <div className="px-2 py-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') {
                    setIsCreating(false);
                    setNewName('');
                  }
                }}
                onBlur={handleCreate}
                placeholder="Project name..."
                className="w-full rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
            </div>
          )}

          {/* Empty state */}
          {projects.length === 0 && !isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/50 px-3 py-3 text-[12px] text-muted-foreground/60 transition-colors hover:border-border hover:text-muted-foreground"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Create a project
            </button>
          )}
        </div>
      </div>

      {/* Settings dialog */}
      {settingsProject && (
        <ProjectSettingsDialog
          open={!!settingsProject}
          onOpenChange={(open) => {
            if (!open) setSettingsProject(null);
          }}
          project={settingsProject}
          onUpdate={updateProject}
          onDelete={deleteProject}
        />
      )}
    </>
  );
}
