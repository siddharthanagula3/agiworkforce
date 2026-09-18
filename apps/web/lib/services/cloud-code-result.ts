import type { CloudCodeAgentStep, CloudCodeAgentStopReason } from '@agiworkforce/types';

export const CLOUD_CODE_CHECK_KINDS = ['typecheck', 'lint', 'tests', 'build'] as const;
export type CloudCodeCheckKind = (typeof CLOUD_CODE_CHECK_KINDS)[number];

export const CLOUD_CODE_CHECK_LABELS: Readonly<Record<CloudCodeCheckKind, string>> = Object.freeze({
  typecheck: 'Typecheck',
  lint: 'Lint',
  tests: 'Tests',
  build: 'Build',
});

/**
 * `unknown` is not a soft pass: a command whose exit code was never recorded
 * has proved nothing, and every reader of this module treats it as a blocker.
 */
export type CloudCodeCheckOutcome = 'passed' | 'failed' | 'unknown';

export interface CloudCodeCheckResult {
  kind: CloudCodeCheckKind;
  command: string;
  exitCode: number | null;
  outcome: CloudCodeCheckOutcome;
}

export interface CloudCodeValidationSummary {
  checks: CloudCodeCheckResult[];
  commandsRun: number;
  commandsFailed: number;
  filesChanged: string[];
}

export interface CloudCodeCompletionVerdict {
  complete: boolean;
  blockers: string[];
}

export const EMPTY_CLOUD_CODE_VALIDATION_SUMMARY: CloudCodeValidationSummary = Object.freeze({
  checks: [],
  commandsRun: 0,
  commandsFailed: 0,
  filesChanged: [],
});

const RUN_COMMAND_TOOLS = new Set(['run_command', 'execute_code']);
const FILE_WRITE_TOOLS = new Set(['write_file', 'edit_file']);

const EXIT_MARKER = /\[exit (-?\d+)\]\s*$/;

const CHECK_PATTERNS: ReadonlyArray<{ kind: CloudCodeCheckKind; pattern: RegExp }> = [
  { kind: 'typecheck', pattern: /\btsc\b|\btypecheck\b|\btype-check\b|\bmypy\b|\bcargo\s+check\b/ },
  {
    kind: 'tests',
    pattern:
      /\btests?\b|\bvitest\b|\bjest\b|\bpytest\b|\bmocha\b|\brspec\b|\bphpunit\b|\bcargo\s+test\b|\bgo\s+test\b/,
  },
  {
    kind: 'lint',
    pattern:
      /\blint\b|\beslint\b|\bbiome\b|\bruff\b|\bclippy\b|\bflake8\b|\brubocop\b|\bgolangci-lint\b|\bprettier\b/,
  },
  { kind: 'build', pattern: /\bbuild\b|\bmake\b|\bcompile\b/ },
];

/** Which validation a command line is, or null when it is ordinary work. */
export function classifyCheckCommand(command: string): CloudCodeCheckKind | null {
  const line = command.trim().toLowerCase();
  if (!line) return null;
  for (const { kind, pattern } of CHECK_PATTERNS) {
    if (pattern.test(line)) return kind;
  }
  return null;
}

/**
 * The exit code the sandbox printed for a command step. Null when the step
 * carries no marker, which is the only honest answer and never a zero.
 */
export function parseStepExitCode(output: string): number | null {
  const match = EXIT_MARKER.exec(output.trimEnd());
  if (!match?.[1]) return null;
  const code = Number.parseInt(match[1], 10);
  return Number.isFinite(code) ? code : null;
}

export function checkOutcomeFor(step: CloudCodeAgentStep): CloudCodeCheckOutcome {
  if (step.isError) return 'failed';
  const exitCode = parseStepExitCode(step.output);
  if (exitCode === null) return 'unknown';
  return exitCode === 0 ? 'passed' : 'failed';
}

function stepPath(step: CloudCodeAgentStep): string | null {
  const label = step.label?.trim();
  if (!label) return null;
  const prefix = `${step.toolName} `;
  return label.startsWith(prefix) ? label.slice(prefix.length).trim() || null : null;
}

/**
 * Every validation claim this session may make, read from the recorded steps
 * alone. A later run of the same check replaces an earlier one, so a fix
 * followed by a rerun reads as the rerun and a rerun that failed is never
 * hidden by the pass before it.
 */
