import { spawnSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';

type PlatformSpec = Record<string, unknown>;

function codeFontOn(os: 'ios' | 'android'): string {
  let value = '';
  jest.isolateModules(() => {
    const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
    Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
    Object.defineProperty(Platform, 'select', {
      value: (spec: PlatformSpec) =>
        os in spec ? spec[os] : 'native' in spec ? spec.native : spec.default,
      configurable: true,
    });
    value = (
      jest.requireActual('../src/ui/theme/codeFont') as typeof import('../src/ui/theme/codeFont')
    ).codeFontFamily;
  });
  return value;
}

describe('code font token', () => {
  it('is Menlo on iOS and the system monospaced face on Android, which has no Menlo', () => {
    expect(codeFontOn('ios')).toBe('Menlo');
    expect(codeFontOn('android')).toBe('monospace');
  });

  it('keeps the tokens module loadable by the Tailwind config that Metro reads in plain Node', () => {
    const root = path.join(__dirname, '..');
    const tokensSource = fs.readFileSync(
      path.join(root, 'src', 'ui', 'theme', 'tokens.ts'),
      'utf8',
    );
    expect(tokensSource).not.toMatch(
      /from\s+['"]react-native['"]|require\(\s*['"]react-native['"]/,
    );

    const result = spawnSync(
      process.execPath,
      ['-e', "require('tailwindcss/loadConfig')(require.resolve('./tailwind.config.js'))"],
      { cwd: root, encoding: 'utf8' },
    );
    expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr }).toEqual({
      status: 0,
      stderr: '',
    });
  });

  it('is the only place a screen names a monospaced face', () => {
    const root = path.join(__dirname, '..');
    const owner = path.join('src', 'ui', 'theme', 'tokens.ts');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const relative = path.relative(root, full);
        if (relative === owner) continue;
        if (/['"](Menlo|Courier|monospace)['"]/.test(fs.readFileSync(full, 'utf8'))) {
          offenders.push(relative);
        }
      }
    };
    walk(path.join(root, 'app'));
    walk(path.join(root, 'src'));
    walk(path.join(root, 'components'));
    expect(offenders).toEqual([]);
  });
});
