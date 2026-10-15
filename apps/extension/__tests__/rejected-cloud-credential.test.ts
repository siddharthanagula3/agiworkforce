import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import {
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../src/features/cloud-bridge/managedCloudAuthority';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
  'utf8',
);
const program = ts.createSourceFile('background.ts', source, ts.ScriptTarget.Latest, true);
const operation = program.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) &&
    node.name?.text === 'invalidateRejectedManagedCloudCredential',
);
if (!operation) throw new Error('The production rejected-credential handler is missing.');
const compiled = ts.transpileModule(operation.getText(program), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const OWNER_A = { accountId: 'user-a', authIncarnation: 'session-a' };
const OWNER_B = { accountId: 'user-b', authIncarnation: 'session-b' };

function harness(
  current: { owner: ManagedCloudOwner; token: string } | null,
  leaseOwner = OWNER_A,
) {
  const deps = {
    computerUseRuns: { getActive: () => ({ runId: 'browser-run', authOwner: leaseOwner }) },
    sameManagedCloudOwner,
    cancelActiveComputerUseRun: vi.fn(),
    invalidateManagedCloudOwner: vi.fn().mockResolvedValue(undefined),
    getManagedCloudAuthContext: vi.fn().mockResolvedValue(current),
    retireManagedCloudOwner: vi.fn(),
    logger: { warn: vi.fn(), error: vi.fn() },
  };
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const run = new Function(
    ...Object.keys(deps),
    `let computerUseStartGeneration = 0; ${compiled} return invalidateRejectedManagedCloudCredential;`,
  )(...Object.values(deps)) as (input: {
    owner: ManagedCloudOwner;
    token: string;
  }) => Promise<void>;
  return { ...deps, run };
}

describe('rejected Managed Cloud credentials', () => {
  it('cancels only the rejected owner and preserves its valid refreshed identity', async () => {
    const state = harness({ owner: OWNER_A, token: 'refreshed-a' });
    await state.run({ owner: OWNER_A, token: 'expired-a' });
    expect(state.cancelActiveComputerUseRun).toHaveBeenCalledWith('account_changed', 'browser-run');
    expect(state.invalidateManagedCloudOwner).toHaveBeenCalledExactlyOnceWith(OWNER_A);
    expect(state.getManagedCloudAuthContext).toHaveBeenCalledExactlyOnceWith(true);
    expect(state.retireManagedCloudOwner).not.toHaveBeenCalled();
  });

  it('does not retire a still-current identity merely because its bearer received an API 401', async () => {
    const state = harness({ owner: OWNER_A, token: 'rejected-a' });
    await state.run({ owner: OWNER_A, token: 'rejected-a' });
    expect(state.retireManagedCloudOwner).not.toHaveBeenCalled();
    expect(state.invalidateManagedCloudOwner).toHaveBeenCalledExactlyOnceWith(OWNER_A);
  });

  it('does not let a delayed account-A rejection cancel or retire account B', async () => {
    const state = harness({ owner: OWNER_B, token: 'current-b' }, OWNER_B);
    await state.run({ owner: OWNER_A, token: 'rejected-a' });
    expect(state.cancelActiveComputerUseRun).not.toHaveBeenCalled();
    expect(state.retireManagedCloudOwner).toHaveBeenCalledExactlyOnceWith(OWNER_A);
    expect(state.invalidateManagedCloudOwner.mock.calls).toEqual([[OWNER_A], [OWNER_A, true]]);
  });

  it('retires local owner state when the native identity is actually absent', async () => {
    const state = harness(null);
    await state.run({ owner: OWNER_A, token: 'rejected-a' });
    expect(state.retireManagedCloudOwner).toHaveBeenCalledExactlyOnceWith(OWNER_A);
    expect(state.invalidateManagedCloudOwner.mock.calls).toEqual([[OWNER_A], [OWNER_A, true]]);
  });

  it('fails closed without declaring a network refresh failure a signed-out identity', async () => {
    const state = harness({ owner: OWNER_A, token: 'current-a' });
    state.getManagedCloudAuthContext.mockRejectedValue(new Error('network unavailable'));
    await expect(state.run({ owner: OWNER_A, token: 'rejected-a' })).rejects.toThrow(
      /teardown was incomplete/,
    );
    expect(state.retireManagedCloudOwner).not.toHaveBeenCalled();
    expect(state.invalidateManagedCloudOwner).toHaveBeenCalledExactlyOnceWith(OWNER_A);
  });
});
