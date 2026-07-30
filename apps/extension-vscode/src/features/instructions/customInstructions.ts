import type * as vscode from 'vscode';
import type { UserInput } from '@agiworkforce/types';

import {
  loadProjectInstructionSources,
  type ProjectInstructionSource,
} from '../../data/projectInstructions';

export const HOST_CUSTOM_INSTRUCTIONS_KEY = 'agiWorkforce.customInstructions.host';
export const WORKSPACE_CUSTOM_INSTRUCTIONS_KEY = 'agiWorkforce.customInstructions.workspace';
export const MAX_CUSTOM_INSTRUCTION_CHARS = 8_000;

export type CustomInstructionScope = 'host' | 'workspace';
export type EffectiveCustomInstructionScope = CustomInstructionScope | 'none';

export interface StoredCustomInstructions {
  host: string;
  workspace: string;
  effective: string;
  effectiveScope: EffectiveCustomInstructionScope;
}

export interface InstructionSourceSnapshot {
  fileName: string;
  path: string;
  content: string;
  truncated: boolean;
}

export interface InstructionContextSnapshot extends StoredCustomInstructions {
  turnPrelude: string;
  projectSources: InstructionSourceSnapshot[];
}

function readBounded(memento: Pick<vscode.Memento, 'get'>, key: string): string {
  const value = memento.get<unknown>(key);
  return typeof value === 'string' ? value.slice(0, MAX_CUSTOM_INSTRUCTION_CHARS) : '';
}

export function getStoredCustomInstructions(
  context: Pick<vscode.ExtensionContext, 'globalState' | 'workspaceState'>,
): StoredCustomInstructions {
  const host = readBounded(context.globalState, HOST_CUSTOM_INSTRUCTIONS_KEY);
  const workspace = readBounded(context.workspaceState, WORKSPACE_CUSTOM_INSTRUCTIONS_KEY);
  const workspaceActive = workspace.trim().length > 0;
  const hostActive = host.trim().length > 0;

  return {
    host,
    workspace,
    effective: workspaceActive ? workspace : hostActive ? host : '',
    effectiveScope: workspaceActive ? 'workspace' : hostActive ? 'host' : 'none',
  };
}

export async function saveCustomInstructions(
  context: Pick<vscode.ExtensionContext, 'globalState' | 'workspaceState'>,
  scope: CustomInstructionScope,
  value: string,
): Promise<void> {
  if (value.length > MAX_CUSTOM_INSTRUCTION_CHARS) {
    throw new Error(
      `Custom instructions must be ${MAX_CUSTOM_INSTRUCTION_CHARS.toLocaleString()} characters or fewer.`,
    );
  }
  const target = scope === 'host' ? context.globalState : context.workspaceState;
  const key = scope === 'host' ? HOST_CUSTOM_INSTRUCTIONS_KEY : WORKSPACE_CUSTOM_INSTRUCTIONS_KEY;
  await target.update(key, value);
}

export function formatCustomInstructionPrelude(instructions: StoredCustomInstructions): string {
  if (instructions.effectiveScope === 'none') return '';
  const escaped = instructions.effective.replace(/<\/custom_instructions>/giu, (match) =>
    match.replace(/</gu, '&lt;').replace(/>/gu, '&gt;'),
  );
  const scopeLabel =
    instructions.effectiveScope === 'workspace' ? 'this VS Code workspace' : 'this VS Code host';
  return (
    `## User-saved custom instructions (${scopeLabel})\n` +
    'Apply these preferences to this developer turn when they do not conflict with the current request, repository instructions, permissions, or safety policy.\n\n' +
    `<custom_instructions>\n${escaped}\n</custom_instructions>`
  );
}

export function buildCustomInstructionInput(
  context: Pick<vscode.ExtensionContext, 'globalState' | 'workspaceState'>,
): UserInput | undefined {
  const text = formatCustomInstructionPrelude(getStoredCustomInstructions(context));
  return text === '' ? undefined : { type: 'text', text, text_elements: [] };
}

function projectSourceSnapshot(source: ProjectInstructionSource): InstructionSourceSnapshot {
  return {
    fileName: source.fileName,
    path: source.uri.fsPath,
    content: source.content,
    truncated: source.truncated,
  };
}

export async function buildInstructionContextSnapshot(
  context: Pick<vscode.ExtensionContext, 'globalState' | 'workspaceState'>,
): Promise<InstructionContextSnapshot> {
  const stored = getStoredCustomInstructions(context);
  const projectSources = await loadProjectInstructionSources();
  return {
    ...stored,
    turnPrelude: formatCustomInstructionPrelude(stored),
    projectSources: projectSources.map(projectSourceSnapshot),
  };
}
