export interface CsvRecords {
  records: string[][];
  complete: boolean;
}

const BYTE_ORDER_MARK = '﻿';

export function parseCsvRecords(input: string): CsvRecords {
  const raw = input.startsWith(BYTE_ORDER_MARK) ? input.slice(1) : input;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let inQuotes = false;
  let complete = true;

  const endField = () => {
    record.push(quoted ? field : field.trim());
    field = '';
    quoted = false;
  };
  const endRecord = () => {
    const blank = record.length === 0 && !quoted && field.trim() === '';
    endField();
    if (!blank) records.push(record);
    record = [];
  };

  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (inQuotes) {
      if (ch !== '"') {
        field += ch;
        i += 1;
      } else if (raw[i + 1] === '"') {
        field += '"';
        i += 2;
      } else {
        inQuotes = false;
        i += 1;
      }
      continue;
    }
    if (ch === '"' && field.trim() === '' && !quoted) {
      field = '';
      quoted = true;
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      endField();
      i += 1;
    } else if (ch === '\r' || ch === '\n') {
      endRecord();
      i += ch === '\r' && raw[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i += 1;
    }
  }

  if (inQuotes) complete = false;
  if (field !== '' || quoted || record.length > 0) endRecord();
  return { records, complete };
}
