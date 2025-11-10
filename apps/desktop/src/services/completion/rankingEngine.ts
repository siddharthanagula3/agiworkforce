/**
 * Completion Ranking Engine
 * Scores and ranks AI-generated code completions
 */

import * as monaco from 'monaco-editor';
import type { CodeContext } from './completionProvider';

/**
 * Rank completions by relevance and quality
 * Higher score = better completion
 */
export function rankCompletions(
  completions: monaco.languages.CompletionItem[],
  context: CodeContext,
): monaco.languages.CompletionItem[] {
  const scored = completions.map((completion) => ({
    completion,
    score: scoreCompletion(completion, context),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Update sortText based on rank
  return scored.map((item, index) => ({
    ...item.completion,
    sortText: index.toString().padStart(3, '0'),
  }));
}

/**
 * Score a single completion
 */
function scoreCompletion(
  completion: monaco.languages.CompletionItem,
  context: CodeContext,
): number {
  let score = 100; // Base score

  const text =
    typeof completion.insertText === 'string'
      ? completion.insertText
      : typeof completion.label === 'string'
        ? completion.label
        : '';

  // Penalize very short completions (likely incomplete)
  if (text.length < 5) {
    score -= 30;
  }

  // Reward multi-line completions (more complete)
  const lineCount = text.split('\n').length;
  if (lineCount > 1) {
    score += lineCount * 5;
  }

  // Reward syntax validity heuristics
  if (hasMatchingBraces(text)) {
    score += 15;
  }

  // Reward if uses nearby variables (contextual)
  const usedVars = context.nearbyVariables.filter((v) => text.includes(v));
  score += usedVars.length * 10;

  // Reward if matches current function context
  if (context.currentFunction && text.includes(context.currentFunction)) {
    score += 20;
  }

  // Penalize if contains obvious errors
  if (containsErrorPatterns(text)) {
    score -= 50;
  }

  return score;
}

/**
 * Check if braces are balanced
 */
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

/**
 * Check for common error patterns
 */
function containsErrorPatterns(text: string): boolean {
  const errorPatterns = [
    /undefined/i,
    /error/i,
    /\[object Object\]/,
    /NaN/,
    /null\s+is\s+not/i,
  ];

  return errorPatterns.some((pattern) => pattern.test(text));
}
