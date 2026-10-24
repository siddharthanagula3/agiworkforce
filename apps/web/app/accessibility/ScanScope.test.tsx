import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import auditedRoutes from '@/lib/a11y/audited-routes.json';
import { ScanScope } from './ScanScope';

const pageDirectory = dirname(fileURLToPath(import.meta.url));

function scopeText(): string {
  return render(<ScanScope />).container.textContent ?? '';
}

describe('published accessibility scan scope', () => {
  it('names every route the axe runner actually scans', () => {
    const text = scopeText();
    for (const route of auditedRoutes) {
      expect(text, route.path).toContain(route.path);
    }
    expect(text).toContain(`${auditedRoutes.length} routes`);
  });

  it('claims no route the signed-out scan never reaches', () => {
    const scanned = new Set(auditedRoutes.map((route) => route.path));
    expect(scanned.has('/chat')).toBe(false);

    const text = scopeText().toLowerCase();
    expect(text).not.toContain('/chat');
    expect(text).not.toContain('chat app');
  });

  it('shares its route list with the axe runner', () => {
    const runner = readFileSync(join(pageDirectory, '../../scripts/a11y-audit.mjs'), 'utf8');
    expect(runner).toContain("'../lib/a11y/audited-routes.json'");
    expect(runner).not.toMatch(/auditedPages = \[/);
  });

  it('is the copy the accessibility page publishes', () => {
    const source = readFileSync(join(pageDirectory, 'page.tsx'), 'utf8');
    expect(source).toContain('<ScanScope />');
    expect(source).not.toMatch(/scope is [a-z0-9]+ routes/i);
  });
});
