import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
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

  it('does not resurrect the CDN font the CSP blocks', () => {
    // Asserted on declarations, not prose: the file carries a comment
    // explaining why OpenDyslexic was removed, and that comment is the record
    // of the decision — matching it would fail on the documentation.
    expect(css).not.toMatch(/font-family:[^;]*OpenDyslexic/);
    expect(css).not.toMatch(/src:[^;]*jsdelivr/);
    // An actual rule opens with a brace; the three '@font-face' mentions in
    // this file are all inside the comments that record why it went.
    expect(css).not.toMatch(/@font-face\s*\{/);
  });
});
