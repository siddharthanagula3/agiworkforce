import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEVELOPER_EVAL_CASES_MAX,
  evalCheckPasses,
  type DeveloperEvalCase,
  type DeveloperEvalCaseInput,
  type DeveloperEvalCheckKind,
  type DeveloperEvalResult,
  type DeveloperEvalResultInput,
  type DeveloperEvalRun,
  type DeveloperPrompt,
  type DeveloperPromptVersion,
  type DeveloperPromptVersionInput,
} from '@agiworkforce/cloud-contracts';
import { getModelMetadataById, isAutoModeModelId } from '@agiworkforce/types';

import { createError } from '@/lib/errors';

const PG_UNIQUE_VIOLATION = '23505';
const LIST_LIMIT = 200;

interface VersionRow {
  version: number;
  system_prompt: string;
  template: string;
  model: string;
  max_tokens: number | null;
  temperature: string | number | null;
  note: string | null;
  created_at: string | Date;
}

interface PromptRow {
  id: string;
  name: string;
  updated_at: string | Date;
  case_count: string | number;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toVersion(row: VersionRow): DeveloperPromptVersion {
  return {
    version: Number(row.version),
    systemPrompt: row.system_prompt,
    template: row.template,
    model: row.model,
    maxTokens: row.max_tokens === null ? null : Number(row.max_tokens),
    temperature: row.temperature === null ? null : Number(row.temperature),
    note: row.note,
    createdAt: iso(row.created_at),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

export function validatePromptModel(model: string): string {
  const selection = model.trim();
  if (isAutoModeModelId(selection)) return selection;
  const metadata = getModelMetadataById(selection);
  if (!metadata) throw createError.validation('Pick a model from the list.');
  return metadata.id;
}

const VERSION_COLUMNS =
  'v.version, v.system_prompt, v.template, v.model, v.max_tokens, v.temperature, v.note, v.created_at';

async function latestVersion(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
): Promise<DeveloperPromptVersion | null> {
  const [row] = await db.query<VersionRow>(
    `select ${VERSION_COLUMNS}
       from public.developer_prompt_versions v
      where v.prompt_id = $1 and v.user_id = $2
      order by v.version desc
      limit 1`,
    [promptId, userId],
  );
  return row ? toVersion(row) : null;
}

async function toPrompt(
  db: DatabaseAdapter,
  userId: string,
  row: PromptRow,
): Promise<DeveloperPrompt> {
  return {
    id: row.id,
    name: row.name,
    latest: await latestVersion(db, userId, row.id),
    caseCount: Number(row.case_count),
    updatedAt: iso(row.updated_at),
  };
}

const PROMPT_SELECT = `select p.id, p.name, p.updated_at,
    (select count(*) from public.developer_eval_cases c
      where c.prompt_id = p.id and c.user_id = p.user_id) as case_count
  from public.developer_prompts p`;

export async function listPrompts(db: DatabaseAdapter, userId: string): Promise<DeveloperPrompt[]> {
  const rows = await db.query<PromptRow>(
    `${PROMPT_SELECT} where p.user_id = $1 order by p.updated_at desc limit ${LIST_LIMIT}`,
    [userId],
  );
  return Promise.all(rows.map((row) => toPrompt(db, userId, row)));
}

export async function requirePrompt(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
): Promise<DeveloperPrompt> {
  const [row] = await db.query<PromptRow>(
    `${PROMPT_SELECT} where p.id = $1 and p.user_id = $2 limit 1`,
    [promptId, userId],
  );
  if (!row) throw createError.notFound('Prompt not found');
  return toPrompt(db, userId, row);
}

async function insertVersion(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
  input: DeveloperPromptVersionInput,
): Promise<void> {
  try {
    await db.execute(
      `insert into public.developer_prompt_versions
         (prompt_id, user_id, version, system_prompt, template, model, max_tokens, temperature, note)
       select $1, $2, coalesce(max(v.version), 0) + 1, $3, $4, $5, $6, $7, $8
         from public.developer_prompt_versions v
        where v.prompt_id = $1 and v.user_id = $2`,
      [
        promptId,
        userId,
        input.systemPrompt,
        input.template,
        validatePromptModel(input.model),
        input.maxTokens,
        input.temperature,
        input.note?.trim() || null,
      ],
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createError.conflict('Another save of this prompt just finished. Try again.');
    }
    throw error;
  }
  await db.execute(
    `update public.developer_prompts set updated_at = now() where id = $1 and user_id = $2`,
    [promptId, userId],
  );
}

export async function createPrompt(
  db: DatabaseAdapter,
  userId: string,
  input: { name: string; version: DeveloperPromptVersionInput },
): Promise<DeveloperPrompt> {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `insert into public.developer_prompts (user_id, name) values ($1, $2) returning id`,
      [userId, input.name.trim()],
    );
    if (!row) throw createError.internal('The prompt could not be saved.');
    await insertVersion(tx, userId, row.id, input.version);
    return requirePrompt(tx, userId, row.id);
  });
}

