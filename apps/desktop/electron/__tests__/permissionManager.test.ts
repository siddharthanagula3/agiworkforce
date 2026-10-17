import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let userData = '';

const showMessageBox = vi.fn();

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  dialog: { showMessageBox },
}));

beforeAll(async () => {
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'agi-permissions-'));
});

afterAll(async () => {
  await fs.rm(userData, { recursive: true, force: true });
});

async function freshRuntime() {
  vi.resetModules();
  return import('../runtime/permissionManager');
}

const GLOBAL = { kind: 'global' } as const;
const LEDGER = { kind: 'workspace', target: '/work/ledger' } as const;
const ATLAS = { kind: 'workspace', target: '/work/atlas' } as const;

beforeEach(async () => {
  showMessageBox.mockReset();
  await fs.rm(path.join(userData, 'desktop-permissions.json'), { force: true });
});

describe('a command that arrived from another device', () => {
  it('passes only where the capability is already granted on that scope', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('shell.execute', LEDGER, 'granted', 'session');

    expect(runtime.authorizeRemoteCommand('shell.execute', LEDGER)).toEqual({ allowed: true });
    expect(runtime.authorizeRemoteCommand('shell.execute', ATLAS).allowed).toBe(false);
    expect(runtime.authorizeRemoteCommand('filesystem.write', LEDGER).allowed).toBe(false);
  });

  it('is refused without a prompt when nobody has decided, naming what was not allowed', async () => {
    const runtime = await freshRuntime();

    const refusal = runtime.authorizeRemoteCommand('shell.execute', LEDGER);

    expect(refusal.allowed).toBe(false);
    expect(refusal.reason).toBe(
      'This device has not been allowed to run commands in /work/ledger.',
    );
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('is refused where the user said no, and where they only allowed reading', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('shell.execute', LEDGER, 'denied', 'session');
    runtime.recordDecision('filesystem.read', ATLAS, 'granted', 'always');

    expect(runtime.authorizeRemoteCommand('shell.execute', LEDGER).allowed).toBe(false);
    expect(runtime.authorizeRemoteCommand('shell.execute', ATLAS).allowed).toBe(false);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('is refused again once the grant is withdrawn', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('shell.execute', LEDGER, 'granted', 'session');
    runtime.revokePermission('shell.execute', LEDGER);

    expect(runtime.authorizeRemoteCommand('shell.execute', LEDGER).allowed).toBe(false);
  });
});

describe('listing and withdrawing decisions', () => {
  it('keeps the original time of a one-use decision and removes it when consumed', async () => {
    const runtime = await freshRuntime();
    const original = runtime.recordDecision('shell.execute', LEDGER, 'granted', 'once');
    expect(runtime.listPermissions()).toEqual([]);
    const snapshot = runtime.getPermissionDecision('shell.execute', LEDGER);
    expect(snapshot).toEqual(original);
    Object.assign(snapshot!.scope, { target: '/somewhere-else' });
    expect(runtime.getPermissionDecision('shell.execute', LEDGER)?.scope).toEqual(LEDGER);
    expect(runtime.getPermissionDecision('shell.execute', LEDGER)?.decidedAtMs).toBe(
      original.decidedAtMs,
    );
    runtime.consumeSingleUse('shell.execute', LEDGER);
    expect(runtime.getPermissionDecision('shell.execute', LEDGER)).toBeNull();
    expect(runtime.getPermissionState('shell.execute', LEDGER)).toBe('prompt');
  });

  it('lists what is in force, a session decision standing in front of a stored one', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('filesystem.write', LEDGER, 'granted', 'always');
    runtime.recordDecision('clipboard.read', GLOBAL, 'granted', 'always');
    runtime.recordDecision('filesystem.write', LEDGER, 'denied', 'session');
    runtime.recordDecision('shell.execute', LEDGER, 'granted', 'session');

    const listed = runtime
      .listPermissions()
      .map(({ capability, scope, state, duration }) => ({ capability, scope, state, duration }));

    expect(listed).toHaveLength(3);
    expect(listed).toEqual(
      expect.arrayContaining([
        { capability: 'filesystem.write', scope: LEDGER, state: 'denied', duration: 'session' },
        { capability: 'clipboard.read', scope: GLOBAL, state: 'granted', duration: 'always' },
        { capability: 'shell.execute', scope: LEDGER, state: 'granted', duration: 'session' },
      ]),
    );
  });

  it('leaves out a single-use grant, which is spent by the call it was given for', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('clipboard.read', GLOBAL, 'granted', 'once');

    expect(runtime.listPermissions()).toEqual([]);
  });

  it('forgets a withdrawn decision across a restart, so the next use asks again', async () => {
    const first = await freshRuntime();
    first.recordDecision('filesystem.write', LEDGER, 'granted', 'always');
    first.revokePermission('filesystem.write', LEDGER);

    const restarted = await freshRuntime();
    expect(restarted.getPermissionState('filesystem.write', LEDGER)).toBe('prompt');
    expect(restarted.listPermissions()).toEqual([]);
  });

  it('takes back every grant on one folder, leaves its refusals, and touches no other folder', async () => {
    const first = await freshRuntime();
    first.recordDecision('filesystem.read', LEDGER, 'granted', 'always');
    first.recordDecision('filesystem.write', LEDGER, 'granted', 'always');
    first.recordDecision('git.write', LEDGER, 'granted', 'session');
    first.recordDecision('shell.execute', LEDGER, 'denied', 'session');
    first.recordDecision('filesystem.read', ATLAS, 'granted', 'always');
    first.recordDecision('clipboard.read', GLOBAL, 'granted', 'always');

    expect(first.revokeScope(LEDGER)).toBe(3);

    for (const capability of ['filesystem.read', 'filesystem.write', 'git.write'] as const) {
      expect(first.getPermissionState(capability, LEDGER)).toBe('prompt');
    }
    expect(first.getPermissionState('shell.execute', LEDGER)).toBe('denied');
    const restarted = await freshRuntime();
    expect(restarted.getPermissionState('filesystem.write', LEDGER)).toBe('prompt');
    expect(restarted.getPermissionState('filesystem.read', ATLAS)).toBe('granted');
    expect(restarted.getPermissionState('clipboard.read', GLOBAL)).toBe('granted');
  });

  it('withdraws a grant without ever clearing a refusal', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('computer.use', GLOBAL, 'granted', 'session');
    runtime.recordDecision('filesystem.write', LEDGER, 'granted', 'always');
    runtime.recordDecision('shell.execute', LEDGER, 'denied', 'session');

    runtime.withdrawGrant('computer.use', GLOBAL);
    runtime.withdrawGrant('filesystem.write', LEDGER);
    runtime.withdrawGrant('shell.execute', LEDGER);
    runtime.withdrawGrant('clipboard.read', GLOBAL);

    expect(runtime.getPermissionState('computer.use', GLOBAL)).toBe('prompt');
    expect(runtime.getPermissionState('filesystem.write', LEDGER)).toBe('prompt');
    expect(runtime.getPermissionState('shell.execute', LEDGER)).toBe('denied');
    expect((await freshRuntime()).getPermissionState('filesystem.write', LEDGER)).toBe('prompt');

    runtime.revokePermission('shell.execute', LEDGER);
    expect(runtime.getPermissionState('shell.execute', LEDGER)).toBe('prompt');
  });

  it('drops a stored decision for a capability the app no longer has', async () => {
    await fs.writeFile(
      path.join(userData, 'desktop-permissions.json'),
      JSON.stringify([
        {
          capability: 'git.destructive',
          scope: LEDGER,
          state: 'granted',
          duration: 'always',
          decidedAtMs: 1,
        },
        {
          capability: 'filesystem.read',
          scope: LEDGER,
          state: 'granted',
          duration: 'always',
          decidedAtMs: 2,
        },
      ]),
    );

    const runtime = await freshRuntime();

    expect(runtime.listPermissions().map((decision) => decision.capability)).toEqual([
      'filesystem.read',
    ]);
  });

  it('writes the store so no other account can read it', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('filesystem.read', LEDGER, 'granted', 'always');

    const stat = await fs.stat(path.join(userData, 'desktop-permissions.json'));
    expect(stat.mode & 0o077).toBe(0);
  });
});

