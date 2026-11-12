import { PRODUCT_NAMES } from '@agiworkforce/types';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  AgiWorkforceApiError,
  AgiWorkforcePaywallError,
  AgiWorkforceUsageLimitError,
  chatCompletion,
  fetchTierInfo,
  type LlmChatMessage,
} from '../../utils/api';
import { Config } from '../../platform/config';
import { isCredentialPath } from '../../utils/pathSafety';
import {
  limitResetAt,
  showCloudUtilityErrorActions,
  showLocalModelRefusal,
} from '../../core/cloudUtilityErrorActions';
import { cloudUtilityModel, LocalModelSelectedError } from '../../core/cloudModelBoundary';
import { describeOutboundRefusal } from '../../core/outboundContentGuard';
import { ContextResolutionCache, settingsWithholdReason } from '../../data/contextExclusion';

const SECRET_FILE_STEM =
  /(?:^|[._-])(?:secrets?|credentials?|passwords?|passwd|api[_-]?keys?|tokens?|private[_-]?keys?)$/u;

/** What the editor typed ahead of the cursor on its own: closing brackets, quotes, `;` or `,`. */
const AUTO_CLOSED_SUFFIX = /^[\s)\]}'"`;,]*$/u;
const MIN_PREFIX_CHARS = 3;
export const MAX_CONTEXT_LINES = 80;
export const MAX_SUFFIX_LINES = 20;
export const MAX_LINE_CHARS = 1_000;
export const MAX_PREFIX_CHARS = 6_000;
const MAX_SUFFIX_CHARS = 1_500;
const MAX_SUFFIX_HINT_CHARS = 500;
const CACHE_TTL_MS = 15_000;
const CACHE_MAX_ENTRIES = 16;
const RETRY_AFTER_PAUSE_MS = 15 * 60_000;

function namesSecretFile(filePath: string): boolean {
  const name = path.basename(filePath);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return SECRET_FILE_STEM.test(stem.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase());
}

function clipLine(text: string): string {
  return text.length > MAX_LINE_CHARS ? text.slice(0, MAX_LINE_CHARS) : text;
}

function textBeforeCursor(
  document: vscode.TextDocument,
  position: vscode.Position,
  linePrefix: string,
): string {
  const lines: string[] = [];
  for (let line = Math.max(0, position.line - MAX_CONTEXT_LINES); line < position.line; line += 1) {
    lines.push(clipLine(document.lineAt(line).text));
  }
  lines.push(linePrefix);
  const joined = lines.join('\n');
  if (joined.length <= MAX_PREFIX_CHARS) return joined;
  const tail = joined.slice(-MAX_PREFIX_CHARS);
  const lineStart = tail.indexOf('\n');
  return lineStart === -1 ? tail : tail.slice(lineStart + 1);
}

function textAfterCursor(
  document: vscode.TextDocument,
  position: vscode.Position,
  lineSuffix: string,
): string {
  const lines = [lineSuffix];
  const endLine = Math.min(document.lineCount - 1, position.line + MAX_SUFFIX_LINES);
  for (let line = position.line + 1; line <= endLine; line += 1) {
    lines.push(clipLine(document.lineAt(line).text));
  }
  return lines.join('\n').slice(0, MAX_SUFFIX_CHARS);
}

function failureNeedsPause(error: unknown): boolean {
  return (
    error instanceof AgiWorkforcePaywallError ||
    (error instanceof AgiWorkforceApiError &&
      (error.code === 'ACCOUNT_AUTH_REQUIRED' || error.code === 'INVALID_API_KEY'))
  );
}

interface CachedCompletion {
  key: string;
  value: string;
  createdAt: number;
}

class CompletionLruCache {
  private readonly map = new Map<string, CachedCompletion>();

  get(key: string): CachedCompletion | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { key, value, createdAt: Date.now() });
    while (this.map.size > CACHE_MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}

function withoutRepeatedPrefix(text: string, linePrefix: string): string {
  const typed = linePrefix.trimStart();
  if (typed.trim() === '') return text;
  const offered = text.trimStart();
  return offered.startsWith(typed) ? offered.slice(typed.length) : text;
}

