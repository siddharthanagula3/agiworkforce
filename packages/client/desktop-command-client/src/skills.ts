import { command } from '@agiworkforce/client-runtime';
import type { Recording } from './automation';
import { recordingToCommandPayload } from './automation';

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
export interface RecordedSkillResult {
  skill: SkillInfo;
  actionCount: number;
  path: string;
}

export interface WorkspaceSkillsStatus {
  skillsDir: string | null;
  skillCount: number;
  consented: boolean;
  changedSinceConsent: boolean;
}
export async function skillWorkspaceStatus(): Promise<WorkspaceSkillsStatus> {
  return command<WorkspaceSkillsStatus>('skill_workspace_status');
}
export async function skillSetWorkspaceConsent(consented: boolean): Promise<WorkspaceSkillsStatus> {
  return command<WorkspaceSkillsStatus>('skill_set_workspace_consent', { consented });
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
