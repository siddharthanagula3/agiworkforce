/**
 * Scheduler & Triggers API — typed wrappers for trigger management commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface Trigger {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  schedule?: string;
  config: Record<string, unknown>;
  lastRun?: string;
  nextRun?: string;
}
export interface TriggerExecution {
  triggerId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// ---- Commands ----

export async function listTriggers(): Promise<Trigger[]> {
  return command<Trigger[]>('list_triggers');
}
export async function registerTrigger(trigger: Trigger): Promise<string> {
  return command<string>('register_trigger', { trigger });
}
export async function unregisterTrigger(triggerId: string): Promise<void> {
  return command<void>('unregister_trigger', { triggerId });
}
export async function toggleTrigger(triggerId: string, enabled: boolean): Promise<void> {
  return command<void>('toggle_trigger', { triggerId, enabled });
}
export async function updateTrigger(trigger: Trigger): Promise<void> {
  return command<void>('update_trigger', { trigger });
}
export async function getTriggerExecutions(triggerId: string): Promise<TriggerExecution[]> {
  return command<TriggerExecution[]>('get_trigger_executions', { triggerId });
}
