import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../src/side_panel.ts'), 'utf8');
const computerUseSource = readFileSync(
  join(here, '../src/features/side-panel/computerUsePanel.ts'),
  'utf8',
);

function keydownHandler(openGuard: string): string {
  const start = source.indexOf(`if (${openGuard} ||`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n  });', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Chrome side-panel composer menus under IME composition', () => {
  it('leaves a composing Enter or Tab to the input method in the slash menu', () => {
    const handler = keydownHandler('!slashOpen()');
    expect(handler.split('\n')[0]).toContain('isImeComposingKey(e)');
    expect(handler.indexOf('isImeComposingKey(e)')).toBeLessThan(handler.indexOf('acceptSlash('));
  });

  it('leaves a composing Enter or Tab to the input method in the mention menu', () => {
    const handler = keydownHandler('!mentionOpen()');
    expect(handler.split('\n')[0]).toContain('isImeComposingKey(e)');
    expect(handler.indexOf('isImeComposingKey(e)')).toBeLessThan(handler.indexOf('acceptMention('));
  });

  it('uses the shared composition check for Send and the task inputs', () => {
    expect(source).toContain("from '@agiworkforce/unified-chat/ime-composition'");
    expect(source).toContain("e.key === 'Enter' && !e.shiftKey && !isImeComposingKey(e)");
    expect(source).not.toContain('e.isComposing');
    expect(computerUseSource).not.toContain('event.isComposing');
    expect(computerUseSource.match(/isImeComposingKey\(event\)/g)).toHaveLength(2);
  });
});
