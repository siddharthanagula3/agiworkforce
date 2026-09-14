import { describe, expect, it } from 'vitest';
import {
  DEVICE_HOST_HEADER,
  encodeDesktopHostDeclaration,
  parseDesktopHostDeclaration,
  planDeviceStep,
  type DesktopHostDeclaration,
} from '@agiworkforce/local-runtime-contract';
import { deviceStepToolDefs } from '../device-tools';

const DECLARATION: DesktopHostDeclaration = {
  deviceId: 'device-abc',
  deviceName: 'Work MacBook',
  platform: 'darwin',
  appVersion: '1.2.3',
  capabilities: ['filesystem.read', 'shell.execute'],
  roots: [{ id: 'root-1', name: 'Documents', path: '/Users/qa/Documents' }],
};

describe('device tool offering', () => {
  it('offers only the tools the declared capabilities cover', () => {
    const names = deviceStepToolDefs(DECLARATION).map((tool) => tool.function.name);
    expect(names).toEqual(['device_read_file', 'device_list_folder', 'device_run_command']);
    expect(names).not.toContain('device_write_file');
  });

  it('offers nothing when no folder is granted', () => {
    expect(deviceStepToolDefs({ ...DECLARATION, roots: [] })).toEqual([]);
  });

  it('offers nothing when every device capability is refused', () => {
    expect(deviceStepToolDefs({ ...DECLARATION, capabilities: ['microphone'] })).toEqual([]);
  });

  it('binds the folder choice to the granted roots', () => {
    const read = deviceStepToolDefs(DECLARATION).find(
      (tool) => tool.function.name === 'device_read_file',
    );
    const properties = read?.function.parameters['properties'] as Record<
      string,
      Record<string, unknown>
    >;
    expect(properties['rootId']?.['enum']).toEqual(['root-1']);
  });
});

describe('desktop host declaration', () => {
  it('round-trips through the header', () => {
    const parsed = parseDesktopHostDeclaration(encodeDesktopHostDeclaration(DECLARATION));
    expect(parsed).toEqual(DECLARATION);
    expect(DEVICE_HOST_HEADER).toBe('x-agi-device-host');
  });

  it('drops a declaration that is not an object, is oversized, or names no device', () => {
    expect(parseDesktopHostDeclaration(null)).toBeNull();
    expect(parseDesktopHostDeclaration('[]')).toBeNull();
    expect(parseDesktopHostDeclaration('not json')).toBeNull();
    expect(parseDesktopHostDeclaration('x'.repeat(4_001))).toBeNull();
    expect(
      parseDesktopHostDeclaration(
        JSON.stringify({ ...DECLARATION, deviceId: '', capabilities: [], roots: [] }),
      ),
    ).toBeNull();
  });

  it('discards capability names it does not know', () => {
    const parsed = parseDesktopHostDeclaration(
      JSON.stringify({ ...DECLARATION, capabilities: ['filesystem.read', 'launch.missiles'] }),
    );
    expect(parsed?.capabilities).toEqual(['filesystem.read']);
  });
});

describe('planning a step', () => {
  it('refuses a folder the declaration never granted', () => {
    expect(() =>
      planDeviceStep('device_read_file', { rootId: 'root-9', path: 'notes.md' }, DECLARATION.roots),
    ).toThrow(/not one the user granted/i);
  });

  it('refuses a tool that is not a device step', () => {
    expect(() => planDeviceStep('web_search', { rootId: 'root-1' }, DECLARATION.roots)).toThrow(
      /not a device step/i,
    );
  });

  it('refuses a read with no path and a command with no command line', () => {
    expect(() =>
      planDeviceStep('device_read_file', { rootId: 'root-1' }, DECLARATION.roots),
    ).toThrow(/needs a "path"/i);
    expect(() =>
      planDeviceStep('device_run_command', { rootId: 'root-1' }, DECLARATION.roots),
    ).toThrow(/needs a "command"/i);
  });
});
