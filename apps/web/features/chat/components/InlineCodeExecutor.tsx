'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Play, Loader2, X, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExecutionOutput {
  stdout: string;
  stderr: string;
  returnValue: string | null;
  success: boolean;
  duration: number;
  timedOut?: boolean;
}

export interface InlineCodeExecutorProps {
  /** The raw code string to execute */
  code: string;
  /** Language: 'python' | 'py' | 'javascript' | 'js' */
  language: string;
  /** Additional class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EXECUTION_TIME = 10_000; // 10 seconds
const MAX_OUTPUT_LENGTH = 50_000; // 50KB display cap

// ---------------------------------------------------------------------------
// Pyodide loader (lazy, singleton)
// ---------------------------------------------------------------------------

type PyodideInstance = {
  runPythonAsync: (code: string) => Promise<unknown>;
  globals: {
    get: (name: string) => unknown;
    set: (name: string, value: unknown) => void;
  };
};

let pyodidePromise: Promise<PyodideInstance> | null = null;
let pyodideAvailable: boolean | null = null;

async function loadPyodide(): Promise<PyodideInstance> {
  if (pyodidePromise) return pyodidePromise;

  pyodidePromise = (async () => {
    try {
      const mod = await import(
        /* @vite-ignore */
        'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.mjs'
      );
      const instance = (await mod.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
      })) as PyodideInstance;
      pyodideAvailable = true;
      return instance;
    } catch {
      pyodideAvailable = false;
      pyodidePromise = null;
      throw new Error('Failed to load Pyodide runtime');
    }
  })();

  return pyodidePromise;
}

// ---------------------------------------------------------------------------
// Execution helpers
// ---------------------------------------------------------------------------

function truncateOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_LENGTH) return text;
  return text.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
}

async function executeJavaScript(code: string): Promise<ExecutionOutput> {
  const start = performance.now();
  const logs: string[] = [];
  const errors: string[] = [];

  // Build a console proxy that captures output
  const consoleProxy = {
    log: (...args: unknown[]) => {
      logs.push(args.map(formatValue).join(' '));
    },
    warn: (...args: unknown[]) => {
      logs.push(args.map(formatValue).join(' '));
    },
    error: (...args: unknown[]) => {
      errors.push(args.map(formatValue).join(' '));
    },
    info: (...args: unknown[]) => {
      logs.push(args.map(formatValue).join(' '));
    },
    debug: (...args: unknown[]) => {
      logs.push(args.map(formatValue).join(' '));
    },
    table: (data: unknown) => {
      logs.push(formatValue(data));
    },
    dir: (obj: unknown) => {
      logs.push(formatValue(obj));
    },
    clear: () => {
      logs.length = 0;
    },
    assert: (condition: unknown, ...args: unknown[]) => {
      if (!condition) {
        errors.push('Assertion failed: ' + args.map(formatValue).join(' '));
      }
    },
  };

  return new Promise<ExecutionOutput>((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({
        stdout: truncateOutput(logs.join('\n')),
        stderr: 'Execution timed out after 10 seconds',
        returnValue: null,
        success: false,
        duration: MAX_EXECUTION_TIME,
        timedOut: true,
      });
    }, MAX_EXECUTION_TIME);

    try {
      // Use new Function with a console proxy — safer than raw eval,
      // scoped to an IIFE so `return` works for expression results.
      // We wrap in an async IIFE to support top-level await.
      const fn = new Function(
        'console',
        `"use strict";
return (async () => {
${code}
})();`,
      );

      const resultPromise = fn(consoleProxy);

      // Handle both sync and async results
      Promise.resolve(resultPromise)
        .then((returnValue: unknown) => {
          clearTimeout(timeoutId);
          const duration = performance.now() - start;
          const returnStr =
            returnValue !== undefined && returnValue !== null ? formatValue(returnValue) : null;

          resolve({
            stdout: truncateOutput(logs.join('\n')),
            stderr: truncateOutput(errors.join('\n')),
            returnValue: returnStr,
            success: errors.length === 0,
            duration,
          });
        })
        .catch((err: unknown) => {
          clearTimeout(timeoutId);
          const duration = performance.now() - start;
          const errMsg = err instanceof Error ? err.message : String(err);
          const errStack = err instanceof Error && err.stack ? err.stack : errMsg;

          resolve({
            stdout: truncateOutput(logs.join('\n')),
            stderr: truncateOutput(errStack),
            returnValue: null,
            success: false,
            duration,
          });
        });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const duration = performance.now() - start;
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error && err.stack ? err.stack : errMsg;

      resolve({
        stdout: truncateOutput(logs.join('\n')),
        stderr: truncateOutput(errStack),
        returnValue: null,
        success: false,
        duration,
      });
    }
  });
}

