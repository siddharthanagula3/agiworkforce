import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CLOUD_CODE_NETWORK_ACCESS,
  NOTEBOOK_CELL_LANGUAGES,
  getPlanMaxSandboxes,
  type CloudCodeNetworkAccess,
  type CloudCodeNotebookFile,
  type CloudCodeSession,
  type CloudCodeTerminalEntry,
  type CreateCloudCodeSessionInput,
  type NotebookCellLanguage,
  type NotebookCellOutput,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import {
  CLOUD_CODE_COMMAND_DEADLINE_MS,
  resolveCloudCodeCommandDeadlineMs,
} from '@/lib/deadline-policy';
import { getE2BExecutor, killE2BSession } from '@/lib/e2b/runtime';
import { InvalidExtraEgressHostsError, normalizeExtraEgressHosts } from '@/lib/e2b/egress-hosts';
import { assertExtraEgressHostsResolveSafely } from '@/lib/e2b/egress-host-resolution';
import { confineWorkspacePath } from '@/lib/e2b/execution-tools';
import type { CommandExecutionResult } from '@/lib/e2b/types';
import {
  harnessCredentialSpecs,
  harnessIsProxyCovered,
  harnessProxyConfigFile,
  knownHarnessCommandIds,
  listCloudCodeRuntimes,
} from '@/lib/e2b/templates';
import { providerProxyBaseUrl } from '@/lib/e2b/provider-proxy';
import { managedCloudCodeSessionScope } from '@/lib/e2b/session-store';
import {
  getInstallationAccessToken,
  isGitHubAppConfigured,
  isGitHubInstallationLinkingAvailable,
} from '@/lib/github-app';
import { getUserGithubInstallations } from '@/lib/user-connector-tools';

const MAX_TITLE_LENGTH = 120;
const MAX_HARNESS_CREDENTIAL_LENGTH = 4_000;
const MAX_COMMAND_LENGTH = 2_000;
const MAX_ERROR_LENGTH = 2_000;
const MAX_COMMIT_MESSAGE_LENGTH = 2_000;
const MAX_NOTEBOOK_CELL_CODE_LENGTH = 50_000;
const MAX_NOTEBOOK_UPLOAD_BYTES = 10 * 1024 * 1024;
const GITHUB_INSTALLATION_TOKEN_USERNAME = 'x-access-token';
const GITHUB_REPOSITORY_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\.git$/;
const DEFAULT_WORKSPACE_PATH = '/home/user';
const REPOSITORY_WORKSPACE_PATH = '/home/user/project';
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * How long a run may hold a Code session before another run may take it over.
 *
 * A session is single-writer: a run flips it to `running` and flips it back in
 * a `finally`. That `finally` does not run when the platform kills the function
 * mid-turn, so without an expiry one killed turn wedges the session at
 * `running` forever and every later turn 409s on advice ("wait and try again")
 * that never comes true.
 *
 * The TTL must exceed the longest a legitimate turn can possibly hold the
 * session, or two runs could drive one sandbox. The agent route declares
 * `maxDuration = 300`, which is the platform's hard kill for a turn, and the
 * command route's work is bounded far lower by CLOUD_CODE_COMMAND_DEADLINE_MS
 * (60 s). The lease clock starts at the claim's `now()`, which is strictly
 * *after* the request started, so lease expiry always lands at least 120 s past
 * the point the platform has already killed the holder. That margin also
 * absorbs skew between the database clock and the function's own.
 *
 * Downward, 420 s is the worst case a user waits after a killed turn before
 * their session is usable again, bounded, instead of permanent.
 */
export const CLOUD_CODE_RUN_LEASE_SECONDS = 420;

export interface CloudCodeRunClaim {
  session: CloudCodeSession;
  /**
   * Fences every later write by this run. A run that was reclaimed cannot flip
   * the session back to `ready` (or to `failed`) under the new holder, because
   * the row's token has moved on.
   */
  leaseToken: string;
}

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

