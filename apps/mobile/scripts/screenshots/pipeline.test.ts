import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { SCREENSHOTS, VERIFY_SCREENSHOT, deviceForClassName } from './catalog';
import {
  DEVICES,
  resolveAndroidAvd,
  resolveSimulatorUdid,
  type SimctlDevice,
  type SimctlDeviceListing,
} from './pipeline';

const MOBILE_ROOT = resolve(__dirname, '..', '..');
const SPEC_DIR = join(MOBILE_ROOT, 'scripts', 'screenshots', 'specs');

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

describe('resolveAndroidAvd', () => {
  it('returns the avd when the emulator reports it', () => {
    expect(resolveAndroidAvd(['pixel_8_api_34', 'pixel_tablet_api_34'], 'pixel_8_api_34')).toBe(
      'pixel_8_api_34',
    );
  });

  it('throws naming the requested avd and what is actually available', () => {
    expect(() => resolveAndroidAvd(['pixel_6_api_33'], 'pixel_8_api_34')).toThrow(
      /pixel_8_api_34[\s\S]*pixel_6_api_33/u,
    );
  });

  it('reports an empty device manager rather than matching nothing', () => {
    expect(() => resolveAndroidAvd([], 'pixel_8_api_34')).toThrow(/\(none\)/u);
  });
});

describe('screenshot catalog', () => {
  const allShots = [...SCREENSHOTS, VERIFY_SCREENSHOT];

  it('points every screenshot at a spec file that exists', () => {
    for (const shot of allShots) {
      expect(existsSync(join(SPEC_DIR, shot.spec))).toBe(true);
    }
  });

  it('names each capture exactly as its spec calls device.takeScreenshot', () => {
    for (const shot of allShots) {
      const source = readFileSync(join(SPEC_DIR, shot.spec), 'utf8');
      const captured = [...source.matchAll(/device\.takeScreenshot\(\s*'([^']+)'/gu)].map(
        (match) => match[1],
      );
      expect(captured.length).toBeGreaterThan(0);
      expect(captured).toContain(`${shot.id}-${shot.name}`);
    }
  });

  it('gives every device class a distinct name and a positive store-conformant size', () => {
    expect(new Set(DEVICES.map((d) => d.className)).size).toBe(DEVICES.length);
    for (const device of DEVICES) {
      expect(device.width).toBeGreaterThanOrEqual(320);
      expect(device.height).toBeGreaterThanOrEqual(320);
      expect(device.width).toBeLessThanOrEqual(3840);
      expect(device.height).toBeLessThanOrEqual(3840);
      expect(deviceForClassName(device.className)).toBe(device);
    }
  });

  it('carries the three device classes the stores require, at their exact required sizes', () => {
    expect(deviceForClassName('iphone-17-pro-max')).toMatchObject({ width: 1320, height: 2868 });
    expect(deviceForClassName('ipad-pro-13')).toMatchObject({ width: 2048, height: 2732 });
    expect(deviceForClassName('phone')).toMatchObject({ width: 1080, height: 1920 });
    for (const className of ['iphone-17-pro-max', 'ipad-pro-13', 'phone']) {
      expect(deviceForClassName(className)?.storeSlot).toEqual(expect.stringMatching(/required/u));
    }
  });

  it('keeps every Play screenshot at the 9:16 ratio the console enforces', () => {
    for (const device of DEVICES.filter((d) => d.platform === 'android')) {
      expect(device.width / device.height).toBeCloseTo(9 / 16, 5);
    }
  });
});

describe('pipeline wiring', () => {
  it('resolves the compositor to a file that exists', () => {
    expect(existsSync(join(MOBILE_ROOT, 'scripts', 'screenshots', 'compositor.ts'))).toBe(true);
  });

  it('shares the detox env names with detox.config.js instead of re-inlining them', () => {
    const config = readFileSync(join(MOBILE_ROOT, 'detox.config.js'), 'utf8');
    expect(config).toContain("require('./detox.env')");
    expect(config).not.toMatch(/process\.env\.DETOX_/u);
  });

  it('declares a detox configuration for every platform and variant the pipeline can request', () => {
    const config = readFileSync(join(MOBILE_ROOT, 'detox.config.js'), 'utf8');
    for (const name of [
      'ios.sim.debug',
      'ios.sim.release',
      'android.emu.debug',
      'android.emu.release',
    ]) {
      expect(config).toContain(`'${name}'`);
    }
  });

  it('keeps the app identifier in detox.env equal to both native identifiers', () => {
    const { APP_BUNDLE_ID } = require('../../detox.env');
    const appConfig = readFileSync(join(MOBILE_ROOT, 'app.config.js'), 'utf8');
    expect(appConfig).toContain(`bundleIdentifier: '${APP_BUNDLE_ID}'`);
    expect(appConfig).toContain(`package: '${APP_BUNDLE_ID}'`);
  });
});
