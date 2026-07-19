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

import { logger } from '@/lib/logger';
import type { E2BExecutor, ExecutionResult, SandboxFileEntry } from './types';
import { e2bExecutionEnabled } from './gate';
import {
  getE2BSession,
  saveE2BSession,
  deleteE2BSession,
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

  type SandboxInstance = InstanceType<typeof Sandbox>;

  const existingSession = scope ? await getE2BSession(scope) : null;

  const sandboxTimeoutMs = conversationId ? E2B_CONVERSATION_TIMEOUT_MS : E2B_SANDBOX_TIMEOUT_MS;
  // Conversation-scoped sandboxes auto-PAUSE (not kill) if `sandboxTimeoutMs` is ever
  // reached without an explicit `pauseE2BSession()` call (e.g. a crashed request) --
  // state survives so the next turn can still resume it. Ephemeral (no-conversationId)
  // sandboxes keep the SDK default (kill), since there is no conversation to resume into.
  // Tag sandboxes with an opaque, non-PII identifier (conversationId, never message
  // content) so they're attributable in the E2B dashboard for abuse/fraud/billing
  // observability (mirrors e2b-dev/fragments' `Sandbox.create({ metadata })` pattern).
  // Purely additive: does not affect execution behavior.
  const metadata: Record<string, string> = conversationId ? { conversationId } : {};
  const createOpts = conversationId
    ? { timeoutMs: sandboxTimeoutMs, lifecycle: { onTimeout: 'pause' as const }, metadata }
    : { timeoutMs: sandboxTimeoutMs, metadata };

  let sandbox: SandboxInstance;
  let sandboxId: string;
  const contexts: Record<string, StoredContext> = { ...(existingSession?.contexts ?? {}) };

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
      try {
        sandbox = (await Sandbox.create(createOpts)) as SandboxInstance;
        sandboxId = sandbox.sandboxId;
      } catch (createErr) {
        logger.warn({ err: createErr }, '[e2b] sandbox create failed; fail-closed');
        return null;
      }
    }
  } else {
    try {
      sandbox = (await Sandbox.create(createOpts)) as SandboxInstance;
      sandboxId = sandbox.sandboxId;
    } catch (err) {
      logger.warn({ err }, '[e2b] sandbox create failed; fail-closed');
      return null;
    }
  }

  /** Persist the (possibly updated) session mapping so the next call/turn can reuse it. */
  async function persistSession(): Promise<void> {
    if (!scope) return;
    const session: E2BSession = { sandboxId, contexts };
    await saveE2BSession(scope, session);
  }

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
      // leave the just-created sandbox billing until its 10-min timeout.
      if (!scope) return;
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
    },
  };
}
