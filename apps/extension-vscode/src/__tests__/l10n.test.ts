import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { catalogFor, DEFAULT_LOCALE, resolveLocale, SUPPORTED_LOCALES, t } from '../l10n';
import { applyLlmEdit } from '../platform/applyEdit';
import { INLINE_PROPOSAL_SCHEME, getInlineProposals } from '../platform/inlineProposal';

const mockEnv = vscode.env as unknown as { language: string };

function withLanguage<T>(language: string, body: () => T): T {
  const previous = mockEnv.language;
  mockEnv.language = language;
  try {
    return body();
  } finally {
    mockEnv.language = previous;
  }
}

async function withLanguageAsync<T>(language: string, body: () => Promise<T>): Promise<T> {
  const previous = mockEnv.language;
  mockEnv.language = language;
  try {
    return await body();
  } finally {
    mockEnv.language = previous;
  }
}

afterEach(() => {
  vi.clearAllMocks();
});

const PLURAL_KEY = /^(.+)_(zero|one|two|few|many|other)$/u;

function pluralBase(key: string): string | undefined {
  return PLURAL_KEY.exec(key)?.[1];
}

describe('catalogs', () => {
  it('keeps every catalog at key parity with English, with the plural forms its language uses', () => {
    const english = catalogFor(DEFAULT_LOCALE) ?? {};
    const singular = Object.keys(english).filter((key) => pluralBase(key) === undefined);
    const bases = [
      ...new Set(
        Object.keys(english)
          .map(pluralBase)
          .filter((base): base is string => base !== undefined),
      ),
    ];
    expect(singular.length).toBeGreaterThan(0);
    expect(bases.length).toBeGreaterThan(0);

    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogFor(locale);
      expect(catalog, `${locale}.ts is missing`).toBeDefined();
      const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
      const expected = [
        ...singular,
        ...bases.flatMap((base) => categories.map((category) => `${base}_${category}`)),
      ].sort();
      expect(Object.keys(catalog ?? {}).sort(), `${locale}.ts key parity`).toEqual(expected);
      for (const [key, value] of Object.entries(catalog ?? {})) {
        expect(value.trim(), `${locale}.ts: ${key} is blank`).not.toBe('');
      }
    }
  });

  it('keeps every placeholder English uses', () => {
    const english = catalogFor(DEFAULT_LOCALE) ?? {};
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogFor(locale) ?? {};
      for (const [key, template] of Object.entries(catalog)) {
        const base = pluralBase(key);
        const source = base === undefined ? english[key] : english[`${base}_other`];
        const countMayBeWord = /_(zero|one|two)$/u.test(key);
        for (const placeholder of source?.match(/\{[a-zA-Z]+\}/gu) ?? []) {
          if (countMayBeWord && placeholder === '{count}') continue;
          expect(template, `${locale}.ts: ${key} dropped ${placeholder}`).toContain(placeholder);
        }
      }
    }
  });
});

describe('resolveLocale', () => {
  it('reduces a VS Code display language to its base language', () => {
    expect(resolveLocale('pt-br')).toBe('pt');
    expect(resolveLocale('zh-cn')).toBe('zh');
    expect(resolveLocale('JA')).toBe('ja');
  });

  it('falls back to English for languages with no catalog', () => {
    expect(resolveLocale('sv')).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('t', () => {
  it('returns the string for the editor language', () => {
    expect(withLanguage('en', () => t('advancedFeatures.openAccount'))).toBe('Open account');
    expect(withLanguage('de', () => t('advancedFeatures.openAccount'))).toBe('Konto öffnen');
    expect(withLanguage('ja', () => t('advancedFeatures.openAccount'))).toBe('アカウントを開く');
  });

  it('substitutes placeholders wherever the translation puts them', () => {
    expect(withLanguage('en', () => t('subsystemHealth.manyUnavailable', { count: 3 }))).toBe(
      'AGI: 3 subsystems unavailable',
    );
    expect(withLanguage('ru', () => t('subsystemHealth.manyUnavailable', { count: 3 }))).toBe(
      'AGI: недоступных подсистем, 3',
    );
  });
});

describe('applyLlmEdit in a translated editor', () => {
  const uri = vscode.Uri.file('/mock/workspace/a.ts');
  const text = 'const x = 0;\n';
  const document = {
    languageId: 'typescript',
    uri,
    getText: (range?: { start: number; end: number }) =>
      range === undefined ? text : text.slice(range.start, range.end),
    offsetAt: (position: number) => position,
  };
  const editor = { document } as unknown as vscode.TextEditor;
  const selection = { isEmpty: false, start: 0, end: 12 } as unknown as vscode.Selection;
  const response = '```typescript\nconst x = 1;\n```';

  it('previews the edit as a diff instead of asking to apply it', async () => {
    void withLanguageAsync('ja', () => applyLlmEdit(editor, selection, response, 'Refactor'));
    await vi.waitFor(() =>
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.diff',
        uri,
        expect.objectContaining({ scheme: INLINE_PROPOSAL_SCHEME }),
        expect.any(String),
        { preview: false },
      ),
    );
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    await getInlineProposals().reject(proposalUri());
  });

  it('warns in the editor language when the accepted edit cannot apply', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(document as never);
    vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(false);
    const outcome = withLanguageAsync('ja', async () => {
      const pending = applyLlmEdit(editor, selection, response, 'Refactor');
      await vi.waitFor(() => expect(proposalUri()).toBeDefined());
      await getInlineProposals().accept(proposalUri());
      await getInlineProposals().reject(proposalUri());
      return pending;
    });

    await expect(outcome).resolves.toBe('dismissed');
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'AGI Code: 編集を適用できませんでした, ドキュメントが変更された可能性があります。',
    );
  });
});

function proposalUri(): vscode.Uri {
  const calls = vi
    .mocked(vscode.commands.executeCommand)
    .mock.calls.filter(([command]) => command === 'vscode.diff');
  return calls[calls.length - 1]?.[2] as vscode.Uri;
}
