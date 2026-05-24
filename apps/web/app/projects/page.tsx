'use client';

import { useState } from 'react';
import { ProjectGallery } from '@agiworkforce/unified-chat';
import type { Project } from '@agiworkforce/unified-chat';
import { useRouter } from 'next/navigation';
import { ProjectSettingsDialog } from '@features/projects/components/ProjectSettingsDialog';
import { useProjectStore } from '@features/projects/stores/project-store';

/**
 * /projects — top-level Projects hub on web. Mounts the shared
 * `ProjectGallery` primitive from `@agiworkforce/unified-chat` so the
 * exact same gallery used by desktop, chrome ext side panel, and other
 * light surfaces is what web renders. Round-2 audit P0 "Shared Projects
 * component" wire-up (2026-05-21).
 *
 * v1 LOCAL-ONLY: projects persist via the shared `useProjectStore`
 * (zustand) on this device only. Cloud Managed will replace the default
 * `onCreate` with a Supabase row insert when the waitlist opens —
 * `ProjectGallery` accepts an `onCreate` prop precisely so that swap
 * is a one-line wire.
 */
export default function ProjectsPage() {
  const router = useRouter();
  const updateProject = useProjectStore((s) => s.updateProject);
  const removeProject = useProjectStore((s) => s.removeProject);

  const [editProject, setEditProject] = useState<Project | null>(null);

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
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
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
            files, instructions, and chat history. Stored on this device in v1; cloud sync arrives
            with Cloud Managed.
          </p>
        </div>

        <section
          style={{
            border: '1px solid var(--agi-rule)',
            borderRadius: 16,
            background: 'var(--agi-bg-3)',
            padding: '20px 24px',
            minHeight: 480,
          }}
        >
          <ProjectGallery
            title={null}
            description=""
            layout="grid"
            onSelect={(project) => {
              router.push(`/projects/${encodeURIComponent(project.id)}`);
            }}
            onEditProject={(project) => setEditProject(project)}
            onArchiveProject={() => {
              /* store mutation handled inside gallery; no server sync in v1 */
            }}
            onDeleteProject={() => {
              /* store mutation handled inside gallery; no server sync in v1 */
            }}
          />
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
  );
}
