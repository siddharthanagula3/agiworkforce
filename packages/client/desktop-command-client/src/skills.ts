
import { command } from '@agiworkforce/client-runtime';
import type { Recording } from './automation';
import { recordingToCommandPayload } from './automation';

export interface SkillMatchResult {
  skillName: string;
  relevanceScore: number;
  description: string;
  matchReason: string;
}
export interface SkillInfo {
  name: string;
  description: string;
  sourceType: 'bundled' | 'managed' | 'workspace' | 'unknown';
  requiresBins: string[];
  requiresEnv: string[];
  supportedOs: string[];
  allowedTools: string[];
  contextMode: 'main' | 'fork';
}
export interface RequirementCheckResultResponse {
  satisfied: boolean;
  missingBins: string[];
  missingEnv: string[];
  osSupported: boolean;
}
export interface SkillInvocationResult {
  skillName: string;
  instructions: string;
  allowedTools: string[];
  contextMode: 'main' | 'fork';
}
export interface SlashCommand {
  command: string;
  skillName: string;
  description: string;
}
export interface RecordedSkillResult {
  skill: SkillInfo;
  actionCount: number;
  path: string;
}

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
export async function skillCreateFromRecording(
  recording: Recording,
  name: string,
  description: string,
): Promise<RecordedSkillResult> {
  return command<RecordedSkillResult>('skill_create_from_recording', {
    recording: recordingToCommandPayload(recording),
    name,
    description,
  });
}
