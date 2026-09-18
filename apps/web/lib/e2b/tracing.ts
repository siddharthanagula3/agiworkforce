import 'server-only';

import { withSpan } from '@/lib/observability/span';

import type { E2BExecutor, E2BGitExecutor } from './types';

export interface SandboxSpanScope {
  readonly sandboxId: string;
  readonly template?: string | undefined;
  readonly conversationId?: string | undefined;
}

const SANDBOX_ID_ATTRIBUTE = 'agi.sandbox.id';
const SANDBOX_TEMPLATE_ATTRIBUTE = 'agi.sandbox.template';
const SANDBOX_OPERATION_ATTRIBUTE = 'agi.sandbox.operation';

type AnyOperation = (...args: never[]) => Promise<unknown>;

function scopeAttributes(scope: SandboxSpanScope): Record<string, unknown> {
  return {
    [SANDBOX_ID_ATTRIBUTE]: scope.sandboxId,
    ...(scope.template ? { [SANDBOX_TEMPLATE_ATTRIBUTE]: scope.template } : {}),
    ...(scope.conversationId ? { 'agi.conversation.id': scope.conversationId } : {}),
  };
}

function traced<F extends AnyOperation>(
  operation: string,
  scope: SandboxSpanScope,
  fn: F,
  attributesOf?: (...args: Parameters<F>) => Record<string, unknown>,
): F {
  return (async (...args: Parameters<F>) =>
    withSpan(
      `sandbox.${operation}`,
      {
        domain: 'sandbox',
        kind: 'client',
        attributes: {
          ...scopeAttributes(scope),
          [SANDBOX_OPERATION_ATTRIBUTE]: operation,
          ...(attributesOf ? attributesOf(...args) : {}),
        },
      },
      () => fn(...args),
    )) as F;
}

function tracedGit(git: E2BGitExecutor, scope: SandboxSpanScope): E2BGitExecutor {
  const entries = Object.entries(git) as [keyof E2BGitExecutor, AnyOperation][];
  return Object.fromEntries(
    entries.map(([name, fn]) => [name, traced(`git.${String(name)}`, scope, fn.bind(git))]),
  ) as unknown as E2BGitExecutor;
}

// Wrapping the executor spans every sandbox op without threading a span through
// the SDK bindings one method at a time.
export function traceSandboxExecutor(executor: E2BExecutor, scope: SandboxSpanScope): E2BExecutor {
  return {
    ...executor,
    runCode: traced('run_code', scope, executor.runCode.bind(executor), (input) => ({
      'agi.sandbox.language': input.language,
      'agi.sandbox.code_bytes': input.code.length,
    })),
    writeFile: traced('write_file', scope, executor.writeFile.bind(executor)),
    createFolder: traced('create_folder', scope, executor.createFolder.bind(executor)),
    ...(executor.runCommand
      ? { runCommand: traced('run_command', scope, executor.runCommand.bind(executor)) }
      : {}),
    ...(executor.git ? { git: tracedGit(executor.git, scope) } : {}),
    ...(executor.listFiles
      ? { listFiles: traced('list_files', scope, executor.listFiles.bind(executor)) }
      : {}),
    ...(executor.readFileBytes
      ? { readFileBytes: traced('read_file_bytes', scope, executor.readFileBytes.bind(executor)) }
      : {}),
    ...(executor.pause ? { pause: traced('pause', scope, executor.pause.bind(executor)) } : {}),
    dispose: traced('dispose', scope, executor.dispose.bind(executor)),
  };
}