export function buildValidationSummary(
  turns: ReadonlyArray<{ steps: readonly CloudCodeAgentStep[] }>,
): CloudCodeValidationSummary {
  const byKind = new Map<CloudCodeCheckKind, CloudCodeCheckResult>();
  const filesChanged: string[] = [];
  let commandsRun = 0;
  let commandsFailed = 0;

  for (const turn of turns) {
    for (const step of turn.steps) {
      if (FILE_WRITE_TOOLS.has(step.toolName) && !step.isError) {
        const path = stepPath(step);
        if (path !== null && !filesChanged.includes(path)) filesChanged.push(path);
        continue;
      }
      if (!RUN_COMMAND_TOOLS.has(step.toolName)) continue;
      const command = step.label?.trim() ?? '';
      commandsRun += 1;
      const outcome = checkOutcomeFor(step);
      if (outcome !== 'passed') commandsFailed += 1;
      const kind = command ? classifyCheckCommand(command) : null;
      if (kind === null) continue;
      byKind.set(kind, { kind, command, exitCode: parseStepExitCode(step.output), outcome });
    }
  }

  return {
    checks: CLOUD_CODE_CHECK_KINDS.map((kind) => byKind.get(kind)).filter(
      (check): check is CloudCodeCheckResult => check !== undefined,
    ),
    commandsRun,
    commandsFailed,
    filesChanged,
  };
}

/** The same summary shape for a surface that runs its checks itself. */
export function validationSummaryFromChecks(
  checks: readonly CloudCodeCheckResult[],
  filesChanged: readonly string[] = [],
): CloudCodeValidationSummary {
  return {
    checks: CLOUD_CODE_CHECK_KINDS.map((kind) =>
      checks.find((check) => check.kind === kind),
    ).filter((check): check is CloudCodeCheckResult => check !== undefined),
    commandsRun: checks.length,
    commandsFailed: checks.filter((check) => check.outcome !== 'passed').length,
    filesChanged: [...filesChanged],
  };
}

export function findCheck(
  summary: CloudCodeValidationSummary,
  kind: CloudCodeCheckKind,
): CloudCodeCheckResult | null {
  return summary.checks.find((check) => check.kind === kind) ?? null;
}

/**
 * Whether this session may claim the work is done. Fail closed: an unfinished
 * turn, a check that exited nonzero, a check whose exit code was never
 * recorded, or a session that changed nothing each block the claim on their
 * own, and every blocker is named so the reader can act on it.
 */
export function verifyTaskCompletion(input: {
  stopReason: CloudCodeAgentStopReason | null;
  summary: CloudCodeValidationSummary;
}): CloudCodeCompletionVerdict {
  const blockers: string[] = [];
  if (input.stopReason === null) {
    blockers.push('The last turn has not finished.');
  } else if (input.stopReason !== 'done') {
    blockers.push(`The last turn ended as "${input.stopReason}", not as finished work.`);
  }
  for (const check of input.summary.checks) {
    if (check.outcome === 'failed') {
      const exit = check.exitCode === null ? 'reported an error' : `exited ${check.exitCode}`;
      blockers.push(`${CLOUD_CODE_CHECK_LABELS[check.kind]} failed: \`${check.command}\` ${exit}.`);
    } else if (check.outcome === 'unknown') {
      blockers.push(
        `${CLOUD_CODE_CHECK_LABELS[check.kind]} ran without a recorded exit code: \`${check.command}\`.`,
      );
    }
  }
  if (input.summary.filesChanged.length === 0) {
    blockers.push('No file was recorded as changed in this session.');
  }
  return { complete: blockers.length === 0, blockers };
}

export interface CloudCodeTaskMetrics {
  turns: number;
  steps: number;
  commandsRun: number;
  commandsFailed: number;
  filesChanged: number;
  checksPassed: number;
  checksFailed: number;
  checksNotRun: number;
  complete: boolean;
}

