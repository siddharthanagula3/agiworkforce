import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const builderConfig = readFileSync(resolve(process.cwd(), 'electron-builder.yml'), 'utf8');

function fuses(): Record<string, string> {
  const block = /^electronFuses:\n((?: {2}\S.*\n)+)/m.exec(builderConfig);
  expect(block, 'electronFuses block').not.toBeNull();
  return Object.fromEntries(
    block![1]!
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/:\s*/) as [string, string]),
  );
}

describe('Electron fuses flipped at package time', () => {
  it('closes the Node entry points a local attacker could use to run code as the app', () => {
    expect(fuses()).toMatchObject({
      enableNodeOptionsEnvironmentVariable: 'false',
      enableNodeCliInspectArguments: 'false',
      grantFileProtocolExtraPrivileges: 'false',
    });
  });

  it('binds the binary to the signed archive and encrypts cookies', () => {
    expect(fuses()).toMatchObject({
      enableEmbeddedAsarIntegrityValidation: 'true',
      onlyLoadAppFromAsar: 'true',
      enableCookieEncryption: 'true',
    });
  });

  it('keeps run-as-node only while the browser host launcher depends on it', () => {
    const launcher = readFileSync(
      resolve(process.cwd(), 'electron/browser/hostInstaller.ts'),
      'utf8',
    );
    expect(fuses()['runAsNode']).toBe(
      launcher.includes('ELECTRON_RUN_AS_NODE=1') ? 'true' : 'false',
    );
  });

  it('packs the app into an archive, which the asar-only fuse requires', () => {
    expect(builderConfig).not.toMatch(/^asar:\s*false/m);
  });
});