/**
 * Postgres codes that mean "this deployment has not run the migrations yet":
 * 42P01 is an absent table, 42703 an absent column.
 *
 * The column case is the one a real deployment hits, a table added long ago
 * and a column added since. Matching only the table left a half-migrated
 * deployment answering "An unexpected error occurred", which tells the reader
 * nothing and the operator less. Reproduced against a live database with
 * `runtime_id` not yet added.
 */
const SCHEMA_NOT_MIGRATED_CODES = new Set(['42P01', '42703']);

export function isCloudCodeSchemaUnavailable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && SCHEMA_NOT_MIGRATED_CODES.has(candidate.code)) {
      return true;
    }
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
  runtime_id?: string | null;
  repository_branch?: string | null;
  extra_hosts?: string[] | null;
  state: string;
  workspace_path: string;
  last_error: string | null;
  run_lease_token: string | null;
  run_lease_expires_at: string | Date | null;
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
  runtimeId: string | null;
  repositoryBranch: string | null;
  extraHosts: string[];
  harnessCredential: { envVar: string; value: string } | null;
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
    repositoryBranch: row.repository_branch ?? null,
    networkAccess: asNetworkAccess(row.network_access),
    runtimeId: row.runtime_id ?? null,
    extraHosts: row.extra_hosts ?? [],
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

/**
 * Accept only refs that cannot be mistaken for a git option.
 *
 * `--branch` has to precede the `--` that protects the URL, so the ref reaches
 * git as its own argv element: shell quoting does not stop `--upload-pack=...`
 * from being read as a flag. Requiring an alphanumeric first character removes
 * that whole class, and the rest follows git-check-ref-format.
 */
const GIT_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

function validateRepositoryBranch(value: string | null | undefined): string | null {
  const branch = typeof value === 'string' ? value.trim() : '';
  if (!branch) return null;
  const rejected =
    !GIT_REF_RE.test(branch) ||
    branch.includes('..') ||
    branch.includes('//') ||
    branch.endsWith('/') ||
    branch.endsWith('.') ||
    branch.endsWith('.lock');
  if (rejected) {
    throw new CloudCodeValidationError(
      'Branch must be a plain git ref: letters, digits, dot, dash, underscore and slash, starting with a letter or digit.',
    );
  }
  return branch;
}

function resolveExplicitHarnessCredential(
  runtimeId: string | null,
  rawCredential: CreateCloudCodeSessionInput['harnessCredential'],
): { envVar: string; value: string } | null {
  if (rawCredential === undefined || rawCredential === null) return null;
  const value = typeof rawCredential === 'string' ? rawCredential.trim() : '';
  if (!value || value.length > MAX_HARNESS_CREDENTIAL_LENGTH) {
    throw new CloudCodeValidationError(
      `harnessCredential must be 1–${MAX_HARNESS_CREDENTIAL_LENGTH} characters`,
    );
  }
  if (!runtimeId) {
    throw new CloudCodeValidationError('harnessCredential requires a runtimeId');
  }
  const specs = harnessCredentialSpecs(runtimeId);
  if (specs.length !== 1) {
    throw new CloudCodeValidationError(
      'harnessCredential is only supported for a coding agent with exactly one provider credential',
    );
  }
  return { envVar: specs[0]!.envVar, value };
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
      'Full internet access requires explicit acknowledgement of unrestricted egress',
    );
  }
  const repositoryUrl = validateRepositoryUrl(input.repositoryUrl);
  const repositoryBranch = validateRepositoryBranch(input.repositoryBranch);
  if (repositoryBranch && !repositoryUrl) {
    throw new CloudCodeValidationError('A branch needs a repository to clone it from');
  }
  if (repositoryUrl && input.networkAccess === 'none') {
    throw new CloudCodeValidationError(
      'Repository setup requires Trusted hosts or Full internet access',
    );
  }
  let extraHosts: string[];
  try {
    extraHosts = normalizeExtraEgressHosts(input.extraHosts);
  } catch (error) {
    if (error instanceof InvalidExtraEgressHostsError) {
      throw new CloudCodeValidationError(error.message);
    }
    throw error;
  }
  // Checked against the live catalogue in createCloudCodeSession, which can
  // await; this stays synchronous for the callers that only shape-check.
  const runtimeId = typeof input.runtimeId === 'string' ? input.runtimeId.trim() || null : null;
  return {
    requestId: input.requestId,
    title,
    repositoryUrl,
    networkAccess: input.networkAccess,
    workspacePath: repositoryUrl ? REPOSITORY_WORKSPACE_PATH : DEFAULT_WORKSPACE_PATH,
    runtimeId,
    repositoryBranch,
    extraHosts,
    harnessCredential: resolveExplicitHarnessCredential(runtimeId, input.harnessCredential),
  };
}

