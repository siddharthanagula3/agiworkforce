'use client';

import { ProjectGallery } from '@agiworkforce/unified-chat';
import { useRouter } from 'next/navigation';

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

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base, #09090b)',
        padding: '48px 32px',
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
              color: 'var(--text-1)',
              margin: 0,
            }}
          >
            Projects
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0, maxWidth: 640 }}>
            Group related conversations under a shared project. Each project can carry its own
            files, instructions, and chat history. Stored on this device in v1; cloud sync arrives
            with Cloud Managed.
          </p>
        </div>

        <section
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            padding: '20px 24px',
            minHeight: 480,
          }}
        >
          <ProjectGallery
            title={null}
            description=""
            layout="grid"
            onSelect={(project) => {
              router.push(`/chat?project=${encodeURIComponent(project.id)}`);
            }}
          />
        </section>
      </div>
    </main>
  );
}