/** One record per settled task, counted from the same steps the body is built from. */
export function cloudCodeTaskMetrics(input: {
  turns: ReadonlyArray<{ steps: readonly CloudCodeAgentStep[] }>;
  summary: CloudCodeValidationSummary;
  verdict: CloudCodeCompletionVerdict;
}): CloudCodeTaskMetrics {
  const outcomes = input.summary.checks.map((check) => check.outcome);
  return {
    turns: input.turns.length,
    steps: input.turns.reduce((total, turn) => total + turn.steps.length, 0),
    commandsRun: input.summary.commandsRun,
    commandsFailed: input.summary.commandsFailed,
    filesChanged: input.summary.filesChanged.length,
    checksPassed: outcomes.filter((outcome) => outcome === 'passed').length,
    checksFailed: outcomes.filter((outcome) => outcome !== 'passed').length,
    checksNotRun: CLOUD_CODE_CHECK_KINDS.length - outcomes.length,
    complete: input.verdict.complete,
  };
}

const MAX_GOAL_LENGTH = 2_000;
const MAX_LISTED_FILES = 50;
const ISSUE_REFERENCE_RE = /(?:^|[\s([])(?:([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+))?#(\d{1,7})\b/g;
const MAX_ISSUE_REFERENCES = 10;

// A pull request body is read by people and by GitHub's own parser, so control
// characters are dropped rather than passed through into either.
function stripControlCharacters(text: string): string {
  return [...text]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code === 0x0a || code === 0x09 || (code >= 0x20 && code !== 0x7f);
    })
    .join('');
}

/** Issue numbers named in the goal the user wrote, in the order they appear. */
export function parseIssueReferences(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(ISSUE_REFERENCE_RE)) {
    const reference = `${match[1] ?? ''}#${match[2]}`;
    if (!found.includes(reference)) found.push(reference);
    if (found.length === MAX_ISSUE_REFERENCES) break;
  }
  return found;
}

function checkLine(summary: CloudCodeValidationSummary, kind: CloudCodeCheckKind): string {
  const check = findCheck(summary, kind);
  const label = CLOUD_CODE_CHECK_LABELS[kind];
  if (check === null) return `- ${label}: not run in this session`;
  if (check.outcome === 'passed') return `- ${label}: passed (\`${check.command}\`, exit 0)`;
  if (check.outcome === 'unknown') {
    return `- ${label}: ran with no recorded exit code (\`${check.command}\`)`;
  }
  const exit = check.exitCode === null ? 'reported an error' : `exit ${check.exitCode}`;
  return `- ${label}: failed (\`${check.command}\`, ${exit})`;
}

/**
 * The pull request body, built from the recorded steps and nothing else.
 *
 * The model's own narration is deliberately not a source here: it is the one
 * input that can claim a test passed that never ran. Every check prints a line
 * whether or not it ran, so an absent test run reads as "not run" instead of
 * as silence a reader fills in optimistically.
 */
export function buildCloudCodePullRequestBody(input: {
  goal: string;
  summary: CloudCodeValidationSummary;
  verdict: CloudCodeCompletionVerdict;
}): string {
  const goal = stripControlCharacters(input.goal).trim();
  const sections: string[] = [];

  sections.push(
    `### Task\n\n${goal.slice(0, MAX_GOAL_LENGTH) || 'Opened from an AGI Code session.'}`,
  );

  const references = parseIssueReferences(goal);
  if (references.length > 0) {
    const keyword = input.verdict.complete ? 'Closes' : 'Refs';
    sections.push(
      `### Linked issues\n\n${references.map((reference) => `${keyword} ${reference}`).join('\n')}`,
    );
  }

  const files = input.summary.filesChanged;
  const listed = files.slice(0, MAX_LISTED_FILES).map((path) => `- \`${path}\``);
  if (files.length > MAX_LISTED_FILES) {
    listed.push(`- and ${files.length - MAX_LISTED_FILES} more`);
  }
  sections.push(
    `### Files the agent wrote\n\n${listed.length > 0 ? listed.join('\n') : '- none recorded'}`,
  );

  sections.push(
    `### Checks\n\n${CLOUD_CODE_CHECK_KINDS.map((kind) => checkLine(input.summary, kind)).join('\n')}\n\n${input.summary.commandsRun} command${input.summary.commandsRun === 1 ? '' : 's'} ran, ${input.summary.commandsFailed} did not succeed.`,
  );

  if (!input.verdict.complete) {
    sections.push(
      `### Not verified\n\n${input.verdict.blockers.map((blocker) => `- ${blocker}`).join('\n')}`,
    );
  }

  sections.push(
    'Every line above is derived from the commands this session recorded and their exit codes.',
  );
  return sections.join('\n\n');
}
