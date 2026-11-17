import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import {
  builtInNumberFormat,
  parseNumberFormat,
  type NumberFormat,
} from './workbook-number-formats';

export const MAX_CELL_FORMATS = 65_490;

export function styleIndex(raw: string | undefined): number {
  return raw !== undefined && /^\d{1,9}$/.test(raw) ? Number(raw) : -1;
}

/**
 * The number format of each cell style in a workbook's styles part, fed its
 * `numFmt` and `cellXfs` `xf` entries in document order. An add that returns
 * false means the part is past the bounds, and every number keeps its stored value.
 */
export class CellFormatTable {
  private readonly custom = new Map<number, string>();
  private customChars = 0;
  private readonly formatIds: number[] = [];

  addCustomFormat(numFmtId: string | undefined, formatCode: string): boolean {
    if (this.custom.size >= MAX_CELL_FORMATS) return false;
    this.customChars += formatCode.length;
    if (this.customChars > MAX_FILE_TEXT_CHARS) return false;
    const id = styleIndex(numFmtId);
    if (id >= 0) this.custom.set(id, formatCode);
    return true;
  }

  addCellFormat(numFmtId: string | undefined): boolean {
    if (this.formatIds.length >= MAX_CELL_FORMATS) return false;
    this.formatIds.push(styleIndex(numFmtId ?? '0'));
    return true;
  }

  formats(): (NumberFormat | null)[] {
    const parsed = new Map<number, NumberFormat | null>();
    return this.formatIds.map((id) => {
      if (id < 0) return null;
      const code = this.custom.get(id);
      if (code === undefined) return builtInNumberFormat(id);
      let format = parsed.get(id);
      if (format === undefined) {
        format = parseNumberFormat(code);
        parsed.set(id, format);
      }
      return format;
    });
  }
}
