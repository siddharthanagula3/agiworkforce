/**
 * E2B executor factory: the live @e2b/code-interpreter binding.
 *
 * Gated + fail-closed: returns null unless E2B is configured (see ./gate.ts). When
 * configured, creates a resource-bounded sandbox session and returns an E2BExecutor
 * that proxies runCode / file ops to it. A failure at any step (SDK missing, sandbox
 * create error, op error) fails CLOSED, the router surfaces an explicit error to the
 * model, never a silent no-op and never a provider-native fallback.
 *
 * VERIFICATION NOTE: there is no E2B key in this environment, so the live sandbox
 * round-trip is unverified here, that step is the operator's once `E2B_API_KEY` is
 * set. The binding is typed against @e2b/code-interpreter@2.6.1 (confirmed against the
 * installed package's `dist/index.d.ts`, not assumed from docs/training data) and
 * defensive (optional chaining + try/catch) so an API-shape surprise degrades to
 * fail-closed.
 *
 * Session scope: when an authenticated tenant/user/conversation scope is passed, ONE
 * sandbox + one code-context per language is reused across every execution-tool call in
 * that owned conversation (state persists, variables/imports survive across turns).
 * The scoped mapping lives in Redis (./session-store.ts) so it survives across serverless
 * invocations without allowing a conversation id alone to resume another user's sandbox.
 * `pauseE2BSession()` (called by the tool loop at turn end)
 * stops billing while preserving state; the next request's `getE2BExecutor()` resumes
 * it via `Sandbox.connect()`, which auto-resumes a paused sandbox. `killE2BSession()`
 * (called on conversation delete, or as a safety net) releases it for good.
 *
 * Without a `conversationId` (e.g. a bare API caller with no conversation), the
 * executor is ephemeral: one sandbox per call, killed by the caller's `dispose()`.
 * byte-for-byte the original Phase-B-scaffold behavior.
 */
import 'server-only';

import {
  getPlanMaxSandboxes,
  getPlanSandboxTtlMs,
  type CloudCodeNetworkAccess,
  type NotebookCellOutput,
} from '@agiworkforce/types';
import { CLOUD_CODE_HARNESS_COMMAND_DEADLINE_MS } from '@/lib/deadline-policy';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { buildServerProviderAdapter } from '@/lib/services/provider-adapter-service';
import {
  MAX_EXECUTION_OUTPUT_BYTES,
  type CommandExecutionResult,
  type E2BExecutor,
  type ExecutionResult,
  type SandboxFileEntry,
} from './types';
import { e2bExecutionEnabled } from './gate';
import type { E2BUnavailableCause } from './unavailability';
import {
  harnessCredentialSpecs,
  harnessIsProxyCovered,
  harnessProxyBaseUrlEnv,
  templateVcpuCount,
  type HarnessCredentialSpec,
} from './templates';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { egressNeedsProxy } from './network-policy';
import { providerProxyBaseUrl, providerProxyHost } from './provider-proxy';
import { mintProviderProxyToken } from './provider-proxy-token';
import {
  E2B_COMPUTE_RATE_ENV,
  meterSandboxComputeInterval,
  sandboxComputeIsPriceable,
} from './compute-metering';
import {
  CHAT_SANDBOX_NETWORK_ACCESS,
  getE2BSession,
  saveE2BSession,
  deleteE2BSession,
  withUserSandboxLock,
  type E2BSession,
  type StoredContext,
  type E2BSessionScope,
} from './session-store';

const E2B_SANDBOX_TIMEOUT_MS = 60_000;

const E2B_CONVERSATION_TIMEOUT_MS = 10 * 60_000;
const E2B_COMMAND_TIMEOUT_MS = 60_000;
const E2B_MAX_COMMAND_TIMEOUT_MS = CLOUD_CODE_HARNESS_COMMAND_DEADLINE_MS;
const ALL_OUTBOUND_TRAFFIC = '0.0.0.0/0';
const TRUSTED_CODE_HOSTS = [
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'registry.npmjs.org',
  'npmjs.com',
  'pypi.org',
  'files.pythonhosted.org',
] as const;

/**
 * GOV-4: the per-user sandbox allowance and conversation lifetime are plan
 * dimensions (`BILLING_PLAN_PRODUCT_LIMITS.maxSandboxes` / `.sandboxTtlMs`).
 * Plans grant 0–5 slots under the absolute five-per-user safety ceiling.
 *
 * The old implementation granted the same five slots and flat 10-minute
 * lifetime to every tier, including Free. The catalog now denies unsupported
 * tiers, gives Basic fewer slots, and scales lifetime with the plan while
 * preserving that hard ceiling.
 *
 * Only scoped (authenticated) sandboxes are counted and enforced; ephemeral
 * bare-API sandboxes self-dispose within `E2B_SANDBOX_TIMEOUT_MS`.
 */
