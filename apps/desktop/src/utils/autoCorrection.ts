/**
 * Auto-Correction System
 *
 * Detects errors in code/output and suggests corrections.
 * Similar to BugBot in Cursor and auto-fix in Claude Code.
 */

export interface ErrorPattern {
  pattern: RegExp;
  type: 'typescript' | 'eslint' | 'rust' | 'syntax' | 'runtime';
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface DetectedError {
  type: string;
  severity: 'error' | 'warning';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  suggestion?: string;
  autoFixable: boolean;
}

/**
 * Common error patterns across languages
 */
export const ERROR_PATTERNS: ErrorPattern[] = [
  // TypeScript errors
  {
    pattern: /error TS(\d+): (.+)/,
    type: 'typescript',
    severity: 'error',
  },
  {
    pattern: /Property '(\w+)' does not exist on type/,
    type: 'typescript',
    severity: 'error',
    suggestion: 'Check property name spelling or add type definition',
  },
  {
    pattern: /Cannot find name '(\w+)'/,
    type: 'typescript',
    severity: 'error',
    suggestion: 'Import the module or check variable name',
  },
  {
    pattern: /Type '(.+)' is not assignable to type '(.+)'/,
    type: 'typescript',
    severity: 'error',
    suggestion: 'Check type compatibility or add type assertion',
  },

  // ESLint errors
  {
    pattern: /(\d+):(\d+)\s+(error|warning)\s+(.+)\s+(\S+)/,
    type: 'eslint',
    severity: 'error',
  },
  {
    pattern: /'(\w+)' is not defined/,
    type: 'eslint',
    severity: 'error',
    suggestion: 'Import or declare the variable',
  },
  {
    pattern: /'(\w+)' is assigned a value but never used/,
    type: 'eslint',
    severity: 'warning',
    suggestion: 'Remove unused variable or prefix with underscore',
  },

  // Rust errors
  {
    pattern: /error\[E(\d+)\]: (.+)/,
    type: 'rust',
    severity: 'error',
  },
  {
    pattern: /cannot find .+ `(\w+)` in/,
    type: 'rust',
    severity: 'error',
    suggestion: 'Import the item or check module path',
  },
  {
    pattern: /mismatched types/,
    type: 'rust',
    severity: 'error',
    suggestion: 'Check type compatibility or add type conversion',
  },

  // Syntax errors
  {
    pattern: /SyntaxError: (.+)/,
    type: 'syntax',
    severity: 'error',
    suggestion: 'Check syntax near the error location',
  },
  {
    pattern: /Unexpected token/,
    type: 'syntax',
    severity: 'error',
    suggestion: 'Check for missing commas, brackets, or quotes',
  },

  // Runtime errors
  {
    pattern: /ReferenceError: (.+) is not defined/,
    type: 'runtime',
    severity: 'error',
    suggestion: 'Declare or import the variable',
  },
  {
    pattern: /TypeError: (.+)/,
    type: 'runtime',
    severity: 'error',
    suggestion: 'Check type compatibility and null checks',
  },
];

/**
 * Parse error output and extract structured error information
 */
export function detectErrors(output: string): DetectedError[] {
  const errors: DetectedError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    for (const errorPattern of ERROR_PATTERNS) {
      const match = line.match(errorPattern.pattern);
      if (match) {
        errors.push({
          type: errorPattern.type,
          severity: errorPattern.severity,
          message: line.trim(),
          suggestion: errorPattern.suggestion,
          autoFixable: isAutoFixable(errorPattern.type),
        });
        break; // Only match first pattern per line
      }
    }
  }

  return errors;
}

/**
 * Determine if an error type is auto-fixable
 */
function isAutoFixable(errorType: string): boolean {
  const autoFixableTypes = ['eslint', 'typescript'];
  return autoFixableTypes.includes(errorType);
}

/**
 * Generate a correction prompt for the LLM
 */
export function generateCorrectionPrompt(errors: DetectedError[], originalCode: string): string {
  const errorSummary = errors
    .map((err, idx) => {
      let summary = `${idx + 1}. [${err.severity.toUpperCase()}] ${err.type}: ${err.message}`;
      if (err.file) summary += `\n   File: ${err.file}`;
      if (err.line) summary += ` Line: ${err.line}`;
      if (err.suggestion) summary += `\n   Suggestion: ${err.suggestion}`;
      return summary;
    })
    .join('\n\n');

  return `The following errors were detected in the code:

${errorSummary}

Original code:
\`\`\`
${originalCode}
\`\`\`

Please fix all errors and provide the corrected code. Focus on:
1. Fixing the specific errors listed above
2. Maintaining the original functionality
3. Following best practices for the language
4. Adding any missing imports or type definitions

Provide only the corrected code without explanations.`;
}

/**
 * Extract error details from common output formats
 */
export function parseErrorDetails(errorLine: string): Partial<DetectedError> {
  // Try to extract file, line, column from formats like:
  // "src/file.ts:10:5 - error TS2304: Cannot find name 'foo'"
  // "file.rs:42:10: error[E0425]: cannot find value `x`"

  const fileLineCol = errorLine.match(/^(.+?):(\d+):(\d+)/);
  if (fileLineCol && fileLineCol[1] && fileLineCol[2] && fileLineCol[3]) {
    return {
      file: fileLineCol[1],
      line: parseInt(fileLineCol[2], 10),
      column: parseInt(fileLineCol[3], 10),
    };
  }

  // Try simpler format: "file.ts:10 - error"
  const fileLine = errorLine.match(/^(.+?):(\d+)/);
  if (fileLine && fileLine[1] && fileLine[2]) {
    return {
      file: fileLine[1],
      line: parseInt(fileLine[2], 10),
    };
  }

  return {};
}

/**
 * Check if errors are fixable and worth retrying
 */
export function shouldRetry(errors: DetectedError[], attemptCount: number): boolean {
  const MAX_RETRY_ATTEMPTS = 3;

  if (attemptCount >= MAX_RETRY_ATTEMPTS) {
    return false; // Don't retry after max attempts
  }

  // Only retry if we have auto-fixable errors
  const hasFixableErrors = errors.some((err) => err.autoFixable);

  // Don't retry if all errors are warnings
  const hasRealErrors = errors.some((err) => err.severity === 'error');

  return hasFixableErrors && hasRealErrors;
}

/**
 * Extract code from AI response (remove markdown fences)
 */
export function extractCode(response: string): string {
  // Try to extract code from markdown code blocks
  const codeBlockMatch = response.match(/```(?:\w+)?\n([\s\S]+?)\n```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  // If no code block, return trimmed response
  return response.trim();
}

/**
 * Calculate error severity score (higher = more severe)
 */
export function calculateErrorSeverity(errors: DetectedError[]): number {
  let score = 0;
  for (const error of errors) {
    if (error.severity === 'error') {
      score += error.type === 'runtime' ? 10 : 5;
    } else {
      score += 1; // warnings
    }
  }
  return score;
}
