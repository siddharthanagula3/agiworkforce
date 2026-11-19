import type { ChatMessage } from './types';

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

export type CodeExecutionMessage = Pick<ChatMessage, 'toolCalls' | 'isStreaming' | 'metadata'>;

const CODE_EXECUTION_TOOL_NAME = 'execute_code';

const SAFE_INLINE_IMAGE_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const BASE64_IMAGE_DATA = /^[A-Za-z0-9+/]+={0,2}$/;

export function safeExecutionImageSrc(image: CodeExecutionImage): string | null {
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
