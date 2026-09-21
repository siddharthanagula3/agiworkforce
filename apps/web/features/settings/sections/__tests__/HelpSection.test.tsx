import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { primaryModifierLabel } from '@agiworkforce/ui';
import { KEYBOARD_SHORTCUT_DOCS } from '@features/chat/hooks/use-keyboard-shortcuts';
import { isWebSettingsSection } from '../../lib/web-settings-sections';
import { HelpSection } from '../HelpSection';

describe('HelpSection keyboard shortcuts hint', () => {
  it('quotes the binding the chat surface actually listens for', () => {
    const documented = KEYBOARD_SHORTCUT_DOCS.find(
      (shortcut) => shortcut.description === 'Show keyboard shortcuts',
    );
    if (!documented) throw new Error('Chat must document a show-shortcuts binding');

    render(<HelpSection />);

    const hint = screen.getByText(/anywhere in chat to see the full list/i);
    expect(hint.textContent).toContain(primaryModifierLabel());
    expect(hint.textContent).toContain(documented.key);
    expect(hint.textContent).not.toMatch(/Press\s+\?/);
  });
});

describe('HelpSection links', () => {
  // Every row draws an external-link icon. A row that navigated in place would
  // be making a promise the icon does not keep, and inside the desktop shell it
  // would replace the product with a documentation page.
  it('opens every row where its icon says it will', () => {
    render(<HelpSection />);

    const rows = screen.getAllByRole('link');
    expect(rows.length).toBeGreaterThan(4);
    for (const row of rows) {
      expect(row.getAttribute('target'), row.textContent ?? '').toBe('_blank');
      expect(row.getAttribute('rel'), row.textContent ?? '').toContain('noopener');
    }
  });
});

describe('HelpSection link targets', () => {
  const APP = path.resolve(__dirname, '../../../../app');

  it('carries no query string, which none of the pages it links to reads', () => {
    render(<HelpSection />);

    for (const row of screen.getAllByRole('link')) {
      expect(row.getAttribute('href'), row.textContent ?? '').not.toContain('?');
    }
  });

  it('lands Report a bug on the section of the support page that takes bug reports', () => {
    render(<HelpSection />);

    const href = screen.getByRole('link', { name: /Report a bug/ }).getAttribute('href') ?? '';
    const [pathname, fragment] = href.split('#');
    expect(pathname).toBe('/support');
    const page = readFileSync(path.join(APP, 'support', 'page.tsx'), 'utf8');
    expect(page).toContain(`<Section id="${fragment}" labelledBy="agi-support-bugs-title"`);
  });

  it('is what the public contact and support pages send an account holder to', () => {
    render(<HelpSection />);
    expect(screen.getByRole('heading', { name: 'Your support tickets' })).toBeVisible();
    expect(isWebSettingsSection('help')).toBe(true);

    for (const page of ['contact', 'support']) {
      const source = readFileSync(path.join(APP, page, 'page.tsx'), 'utf8');
      expect(source, page).toContain('href="/settings/help"');
      expect(source, page).not.toMatch(/no ticket system/iu);
    }
  });
});
