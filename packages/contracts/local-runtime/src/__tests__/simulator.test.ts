import { describe, expect, it } from 'vitest';
import {
  SIMULATOR_COMMANDS,
  isSimulatorAppearance,
  isSimulatorCaptureId,
  isSimulatorCommand,
  isSimulatorStatusBar,
  isSimulatorUdid,
  readSimulatorDevices,
  simulatorRuntimeLabel,
} from '../simulator';

const IOS_26_5 = 'com.apple.CoreSimulator.SimRuntime.iOS-26-5';
const IOS_18 = 'com.apple.CoreSimulator.SimRuntime.iOS-18-0';
const UDID_A = 'A1B2C3D4-0000-4000-8000-000000000001';
const UDID_B = 'A1B2C3D4-0000-4000-8000-000000000002';
const UDID_C = 'A1B2C3D4-0000-4000-8000-000000000003';
const UDID_D = 'A1B2C3D4-0000-4000-8000-000000000004';

const device = (udid: unknown, name: unknown, state = 'Shutdown') => ({
  udid,
  name,
  state,
  isAvailable: true,
});

describe('the name of a simulator system', () => {
  it('says an iOS runtime as people do', () => {
    expect(simulatorRuntimeLabel(IOS_26_5)).toBe('iOS 26.5');
    expect(simulatorRuntimeLabel(IOS_18)).toBe('iOS 18.0');
    expect(simulatorRuntimeLabel('com.apple.CoreSimulator.SimRuntime.iOS-17')).toBe('iOS 17');
    expect(simulatorRuntimeLabel('com.apple.CoreSimulator.SimRuntime.iOS-17-5-1')).toBe(
      'iOS 17.5.1',
    );
  });

  it('names no other system', () => {
    for (const other of [
      'com.apple.CoreSimulator.SimRuntime.watchOS-11-0',
      'com.apple.CoreSimulator.SimRuntime.tvOS-18-0',
      'com.apple.CoreSimulator.SimRuntime.xrOS-2-0',
      'com.apple.CoreSimulator.SimRuntime.iOS-',
      'com.apple.CoreSimulator.SimRuntime.iOS-26-5-extra',
      'iOS-26-5',
      '',
    ]) {
      expect(simulatorRuntimeLabel(other), other).toBeNull();
    }
  });
});

describe('the devices a simulator listing yields', () => {
  it('keeps only available iOS devices with a well-formed identifier', () => {
    const devices = readSimulatorDevices({
      devices: {
        [IOS_26_5]: [
          device(UDID_A, 'iPhone 17 Pro'),
          { ...device(UDID_B, 'iPhone 17'), isAvailable: false },
          device('not-a-udid', 'iPhone Air'),
          device(UDID_C, ''),
          device(UDID_D, 42),
          null,
          'text',
        ],
        'com.apple.CoreSimulator.SimRuntime.watchOS-11-0': [device(UDID_B, 'Apple Watch')],
        'com.apple.CoreSimulator.SimRuntime.tvOS-18-0': [device(UDID_C, 'Apple TV')],
        'com.apple.CoreSimulator.SimRuntime.xrOS-2-0': [device(UDID_D, 'Apple Vision Pro')],
      },
    });

    expect(devices).toEqual([
      { udid: UDID_A, name: 'iPhone 17 Pro', runtime: 'iOS 26.5', booted: false },
    ]);
  });

  it('treats availability as true only when the listing says true', () => {
    for (const isAvailable of [undefined, 'true', 1, null, false]) {
      expect(
        readSimulatorDevices({
          devices: { [IOS_26_5]: [{ ...device(UDID_A, 'iPhone', 'Booted'), isAvailable }] },
        }),
        String(isAvailable),
      ).toEqual([]);
    }
  });

  it('puts booted devices first, then the newest system, then the name', () => {
    const devices = readSimulatorDevices({
      devices: {
        [IOS_18]: [device(UDID_A, 'iPhone 16')],
        [IOS_26_5]: [
          device(UDID_B, 'iPhone 17'),
          device(UDID_C, 'iPad Pro'),
          device(UDID_D, 'iPhone 15', 'Booted'),
        ],
      },
    });

    expect(devices.map((entry) => entry.name)).toEqual([
      'iPhone 15',
      'iPad Pro',
      'iPhone 17',
      'iPhone 16',
    ]);
    expect(devices[0]).toMatchObject({ booted: true, runtime: 'iOS 26.5' });
    expect(devices.slice(1).every((entry) => !entry.booted)).toBe(true);
  });

  it('orders system versions by number, not by text', () => {
    const devices = readSimulatorDevices({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-9-3': [device(UDID_A, 'iPhone 6')],
        'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [device(UDID_B, 'iPhone 16')],
      },
    });
    expect(devices.map((entry) => entry.runtime)).toEqual(['iOS 18.0', 'iOS 9.3']);
  });

  it('answers with nothing for input that is not a listing', () => {
    for (const garbage of [
      null,
      undefined,
      42,
      'devices',
      [],
      {},
      { devices: null },
      { devices: [] },
      { devices: 'x' },
      { devices: { [IOS_26_5]: 'not a list' } },
      { devices: { [IOS_26_5]: { udid: UDID_A } } },
    ]) {
      expect(readSimulatorDevices(garbage), JSON.stringify(garbage)).toEqual([]);
    }
  });
});

describe('the identifiers the simulator commands accept', () => {
  it('accepts a device identifier in either case and nothing else', () => {
    expect(isSimulatorUdid(UDID_A)).toBe(true);
    expect(isSimulatorUdid(UDID_A.toLowerCase())).toBe(true);
    for (const bad of [
      '',
      'booted',
      '../../x',
      `${UDID_A} `,
      `${UDID_A}\n`,
      UDID_A.slice(1),
      5,
      null,
    ]) {
      expect(isSimulatorUdid(bad), String(bad)).toBe(false);
    }
  });

  it('accepts only a lower-case capture identifier, never a path', () => {
    const id = '0b9e6c1a-2f4d-4a3b-9c8d-1e2f3a4b5c6d';
    expect(isSimulatorCaptureId(id)).toBe(true);
    for (const bad of [
      id.toUpperCase(),
      '../../etc/passwd',
      `${id}.png`,
      `../${id}`,
      `${id}/..`,
      '',
      7,
      undefined,
    ]) {
      expect(isSimulatorCaptureId(bad), String(bad)).toBe(false);
    }
  });

  it('knows each listed command and no other', () => {
    for (const command of SIMULATOR_COMMANDS)
      expect(isSimulatorCommand(command), command).toBe(true);
    for (const other of ['simulator_unknown', 'browser_pane_state', 'constructor', '']) {
      expect(isSimulatorCommand(other), other).toBe(false);
    }
  });

  it('accepts only the listed appearances and status bars', () => {
    expect(isSimulatorAppearance('dark')).toBe(true);
    expect(isSimulatorAppearance('light')).toBe(true);
    expect(isSimulatorAppearance('auto')).toBe(false);
    expect(isSimulatorAppearance(undefined)).toBe(false);
    expect(isSimulatorStatusBar('clean')).toBe(true);
    expect(isSimulatorStatusBar('live')).toBe(true);
    expect(isSimulatorStatusBar('override')).toBe(false);
    expect(isSimulatorStatusBar(1)).toBe(false);
  });
});
