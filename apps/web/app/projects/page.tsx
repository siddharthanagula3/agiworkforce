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

  // The hub is rendered against the warm-dark site background by design
  // (matches the marketing/app shell). Tokens are hardcoded against the dark
  // palette so this page reads correctly even when the `.dark` class isn't
  // applied to <html> — which is the case for the cloud-web build that lands
  // on /projects from marketing links. Round-10 visual-verification fix
  // (2026-05-21): the earlier code referenced undefined `--text-1` /
  // `--text-3` tokens and rendered as near-black-on-black.
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0d0c0a',
        padding: '48px 32px',
        color: '#e8e4db',
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
              color: '#e8e4db',
              margin: 0,
            }}
          >
            Projects
          </h1>
          <p
            style={{
              fontSize: 14,
              color: '#b3aea4',
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
            border: '1px solid rgba(255, 235, 205, 0.08)',
            borderRadius: 16,
            background: '#1a1915',
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
