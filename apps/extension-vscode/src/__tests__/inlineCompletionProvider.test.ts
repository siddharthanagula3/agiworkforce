import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { classifyManagedQuotaErrorCode } from '@agiworkforce/types';
import {
  AgiWorkforcePaywallError,
  AgiWorkforceUsageLimitError,
  chatCompletion,
  fetchTierInfo,
} from '../utils/api';
import { showCloudUtilityErrorActions } from '../core/cloudUtilityErrorActions';
import { AgiInlineCompletionProvider } from '../features/inline-completions/inlineCompletionProvider';
type ScanModule0 = typeof import('../core/cloudUtilityErrorActions');
type ScanModule1 = typeof import('../utils/api');

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

function configure(values: Record<string, unknown>): void {
  for (const key of Object.keys(SETTINGS)) delete SETTINGS[key];
  Object.assign(SETTINGS, {
    'inlineCompletions.enabled': true,
    'inlineCompletions.debounceMs': 0,
    'inlineCompletions.maxLength': 500,
    ...values,
  });
}

function documentAt(lineText: string, following: string[] = []): vscode.TextDocument {
  const lines = [lineText, ...following];
  return {
    uri: vscode.Uri.file('/workspace/src/app.ts'),
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

  const items = await new AgiInlineCompletionProvider(
    {} as vscode.SecretStorage,
  ).provideInlineCompletionItems(
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
  it('suggests nothing when the model returns blank text', async () => {
    expect(await complete('')).toBeUndefined();
    expect(await complete('   \n  ')).toBeUndefined();
  });

  it('unwraps a fenced block, with or without a language tag', async () => {
    expect(await complete('```typescript\nconst x = 42;\n```')).toBe('const x = 42;');
    expect(await complete('```\nconst x = 42;\n```')).toBe('const x = 42;');
  });

  it('falls back to the first meaningful line when the model returns prose', async () => {
    expect(await complete('\n\n  42;  \nand then some prose')).toBe('42;');
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
    return new AgiInlineCompletionProvider({} as vscode.SecretStorage).provideInlineCompletionItems(
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
    expect(await askAt('const total = sum()', 18)).toEqual([]);
    expect(await askAt('const total = sum', 13)).toEqual([]);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('still completes when only whitespace follows the cursor', async () => {
    expect(await askAt('const total =    ', 13)).toHaveLength(1);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('refuses to read a file whose name marks it as secret-bearing', async () => {
    const provider = new AgiInlineCompletionProvider({} as vscode.SecretStorage);
    const secretDoc = {
      uri: vscode.Uri.file('/workspace/src/apiKey.ts'),
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
    const provider = new AgiInlineCompletionProvider({} as vscode.SecretStorage);

    expect((await askAt(provider, 'const value = '))[0]?.insertText).toBe('const x = 1;');
    now += 5_000;
    expect((await askAt(provider, 'const value = '))[0]?.insertText).toBe('const x = 1;');

    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('asks again once the cached entry has outlived its 15s window', async () => {
    const provider = new AgiInlineCompletionProvider({} as vscode.SecretStorage);

    await askAt(provider, 'const value = ');
    now += 15_001;
    await askAt(provider, 'const value = ');

    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('keys the cache on cursor position, not just the document', async () => {
    const provider = new AgiInlineCompletionProvider({} as vscode.SecretStorage);

    await askAt(provider, 'const value = ');
    await askAt(provider, 'const value = ', 'const value ='.length);

    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('keys the cache on the code before the cursor', async () => {
    const provider = new AgiInlineCompletionProvider({} as vscode.SecretStorage);

    await askAt(provider, 'const alpha = ');
    await askAt(provider, 'const gamma = ');

    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('forgets the oldest entry once sixteen completions are cached', async () => {
    const provider = new AgiInlineCompletionProvider({} as vscode.SecretStorage);
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
    const provider = new AgiInlineCompletionProvider({} as vscode.SecretStorage);

    await askAt(provider, 'const value = ');
    provider.dispose();
    await askAt(provider, 'const value = ');

    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });
});

const SECRETS = {} as vscode.SecretStorage;

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
      title: 'AGI Workforce: Inline completions paused',
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
      title: 'AGI Workforce: Inline completions paused',
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

  it('holds the pause when the refusing window states no reset it can read', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue(undefined);
    const instance = new AgiInlineCompletionProvider(SECRETS);
    vi.mocked(chatCompletion).mockRejectedValueOnce(usageLimit('rolling_weekly_limit_reached'));

    expect(await ask(instance)).toEqual([]);
    vi.mocked(chatCompletion).mockResolvedValue('const x = 1;');
    vi.setSystemTime(NOW + 7 * 24 * 60 * 60 * 1000);

    expect(await ask(instance)).toEqual([]);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showCloudUtilityErrorActions)).toHaveBeenCalledTimes(1);
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