/**
 * A requested image must be one the account actually has.
 *
 * Rejected rather than quietly replaced with the default: a session built from
 * a different image than the one asked for is a silent lie about what the code
 * will run against.
 */
async function assertRuntimeIsAvailable(runtimeId: string | null): Promise<void> {
  if (!runtimeId) return;
  const runtimes = await listCloudCodeRuntimes();
  if (runtimes.some((runtime) => runtime.id === runtimeId)) return;
  throw new CloudCodeValidationError(
    runtimes.length === 0
      ? 'No sandbox images are available for this account, so one cannot be chosen.'
      : 'That sandbox image is not available for this account.',
  );
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

/**
 * The funding organization a session was created under, for a caller that
 * authenticates the user without already knowing it (the provider-proxy
 * route: a session-scoped bearer token, not a workspace-selecting browser
 * request). {@link getCloudCodeSession} cannot serve this, its own owner
 * filter requires the organization id as an input. Scoped by user id alone,
 * the same trust level {@link getE2BSession} already applies to this caller.
 */
export async function resolveCloudCodeSessionOwnerOrganizationId(
  db: DatabaseAdapter,
  userId: string,
  sessionId: string,
): Promise<string | null> {
  if (!UUID_RE.test(sessionId)) return null;
  const rows = await db.query<{ organization_id: string | null }>(
    `select organization_id
       from cloud_code_sessions
      where id = $1 and user_id = $2
      limit 1`,
    [sessionId, userId],
  );
  return rows[0]?.organization_id ?? null;
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
            run_lease_token = null,
            run_lease_expires_at = null,
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

/**
 * Every transition here leaves the session unleased, so `state = 'running'`
 * always implies a live lease row. Acquiring a lease is the one exception and
 * has its own statement in `claimCloudCodeSessionForRun`.
 *
 * `leaseToken`, when given, fences the write to the run that holds the session:
 * a run that has already been reclaimed matches no row and returns null instead
 * of trampling the new holder.
 */
async function transitionSessionState(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  expectedStates: CloudCodeSession['state'][],
  state: CloudCodeSession['state'],
  lastError: string | null,
  leaseToken?: string,
): Promise<CloudCodeSession | null> {
  const scoped = ownerSql(owner, 5);
  const rows = await db.query<SessionRow>(
    `update cloud_code_sessions
        set state = $2,
            last_error = $3,
            run_lease_token = null,
            run_lease_expires_at = null,
            updated_at = now()
      where id = $1
        and state = any($4::text[])
        and ${scoped.clause}${leaseToken ? ' and run_lease_token = $7' : ''}
      returning *`,
    [
      sessionId,
      state,
      lastError?.slice(0, MAX_ERROR_LENGTH) ?? null,
      expectedStates,
      ...scoped.params,
      ...(leaseToken ? [leaseToken] : []),
    ],
  );
  return rows[0] ? mapCloudCodeSession(rows[0]) : null;
}

async function failSessionIfOpen(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  message: string,
  leaseToken?: string,
): Promise<void> {
  await transitionSessionState(
    db,
    owner,
    sessionId,
    ['provisioning', 'ready', 'running'],
    'failed',
    message,
    leaseToken,
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

function sameExtraHosts(stored: string[] | null | undefined, requested: string[]): boolean {
  const storedSorted = [...(stored ?? [])].sort();
  const requestedSorted = [...requested].sort();
  return (
    storedSorted.length === requestedSorted.length &&
    storedSorted.every((host, index) => host === requestedSorted[index])
  );
}

function sameCreateRequest(row: SessionRow, input: ValidatedCreateInput): boolean {
  return (
    row.title === input.title &&
    row.repository_url === input.repositoryUrl &&
    row.network_access === input.networkAccess &&
    (row.runtime_id ?? null) === input.runtimeId &&
    (row.repository_branch ?? null) === input.repositoryBranch &&
    sameExtraHosts(row.extra_hosts, input.extraHosts)
  );
}

interface GitHubCloneCredential {
  username: string;
  password: string;
}

function parseGithubRepositoryUrl(url: string): { owner: string; repo: string } | null {
  const match = GITHUB_REPOSITORY_URL_RE.exec(url);
  return match ? { owner: match[1]!, repo: match[2]! } : null;
}

async function resolveGithubCloneCredential(
  userId: string,
  repositoryUrl: string,
): Promise<GitHubCloneCredential | null> {
  if (!isGitHubInstallationLinkingAvailable() || !isGitHubAppConfigured()) return null;
  const parsed = parseGithubRepositoryUrl(repositoryUrl);
  if (!parsed) return null;
  const installations = await getUserGithubInstallations(userId);
  if (installations.length === 0) return null;
  const match =
    installations.find(
      (installation) => installation.login.toLowerCase() === parsed.owner.toLowerCase(),
    ) ?? (installations.length === 1 ? installations[0] : undefined);
  if (!match) return null;
  const password = await getInstallationAccessToken(match.installationId);
  return { username: GITHUB_INSTALLATION_TOKEN_USERNAME, password };
}

export async function createCloudCodeSession(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  input: CreateCloudCodeSessionInput,
  planTier: string,
): Promise<CloudCodeSession> {
  const validated = validateCreateCloudCodeSession(input);
  try {
    await assertExtraEgressHostsResolveSafely(validated.extraHosts);
  } catch (error) {
    if (error instanceof InvalidExtraEgressHostsError) {
      throw new CloudCodeValidationError(error.message);
    }
    throw error;
  }
  await assertRuntimeIsAvailable(validated.runtimeId);

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
           network_access, state, workspace_path, runtime_id, repository_branch, extra_hosts
         ) values ($1, $2, $3, $4, $5, $6, 'provisioning', $7, $8, $9, $10)
         returning *`,
        [
          owner.userId,
          owner.organizationId,
          validated.requestId,
          validated.title,
          validated.repositoryUrl,
          validated.networkAccess,
          validated.workspacePath,
          validated.runtimeId,
          validated.repositoryBranch,
          validated.extraHosts,
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
    validated.runtimeId,
    validated.harnessCredential,
    validated.extraHosts,
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
    if (
      validated.runtimeId &&
      !validated.harnessCredential &&
      harnessIsProxyCovered(validated.runtimeId)
    ) {
      const configFile = harnessProxyConfigFile(validated.runtimeId);
      const spec = harnessCredentialSpecs(validated.runtimeId)[0];
      if (configFile && spec) {
        const baseUrl = providerProxyBaseUrl(sessionId);
        if (!baseUrl) {
          throw new CloudCodeUnavailableError('Coding agent proxy is not configured');
        }
        const write = await executor.writeFile({
          path: configFile.path,
          content: configFile.content(baseUrl, spec.envVar),
        });
        if (!write.ok) {
          throw new CloudCodeUnavailableError(
            write.error || 'Coding agent proxy configuration failed',
          );
        }
      }
    }
    if (validated.repositoryUrl) {
      if (!executor.git) {
        throw new CloudCodeUnavailableError('Managed Code environment cannot clone repositories');
      }
      const credential = await resolveGithubCloneCredential(owner.userId, validated.repositoryUrl);
      const clone = await executor.git.clone({
        url: validated.repositoryUrl,
        path: REPOSITORY_WORKSPACE_PATH,
        depth: 1,
        ...(validated.repositoryBranch ? { branch: validated.repositoryBranch } : {}),
        ...(credential ? credential : {}),
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

/**
 * Take the session for one run, under a lease that expires on its own.
 *
 * A claim succeeds when the session is `ready`, and also when it is `running`
 * on a lease that has already expired, the signature of a turn the platform
 * killed before its release could run. Reclaiming is safe because the new
 * holder's token replaces the old one in the same statement: if the previous
 * run somehow survives, every write it still attempts (release, or its failure
 * handler) is fenced on its own now-stale token and becomes a no-op. It cannot
 * mark the new run's session `ready` mid-turn, and it cannot mark it `failed`.
 *
 * The sandbox behind the session is addressed deterministically by
 * (user, session), so a reclaiming run attaches to the same sandbox the dead
 * run left rather than provisioning a second one.
 */
export async function claimCloudCodeSessionForRun(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
): Promise<CloudCodeRunClaim | null> {
  const leaseToken = randomUUID();
  const scoped = ownerSql(owner, 4);
  const rows = await db.query<SessionRow>(
    `update cloud_code_sessions
        set state = 'running',
            last_error = null,
            run_lease_token = $2,
            run_lease_expires_at = now() + make_interval(secs => $3),
            updated_at = now()
      where id = $1
        and ${scoped.clause}
        and (
          state = 'ready'
          or (
            state = 'running'
            -- A running row with no lease at all predates the lease columns, so
            -- it is wedged by definition; treat it as stale, not as a holder.
            and (run_lease_expires_at is null or run_lease_expires_at <= now())
          )
        )
      returning *`,
    [sessionId, leaseToken, CLOUD_CODE_RUN_LEASE_SECONDS, ...scoped.params],
  );
  const row = rows[0];
  return row ? { session: mapCloudCodeSession(row), leaseToken } : null;
}

export async function releaseCloudCodeSessionAfterRun(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  leaseToken: string,
): Promise<CloudCodeSession | null> {
  return transitionSessionState(db, owner, sessionId, ['running'], 'ready', null, leaseToken);
}

export async function runCloudCodeCommand(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  commandValue: unknown,
  planTier: string,
  signal?: AbortSignal,
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
  if (session.state === 'provisioning') {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  if (session.state === 'failed') {
    throw new CloudCodeConflictError('Failed Code sessions must be closed and recreated');
  }

  // `running` is deliberately not rejected here. The claim below is what
  // adjudicates it: a live lease still loses, but a session left running by a
  // killed turn becomes reclaimable once that lease expires.
  const claim = await claimCloudCodeSessionForRun(db, owner, sessionId);
  if (!claim) {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  const scope = managedCloudCodeSessionScope(
    owner.userId,
    sessionId,
    claim.session.networkAccess,
    planTier,
    claim.session.runtimeId,
    null,
    claim.session.extraHosts,
  );
  const startedAt = new Date();
  const executor = await getE2BExecutor(scope);
  if (!executor?.runCommand) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      'Managed Code environment could not be attached',
      claim.leaseToken,
    );
    throw new CloudCodeUnavailableError('Managed Code environment could not be attached');
  }

  try {
    const result = await executor.runCommand({
      command,
      cwd: claim.session.workspacePath,
      timeoutMs: resolveCloudCodeCommandDeadlineMs(command, knownHarnessCommandIds()),
      ...(signal ? { signal } : {}),
    });
    const completedAt = new Date();
    const scoped = ownerSql(owner, 3);
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
            set state = 'ready',
                last_error = null,
                run_lease_token = null,
                run_lease_expires_at = null,
                updated_at = now()
          where id = $1
            and state = 'running'
            and run_lease_token = $2
            and ${scoped.clause}
          returning *`,
        [sessionId, claim.leaseToken, ...scoped.params],
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
      claim.leaseToken,
    );
    throw error;
  } finally {
    await executor.pause?.();
    await executor.dispose();
  }
}

function validateNotebookCell(value: unknown): { code: string; language: NotebookCellLanguage } {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const code = typeof record['code'] === 'string' ? record['code'] : '';
  if (!code.trim() || code.length > MAX_NOTEBOOK_CELL_CODE_LENGTH || code.includes('\0')) {
    throw new CloudCodeValidationError(
      `Cell code must be 1–${MAX_NOTEBOOK_CELL_CODE_LENGTH} characters and contain no null bytes`,
    );
  }
  const language = typeof record['language'] === 'string' ? record['language'].trim() : 'python';
  if (!NOTEBOOK_CELL_LANGUAGES.includes(language as NotebookCellLanguage)) {
    throw new CloudCodeValidationError(
      `language must be one of ${NOTEBOOK_CELL_LANGUAGES.join(', ')}`,
    );
  }
  return { code, language: language as NotebookCellLanguage };
}

/** Returns the validated path relative to the session workspace; never a root-joined one. */
function confineNotebookPath(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : '';
  const confined = confineWorkspacePath(value);
  if (!confined) {
    throw new CloudCodeValidationError('path must be workspace-relative with no traversal');
  }
  return confined;
}

function notebookFileEntry(path: string, byteSize: number): CloudCodeNotebookFile {
  return { path, name: path.split('/').pop() || path, isDir: false, byteSize };
}

export async function runCloudCodeNotebookCell(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  cellValue: unknown,
  planTier: string,
): Promise<{
  session: CloudCodeSession;
  ok: boolean;
  outputs: NotebookCellOutput[];
  error?: string;
}> {
  const { code, language } = validateNotebookCell(cellValue);

  const session = await getCloudCodeSession(db, owner, sessionId);
  if (session.state === 'closed') {
    throw new CloudCodeConflictError('Closed Code sessions cannot run cells');
  }
  if (session.state === 'provisioning') {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  if (session.state === 'failed') {
    throw new CloudCodeConflictError('Failed Code sessions must be closed and recreated');
  }

  const claim = await claimCloudCodeSessionForRun(db, owner, sessionId);
  if (!claim) {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  const scope = managedCloudCodeSessionScope(
    owner.userId,
    sessionId,
    claim.session.networkAccess,
    planTier,
    claim.session.runtimeId,
    null,
    claim.session.extraHosts,
  );
  const executor = await getE2BExecutor(scope);
  if (!executor) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      'Managed Code environment could not be attached',
      claim.leaseToken,
    );
    throw new CloudCodeUnavailableError('Managed Code environment could not be attached');
  }

  try {
    const result = await executor.runCode({ language, code });
    const released = await releaseCloudCodeSessionAfterRun(db, owner, sessionId, claim.leaseToken);
    if (!released) throw new CloudCodeNotFoundError();
    return {
      session: released,
      ok: result.ok,
      outputs: result.outputs ?? [],
      ...(result.error ? { error: result.error } : {}),
    };
  } catch (error) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      error instanceof Error ? error.message : String(error),
      claim.leaseToken,
    );
    throw error;
  } finally {
    await executor.pause?.();
    await executor.dispose();
  }
}

