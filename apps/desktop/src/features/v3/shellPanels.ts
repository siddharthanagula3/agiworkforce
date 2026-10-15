import type { PrivacyMode } from '@agiworkforce/types';

export type V3Panel =
  | 'chat'
  | 'projects'
  | 'artifacts'
  | 'code'
  | 'design'
  | 'research'
  | 'automation'
  | 'library'
  | 'tasks'
  | 'agent-tasks'
  | 'cloud-schedules'
  | 'scheduled'
  | 'record-skill';

export const DEVICE_AUTOMATION_PANELS = ['automation', 'scheduled', 'agent-tasks'] as const;
export type DeviceAutomationPanel = (typeof DEVICE_AUTOMATION_PANELS)[number];

export function isDeviceAutomationPanel(panel: unknown): panel is DeviceAutomationPanel {
  return (DEVICE_AUTOMATION_PANELS as readonly unknown[]).includes(panel);
}

const LOCAL_MODE_PANELS: ReadonlySet<V3Panel> = new Set([
  'artifacts',
  'code',
  'design',
  'research',
  'record-skill',
]);
const SIGNED_IN_PANELS: ReadonlySet<V3Panel> = new Set(['library', 'tasks']);

/**
 * Triggers, the scheduler and background agents are started by the host in
 * every mode, so the panels that list and stop them are open in every mode: an
 * automation that can fire must be one the person can see and turn off.
 */
export function isPanelAvailable(panel: V3Panel, mode: PrivacyMode): boolean {
  if (LOCAL_MODE_PANELS.has(panel)) return mode === 'local';
  if (SIGNED_IN_PANELS.has(panel)) return mode !== 'local';
  if (panel === 'cloud-schedules') return mode === 'managed';
  return true;
}
