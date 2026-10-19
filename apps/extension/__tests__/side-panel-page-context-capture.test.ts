import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizePageText } from '../src/background/policy';
import {
  boundPageText,
  MAX_PAGE_TEXT_CHARACTERS,
  PAGE_TEXT_EXCERPT_NOTICE,
} from '../src/features/content/in-page-panel/pageActions';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
const captureHelpers = program.statements.filter(
  (node) =>
    ts.isFunctionDeclaration(node) &&
    ['capturePageContext', 'readTabText'].includes(node.name?.text ?? ''),
);
if (captureHelpers.length !== 2) throw new Error('Production page capture function was not found');

type CaptureResult =
  | { ok: true; text: string; source: { tabId: number; url: string }; truncated?: boolean }
  | { ok: false; reason: string };

function captureHarness(blocked: string[] = []) {
  const capturedResults: Array<{ text: string; truncated: boolean }> = [];
  const executeScript = vi.fn(
    (
      options: { target: { tabId: number }; args: number[]; func: (cap: number) => unknown },
      callback: (results: unknown[]) => void,
    ) => {
      // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
      const isolatedReader = new Function(`return (${options.func.toString()});`)() as (
        cap: number,
      ) => { text: string; truncated: boolean };
      const result = isolatedReader(options.args[0]!);
      capturedResults.push(result);
      callback([{ result }]);
    },
  );
  const tab = {
    id: 17,
    url: 'https://approved.example/article',
    windowId: 1,
    status: 'complete',
  };
  const dependencies = {
    chrome: {
      runtime: { lastError: undefined },
      tabs: {
        query: async () => [tab],
        get: async () => tab,
      },
      scripting: { executeScript },
    },
    boundPageText,
    sanitizePageText,
    MAX_PAGE_TEXT_CHARACTERS,
    PAGE_CONTEXT_EMPTY_REASON: 'This page had no readable text to attach.',
    PAGE_CONTEXT_BLOCKED_REASON: 'This page cannot be read.',
    PAGE_CONTEXT_CHANGED_REASON: 'The page changed while it was being read.',
    describePageContextFailure: (message: string) => message,
    activePageQuery: async () => ({ active: true, currentWindow: true }),
    isUserBlockedSite: async (url: string) => blocked.includes(new URL(url).origin),
    t: (key: string, substitutions: string[] = []) => `${key}:${substitutions.join(',')}`,
  };
  const compiled = ts.transpileModule(
    `${captureHelpers.map((node) => node.getText(program)).join('\n')}\nreturn capturePageContext;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const run = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as () => Promise<CaptureResult>;
  return { run, executeScript, capturedResults };
}

const innerTextDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');

beforeEach(() => {
  document.body.innerHTML = '<main></main><footer>Footer navigation noise</footer>';
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? '';
    },
  });
});

afterEach(() => {
  document.body.replaceChildren();
  if (innerTextDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'innerText', innerTextDescriptor);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'innerText');
  }
});

describe('production side panel page context capture', () => {
  it('captures article content after 5,000 characters and retains the source tab', async () => {
    document.querySelector('main')!.textContent = `${'x'.repeat(6_000)} LATER_ARTICLE_CONCLUSION`;
    const capture = captureHarness();
    const result = await capture.run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.text).toContain('LATER_ARTICLE_CONCLUSION');
    expect(result.text).not.toContain('Footer navigation noise');
    expect(result.text).not.toContain(PAGE_TEXT_EXCERPT_NOTICE);
    expect(result.truncated).toBe(false);
    expect(result.source).toEqual({ tabId: 17, url: 'https://approved.example/article' });
    expect(capture.executeScript.mock.calls[0]?.[0]).toMatchObject({
      target: { tabId: 17 },
      args: [MAX_PAGE_TEXT_CHARACTERS],
    });
  });

  it('bounds Chrome IPC and the attached excerpt while disclosing omitted page text', async () => {
    document.querySelector('main')!.textContent =
      `${'x'.repeat(MAX_PAGE_TEXT_CHARACTERS + 4_000)} OMITTED_FINAL_PARAGRAPH`;
    const capture = captureHarness();
    const result = await capture.run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(capture.capturedResults[0]?.text).toHaveLength(MAX_PAGE_TEXT_CHARACTERS + 1);
    expect(result.text.length).toBeLessThanOrEqual(MAX_PAGE_TEXT_CHARACTERS);
    expect(result.text).toContain(PAGE_TEXT_EXCERPT_NOTICE);
    expect(result.text).not.toContain('OMITTED_FINAL_PARAGRAPH');
    expect(result.truncated).toBe(true);
  });

  it('removes invisible Unicode and redacts secrets before attaching page text', async () => {
    const secret = `sk-ant-${'A'.repeat(60)}`;
    document.querySelector('main')!.textContent =
      `${'Article text. '.repeat(20)} Hidden\u200bcontrol\u2068\ufeff and ${secret}`;
    const result = await captureHarness().run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.text).toContain('Hiddencontrol');
    expect(result.text).not.toMatch(/\u200B|\u2068|\uFEFF/u);
    expect(result.text).not.toContain(secret);
    expect(result.text).toContain('[REDACTED_ANTHROPIC_KEY]');
  });

  it('redacts a sensitive key whose value crosses the raw capture boundary', async () => {
    document.querySelector('main')!.textContent =
      `${'x'.repeat(MAX_PAGE_TEXT_CHARACTERS - 200)} sk-ant-${'A'.repeat(500)}`;
    const result = await captureHarness().run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.text).not.toContain('sk-ant-');
    expect(result.text).not.toContain('A'.repeat(20));
    expect(result.text).toContain('[REDACTED_ANTHROPIC_KEY]');
    expect(result.text).toContain(PAGE_TEXT_EXCERPT_NOTICE);
    expect(result.truncated).toBe(true);
  });

  it('keeps an empty page unreadable even when raw whitespace exceeds the cap', async () => {
    document.body.replaceChildren(
      document.createTextNode(' '.repeat(MAX_PAGE_TEXT_CHARACTERS + 1)),
    );
    await expect(captureHarness().run()).resolves.toEqual({
      ok: false,
      reason: 'This page had no readable text to attach.',
    });
  });

  it('refuses a site the user blocked before running any script in it', async () => {
    document.querySelector('main')!.textContent = 'Statement balance';
    const capture = captureHarness(['https://approved.example']);
    expect(await capture.run()).toEqual({
      ok: false,
      reason: 'spSiteBlockedByYou:approved.example',
    });
    expect(capture.executeScript).not.toHaveBeenCalled();
  });
});