export async function writeCloudCodeNotebookFile(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  pathValue: unknown,
  base64Content: string,
  planTier: string,
): Promise<{ session: CloudCodeSession; file: CloudCodeNotebookFile }> {
  const decoded = Buffer.from(base64Content, 'base64');
  if (decoded.length === 0 || decoded.length > MAX_NOTEBOOK_UPLOAD_BYTES) {
    throw new CloudCodeValidationError(
      `Uploaded file must be 1–${MAX_NOTEBOOK_UPLOAD_BYTES} bytes`,
    );
  }

  const session = await getCloudCodeSession(db, owner, sessionId);
  if (session.state === 'closed') {
    throw new CloudCodeConflictError('Closed Code sessions cannot accept files');
  }
  if (session.state === 'provisioning') {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  if (session.state === 'failed') {
    throw new CloudCodeConflictError('Failed Code sessions must be closed and recreated');
  }
  const relativePath = confineNotebookPath(pathValue);
  const absolutePath = `${session.workspacePath.replace(/\/+$/, '')}/${relativePath}`;

  const claim = await claimCloudCodeSessionForRun(db, owner, sessionId);
  if (!claim) {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  const scope = managedCloudCodeSessionScope(
    owner.userId,
    sessionId,
    claim.session.networkAccess,
    planTier,
    claim.session.runtimeId,
    null,
    claim.session.extraHosts,
  );
  const executor = await getE2BExecutor(scope);
  if (!executor) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      'Managed Code environment could not be attached',
      claim.leaseToken,
    );
    throw new CloudCodeUnavailableError('Managed Code environment could not be attached');
  }

  try {
    const result = await executor.writeFile({
      path: absolutePath,
      content: base64Content,
      encoding: 'base64',
    });
    if (!result.ok) {
      throw new CloudCodeUnavailableError(result.error || 'File upload failed');
    }
    const released = await releaseCloudCodeSessionAfterRun(db, owner, sessionId, claim.leaseToken);
    if (!released) throw new CloudCodeNotFoundError();
    return { session: released, file: notebookFileEntry(relativePath, decoded.length) };
  } catch (error) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      error instanceof Error ? error.message : String(error),
      claim.leaseToken,
    );
    throw error;
  } finally {
    await executor.pause?.();
    await executor.dispose();
  }
}

