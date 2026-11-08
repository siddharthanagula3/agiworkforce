import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedCloudPageReadResponse } from '@agiworkforce/cloud-contracts';
import type { PageContextCapture } from '../src/side_panel';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import { sanitizePageText } from '../src/background/policy';
import { capturePageObservation } from '../src/features/content/pageObservation';
import { readTabObservation } from '../src/features/side-panel/pageObservation';
import {
  pageContextStillDescribes,
  type PageContextSource,
} from '../src/features/side-panel/chat-state';
import { isRestrictedPageUrl } from '../src/features/side-panel/surface-policy';
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

const linkedPageHelper = program.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'readLinkedPage',
);
if (!linkedPageHelper) throw new Error('Production linked-page capture function was not found');

function linkedPageCapture(outcome: ManagedCloudPageReadResponse): Promise<PageContextCapture> {
  const dependencies = {
    isUserBlockedSite: async () => false,
    readChromeLinkedPage: async () => outcome,
    sanitizePageText,
    boundPageText,
    MAX_PAGE_TEXT_CHARACTERS,
    PAGE_CONTEXT_EMPTY_REASON: 'This page had no readable text to attach.',
    t: (key: string) => key,
    pageChipLabel: (url: string) => new URL(url).hostname,
  };
  const compiled = ts.transpileModule(
    `${linkedPageHelper!.getText(program)}\nreturn readLinkedPage;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned linked-page capture in an isolated fixture.
  const read = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as (url: string, owner: ManagedCloudOwner, signal: AbortSignal) => Promise<PageContextCapture>;
  return read(
    'https://example.org/',
    { accountId: 'owner-a', authIncarnation: 'session-a' },
    new AbortController().signal,
  );
}

const intakeHandlers = new Map<string, ts.Node>();
let attachPageHelper: ts.Node | undefined;
function findIntakeHandlers(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'attachPageCapture') {
    attachPageHelper = node;
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'attachChosenTab') {
    intakeHandlers.set('tab', node);
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(program) === 'contextBtn.addEventListener' &&
    node.arguments[0]?.getText(program) === "'click'"
  ) {
    intakeHandlers.set('current', node.arguments[1]!);
  }
  ts.forEachChild(node, findIntakeHandlers);
}
findIntakeHandlers(program);
if (intakeHandlers.size !== 2 || !attachPageHelper)
  throw new Error('Production page intake handlers missing');

function pendingPageIntake(kind: 'tab' | 'current', deferPermissionRecord = false) {
  let current = true;
  let resolve!: (result: PageContextCapture) => void;
  const capture = new Promise<PageContextCapture>((done) => {
    resolve = done;
  });
  const read = vi.fn(async () => capture);
  const release = vi.fn(async () => {});
  const intake = {};
  const intakes = new Set<unknown>();
  const context: {
    pendingPageContext: string | null;
    pendingPageContextSource: PageContextSource | null;
  } = { pendingPageContext: null, pendingPageContextSource: null };
  const finish = vi.fn(() => intakes.delete(intake));
  let releasePermissionRecord!: () => void;
  const permissionRecord = new Promise<void>((done) => {
    releasePermissionRecord = done;
  });
  const recordPermission = vi.fn(async () => {
    if (deferPermissionRecord) await permissionRecord;
  });
  const requestPermission = vi.fn(async () => true);
  const forgetPermission = vi.fn(async () => []);
  const activePage = { tabId: 7, url: 'https://example.org/' };
  const contextButton = document.createElement('button');
  const dependencies = {
    _ctx: context,
    contextBtn: contextButton,
    contextItemLabel: document.createElement('span'),
    attachMenu: document.createElement('div'),
    attachBtn: document.createElement('button'),
    activePageSource: activePage,
    capturePageContext: read,
    readTabText: read,
    chrome: { tabs: { query: async () => [{ id: 7, url: activePage.url }] } },
    activePageQuery: async () => ({ active: true, currentWindow: true }),
    webTabOrigin: (tab: { url: string }) => new URL(tab.url).origin,
    recordTransientHostPermission: recordPermission,
    requestBrowserControlHostPermission: requestPermission,
    originApprovedForBrowserControl: async () => false,
    removeBrowserControlHostPermission: vi.fn(async () => true),
    forgetTransientHostPermissions: forgetPermission,
    beginComposerAttachmentIntake: () => {
      intakes.add(intake);
      return intake;
    },
    composerAttachmentIntakeCurrent: () => current,
    composerAttachmentIntakes: intakes,
    finishComposerAttachmentIntake: finish,
    updateAttachmentPreview: vi.fn(),
    updateContextButton: vi.fn(),
    isRestrictedPageUrl,
    pageContextStillDescribes,
    PAGE_CONTEXT_BLOCKED_REASON: 'This page cannot be read.',
    PAGE_CONTEXT_CHANGED_REASON: 'The active page changed.',
    PAGE_CONTEXT_DENIED_REASON: 'Page permission is required.',
    t: (key: string) => key,
    pageChipLabel: (url: string) => new URL(url).hostname,
  };
  const handler = intakeHandlers.get(kind)!;
  const compiled = ts.transpileModule(
    `let composerContextNotice = null;
     const managedCloudChatState = 'ready';
     ${attachPageHelper!.getText(program)}
     ${kind === 'tab' ? handler.getText(program) : ''}
     const run = ${kind === 'tab' ? 'attachChosenTab' : handler.getText(program)};
     return { run, notice: () => composerContextNotice };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned page intake handlers in an isolated fixture.
  const runtime = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as { run(...args: unknown[]): Promise<void>; notice(): string | null };
  const pending =
    kind === 'tab'
      ? runtime.run({ id: 7, url: activePage.url }, Promise.resolve({ granted: true, release }))
      : runtime.run();
  return {
    pending,
    read,
    release,
    context,
    finish,
    recordPermission,
    requestPermission,
    forgetPermission,
    releasePermissionRecord,
    resolve,
    activePage,
    contextButton,
    notice: runtime.notice,
    retire: () => {
      current = false;
      intakes.clear();
    },
  };
}

type CaptureResult =
  | { ok: true; text: string; source: { tabId: number; url: string }; truncated?: boolean }
  | { ok: false; reason: string };

function captureHarness(blocked: string[] = []) {
  const capturedResults: Array<{ text: string; truncated: boolean }> = [];
  const executeScript = vi.fn(async () => [
    { result: 'https://acme.myworkdayjobs.com/en-US/careers', documentId: 'doc-17' },
  ]);
  const sendMessage = vi.fn(async (_tabId: number, message: { pageUrl: string }) => {
    const result = capturePageObservation(message.pageUrl);
    capturedResults.push(result as { text: string; truncated: boolean });
    return result;
  });
  const tab = {
    id: 17,
    url: 'https://acme.myworkdayjobs.com/en-US/careers',
    windowId: 1,
    status: 'complete',
  };
  const dependencies = {
    chrome: {
      runtime: { lastError: undefined },
      tabs: {
        query: async () => [tab],
        get: async () => tab,
        sendMessage,
      },
      scripting: { executeScript },
    },
    readTabObservation,
    boundPageText,
    sanitizePageText,
    MAX_PAGE_TEXT_CHARACTERS,
    PAGE_CONTEXT_EMPTY_REASON: 'This page had no readable text to attach.',
    PAGE_CONTEXT_BLOCKED_REASON: 'This page cannot be read.',
    PAGE_CONTEXT_CHANGED_REASON: 'The page changed while it was being read.',
    PAGE_CONTEXT_LOADING_REASON: 'This page is still loading. Wait for it to finish and try again.',
    describePageContextFailure: (message: string) => message,
    activePageQuery: async () => ({ active: true, currentWindow: true }),
    isUserBlockedSite: async (url: string) => blocked.includes(new URL(url).origin),
    t: (key: string, substitutions: string[] = []) => `${key}:${substitutions.join(',')}`,
  };
  vi.stubGlobal('chrome', dependencies.chrome);
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
  window.history.replaceState(null, '', 'https://acme.myworkdayjobs.com/en-US/careers');
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
    expect(result.source).toEqual({
      tabId: 17,
      url: 'https://acme.myworkdayjobs.com/en-US/careers',
    });
    expect(capture.executeScript.mock.calls[0]?.[0]).toMatchObject({
      target: { tabId: 17 },
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

  it('redacts the whole sensitive key before applying the capture boundary', async () => {
    document.querySelector('main')!.textContent =
      `${'x'.repeat(MAX_PAGE_TEXT_CHARACTERS - 200)} sk-ant-${'A'.repeat(500)}`;
    const result = await captureHarness().run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.text).not.toContain('sk-ant-');
    expect(result.text).not.toContain('A'.repeat(20));
    expect(result.text).toContain('[REDACTED_ANTHROPIC_KEY]');
    expect(result.text).not.toContain(PAGE_TEXT_EXCERPT_NOTICE);
    expect(result.truncated).toBe(false);
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
    const capture = captureHarness(['https://acme.myworkdayjobs.com']);
    expect(await capture.run()).toEqual({
      ok: false,
      reason: 'spSiteBlockedByYou:acme.myworkdayjobs.com',
    });
    expect(capture.executeScript).not.toHaveBeenCalled();
  });
});

describe('linked-page text sent to the model', () => {
  const page = {
    ok: true as const,
    url: 'https://example.org/',
    title: 'Example Domain',
    content: 'This domain is used for documentation examples.',
    truncated: false,
  };

  it('includes the returned document title alongside the extracted body', async () => {
    const result = await linkedPageCapture(page);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.text).toBe(`Title: ${page.title}\n\n${page.content}`);
    expect(result.source).toEqual({ url: page.url, title: page.title, chosen: true });
  });

  it('bounds the combined title and body and reports the omitted text', async () => {
    const result = await linkedPageCapture({
      ...page,
      content: 'x'.repeat(MAX_PAGE_TEXT_CHARACTERS + 500),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.text).toContain(`Title: ${page.title}`);
    expect(result.text.length).toBeLessThanOrEqual(MAX_PAGE_TEXT_CHARACTERS);
    expect(result.text).toContain(PAGE_TEXT_EXCERPT_NOTICE);
    expect(result.truncated).toBe(true);
  });

  it('does not treat a title as readable content when the body is empty', async () => {
    await expect(linkedPageCapture({ ...page, content: ' \n ' })).resolves.toEqual({
      ok: false,
      reason: 'This page had no readable text to attach.',
    });
  });
});

describe.each(['tab', 'current'] as const)('%s page intake ownership', (kind) => {
  const captured: PageContextCapture = {
    ok: true,
    text: 'Captured values',
    source: { tabId: 7, url: 'https://example.org/', ...(kind === 'tab' ? { chosen: true } : {}) },
  };

  it('attaches an owned completed capture and finishes its intake', async () => {
    const h = pendingPageIntake(kind);
    await vi.waitFor(() => expect(h.read).toHaveBeenCalledOnce());
    h.resolve(captured);
    await h.pending;
    expect(h.context.pendingPageContext).toBe(captured.ok ? captured.text : null);
    expect(h.context.pendingPageContextSource).toEqual(captured.ok ? captured.source : null);
    expect(h.finish).toHaveBeenCalledOnce();
    if (kind === 'tab') expect(h.release).toHaveBeenCalledOnce();
  });

  it('does not attach a result after its chat or account is retired', async () => {
    const h = pendingPageIntake(kind);
    await vi.waitFor(() => expect(h.read).toHaveBeenCalledOnce());
    h.retire();
    h.resolve(captured);
    await h.pending;
    expect(h.context.pendingPageContext).toBeNull();
    expect(h.context.pendingPageContextSource).toBeNull();
    expect(h.finish).toHaveBeenCalledOnce();
    if (kind === 'tab') expect(h.release).toHaveBeenCalledOnce();
  });
});

it('does not attach the former current page after switching to a protected page', async () => {
  const h = pendingPageIntake('current');
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledOnce());
  h.activePage.tabId = 8;
  h.activePage.url = 'chrome://extensions/';
  h.resolve({ ok: true, text: 'Former page', source: { tabId: 7, url: 'https://example.org/' } });
  await h.pending;
  expect(h.context.pendingPageContext).toBeNull();
  expect(h.contextButton.disabled).toBe(true);
  expect(h.notice()).toBe('The active page changed.');
});

it('does not request site access after retirement while its permission record is pending', async () => {
  const h = pendingPageIntake('current', true);
  await vi.waitFor(() => expect(h.read).toHaveBeenCalledOnce());
  h.resolve({ ok: false, reason: 'Page permission is required.' });
  await vi.waitFor(() => expect(h.recordPermission).toHaveBeenCalledOnce());
  h.retire();
  h.releasePermissionRecord();
  await h.pending;
  expect(h.requestPermission).not.toHaveBeenCalled();
  expect(h.forgetPermission).toHaveBeenCalledOnce();
  expect(h.finish).toHaveBeenCalledOnce();
  expect(h.context.pendingPageContext).toBeNull();
});
