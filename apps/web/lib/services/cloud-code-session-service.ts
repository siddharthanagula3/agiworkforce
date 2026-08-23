import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CLOUD_CODE_NETWORK_ACCESS,
  getPlanMaxSandboxes,
  type CloudCodeNetworkAccess,
  type CloudCodeSession,
  type CloudCodeTerminalEntry,
  type CreateCloudCodeSessionInput,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { CLOUD_CODE_COMMAND_DEADLINE_MS } from '@/lib/deadline-policy';
import { getE2BExecutor, killE2BSession } from '@/lib/e2b/runtime';
import { managedCloudCodeSessionScope } from '@/lib/e2b/session-store';

const MAX_TITLE_LENGTH = 120;
const MAX_COMMAND_LENGTH = 2_000;
const MAX_ERROR_LENGTH = 2_000;
const DEFAULT_WORKSPACE_PATH = '/home/user';
const REPOSITORY_WORKSPACE_PATH = '/home/user/project';
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CloudCodeOwner {
  userId: string;
  organizationId: string | null;
}

export class CloudCodeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudCodeValidationError';
  }
}

export class CloudCodeNotFoundError extends Error {
  constructor() {
    super('Code session not found');
    this.name = 'CloudCodeNotFoundError';
  }
}

export class CloudCodeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudCodeConflictError';
  }
}

export class CloudCodeLimitError extends Error {
  constructor(
    message: string,
    readonly limit: number,
  ) {
    super(message);
    this.name = 'CloudCodeLimitError';
  }
}

export class CloudCodeUnavailableError extends Error {
  constructor(message = 'Managed Code environment is unavailable') {
    super(message);
    this.name = 'CloudCodeUnavailableError';
  }
}

export function isCloudCodeSchemaUnavailable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === '42P01') return true;
    current = candidate.cause;
  }
  return false;
}

interface SessionRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  organization_id: string | null;
  request_id: string;
  title: string;
  repository_url: string | null;
  network_access: string;
  state: string;
  workspace_path: string;
  last_error: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  closed_at: string | Date | null;
}

interface TerminalEntryRow extends Record<string, unknown> {
  id: string | number;
  session_id: string;
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  started_at: string | Date;
  completed_at: string | Date;
}

interface ValidatedCreateInput {
  requestId: string;
  title: string;
  repositoryUrl: string | null;
  networkAccess: CloudCodeNetworkAccess;
  workspacePath: string;
}

function iso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid Code session timestamp');
  return date.toISOString();
}

function asNetworkAccess(value: string): CloudCodeNetworkAccess {
  if ((CLOUD_CODE_NETWORK_ACCESS as readonly string[]).includes(value)) {
    return value as CloudCodeNetworkAccess;
  }
  throw new Error(`Invalid Code session network policy: ${value}`);
}

function asSessionState(value: string): CloudCodeSession['state'] {
  if (['provisioning', 'ready', 'running', 'failed', 'closed'].includes(value)) {
    return value as CloudCodeSession['state'];
  }
  throw new Error(`Invalid Code session state: ${value}`);
}

export function mapCloudCodeSession(row: SessionRow): CloudCodeSession {
  return {
    id: row.id,
    title: row.title,
    repositoryUrl: row.repository_url,
    networkAccess: asNetworkAccess(row.network_access),
    state: asSessionState(row.state),
    workspacePath: row.workspace_path,
    lastError: row.last_error,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    closedAt: row.closed_at ? iso(row.closed_at) : null,
  };
}

export function mapCloudCodeTerminalEntry(row: TerminalEntryRow): CloudCodeTerminalEntry {
  return {
    id: String(row.id),
    sessionId: row.session_id,
    command: row.command,
    stdout: row.stdout,
    stderr: row.stderr,
    exitCode: row.exit_code,
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
  };
}

function validateRepositoryUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) {
    throw new CloudCodeValidationError('Repository URL must be at most 500 characters');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CloudCodeValidationError('Repository URL must be a valid HTTPS GitHub URL');
  }
  const pathParts = url.pathname
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    pathParts.length !== 2
  ) {
    throw new CloudCodeValidationError(
      'Only public HTTPS GitHub repository URLs in owner/repository form are supported',
    );
  }
  return `https://github.com/${pathParts[0]}/${pathParts[1]}.git`;
}