export async function listCloudCodeNotebookFiles(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  planTier: string,
): Promise<{ session: CloudCodeSession; files: CloudCodeNotebookFile[] }> {
  const session = await getCloudCodeSession(db, owner, sessionId);
  if (session.state === 'closed') {
    throw new CloudCodeConflictError('Closed Code sessions have no files to list');
  }
  if (session.state === 'provisioning') {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  if (session.state === 'failed') {
    throw new CloudCodeConflictError('Failed Code sessions must be closed and recreated');
  }

  const claim = await claimCloudCodeSessionForRun(db, owner, sessionId);
  if (!claim) {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  const scope = managedCloudCodeSessionScope(
    owner.userId,
    sessionId,
    claim.session.networkAccess,
    planTier,
    claim.session.runtimeId,
    null,
    claim.session.extraHosts,
  );
  const executor = await getE2BExecutor(scope);
  if (!executor?.listFiles) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      'Managed Code environment could not be attached',
      claim.leaseToken,
    );
    throw new CloudCodeUnavailableError('Managed Code environment could not be attached');
  }

  try {
    const entries = await executor.listFiles(claim.session.workspacePath);
    const released = await releaseCloudCodeSessionAfterRun(db, owner, sessionId, claim.leaseToken);
    if (!released) throw new CloudCodeNotFoundError();
    const workspacePrefix = `${claim.session.workspacePath.replace(/\/+$/, '')}/`;
    const files = (entries ?? [])
      .filter((entry) => !entry.isDir)
      .map((entry) => ({
        path: entry.path.startsWith(workspacePrefix)
          ? entry.path.slice(workspacePrefix.length)
          : entry.name,
        name: entry.name,
        isDir: entry.isDir,
        byteSize: entry.byteSize,
      }));
    return { session: released, files };
  } catch (error) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      error instanceof Error ? error.message : String(error),
      claim.leaseToken,
    );
    throw error;
  } finally {
    await executor.pause?.();
    await executor.dispose();
  }
}

