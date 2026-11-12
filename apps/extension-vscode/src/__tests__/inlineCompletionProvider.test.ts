import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { classifyManagedQuotaErrorCode, PRODUCT_NAMES } from '@agiworkforce/types';
import {
  AgiWorkforceApiError,
  AgiWorkforcePaywallError,
  AgiWorkforceUsageLimitError,
  chatCompletion,
  fetchTierInfo,
} from '../utils/api';
import { showCloudUtilityErrorActions } from '../core/cloudUtilityErrorActions';
import { AgiInlineCompletionProvider } from '../features/inline-completions/inlineCompletionProvider';
import { SYNTHETIC_LOCAL_MODEL_ID } from './catalogModelFixtures';
import { workspaceFileFixture } from './workspaceFileFixture';
type ScanModule0 = typeof import('../core/cloudUtilityErrorActions');
type ScanModule1 = typeof import('../utils/api');

const realpath = vi.hoisted(() => vi.fn<(path: string) => string>());

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  realpathSync: realpath,
}));

vi.mock('../core/cloudUtilityErrorActions', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  showCloudUtilityErrorActions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/api', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  chatCompletion: vi.fn(),
  fetchTierInfo: vi.fn(),
}));

const SETTINGS: Record<string, unknown> = {};
const secretChanges = new Set<() => void>();

function secretStorage(): vscode.SecretStorage {
  return {
    onDidChange: vi.fn((listener: () => void) => {
      secretChanges.add(listener);
      return new vscode.Disposable(() => secretChanges.delete(listener));
    }),
  } as unknown as vscode.SecretStorage;
}

let workspace: Awaited<ReturnType<typeof workspaceFileFixture>>;

beforeAll(async () => {
  workspace = await workspaceFileFixture([
    'src/app.ts',
    'src/apiKey.ts',
    'src/lexer/tokenizer.rs',
    'src/auth/passwordReset.tsx',
    'tokenizers/src/lib.rs',
    'config/local.yml',
    'config/api_token.txt',
    'dist/ignored.js',
  ]);
  await fs.writeFile(path.join(workspace.root, '.gitignore'), 'dist/\n');
});

afterAll(async () => {
  await workspace.dispose();
});

function workspaceUri(relativePath: string): vscode.Uri {
  return vscode.Uri.file(path.join(workspace.root, relativePath));
}

function configure(values: Record<string, unknown>): void {
  for (const key of Object.keys(SETTINGS)) delete SETTINGS[key];
  Object.assign(SETTINGS, {
    'inlineCompletions.enabled': true,
    'inlineCompletions.debounceMs': 0,
    'inlineCompletions.maxLength': 500,
    ...values,
  });
}

function documentAt(
  lineText: string,
  following: string[] = [],
  uri: vscode.Uri = workspaceUri('src/app.ts'),
): vscode.TextDocument {
  const lines = [lineText, ...following];
  return {
    uri,
    languageId: 'typescript',
    lineCount: lines.length,
    lineAt: (line: number) => ({ text: lines[line] ?? '' }),
    getText: () => lines.join('\n'),
  } as unknown as vscode.TextDocument;
}

const token = {
  isCancellationRequested: false,
  onCancellationRequested: () => new vscode.Disposable(() => undefined),
} as unknown as vscode.CancellationToken;

async function complete(
  modelResponse: string,
  options: { lineText?: string; maxLength?: number } = {},
): Promise<string | undefined> {
  configure(
    options.maxLength === undefined ? {} : { 'inlineCompletions.maxLength': options.maxLength },
  );
  vi.mocked(chatCompletion).mockResolvedValue(modelResponse);

  const items = await new AgiInlineCompletionProvider(secretStorage()).provideInlineCompletionItems(
    documentAt(options.lineText ?? 'const value = '),
    new vscode.Position(0, (options.lineText ?? 'const value = ').length),
    {} as vscode.InlineCompletionContext,
    token,
  );

  const list = items as vscode.InlineCompletionItem[];
  return list.length === 0 ? undefined : (list[0]!.insertText as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  realpath.mockReset().mockImplementation((path) => path);
  configure({});
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation(
    () =>
      ({
        get: vi.fn((key: string, fallback?: unknown) => SETTINGS[key] ?? fallback),
        update: vi.fn(),
        has: vi.fn().mockReturnValue(true),
        inspect: vi.fn((key: string) => ({ key, globalValue: SETTINGS[key] })),
      }) as unknown as vscode.WorkspaceConfiguration,
  );
});

