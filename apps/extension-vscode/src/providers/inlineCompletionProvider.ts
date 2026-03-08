import * as vscode from 'vscode';
import { AgiWorkforceApiError, chatCompletion, type ChatMessage } from '../utils/api';

const MIN_PREFIX_CHARS = 3;
const MAX_CONTEXT_LINES = 80;
const MAX_SUFFIX_LINES = 20;
const CACHE_TTL_MS = 15_000;
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_MAX_COMPLETION_LENGTH = 500;

interface CachedCompletion {
  key: string;
  value: string;
  createdAt: number;
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
  private cache: CachedCompletion | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingResolve: (() => void) | undefined;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | undefined> {
    const config = vscode.workspace.getConfiguration('agiWorkforce');
    const enabled = config.get<boolean>('inlineCompletions.enabled') ?? false;
    if (!enabled) {
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

    if (
      this.cache !== undefined &&
      this.cache.key === cacheKey &&
      Date.now() - this.cache.createdAt <= CACHE_TTL_MS
    ) {
      return [
        new vscode.InlineCompletionItem(this.cache.value, new vscode.Range(position, position)),
      ];
    }

    const debounceMs = config.get<number>('inlineCompletions.debounceMs') ?? DEFAULT_DEBOUNCE_MS;
    const maxLength =
      config.get<number>('inlineCompletions.maxLength') ?? DEFAULT_MAX_COMPLETION_LENGTH;

    // Debounce: cancel any pending request and wait for the user to stop typing
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.pendingResolve !== undefined) {
      this.pendingResolve();
      this.pendingResolve = undefined;
    }

    // Wait for debounce period before sending the request
    const shouldProceed = await new Promise<boolean>((resolve) => {
      this.pendingResolve = () => resolve(false);
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = undefined;
        this.pendingResolve = undefined;
        resolve(true);
      }, debounceMs);

      token.onCancellationRequested(() => {
        if (this.debounceTimer !== undefined) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = undefined;
        }
        this.pendingResolve = undefined;
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

    const messages: ChatMessage[] = [
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

      this.cache = {
        key: cacheKey,
        value: completion,
        createdAt: Date.now(),
      };

      return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
    } catch (error) {
      // Keep inline completions silent; chat/commands surface explicit errors.
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
  }
}
