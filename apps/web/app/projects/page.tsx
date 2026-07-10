'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { ProjectGallery, ProjectCard, useChatProjectStore } from '@agiworkforce/unified-chat';
import type { Project } from '@agiworkforce/unified-chat';
import { useRouter } from 'next/navigation';
import { ProjectSettingsDialog } from '@features/projects/components/ProjectSettingsDialog';
import { useProjectStore } from '@features/projects/stores/project-store';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { WebAppShell } from '@/components/layout/WebAppShell';

/**
 * /projects · top-level Projects hub on web.
 *
 * Mounts the shared `ProjectGallery` for the default "Updated" sort (which
 * already sorts starred-first then by updatedAt). For other sort modes
 * (Name A-Z, Created newest, Star status) the page renders its own sorted
 * `ProjectCard` grid so it can apply a different comparator without needing
 * to modify the read-only shared gallery component.
 *
 * Fix 52: sort menu now actually sorts project list (2026-05-24).
 */

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
  const removeProject = useProjectStore((s) => s.removeProject);
  const setActiveProject = useChatProjectStore((s) => s.setActiveProject);

  const projects = useChatProjectStore((s) => s.projects);

  const [editProject, setEditProject] = useState<Project | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  const sortedProjects = useMemo(() => sortProjects(projects, sortMode), [projects, sortMode]);

  // Server-backed create: persist to Neon (user_projects) and return the saved
  // row so ProjectGallery merges the canonical id into the store. Without this
  // handler the gallery falls back to a device-local-only project.
  const handleCreateProject = useCallback(async (name: string): Promise<Project> => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      throw new Error(`Failed to create project (${res.status})`);
    }
    const json = (await res.json()) as { project: Project };
    return json.project;
  }, []);

  // Server-backed delete: remove from Neon, then from the local store.
  const handleDeleteProjectServer = useCallback(
    async (projectId: string) => {
      try {
        await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
          method: 'DELETE',
          headers: await addCsrfHeaders(),
          credentials: 'same-origin',
        });
      } finally {
        removeProject(projectId);
      }
    },
    [removeProject],
  );

  // For the default mode, delegate to ProjectGallery (keeps search + create form).
  // For other modes, render our own sorted grid below the sort toolbar.
  const useGallery = sortMode === 'updated';

  return (
    <WebAppShell>
      <main
        data-design="agi"
        style={{
          minHeight: '100%',
          background: 'var(--agi-bg-2)',
          padding: '48px 32px',
          color: 'var(--agi-ink)',
        }}
      >
        <div
          style={{
            maxWidth: 1040,
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
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h1
                style={{
                  fontFamily: 'var(--serif)',
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
                files, instructions, and chat history. Stored on this device in v1; cloud sync
                arrives with Cloud Managed.
              </p>
            </div>

            {/* Sort menu */}
            <div ref={sortMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                data-testid="projects-sort-btn"
                onClick={() => setSortMenuOpen((v) => !v)}
                aria-expanded={sortMenuOpen}
                aria-haspopup="menu"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  border: '1px solid var(--agi-rule-strong)',
                  borderRadius: 9999,
                  background: 'transparent',
                  color: 'var(--agi-ink-2)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>Sort: {SORT_LABELS[sortMode]}</span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>&#9660;</span>
              </button>

              {sortMenuOpen && (
                <div
                  role="menu"
                  aria-label="Sort projects by"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    zIndex: 50,
                    minWidth: 180,
                    background: 'var(--agi-bg-3)',
                    border: '1px solid var(--agi-rule-strong)',
                    borderRadius: 10,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
                    overflow: 'hidden',
                  }}
                >
                  {(Object.entries(SORT_LABELS) as [SortMode, string][]).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      role="menuitem"
                      data-testid={`projects-sort-${mode}`}
                      onClick={() => {
                        setSortMode(mode);
                        setSortMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '9px 14px',
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        fontSize: 13,
                        color: sortMode === mode ? 'var(--agi-ink)' : 'var(--agi-ink-2)',
                        fontWeight: sortMode === mode ? 600 : 400,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--agi-bg-2)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      <span>{label}</span>
                      {sortMode === mode && (
                        <span style={{ fontSize: 12, color: 'var(--agi-amber)' }}>&#10003;</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Backdrop to close menu on outside click */}
          {sortMenuOpen && (
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              onClick={() => setSortMenuOpen(false)}
              aria-hidden
            />
          )}

          <section
            style={{
              border: '1px solid var(--agi-rule)',
              borderRadius: 16,
              background: 'var(--agi-bg-3)',
              padding: '20px 24px',
              minHeight: 480,
            }}
          >
            {useGallery ? (
              /* Default sort: delegate to ProjectGallery (keeps search + create form) */
              <ProjectGallery
                title={null}
                description=""
                layout="grid"
                onCreate={handleCreateProject}
                onSelect={(project) => {
                  router.push(`/projects/${encodeURIComponent(project.id)}`);
                }}
                onEditProject={(project) => setEditProject(project)}
                onArchiveProject={() => {
                  /* archive stays a local store mutation handled inside the gallery */
                }}
                onDeleteProject={(project) => {
                  void handleDeleteProjectServer(project.id);
                }}
              />
            ) : (
              /* Custom sort: render sorted ProjectCard grid */
              <div>
                {sortedProjects.length === 0 ? (
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
                      No projects yet.
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--agi-ink-2)', margin: 0, opacity: 0.7 }}>
                      Switch to &ldquo;Updated (newest)&rdquo; sort to create one.
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      gap: 12,
                    }}
                  >
                    {sortedProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onSelect={(p) => {
                          setActiveProject(p.id);
                          router.push(`/projects/${encodeURIComponent(p.id)}`);
                        }}
                        onEdit={(p) => setEditProject(p)}
                        onArchive={(p) => updateProject(p.id, { isArchived: true })}
                        onDelete={(p) => void handleDeleteProjectServer(p.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {editProject && (
          <ProjectSettingsDialog
            open={!!editProject}
            onOpenChange={(open) => {
              if (!open) setEditProject(null);
            }}
            project={editProject}
            onUpdate={(id, updates) => updateProject(id, updates)}
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
