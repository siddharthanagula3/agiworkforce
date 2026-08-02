/**
 * Document parser for on-device doc Q&A (Wave 0 scaffold).
 * Extracts plain text from PDF / TXT / MD / CSV / code files.
 * Image extraction from PDFs is deferred to Wave 1 (vision architecture).
 */

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

  // MIME type fallback for text-like content
  if (mimeType?.startsWith('text/')) return 'txt';

  throw new DocParseError(
    `Unsupported file type: extension="${ext}", mime="${mimeType ?? 'unknown'}"`,
    'UNSUPPORTED_FORMAT',
  );
}

/**
 * Non-throwing capability check: true when `parseDocument` can extract text from
 * this file (pdf/txt/md/csv/code or any text/* MIME). Used for attach-time
 * validation so unsupported formats (docx, zip, …) are rejected up front with a
 * clear message instead of silently becoming an empty stub at send time.
 */
export function isParseableDocument(uri: string, mimeType?: string): boolean {
  try {
    detectDocType(uri, mimeType);
    return true;
  } catch {
    return false;
  }
}

/**
 * The ONLY MIME allowlist the chat document pickers may advertise.
 *
 * Invariant: every entry must satisfy `isParseableDocument`, because the
 * attach-time validator (`src/features/chat/utils/attachmentValidation.ts`)
 * rejects anything it cannot parse. The two chat screens used to hardcode
 * their own arrays that additionally offered `application/msword` and the
 * OOXML wordprocessingml type — neither is recognised by `detectDocType`, so
 * picking a Word document was a guaranteed dead end: the picker advertised it
 * and the validator immediately answered "isn't a supported file type".
 * Deriving both pickers from this constant makes that class of mismatch
 * impossible, and `__tests__/document-picker-mime-parity.test.ts` asserts the
 * invariant. Do not add a type here before the parser can extract its text.
 */
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

  // Simple CSV split — handles quoted fields with embedded commas
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

// PDF text extraction via a minimal pure-JS approach.
// expo-file-system reads the file as base64; we then extract the raw text
// streams from the PDF binary. This is a best-effort extractor that works for
// standard text-layer PDFs — scanned image-only PDFs will return minimal text.
// Full vision-based OCR is deferred to Wave 1.
function extractTextFromPdfBuffer(base64: string): { text: string; pages: number } {
  // Decode base64 to a Latin-1 string for pattern matching.
  // atob is available in the Hermes runtime (React Native).
  let raw: string;
  try {
    raw = atob(base64);
  } catch {
    throw new DocParseError('PDF decode failed — file may be corrupt', 'CORRUPT_FILE');
  }

  if (!raw.startsWith('%PDF')) {
    throw new DocParseError('File does not appear to be a valid PDF', 'CORRUPT_FILE');
  }

  // Detect encryption
  if (raw.includes('/Encrypt')) {
    throw new DocParseError(
      'PDF is encrypted — password-protected PDFs are not supported in Wave 0',
      'ENCRYPTED_PDF',
    );
  }

  // Count pages via /Type /Page occurrences (rough; accurate for most PDFs)
  let pages = 0;
  const pageRegex = /\/Type\s*\/Page[^s]/g;
  let match;
  while ((match = pageRegex.exec(raw)) !== null) {
    // consume match to silence unused-var lint
    void match;
    pages++;
  }
  if (pages === 0) pages = 1;

  // Extract text from BT...ET blocks (text objects in PDF content streams)
  const textParts: string[] = [];
  const btEtRegex = /BT([\s\S]*?)ET/g;
  let btMatch;
  while ((btMatch = btEtRegex.exec(raw)) !== null) {
    const block = btMatch[1] ?? '';
    // Tj / TJ operators carry visible text
    const tjRegex = /\(([^)]*)\)\s*Tj|\[([^\]]*)\]\s*TJ/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const literal = tjMatch[1] ?? '';
      const array = tjMatch[2] ?? '';
      if (literal) {
        textParts.push(literal.replace(/\\n/g, '\n').replace(/\\r/g, ''));
      } else if (array) {
        // Extract string literals from TJ arrays
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