afterEach(() => {
  vi.mocked(chatCompletion).mockReset();
});

describe('inline completions, real provider extraction', () => {
  it('sends nothing to AGI Cloud on a Local default model and says why once', async () => {
    configure({ model: SYNTHETIC_LOCAL_MODEL_ID });
    const provider = new AgiInlineCompletionProvider(secretStorage());
    const ask = () =>
      provider.provideInlineCompletionItems(
        documentAt('const value = '),
        new vscode.Position(0, 'const value = '.length),
        {} as vscode.InlineCompletionContext,
        token,
      );

    expect(await ask()).toEqual([]);
    expect(await ask()).toEqual([]);

    expect(chatCompletion).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledOnce();
    expect(String(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[0])).toContain(
      `Inline completion runs only on AGI Cloud, and your default model, ${SYNTHETIC_LOCAL_MODEL_ID}, is a Local model`,
    );
  });

  it.each(['credential-target', 'unresolved'] as const)(
    'reads and sends nothing when the file path is %s',
    async (refusal) => {
      if (refusal === 'credential-target') {
        realpath.mockReturnValue(path.join(workspace.root, '.env'));
      } else {
        realpath.mockImplementation(() => {
          throw new Error('EACCES');
        });
      }
      const document = documentAt('const value = ');
      const read = vi.spyOn(document, 'getText');
      const line = vi.spyOn(document, 'lineAt');
      const provider = new AgiInlineCompletionProvider(secretStorage());

      const items = await provider.provideInlineCompletionItems(
        document,
        new vscode.Position(0, 'const value = '.length),
        {} as vscode.InlineCompletionContext,
        token,
      );

      expect(items).toEqual([]);
      expect(read).not.toHaveBeenCalled();
      expect(line).not.toHaveBeenCalled();
      expect(chatCompletion).not.toHaveBeenCalled();
    },
  );

  it('sends nothing from an untrusted workspace, even when its settings turn completions on', async () => {
    const trust = vscode.workspace as { isTrusted: boolean };
    trust.isTrusted = false;
    try {
      expect(await complete('const value = 42;')).toBeUndefined();
      expect(chatCompletion).not.toHaveBeenCalled();
    } finally {
      trust.isTrusted = true;
    }
  });

  it('suggests nothing when the model returns blank text', async () => {
    expect(await complete('')).toBeUndefined();
    expect(await complete('   \n  ')).toBeUndefined();
  });

  it('unwraps a fenced block, with or without a language tag', async () => {
    expect(await complete('```typescript\nconst x = 42;\n```')).toBe('const x = 42;');
    expect(await complete('```\nconst x = 42;\n```')).toBe('const x = 42;');
  });

  it('falls back to the first meaningful line when the model returns prose', async () => {
    expect(await complete('42;  \nand then some prose')).toBe('42;');
  });

  it('keeps the space the model put between the cursor and its continuation', async () => {
    expect(await complete(' value;', { lineText: 'return' })).toBe(' value;');
  });

  it('keeps a leading line break so a body starts on its own line', async () => {
    const completion = await complete('\n  return 1;\n}', { lineText: 'function f() {' });

    expect(completion).toBe('\n  return 1;');
  });

  it('drops a repeat of the line the user already typed', async () => {
    expect(await complete('const value = 42;')).toBe('42;');
    expect(await complete('```typescript\n    const value = 42;\n```')).toBe('42;');
  });

  it('truncates a fenced completion at the configured maxLength', async () => {
    const long = 'x'.repeat(900);

    expect(await complete(`\`\`\`typescript\n${long}\n\`\`\``, { maxLength: 120 })).toHaveLength(
      120,
    );
  });

  it('truncates a bare first-line completion at the configured maxLength', async () => {
    const long = 'y'.repeat(900);

    expect(await complete(long, { maxLength: 80 })).toHaveLength(80);
  });

  it('sends the whole completion when it fits inside maxLength', async () => {
    expect(await complete('const x = 42;', { maxLength: 500 })).toBe('const x = 42;');
  });
});