export function validateCreateCloudCodeSession(
  input: CreateCloudCodeSessionInput,
): ValidatedCreateInput {
  if (!REQUEST_ID_RE.test(input.requestId ?? '')) {
    throw new CloudCodeValidationError('requestId must be 8–128 URL-safe characters');
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > MAX_TITLE_LENGTH) {
    throw new CloudCodeValidationError(`Title must be 1–${MAX_TITLE_LENGTH} characters`);
  }
  if (!(CLOUD_CODE_NETWORK_ACCESS as readonly unknown[]).includes(input.networkAccess)) {
    throw new CloudCodeValidationError('networkAccess must be none, trusted, or full');
  }
  if (input.networkAccess === 'full' && input.fullNetworkAcknowledged !== true) {
    throw new CloudCodeValidationError(
      'Full network access requires explicit acknowledgement of unrestricted egress',
    );
  }
  const repositoryUrl = validateRepositoryUrl(input.repositoryUrl);
  if (repositoryUrl && input.networkAccess === 'none') {
    throw new CloudCodeValidationError(
      'Repository setup requires Trusted hosts or Full network access',
    );
  }
  return {
    requestId: input.requestId,
    title,
    repositoryUrl,
    networkAccess: input.networkAccess,
    workspacePath: repositoryUrl ? REPOSITORY_WORKSPACE_PATH : DEFAULT_WORKSPACE_PATH,
  };
}

export function validateCloudCodeSessionId(sessionId: string): string {
  if (!UUID_RE.test(sessionId)) throw new CloudCodeNotFoundError();
  return sessionId;
}

function ownerSql(
  owner: CloudCodeOwner,
  startIndex: number,
): {
  clause: string;
  params: [string, string | null];
} {
  return {
    clause: `user_id = $${startIndex} and organization_id is not distinct from $${startIndex + 1}`,
    params: [owner.userId, owner.organizationId],
  };
}

function cloudCodeQuotaLockKey(owner: CloudCodeOwner): string {
  return `${owner.organizationId ?? '-'}:${owner.userId}`;
}

export async function listCloudCodeSessions(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
): Promise<CloudCodeSession[]> {
  const scoped = ownerSql(owner, 1);
  const rows = await db.query<SessionRow>(
    `select *
       from cloud_code_sessions
      where ${scoped.clause}
      order by updated_at desc
      limit 100`,
    scoped.params,
  );
  return rows.map(mapCloudCodeSession);
}

export async function getCloudCodeSession(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
): Promise<CloudCodeSession> {
  validateCloudCodeSessionId(sessionId);
  const scoped = ownerSql(owner, 2);
  const rows = await db.query<SessionRow>(
    `select *
       from cloud_code_sessions
      where id = $1 and ${scoped.clause}
      limit 1`,
    [sessionId, ...scoped.params],
  );
  const row = rows[0];
  if (!row) throw new CloudCodeNotFoundError();
  return mapCloudCodeSession(row);
}

export async function listCloudCodeTerminalEntries(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
): Promise<CloudCodeTerminalEntry[]> {
  validateCloudCodeSessionId(sessionId);
  const scoped = ownerSql(owner, 2);
  const rows = await db.query<TerminalEntryRow>(
    `select id, session_id, command, stdout, stderr, exit_code, started_at, completed_at
       from cloud_code_terminal_entries
      where session_id = $1 and ${scoped.clause}
      order by id asc
      limit 200`,
    [sessionId, ...scoped.params],
  );
  return rows.map(mapCloudCodeTerminalEntry);
}

async function updateSessionState(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  state: CloudCodeSession['state'],
  lastError: string | null,
): Promise<CloudCodeSession> {
  const scoped = ownerSql(owner, 4);
  const rows = await db.query<SessionRow>(
    `update cloud_code_sessions
        set state = $2,
            last_error = $3,
            updated_at = now(),
            closed_at = case when $2 = 'closed' then now() else closed_at end
      where id = $1 and ${scoped.clause}
      returning *`,
    [sessionId, state, lastError?.slice(0, MAX_ERROR_LENGTH) ?? null, ...scoped.params],
  );
  const row = rows[0];
  if (!row) throw new CloudCodeNotFoundError();
  return mapCloudCodeSession(row);
}

async function transitionSessionState(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  expectedStates: CloudCodeSession['state'][],
  state: CloudCodeSession['state'],
  lastError: string | null,
): Promise<CloudCodeSession | null> {
  const scoped = ownerSql(owner, 5);
  const rows = await db.query<SessionRow>(
    `update cloud_code_sessions
        set state = $2,
            last_error = $3,
            updated_at = now()
      where id = $1
        and state = any($4::text[])
        and ${scoped.clause}
      returning *`,
    [
      sessionId,
      state,
      lastError?.slice(0, MAX_ERROR_LENGTH) ?? null,
      expectedStates,
      ...scoped.params,
    ],
  );
  return rows[0] ? mapCloudCodeSession(rows[0]) : null;
}

