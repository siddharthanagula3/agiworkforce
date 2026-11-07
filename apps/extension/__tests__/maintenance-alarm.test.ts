import { describe, expect, it, vi } from 'vitest';
import { createMaintenanceAlarmController } from '../src/features/background/maintenance-alarm';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
}

function fixture(present = false) {
  let alarm: { periodInMinutes: number } | undefined = present ? { periodInMinutes: 1 } : undefined;
  const port = {
    periodInMinutes: 1,
    read: vi.fn(async () => alarm),
    create: vi.fn(async () => { alarm = { periodInMinutes: 1 }; }),
    clear: vi.fn(async () => { alarm = undefined; }),
    runPass: vi.fn(async () => false),
    onError: vi.fn(),
  };
  return { port, controller: createMaintenanceAlarmController(port), alarm: () => alarm };
}

describe('serialized demand-driven maintenance alarm', () => {
  it('clears a surviving startup alarm when idle', async () => {
    const f = fixture(true);
    await f.controller.settle();
    expect(f.alarm()).toBeUndefined();
    expect(f.port.clear).toHaveBeenCalledTimes(1);
  });

  it('preserves an existing matching alarm instead of resetting its deadline', async () => {
    const f = fixture(true);
    f.controller.requestWork();
    await flushMicrotasks();
    expect(f.port.read).toHaveBeenCalledTimes(1);
    expect(f.port.create).not.toHaveBeenCalled();
  });

  it('does not let an old empty pass erase newer demand, even when already armed', async () => {
    const f = fixture(true);
    const pass = deferred<boolean>();
    f.port.runPass.mockImplementationOnce(() => pass.promise);
    const settling = f.controller.settle();
    expect(f.controller.settle()).toBe(settling);
    f.controller.requestWork();
    pass.resolve(false);
    await settling;
    expect(f.port.clear).not.toHaveBeenCalled();
    expect(f.alarm()).toBeDefined();
  });

  it('finishes a pending clear before creating for newer demand', async () => {
    const f = fixture(true);
    const clearing = deferred<void>();
    const clear = f.port.clear.getMockImplementation()!;
    f.port.clear.mockImplementationOnce(async () => { await clearing.promise; await clear(); });
    const settling = f.controller.settle();
    await flushMicrotasks();
    f.controller.requestWork();
    await flushMicrotasks();
    expect(f.port.create).not.toHaveBeenCalled();
    clearing.resolve();
    await settling;
    expect(f.port.create).toHaveBeenCalledTimes(1);
    expect(f.alarm()).toBeDefined();
  });

  it('finishes a pending create before clearing after an idle pass', async () => {
    const f = fixture();
    const creating = deferred<void>();
    const create = f.port.create.getMockImplementation()!;
    f.port.create.mockImplementationOnce(async () => { await creating.promise; await create(); });
    f.controller.requestWork();
    await flushMicrotasks();
    const settling = f.controller.settle();
    await flushMicrotasks();
    expect(f.port.clear).not.toHaveBeenCalled();
    creating.resolve();
    await settling;
    expect(f.port.clear).toHaveBeenCalledTimes(1);
    expect(f.alarm()).toBeUndefined();
  });

  it('uses the latest demand after a delayed read', async () => {
    const f = fixture();
    const reading = deferred<{ periodInMinutes: number } | undefined>();
    f.port.read.mockImplementationOnce(() => reading.promise);
    const settling = f.controller.settle();
    await flushMicrotasks();
    f.controller.requestWork();
    reading.resolve(undefined);
    await settling;
    expect(f.alarm()).toBeDefined();
  });

  it.each(['read', 'create', 'clear'] as const)('exits on %s failure and retries only after a later event', async (operation) => {
    const f = fixture(operation === 'clear');
    f.port[operation].mockRejectedValueOnce(new Error('alarm API unavailable'));
    if (operation === 'clear') await f.controller.settle();
    else f.controller.requestWork();
    await flushMicrotasks();
    expect(f.port[operation]).toHaveBeenCalledTimes(1);
    expect(f.port.onError).toHaveBeenCalledTimes(1);
    await flushMicrotasks();
    expect(f.port[operation]).toHaveBeenCalledTimes(1);
    if (operation === 'clear') await f.controller.settle();
    else f.controller.requestWork();
    await flushMicrotasks();
    expect(f.port[operation]).toHaveBeenCalledTimes(2);
  });

  it('keeps outstanding scheduled or native work on the same alarm', async () => {
    const f = fixture();
    f.port.runPass.mockResolvedValueOnce(true);
    await f.controller.settle();
    expect(f.alarm()).toBeDefined();
  });
});