function resolveSandboxLimits(planTier: string | null | undefined): {
  maxSandboxes: number;
  ttlMs: number;
} {
  return {
    maxSandboxes: getPlanMaxSandboxes(planTier),
    ttlMs: getPlanSandboxTtlMs(planTier),
  };
}

async function resolveScopePlanTier(scope: E2BSessionScope): Promise<string | null> {
  if (scope.planTier) return scope.planTier;
  try {
    const subscription = await SubscriptionService.getSubscription(
      createClaimedUserScopedDb(getNeonDb(), { userId: scope.userId, organizationId: null }),
      scope.userId,
    );
    return subscription?.plan_tier ?? 'free';
  } catch (err) {
    logger.error(
      { err, userId: scope.userId },
      '[e2b] plan lookup failed; refusing to create managed compute (fail-closed)',
    );
    return null;
  }
}

type E2BLanguage = 'python' | 'javascript' | 'typescript' | 'r' | 'java' | 'bash';

function mapLanguage(language: string): E2BLanguage {
  const l = language.trim().toLowerCase();
  if (l === 'node' || l === 'js' || l === 'javascript') return 'javascript';
  if (l === 'ts' || l === 'typescript') return 'typescript';
  if (l === 'r' || l === 'java' || l === 'bash' || l === 'python') return l;
  return 'python';
}

async function importSandbox(): Promise<typeof import('@e2b/code-interpreter').Sandbox | null> {
  try {
    const { Sandbox } = await import('@e2b/code-interpreter');
    return Sandbox;
  } catch (err) {
    logger.warn({ err }, '[e2b] @e2b/code-interpreter unavailable; fail-closed');
    return null;
  }
}

async function countUserSandboxes(
  Sandbox: NonNullable<Awaited<ReturnType<typeof importSandbox>>>,
  userId: string,
  stopAt: number,
): Promise<number> {
  const paginator = Sandbox.list({
    query: { metadata: { userId }, state: ['running', 'paused'] },
  });
  let count = 0;
  while (paginator.hasNext && count < stopAt) {
    const page = await paginator.nextItems();
    count += page.length;
  }
  return count;
}

/**
 * Free the slot held by this user's least recently started PAUSED sandbox.
 * Returns whether one was killed. A running sandbox is never touched: it may
 * be another turn's, and only a paused one is certainly idle.
 */