describe('a high-risk grant', () => {
  it('is never written to disk, however long it was asked to last', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('shell.execute', LEDGER, 'granted', 'always');
    runtime.recordDecision('computer.use', GLOBAL, 'granted', 'always');
    runtime.recordDecision('filesystem.read', LEDGER, 'granted', 'always');

    expect(runtime.getPermissionState('shell.execute', LEDGER)).toBe('granted');
    const stored = JSON.parse(
      await fs.readFile(path.join(userData, 'desktop-permissions.json'), 'utf8'),
    ) as Array<{ capability: string }>;
    expect(stored.map((decision) => decision.capability)).toEqual(['filesystem.read']);

    const restarted = await freshRuntime();
    expect(restarted.getPermissionState('shell.execute', LEDGER)).toBe('prompt');
    expect(restarted.getPermissionState('computer.use', GLOBAL)).toBe('prompt');
  });

  it('is dropped on load when something else wrote it into the store', async () => {
    await fs.writeFile(
      path.join(userData, 'desktop-permissions.json'),
      JSON.stringify(
        ['shell.execute', 'computer.use', 'host.remote', 'browser.cdp', 'application.control'].map(
          (capability) => ({
            capability,
            scope: capability === 'shell.execute' ? LEDGER : GLOBAL,
            state: 'granted',
            duration: 'always',
            decidedAtMs: 1,
          }),
        ),
      ),
    );

    const runtime = await freshRuntime();

    expect(runtime.listPermissions()).toEqual([]);
    expect(runtime.getPermissionState('shell.execute', LEDGER)).toBe('prompt');
    expect(runtime.getPermissionState('computer.use', GLOBAL)).toBe('prompt');
    expect(runtime.authorizeRemoteCommand('shell.execute', LEDGER).allowed).toBe(false);
  });
});