export async function readCloudCodeNotebookFile(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  pathValue: unknown,
  planTier: string,
): Promise<{ session: CloudCodeSession; bytes: Uint8Array }> {
  const session = await getCloudCodeSession(db, owner, sessionId);
  if (session.state === 'closed') {
    throw new CloudCodeConflictError('Closed Code sessions have no files to read');
  }
  if (session.state === 'provisioning') {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  if (session.state === 'failed') {
    throw new CloudCodeConflictError('Failed Code sessions must be closed and recreated');
  }
  const relativePath = confineNotebookPath(pathValue);
  const absolutePath = `${session.workspacePath.replace(/\/+$/, '')}/${relativePath}`;

  const claim = await claimCloudCodeSessionForRun(db, owner, sessionId);
  if (!claim) {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  const scope = managedCloudCodeSessionScope(
    owner.userId,
    sessionId,
    claim.session.networkAccess,
    planTier,
    claim.session.runtimeId,
    null,
    claim.session.extraHosts,
  );
  const executor = await getE2BExecutor(scope);
  if (!executor?.readFileBytes) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      'Managed Code environment could not be attached',
      claim.leaseToken,
    );
    throw new CloudCodeUnavailableError('Managed Code environment could not be attached');
  }

  try {
    const bytes = await executor.readFileBytes(absolutePath);
    const released = await releaseCloudCodeSessionAfterRun(db, owner, sessionId, claim.leaseToken);
    if (!released) throw new CloudCodeNotFoundError();
    if (!bytes) throw new CloudCodeNotFoundError();
    return { session: released, bytes };
  } catch (error) {
    if (error instanceof CloudCodeNotFoundError) throw error;
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      error instanceof Error ? error.message : String(error),
      claim.leaseToken,
    );
    throw error;
  } finally {
    await executor.pause?.();
    await executor.dispose();
  }
}

