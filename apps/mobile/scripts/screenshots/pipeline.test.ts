import { homedir } from 'node:os';

import {
  DEVICES,
  resolveSimulatorUdid,
  type SimctlDevice,
  type SimctlDeviceListing,
} from './pipeline';

const IOS_26_1 = 'com.apple.CoreSimulator.SimRuntime.iOS-26-1';
const IOS_26_2 = 'com.apple.CoreSimulator.SimRuntime.iOS-26-2';
const IOS_26_5 = 'com.apple.CoreSimulator.SimRuntime.iOS-26-5';

const IPHONE_17_PRO = 'iPhone 17 Pro';
const IPHONE_17_PRO_MAX = 'iPhone 17 Pro Max';
const IPAD_PRO_13 = 'iPad Pro 13-inch (M5)';
const IPAD_PRO_11 = 'iPad Pro 11-inch (M5)';
const IPAD_MINI = 'iPad mini (A17 Pro)';

const IOS_26_5_UDIDS: Record<string, string> = {
  [IPHONE_17_PRO]: 'D9C4CFCE-5886-43A8-8F96-12F6E8540766',
  [IPHONE_17_PRO_MAX]: '7EEC7350-5419-47F1-BF42-ACD59FD6291D',
  [IPAD_PRO_13]: '38A8EA8F-3EAA-4A24-8B74-A51024BCAE2E',
  [IPAD_PRO_11]: 'D19A8C91-0219-4953-8535-8611C50847D7',
  [IPAD_MINI]: 'F3286B1C-8AE2-4669-B827-2EEC14F2110D',
};

const IOS_26_2_UDIDS: Record<string, string> = {
  [IPHONE_17_PRO]: 'BB6F69E0-B89E-4243-B81F-83A8C16D5D61',
  [IPHONE_17_PRO_MAX]: '26542FFB-D8A1-4C10-9D13-180E6F067BAD',
  [IPAD_PRO_13]: '347F3315-AEC2-4681-86BB-29C40D2408AD',
  [IPAD_PRO_11]: '2FF5F875-AA4C-4BE3-8BA3-0301C8EC805F',
};

const DEVICE_TYPES: Record<string, string> = {
  [IPHONE_17_PRO]: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro',
  [IPHONE_17_PRO_MAX]: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max',
  [IPAD_PRO_13]: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB',
  [IPAD_PRO_11]: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M5-12GB',
  [IPAD_MINI]: 'com.apple.CoreSimulator.SimDeviceType.iPad-mini-A17-Pro',
};

const DATA_PATH_SIZE = 18337792;
const LOG_PATH_SIZE = 516096;

function simDevice(
  udid: string,
  name: string,
  overrides: Partial<SimctlDevice> = {},
): SimctlDevice {
  return {
    lastBootedAt: '2026-08-21T03:07:30Z',
    dataPath: `${homedir()}/Library/Developer/CoreSimulator/Devices/${udid}/data`,
    dataPathSize: DATA_PATH_SIZE,
    logPath: `${homedir()}/Library/Logs/CoreSimulator/${udid}`,
    logPathSize: LOG_PATH_SIZE,
    udid,
    isAvailable: true,
    deviceTypeIdentifier: DEVICE_TYPES[name],
    state: 'Shutdown',
    name,
    ...overrides,
  };
}

function listing(): SimctlDeviceListing {
  return {
    devices: {
      [IOS_26_2]: Object.entries(IOS_26_2_UDIDS).map(([name, udid]) => simDevice(udid, name)),
      [IOS_26_5]: Object.entries(IOS_26_5_UDIDS).map(([name, udid]) => simDevice(udid, name)),
      [IOS_26_1]: [],
    },
  };
}

describe('resolveSimulatorUdid', () => {
  it('picks the newest runtime when the device name is duplicated across runtimes', () => {
    for (const name of [IPHONE_17_PRO, IPHONE_17_PRO_MAX, IPAD_PRO_13, IPAD_PRO_11]) {
      expect(resolveSimulatorUdid(listing(), name)).toBe(IOS_26_5_UDIDS[name]);
    }
  });

  it('gives every configured ios device class its own simulator', () => {
    const iosDevices = DEVICES.filter((d) => d.platform === 'ios');
    const udids = iosDevices.map((d) => resolveSimulatorUdid(listing(), d.simulator));
    expect(udids).toEqual(iosDevices.map((d) => IOS_26_5_UDIDS[d.simulator]));
    expect(new Set(udids).size).toBe(iosDevices.length);
  });

  it('compares runtime versions numerically rather than lexically', () => {
    const withTwoDigitPatch: SimctlDeviceListing = {
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-26-10': [simDevice('NEWEST', IPHONE_17_PRO)],
        'com.apple.CoreSimulator.SimRuntime.iOS-26-9': [simDevice('OLDER', IPHONE_17_PRO)],
      },
    };
    expect(resolveSimulatorUdid(withTwoDigitPatch, IPHONE_17_PRO)).toBe('NEWEST');
  });

  it('resolves a device that exists on only one runtime', () => {
    expect(resolveSimulatorUdid(listing(), IPAD_MINI)).toBe(IOS_26_5_UDIDS[IPAD_MINI]);
  });

  it('ignores devices the runtime reports as unavailable', () => {
    const unavailableOnNewest = listing();
    unavailableOnNewest.devices[IOS_26_5] = unavailableOnNewest.devices[IOS_26_5].map((device) =>
      device.name === IPHONE_17_PRO ? { ...device, isAvailable: false } : device,
    );
    expect(resolveSimulatorUdid(unavailableOnNewest, IPHONE_17_PRO)).toBe(
      IOS_26_2_UDIDS[IPHONE_17_PRO],
    );
  });

  it('resolves duplicates within a single runtime the same way regardless of listing order', () => {
    const first = simDevice('0A0A0A0A-0000-4000-8000-000000000001', IPHONE_17_PRO);
    const second = simDevice('F0F0F0F0-0000-4000-8000-000000000002', IPHONE_17_PRO);
    const forward: SimctlDeviceListing = { devices: { [IOS_26_5]: [first, second] } };
    const reversed: SimctlDeviceListing = { devices: { [IOS_26_5]: [second, first] } };
    expect(resolveSimulatorUdid(forward, IPHONE_17_PRO)).toBe(first.udid);
    expect(resolveSimulatorUdid(reversed, IPHONE_17_PRO)).toBe(first.udid);
  });

  it('throws a message naming the device when nothing matches', () => {
    expect(() => resolveSimulatorUdid(listing(), 'iPhone 42 Pro')).toThrow(/iPhone 42 Pro/u);
  });

  it('throws when the runtime bucket for the device is empty', () => {
    expect(() => resolveSimulatorUdid({ devices: { [IOS_26_1]: [] } }, IPHONE_17_PRO)).toThrow(
      /iPhone 17 Pro/u,
    );
  });
});