async function failSessionIfOpen(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  message: string,
): Promise<void> {
  await transitionSessionState(
    db,
    owner,
    sessionId,
    ['provisioning', 'ready', 'running'],
    'failed',
    message,
  );
}

async function findByRequestId(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  requestId: string,
): Promise<SessionRow | null> {
  const scoped = ownerSql(owner, 2);
  const rows = await db.query<SessionRow>(
    `select *
       from cloud_code_sessions
      where request_id = $1 and ${scoped.clause}
      limit 1`,
    [requestId, ...scoped.params],
  );
  return rows[0] ?? null;
}

function sameCreateRequest(row: SessionRow, input: ValidatedCreateInput): boolean {
  return (
    row.title === input.title &&
    row.repository_url === input.repositoryUrl &&
    row.network_access === input.networkAccess
  );
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export async function createCloudCodeSession(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  input: CreateCloudCodeSessionInput,
  planTier: string,
): Promise<CloudCodeSession> {
  const validated = validateCreateCloudCodeSession(input);

  let claimed: { row: SessionRow; reused: boolean };
  try {
    claimed = await db.transaction(async (tx) => {
      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:cloud-code-sessions:' || $1, 0))`,
        [cloudCodeQuotaLockKey(owner)],
      );

      const existing = await findByRequestId(tx, owner, validated.requestId);
      if (existing) {
        if (!sameCreateRequest(existing, validated)) {
          throw new CloudCodeConflictError(
            'requestId was already used with different session details',
          );
        }
        return { row: existing, reused: true };
      }

      const maxSessions = getPlanMaxSandboxes(planTier);
      if (maxSessions <= 0) {
        throw new CloudCodeLimitError(
          'Your plan does not include managed Code sessions',
          maxSessions,
        );
      }

      const scoped = ownerSql(owner, 1);
      const activeRows = await tx.query<{ count: string | number }>(
        `select count(*) as count
           from cloud_code_sessions
          where ${scoped.clause}
            and state in ('provisioning', 'ready', 'running')`,
        scoped.params,
      );
      if (Number(activeRows[0]?.count ?? 0) >= maxSessions) {
        throw new CloudCodeLimitError(
          `Your plan allows ${maxSessions} active Code session${maxSessions === 1 ? '' : 's'}`,
          maxSessions,
        );
      }

      const inserted = await tx.query<SessionRow>(
        `insert into cloud_code_sessions (
           user_id, organization_id, request_id, title, repository_url,
           network_access, state, workspace_path
         ) values ($1, $2, $3, $4, $5, $6, 'provisioning', $7)
         returning *`,
        [
          owner.userId,
          owner.organizationId,
          validated.requestId,
          validated.title,
          validated.repositoryUrl,
          validated.networkAccess,
          validated.workspacePath,
        ],
      );
      return { row: inserted[0]!, reused: false };
    });
  } catch (error) {
    if (error instanceof CloudCodeConflictError || error instanceof CloudCodeLimitError)
      throw error;
    const raced = await findByRequestId(db, owner, validated.requestId);
    if (raced && sameCreateRequest(raced, validated)) return mapCloudCodeSession(raced);
    throw error;
  }

  if (claimed.reused) return mapCloudCodeSession(claimed.row);
  const row = claimed.row;

  const sessionId = row.id;
  const scope = managedCloudCodeSessionScope(
    owner.userId,
    sessionId,
    validated.networkAccess,
    planTier,
  );
  const executor = await getE2BExecutor(scope);
  if (!executor?.runCommand) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      'Managed Code environment could not be provisioned',
    );
    await killE2BSession(scope);
    throw new CloudCodeUnavailableError();
  }

  let disposed = false;
  try {
    if (validated.repositoryUrl) {
      const clone = await executor.runCommand({
        command: `git clone --depth=1 -- ${shellQuote(validated.repositoryUrl)} ${shellQuote(
          REPOSITORY_WORKSPACE_PATH,
        )}`,
        cwd: DEFAULT_WORKSPACE_PATH,
        timeoutMs: CLOUD_CODE_COMMAND_DEADLINE_MS,
      });
      if (!clone.ok) {
        throw new CloudCodeUnavailableError(
          clone.error || clone.stderr || 'Repository setup failed',
        );
      }
    }
    await executor.pause?.();
    const ready = await transitionSessionState(
      db,
      owner,
      sessionId,
      ['provisioning'],
      'ready',
      null,
    );
    if (!ready) throw new CloudCodeConflictError('Code session changed while provisioning');
    return ready;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await executor.pause?.();
    } finally {
      await executor.dispose();
      disposed = true;
      await killE2BSession(scope);
    }
    await failSessionIfOpen(db, owner, sessionId, message);
    logger.warn({ error, userId: owner.userId, sessionId }, '[code] session provisioning failed');
    if (error instanceof CloudCodeUnavailableError) throw error;
    throw new CloudCodeUnavailableError(message);
  } finally {
    if (!disposed) await executor.dispose();
  }
}