async function evictColdestPausedSandbox(
  Sandbox: NonNullable<Awaited<ReturnType<typeof importSandbox>>>,
  requestingScope: E2BSessionScope,
): Promise<boolean> {
  const { userId } = requestingScope;
  let coldest: { sandboxId: string; startedAt: Date; metadata: Record<string, string> } | null =
    null;
  try {
    const paginator = Sandbox.list({
      query: { metadata: { userId }, state: ['paused'] },
    });
    while (paginator.hasNext) {
      const page = await paginator.nextItems();
      for (const info of page) {
        if (!coldest || info.startedAt.getTime() < coldest.startedAt.getTime()) {
          coldest = {
            sandboxId: info.sandboxId,
            startedAt: info.startedAt,
            metadata: info.metadata ?? {},
          };
        }
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, '[e2b] could not list paused sandboxes to free a slot');
    return false;
  }

  if (!coldest) return false;

  try {
    await Sandbox.kill(coldest.sandboxId);
  } catch (err) {
    logger.warn(
      { err, userId, sandboxId: coldest.sandboxId },
      '[e2b] could not kill the coldest paused sandbox',
    );
    return false;
  }

  // The slot is already free. Clearing the stale mapping is bookkeeping, so a
  // failure here must not turn a successful eviction into a refused turn.
  try {
    const evictedScope = pausedSandboxScope(requestingScope, coldest.metadata);
    if (evictedScope) {
      const mapped = await getE2BSession(evictedScope);
      if (mapped?.sandboxId === coldest.sandboxId) await deleteE2BSession(evictedScope);
    }
  } catch (err) {
    logger.warn(
      { err, userId, sandboxId: coldest.sandboxId },
      '[e2b] evicted sandbox mapping was not cleared',
    );
  }
  logger.info(
    { userId, sandboxId: coldest.sandboxId, startedAt: coldest.startedAt.toISOString() },
    '[e2b] freed a sandbox slot by killing the coldest paused sandbox',
  );
  return true;
}

/**
 * The evicted sandbox belongs to the same tenant and user as the caller, so the
 * scope is rebuilt from theirs rather than from a tenant constant this module
 * would otherwise have to import.
 */
function pausedSandboxScope(
  requestingScope: E2BSessionScope,
  metadata: Record<string, string>,
): E2BSessionScope | null {
  const { tenantId, userId } = requestingScope;
  const conversationId = metadata['conversationId'];
  if (conversationId) return { tenantId, userId, conversationId };
  const codeSessionId = metadata['codeSessionId'];
  if (codeSessionId) {
    return { tenantId, userId, resource: { kind: 'code_session', id: codeSessionId } };
  }
  return null;
}

interface NotebookResultLike {
  text?: string;
  html?: string;
  png?: string;
}

interface NotebookErrorLike {
  name: string;
  value: string;
  traceback?: string;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const buffer = Buffer.from(base64, 'base64');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Ordered outputs for a notebook cell: stdout/stderr first, then one output
 * per result (its richest representation - image over table over text), then
 * the error last if the cell raised. Mirrors how a Jupyter client renders a
 * cell's stream and display-data messages in the order they arrived.
 */
function notebookOutputs(
  stdout: string,
  stderr: string,
  results: readonly NotebookResultLike[],
  error?: NotebookErrorLike,
): NotebookCellOutput[] {
  const outputs: NotebookCellOutput[] = [];
  if (stdout) outputs.push({ kind: 'stream', data: stdout });
  if (stderr) outputs.push({ kind: 'stream', data: stderr });
  for (const result of results) {
    if (result?.png) outputs.push({ kind: 'image', data: result.png });
    else if (result?.html) outputs.push({ kind: 'html', data: result.html });
    else if (result?.text) outputs.push({ kind: 'stream', data: result.text });
  }
  if (error) {
    const traceback = error.traceback ? `\n${error.traceback}` : '';
    outputs.push({ kind: 'error', data: `${error.name}: ${error.value}${traceback}` });
  }
  return outputs;
}

const fail = (err: unknown): ExecutionResult => ({
  ok: false,
  output: '',
  error: err instanceof Error ? err.message : String(err),
});

function scopeAttribution(scope: E2BSessionScope): {
  conversationId?: string;
  codeSessionId?: string;
} {
  return {
    ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
    ...(scope.resource?.kind === 'code_session' ? { codeSessionId: scope.resource.id } : {}),
  };
}

function scopeLog(scope: E2BSessionScope | undefined): Record<string, string | undefined> {
  return {
    conversationId: scope?.conversationId,
    resourceKind: scope?.resource?.kind,
    resourceId: scope?.resource?.id,
  };
}

function resolveManagedHarnessCredentialValue(providerId: string): string | undefined {
  try {
    return buildServerProviderAdapter(providerId).config.apiKey;
  } catch (err) {
    logger.warn({ err, providerId }, '[e2b] no managed credential for harness provider');
    return undefined;
  }
}

function resolveProxiedHarnessEnvs(
  scope: E2BSessionScope & { resource: { kind: 'code_session'; id: string } },
  template: string,
  spec: HarnessCredentialSpec,
  sandboxTimeoutMs: number,
): Record<string, string> | undefined {
  const baseUrl = providerProxyBaseUrl(scope.resource.id);
  if (!baseUrl) {
    logger.error(
      { ...scopeLog(scope), template },
      '[e2b] provider-proxy base URL is unavailable (NEXT_PUBLIC_APP_URL unset); omitting the harness credential',
    );
    return undefined;
  }
  const token = mintProviderProxyToken(
    { sessionId: scope.resource.id, userId: scope.userId, providerId: spec.providerId },
    sandboxTimeoutMs,
  );
  const baseUrlEnvVar = harnessProxyBaseUrlEnv(template);
  return { [spec.envVar]: token, ...(baseUrlEnvVar ? { [baseUrlEnvVar]: baseUrl } : {}) };
}

function resolveHarnessEnvs(
  scope: E2BSessionScope | undefined,
  template: string | null,
  sandboxTimeoutMs: number,
): Record<string, string> | undefined {
  if (!scope || !template) return undefined;
  if (scope.explicitCredential) {
    return { [scope.explicitCredential.envVar]: scope.explicitCredential.value };
  }
  const specs = harnessCredentialSpecs(template);
  if (specs.length === 0) return undefined;
  if (scope.resource?.kind === 'code_session') {
    if (!harnessIsProxyCovered(template)) {
      logger.warn(
        { ...scopeLog(scope), template },
        '[e2b] harness has no verified credential proxy; withholding the managed key rather than injecting it unproxied',
      );
      return undefined;
    }
    return resolveProxiedHarnessEnvs(
      scope as E2BSessionScope & { resource: { kind: 'code_session'; id: string } },
      template,
      specs[0]!,
      sandboxTimeoutMs,
    );
  }
  const envs: Record<string, string> = {};
  for (const spec of specs) {
    const value = resolveManagedHarnessCredentialValue(spec.providerId);
    if (value) envs[spec.envVar] = value;
  }
  return Object.keys(envs).length > 0 ? envs : undefined;
}

function resolveAllowOutHosts(
  networkAccess: CloudCodeNetworkAccess,
  extraHosts: readonly string[] | undefined,
): string[] {
  const hosts = new Set<string>();
  const proxyHost = providerProxyHost();
  if (proxyHost) hosts.add(proxyHost);
  if (networkAccess === 'trusted') {
    for (const host of TRUSTED_CODE_HOSTS) hosts.add(host);
  }
  for (const host of extraHosts ?? []) hosts.add(host);
  return [...hosts];
}

function createNetworkOptions(
  scope: E2BSessionScope | undefined,
  extraHosts?: readonly string[],
): {
  allowInternetAccess?: boolean;
  network?: { allowOut?: string[]; denyOut?: string[] };
} {
  // A sandbox with no declared policy inherits the chat-sandbox default
  // ('trusted': a github/npm/pypi allowlist over deny-all egress) rather than the
  // SDK's internet-open default. This covers both a scope-less sandbox and a
  // scoped chat conversation that declares no networkAccess, so execute_code can
  // still install packages while arbitrary exfiltration stays blocked.
  const networkAccess = scope?.networkAccess ?? CHAT_SANDBOX_NETWORK_ACCESS;
  if (networkAccess === 'full') return { allowInternetAccess: true };
  const allowOut = resolveAllowOutHosts(networkAccess, extraHosts);
  if (allowOut.length === 0) return { allowInternetAccess: false };
  return { network: { allowOut, denyOut: [ALL_OUTBOUND_TRAFFIC] } };
}

function updateNetworkOptions(
  scope: E2BSessionScope,
  extraHosts?: readonly string[],
): {
  allowInternetAccess?: boolean;
  allowOut?: string[];
  denyOut?: string[];
} {
  const networkAccess = scope.networkAccess ?? CHAT_SANDBOX_NETWORK_ACCESS;
  if (networkAccess === 'full') return { allowInternetAccess: true };
  const allowOut = resolveAllowOutHosts(networkAccess, extraHosts);
  if (allowOut.length === 0) return { allowInternetAccess: false };
  return { allowOut, denyOut: [ALL_OUTBOUND_TRAFFIC] };
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  const bytes = Buffer.from(value, 'utf8').subarray(0, maxBytes);
  return `${bytes.toString('utf8')}\n[output truncated]`;
}

function commandResult(
  stdoutValue: unknown,
  stderrValue: unknown,
  exitCodeValue: unknown,
  errorValue?: unknown,
): CommandExecutionResult {
  const perStreamLimit = Math.floor(MAX_EXECUTION_OUTPUT_BYTES / 2);
  const stdout = truncateUtf8(typeof stdoutValue === 'string' ? stdoutValue : '', perStreamLimit);
  const stderr = truncateUtf8(typeof stderrValue === 'string' ? stderrValue : '', perStreamLimit);
  const exitCode = Number.isInteger(exitCodeValue) ? Number(exitCodeValue) : 1;
  const error =
    typeof errorValue === 'string' && errorValue.trim()
      ? errorValue
      : exitCode === 0
        ? undefined
        : `Command exited with status ${exitCode}`;
  return {
    ok: exitCode === 0,
    output: [stdout, stderr].filter(Boolean).join('\n') || '(no output)',
    stdout,
    stderr,
    exitCode,
    ...(error ? { error } : {}),
  };
}

function commandCatchResult(err: unknown): CommandExecutionResult {
  const commandError = err as {
    stdout?: unknown;
    stderr?: unknown;
    exitCode?: unknown;
    error?: unknown;
    message?: unknown;
  };
  return commandResult(
    commandError.stdout,
    commandError.stderr,
    commandError.exitCode,
    commandError.error ?? commandError.message,
  );
}

export async function pauseE2BSession(scope: E2BSessionScope): Promise<void> {
  const session = await getE2BSession(scope);
  if (!session) return;
  const Sandbox = await importSandbox();
  if (!Sandbox) return;
  try {
    await Sandbox.pause(session.sandboxId);
  } catch (err) {
    logger.warn({ err, ...scopeLog(scope) }, '[e2b] pause failed');
  }
  await closeBillableInterval(scope, session, 'pause');
}

async function closeBillableInterval(
  scope: E2BSessionScope,
  session: E2BSession,
  reason: 'pause' | 'kill' | 'reclaim',
): Promise<void> {
  const startedAtMs = session.activeSinceMs;
  if (typeof startedAtMs !== 'number') return;

  const vcpuCount = (await templateVcpuCount(session.templateId ?? scope.templateId)) ?? undefined;
  await meterSandboxComputeInterval({
    userId: scope.userId,
    sandboxId: session.sandboxId,
    ...scopeAttribution(scope),
    vcpuCount,
    startedAtMs,
    endedAtMs: Date.now(),
    reason,
  });

  if (reason === 'pause') {
    const { activeSinceMs: _closed, ...rest } = session;
    await saveE2BSession(scope, rest);
  }
}

export { closeBillableInterval };

async function releaseUnreachableSandbox(
  scope: E2BSessionScope,
  session: E2BSession,
): Promise<void> {
  await closeBillableInterval(scope, session, 'kill');
  try {
    const Sandbox = await importSandbox();
    if (Sandbox) await Sandbox.kill(session.sandboxId);
  } catch (err) {
    logger.warn(
      { err, sandboxId: session.sandboxId, ...scopeLog(scope) },
      '[e2b] unreachable sandbox could not be released; the reclaim sweeper is the backstop',
    );
  }
  await deleteE2BSession(scope);
}

/**
 * Permanently release the conversation's sandbox (conversation deleted, or an idle
 * safety net). Best-effort; also clears the Redis mapping so nothing tries to resume a
 * killed sandbox.
 */
export async function killE2BSession(scope: E2BSessionScope): Promise<void> {
  const session = await getE2BSession(scope);
  if (!session) {
    await deleteE2BSession(scope);
    return;
  }
  await closeBillableInterval(scope, session, 'kill');
  try {
    const Sandbox = await importSandbox();
    if (Sandbox) await Sandbox.kill(session.sandboxId);
  } catch (err) {
    logger.warn({ err, ...scopeLog(scope) }, '[e2b] kill failed');
  } finally {
    await deleteE2BSession(scope);
  }
}

export async function getE2BExecutor(
  scope?: E2BSessionScope,
  onUnavailable?: (cause: E2BUnavailableCause) => void,
): Promise<E2BExecutor | null> {
  const unavailable = (cause: E2BUnavailableCause): null => {
    onUnavailable?.(cause);
    return null;
  };
  if (!e2bExecutionEnabled()) return unavailable('not-configured');

  if (!sandboxComputeIsPriceable()) {
    logger.error(
      { env: E2B_COMPUTE_RATE_ENV, ...(scope ? scopeLog(scope) : {}) },
      '[e2b] sandbox compute has no configured price; refusing to provision (fail-closed)',
    );
    return unavailable('not-configured');
  }

  const conversationId = scope?.conversationId;
  const codeSessionId = scope?.resource?.kind === 'code_session' ? scope.resource.id : undefined;

  const Sandbox = await importSandbox();
  if (!Sandbox) return unavailable('not-configured');
  const SandboxCtor = Sandbox;

  type SandboxInstance = InstanceType<typeof Sandbox>;

  const existingSession = scope ? await getE2BSession(scope) : null;

  let planTier: string | null = null;
  let maxSandboxes: number | null = null;
  let planTtlMs = 0;
  if (scope) {
    planTier = await resolveScopePlanTier(scope);
    if (planTier === null) return unavailable('no-capacity');
    const limits = resolveSandboxLimits(planTier);
    maxSandboxes = limits.maxSandboxes;
    planTtlMs = limits.ttlMs;
    if (maxSandboxes !== null && maxSandboxes <= 0) {
      logger.warn(
        { userId: scope.userId, planTier, ...scopeLog(scope) },
        '[e2b] plan does not include managed sandboxes; refusing (fail-closed)',
      );
      return unavailable('no-capacity');
    }
    if (planTtlMs <= 0) {
      logger.warn(
        { userId: scope.userId, planTier, ...scopeLog(scope) },
        '[e2b] plan grants no managed sandbox lifetime; refusing (fail-closed)',
      );
      return unavailable('no-capacity');
    }
  }

  const sandboxTimeoutMs = scope
    ? planTtlMs || E2B_CONVERSATION_TIMEOUT_MS
    : E2B_SANDBOX_TIMEOUT_MS;
  const metadata: Record<string, string> = {};
  if (conversationId) metadata['conversationId'] = conversationId;
  if (codeSessionId) metadata['codeSessionId'] = codeSessionId;
  if (scope?.userId) metadata['userId'] = scope.userId;
  const template = scope?.templateId?.trim() || null;
  if (
    scope &&
    egressNeedsProxy(
      scope.networkAccess ?? CHAT_SANDBOX_NETWORK_ACCESS,
      template,
      Boolean(scope.explicitCredential),
      scope.extraHosts?.length ?? 0,
    )
  ) {
    logger.warn(
      { ...scopeLog(scope), template },
      '[e2b] refusing widened egress: a managed credential would enter the sandbox unproxied (fail-closed)',
    );
    return unavailable('policy');
  }
  const harnessEnvs = resolveHarnessEnvs(scope, template, sandboxTimeoutMs);
  const extraHosts = scope?.extraHosts ?? existingSession?.extraHosts;
  const createOpts = scope
    ? {
        timeoutMs: sandboxTimeoutMs,
        lifecycle: { onTimeout: 'pause' as const },
        metadata,
        ...(harnessEnvs ? { envs: harnessEnvs } : {}),
        ...createNetworkOptions(scope, extraHosts),
      }
    : { timeoutMs: sandboxTimeoutMs, metadata, ...createNetworkOptions(scope) };

  async function createFresh(): Promise<SandboxInstance | null> {
    const create = async (): Promise<SandboxInstance | null> => {
      try {
        // Sandbox.create is overloaded: (opts) uses the SDK's default image,
        // (template, opts) picks one. The id reaching here has already been
        // matched against the account's catalogue, so it is never client text.
        const sandbox = template
          ? await SandboxCtor.create(template, createOpts)
          : await SandboxCtor.create(createOpts);
        return sandbox as SandboxInstance;
      } catch (err) {
        logger.warn({ err, template }, '[e2b] sandbox create failed; fail-closed');
        onUnavailable?.('no-capacity');
        return null;
      }
    };

    if (!scope?.userId || maxSandboxes === null) return create();

    const limit = maxSandboxes;
    const guarded = await withUserSandboxLock(scope, async () => {
      try {
        let live = await countUserSandboxes(SandboxCtor, scope.userId, limit);
        // A paused sandbox costs nothing to run but still holds a slot, so a
        // user who ran code in `limit` conversations loses code execution
        // entirely until the day-old reaper catches up. Its state is a cache,
        // not the conversation, so the coldest one gives up its slot rather
        // than the turn giving up.
        if (live >= limit) {
          const evicted = await evictColdestPausedSandbox(SandboxCtor, scope);
          if (evicted) live = await countUserSandboxes(SandboxCtor, scope.userId, limit);
        }
        if (live >= limit) {
          logger.warn(
            { userId: scope.userId, live, limit, planTier, ...scopeLog(scope) },
            '[e2b] per-user sandbox quota reached; refusing new sandbox (fail-closed)',
          );
          onUnavailable?.('no-capacity');
          return null;
        }
      } catch (err) {
        logger.error(
          { err, userId: scope.userId, planTier },
          '[e2b] sandbox quota check failed; refusing new sandbox (fail-closed)',
        );
        onUnavailable?.('no-capacity');
        return null;
      }
      return create();
    });

    if (!guarded.locked) {
      logger.warn(
        { userId: scope.userId, ...scopeLog(scope) },
        '[e2b] could not serialise sandbox creation; refusing (fail-closed)',
      );
      onUnavailable?.('no-capacity');
      return null;
    }
    return guarded.result ?? null;
  }

  let sandbox: SandboxInstance;
  let sandboxId: string;
  const contexts: Record<string, StoredContext> = { ...(existingSession?.contexts ?? {}) };
  let activeSinceMs: number | undefined;

  if (scope && existingSession) {
    try {
      sandbox = (await Sandbox.connect(existingSession.sandboxId, {
        timeoutMs: sandboxTimeoutMs,
      })) as SandboxInstance;
      sandboxId = existingSession.sandboxId;
    } catch (err) {
      logger.warn(
        { err, sandboxId: existingSession.sandboxId, ...scopeLog(scope) },
        '[e2b] resume failed; releasing the unreachable sandbox before creating a fresh one',
      );
      await releaseUnreachableSandbox(scope, existingSession);
      for (const key of Object.keys(contexts)) delete contexts[key];
      const fresh = await createFresh();
      if (!fresh) return null;
      sandbox = fresh;
      sandboxId = fresh.sandboxId;
    }
  } else {
    const fresh = await createFresh();
    if (!fresh) return null;
    sandbox = fresh;
    sandboxId = fresh.sandboxId;
  }

  if (scope?.resource?.kind === 'code_session') {
    try {
      await sandbox.updateNetwork(updateNetworkOptions(scope, extraHosts));
    } catch (err) {
      logger.error(
        { err, userId: scope.userId, codeSessionId, networkAccess: scope.networkAccess },
        '[e2b] code-session network policy could not be enforced; refusing executor',
      );
      onUnavailable?.('policy');
      try {
        await Sandbox.pause(sandboxId);
      } catch {
        // The plan timeout remains the billing and lifecycle backstop.
      }
      return null;
    }
  }

  async function persistSession(): Promise<void> {
    if (!scope) return;
    const session: E2BSession = {
      sandboxId,
      contexts,
      ...(activeSinceMs !== undefined ? { activeSinceMs } : {}),
      ...(scope.networkAccess ? { networkAccess: scope.networkAccess } : {}),
      ...(extraHosts && extraHosts.length > 0 ? { extraHosts } : {}),
      ...(template ? { templateId: template } : {}),
    };
    await saveE2BSession(scope, session);
  }

  activeSinceMs = Date.now();
  await persistSession();

  async function getContext(language: E2BLanguage): Promise<StoredContext> {
    const cached = contexts[language];
    if (cached) return cached;
    const ctx = await sandbox.createCodeContext({ language });
    const stored: StoredContext = { id: ctx.id, language: ctx.language, cwd: ctx.cwd };
    contexts[language] = stored;
    await persistSession();
    return stored;
  }

  return {
    async runCode({ language, code }): Promise<ExecutionResult> {
      try {
        const lang = mapLanguage(language);
        // A notebook cell needs the variables a prior cell defined, so a code
        // session's own id persists a context exactly as a chat conversation's
        // id already did; only a scope-less bare-API call stays stateless.
        const context = conversationId || codeSessionId ? await getContext(lang) : undefined;
        const execution = context
          ? await sandbox.runCode(code, {
              context: { id: context.id, language: context.language, cwd: context.cwd },
            })
          : await sandbox.runCode(code, { language: lang });
        const stdout = (execution.logs?.stdout ?? []).join('');
        const stderr = (execution.logs?.stderr ?? []).join('');
        if (execution.error) {
          const traceback = execution.error.traceback ? `\n${execution.error.traceback}` : '';
          return {
            ok: false,
            output: stdout,
            error: `${execution.error.name}: ${execution.error.value}${traceback}`,
            outputs: notebookOutputs(stdout, stderr, [], execution.error),
          };
        }
        const output = [stdout, stderr, execution.text ?? ''].filter(Boolean).join('\n');
        const results = (execution.results ?? []) as NotebookResultLike[];
        const pngResults = results
          .map((r) => r?.png)
          .filter((png): png is string => typeof png === 'string' && png.length > 0);
        return {
          ok: true,
          output: output || '(no output)',
          ...(pngResults.length > 0 ? { pngResults } : {}),
          outputs: notebookOutputs(stdout, stderr, results),
        };
      } catch (err) {
        return fail(err);
      }
    },
    async writeFile({ path, content, encoding }): Promise<ExecutionResult> {
      try {
        await sandbox.files.write(
          path,
          encoding === 'base64' ? base64ToArrayBuffer(content) : content,
        );
        return { ok: true, output: `Wrote ${path}` };
      } catch (err) {
        return fail(err);
      }
    },
    async createFolder({ path }): Promise<ExecutionResult> {
      try {
        await sandbox.files.makeDir(path);
        return { ok: true, output: `Created ${path}` };
      } catch (err) {
        return fail(err);
      }
    },
    async runCommand({ command, cwd, timeoutMs, signal }): Promise<CommandExecutionResult> {
      try {
        const result = await sandbox.commands.run(command, {
          ...(cwd ? { cwd } : {}),
          ...(harnessEnvs ? { envs: harnessEnvs } : {}),
          ...(signal ? { signal } : {}),
          timeoutMs: Math.min(
            E2B_MAX_COMMAND_TIMEOUT_MS,
            Math.max(1_000, timeoutMs ?? E2B_COMMAND_TIMEOUT_MS),
          ),
        });
        return commandResult(result.stdout, result.stderr, result.exitCode, result.error);
      } catch (err) {
        return commandCatchResult(err);
      }
    },
    git: {
      async clone({
        url,
        path,
        branch,
        depth,
        username,
        password,
        timeoutMs,
      }): Promise<CommandExecutionResult> {
        try {
          const result = await sandbox.git.clone(url, {
            path,
            ...(branch ? { branch } : {}),
            ...(depth !== undefined ? { depth } : {}),
            ...(username ? { username } : {}),
            ...(password ? { password } : {}),
            timeoutMs: Math.min(
              E2B_MAX_COMMAND_TIMEOUT_MS,
              Math.max(1_000, timeoutMs ?? E2B_COMMAND_TIMEOUT_MS),
            ),
          });
          return commandResult(result.stdout, result.stderr, result.exitCode, result.error);
        } catch (err) {
          return commandCatchResult(err);
        }
      },
      async add({ path, all }): Promise<CommandExecutionResult> {
        try {
          const result = await sandbox.git.add(path, { ...(all ? { all } : {}) });
          return commandResult(result.stdout, result.stderr, result.exitCode, result.error);
        } catch (err) {
          return commandCatchResult(err);
        }
      },
      async commit({ path, message, authorName, authorEmail }): Promise<CommandExecutionResult> {
        try {
          const result = await sandbox.git.commit(path, message, {
            ...(authorName ? { authorName } : {}),
            ...(authorEmail ? { authorEmail } : {}),
          });
          return commandResult(result.stdout, result.stderr, result.exitCode, result.error);
        } catch (err) {
          return commandCatchResult(err);
        }
      },
      async push({
        path,
        remote,
        branch,
        username,
        password,
        timeoutMs,
      }): Promise<CommandExecutionResult> {
        try {
          const result = await sandbox.git.push(path, {
            ...(remote ? { remote } : {}),
            ...(branch ? { branch } : {}),
            ...(username ? { username } : {}),
            ...(password ? { password } : {}),
            timeoutMs: Math.min(
              E2B_MAX_COMMAND_TIMEOUT_MS,
              Math.max(1_000, timeoutMs ?? E2B_COMMAND_TIMEOUT_MS),
            ),
          });
          return commandResult(result.stdout, result.stderr, result.exitCode, result.error);
        } catch (err) {
          return commandCatchResult(err);
        }
      },
    },
    async listFiles(path): Promise<SandboxFileEntry[] | null> {
      try {
        const entries = await sandbox.files.list(path);
        return entries.map((e) => ({
          path: e.path,
          name: e.name,
          isDir: e.type === 'dir',
          byteSize: typeof e.size === 'number' ? e.size : 0,
        }));
      } catch (err) {
        logger.warn({ err, path }, '[e2b] listFiles failed');
        return null;
      }
    },
    async readFileBytes(path): Promise<Uint8Array | null> {
      try {
        return await sandbox.files.read(path, { format: 'bytes' });
      } catch (err) {
        logger.warn({ err, path }, '[e2b] readFileBytes failed');
        return null;
      }
    },
    async pause(): Promise<void> {
      if (!scope) return;
      const intervalStartedAtMs = activeSinceMs;
      activeSinceMs = undefined;
      try {
        await persistSession();
      } catch (err) {
        logger.warn({ err, ...scopeLog(scope) }, '[e2b] persistSession before pause failed');
      }
      try {
        await Sandbox.pause(sandboxId);
      } catch (err) {
        logger.warn({ err, ...scopeLog(scope) }, '[e2b] pause (live handle) failed');
      }
      if (intervalStartedAtMs !== undefined) {
        await meterSandboxComputeInterval({
          userId: scope.userId,
          sandboxId,
          ...scopeAttribution(scope),
          vcpuCount: (await templateVcpuCount(template)) ?? undefined,
          startedAtMs: intervalStartedAtMs,
          endedAtMs: Date.now(),
          reason: 'pause',
        });
      }
    },
    async dispose(): Promise<void> {
      if (scope) {
        await persistSession();
        return;
      }
      try {
        await sandbox.kill();
      } catch (err) {
        logger.warn({ err }, '[e2b] sandbox kill failed');
      }
      // GOV-5: an ephemeral sandbox has no authenticated scope, so its seconds
      // cannot be attributed to a ledger. It is instead bounded to
      // E2B_SANDBOX_TIMEOUT_MS and killed here, the exposure is one minute of
      // compute per bare-API call, not an open-ended meter.
    },
  };
}
