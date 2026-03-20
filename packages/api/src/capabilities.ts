/**
 * Capabilities API — typed wrappers for capability sync/check Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Commands ----

export async function syncCapabilities(capabilities: Record<string, boolean>): Promise<void> {
  return command<void>('sync_capabilities', { capabilities });
}

export async function getCapabilities(): Promise<Record<string, boolean>> {
  return command<Record<string, boolean>>('get_capabilities');
}

export async function checkCapability(capability: string): Promise<boolean> {
  return command<boolean>('check_capability', { capability });
}