function extractCompletionText(raw: string, maxLength: number, linePrefix: string): string {
  if (raw.trim() === '') return '';

  const fenced = /```[^\n`]*\n([\s\S]*?)```/u.exec(raw);
  const fromFence = fenced?.[1]?.trimEnd();
  if (fromFence !== undefined && fromFence.trim() !== '') {
    return withoutRepeatedPrefix(fromFence, linePrefix).slice(0, maxLength);
  }

  const meaningful = /^\s*?\S[^\n]*/u.exec(raw.replace(/\r\n?/gu, '\n'));
  const firstLine = meaningful?.[0]?.trimEnd() ?? '';
  return withoutRepeatedPrefix(firstLine, linePrefix).slice(0, maxLength);
}

export class AgiInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private readonly cache = new CompletionLruCache();
  private readonly exclusions = new ContextResolutionCache();
  private readonly secretsListener: vscode.Disposable | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingResolve: (() => void) | undefined;
  private pausedUntilMs: number | undefined;
  private pauseNoticeShown = false;
  private localModelNoticeShown = false;

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.secretsListener = secrets.onDidChange(() => {
      this.pausedUntilMs = undefined;
      this.pauseNoticeShown = false;
    });
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | undefined> {
    if (!Config.inlineCompletionsEnabled()) return [];
    if (this.pausedUntilMs !== undefined) {
      if (Date.now() < this.pausedUntilMs) return [];
      this.pausedUntilMs = undefined;
    }

    if (document.uri.scheme !== 'file' || document.isUntitled) return [];
    if (describeOutboundRefusal(document) !== null) return [];
    const fsPath = document.uri.fsPath;
    if (isCredentialPath(fsPath) || namesSecretFile(fsPath)) return [];
    if (settingsWithholdReason(fsPath) !== undefined) return [];
    const selected = cloudUtilityModel();
    if (selected.route === 'local') {
      if (!this.localModelNoticeShown) {
        this.localModelNoticeShown = true;
        void showLocalModelRefusal(
          new LocalModelSelectedError(selected.model, 'Inline completion'),
        );
      }
      return [];
    }

    const line = document.lineAt(position.line);
    if (line.text.length > MAX_LINE_CHARS) return [];
    const linePrefix = line.text.slice(0, position.character);
    const lineSuffix = line.text.slice(position.character);

    if (linePrefix.trim().length < MIN_PREFIX_CHARS) {
      return [];
    }

    if (!AUTO_CLOSED_SUFFIX.test(lineSuffix)) {
      return [];
    }

    const contextBeforeCursor = textBeforeCursor(document, position, linePrefix);
    const contextAfterCursor = textAfterCursor(document, position, lineSuffix);

    const cacheKey =
      `${document.uri.toString()}::${position.line}:${position.character}::` +
      contextBeforeCursor.slice(-1200);

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return [new vscode.InlineCompletionItem(cached.value, new vscode.Range(position, position))];
    }

    const debounceMs = Config.inlineCompletionsDebounceMs();
    const maxLength = Config.inlineCompletionsMaxLength();

    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.pendingResolve !== undefined) {
      this.pendingResolve();
      this.pendingResolve = undefined;
    }

    let cancelListener: vscode.Disposable | undefined;
    const shouldProceed = await new Promise<boolean>((resolve) => {
      this.pendingResolve = () => resolve(false);
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = undefined;
        this.pendingResolve = undefined;
        cancelListener?.dispose();
        resolve(true);
      }, debounceMs);

      cancelListener = token.onCancellationRequested(() => {
        if (this.debounceTimer !== undefined) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = undefined;
        }
        this.pendingResolve = undefined;
        cancelListener?.dispose();
        resolve(false);
      });
    });

    if (!shouldProceed || token.isCancellationRequested) {
      return [];
    }

    const resolution = await this.exclusions.resolve(fsPath);
    if (!resolution.ok || token.isCancellationRequested) return [];

    const language = document.languageId;
    const suffixSnippet = contextAfterCursor.trim();
    const suffixHint =
      suffixSnippet !== ''
        ? `\n\nCode after cursor:\n\`\`\`${language}\n${suffixSnippet.slice(0, MAX_SUFFIX_HINT_CHARS)}\n\`\`\``
        : '';

    const messages: LlmChatMessage[] = [
      {
        role: 'system',
        content:
          'You are an inline code completion engine. Return only the code continuation with no prose, no markdown fences, and no explanations.',
      },
      {
        role: 'user',
        content:
          `Complete the code at <cursor> for ${language}. Return only the continuation text.\n\n` +
          `\`\`\`${language}\n${contextBeforeCursor}<cursor>\n\`\`\`` +
          suffixHint,
      },
    ];

    try {
      const response = await chatCompletion(this.secrets, messages, token, undefined, 'deferred');
      if (token.isCancellationRequested) {
        return [];
      }

      this.pauseNoticeShown = false;
      const completion = extractCompletionText(response, maxLength, linePrefix);
      if (completion === '') {
        return [];
      }

      this.cache.set(cacheKey, completion);
      return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
    } catch (error: unknown) {
      if (error instanceof AgiWorkforceUsageLimitError) {
        if (this.pausedUntilMs !== undefined) return [];
        this.pausedUntilMs = Date.now() + RETRY_AFTER_PAUSE_MS;
        this.notifyPaused(error);
        let resetAt: string | null = null;
        try {
          resetAt = limitResetAt(error.code, await fetchTierInfo(this.secrets));
        } catch {
          resetAt = null;
        }
        const resetMs = resetAt === null ? Number.NaN : Date.parse(resetAt);
        if (Number.isFinite(resetMs)) this.pausedUntilMs = resetMs;
        return [];
      }
      if (failureNeedsPause(error)) {
        this.pausedUntilMs = Date.now() + RETRY_AFTER_PAUSE_MS;
        this.notifyPaused(error);
      }
      return [];
    }
  }

  private notifyPaused(error: unknown): void {
    if (this.pauseNoticeShown) return;
    this.pauseNoticeShown = true;
    void showCloudUtilityErrorActions(error, {
      title: `${PRODUCT_NAMES.code}: Inline completions paused`,
      secrets: this.secrets,
    });
  }

  dispose(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.cache.clear();
    this.exclusions.dispose();
    this.secretsListener?.dispose();
  }
}
