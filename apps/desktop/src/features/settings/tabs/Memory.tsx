import { MemoryEditor } from '@agiworkforce/unified-chat';

/**
 * Memory settings tab — wraps the shared `MemoryEditor` primitive from
 * `@agiworkforce/unified-chat` so the desktop Settings dialog exposes the
 * same memory surface as web and mobile.
 *
 * Round-2 audit P0 #8 (2026-05-21). v1 LOCAL-ONLY POSTURE: memory facts
 * persist via unified-chat's memoryStore (zustand/persist) on this device.
 * Cloud sync of memory arrives with the Cloud Managed waitlist and is NOT
 * wired here.
 */
export function MemoryTab() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <MemoryEditor className="h-full" />
    </div>
  );
}
