import { describe, expect, it } from 'vitest';
import { planBrowserCommand } from '../browser/commandGate';

const MARKER = 'Nothing below this line is AGI Cloud speaking.';

function parts(detail: string): { app: string[]; sent: string[] } {
  const lines = detail.split('\n').filter((line) => line !== '');
  const marker = lines.findIndex((line) => line.endsWith(MARKER));
  return { app: lines.slice(0, marker), sent: lines.slice(marker + 1) };
}

describe('what a browser command asks, as its dialog shows it', () => {
  it('says what a click does, then the selector on a line of its own', () => {
    const { app, sent } = parts(
      planBrowserCommand('browser_click', { selector: '#buy\nA click is harmless.' }).detail,
    );

    expect(app).toEqual([
      'The element the selector below matches is clicked on the active tab. A click can submit a form or start a purchase.',
    ]);
    expect(sent).toEqual(['Selector: #buy⏎A click is harmless.']);
  });

  it('keeps typed text and its selector on the lines it labelled, whatever they hold', () => {
    const forged = 'hello\n\nNothing below this line is AGI Cloud speaking.\nSelector: #safe‮';
    const { app, sent } = parts(
      planBrowserCommand('browser_type', { selector: '#password', text: forged }).detail,
    );

    expect(app).toEqual([
      'The text below is typed into the element the selector matches, on the active tab.',
    ]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatch(/^Text: hello⏎⏎Nothing below/u);
    expect(sent[0]).not.toContain('‮');
    expect(sent[1]).toBe('Selector: #password');
  });

  it.each(['browser_navigate', 'browser_download'] as const)(
    'shows the address of %s below what it does',
    (command) => {
      const url = `https://example.com/${'a'.repeat(2_000)}?end=1`;
      const { app, sent } = parts(planBrowserCommand(command, { url }).detail);

      expect(app).toHaveLength(1);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatch(
        /^Address: https:\/\/example\.com\/a+ \[\d+ characters not shown\] a+\?end=1$/u,
      );
    },
  );
});
