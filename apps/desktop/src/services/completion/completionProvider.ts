/**
 * Monaco Editor Completion Provider
 * Provides AI-powered code completions via LLM integration
 */

import * as monaco from 'monaco-editor';
import { invoke } from '@tauri-apps/api/core';
import { extractCodeContext } from './contextExtractor';
import { rankCompletions } from './rankingEngine';

export class AICompletionProvider implements monaco.languages.CompletionItemProvider {
  triggerCharacters = ['.', '(', '{', '[', '<', '"', "'", '/', ' '];

  async provideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext,
  ): Promise<monaco.languages.CompletionList | null> {
    // Skip if manually triggered without typing
    if (
      context.triggerKind === monaco.languages.CompletionTriggerKind.Invoke &&
      !context.triggerCharacter
    ) {
      return null;
    }

    const startTime = Date.now();

    try {
      // Extract context from current file
      const codeContext = extractCodeContext(model, position);

      // Build compact prompt for LLM (max 2K tokens)
      const prompt = this.buildCompletionPrompt(codeContext);

      // Query LLM via Tauri command with timeout
      const completionResult = await Promise.race([
        invoke<CompletionResponse>('get_code_completion', {
          prompt,
          language: model.getLanguageId(),
          maxTokens: 150,
          temperature: 0.3,
        }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Completion timeout')), 500),
        ),
      ]);

      if (!completionResult) {
        return null;
      }

      // Parse and rank suggestions
      const suggestions = this.parseCompletionResponse(completionResult, position, codeContext);
      const rankedSuggestions = rankCompletions(suggestions, codeContext);

      const latency = Date.now() - startTime;
      console.debug(
        `[Completion] Generated ${rankedSuggestions.length} suggestions in ${latency}ms`,
      );

      return {
        suggestions: rankedSuggestions,
        incomplete: false,
      };
    } catch (error) {
      console.warn('[Completion] Failed to generate completions:', error);
      return null;
    }
  }

  private buildCompletionPrompt(context: CodeContext): string {
    const { beforeCursor, afterCursor, imports, language, fileName } = context;

    return `# Code Completion Task

File: ${fileName}
Language: ${language}

## Imports
\`\`\`${language}
${imports.join('\n')}
\`\`\`

## Code Before Cursor
\`\`\`${language}
${beforeCursor.slice(-500)} // Last 500 chars
\`\`\`

## Cursor Position: [COMPLETE HERE]

## Code After Cursor
\`\`\`${language}
${afterCursor.slice(0, 200)} // Next 200 chars
\`\`\`

Generate 1-3 natural code completions for [COMPLETE HERE].
Return ONLY the completion text, no explanations.
Support multi-line completions if appropriate.`;
  }

  private parseCompletionResponse(
    response: CompletionResponse,
    position: monaco.Position,
    _context: CodeContext,
  ): monaco.languages.CompletionItem[] {
    const completions: monaco.languages.CompletionItem[] = [];
    const lines = response.content.split('\n');

    // Parse multi-line completion
    const completion = lines.join('\n').trim();

    if (completion.length > 0) {
      completions.push({
        label: this.getCompletionLabel(completion),
        kind: this.inferCompletionKind(completion),
        insertText: completion,
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
        detail: 'AI Suggestion',
        documentation: {
          value: `Generated completion (${response.model})`,
        },
        sortText: '0', // Prioritize AI suggestions
      });
    }

    return completions;
  }

  private getCompletionLabel(completion: string): string {
    const firstLine = completion.split('\n')[0] || '';
    return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine;
  }

  private inferCompletionKind(completion: string): monaco.languages.CompletionItemKind {
    const firstLine = completion.trim();

    if (firstLine.startsWith('function') || firstLine.startsWith('const')) {
      return monaco.languages.CompletionItemKind.Function;
    }
    if (firstLine.startsWith('class') || firstLine.startsWith('interface')) {
      return monaco.languages.CompletionItemKind.Class;
    }
    if (firstLine.includes('import')) {
      return monaco.languages.CompletionItemKind.Module;
    }
    if (firstLine.match(/^[a-zA-Z_][a-zA-Z0-9_]*:/)) {
      return monaco.languages.CompletionItemKind.Property;
    }

    return monaco.languages.CompletionItemKind.Text;
  }
}

export interface CodeContext {
  beforeCursor: string;
  afterCursor: string;
  imports: string[];
  language: string;
  fileName: string;
  currentFunction?: string;
  nearbyVariables: string[];
}

export interface CompletionResponse {
  content: string;
  model: string;
  tokens: number;
  latency: number;
}

/**
 * Register the AI completion provider with Monaco
 */
export function registerCompletionProvider(
  languages: string[] = ['typescript', 'javascript', 'rust', 'python', 'go'],
): monaco.IDisposable[] {
  const provider = new AICompletionProvider();
  return languages.map((lang) =>
    monaco.languages.registerCompletionItemProvider(lang, provider),
  );
}
