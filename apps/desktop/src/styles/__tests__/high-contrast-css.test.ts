import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');

describe('Desktop system contrast preferences', () => {
  it('increases semantic contrast and focus visibility when requested', () => {
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toContain('--muted-foreground: 215 25% 28%');
    expect(css).toContain('--chat-border-strong: #4a4a4a');
    expect(css).toContain('outline-width: 3px');
  });

  it('uses Windows forced-color system tokens instead of brand-only effects', () => {
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('ButtonBorder');
    expect(css).toContain('LinkText');
    expect(css).toContain('Highlight');
    expect(css).toContain('HighlightText');
    expect(css).toContain('CanvasText');
  });
});
