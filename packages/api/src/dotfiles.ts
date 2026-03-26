/**
 * Dotfiles API — typed wrappers for dotfile_*, read_shared_config, write_shared_config,
 * detect_ecosystem_tools, and import_ecosystem_mcp_servers Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface McpServerEntry {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface DetectedTool {
  name: string;
  path: string;
  hasMcp: boolean;
  hasSkills: boolean;
  hasInstructions: boolean;
  mcpConfigPath: string | null;
  skillsPaths: string[];
}

export interface ImportedMcpServer {
  name: string;
  source: string;
  originalName: string;
  command: string | null;
  url: string | null;
}

export interface SkillEntry {
  name: string;
  description: string;
  path: string;
  source: string;
}

// ---- Shared Config ----

export async function readSharedConfig(): Promise<Record<string, unknown>> {
  return command<Record<string, unknown>>('read_shared_config');
}

export async function writeSharedConfig(key: string, value: unknown): Promise<void> {
  return command<void>('write_shared_config', { key, value });
}

// ---- MCP Servers ----

export async function dotfileListMcpServers(): Promise<Record<string, McpServerEntry>> {
  return command<Record<string, McpServerEntry>>('dotfile_list_mcp_servers');
}

export async function dotfileAddMcpServer(name: string, config: unknown): Promise<void> {
  return command<void>('dotfile_add_mcp_server', { name, config });
}

export async function dotfileRemoveMcpServer(name: string): Promise<void> {
  return command<void>('dotfile_remove_mcp_server', { name });
}

// ---- Skills ----

export async function dotfileListSkills(): Promise<SkillEntry[]> {
  return command<SkillEntry[]>('dotfile_list_skills');
}

// ---- Instructions ----

export async function dotfileReadInstructions(): Promise<string> {
  return command<string>('dotfile_read_instructions');
}

export async function dotfileWriteInstructions(content: string): Promise<void> {
  return command<void>('dotfile_write_instructions', { content });
}

// ---- Memories ----

export async function dotfileReadMemories(): Promise<string> {
  return command<string>('dotfile_read_memories');
}

// ---- Ecosystem ----

export async function detectEcosystemTools(): Promise<DetectedTool[]> {
  return command<DetectedTool[]>('detect_ecosystem_tools');
}

export async function importEcosystemMcpServers(): Promise<ImportedMcpServer[]> {
  return command<ImportedMcpServer[]>('import_ecosystem_mcp_servers');
}
