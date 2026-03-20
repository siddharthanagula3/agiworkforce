/**
 * Custom Agents API — typed wrappers for custom agent Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types (matches Rust serde(rename_all = "camelCase")) ----

export interface CustomAgentConfig {
  name: string;
  model?: string;
  description: string;
  systemPrompt: string;
  allowedTools?: string[];
  scope: string;
}

// ---- Commands ----

export async function listCustomAgents(): Promise<CustomAgentConfig[]> {
  return command<CustomAgentConfig[]>('list_custom_agents');
}

export async function saveCustomAgent(config: CustomAgentConfig): Promise<void> {
  return command<void>('save_custom_agent', { config });
}

export async function deleteCustomAgent(name: string, scope: string): Promise<void> {
  return command<void>('delete_custom_agent', { name, scope });
}