export async function claimCloudCodeSessionForRun(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
): Promise<CloudCodeSession | null> {
  return transitionSessionState(db, owner, sessionId, ['ready'], 'running', null);
}

export async function releaseCloudCodeSessionAfterRun(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
): Promise<CloudCodeSession | null> {
  return transitionSessionState(db, owner, sessionId, ['running'], 'ready', null);
}

export async function runCloudCodeCommand(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  commandValue: unknown,
  planTier: string,
): Promise<{ session: CloudCodeSession; terminalEntry: CloudCodeTerminalEntry }> {
  const command = typeof commandValue === 'string' ? commandValue.trim() : '';
  if (!command || command.length > MAX_COMMAND_LENGTH || command.includes('\0')) {
    throw new CloudCodeValidationError(
      `Command must be 1–${MAX_COMMAND_LENGTH} characters and contain no null bytes`,
    );
  }

  const session = await getCloudCodeSession(db, owner, sessionId);
  if (session.state === 'closed') {
    throw new CloudCodeConflictError('Closed Code sessions cannot run commands');
  }
  if (session.state === 'provisioning' || session.state === 'running') {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  if (session.state === 'failed') {
    throw new CloudCodeConflictError('Failed Code sessions must be closed and recreated');
  }

  const runningSession = await transitionSessionState(
    db,
    owner,
    sessionId,
    ['ready'],
    'running',
    null,
  );
  if (!runningSession) {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  const scope = managedCloudCodeSessionScope(
    owner.userId,
    sessionId,
    session.networkAccess,
    planTier,
  );
  const startedAt = new Date();
  const executor = await getE2BExecutor(scope);
  if (!executor?.runCommand) {
    await failSessionIfOpen(db, owner, sessionId, 'Managed Code environment could not be attached');
    throw new CloudCodeUnavailableError('Managed Code environment could not be attached');
  }

  try {
    const result = await executor.runCommand({
      command,
      cwd: session.workspacePath,
      timeoutMs: CLOUD_CODE_COMMAND_DEADLINE_MS,
    });
    const completedAt = new Date();
    const scoped = ownerSql(owner, 2);
    const rows = await db.transaction(async (tx) => {
      const entryRows = await tx.query<TerminalEntryRow>(
        `insert into cloud_code_terminal_entries (
           session_id, user_id, organization_id, command, stdout, stderr,
           exit_code, started_at, completed_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id, session_id, command, stdout, stderr, exit_code, started_at, completed_at`,
        [
          sessionId,
          owner.userId,
          owner.organizationId,
          command,
          result.stdout,
          result.stderr,
          result.exitCode,
          startedAt.toISOString(),
          completedAt.toISOString(),
        ],
      );
      const sessionRows = await tx.query<SessionRow>(
        `update cloud_code_sessions
            set state = 'ready', last_error = null, updated_at = now()
          where id = $1 and state = 'running' and ${scoped.clause}
          returning *`,
        [sessionId, ...scoped.params],
      );
      return { entry: entryRows[0], session: sessionRows[0] };
    });
    if (!rows.entry || !rows.session) throw new CloudCodeNotFoundError();
    return {
      terminalEntry: mapCloudCodeTerminalEntry(rows.entry),
      session: mapCloudCodeSession(rows.session),
    };
  } catch (error) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    await executor.pause?.();
    await executor.dispose();
  }
}

export async function closeCloudCodeSession(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  planTier: string,
): Promise<CloudCodeSession> {
  const session = await getCloudCodeSession(db, owner, sessionId);
  if (session.state === 'closed') return session;
  await killE2BSession(
    managedCloudCodeSessionScope(owner.userId, sessionId, session.networkAccess, planTier),
  );
  return updateSessionState(db, owner, sessionId, 'closed', null);
}
