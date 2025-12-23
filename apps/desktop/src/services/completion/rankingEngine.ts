import * as monaco from 'monaco-editor';
import type { CodeContext } from './completionProvider';

export function rankCompletions(
  completions: monaco.languages.CompletionItem[],
  context: CodeContext,
): monaco.languages.CompletionItem[] {
  const scored = completions.map((completion) => ({
    completion,
    score: scoreCompletion(completion, context),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.map((item, index) => ({
    ...item.completion,
    sortText: index.toString().padStart(3, '0'),
  }));
}

function scoreCompletion(
  completion: monaco.languages.CompletionItem,
  context: CodeContext,
): number {
  let score = 100;

  const text =
    typeof completion.insertText === 'string'
      ? completion.insertText
      : typeof completion.label === 'string'
        ? completion.label
        : '';

  if (text.length < 5) {
    score -= 30;
  }

  const lineCount = text.split('\n').length;
  if (lineCount > 1) {
    score += lineCount * 5;
  }

  if (hasMatchingBraces(text)) {
    score += 15;
  }

  const usedVars = context.nearbyVariables.filter((v) => text.includes(v));
  score += usedVars.length * 10;

  if (context.currentFunction && text.includes(context.currentFunction)) {
    score += 20;
  }

  if (containsErrorPatterns(text)) {
    score -= 50;
  }

  return score;
}

function hasMatchingBraces(text: string): boolean {
  const braces = { '{': '}', '[': ']', '(': ')' };
  const stack: string[] = [];

  for (const char of text) {
    if (char in braces) {
      stack.push(braces[char as keyof typeof braces]);
    } else if (Object.values(braces).includes(char)) {
      if (stack.pop() !== char) {
        return false;
      }
    }
  }

  return stack.length === 0;
}

function containsErrorPatterns(text: string): boolean {
  const errorPatterns = [/undefined/i, /error/i, /\[object Object\]/, /NaN/, /null\s+is\s+not/i];

  return errorPatterns.some((pattern) => pattern.test(text));
}
