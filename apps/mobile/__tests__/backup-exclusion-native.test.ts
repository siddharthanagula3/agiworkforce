import fs from 'fs';
import path from 'path';
import { NativeModules, Platform } from 'react-native';
import { excludeFromBackup } from '@/src/platform/backupExclusion';

const nativeRoot = path.join(__dirname, '..', 'native', 'ios');
const readNative = (relPath: string) => fs.readFileSync(path.join(nativeRoot, relPath), 'utf8');

describe('AGIBackupExclusion native module', () => {
  it('is copied into the app target by the native modules plugin', () => {
    const plugin = readNative('withAGINativeModulesIOS.cjs');
    const list = plugin.slice(
      plugin.indexOf('const TOP_LEVEL_FILES = ['),
      plugin.indexOf('];', plugin.indexOf('const TOP_LEVEL_FILES = [')),
    );
    expect(list).toContain("'AGIBackupExclusion.m'");
    expect(list).toContain("'AGIBackupExclusion.swift'");
  });

  it('declares the same selector in the bridge and the Swift class', () => {
    const bridge = readNative('AGIBackupExclusion.m');
    const swift = readNative('AGIBackupExclusion.swift');
    expect(bridge).toContain('RCT_EXTERN_MODULE(AGIBackupExclusion, NSObject)');
    expect(bridge).toMatch(
      /RCT_EXTERN_METHOD\(excludeFromBackup:\(NSArray<NSString \*> \*\)uris\s+resolve:/,
    );
    expect(swift).toContain('@objc(AGIBackupExclusion)');
    expect(swift).toContain('@objc(excludeFromBackup:resolve:reject:)');
  });

  it('sets the resource value Apple documents for backup exclusion and stays inside the app', () => {
    const swift = readNative('AGIBackupExclusion.swift');
    expect(swift).toContain('values.isExcludedFromBackup = true');
    expect(swift).toContain('setResourceValues(values)');
    expect(swift).toContain('NSHomeDirectory()');
    expect(swift).not.toMatch(/removeItem|moveItem/);
  });
});

describe('excludeFromBackup', () => {
  const original = NativeModules.AGIBackupExclusion;

  afterEach(() => {
    NativeModules.AGIBackupExclusion = original;
  });

  it('passes every path to the native module on iOS', async () => {
    const native = { excludeFromBackup: jest.fn().mockResolvedValue(2) };
    NativeModules.AGIBackupExclusion = native;
    await excludeFromBackup(['file:///documents/models/']);
    expect(Platform.OS).toBe('ios');
    expect(native.excludeFromBackup).toHaveBeenCalledWith(['file:///documents/models/']);
  });

  it('fails visibly when the iOS build does not include the module', async () => {
    NativeModules.AGIBackupExclusion = undefined;
    await expect(excludeFromBackup(['file:///documents/models/'])).rejects.toThrow(
      'rebuild the iOS app',
    );
  });
});
