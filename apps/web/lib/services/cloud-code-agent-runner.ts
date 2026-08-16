import 'server-only';

import type { E2BExecutor } from '@/lib/e2b/types';
import { routeExecutionTool } from '@/lib/e2b/execution-tools';
import type { CloudCodeToolOutcome, CloudCodeToolRunner } from './cloud-code-agent-loop';

const MAX_READ_BYTES = 200_000;

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function normalizeWorkspacePath(raw: string): string | null {
  const path = raw.trim();
  if (!path || path.includes('\0')) return null;
  if (path.startsWith('/') || path.startsWith('~')) return null;
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

    async runCommand(command: string, timeoutMs: number): Promise<CloudCodeToolOutcome> {
      if (!executor.runCommand) {
        return { output: 'This sandbox cannot run commands.', isError: true };
      }
      try {
        const result = await executor.runCommand({
          command,
          cwd: workspacePath,
          timeoutMs,
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