export async function saveVersion(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
  input: DeveloperPromptVersionInput,
): Promise<DeveloperPrompt> {
  return db.transaction(async (tx) => {
    await requirePrompt(tx, userId, promptId);
    await insertVersion(tx, userId, promptId, input);
    return requirePrompt(tx, userId, promptId);
  });
}

export async function renamePrompt(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
  name: string,
): Promise<DeveloperPrompt> {
  const updated = await db.execute(
    `update public.developer_prompts set name = $3 where id = $1 and user_id = $2`,
    [promptId, userId, name.trim()],
  );
  if (updated === 0) throw createError.notFound('Prompt not found');
  return requirePrompt(db, userId, promptId);
}

export async function deletePrompt(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
): Promise<void> {
  const removed = await db.execute(
    `delete from public.developer_prompts where id = $1 and user_id = $2`,
    [promptId, userId],
  );
  if (removed === 0) throw createError.notFound('Prompt not found');
}

export async function listVersions(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
): Promise<DeveloperPromptVersion[]> {
  await requirePrompt(db, userId, promptId);
  const rows = await db.query<VersionRow>(
    `select ${VERSION_COLUMNS}
       from public.developer_prompt_versions v
      where v.prompt_id = $1 and v.user_id = $2
      order by v.version desc
      limit ${LIST_LIMIT}`,
    [promptId, userId],
  );
  return rows.map(toVersion);
}

interface CaseRow {
  id: string;
  variables: Record<string, unknown>;
  expected_output: string | null;
  position: number;
}

function toCase(row: CaseRow): DeveloperEvalCase {
  return {
    id: row.id,
    position: Number(row.position),
    expectedOutput: row.expected_output,
    variables: Object.fromEntries(
      Object.entries(row.variables ?? {}).map(([key, value]) => [key, String(value ?? '')]),
    ),
  };
}

export async function listCases(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
): Promise<DeveloperEvalCase[]> {
  const rows = await db.query<CaseRow>(
    `select id, variables, expected_output, position
       from public.developer_eval_cases
      where prompt_id = $1 and user_id = $2
      order by position, created_at
      limit ${DEVELOPER_EVAL_CASES_MAX}`,
    [promptId, userId],
  );
  return rows.map(toCase);
}

export async function addCases(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
  cases: readonly DeveloperEvalCaseInput[],
): Promise<DeveloperEvalCase[]> {
  return db.transaction(async (tx) => {
    await requirePrompt(tx, userId, promptId);
    const [count] = await tx.query<{ total: string; last: string | null }>(
      `select count(*) as total, max(position) as last
         from public.developer_eval_cases where prompt_id = $1 and user_id = $2`,
      [promptId, userId],
    );
    const existing = Number(count?.total ?? 0);
    if (existing + cases.length > DEVELOPER_EVAL_CASES_MAX) {
      throw createError.validation(`A prompt holds up to ${DEVELOPER_EVAL_CASES_MAX} test cases.`);
    }
    let position = count?.last === null || count?.last === undefined ? 0 : Number(count.last) + 1;
    for (const entry of cases) {
      await tx.execute(
        `insert into public.developer_eval_cases (prompt_id, user_id, variables, expected_output, position)
         values ($1, $2, $3::jsonb, $4, $5)`,
        [promptId, userId, JSON.stringify(entry.variables), entry.expectedOutput, position],
      );
      position += 1;
    }
    return listCases(tx, userId, promptId);
  });
}

export async function updateCase(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
  caseId: string,
  input: DeveloperEvalCaseInput,
): Promise<DeveloperEvalCase> {
  const [row] = await db.query<CaseRow>(
    `update public.developer_eval_cases
        set variables = $4::jsonb, expected_output = $5
      where id = $1 and prompt_id = $2 and user_id = $3
      returning id, variables, expected_output, position`,
    [caseId, promptId, userId, JSON.stringify(input.variables), input.expectedOutput],
  );
  if (!row) throw createError.notFound('Test case not found');
  return toCase(row);
}

export async function deleteCase(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
  caseId: string,
): Promise<void> {
  const removed = await db.execute(
    `delete from public.developer_eval_cases where id = $1 and prompt_id = $2 and user_id = $3`,
    [caseId, promptId, userId],
  );
  if (removed === 0) throw createError.notFound('Test case not found');
}

interface RunRow {
  id: string;
  version: number;
  check_kind: DeveloperEvalCheckKind;
  case_count: number;
  created_at: string | Date;
}

interface ResultRow {
  id: string;
  case_id: string | null;
  rendered_input: string;
  output: string | null;
  error: string | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  passed: boolean | null;
  grade: number | null;
}

function toResult(row: ResultRow): DeveloperEvalResult {
  return {
    id: row.id,
    caseId: row.case_id,
    renderedInput: row.rendered_input,
    output: row.output,
    error: row.error,
    latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
    inputTokens: row.input_tokens === null ? null : Number(row.input_tokens),
    outputTokens: row.output_tokens === null ? null : Number(row.output_tokens),
    passed: row.passed,
    grade: row.grade === null ? null : Number(row.grade),
  };
}

