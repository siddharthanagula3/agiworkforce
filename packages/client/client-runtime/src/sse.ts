export interface ServerSentEvent {
  event: string | null;
  data: string;
  id: string | null;
}

export const SSE_DONE_DATA = '[DONE]';

export const SSE_MAX_FRAME_CHARACTERS = 1_048_576;

export class ServerSentEventFrameLimitError extends Error {
  constructor() {
    super('SSE frame exceeds the configured limit');
    this.name = 'ServerSentEventFrameLimitError';
  }
}

export class ServerSentEventDecoder {
  private buffer = '';
  private dataLines: string[] = [];
  private dataLength = 0;
  private event: string | null = null;
  private id: string | null = null;
  private readonly maximumFrameCharacters: number;

  constructor(maximumFrameCharacters: number = SSE_MAX_FRAME_CHARACTERS) {
    if (!Number.isSafeInteger(maximumFrameCharacters) || maximumFrameCharacters < 1) {
      throw new Error('Invalid SSE frame limit');
    }
    this.maximumFrameCharacters = maximumFrameCharacters;
  }

  push(text: string): ServerSentEvent[] {
    this.buffer += text;
    const events = this.drain(false);
    this.assertWithinLimit();
    return events;
  }

  finish(options: { acceptUnterminatedFrame?: boolean } = {}): {
    events: ServerSentEvent[];
    incomplete: boolean;
  } {
    const events = this.drain(true);
    const incomplete = this.dataLines.length > 0 && options.acceptUnterminatedFrame !== true;
    if (!incomplete) this.dispatch(events);
    this.buffer = '';
    this.resetFrame();
    return { events, incomplete };
  }

  private resetFrame(): void {
    this.dataLines = [];
    this.dataLength = 0;
    this.event = null;
    this.id = null;
  }

  private assertWithinLimit(): void {
    if (this.buffer.length + this.dataLength > this.maximumFrameCharacters) {
      throw new ServerSentEventFrameLimitError();
    }
  }

  private drain(flush: boolean): ServerSentEvent[] {
    const events: ServerSentEvent[] = [];
    while (this.buffer.length > 0) {
      const lineEnding = this.findLineEnding();
      if (lineEnding === -1) break;
      if (this.buffer[lineEnding] === '\r' && lineEnding === this.buffer.length - 1 && !flush) {
        break;
      }
      const line = this.buffer.slice(0, lineEnding);
      const lineBreakLength =
        this.buffer[lineEnding] === '\r' && this.buffer[lineEnding + 1] === '\n' ? 2 : 1;
      this.buffer = this.buffer.slice(lineEnding + lineBreakLength);
      this.processLine(line, events);
      this.assertWithinLimit();
    }
    if (flush && this.buffer.length > 0) {
      const trailingLine = this.buffer;
      this.buffer = '';
      this.processLine(trailingLine, events);
    }
    return events;
  }

  private findLineEnding(): number {
    const lf = this.buffer.indexOf('\n');
    const cr = this.buffer.indexOf('\r');
    if (lf === -1) return cr;
    if (cr === -1) return lf;
    return Math.min(lf, cr);
  }

  private dispatch(events: ServerSentEvent[]): void {
    if (this.dataLines.length > 0) {
      events.push({ event: this.event, data: this.dataLines.join('\n'), id: this.id });
    }
    this.resetFrame();
  }

  private processLine(line: string, events: ServerSentEvent[]): void {
    if (line.length === 0) {
      this.dispatch(events);
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const raw = colon === -1 ? '' : line.slice(colon + 1);
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;
    if (field === 'event') {
      this.event = value;
      return;
    }
    if (field === 'id') {
      this.id = value;
      return;
    }
    if (field !== 'data') return;
    this.dataLines.push(value);
    this.dataLength += value.length + (this.dataLines.length > 1 ? 1 : 0);
    this.assertWithinLimit();
  }
}

export function splitJoinedServerSentEventData(data: string): string[] {
  if (!data.includes('\n')) return [data];
  try {
    JSON.parse(data);
    return [data];
  } catch {
    return data.split('\n');
  }
}

export interface ReadServerSentEventsOptions {
  maximumFrameCharacters?: number;
  acceptUnterminatedFinalFrame?: boolean;
  onChunk?: () => void;
}

function isByteStream(
  source: Response | ReadableStream<Uint8Array>,
): source is ReadableStream<Uint8Array> {
  return typeof (source as ReadableStream<Uint8Array>).getReader === 'function';
}

export async function* readServerSentEvents(
  source: Response | ReadableStream<Uint8Array>,
  options: ReadServerSentEventsOptions = {},
): AsyncGenerator<ServerSentEvent> {
  const decoder = new ServerSentEventDecoder(options.maximumFrameCharacters);
  const stream = isByteStream(source) ? source : source.body;
  if (!stream) {
    if (isByteStream(source)) return;
    yield* decoder.push(await source.text());
    yield* decoder.finish({ acceptUnterminatedFrame: options.acceptUnterminatedFinalFrame }).events;
    return;
  }
  const reader = stream.getReader();
  const text = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      options.onChunk?.();
      yield* decoder.push(text.decode(value, { stream: true }));
    }
    yield* decoder.push(text.decode());
    yield* decoder.finish({ acceptUnterminatedFrame: options.acceptUnterminatedFinalFrame }).events;
  } finally {
    reader.releaseLock();
  }
}
