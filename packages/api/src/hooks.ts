/**
 * Hooks API — typed wrappers for hooks_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface Hook {
  name: string;
  event: string;
  command: string;
  enabled: boolean;
  [key: string]: unknown;
}
export interface HookStats {
  totalRuns: number;
  successCount: number;
  failureCount: number;
  avgDuration: number;
}

// ---- Commands ----

export async function hooksInitialize(): Promise<string> {
  return command<string>('hooks_initialize');
}
export async function hooksList(): Promise<Hook[]> {
  return command<Hook[]>('hooks_list');
}
export async function hooksAdd(hook: Hook): Promise<string> {
  return command<string>('hooks_add', { hook });
}
export async function hooksRemove(name: string): Promise<string> {
  return command<string>('hooks_remove', { name });
}
export async function hooksToggle(name: string, enabled: boolean): Promise<string> {
  return command<string>('hooks_toggle', { name, enabled });
}
export async function hooksUpdate(hook: Hook): Promise<string> {
  return command<string>('hooks_update', { hook });
}
export async function hooksGetConfigPath(): Promise<string> {
  return command<string>('hooks_get_config_path');
}
export async function hooksCreateExample(): Promise<string> {
  return command<string>('hooks_create_example');
}
export async function hooksExport(): Promise<string> {
  return command<string>('hooks_export');
}
export async function hooksImport(yaml: string): Promise<string> {
  return command<string>('hooks_import', { yaml });
}
export async function hooksReload(): Promise<string> {
  return command<string>('hooks_reload');
}
export async function hooksGetEventTypes(): Promise<string[]> {
  return command<string[]>('hooks_get_event_types');
}
export async function hooksGetStats(name: string): Promise<HookStats | null> {
  return command<HookStats | null>('hooks_get_stats', { name });
}
