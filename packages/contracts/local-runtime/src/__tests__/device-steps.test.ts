import { describe, expect, it } from 'vitest';
import {
  DEVICE_STEP_DEFINITIONS,
  DEVICE_STEP_TOOLS,
  DeviceStepRefused,
  MAX_DEVICE_COORDINATE,
  describeDeviceDisplays,
  describeDeviceStep,
  offeredDeviceStepTools,
  planDeviceStep,
  type DesktopHostDeclaration,
} from '../device-steps';

const SCREEN_TOOLS = DEVICE_STEP_TOOLS.filter(
  (tool) => DEVICE_STEP_DEFINITIONS[tool].scope === 'screen',
);

function declaration(overrides: Partial<DesktopHostDeclaration> = {}): DesktopHostDeclaration {
  return {
    deviceId: 'device-1',
    deviceName: "Sid's Mac",
    platform: 'darwin',
    appVersion: '1.2.0',
    capabilities: [],
    roots: [],
    ...overrides,
  };
}

describe('screen steps and the computer.use capability', () => {
  it('requires computer.use for every screen step', () => {
    expect(SCREEN_TOOLS.length).toBeGreaterThan(0);
    for (const tool of SCREEN_TOOLS) {
      expect(DEVICE_STEP_DEFINITIONS[tool].capability).toBe('computer.use');
    }
  });

  it('offers no screen step when computer.use is not granted', () => {
    const offered = offeredDeviceStepTools(
      declaration({
        capabilities: ['filesystem.read', 'shell.execute'],
        roots: [{ id: 'root-1', name: 'Notes', path: '/Users/sid/Notes' }],
      }),
    );
    for (const tool of SCREEN_TOOLS) expect(offered).not.toContain(tool);
    expect(offered).toContain('device_read_file');
  });

  it('offers every screen step on a grant with no folder, and no folder step', () => {
    const offered = offeredDeviceStepTools(declaration({ capabilities: ['computer.use'] }));
    expect([...offered].sort()).toEqual([...SCREEN_TOOLS].sort());
  });
});

describe('screen step arguments', () => {
  const roots: DesktopHostDeclaration['roots'] = [];

  it('refuses a coordinate that is not a number', () => {
    for (const bad of ['120', null, undefined, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => planDeviceStep('device_click', { x: bad, y: 10 }, roots)).toThrow(
        DeviceStepRefused,
      );
    }
  });

  it('refuses a coordinate off any real screen', () => {
    expect(() => planDeviceStep('device_click', { x: -1, y: 10 }, roots)).toThrow(
      DeviceStepRefused,
    );
    expect(() =>
      planDeviceStep('device_move', { x: MAX_DEVICE_COORDINATE + 1, y: 0 }, roots),
    ).toThrow(DeviceStepRefused);
    expect(() => planDeviceStep('device_drag', { x: 0, y: 0, toX: 10, toY: -5 }, roots)).toThrow(
      DeviceStepRefused,
    );
  });

  it('refuses a click count and a button the device cannot make', () => {
    expect(() => planDeviceStep('device_click', { x: 1, y: 1, count: 4 }, roots)).toThrow(
      DeviceStepRefused,
    );
    expect(() => planDeviceStep('device_click', { x: 1, y: 1, button: 'middle' }, roots)).toThrow(
      DeviceStepRefused,
    );
  });

  it('refuses an unknown key and an unknown modifier', () => {
    expect(() => planDeviceStep('device_key', { key: 'supr' }, roots)).toThrow(DeviceStepRefused);
    expect(() => planDeviceStep('device_key', { key: 'a', modifiers: ['meta'] }, roots)).toThrow(
      DeviceStepRefused,
    );
  });

  it('accepts a bounded screen step and rounds it to whole pixels', () => {
    expect(planDeviceStep('device_click', { x: 12.4, y: 40.6 }, roots)).toEqual({
      tool: 'device_click',
      x: 12,
      y: 41,
      button: 'left',
      count: 1,
    });
    expect(planDeviceStep('device_key', { key: 'Enter', modifiers: ['Command'] }, roots)).toEqual({
      tool: 'device_key',
      key: 'enter',
      modifiers: ['command'],
    });
  });

  it('needs no folder for a screen step and still needs one for a file step', () => {
    expect(planDeviceStep('device_screenshot', {}, roots)).toEqual({ tool: 'device_screenshot' });
    expect(() => planDeviceStep('device_read_file', { path: 'a.md' }, roots)).toThrow(
      DeviceStepRefused,
    );
  });
});

describe('screenshots across displays', () => {
  it('passes a named display through and leaves it out when none is named', () => {
    expect(planDeviceStep('device_screenshot', { display: 2 }, [])).toEqual({
      tool: 'device_screenshot',
      display: 2,
    });
    expect(planDeviceStep('device_screenshot', {}, [])).toEqual({ tool: 'device_screenshot' });
  });

  it('refuses a display that is not a whole non-negative number', () => {
    for (const bad of ['2', -1, Number.NaN]) {
      expect(() => planDeviceStep('device_screenshot', { display: bad }, [])).toThrow(
        DeviceStepRefused,
      );
    }
  });

  it('names the display in the approval text', () => {
    expect(describeDeviceStep({ tool: 'device_screenshot', display: 4 }, [])).toContain(
      'display 4',
    );
  });

  it('lists the other displays only when there is more than one', () => {
    const main = {
      id: 1,
      name: 'Built-in',
      width: 1512,
      height: 982,
      scaleFactor: 2,
      primary: true,
    };
    const side = {
      id: 4,
      name: 'Studio',
      width: 2560,
      height: 1440,
      scaleFactor: 1,
      primary: false,
    };
    expect(describeDeviceDisplays([main], 1)).toBe('');
    const text = describeDeviceDisplays([main, side], 4);
    expect(text).toContain('display 4 "Studio" 2560x1440 at 1x, captured');
    expect(text).toContain('primary');
  });
});
