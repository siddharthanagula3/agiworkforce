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

export const ERROR_PATTERNS: ErrorPattern[] = [
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
        break;
      }
    }
  }

  return errors;
}

function isAutoFixable(errorType: string): boolean {
  const autoFixableTypes = ['eslint', 'typescript'];
  return autoFixableTypes.includes(errorType);
}

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

export function parseErrorDetails(errorLine: string): Partial<DetectedError> {
  const fileLineCol = errorLine.match(/^(.+?):(\d+):(\d+)/);
  if (fileLineCol && fileLineCol[1] && fileLineCol[2] && fileLineCol[3]) {
    return {
      file: fileLineCol[1],
      line: parseInt(fileLineCol[2], 10),
      column: parseInt(fileLineCol[3], 10),
    };
  }

  const fileLine = errorLine.match(/^(.+?):(\d+)/);
  if (fileLine && fileLine[1] && fileLine[2]) {
    return {
      file: fileLine[1],
      line: parseInt(fileLine[2], 10),
    };
  }

  return {};
}

export function shouldRetry(errors: DetectedError[], attemptCount: number): boolean {
  const MAX_RETRY_ATTEMPTS = 3;

  if (attemptCount >= MAX_RETRY_ATTEMPTS) {
    return false;
  }

  const hasFixableErrors = errors.some((err) => err.autoFixable);

  const hasRealErrors = errors.some((err) => err.severity === 'error');

  return hasFixableErrors && hasRealErrors;
}

export function extractCode(response: string): string {
  const codeBlockMatch = response.match(/```(?:\w+)?\n([\s\S]+?)\n```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  return response.trim();
}

export function calculateErrorSeverity(errors: DetectedError[]): number {
  let score = 0;
  for (const error of errors) {
    if (error.severity === 'error') {
      score += error.type === 'runtime' ? 10 : 5;
    } else {
      score += 1;
    }
  }
  return score;
}