export async function createRun(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
  input: { version: number; checkKind: DeveloperEvalCheckKind },
): Promise<DeveloperEvalRun> {
  const [versionRow] = await db.query<{ version: number }>(
    `select version from public.developer_prompt_versions
      where prompt_id = $1 and user_id = $2 and version = $3`,
    [promptId, userId, input.version],
  );
  if (!versionRow) throw createError.notFound('That prompt version does not exist.');
  const cases = await listCases(db, userId, promptId);
  if (cases.length === 0) throw createError.validation('Add at least one test case first.');
  const [row] = await db.query<RunRow>(
    `insert into public.developer_eval_runs (prompt_id, user_id, version, check_kind, case_count)
     values ($1, $2, $3, $4, $5)
     returning id, version, check_kind, case_count, created_at`,
    [promptId, userId, input.version, input.checkKind, cases.length],
  );
  if (!row) throw createError.internal('The run could not be started.');
  return {
    id: row.id,
    version: Number(row.version),
    checkKind: row.check_kind,
    caseCount: Number(row.case_count),
    createdAt: iso(row.created_at),
    results: [],
  };
}

export async function readRun(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
  runId: string,
): Promise<DeveloperEvalRun> {
  const [row] = await db.query<RunRow>(
    `select id, version, check_kind, case_count, created_at
       from public.developer_eval_runs
      where id = $1 and prompt_id = $2 and user_id = $3`,
    [runId, promptId, userId],
  );
  if (!row) throw createError.notFound('Run not found');
  const results = await db.query<ResultRow>(
    `select id, case_id, rendered_input, output, error, latency_ms, input_tokens, output_tokens,
            passed, grade
       from public.developer_eval_results
      where run_id = $1 and user_id = $2
      order by created_at`,
    [runId, userId],
  );
  return {
    id: row.id,
    version: Number(row.version),
    checkKind: row.check_kind,
    caseCount: Number(row.case_count),
    createdAt: iso(row.created_at),
    results: results.map(toResult),
  };
}

export async function listRuns(db: DatabaseAdapter, userId: string, promptId: string) {
  const rows = await db.query<
    RunRow & { passed: string; failed: string; graded: string; average_grade: string | null }
  >(
    `select r.id, r.version, r.check_kind, r.case_count, r.created_at,
            count(x.id) filter (where x.passed is true) as passed,
            count(x.id) filter (where x.passed is false or x.error is not null) as failed,
            count(x.grade) as graded,
            avg(x.grade) as average_grade
       from public.developer_eval_runs r
       left join public.developer_eval_results x on x.run_id = r.id and x.user_id = r.user_id
      where r.prompt_id = $1 and r.user_id = $2
      group by r.id
      order by r.created_at desc
      limit 50`,
    [promptId, userId],
  );
  return rows.map((row) => ({
    id: row.id,
    version: Number(row.version),
    checkKind: row.check_kind,
    caseCount: Number(row.case_count),
    createdAt: iso(row.created_at),
    passed: Number(row.passed),
    failed: Number(row.failed),
    graded: Number(row.graded),
    averageGrade:
      row.average_grade === null ? null : Math.round(Number(row.average_grade) * 10) / 10,
  }));
}

export async function recordResult(
  db: DatabaseAdapter,
  userId: string,
  promptId: string,
  runId: string,
  input: DeveloperEvalResultInput,
): Promise<DeveloperEvalResult> {
  if (input.output === null && input.error === null) {
    throw createError.validation('A result needs an output or an error.');
  }
  const run = await readRun(db, userId, promptId, runId);
  const [testCase] = await db.query<{ expected_output: string | null }>(
    `select expected_output from public.developer_eval_cases
      where id = $1 and prompt_id = $2 and user_id = $3`,
    [input.caseId, promptId, userId],
  );
  if (!testCase) throw createError.notFound('Test case not found');
  const passed = evalCheckPasses(run.checkKind, input.output, testCase.expected_output);
  try {
    const [row] = await db.query<ResultRow>(
      `insert into public.developer_eval_results
         (run_id, case_id, user_id, rendered_input, output, error, latency_ms, input_tokens,
          output_tokens, passed)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id, case_id, rendered_input, output, error, latency_ms, input_tokens,
                 output_tokens, passed, grade`,
      [
        runId,
        input.caseId,
        userId,
        input.renderedInput,
        input.output,
        input.error,
        input.latencyMs,
        input.inputTokens,
        input.outputTokens,
        passed,
      ],
    );
    if (!row) throw createError.internal('The result could not be saved.');
    return toResult(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createError.conflict('This case already has a result in this run.');
    }
    throw error;
  }
}

export async function gradeResult(
  db: DatabaseAdapter,
  userId: string,
  runId: string,
  resultId: string,
  grade: number | null,
): Promise<DeveloperEvalResult> {
  const [row] = await db.query<ResultRow>(
    `update public.developer_eval_results set grade = $4
      where id = $1 and run_id = $2 and user_id = $3
      returning id, case_id, rendered_input, output, error, latency_ms, input_tokens,
                output_tokens, passed, grade`,
    [resultId, runId, userId, grade],
  );
  if (!row) throw createError.notFound('Result not found');
  return toResult(row);
}
