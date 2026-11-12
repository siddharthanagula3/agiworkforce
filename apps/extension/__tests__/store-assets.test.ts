import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readPngSize } from '../store-assets/png-size.mjs';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

interface StoreAsset {
  path: string;
  width: number;
  height: number;
  kind: 'icon' | 'screenshot' | 'promo-small' | 'promo-marquee';
}

const assets = (
  JSON.parse(readFileSync(join(APP_ROOT, 'store-assets/assets.json'), 'utf8')) as {
    assets: StoreAsset[];
  }
).assets;
const listing = readFileSync(join(APP_ROOT, 'docs/chrome-web-store-listing.md'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('Chrome Web Store images', () => {
  it('lists the sizes the store accepts', () => {
    const sizes = (kind: StoreAsset['kind']) =>
      assets
        .filter((asset) => asset.kind === kind)
        .map((asset) => `${asset.width}x${asset.height}`);

    expect(sizes('icon')).toEqual(['128x128']);
    expect(sizes('promo-small')).toEqual(['440x280']);
    expect(sizes('promo-marquee')).toEqual(['1400x560']);
    const screenshots = sizes('screenshot');
    expect(screenshots.length).toBeGreaterThanOrEqual(1);
    expect(screenshots.length).toBeLessThanOrEqual(5);
    for (const size of screenshots) expect(['1280x800', '640x400']).toContain(size);
  });

  it('uses the manifest icon as the store icon', () => {
    const manifest = JSON.parse(readFileSync(join(APP_ROOT, 'manifest.json'), 'utf8')) as {
      icons: Record<string, string>;
    };
    expect(assets.find((asset) => asset.kind === 'icon')?.path).toBe(manifest.icons['128']);
  });

  for (const asset of assets) {
    it(`ships ${asset.path} at ${asset.width}x${asset.height}`, () => {
      const file = join(APP_ROOT, asset.path);
      expect(existsSync(file), `${asset.path} is missing, run pnpm store:assets`).toBe(true);
      expect(readPngSize(readFileSync(file))).toEqual({
        width: asset.width,
        height: asset.height,
      });
    });

    it(`documents ${asset.path} in the store listing`, () => {
      const row = listing.split('\n').find((line) => line.includes(`\`${asset.path}\``));
      expect(row, `${asset.path} is not in the listing's Store assets table`).toBeDefined();
      expect(row).toContain(`${asset.width}x${asset.height}`);
    });
  }

  it('keeps store-assets out of the store package', () => {
    const zipCommand = packageJson.scripts['package'] ?? '';
    expect(zipCommand).toContain('cd dist && zip -r ../extension.zip .');
    expect(zipCommand).not.toContain('store-assets');
    expect(readFileSync(join(APP_ROOT, 'vite.config.ts'), 'utf8')).not.toContain('store-assets');
  });

  it('regenerates the images with one package script', () => {
    expect(packageJson.scripts['store:assets']).toBe('node scripts/capture-store-screenshots.mjs');
  });
});
