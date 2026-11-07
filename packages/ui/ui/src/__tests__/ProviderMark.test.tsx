import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { siLmstudio, siZdotai } from 'simple-icons';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { ProviderMark, hasProviderMark } from '../ProviderMark';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const PROVIDERS = [
  ['zhipu', siZdotai],
  ['lmstudio', siLmstudio],
] as const;

afterEach(cleanup);

describe('official provider marks', () => {
  it.each(PROVIDERS)(
    'draws %s with the installed official path and inherited theme color',
    (id, icon) => {
      expect(hasProviderMark(id)).toBe(true);
      expect(hasProviderMark(id.toUpperCase())).toBe(true);
      const { container } = render(<ProviderMark providerKey={id} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('fill')).toBe('currentColor');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg?.querySelector('path')?.getAttribute('d')).toBe(icon.path);
      expect(container.querySelector('text, img, script, foreignObject')).toBeNull();
    },
  );

  it.each(PROVIDERS)('ships the official %s vector in both static consumers', (id, icon) => {
    for (const folder of ['apps/web/public/providers', 'apps/extension/icons/providers']) {
      const source = readFileSync(join(ROOT, folder, `${id}.svg`), 'utf8');
      const document = new DOMParser().parseFromString(source, 'image/svg+xml');
      expect(document.querySelector('parsererror')).toBeNull();
      expect(document.querySelector('svg path')?.getAttribute('d')).toBe(icon.path);
      expect(document.querySelector('text, script, foreignObject, image, use')).toBeNull();
      for (const node of document.querySelectorAll('*')) {
        for (const attribute of node.attributes) {
          expect(attribute.name).not.toMatch(/^(?:on|href|src)/u);
        }
      }
    }
  });

  it.each(['apps/web', 'apps/extension'])(
    'checks %s generated assets without rewriting them',
    (app) => {
      const folder = app === 'apps/web' ? 'public/providers' : 'icons/providers';
      const files = PROVIDERS.map(([id]) => join(ROOT, app, folder, `${id}.svg`));
      const before = files.map((file) => ({
        source: readFileSync(file, 'utf8'),
        modified: statSync(file).mtimeMs,
      }));
      const result = spawnSync(
        process.execPath,
        [
          join(ROOT, app, 'scripts/vendor-provider-icons.mjs'),
          '--check',
          ...PROVIDERS.map(([id]) => id),
        ],
        { cwd: ROOT, encoding: 'utf8' },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(
        files.map((file) => ({
          source: readFileSync(file, 'utf8'),
          modified: statSync(file).mtimeMs,
        })),
      ).toEqual(before);
    },
  );
});
