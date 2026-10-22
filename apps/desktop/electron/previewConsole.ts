import {
  PREVIEW_ERROR_LIMIT,
  PREVIEW_ERROR_TEXT_LIMIT,
  type PreviewConsoleError,
} from '@agiworkforce/local-runtime-contract';

const SOURCE_TEXT_LIMIT = 300;
const ELLIPSIS = '…';

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}` : text;
}

export interface PreviewConsoleEntry {
  message: string;
  source?: string;
  line?: number;
}

/**
 * What a preview page logged as an error since it was last read, bounded in
 * count and in the length of each entry so a page that loops on an error
 * cannot grow it.
 */
export class PreviewConsoleBuffer {
  private errors: PreviewConsoleError[] = [];
  private dropped = 0;

  record(entry: PreviewConsoleEntry): void {
    const message = clip(entry.message.trim(), PREVIEW_ERROR_TEXT_LIMIT);
    if (message === '') return;
    const source = entry.source ? clip(entry.source, SOURCE_TEXT_LIMIT) : null;
    const line = entry.line && entry.line > 0 ? entry.line : null;
    const last = this.errors[this.errors.length - 1];
    if (last && last.message === message && last.source === source && last.line === line) {
      last.count += 1;
      return;
    }
    if (this.errors.length >= PREVIEW_ERROR_LIMIT) {
      this.dropped += 1;
      return;
    }
    this.errors.push({ message, source, line, count: 1 });
  }

  read(clear: boolean): { errors: PreviewConsoleError[]; dropped: number } {
    const snapshot = { errors: this.errors.map((error) => ({ ...error })), dropped: this.dropped };
    if (clear) this.reset();
    return snapshot;
  }

  reset(): void {
    this.errors = [];
    this.dropped = 0;
  }
}
