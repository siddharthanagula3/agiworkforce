'use client';

import { MemoryEditor } from '@agiworkforce/unified-chat';

/**
 * /settings/memory — surfaces the shared MemoryEditor primitive on the web,
 * matching the Claude.ai Settings → Memory section.
 *
 * Round-2 audit P0 #8 (2026-05-21). v1 LOCAL-ONLY POSTURE: memory facts
 * are stored device-locally via the unified-chat memoryStore (zustand/persist).
 * Cloud sync of memory arrives with the Cloud Managed waitlist and is NOT
 * wired here.
 */
export default function MemorySettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Memory
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Facts the assistant should remember about you across conversations. Stored on this device
          only — cloud sync arrives with Cloud Managed.
        </p>
      </div>

      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
          minHeight: 360,
        }}
      >
        <MemoryEditor title={null} description="" hideClearAll={false} />
      </section>
    </div>
  );
}