export async function commitAndPushCloudCodeSession(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  planTier: string,
  messageValue: unknown,
): Promise<{ session: CloudCodeSession; push: CommandExecutionResult }> {
  const message = typeof messageValue === 'string' ? messageValue.trim() : '';
  if (!message || message.length > MAX_COMMIT_MESSAGE_LENGTH || message.includes('\0')) {
    throw new CloudCodeValidationError(
      `Commit message must be 1–${MAX_COMMIT_MESSAGE_LENGTH} characters and contain no null bytes`,
    );
  }

  const session = await getCloudCodeSession(db, owner, sessionId);
  if (!session.repositoryUrl) {
    throw new CloudCodeValidationError('Code session has no repository to push to');
  }
  if (session.state === 'closed') {
    throw new CloudCodeConflictError('Closed Code sessions cannot be pushed');
  }
  if (session.state === 'provisioning') {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  if (session.state === 'failed') {
    throw new CloudCodeConflictError('Failed Code sessions must be closed and recreated');
  }

  const credential = await resolveGithubCloneCredential(owner.userId, session.repositoryUrl);
  if (!credential) {
    throw new CloudCodeValidationError(
      'No connected GitHub installation can push to this repository',
    );
  }

  const claim = await claimCloudCodeSessionForRun(db, owner, sessionId);
  if (!claim) {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  const scope = managedCloudCodeSessionScope(
    owner.userId,
    sessionId,
    claim.session.networkAccess,
    planTier,
    claim.session.runtimeId,
    null,
    claim.session.extraHosts,
  );
  const executor = await getE2BExecutor(scope);
  if (!executor?.git) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      'Managed Code environment could not be attached',
      claim.leaseToken,
    );
    throw new CloudCodeUnavailableError('Managed Code environment could not be attached');
  }

  try {
    const add = await executor.git.add({ path: claim.session.workspacePath, all: true });
    if (!add.ok) {
      throw new CloudCodeUnavailableError(add.error || add.stderr || 'Staging changes failed');
    }
    const commit = await executor.git.commit({ path: claim.session.workspacePath, message });
    if (!commit.ok) {
      throw new CloudCodeUnavailableError(commit.error || commit.stderr || 'Commit failed');
    }
    const push = await executor.git.push({
      path: claim.session.workspacePath,
      username: credential.username,
      password: credential.password,
      timeoutMs: CLOUD_CODE_COMMAND_DEADLINE_MS,
    });
    if (!push.ok) {
      throw new CloudCodeUnavailableError(push.error || push.stderr || 'Push failed');
    }
    const released = await releaseCloudCodeSessionAfterRun(db, owner, sessionId, claim.leaseToken);
    if (!released) throw new CloudCodeNotFoundError();
    return { session: released, push };
  } catch (error) {
    await failSessionIfOpen(
      db,
      owner,
      sessionId,
      error instanceof Error ? error.message : String(error),
      claim.leaseToken,
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
