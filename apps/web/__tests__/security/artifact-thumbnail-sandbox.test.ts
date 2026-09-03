import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB_ROOT = join(__dirname, '..', '..');

const THUMBNAIL_SOURCES = [
  'app/gallery/GalleryClient.tsx',
  'features/chat/components/artifacts/InlineArtifactCards.tsx',
];

const INTERACTIVE_VIEWER = 'features/chat/components/artifacts/ArtifactPreview.tsx';

function read(relative: string): string {
  return readFileSync(join(WEB_ROOT, relative), 'utf8');
}

describe('artifact thumbnails do not execute what they preview', () => {
  it.each(THUMBNAIL_SOURCES)('%s allows no scripts', (relative) => {
    const source = read(relative);
    expect(source).toContain('sandbox=""');
    expect(source).not.toMatch(/sandbox="allow-scripts"/u);
  });

  it('keeps the thumbnails non-interactive, which is why they need no scripts', () => {
    expect(read('app/gallery/GalleryClient.tsx')).toContain('aria-hidden');
    expect(read('features/chat/components/artifacts/InlineArtifactCards.tsx')).toContain(
      'pointer-events-none',
    );
  });

  it('leaves the interactive viewer able to run an HTML artifact', () => {
    // Not a thumbnail: an HTML artifact that cannot run is broken, and the
    // null-origin sandbox (allow-scripts without allow-same-origin) is the
    // boundary that makes running it safe.
    const viewer = read(INTERACTIVE_VIEWER);
    expect(viewer).toMatch(/allow-scripts/u);
    expect(viewer).not.toMatch(/allow-scripts allow-same-origin/u);
  });
});
