/**
 * E2B executor factory — the live @e2b/code-interpreter binding.
 *
 * Gated + fail-closed: returns null unless E2B is configured (see ./gate.ts). When
 * configured, creates a resource-bounded sandbox session and returns an E2BExecutor
 * that proxies runCode / file ops to it. A failure at any step (SDK missing, sandbox
 * create error, op error) fails CLOSED — the router surfaces an explicit error to the
 * model, never a silent no-op and never a provider-native fallback.
 *
 * VERIFICATION NOTE: there is no E2B key in this environment, so the live sandbox
 * round-trip is unverified here — that step is the operator's once `E2B_API_KEY` is
 * set. The binding is typed against @e2b/code-interpreter@2.6.1 (confirmed against the
 * installed package's `dist/index.d.ts`, not assumed from docs/training data) and
 * defensive (optional chaining + try/catch) so an API-shape surprise degrades to
 * fail-closed.
 *
 * Session scope: when an authenticated tenant/user/conversation scope is passed, ONE
 * sandbox + one code-context per language is reused across every execution-tool call in
 * that owned conversation (state persists — variables/imports survive across turns).
 * The scoped mapping lives in Redis (./session-store.ts) so it survives across serverless
 * invocations without allowing a conversation id alone to resume another user's sandbox.
 * `pauseE2BSession()` (called by the tool loop at turn end)
 * stops billing while preserving state; the next request's `getE2BExecutor()` resumes
 * it via `Sandbox.connect()`, which auto-resumes a paused sandbox. `killE2BSession()`
 * (called on conversation delete, or as a safety net) releases it for good.
 *
 * Without a `conversationId` (e.g. a bare API caller with no conversation), the
 * executor is ephemeral: one sandbox per call, killed by the caller's `dispose()` —
 * byte-for-byte the original Phase-B-scaffold behavior.
 */
import 'server-only';

import { getPlanMaxSandboxes, getPlanSandboxTtlMs } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';
import type { E2BExecutor, ExecutionResult, SandboxFileEntry } from './types';
import { e2bExecutionEnabled } from './gate';
import { meterSandboxComputeInterval } from './compute-metering';
import {
  getE2BSession,
  saveE2BSession,
  deleteE2BSession,
  withUserSandboxLock,
  type E2BSession,
  type StoredContext,
  type E2BSessionScope,
} from './session-store';

/** Resource boundary: max ephemeral (no-conversationId) sandbox lifetime (ms) before E2B auto-kills it. */
const E2B_SANDBOX_TIMEOUT_MS = 60_000;

/**
 * Resource boundary for conversation-scoped sandboxes: generous enough to cover a full
 * agentic turn (up to `DEFAULT_MAX_STEPS` provider round-trips in tool-loop.ts) without
 * E2B force-killing it mid-turn. `pauseE2BSession()` (called at turn end) is what
 * actually stops billing well before this is reached in the normal case -- this timeout
 * is only the backstop for an abandoned/crashed request.
 */
const E2B_CONVERSATION_TIMEOUT_MS = 10 * 60_000;

/**
 * GOV-4: the per-user sandbox cap and the conversation sandbox lifetime are now
 * PLAN DIMENSIONS (`BILLING_PLAN_PRODUCT_LIMITS.maxSandboxes` /
 * `.sandboxTtlMs`), not one flat constant.
 *
 * They used to be `MAX_SANDBOXES_PER_USER = 5` and a flat 10-minute lifetime
 * for every tier including Free, so a paid tier bought literally nothing in
 * compute: same sandbox count, same lifetime, same everything.
 *
 * Only scoped (authenticated) sandboxes are counted and enforced; ephemeral
 * bare-API sandboxes self-dispose within `E2B_SANDBOX_TIMEOUT_MS`.
 */
function resolveSandboxLimits(planTier: string | null | undefined): {
  maxSandboxes: number | null;
  ttlMs: number;
} {
  return {
    maxSandboxes: getPlanMaxSandboxes(planTier),
    ttlMs: getPlanSandboxTtlMs(planTier),
  };
}

/**
 * GOV-4: resolve the owner's plan for a scoped call. When the caller did not
 * supply one, read it from the subscription rather than assuming a tier.
 *
 * FAILS CLOSED: a lookup error returns null and the caller refuses to create a
 * sandbox. Creating managed compute for an unknown entitlement is exactly the
 * thing every other gate in this codebase refuses to do.
 */