describe('asking for a permission', () => {
  function pendingDialog() {
    let answer: (response: number) => void = () => undefined;
    showMessageBox.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = (response) => resolve({ response, checkboxChecked: false });
        }),
    );
    return { answer: (response: number) => answer(response) };
  }

  it('raises one dialog for requests that arrive while it is open, and gives them all its answer', async () => {
    const runtime = await freshRuntime();
    const dialog = pendingDialog();

    const asked = [1, 2, 3].map(() =>
      runtime.requestPermission(null, 'filesystem.write', LEDGER, 'The agent wants to write here.'),
    );
    await Promise.resolve();
    expect(showMessageBox).toHaveBeenCalledTimes(1);

    dialog.answer(1);
    expect(await Promise.all(asked)).toEqual(['granted', 'granted', 'granted']);
    expect(showMessageBox).toHaveBeenCalledTimes(1);
  });

  it('asks about two folders separately', async () => {
    const runtime = await freshRuntime();
    const first = pendingDialog();
    const second = pendingDialog();

    const ledger = runtime.requestPermission(null, 'filesystem.write', LEDGER, 'reason');
    const atlas = runtime.requestPermission(null, 'filesystem.write', ATLAS, 'reason');
    expect(showMessageBox).toHaveBeenCalledTimes(2);

    first.answer(0);
    second.answer(1);
    expect(await ledger).toBe('denied');
    expect(await atlas).toBe('granted');
  });

  it('does not ask again after a refusal, however often it is requested', async () => {
    const runtime = await freshRuntime();
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    expect(await runtime.requestPermission(null, 'shell.execute', LEDGER, 'reason')).toBe('denied');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await runtime.requestPermission(null, 'shell.execute', LEDGER, 'reason')).toBe(
        'denied',
      );
    }

    expect(showMessageBox).toHaveBeenCalledTimes(1);
  });

  // Any answer but the first button used to grant. A dialog that closes
  // without an answer, or a button index that is not on it, grants nothing.
  it('grants only on the button that says so, and nothing on any other answer', async () => {
    const answers: Array<[string, number, string]> = [
      ['filesystem.write', 1, 'granted'],
      ['filesystem.write', 2, 'granted'],
      ['filesystem.write', 3, 'denied'],
      ['filesystem.write', -1, 'denied'],
      ['shell.execute', 1, 'granted'],
      ['shell.execute', 2, 'denied'],
      ['shell.execute', 7, 'denied'],
    ];
    for (const [index, [capability, response, expected]] of answers.entries()) {
      const runtime = await freshRuntime();
      showMessageBox.mockResolvedValueOnce({ response, checkboxChecked: false });
      const scope = { ...LEDGER, target: `${LEDGER.target}-answer-${index}` };

      expect(
        await runtime.requestPermission(null, capability as never, scope, 'reason'),
        `${capability} ${response}`,
      ).toBe(expected);
    }
    const highRisk = (showMessageBox.mock.calls.at(-1) as unknown[])[0] as { buttons: string[] };
    expect(highRisk.buttons).toHaveLength(2);
  });

  it('asks in the name the rest of this app uses', async () => {
    const runtime = await freshRuntime();
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    await runtime.requestPermission(null, 'filesystem.write', LEDGER, 'reason');

    const options = (showMessageBox.mock.calls.at(-1) as unknown[])[0] as { message: string };
    expect(options.message).toMatch(/^Allow AGI Cloud to /u);
  });

  it('asks again once an open dialog has been answered and its answer withdrawn', async () => {
    const runtime = await freshRuntime();
    showMessageBox
      .mockResolvedValueOnce({ response: 1, checkboxChecked: false })
      .mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    expect(await runtime.requestPermission(null, 'filesystem.write', LEDGER, 'reason')).toBe(
      'granted',
    );
    runtime.revokePermission('filesystem.write', LEDGER);
    expect(await runtime.requestPermission(null, 'filesystem.write', LEDGER, 'reason')).toBe(
      'denied',
    );
    expect(showMessageBox).toHaveBeenCalledTimes(2);
  });
});

describe('grant revisions used by unattended local work', () => {
  it('keeps a session grant revision stable on ordinary use and changes it across revocation and regrant', async () => {
    const runtime = await freshRuntime();
    runtime.recordDecision('shell.execute', LEDGER, 'granted', 'session');
    const original = runtime.permissionRevision('shell.execute', LEDGER);
    runtime.consumeSingleUse('shell.execute', LEDGER);
    expect(runtime.permissionRevision('shell.execute', LEDGER)).toBe(original);
    runtime.revokeScope(LEDGER);
    runtime.recordDecision('shell.execute', LEDGER, 'granted', 'session');
    expect(runtime.permissionRevision('shell.execute', LEDGER)).toBeGreaterThan(original);
    expect(runtime.permissionRevision('shell.execute', ATLAS)).toBe(0);
  });
});
