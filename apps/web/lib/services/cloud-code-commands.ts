import 'server-only';

import { CLOUD_CODE_GOAL_COMMANDS, type CloudCodeGoalCommand } from '@agiworkforce/types';

const REVIEW_INSTRUCTIONS = [
  'Review the code changes in this workspace and report what is wrong with them. Do not edit, create or delete any file.',
  '',
  '1. Collect the changes: run `git status`, then `git diff {base}` for everything that differs from the base, new commits included. Read the changed files wherever the diff alone does not show enough context.',
  '2. Look for correctness problems first: wrong logic, unhandled errors and edge cases, broken callers, race conditions, data loss and security holes. Then note missing or weakened tests.',
  '3. Report each finding with its file and line, what is wrong, why it matters and a concrete fix, most severe first. Leave out style preferences. If nothing is worth fixing, say so plainly.',
].join('\n');

const SECURITY_REVIEW_INSTRUCTIONS = [
  'Run a security review of the code changes in this workspace. Do not edit, create or delete any file.',
  '',
  '1. Collect the changes: run `git status`, then `git diff {base}` for everything that differs from the base, new commits included. Read the surrounding code wherever the diff alone does not show how data flows.',
  '2. Look for vulnerabilities the changes introduce: injection into SQL, shell commands, templates or file paths; broken authentication or authorization; secrets in code; unsafe deserialization; server-side request forgery; cross-site scripting; weak cryptography; insecure defaults; and exposure of personal or private data. Trace untrusted input to where it is used before calling anything exploitable.',
  '3. Report each finding with its file and line, the kind of vulnerability, how it could be exploited, its severity and the fix, most severe first. Leave out problems no input can reach. If you find none, say so plainly.',
].join('\n');

const GOAL_COMMAND_INSTRUCTIONS: Readonly<Record<CloudCodeGoalCommand, string>> = {
  '/review': REVIEW_INSTRUCTIONS,
  '/security-review': SECURITY_REVIEW_INSTRUCTIONS,
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
  const instructions = GOAL_COMMAND_INSTRUCTIONS[command].replaceAll(BASE_REF_PLACEHOLDER, base);
  const focus = trimmed.slice(command.length).trim();
  return focus ? `${instructions}\n\nFocus on: ${focus}` : instructions;
}
