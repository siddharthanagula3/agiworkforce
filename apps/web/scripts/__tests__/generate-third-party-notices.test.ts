// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { cargoRuntimeClosure, packageRootOfModule } from '../generate-third-party-notices.mjs';

describe('generate-third-party-notices', () => {
  it('maps a bundled module path to its package root, scoped or not', () => {
    expect(
      packageRootOfModule('node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/index.js'),
    ).toBe('node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode');
    expect(packageRootOfModule('node_modules/.pnpm/x/node_modules/@scope/pkg/dist/a.js')).toBe(
      'node_modules/.pnpm/x/node_modules/@scope/pkg',
    );
    expect(packageRootOfModule('packages/contracts/types/src/index.ts')).toBeNull();
  });

  it('follows only runtime cargo edges and leaves out workspace crates', () => {
    const metadata = {
      packages: [
        { id: 'cli', name: 'agiworkforce-cli', source: null },
        { id: 'proto', name: 'agiworkforce-protocol', source: null },
        { id: 'serde', name: 'serde', source: 'registry' },
        { id: 'itoa', name: 'itoa', source: 'registry' },
        { id: 'cc', name: 'cc', source: 'registry' },
        { id: 'tempfile', name: 'tempfile', source: 'registry' },
      ],
      resolve: {
        nodes: [
          {
            id: 'cli',
            deps: [
              { pkg: 'proto', dep_kinds: [{ kind: null }] },
              { pkg: 'cc', dep_kinds: [{ kind: 'build' }] },
              { pkg: 'tempfile', dep_kinds: [{ kind: 'dev' }] },
            ],
          },
          { id: 'proto', deps: [{ pkg: 'serde', dep_kinds: [{ kind: null }] }] },
          { id: 'serde', deps: [{ pkg: 'itoa', dep_kinds: [{ kind: null }, { kind: 'dev' }] }] },
        ],
      },
    };
    expect(
      cargoRuntimeClosure(metadata, 'agiworkforce-cli')
        .map((pkg: { name: string }) => pkg.name)
        .sort(),
    ).toEqual(['itoa', 'serde']);
  });
});