async function executePython(code: string): Promise<ExecutionOutput> {
  // Quick check: if we already know Pyodide failed, bail fast
  if (pyodideAvailable === false) {
    return {
      stdout: '',
      stderr:
        'Python execution requires Pyodide (WebAssembly). Load failed or unavailable in this environment.',
      returnValue: null,
      success: false,
      duration: 0,
    };
  }

  const start = performance.now();

  return new Promise<ExecutionOutput>((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({
        stdout: '',
        stderr: 'Execution timed out after 10 seconds',
        returnValue: null,
        success: false,
        duration: MAX_EXECUTION_TIME,
        timedOut: true,
      });
    }, MAX_EXECUTION_TIME);

    loadPyodide()
      .then(async (pyodide) => {
        // Redirect stdout/stderr
        await pyodide.runPythonAsync(`
import sys
from io import StringIO
__stdout__ = StringIO()
__stderr__ = StringIO()
__orig_stdout__ = sys.stdout
__orig_stderr__ = sys.stderr
sys.stdout = __stdout__
sys.stderr = __stderr__
`);

        let result: unknown;
        let execError: string | null = null;
        try {
          result = await pyodide.runPythonAsync(code);
        } catch (err: unknown) {
          execError = err instanceof Error ? err.message : String(err);
        }

        // Restore and capture
        await pyodide.runPythonAsync(`
sys.stdout = __orig_stdout__
sys.stderr = __orig_stderr__
__captured_stdout__ = __stdout__.getvalue()
__captured_stderr__ = __stderr__.getvalue()
`);

        const stdout = (pyodide.globals.get('__captured_stdout__') as string) || '';
        const stderr = (pyodide.globals.get('__captured_stderr__') as string) || '';

        clearTimeout(timeoutId);
        const duration = performance.now() - start;

        if (execError) {
          resolve({
            stdout: truncateOutput(stdout),
            stderr: truncateOutput(stderr || execError),
            returnValue: null,
            success: false,
            duration,
          });
        } else {
          let returnStr: string | null = null;
          if (result !== undefined && result !== null) {
            const s = String(result);
            if (s !== 'None' && s !== 'undefined') {
              returnStr = s;
            }
          }

          resolve({
            stdout: truncateOutput(stdout),
            stderr: truncateOutput(stderr),
            returnValue: returnStr,
            success: !stderr,
            duration,
          });
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve({
          stdout: '',
          stderr:
            'Python execution requires Pyodide (WebAssembly). Load failed or unavailable in this environment.',
          returnValue: null,
          success: false,
          duration: performance.now() - start,
        });
      });
  });
}

function formatValue(val: unknown): string {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

function isPythonLang(lang: string): boolean {
  const l = lang.toLowerCase().trim();
  return l === 'python' || l === 'py' || l === 'python3';
}

function isJavaScriptLang(lang: string): boolean {
  const l = lang.toLowerCase().trim();
  return l === 'javascript' || l === 'js';
}

// ---------------------------------------------------------------------------
// InlineCodeExecutor component
// ---------------------------------------------------------------------------

export function InlineCodeExecutor({ code, language, className }: InlineCodeExecutorProps) {
  const [output, setOutput] = useState<ExecutionOutput | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPyodideLoading, setIsPyodideLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleRun = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);
    setOutput(null);

    try {
      let result: ExecutionOutput;

      if (isPythonLang(language)) {
        setIsPyodideLoading(pyodideAvailable !== true);
        result = await executePython(code);
      } else if (isJavaScriptLang(language)) {
        result = await executeJavaScript(code);
      } else {
        result = {
          stdout: '',
          stderr: `Unsupported language for execution: ${language}`,
          returnValue: null,
          success: false,
          duration: 0,
        };
      }

      if (mountedRef.current) {
        setOutput(result);
      }
    } finally {
      if (mountedRef.current) {
        setIsRunning(false);
        setIsPyodideLoading(false);
      }
    }
  }, [code, language, isRunning]);

  const handleClear = useCallback(() => {
    setOutput(null);
  }, []);

  // Combine all output lines
  const outputText = output
    ? [output.stdout, output.returnValue ? `=> ${output.returnValue}` : '', output.stderr]
        .filter(Boolean)
        .join('\n')
    : '';

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Run bar */}
      <div className="flex items-center gap-2 border-t border-white/[0.06] bg-[#161b22] px-3 py-1.5">
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning}
          className={cn(
            'flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
            isRunning
              ? 'cursor-not-allowed bg-white/5 text-gray-500'
              : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25',
          )}
        >
          {isRunning ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              {isPyodideLoading ? 'Loading Python...' : 'Running...'}
            </>
          ) : (
            <>
              <Play size={12} />
              Run
            </>
          )}
        </button>

        {output && (
          <>
            {/* Status indicator */}
            <div className="flex items-center gap-1 text-[10px]">
              {output.timedOut ? (
                <span className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle size={10} />
                  Timed out
                </span>
              ) : output.success ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 size={10} />
                  Done
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-400">
                  <XCircle size={10} />
                  Error
                </span>
              )}
              <span className="text-gray-500">
                {output.duration < 1000
                  ? `${Math.round(output.duration)}ms`
                  : `${(output.duration / 1000).toFixed(2)}s`}
              </span>
            </div>

            {/* Clear button */}
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-300"
            >
              <X size={10} />
              Clear
            </button>
          </>
        )}
      </div>

      {/* Output panel */}
      {output && outputText && (
        <div
          className={cn(
            'max-h-[300px] overflow-auto border-t px-3 py-2 font-mono text-[12px] leading-[1.6]',
            output.success
              ? 'border-emerald-500/20 bg-emerald-950/20'
              : 'border-red-500/20 bg-red-950/20',
          )}
        >
          {/* stdout */}
          {output.stdout && (
            <pre className="m-0 whitespace-pre-wrap break-words text-gray-200">{output.stdout}</pre>
          )}
          {/* return value */}
          {output.returnValue && (
            <pre className="m-0 whitespace-pre-wrap break-words text-emerald-300/80">
              {'=> '}
              {output.returnValue}
            </pre>
          )}
          {/* stderr */}
          {output.stderr && (
            <pre className="m-0 whitespace-pre-wrap break-words text-red-400">{output.stderr}</pre>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Returns true if the given language supports inline execution.
 */
export function isExecutableLanguage(lang: string): boolean {
  return isPythonLang(lang) || isJavaScriptLang(lang);
}

export default InlineCodeExecutor;
