import 'server-only';

import { CLOUD_CODE_GOAL_COMMANDS, type CloudCodeGoalCommand } from '@agiworkforce/types';
import { resolvePromptText } from '@/lib/prompts/prompt-registry';
import type { PromptId } from '@/lib/prompts/prompt-manifest';

const GOAL_COMMAND_PROMPTS: Readonly<Record<CloudCodeGoalCommand, PromptId>> = {
  '/review': 'agent.cloud_code_review',
  '/security-review': 'agent.cloud_code_security_review',
};

const BASE_REF_PLACEHOLDER = '{base}';
const BASE_REMOTE = 'origin';
const LAST_COMMIT_REF = 'HEAD';

function isGoalCommand(value: string): value is CloudCodeGoalCommand {
  return (CLOUD_CODE_GOAL_COMMANDS as readonly string[]).includes(value);
}

export function cloudCodeGoalPrompt(goal: string, baseBranch: string | null): string {
  const trimmed = goal.trim();
  const command = trimmed.split(/\s/, 1)[0] ?? '';
  if (!isGoalCommand(command)) return goal;
  const base = baseBranch ? `${BASE_REMOTE}/${baseBranch}` : LAST_COMMIT_REF;
  const instructions = resolvePromptText(GOAL_COMMAND_PROMPTS[command]).replaceAll(
    BASE_REF_PLACEHOLDER,
    base,
  );
  const focus = trimmed.slice(command.length).trim();
  return focus ? `${instructions}\n\nFocus on: ${focus}` : instructions;
}
