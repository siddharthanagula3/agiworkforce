import { SSE_DONE_DATA, readServerSentEvents } from '@agiworkforce/client-runtime';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  GUEST_CHAT_ERROR_CODES,
  GUEST_CHAT_PATH,
  GUEST_CHAT_REMAINING_HEADER,
  type GuestChatErrorCode,
  type GuestChatRequest,
} from '@/lib/guest-chat/contract';

export type GuestChatMessage = GuestChatRequest['messages'][number];

export interface GuestTurn {
  content: string;
  failure: string | null;
  remaining: number | null;
}

export const GUEST_SEND_FAILED = 'Your message could not be sent. Try again.';

export const GUEST_BLOCKING_CODES: ReadonlySet<GuestChatErrorCode> = new Set([
  GUEST_CHAT_ERROR_CODES.unavailable,
  GUEST_CHAT_ERROR_CODES.limitReached,
  GUEST_CHAT_ERROR_CODES.capacityReached,
]);

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(GUEST_CHAT_ERROR_CODES));
const THINKING_BLOCK = /<thinking>[\s\S]*?(?:<\/thinking>|$)/g;

export class GuestChatRefusal extends Error {
  readonly code: GuestChatErrorCode | null;

  constructor(message: string, code: GuestChatErrorCode | null) {
    super(message);
    this.name = 'GuestChatRefusal';
    this.code = code;
  }
}

function visibleText(raw: string): string {
  return raw.replace(THINKING_BLOCK, '').trimStart();
}

async function refusalFrom(response: Response): Promise<GuestChatRefusal> {
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: unknown; message?: unknown };
  } | null;
  const code = body?.error?.code;
  const message = body?.error?.message;
  if (typeof code === 'string' && KNOWN_CODES.has(code) && typeof message === 'string') {
    return new GuestChatRefusal(message, code as GuestChatErrorCode);
  }
  return new GuestChatRefusal(GUEST_SEND_FAILED, null);
}

function readChunk(data: string): { text: string; failure: string | null } {
  try {
    const chunk = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: unknown; x_stream_error?: { message?: unknown } } }>;
    };
    const delta = chunk.choices?.[0]?.delta;
    const failure = delta?.x_stream_error?.message;
    return {
      text: typeof delta?.content === 'string' ? delta.content : '',
      failure: typeof failure === 'string' ? failure : null,
    };
  } catch {
    return { text: '', failure: null };
  }
}

function remainingFrom(headers: Headers): number | null {
  const value = headers.get(GUEST_CHAT_REMAINING_HEADER);
  if (value === null) return null;
  const remaining = Number(value);
  return Number.isFinite(remaining) ? remaining : null;
}

export async function sendGuestTurn(
  messages: readonly GuestChatMessage[],
  signal: AbortSignal,
  onText: (content: string) => void,
): Promise<GuestTurn> {
  const response = await fetch(GUEST_CHAT_PATH, {
    method: 'POST',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!response.ok || !response.body) throw await refusalFrom(response);

  let raw = '';
  let failure: string | null = null;
  for await (const event of readServerSentEvents(response.body)) {
    if (event.data === SSE_DONE_DATA) continue;
    const chunk = readChunk(event.data);
    if (chunk.failure) failure = chunk.failure;
    if (chunk.text) {
      raw += chunk.text;
      onText(visibleText(raw));
    }
  }
  return { content: visibleText(raw), failure, remaining: remainingFrom(response.headers) };
}
