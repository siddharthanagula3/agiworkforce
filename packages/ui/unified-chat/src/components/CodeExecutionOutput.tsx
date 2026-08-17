import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Code2, Loader2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ChatMessage } from '../lib/types';

export interface CodeExecutionImage {
  mediaType: string;
  data: string;
}

export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  returnCode: number;
  images?: CodeExecutionImage[];
}

export interface CodeExecutionOutputProps {
  isExecuting?: boolean;
  result?: CodeExecutionResult;
}

export type CodeExecutionMessage = Pick<ChatMessage, 'toolCalls' | 'isStreaming' | 'metadata'>;

const CODE_EXECUTION_TOOL_NAME = 'execute_code';

const SAFE_INLINE_IMAGE_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const BASE64_IMAGE_DATA = /^[A-Za-z0-9+/]+={0,2}$/;

function safeExecutionImageSrc(image: CodeExecutionImage): string | null {
  const mediaType = image.mediaType.trim().toLowerCase();
  const data = image.data.replace(/\s+/g, '');
  if (!SAFE_INLINE_IMAGE_MEDIA_TYPES.has(mediaType) || !BASE64_IMAGE_DATA.test(data)) return null;
  return `data:${mediaType};base64,${data}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readImages(value: unknown): CodeExecutionImage[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const images = value.flatMap((entry) =>
    isRecord(entry) && typeof entry['mediaType'] === 'string' && typeof entry['data'] === 'string'
      ? [{ mediaType: entry['mediaType'], data: entry['data'] }]
      : [],
  );
  return images.length > 0 ? images : undefined;
}

export function readCodeExecutionResult(
  metadata: Record<string, unknown> | null | undefined,
): CodeExecutionResult | undefined {
  const raw = metadata?.['codeExecutionResult'];
  if (!isRecord(raw)) return undefined;
  const stdout = typeof raw['stdout'] === 'string' ? raw['stdout'] : '';
  const stderr = typeof raw['stderr'] === 'string' ? raw['stderr'] : '';
  const returnCode = typeof raw['returnCode'] === 'number' ? raw['returnCode'] : 0;
  const images = readImages(raw['images']);
  return { stdout, stderr, returnCode, ...(images ? { images } : {}) };
}

export function hasRunningCodeExecutionTool(message: CodeExecutionMessage): boolean {
  if (!message.isStreaming) return false;
  return (message.toolCalls ?? []).some(
    (toolCall) =>
      toolCall.name === CODE_EXECUTION_TOOL_NAME &&
      (toolCall.status === 'running' || toolCall.status === 'pending'),
  );
}

export function isExecutingCode(message: CodeExecutionMessage): boolean {
  return message.metadata?.['isExecutingCode'] === true || hasRunningCodeExecutionTool(message);
}

export function CodeExecutionOutput({ isExecuting, result }: CodeExecutionOutputProps) {
  const [expanded, setExpanded] = useState(true);

  if (!isExecuting && !result) return null;

  const safeImages =
    result?.images?.flatMap((image) => {
      const src = safeExecutionImageSrc(image);
      return src ? [{ src }] : [];
    }) ?? [];
  const hasOutput = Boolean(result && (result.stdout || result.stderr || safeImages.length > 0));
  const succeeded = result?.returnCode === 0;

  return (
    <div
      data-testid="code-execution-output"
      className="mt-2 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] text-sm"
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-[var(--chat-radius-md)] px-3 py-2 text-left hover:bg-[var(--chat-surface-hover)]"
      >
        <Code2 className="h-4 w-4 shrink-0 text-[var(--chat-accent,#8b5cf6)]" aria-hidden />
        <span className="flex-1 font-medium text-[var(--chat-text-primary)]">Code execution</span>
        {isExecuting ? (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-[var(--chat-accent,#8b5cf6)]"
            aria-hidden
          />
        ) : succeeded ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
        ) : result ? (
          <XCircle className="h-3.5 w-3.5 text-rose-500" aria-hidden />
        ) : null}
        {hasOutput ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--chat-text-muted)]" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[var(--chat-text-muted)]" aria-hidden />
          )
        ) : null}
      </button>

      {isExecuting ? (
        <p className="px-3 pb-2 text-xs text-[var(--chat-text-muted)]">Running code…</p>
      ) : null}

      {expanded && result && hasOutput ? (
        <div className="space-y-2 border-t border-[var(--chat-border)] px-3 pt-2 pb-3">
          {result.stdout ? (
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--chat-text-muted)]">Output</p>
              <pre
                data-testid="code-execution-stdout"
                className={cn(
                  'max-h-64 overflow-x-auto overflow-y-auto rounded-[var(--chat-radius-sm)]',
                  'bg-[var(--chat-surface-overlay)] px-3 py-2 font-mono text-xs leading-relaxed',
                  'whitespace-pre-wrap break-words text-[var(--chat-text-primary)]',
                )}
              >
                {result.stdout}
              </pre>
            </div>
          ) : null}

          {result.stderr ? (
            <div>
              <p className="mb-1 text-xs font-medium text-rose-400">Stderr</p>
              <pre
                data-testid="code-execution-stderr"
                className={cn(
                  'max-h-48 overflow-x-auto overflow-y-auto rounded-[var(--chat-radius-sm)]',
                  'border border-rose-500/20 bg-rose-500/5 px-3 py-2',
                  'font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-rose-300',
                )}
              >
                {result.stderr}
              </pre>
            </div>
          ) : null}

          {safeImages.map((image, index) => (
            <div key={image.src}>
              <p className="mb-1 text-xs font-medium text-[var(--chat-text-muted)]">
                Plot {index + 1}
              </p>
              <img
                src={image.src}
                alt={`Code execution output ${index + 1}`}
                className="max-w-full rounded-[var(--chat-radius-sm)] border border-[var(--chat-border)]"
              />
            </div>
          ))}

          {result.returnCode !== 0 ? (
            <p className="text-xs text-rose-400">Exit code: {result.returnCode}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
