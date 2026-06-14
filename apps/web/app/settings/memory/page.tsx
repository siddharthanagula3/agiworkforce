'use client';

import { MemoryEditor } from '@agiworkforce/unified-chat';

/**
 * /settings/memory · surfaces the shared MemoryEditor primitive on the web,
 * matching the Claude.ai Settings → Memory section.
 *
 * Memory facts are stored device-locally via the unified-chat memoryStore
 * (zustand/persist). Hosted memory sync is a separate cloud upgrade path.
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
          Facts the assistant should remember about you across conversations. Stored on this device;
          hosted memory sync is available through cloud upgrades.
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
