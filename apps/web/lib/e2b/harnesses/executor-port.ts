import type { CommandExecutionResult, E2BExecutor } from '@/lib/e2b/types';
import type { HarnessProcessPort } from './types';

const LINE_BREAK = '\n';
const ABORTED_EXIT_CODE = 130;

interface HarnessCommandInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

type HarnessCapableExecutor = Omit<E2BExecutor, 'runCommand'> & {
  runCommand?: (input: HarnessCommandInput) => Promise<CommandExecutionResult>;
};

export function createLineAssembler(onLine: (line: string) => void): {
  push: (chunk: string) => void;
  flush: () => void;
} {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      let index = buffer.indexOf(LINE_BREAK);
      while (index >= 0) {
        onLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf(LINE_BREAK);
      }
    },
    flush() {
      if (!buffer) return;
      onLine(buffer);
      buffer = '';
    },
  };
}

export function createExecutorProcessPort(executor: E2BExecutor): HarnessProcessPort | null {
  const capable = executor as HarnessCapableExecutor;
  const runCommand = capable.runCommand;
  if (!runCommand) return null;

  return {
    async run({ command, cwd, timeoutMs, signal, onStdout, onStderr }) {
      let streamed = false;
      const stdout = createLineAssembler(onStdout);
      const stderr = createLineAssembler(onStderr);

      const result = await runCommand({
        command,
        cwd,
        timeoutMs,
        signal,
        onStdout: (chunk) => {
          streamed = true;
          stdout.push(chunk);
        },
        onStderr: (chunk) => {
          streamed = true;
          stderr.push(chunk);
        },
      });

      if (!streamed) {
        stdout.push(result.stdout);
        stderr.push(result.stderr);
      }
      stdout.flush();
      stderr.flush();

      if (signal.aborted) {
        return { exitCode: ABORTED_EXIT_CODE, ...(result.error ? { error: result.error } : {}) };
      }
      return { exitCode: result.exitCode, ...(result.error ? { error: result.error } : {}) };
    },
  };
}
