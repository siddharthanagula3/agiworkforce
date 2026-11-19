import fs from 'node:fs';
import path from 'node:path';
import { OSS_LICENSE_BODIES, OSS_PACKAGES } from '../src/features/legal';

const pdfjsAssets = path.join(__dirname, '../assets/pdfjs');

describe('vendored pdf.js attribution', () => {
  const viewer = JSON.parse(fs.readFileSync(path.join(pdfjsAssets, 'pdf-viewer.json'), 'utf8')) as {
    pdfjsVersion: string;
  };
  const entry = OSS_PACKAGES.find((pkg) => pkg.name === 'pdfjs-dist');

  it('names the bundled reader in the in-app open source list at the version that is bundled', () => {
    expect(entry).toBeDefined();
    expect(entry?.version).toBe(viewer.pdfjsVersion);
    expect(entry?.license).toBe('Apache-2.0');
    expect(entry?.copyright).toMatch(/Mozilla Foundation/);
    expect(entry?.url).toBe('https://github.com/mozilla/pdf.js');
  });

  it('carries the Apache license text that ships with the bundled reader', () => {
    const body = OSS_LICENSE_BODIES[entry?.bodyId ?? ''];
    const shipped = fs.readFileSync(path.join(pdfjsAssets, 'LICENSE'), 'utf8');
    expect(body).toBeDefined();
    expect(body).toContain('Apache License');
    expect(body?.replace(/\s+/g, ' ')).toContain(shipped.replace(/\s+/g, ' ').trim().slice(0, 400));
  });
});
