import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { catalogFor, DEFAULT_LOCALE, resolveLocale, SUPPORTED_LOCALES, t } from '../l10n';
import { applyLlmEdit } from '../platform/applyEdit';

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

describe('catalogs', () => {
  it('keeps every catalog at key parity with English', () => {
    const english = catalogFor(DEFAULT_LOCALE);
    expect(english).toBeDefined();
    const englishKeys = Object.keys(english ?? {}).sort();
    expect(englishKeys.length).toBeGreaterThan(0);

    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogFor(locale);
      expect(catalog, `${locale}.ts is missing`).toBeDefined();
      expect(Object.keys(catalog ?? {}).sort(), `${locale}.ts key parity`).toEqual(englishKeys);
      for (const [key, value] of Object.entries(catalog ?? {})) {
        expect(value.trim(), `${locale}.ts: ${key} is blank`).not.toBe('');
      }
    }
  });

  it('keeps every placeholder English uses', () => {
    const english = catalogFor(DEFAULT_LOCALE) ?? {};
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogFor(locale) ?? {};
      for (const [key, template] of Object.entries(english)) {
        for (const placeholder of template.match(/\{[a-zA-Z]+\}/gu) ?? []) {
          expect(catalog[key], `${locale}.ts: ${key} dropped ${placeholder}`).toContain(
            placeholder,
          );
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
  const editor = {
    document: { languageId: 'typescript', uri: { fsPath: '/mock/workspace/a.ts' } },
  } as unknown as vscode.TextEditor;
  const selection = { isEmpty: false } as unknown as vscode.Selection;
  const response = '```typescript\nconst x = 1;\n```';

  it('prompts in the editor language', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

    await withLanguageAsync('ja', () => applyLlmEdit(editor, selection, response, 'Refactor'));

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'AGI Workforce: Refactor の結果を適用しますか？',
      { modal: false },
      'その場に適用',
      '新しいタブで表示',
    );
  });

  it('applies the edit when the translated button is clicked', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
      'その場に適用' as unknown as undefined,
    );
    vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(true);

    await withLanguageAsync('ja', () => applyLlmEdit(editor, selection, response, 'Refactor'));

    expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('warns in the editor language when the document moved under the edit', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
      'その場に適用' as unknown as undefined,
    );
    vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(false);

    await withLanguageAsync('ja', () => applyLlmEdit(editor, selection, response, 'Refactor'));

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'AGI Workforce: 編集を適用できませんでした, ドキュメントが変更された可能性があります。',
    );
  });
});
