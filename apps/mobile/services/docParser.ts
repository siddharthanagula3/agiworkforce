
import { readAsStringAsync, getInfoAsync } from 'expo-file-system/legacy';

export type SupportedDocType = 'pdf' | 'txt' | 'md' | 'csv' | 'code';

export interface ParsedDocument {
  text: string;
  metadata: {
    docType: SupportedDocType;
    pages?: number;
    rows?: number;
    columns?: number;
    language?: string;
    fileSizeBytes?: number;
  };
}

export class DocParseError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'UNSUPPORTED_FORMAT'
      | 'CORRUPT_FILE'
      | 'ENCRYPTED_PDF'
      | 'EMPTY_DOCUMENT'
      | 'READ_ERROR',
  ) {
    super(message);
    this.name = 'DocParseError';
  }
}

const CODE_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'sql',
  'html',
  'css',
  'scss',
  'yaml',
  'yml',
  'toml',
  'json',
  'xml',
  'lua',
  'r',
  'jl',
  'scala',
  'clj',
  'ex',
  'exs',
  'erl',
  'hrl',
  'hs',
  'ml',
  'mli',
  'dart',
  'vue',
  'svelte',
]);

function detectDocType(uri: string, mimeType?: string): SupportedDocType {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'csv' || mimeType === 'text/csv') return 'csv';
  if (ext === 'txt' || mimeType === 'text/plain') return 'txt';
  if (CODE_EXTENSIONS.has(ext)) return 'code';

  if (mimeType?.startsWith('text/')) return 'txt';

  throw new DocParseError(
    `Unsupported file type: extension="${ext}", mime="${mimeType ?? 'unknown'}"`,
    'UNSUPPORTED_FORMAT',
  );
}

export function isParseableDocument(uri: string, mimeType?: string): boolean {
  try {
    detectDocType(uri, mimeType);
    return true;
  } catch {
    return false;
  }
}

export const PICKABLE_DOCUMENT_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'text/plain',
  'text/csv',
];

async function readFileText(uri: string): Promise<string> {
  try {
    const content = await readAsStringAsync(uri, { encoding: 'utf8' });
    return content;
  } catch (err) {
    throw new DocParseError(
      `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      'READ_ERROR',
    );
  }
}

function parseCsvToText(raw: string): { text: string; rows: number; columns: number } {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { text: '', rows: 0, columns: 0 };

  const splitCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitCsvLine(lines[0] ?? '');
  const columns = headers.length;
  const dataRows = lines.slice(1);

  const segments: string[] = [`Columns: ${headers.join(', ')}`];
  for (const row of dataRows) {
    const values = splitCsvLine(row);
    const pairs = headers.map((h, i) => `${h}: ${values[i] ?? ''}`);
    segments.push(pairs.join('; '));
  }

  return {
    text: segments.join('\n'),
    rows: dataRows.length,
    columns,
  };
}

function extractTextFromPdfBuffer(base64: string): { text: string; pages: number } {
  let raw: string;
  try {
    raw = atob(base64);
  } catch {
    throw new DocParseError('PDF decode failed — file may be corrupt', 'CORRUPT_FILE');
  }

  if (!raw.startsWith('%PDF')) {
    throw new DocParseError('File does not appear to be a valid PDF', 'CORRUPT_FILE');
  }

  if (raw.includes('/Encrypt')) {
    throw new DocParseError(
      'PDF is encrypted — password-protected PDFs are not supported in Wave 0',
      'ENCRYPTED_PDF',
    );
  }

  let pages = 0;
  const pageRegex = /\/Type\s*\/Page[^s]/g;
  let match;
  while ((match = pageRegex.exec(raw)) !== null) {
    void match;
    pages++;
  }
  if (pages === 0) pages = 1;

  const textParts: string[] = [];
  const btEtRegex = /BT([\s\S]*?)ET/g;
  let btMatch;
  while ((btMatch = btEtRegex.exec(raw)) !== null) {
    const block = btMatch[1] ?? '';
    const tjRegex = /\(([^)]*)\)\s*Tj|\[([^\]]*)\]\s*TJ/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const literal = tjMatch[1] ?? '';
      const array = tjMatch[2] ?? '';
      if (literal) {
        textParts.push(literal.replace(/\\n/g, '\n').replace(/\\r/g, ''));
      } else if (array) {
        const stringRegex = /\(([^)]*)\)/g;
        let sm;
        while ((sm = stringRegex.exec(array)) !== null) {
          textParts.push(sm[1] ?? '');
        }
      }
    }
  }

  const text = textParts.join(' ').replace(/\s+/g, ' ').trim();
  return { text, pages };
}

export async function parseDocument(uri: string, mimeType?: string): Promise<ParsedDocument> {
  let docType: SupportedDocType;
  try {
    docType = detectDocType(uri, mimeType);
  } catch (err) {
    if (err instanceof DocParseError) throw err;
    throw new DocParseError(String(err), 'UNSUPPORTED_FORMAT');
  }

  const info = await getInfoAsync(uri).catch(() => null);
  const fileSizeBytes = info && info.exists && 'size' in info ? (info.size as number) : undefined;

  switch (docType) {
    case 'txt':
    case 'md': {
      const text = await readFileText(uri);
      if (!text.trim()) {
        throw new DocParseError('Document appears to be empty', 'EMPTY_DOCUMENT');
      }
      return {
        text,
        metadata: { docType, fileSizeBytes },
      };
    }

    case 'code': {
      const text = await readFileText(uri);
      const ext = uri.split('.').pop()?.toLowerCase();
      return {
        text,
        metadata: { docType, language: ext, fileSizeBytes },
      };
    }

    case 'csv': {
      const raw = await readFileText(uri);
      const { text, rows, columns } = parseCsvToText(raw);
      if (!text.trim()) {
        throw new DocParseError('CSV appears to be empty', 'EMPTY_DOCUMENT');
      }
      return {
        text,
        metadata: { docType, rows, columns, fileSizeBytes },
      };
    }

    case 'pdf': {
      let base64: string;
      try {
        base64 = await readAsStringAsync(uri, { encoding: 'base64' });
      } catch (err) {
        throw new DocParseError(
          `Failed to read PDF: ${err instanceof Error ? err.message : String(err)}`,
          'READ_ERROR',
        );
      }
      const { text, pages } = extractTextFromPdfBuffer(base64);
      if (!text.trim()) {
        throw new DocParseError(
          'No text layer found in PDF — image-only PDFs require Wave 1 vision support',
          'EMPTY_DOCUMENT',
        );
      }
      return {
        text,
        metadata: { docType, pages, fileSizeBytes },
      };
    }
  }
}
