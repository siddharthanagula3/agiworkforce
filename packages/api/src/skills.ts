/**
 * Skills API — typed wrappers for skill_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface SkillMatchResult {
  name: string;
  score: number;
  description: string;
}
export interface SkillInfo {
  name: string;
  description: string;
  category: string;
  isBuiltIn: boolean;
  tags: string[];
}
export interface RequirementCheckResultResponse {
  met: boolean;
  missing: string[];
}
export interface SkillInvocationResult {
  output: string;
  success: boolean;
  duration: number;
}
export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
}

// ---- Commands ----

export async function skillMatchForMessage(content: string): Promise<SkillMatchResult[]> {
  return command<SkillMatchResult[]>('skill_match_for_message', { content });
}
export async function skillList(): Promise<SkillInfo[]> {
  return command<SkillInfo[]>('skill_list');
}
export async function skillGet(name: string): Promise<SkillInfo | null> {
  return command<SkillInfo | null>('skill_get', { name });
}
export async function skillGetInstructions(name: string): Promise<string | null> {
  return command<string | null>('skill_get_instructions', { name });
}
export async function skillCheckRequirements(
  name: string,
): Promise<RequirementCheckResultResponse | null> {
  return command<RequirementCheckResultResponse | null>('skill_check_requirements', { name });
}
export async function skillGetContext(): Promise<string> {
  return command<string>('skill_get_context');
}
export async function skillSetWorkspace(path?: string): Promise<void> {
  return command<void>('skill_set_workspace', { path });
}
export async function skillCount(): Promise<number> {
  return command<number>('skill_count');
}
export async function skillInvoke(name: string, args: string): Promise<SkillInvocationResult> {
  return command<SkillInvocationResult>('skill_invoke', { name, arguments: args });
}
export async function skillParseSlashCommand(input: string): Promise<SkillInvocationResult | null> {
  return command<SkillInvocationResult | null>('skill_parse_slash_command', { input });
}
export async function skillGetSlashCommands(): Promise<SlashCommand[]> {
  return command<SlashCommand[]>('skill_get_slash_commands');
}
export async function skillReload(): Promise<void> {
  return command<void>('skill_reload');
}
