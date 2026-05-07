import * as vscode from 'vscode';
import {
  AgiWorkforceApiError,
  AgiWorkforcePaywallError,
  chatCompletion,
  type LlmChatMessage,
} from '../utils/api';
import { Config } from '../utils/config';

const MIN_PREFIX_CHARS = 3;
const MAX_CONTEXT_LINES = 80;
const MAX_SUFFIX_LINES = 20;
const CACHE_TTL_MS = 15_000;
const CACHE_MAX_ENTRIES = 16;

interface CachedCompletion {
  key: string;
  value: string;
  createdAt: number;
}

/**
 * Bounded LRU keyed by `${docUri}::line:col::context`. Replaces the previous
 * single-slot cache so typo-correction loops (move cursor 1 char, type, undo)
 * don't fire a fresh network request every keystroke.
 */
class CompletionLruCache {
  private readonly map = new Map<string, CachedCompletion>();

  get(key: string): CachedCompletion | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      this.map.delete(key);
      return undefined;
    }
    // Touch (move to most-recent end of insertion order).
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

  /** Test-only inspector. */
  size(): number {
    return this.map.size;
  }
}

function extractCompletionText(raw: string, maxLength: number): string {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return '';
  }

  const fenced = /```(?:\w+)?\s*\n([\s\S]*?)```/.exec(trimmed);
  const fromFence = fenced?.[1]?.trimEnd();
  if (fromFence !== undefined && fromFence !== '') {
    return fromFence.slice(0, maxLength);
  }

  // If the model returns explanatory prose, keep only the first meaningful line.
  const firstLine = trimmed.split('\n').find((line) => line.trim() !== '');
  const result = firstLine?.trim() ?? '';
  return result.slice(0, maxLength);
}

export class AgiInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private readonly cache = new CompletionLruCache();
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingResolve: (() => void) | undefined;
  /**
   * When true, inline completions are silently suppressed for the remainder of
   * the VS Code session.  Set on the first paywall hit so we don't spam the
   * user with a toast on every keystroke.
   */
  private paywallSuppressed = false;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | undefined> {
    if (!Config.inlineCompletionsEnabled() || this.paywallSuppressed) {
      return [];
    }

    const line = document.lineAt(position.line);
    const linePrefix = line.text.slice(0, position.character);
    const lineSuffix = line.text.slice(position.character);

    if (linePrefix.trim().length < MIN_PREFIX_CHARS) {
      return [];
    }

    // Avoid trying to autocomplete into the middle of non-whitespace text.
    if (lineSuffix.trim() !== '') {
      return [];
    }

    const startLine = Math.max(0, position.line - MAX_CONTEXT_LINES);
    const contextRange = new vscode.Range(startLine, 0, position.line, position.character);
    const contextBeforeCursor = document.getText(contextRange);

    // Gather suffix context for better completions
    const endLine = Math.min(document.lineCount - 1, position.line + MAX_SUFFIX_LINES);
    const suffixRange = new vscode.Range(
      position.line,
      position.character,
      endLine,
      document.lineAt(endLine).text.length,
    );
    const contextAfterCursor = document.getText(suffixRange);

    const cacheKey =
      `${document.uri.toString()}::${position.line}:${position.character}::` +
      contextBeforeCursor.slice(-1200);

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return [new vscode.InlineCompletionItem(cached.value, new vscode.Range(position, position))];
    }

    const debounceMs = Config.inlineCompletionsDebounceMs();
    const maxLength = Config.inlineCompletionsMaxLength();

    // Debounce: cancel any pending request and wait for the user to stop typing
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.pendingResolve !== undefined) {
      this.pendingResolve();
      this.pendingResolve = undefined;
    }

    // Wait for debounce period before sending the request.
    // The cancellation listener must be disposed to prevent accumulation
    // across rapid keystrokes (each call registers a new listener).
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

    const language = document.languageId;
    const suffixSnippet = contextAfterCursor.trim();
    const suffixHint =
      suffixSnippet !== ''
        ? `\n\nCode after cursor:\n\`\`\`${language}\n${suffixSnippet.slice(0, 500)}\n\`\`\``
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
      const response = await chatCompletion(this.secrets, messages, token);
      if (token.isCancellationRequested) {
        return [];
      }

      const completion = extractCompletionText(response, maxLength);
      if (completion === '') {
        return [];
      }

      this.cache.set(cacheKey, completion);
      return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
    } catch (error) {
      // Keep inline completions silent; chat/commands surface explicit errors.
      if (error instanceof AgiWorkforcePaywallError) {
        // Suppress all future inline completion requests for this session to
        // avoid a toast+request loop on every keystroke.
        if (!this.paywallSuppressed) {
          this.paywallSuppressed = true;
          // Show a single one-time notification — never repeated.
          vscode.window
            .showInformationMessage(
              `AGI Workforce: Inline completions paused — upgrade to ${error.requiredTier} to continue.`,
              'Upgrade',
            )
            .then((choice) => {
              if (choice === 'Upgrade') {
                vscode.env.openExternal(
                  vscode.Uri.parse(
                    `https://agiworkforce.com/pricing?from=paywall` +
                      `&tier=${encodeURIComponent(error.requiredTier)}` +
                      `&feature=${encodeURIComponent(error.feature)}`,
                  ),
                );
              }
            });
        }
        return [];
      }
      if (error instanceof AgiWorkforceApiError && error.code === 'NO_API_KEY') {
        return [];
      }
      if (error instanceof AgiWorkforceApiError && error.code === 'CANCELLED') {
        return [];
      }
      return [];
    }
  }

  dispose(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.cache.clear();
  }
}
