export class SseFrameLimitError extends Error {
  constructor() {
    super('SSE frame exceeds the configured limit');
    this.name = 'SseFrameLimitError';
  }
}

/**
 * Incremental, bounded Server-Sent Events decoder.
 *
 * It supports LF, CRLF, and CR framing and joins repeated `data:` fields using
 * a newline as required by the SSE wire format. It intentionally returns only
 * data payloads; event names, ids, retry hints, comments, and unknown fields do
 * not affect the Managed Chat protocol.
 */
export class BoundedSseDecoder {
  private buffer = '';
  private dataLines: string[] = [];
  private dataLength = 0;

  constructor(private readonly maximumFrameCharacters: number) {
    if (!Number.isSafeInteger(maximumFrameCharacters) || maximumFrameCharacters < 1) {
      throw new Error('Invalid SSE frame limit');
    }
  }

  push(text: string): string[] {
    this.buffer += text;
    // Drain complete lines before enforcing the per-frame limit. A single
    // network read may legitimately contain many small SSE events whose total
    // byte count is larger than one frame.
    const events = this.drain(false);
    this.assertWithinLimit();
    return events;
  }

  finish(): { events: string[]; incomplete: boolean } {
    const events = this.drain(true);
    const incomplete = this.dataLines.length > 0;
    this.buffer = '';
    this.dataLines = [];
    this.dataLength = 0;
    return { events, incomplete };
  }

  private assertWithinLimit(): void {
    if (this.buffer.length + this.dataLength > this.maximumFrameCharacters) {
      throw new SseFrameLimitError();
    }
  }

  private drain(flush: boolean): string[] {
    const events: string[] = [];
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
    this.assertWithinLimit();
    return events;
  }

  private findLineEnding(): number {
    const lf = this.buffer.indexOf('\n');
    const cr = this.buffer.indexOf('\r');
    if (lf === -1) return cr;
    if (cr === -1) return lf;
    return Math.min(lf, cr);
  }

  private processLine(line: string, events: string[]): void {
    if (line.length === 0) {
      if (this.dataLines.length > 0) events.push(this.dataLines.join('\n'));
      this.dataLines = [];
      this.dataLength = 0;
      return;
    }
    if (line.startsWith(':')) return;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field !== 'data') return;

    this.dataLines.push(value);
    this.dataLength += value.length + (this.dataLines.length > 1 ? 1 : 0);
    this.assertWithinLimit();
  }
}
