import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppearancePreferences } from '@shared/components/AppearancePreferences';
import { useSettingsStore } from '@shared/stores/web-settings-store';

beforeEach(() => {
  useSettingsStore.setState({ motion: 'system' });
  document.documentElement.removeAttribute('data-motion');
});

// A motion toggle that stores a preference nothing reads is decorative, and
// decorative accessibility controls are worse than none: someone with a
// vestibular disorder turns it on and the interface keeps moving.
describe('the Motion preference actually reaches the document', () => {
  it('stamps data-motion when the user asks for reduced motion', () => {
    render(<AppearancePreferences />);
    expect(document.documentElement.hasAttribute('data-motion')).toBe(false);

    useSettingsStore.getState().setMotion('reduced');
    render(<AppearancePreferences />);

    expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
  });

  it('hands control back to the OS on System', () => {
    useSettingsStore.getState().setMotion('reduced');
    render(<AppearancePreferences />);
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');

    useSettingsStore.getState().setMotion('system');
    render(<AppearancePreferences />);

    expect(document.documentElement.hasAttribute('data-motion')).toBe(false);
  });

  it('has stylesheet rules that answer the attribute', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    const block = css.slice(css.indexOf("[data-motion='reduced']"));

    expect(block).toContain('animation-duration');
    expect(block).toContain('transition-duration');
    // A smooth-scrolled jump is motion too.
    expect(block).toContain('scroll-behavior');
  });

  it('offers no way to force motion on someone whose OS asked for less', () => {
    const source = readFileSync(
      join(process.cwd(), 'features/settings/sections/GeneralSection.tsx'),
      'utf8',
    );
    const row = source.slice(source.indexOf('function MotionRow'));
    expect(row).not.toMatch(/'full'|"full"|No reduction/);
  });
});
