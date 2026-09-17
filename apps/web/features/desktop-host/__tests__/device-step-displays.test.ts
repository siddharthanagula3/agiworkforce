import { afterEach, describe, expect, it, vi } from 'vitest';

const invokeRuntime = vi.fn();

vi.mock('@agiworkforce/local-runtime-contract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/local-runtime-contract')>();
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
