import 'server-only';

import type { E2BExecutor } from '@/lib/e2b/types';
import { routeExecutionTool } from '@/lib/e2b/execution-tools';
import type { CloudCodeToolOutcome, CloudCodeToolRunner } from './cloud-code-agent-loop';

/**
 * Binds the Cloud Code agent loop to a real E2B session.
 *
 * The loop is deliberately sandbox-ignorant — it takes a `CloudCodeToolRunner`
 * so it can be unit-tested without E2B. This module is the only place the two
 * meet, and it reuses the session's existing executor (built from
 * `managedCloudCodeSessionScope`) rather than provisioning a second sandbox:
 * an agent that read a different filesystem than the terminal transcript shows
 * would be actively misleading.
 *
 * `write_file`, `create_folder` and `execute_code` are delegated to
 * `routeExecutionTool`, keeping `lib/e2b/execution-tools.ts` the single owner
 * of the sandbox tool contract.
 */

const MAX_READ_BYTES = 200_000;
const COMMAND_TIMEOUT_MS = 120_000;

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/** Reject traversal and absolute paths before they reach the sandbox. */
function normalizeWorkspacePath(raw: string): string | null {
  const path = raw.trim();
  if (!path || path.includes('\0')) return null;
  if (path.startsWith('/') || path.startsWith('~')) return null;
  // Reject any `..` segment rather than trying to resolve it: the workspace
  // root is the sandbox's, not ours, so we cannot verify a resolved path here.
  if (path.split('/').some((segment) => segment === '..')) return null;
  return path;
}

export function createCloudCodeToolRunner(
  executor: E2BExecutor,
  workspacePath: string,
): CloudCodeToolRunner {
  const inWorkspace = (relative: string): string =>
    `${workspacePath.replace(/\/+$/, '')}/${relative}`;

  return {
    async readFile(path: string): Promise<CloudCodeToolOutcome> {
      const safe = normalizeWorkspacePath(path);
      if (!safe) {
        return {
          output: `Refused to read "${path}": paths must be workspace-relative and may not traverse upward.`,
          isError: true,
        };
      }
      if (!executor.readFileBytes) {
        return { output: 'This sandbox cannot read files.', isError: true };
      }
      try {
        const bytes = await executor.readFileBytes(inWorkspace(safe));
        if (!bytes) return { output: `No such file: ${safe}`, isError: true };
        if (bytes.byteLength > MAX_READ_BYTES) {
          return {
            output: `${safe} is ${bytes.byteLength} bytes, larger than the ${MAX_READ_BYTES}-byte read limit. Read a smaller section with a shell command instead.`,
            isError: true,
          };
        }
        return { output: decodeUtf8(bytes), isError: false };
      } catch (error) {
        return {
          output: error instanceof Error ? error.message : String(error),
          isError: true,
        };
      }
    },

    async listFiles(path: string | undefined): Promise<CloudCodeToolOutcome> {
      const relative = path === undefined || path === '' ? '.' : normalizeWorkspacePath(path);
      if (!relative) {
        return {
          output: `Refused to list "${path}": paths must be workspace-relative and may not traverse upward.`,
          isError: true,
        };
      }
      if (!executor.runCommand) {
        return { output: 'This sandbox cannot list files.', isError: true };
      }
      try {
        // `-A` includes dotfiles (config the agent usually needs) but not
        // `.`/`..`. Bounded so a node_modules tree cannot flood the context.
        const result = await executor.runCommand({
          command: `ls -A1 ${JSON.stringify(relative)} | head -500`,
          cwd: workspacePath,
          timeoutMs: 30_000,
        });
        const output = result.stdout || result.stderr;
        return { output: output || '(empty)', isError: result.exitCode !== 0 };
      } catch (error) {
        return {
          output: error instanceof Error ? error.message : String(error),
          isError: true,
        };
      }
    },

    async runCommand(command: string): Promise<CloudCodeToolOutcome> {
      // NOTE: no risk check here on purpose. `classifyCommandRisk` is the single
      // owner of that decision and the loop applies it before calling this. A
      // second check here would invite the two to disagree.
      if (!executor.runCommand) {
        return { output: 'This sandbox cannot run commands.', isError: true };
      }
      try {
        const result = await executor.runCommand({
          command,
          cwd: workspacePath,
          timeoutMs: COMMAND_TIMEOUT_MS,
        });
        const parts: string[] = [];
        if (result.stdout) parts.push(result.stdout);
        if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
        parts.push(`[exit ${result.exitCode}]`);
        return { output: parts.join('\n'), isError: result.exitCode !== 0 };
      } catch (error) {
        return {
          output: error instanceof Error ? error.message : String(error),
          isError: true,
        };
      }
    },

    async runSharedExecutionTool(
      name: string,
      args: Record<string, unknown>,
    ): Promise<CloudCodeToolOutcome> {
      const result = await routeExecutionTool(executor, name, args);
      return {
        output: result.ok ? result.output : (result.error ?? 'Tool failed.'),
        isError: !result.ok,
      };
    },
  };
}