describe('inline completions, real cursor filtering', () => {
  function askAt(lineText: string, character: number): Promise<unknown[]> {
    return new AgiInlineCompletionProvider(secretStorage()).provideInlineCompletionItems(
      documentAt(lineText),
      new vscode.Position(0, character),
      {} as vscode.InlineCompletionContext,
      token,
    ) as Promise<unknown[]>;
  }

  beforeEach(() => {
    vi.mocked(chatCompletion).mockResolvedValue('const x = 1;');
  });

  it('stays quiet until three non-blank characters precede the cursor', async () => {
    expect(await askAt('  ', 2)).toEqual([]);
    expect(await askAt('ab', 2)).toEqual([]);
    expect(await askAt('   ab', 5)).toEqual([]);
    expect(chatCompletion).not.toHaveBeenCalled();

    expect(await askAt('abc', 3)).toHaveLength(1);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the cursor sits in the middle of code', async () => {
    expect(await askAt('const total = sum(values)', 18)).toEqual([]);
    expect(await askAt('const total = sum', 13)).toEqual([]);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('completes inside brackets and quotes the editor closed on its own', async () => {
    expect(await askAt('for (const value of )', 20)).toHaveLength(1);
    expect(await askAt("const label = '';", 15)).toHaveLength(1);
    expect(await askAt('items.push({ })', 13)).toHaveLength(1);
    expect(chatCompletion).toHaveBeenCalledTimes(3);
  });

  it('still completes when only whitespace follows the cursor', async () => {
    expect(await askAt('const total =    ', 13)).toHaveLength(1);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('refuses to read a file whose name marks it as secret-bearing', async () => {
    const provider = new AgiInlineCompletionProvider(secretStorage());
    const secretDoc = {
      uri: workspaceUri('src/apiKey.ts'),
      languageId: 'typescript',
      lineCount: 1,
      lineAt: () => ({ text: 'const value = ' }),
      getText: () => 'const value = ',
    } as unknown as vscode.TextDocument;

    const items = await provider.provideInlineCompletionItems(
      secretDoc,
      new vscode.Position(0, 'const value = '.length),
      {} as vscode.InlineCompletionContext,
      token,
    );

    expect(items).toEqual([]);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('stays quiet while the feature is switched off', async () => {
    configure({ 'inlineCompletions.enabled': false });

    expect(await askAt('const value = ', 14)).toEqual([]);
    expect(chatCompletion).not.toHaveBeenCalled();
  });
});

describe('inline completions, real completion cache', () => {
  let now = 1_000_000;

  function askAt(
    provider: AgiInlineCompletionProvider,
    lineText: string,
    character = lineText.length,
  ): Promise<vscode.InlineCompletionItem[]> {
    return provider.provideInlineCompletionItems(
      documentAt(lineText),
      new vscode.Position(0, character),
      {} as vscode.InlineCompletionContext,
      token,
    ) as Promise<vscode.InlineCompletionItem[]>;
  }

  beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.mocked(chatCompletion).mockResolvedValue('const x = 1;');
  });

  afterEach(() => {
    vi.mocked(Date.now).mockRestore();
  });

  it('serves a repeated request from cache instead of asking the model again', async () => {
    const provider = new AgiInlineCompletionProvider(secretStorage());

    expect((await askAt(provider, 'const value = '))[0]?.insertText).toBe('const x = 1;');
    now += 5_000;
    expect((await askAt(provider, 'const value = '))[0]?.insertText).toBe('const x = 1;');

    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('asks again once the cached entry has outlived its 15s window', async () => {
    const provider = new AgiInlineCompletionProvider(secretStorage());

    await askAt(provider, 'const value = ');
    now += 15_001;
    await askAt(provider, 'const value = ');

    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('keys the cache on cursor position, not just the document', async () => {
    const provider = new AgiInlineCompletionProvider(secretStorage());

    await askAt(provider, 'const value = ');
    await askAt(provider, 'const value = ', 'const value ='.length);

    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('keys the cache on the code before the cursor', async () => {
    const provider = new AgiInlineCompletionProvider(secretStorage());

    await askAt(provider, 'const alpha = ');
    await askAt(provider, 'const gamma = ');

    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('forgets the oldest entry once sixteen completions are cached', async () => {
    const provider = new AgiInlineCompletionProvider(secretStorage());
    const prefix = (n: number) => `const value${n} = `;

    for (let n = 0; n < 16; n += 1) {
      await askAt(provider, prefix(n));
    }
    expect(chatCompletion).toHaveBeenCalledTimes(16);

    await askAt(provider, prefix(15));
    expect(chatCompletion).toHaveBeenCalledTimes(16);

    await askAt(provider, prefix(16));
    await askAt(provider, prefix(0));
    expect(chatCompletion).toHaveBeenCalledTimes(18);
  });

  it('drops everything it cached when the provider is disposed', async () => {
    const provider = new AgiInlineCompletionProvider(secretStorage());

    await askAt(provider, 'const value = ');
    provider.dispose();
    await askAt(provider, 'const value = ');

    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });
});

const SECRETS = secretStorage();

describe('inline completions, real paywall suppression', () => {
  function provider(): AgiInlineCompletionProvider {
    return new AgiInlineCompletionProvider(SECRETS);
  }

  async function ask(instance: AgiInlineCompletionProvider): Promise<unknown[]> {
    const items = await instance.provideInlineCompletionItems(
      documentAt('const value = '),
      new vscode.Position(0, 'const value = '.length),
      {} as vscode.InlineCompletionContext,
      token,
    );
    return items as unknown[];
  }

  it('stops asking the model after the first paywall error and warns once', async () => {
    const instance = provider();
    vi.mocked(chatCompletion).mockRejectedValue(
      new AgiWorkforcePaywallError('chat', 'pro', 'Token cap exceeded'),
    );

    expect(await ask(instance)).toEqual([]);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showCloudUtilityErrorActions)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showCloudUtilityErrorActions).mock.calls[0]?.[1]).toEqual({
      title: `${PRODUCT_NAMES.code}: Inline completions paused`,
      secrets: SECRETS,
    });

    expect(await ask(instance)).toEqual([]);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showCloudUtilityErrorActions)).toHaveBeenCalledTimes(1);
  });

  it('suppresses only the instance that hit the paywall', async () => {
    const suppressed = provider();
    vi.mocked(chatCompletion).mockRejectedValueOnce(
      new AgiWorkforcePaywallError('chat', 'pro', 'Token cap exceeded'),
    );
    await ask(suppressed);

    vi.mocked(chatCompletion).mockResolvedValue('const x = 1;');
    expect(await ask(suppressed)).toEqual([]);
    expect(await ask(provider())).toHaveLength(1);
  });

  it('keeps completing after an ordinary failure', async () => {
    const instance = provider();
    vi.mocked(chatCompletion).mockRejectedValueOnce(new Error('Network error'));

    expect(await ask(instance)).toEqual([]);
    expect(vi.mocked(showCloudUtilityErrorActions)).not.toHaveBeenCalled();

    vi.mocked(chatCompletion).mockResolvedValue('const x = 1;');
    const items = await ask(instance);
    expect(items).toHaveLength(1);
    expect((items[0] as vscode.InlineCompletionItem).insertText).toBe('const x = 1;');
  });

  it('surfaces the paywall through the shared cloud-utility action sheet, not a bespoke prompt', async () => {
    const instance = provider();
    const paywall = new AgiWorkforcePaywallError('chat', 'pro', 'Token cap exceeded');
    vi.mocked(chatCompletion).mockRejectedValue(paywall);

    await ask(instance);

    expect(vi.mocked(showCloudUtilityErrorActions).mock.calls[0]?.[0]).toBe(paywall);
    expect(vi.mocked(vscode.window.showWarningMessage)).not.toHaveBeenCalled();
  });
});

describe('inline completions, plan usage limits', () => {
  const NOW = Date.parse('2026-08-15T12:00:00.000Z');
  const SESSION_RESET_AT = '2026-08-15T15:30:00.000Z';

  function usageLimit(code: string): AgiWorkforceUsageLimitError {
    const block = classifyManagedQuotaErrorCode(code);
    if (block === null) throw new Error(`${code} is not a managed plan limit`);
    return new AgiWorkforceUsageLimitError(block.reason, 429, code, block, undefined);
  }

  async function ask(instance: AgiInlineCompletionProvider): Promise<unknown[]> {
    const items = await instance.provideInlineCompletionItems(
      documentAt('const value = '),
      new vscode.Position(0, 'const value = '.length),
      {} as vscode.InlineCompletionContext,
      token,
    );
    return items as unknown[];
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.mocked(fetchTierInfo).mockResolvedValue({
      tier: 'pro',
      usageBuckets: [
        { bucket: 'session', percentRemaining: 0, resetAt: SESSION_RESET_AT },
        { bucket: 'period', percentRemaining: 70, resetAt: '2026-09-01T00:00:00.000Z' },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pauses until the refusing window resets, warns once, then completes again', async () => {
    const instance = new AgiInlineCompletionProvider(SECRETS);
    vi.mocked(chatCompletion).mockRejectedValueOnce(usageLimit('rolling_five_hour_limit_reached'));

    expect(await ask(instance)).toEqual([]);
    expect(vi.mocked(showCloudUtilityErrorActions)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showCloudUtilityErrorActions).mock.calls[0]?.[1]).toEqual({
      title: `${PRODUCT_NAMES.code}: Inline completions paused`,
      secrets: SECRETS,
    });

    vi.mocked(chatCompletion).mockResolvedValue('const x = 1;');
    vi.setSystemTime(Date.parse(SESSION_RESET_AT) - 60_000);
    expect(await ask(instance)).toEqual([]);
    expect(chatCompletion).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.parse(SESSION_RESET_AT));
    const items = await ask(instance);
    expect(items).toHaveLength(1);
    expect((items[0] as vscode.InlineCompletionItem).insertText).toBe('const x = 1;');
    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(vi.mocked(showCloudUtilityErrorActions)).toHaveBeenCalledTimes(1);
  });

  it('tries again after fifteen minutes when the refusing window states no reset it can read', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue(undefined);
    const instance = new AgiInlineCompletionProvider(SECRETS);
    vi.mocked(chatCompletion).mockRejectedValueOnce(usageLimit('rolling_weekly_limit_reached'));

    expect(await ask(instance)).toEqual([]);
    vi.mocked(chatCompletion).mockResolvedValue('const x = 1;');
    vi.setSystemTime(NOW + 14 * 60_000);
    expect(await ask(instance)).toEqual([]);
    expect(chatCompletion).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW + 15 * 60_000);
    expect(await ask(instance)).toHaveLength(1);
    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(vi.mocked(showCloudUtilityErrorActions)).toHaveBeenCalledTimes(1);
  });

  it('tries again after an upgrade instead of staying paused until the window reloads', async () => {
    const instance = new AgiInlineCompletionProvider(SECRETS);
    vi.mocked(chatCompletion).mockRejectedValueOnce(
      new AgiWorkforcePaywallError('chat', 'pro', 'Token cap exceeded'),
    );
    expect(await ask(instance)).toEqual([]);

    vi.mocked(chatCompletion).mockResolvedValue('const x = 1;');
    vi.setSystemTime(NOW + 15 * 60_000);

    expect(await ask(instance)).toHaveLength(1);
  });

  it('pauses on a rejected sign-in, says so once, and resumes when the credential changes', async () => {
    const instance = new AgiInlineCompletionProvider(SECRETS);
    vi.mocked(chatCompletion).mockRejectedValue(
      new AgiWorkforceApiError('The saved AGI API key was rejected.', 401, 'INVALID_API_KEY'),
    );

    expect(await ask(instance)).toEqual([]);
    expect(await ask(instance)).toEqual([]);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showCloudUtilityErrorActions)).toHaveBeenCalledTimes(1);

    vi.mocked(chatCompletion).mockResolvedValue('const x = 1;');
    for (const changed of [...secretChanges]) changed();

    expect(await ask(instance)).toHaveLength(1);
  });

  it('pauses only the editor provider that hit the limit', async () => {
    const limited = new AgiInlineCompletionProvider(SECRETS);
    vi.mocked(chatCompletion).mockRejectedValueOnce(usageLimit('rolling_five_hour_limit_reached'));
    await ask(limited);

    vi.mocked(chatCompletion).mockResolvedValue('const x = 1;');
    expect(await ask(limited)).toEqual([]);
    expect(await ask(new AgiInlineCompletionProvider(SECRETS))).toHaveLength(1);
  });
});

type ImportedModule0 = typeof import('node:fs');

describe('inline completions, which documents may be sent', () => {
  function documentFor(uri: vscode.Uri, isUntitled = false): vscode.TextDocument {
    return { ...documentAt('const value = ', [], uri), isUntitled } as vscode.TextDocument;
  }

  async function sendsFrom(document: vscode.TextDocument): Promise<boolean> {
    vi.mocked(chatCompletion).mockResolvedValue('const x = 1;');
    const items = await new AgiInlineCompletionProvider(
      secretStorage(),
    ).provideInlineCompletionItems(
      document,
      new vscode.Position(0, 'const value = '.length),
      {} as vscode.InlineCompletionContext,
      token,
    );
    const sent = vi.mocked(chatCompletion).mock.calls.length > 0;
    expect((items as unknown[]).length > 0).toBe(sent);
    vi.mocked(chatCompletion).mockClear();
    return sent;
  }

  it.each([
    [
      'user settings',
      new vscode.Uri('vscode-userdata', '', '/Users/me/User/settings.json', '', ''),
    ],
    [
      'keybindings',
      new vscode.Uri('vscode-userdata', '', '/Users/me/User/keybindings.json', '', ''),
    ],
    ['an output channel', new vscode.Uri('output', '', 'extension-output-agi', '', '')],
    ['the source control message', new vscode.Uri('vscode-scm', 'git', '/scm0/input', '', '')],
    ['a notebook cell', new vscode.Uri('vscode-notebook-cell', '', '/w/nb.ipynb', '', '')],
  ])('sends nothing from %s', async (_label, uri) => {
    expect(await sendsFrom(documentFor(uri))).toBe(false);
  });

  it('sends nothing from an unsaved new file', async () => {
    const untitled = new vscode.Uri('untitled', '', 'Untitled-1', '', '');
    expect(await sendsFrom(documentFor(untitled, true))).toBe(false);
  });

  it('sends nothing from a file outside every workspace folder', async () => {
    expect(await sendsFrom(documentFor(vscode.Uri.file('/etc/hosts')))).toBe(false);
  });

  it('sends nothing from a file that git ignores', async () => {
    expect(await sendsFrom(documentFor(workspaceUri('dist/ignored.js')))).toBe(false);
  });

  it('sends nothing from a file the files.exclude setting leaves out', async () => {
    configure({ exclude: { 'config/**': true } });
    expect(await sendsFrom(documentFor(workspaceUri('config/local.yml')))).toBe(false);
  });

  it('sends nothing when the file can no longer be checked on disk', async () => {
    expect(await sendsFrom(documentFor(workspaceUri('src/deleted.ts')))).toBe(false);
  });

  it('still completes in an ordinary workspace file', async () => {
    expect(await sendsFrom(documentFor(workspaceUri('src/app.ts')))).toBe(true);
  });

  it.each(['src/lexer/tokenizer.rs', 'src/auth/passwordReset.tsx', 'tokenizers/src/lib.rs'])(
    'does not mistake %s for a secrets file',
    async (relativePath) => {
      expect(await sendsFrom(documentFor(workspaceUri(relativePath)))).toBe(true);
    },
  );

  it('still refuses a file named for the secret it holds', async () => {
    expect(await sendsFrom(documentFor(workspaceUri('config/api_token.txt')))).toBe(false);
  });
});

describe('inline completions, request size', () => {
  function sentUserMessage(): string {
    const messages = vi.mocked(chatCompletion).mock.calls[0]?.[1] ?? [];
    return messages.find((message) => message.role === 'user')?.content ?? '';
  }

  it('sends nothing from a minified line far longer than any line it would send', async () => {
    const minified = `const bundle = ${'a'.repeat(1_000_000)}`;
    vi.mocked(chatCompletion).mockResolvedValue('x');

    expect(await complete('x', { lineText: minified })).toBeUndefined();
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('caps each surrounding line and the whole request', async () => {
    const long = 'b'.repeat(50_000);
    const lines = Array.from({ length: 60 }, () => long);
    const document = {
      uri: workspaceUri('src/app.ts'),
      languageId: 'typescript',
      lineCount: 81,
      lineAt: (line: number) => ({ text: line === 60 ? 'const value = ' : long }),
      getText: () => [...lines, 'const value = ', ...lines].join('\n'),
    } as unknown as vscode.TextDocument;
    vi.mocked(chatCompletion).mockResolvedValue('42;');

    await new AgiInlineCompletionProvider(secretStorage()).provideInlineCompletionItems(
      document,
      new vscode.Position(60, 'const value = '.length),
      {} as vscode.InlineCompletionContext,
      token,
    );

    expect(chatCompletion).toHaveBeenCalledOnce();
    const message = sentUserMessage();
    expect(message.length).toBeLessThanOrEqual(7_000);
    expect(message).toContain('const value = <cursor>');
    expect(message).not.toContain('b'.repeat(1_001));
  });
});
