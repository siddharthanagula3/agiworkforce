import { render } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppearancePreferences } from '@shared/components/AppearancePreferences';
import { useSettingsStore } from '@shared/stores/web-settings-store';

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

beforeEach(() => {
  useSettingsStore.setState({ chatFont: 'default' });
  document.documentElement.removeAttribute('data-chat-font');
});

// The control this replaces pointed at a CDN font the CSP blocked: it fell back
// silently and looked like it did nothing. A font picker is only real if the
// stylesheet answers the attribute AND the app loads the family.
describe('the chat font preference reaches the document', () => {
  it('stamps nothing on default', () => {
    render(<AppearancePreferences />);
    expect(document.documentElement.hasAttribute('data-chat-font')).toBe(false);
  });

  it('stamps the chosen family', () => {
    useSettingsStore.getState().setChatFont('serif');
    render(<AppearancePreferences />);
    expect(document.documentElement.getAttribute('data-chat-font')).toBe('serif');
  });

  it('stamps the dyslexic-friendly family', () => {
    useSettingsStore.getState().setChatFont('dyslexic');
    render(<AppearancePreferences />);
    expect(document.documentElement.getAttribute('data-chat-font')).toBe('dyslexic');
  });

  it('clears the attribute when returning to default', () => {
    useSettingsStore.getState().setChatFont('sans');
    render(<AppearancePreferences />);
    expect(document.documentElement.getAttribute('data-chat-font')).toBe('sans');

    useSettingsStore.getState().setChatFont('default');
    render(<AppearancePreferences />);
    expect(document.documentElement.hasAttribute('data-chat-font')).toBe(false);
  });
});

describe('the stylesheet answers the attribute', () => {
  it('has a rule for every value the control offers', () => {
    expect(css).toContain("html[data-chat-font='serif'] .prose");
    expect(css).toContain("html[data-chat-font='sans'] .prose");
    expect(css).toContain("html[data-chat-font='dyslexic'] .prose");
  });

  it('only offers families the app actually loads', () => {
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    const block = css.slice(css.indexOf("html[data-chat-font='serif']"));
    for (const variable of ['--font-newsreader', '--font-geist-sans']) {
      expect(block).toContain(variable);
      expect(layout).toContain(variable);
    }
  });

  it('never lets code inherit the prose font', () => {
    // prose and code share the .prose subtree; a serif `const` is not a
    // preference anyone asked for.
    expect(css).toMatch(/html\[data-chat-font\] \.prose :is\(code, pre, kbd, samp\)/);
  });

  it('does not point at the CDN the CSP blocks', () => {
    // Scoped to actual url(...) declarations, not the comment recording why
    // the CDN version was removed — that comment names the old URL on purpose.
    const urls = css.match(/url\([^)]*\)/g) ?? [];
    for (const url of urls) {
      expect(url).not.toMatch(/jsdelivr/);
    }
  });
});

describe('OpenDyslexic is self-hosted, not CDN-loaded', () => {
  const FONT_DIR = join(process.cwd(), 'public/fonts/opendyslexic');
  const FONT_FACE_BLOCKS = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  const STYLES: Array<{ file: string; weight: string; style: string }> = [
    { file: 'OpenDyslexic-Regular.woff2', weight: '400', style: 'normal' },
    { file: 'OpenDyslexic-Bold.woff2', weight: '700', style: 'normal' },
    { file: 'OpenDyslexic-Italic.woff2', weight: '400', style: 'italic' },
    { file: 'OpenDyslexic-Bold-Italic.woff2', weight: '700', style: 'italic' },
  ];

  it('declares at least one @font-face rule', () => {
    expect(FONT_FACE_BLOCKS.length).toBeGreaterThanOrEqual(STYLES.length);
  });

  it.each(STYLES)(
    '$file is vendored on disk and declared with the right weight/style',
    ({ file, weight, style }) => {
      expect(existsSync(join(FONT_DIR, file))).toBe(true);
      expect(existsSync(join(FONT_DIR, file.replace('.woff2', '.woff')))).toBe(true);

      const block = FONT_FACE_BLOCKS.find((b) => b.includes(`/fonts/opendyslexic/${file}`));
      expect(block).toBeDefined();
      expect(block).toContain(`font-weight: ${weight}`);
      expect(block).toContain(`font-style: ${style}`);
      expect(block).toContain('font-display: swap');
      expect(block).toContain("font-family: 'OpenDyslexic'");
    },
  );

  it('every @font-face src is same-origin, never a third-party host', () => {
    const opendyslexicBlocks = FONT_FACE_BLOCKS.filter((b) => b.includes('opendyslexic'));
    expect(opendyslexicBlocks.length).toBe(STYLES.length);
    for (const block of opendyslexicBlocks) {
      const urls = block.match(/url\([^)]*\)/g) ?? [];
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url).not.toMatch(/https?:\/\//);
        expect(url).toMatch(/url\('\/fonts\/opendyslexic\//);
      }
    }
  });

  it('the OFL license text is vendored alongside the binaries', () => {
    const licensePath = join(FONT_DIR, 'OFL.txt');
    expect(existsSync(licensePath)).toBe(true);
    expect(readFileSync(licensePath, 'utf8')).toContain('SIL OPEN FONT LICENSE');
  });

  it('is recorded in THIRD_PARTY_LICENSES.md', () => {
    const notices = readFileSync(join(process.cwd(), '../../THIRD_PARTY_LICENSES.md'), 'utf8');
    expect(notices).toMatch(/## OpenDyslexic/);
    expect(notices).toMatch(/OFL-1\.1/);
  });
});
