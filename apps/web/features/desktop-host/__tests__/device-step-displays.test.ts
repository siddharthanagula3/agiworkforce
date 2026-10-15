import { afterEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@agiworkforce/local-runtime-contract');

const invokeRuntime = vi.fn();

vi.mock('@agiworkforce/local-runtime-contract', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, getHostBridge: () => ({ invokeRuntime }) };
});

const { executeDeviceStep } = await import('../lib/device-steps');

const capture = {
  imageBase64: 'AAAA',
  mimeType: 'image/png',
  width: 1280,
  height: 720,
  scaleFactor: 1,
  displayName: 'Studio Display',
  displayId: 4,
  displays: [
    { id: 1, name: 'Built-in', width: 1512, height: 982, scaleFactor: 2, primary: true },
    { id: 4, name: 'Studio Display', width: 2560, height: 1440, scaleFactor: 1, primary: false },
  ],
};

describe('device screenshots across displays', () => {
  afterEach(() => invokeRuntime.mockReset());

  it('asks the shell for the named display and tells the model which others exist', async () => {
    invokeRuntime.mockResolvedValue({ ok: true, value: capture });

    const outcome = await executeDeviceStep('device_screenshot', { display: 4 });

    expect(invokeRuntime).toHaveBeenCalledWith('computer_screenshot', { display: 4 });
    expect(outcome.isError).toBe(false);
    expect(outcome.content).toContain('2 displays are connected');
    expect(outcome.content).toContain('display 1 "Built-in" 1512x982 at 2x, primary');
  });

  // The desktop app asks its user once per task before the agent may use
  // the screen, and runs no screen step that names no task.
  it('names the task on a screen step and on no file step', async () => {
    invokeRuntime.mockResolvedValue({ ok: true, value: capture });
    await executeDeviceStep('device_screenshot', { display: 4 }, 'run-7');
    expect(invokeRuntime).toHaveBeenLastCalledWith('computer_screenshot', {
      display: 4,
      runId: 'run-7',
    });

    invokeRuntime.mockResolvedValue({ ok: true, value: true });
    await executeDeviceStep('device_click', { x: 1, y: 2 }, 'run-7');
    expect(invokeRuntime).toHaveBeenLastCalledWith(
      'computer_click',
      expect.objectContaining({ x: 1, y: 2, runId: 'run-7' }),
    );

    invokeRuntime.mockResolvedValue({ ok: true, value: { text: 'x', truncated: false } });
    await executeDeviceStep('device_read_file', { rootId: 'r', path: 'a.txt' }, 'run-7');
    expect(invokeRuntime).toHaveBeenLastCalledWith('file_read_text', {
      rootId: 'r',
      path: 'a.txt',
    });
  });

  it('sends no display when the step names none', async () => {
    invokeRuntime.mockResolvedValue({
      ok: true,
      value: { ...capture, displays: [capture.displays[0]] },
    });

    const outcome = await executeDeviceStep('device_screenshot', {});

    expect(invokeRuntime).toHaveBeenCalledWith('computer_screenshot', {});
    expect(outcome.content).not.toContain('displays are connected');
  });
});
