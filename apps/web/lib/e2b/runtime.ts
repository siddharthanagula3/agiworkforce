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
 * set. The binding is typed against @e2b/code-interpreter@2.6.1 and defensive
 * (optional chaining + try/catch) so an API-shape surprise degrades to fail-closed.
 *
 * Session scope: one sandbox per execution tool call (created here, disposed by the
 * caller). Conversation-scoped persistent sessions + mounted workspace directories
 * are the Phase B refinement.
 */
import 'server-only';

import { logger } from '@/lib/logger';
import type { E2BExecutor, ExecutionResult } from './types';
import { e2bExecutionEnabled } from './gate';

/** Resource boundary: max sandbox session lifetime (ms). */
const E2B_SANDBOX_TIMEOUT_MS = 60_000;

type E2BLanguage = 'python' | 'javascript' | 'typescript' | 'r' | 'java' | 'bash';

/** Map the tool's `language` (python | node | …) to an E2B RunCodeLanguage; default python. */
function mapLanguage(language: string): E2BLanguage {
  const l = language.trim().toLowerCase();
  if (l === 'node' || l === 'js' || l === 'javascript') return 'javascript';
  if (l === 'ts' || l === 'typescript') return 'typescript';
  if (l === 'r' || l === 'java' || l === 'bash' || l === 'python') return l;
  return 'python';
}

/**
 * Return a live, gated E2B executor, or null when E2B execution is disabled/unconfigured
 * or the sandbox could not be created. ASYNC: creating the sandbox is async. Fail-closed.
 */
export async function getE2BExecutor(): Promise<E2BExecutor | null> {
  if (!e2bExecutionEnabled()) return null;

  // Dynamic import so the SDK only loads when E2B is actually used, and a missing
  // package fails closed rather than breaking the build/route.
  let Sandbox: typeof import('@e2b/code-interpreter').Sandbox;
  try {
    ({ Sandbox } = await import('@e2b/code-interpreter'));
  } catch (err) {
    logger.warn({ err }, '[e2b] @e2b/code-interpreter unavailable; fail-closed');
    return null;
  }

  // `create` is inherited from the base sandbox class (typed without runCode); the
  // code-interpreter Sandbox adds runCode at runtime, so narrow to the derived instance.
  let sandbox: InstanceType<typeof Sandbox>;
  try {
    // E2B reads E2B_API_KEY from the environment. timeoutMs bounds the session lifetime.
    sandbox = (await Sandbox.create({ timeoutMs: E2B_SANDBOX_TIMEOUT_MS })) as InstanceType<
      typeof Sandbox
    >;
  } catch (err) {
    logger.warn({ err }, '[e2b] sandbox create failed; fail-closed');
    return null;
  }

  const fail = (err: unknown): ExecutionResult => ({
    ok: false,
    output: '',
    error: err instanceof Error ? err.message : String(err),
  });

  return {
    async runCode({ language, code }): Promise<ExecutionResult> {
      try {
        const execution = await sandbox.runCode(code, { language: mapLanguage(language) });
        const stdout = (execution.logs?.stdout ?? []).join('');
        const stderr = (execution.logs?.stderr ?? []).join('');
        if (execution.error) {
          return {
            ok: false,
            output: stdout,
            error: `${execution.error.name}: ${execution.error.value}`,
          };
        }
        const output = [stdout, stderr, execution.text ?? ''].filter(Boolean).join('\n');
        return { ok: true, output: output || '(no output)' };
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
    async dispose(): Promise<void> {
      try {
        await sandbox.kill();
      } catch (err) {
        logger.warn({ err }, '[e2b] sandbox kill failed');
      }
    },
  };
}
