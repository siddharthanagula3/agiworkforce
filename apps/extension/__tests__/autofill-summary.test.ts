import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import catalog from '../_locales/en/messages.json';
import { autofillSuccessMessage } from '../src/features/side-panel/autofillSummary';

type Entry = { message: string; placeholders?: Record<string, { content: string }> };
const messages = catalog as Record<string, Entry>;

beforeAll(() => {
  vi.stubGlobal('chrome', {
    i18n: {
      getUILanguage: () => 'en',
      getMessage: (key: string, substitutions: string[] = []) => {
        const entry = messages[key];
        if (!entry) return '';
        return entry.message.replace(/\$[A-Z]+\$/g, () => substitutions[0] ?? '');
      },
    },
  });
});

describe('what Run Autofill reports after a fill', () => {
  it('names how many fields were filled and asks the user to check them', () => {
    expect(autofillSuccessMessage({ success: true, autofill: { filledCount: 6 } })).toBe(
      'Filled 6 fields. Check them before you submit.',
    );
    expect(autofillSuccessMessage({ success: true, autofill: { filledCount: 1 } })).toBe(
      'Filled 1 field. Check it before you submit.',
    );
  });

  it('says plainly when nothing was filled', () => {
    expect(autofillSuccessMessage({ success: true, autofill: { filledCount: 0 } })).toBe(
      'No fields were filled. Check the form before you submit.',
    );
    expect(autofillSuccessMessage({ success: true })).toBe(
      'No fields were filled. Check the form before you submit.',
    );
  });

  it('is the text the side panel shows, and no longer the internal escalation wording', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/side_panel.ts'), 'utf8');
    expect(source).toContain("cuPanel.showHandoffBanner(autofillSuccessMessage(resp), 'success')");
    expect(source).not.toContain('No agent escalation needed');
  });
});