async function resolveScopePlanTier(scope: E2BSessionScope): Promise<string | null> {
  if (scope.planTier) return scope.planTier;
  try {
    const subscription = await SubscriptionService.getSubscription(scope.userId);
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

/** Map the tool's `language` (python | node | …) to an E2B RunCodeLanguage; default python. */
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

/**
 * Count a user's live (running or paused) sandboxes, tagged with `userId` in metadata,
 * stopping early once `stopAt` is reached (we only ever need to know whether the quota is
 * hit, not the exact total). Paginates the E2B list API so a user with many sandboxes is
 * still counted correctly. Filters server-side by `metadata:{userId}` AND state so we
 * count only this user's still-billable sandboxes.
 */
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

const fail = (err: unknown): ExecutionResult => ({
  ok: false,
  output: '',
  error: err instanceof Error ? err.message : String(err),
});

/**
 * Pause the conversation's sandbox (stops billing, preserves state) so the next
 * request in the same conversation can resume it via `Sandbox.connect()`. Best-effort:
 * a failure here just means the next request creates a fresh sandbox instead of
 * resuming — never surfaced to the model or the user.
 */
export async function pauseE2BSession(scope: E2BSessionScope): Promise<void> {
  const session = await getE2BSession(scope);
  if (!session) return;
  const Sandbox = await importSandbox();
  if (!Sandbox) return;
  try {
    await Sandbox.pause(session.sandboxId);
  } catch (err) {
    logger.warn({ err, conversationId: scope.conversationId }, '[e2b] pause failed');
  }
  // GOV-5: the billable interval ends here — close it into the usage ledger.
  await closeBillableInterval(scope, session, 'pause');
}

/**
 * GOV-5: settle the open compute interval on `session` and clear it, so the
 * next resume opens a fresh one and the same seconds are never billed twice.
 * Best-effort; the sandbox lifecycle never depends on it.
 */
async function closeBillableInterval(
  scope: E2BSessionScope,
  session: E2BSession,
  reason: 'pause' | 'kill' | 'reclaim',
): Promise<void> {
  const startedAtMs = session.activeSinceMs;
  if (typeof startedAtMs !== 'number') return;

  await meterSandboxComputeInterval({
    userId: scope.userId,
    sandboxId: session.sandboxId,
    conversationId: scope.conversationId,
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
  // GOV-5: bill whatever the sandbox ran before it was released.
  await closeBillableInterval(scope, session, 'kill');
  // Kill FIRST (on the captured id), then clear the mapping — deleting first
  // would orphan the sandbox if kill is skipped (no SDK) or throws, since the
  // mapping needed to find it again is already gone.
  try {
    const Sandbox = await importSandbox();
    if (Sandbox) await Sandbox.kill(session.sandboxId);
  } catch (err) {
    logger.warn({ err, conversationId: scope.conversationId }, '[e2b] kill failed');
  } finally {
    await deleteE2BSession(scope);
  }
}

/**
 * Return a live, gated E2B executor, or null when E2B execution is disabled/unconfigured
 * or the sandbox could not be created/resumed. ASYNC: creating/resuming the sandbox is
 * async. Fail-closed.
 *
 * When an authenticated session scope is provided, resumes that owned conversation's
 * paused sandbox (if a scoped mapping exists in Redis) instead of creating a new one,
 * and reuses cached code contexts per language so variables/imports persist across calls
 * and turns.
 */
export async function getE2BExecutor(scope?: E2BSessionScope): Promise<E2BExecutor | null> {
  if (!e2bExecutionEnabled()) return null;

  const conversationId = scope?.conversationId;

  // Dynamic import so the SDK only loads when E2B is actually used, and a missing
  // package fails closed rather than breaking the build/route.
  const Sandbox = await importSandbox();
  if (!Sandbox) return null;
  // Capture the narrowed non-null constructor so the nested `createFresh` closure keeps
  // the non-null type (TS re-widens a guarded outer const inside a later async closure).
  const SandboxCtor = Sandbox;

  type SandboxInstance = InstanceType<typeof Sandbox>;

  const existingSession = scope ? await getE2BSession(scope) : null;

  // GOV-4: the sandbox count and lifetime a caller gets are plan dimensions.
  // A scoped caller whose entitlement cannot be resolved gets NO sandbox.
  let planTier: string | null = null;
  let maxSandboxes: number | null = null;
  let planTtlMs = 0;
  if (scope) {
    planTier = await resolveScopePlanTier(scope);
    if (planTier === null) return null;
    const limits = resolveSandboxLimits(planTier);
    maxSandboxes = limits.maxSandboxes;
    planTtlMs = limits.ttlMs;
    if (maxSandboxes !== null && maxSandboxes <= 0) {
      logger.warn(
        { userId: scope.userId, planTier, conversationId },
        '[e2b] plan does not include managed sandboxes; refusing (fail-closed)',
      );
      return null;
    }
    if (planTtlMs <= 0) {
      logger.warn(
        { userId: scope.userId, planTier, conversationId },
        '[e2b] plan grants no managed sandbox lifetime; refusing (fail-closed)',
      );
      return null;
    }
  }

  // Conversation-scoped sandboxes use the PLAN lifetime; ephemeral bare-API
  // sandboxes keep the short per-call ceiling, which is not a plan dimension.
  const sandboxTimeoutMs = conversationId
    ? planTtlMs || E2B_CONVERSATION_TIMEOUT_MS
    : E2B_SANDBOX_TIMEOUT_MS;
  // Conversation-scoped sandboxes auto-PAUSE (not kill) if `sandboxTimeoutMs` is ever
  // reached without an explicit `pauseE2BSession()` call (e.g. a crashed request) --
  // state survives so the next turn can still resume it. Ephemeral (no-conversationId)
  // sandboxes keep the SDK default (kill), since there is no conversation to resume into.
  // Tag sandboxes with an opaque, non-PII identifier (conversationId, never message
  // content) so they're attributable in the E2B dashboard for abuse/fraud/billing
  // observability (mirrors e2b-dev/fragments' `Sandbox.create({ metadata })` pattern).
  // Also tag with `userId` (opaque, non-PII) so per-user concurrency can be counted via
  // the E2B list API's metadata filter — see `enforceUserQuota` below.
  // Purely additive: does not affect execution behavior.
  const metadata: Record<string, string> = {};
  if (conversationId) metadata['conversationId'] = conversationId;
  if (scope?.userId) metadata['userId'] = scope.userId;
  const createOpts = conversationId
    ? { timeoutMs: sandboxTimeoutMs, lifecycle: { onTimeout: 'pause' as const }, metadata }
    : { timeoutMs: sandboxTimeoutMs, metadata };

  /**
   * Create a fresh sandbox, first enforcing the caller's PLAN sandbox cap.
   * Returns null (fail-closed) when the quota is reached or the create fails.
   *
   * GOV-24: the count and the create now run inside one per-user Redis lock, so
   * two concurrent requests can no longer both observe "under the cap" and both
   * create. Losing the race for the lock is a refusal, not a bypass.
   *
   * GOV-21-adjacent: a quota-CHECK error now fails CLOSED. It used to proceed,
   * justified by "the team cap is the hard backstop" — but that backstop
   * disappears for EVERY user simultaneously when the list API degrades, which
   * is precisely when the per-user cap is the only thing left.
   */
  async function createFresh(): Promise<SandboxInstance | null> {
    const create = async (): Promise<SandboxInstance | null> => {
      try {
        return (await SandboxCtor.create(createOpts)) as SandboxInstance;
      } catch (err) {
        logger.warn({ err }, '[e2b] sandbox create failed; fail-closed');
        return null;
      }
    };

    if (!scope?.userId || maxSandboxes === null) return create();

    const limit = maxSandboxes;
    const guarded = await withUserSandboxLock(scope, async () => {
      try {
        const live = await countUserSandboxes(SandboxCtor, scope.userId, limit);
        if (live >= limit) {
          logger.warn(
            { userId: scope.userId, live, limit, planTier, conversationId },
            '[e2b] per-user sandbox quota reached; refusing new sandbox (fail-closed)',
          );
          return null;
        }
      } catch (err) {
        logger.error(
          { err, userId: scope.userId, planTier },
          '[e2b] sandbox quota check failed; refusing new sandbox (fail-closed)',
        );
        return null;
      }
      return create();
    });

    if (!guarded.locked) {
      logger.warn(
        { userId: scope.userId, conversationId },
        '[e2b] could not serialise sandbox creation; refusing (fail-closed)',
      );
      return null;
    }
    return guarded.result ?? null;
  }

  let sandbox: SandboxInstance;
  let sandboxId: string;
  const contexts: Record<string, StoredContext> = { ...(existingSession?.contexts ?? {}) };
  /**
   * GOV-5: epoch ms this executor's billable interval opened. Set once the
   * sandbox is live (created or resumed) and cleared when it is paused, so the
   * seconds between are settled exactly once into the usage ledger.
   */
  let activeSinceMs: number | undefined;

  if (existingSession) {
    try {
      // `connect` auto-resumes a paused sandbox; if it's been garbage-collected /
      // expired, this throws and we fall through to creating a fresh one below.
      sandbox = (await Sandbox.connect(existingSession.sandboxId, {
        timeoutMs: sandboxTimeoutMs,
      })) as SandboxInstance;
      sandboxId = existingSession.sandboxId;
    } catch (err) {
      logger.warn(
        { err, conversationId },
        '[e2b] resume failed (sandbox likely expired); creating a fresh sandbox',
      );
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

  /** Persist the (possibly updated) session mapping so the next call/turn can reuse it. */
  async function persistSession(): Promise<void> {
    if (!scope) return;
    const session: E2BSession = {
      sandboxId,
      contexts,
      ...(activeSinceMs !== undefined ? { activeSinceMs } : {}),
    };
    await saveE2BSession(scope, session);
  }

  // GOV-5: open the billable interval and persist it immediately, so an
  // abandoned/crashed request still leaves a record the reclaim job can settle.
  activeSinceMs = Date.now();
  await persistSession();

  /** Get (or lazily create + cache) the code context for `language`. */
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
        // Conversation-scoped: run in a persistent context so variables/imports carry
        // across calls. Ephemeral (no conversationId): plain per-call execution, same
        // as the original Phase-B-scaffold behavior.
        const context = conversationId ? await getContext(lang) : undefined;
        const execution = context
          ? await sandbox.runCode(code, {
              context: { id: context.id, language: context.language, cwd: context.cwd },
            })
          : await sandbox.runCode(code, { language: lang });
        const stdout = (execution.logs?.stdout ?? []).join('');
        const stderr = (execution.logs?.stderr ?? []).join('');
        if (execution.error) {
          // Include the traceback (not just name/value) so the model gets the same
          // debugging signal a human would in a notebook -- e2b-dev/fragments'
          // reference UI surfaces the full traceback for the same reason.
          const traceback = execution.error.traceback ? `\n${execution.error.traceback}` : '';
          return {
            ok: false,
            output: stdout,
            error: `${execution.error.name}: ${execution.error.value}${traceback}`,
          };
        }
        const output = [stdout, stderr, execution.text ?? ''].filter(Boolean).join('\n');
        // Rich results: charts/images arrive as base64 PNGs on results[].png
        // (they are not files on the sandbox disk, so the end-of-turn file
        // harvest can't see them). Surface them so the tool loop can persist
        // them through the shared generated-file pipeline.
        const pngResults = ((execution.results ?? []) as Array<{ png?: unknown }>)
          .map((r) => r?.png)
          .filter((png): png is string => typeof png === 'string' && png.length > 0);
        return {
          ok: true,
          output: output || '(no output)',
          ...(pngResults.length > 0 ? { pngResults } : {}),
        };
      } catch (err) {
        return fail(err);
      }
    },
    async writeFile({ path, content }): Promise<ExecutionResult> {
      try {
        await sandbox.files.write(path, content);
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
      // Conversation-scoped only. Pause THIS executor's own live sandbox by its
      // captured id — never via a Redis re-lookup, which fail-opens: a stale or
      // absent session mapping (saveE2BSession is best-effort) would otherwise
      // leave the just-created sandbox billing until its plan timeout.
      if (!scope) return;
      // GOV-5: close the billable interval BEFORE persisting, so the stored
      // session for a paused (non-billing) sandbox carries no open interval and
      // the reclaim job cannot bill these seconds a second time.
      const intervalStartedAtMs = activeSinceMs;
      activeSinceMs = undefined;
      // Persist first so the next turn can resume; even if this Redis write
      // fails, the live-handle pause below still stops billing.
      try {
        await persistSession();
      } catch (err) {
        logger.warn({ err, conversationId }, '[e2b] persistSession before pause failed');
      }
      try {
        // Static pause on the captured live id (consistent with pauseE2BSession).
        await Sandbox.pause(sandboxId);
      } catch (err) {
        logger.warn({ err, conversationId }, '[e2b] pause (live handle) failed');
      }
      if (intervalStartedAtMs !== undefined) {
        await meterSandboxComputeInterval({
          userId: scope.userId,
          sandboxId,
          conversationId,
          startedAtMs: intervalStartedAtMs,
          endedAtMs: Date.now(),
          reason: 'pause',
        });
      }
    },
    async dispose(): Promise<void> {
      // Conversation-scoped sessions are NOT killed here — the tool loop pauses them
      // (via pause()) once at turn end so state survives to the next call/turn.
      // Only ephemeral (no-conversationId) callers kill immediately, unchanged from the
      // original per-call behavior.
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
      // E2B_SANDBOX_TIMEOUT_MS and killed here — the exposure is one minute of
      // compute per bare-API call, not an open-ended meter.
    },
  };
}
