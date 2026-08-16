
export interface PartialArtifactFields {
  artifactType?: string;
  title?: string;
  content?: string;
  language?: string;
  complete: boolean;
}

interface ScannedString {
  value: string;
  terminated: boolean;
  next: number;
}

const SIMPLE_ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

function skipWhitespace(raw: string, start: number): number {
  let i = start;
  while (i < raw.length) {
    const c = raw[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1;
      continue;
    }
    return i;
  }
  return i;
}

function scanString(raw: string, start: number): ScannedString {
  let i = start + 1;
  let out = '';
  while (i < raw.length) {
    const c = raw[i];
    if (c === '\\') {
      const escape = raw[i + 1];
      if (escape === undefined) {
        return { value: out, terminated: false, next: raw.length };
      }
      if (escape === 'u') {
        const hex = raw.slice(i + 2, i + 6);
        if (hex.length < 4) {
          return { value: out, terminated: false, next: raw.length };
        }
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          return { value: out, terminated: false, next: raw.length };
        }
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      const mapped = SIMPLE_ESCAPES[escape];
      if (mapped === undefined) {
        return { value: out, terminated: false, next: raw.length };
      }
      out += mapped;
      i += 2;
      continue;
    }
    if (c === '"') {
      return { value: out, terminated: true, next: i + 1 };
    }
    out += c;
    i += 1;
  }
  return { value: out, terminated: false, next: raw.length };
}

function skipContainer(raw: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < raw.length) {
    const c = raw[i];
    if (c === '"') {
      const scanned = scanString(raw, i);
      if (!scanned.terminated) return -1;
      i = scanned.next;
      continue;
    }
    if (c === '{' || c === '[') {
      depth += 1;
    } else if (c === '}' || c === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return -1;
}

function skipScalar(raw: string, start: number): number {
  let i = start;
  while (i < raw.length) {
    const c = raw[i];
    if (c === ',' || c === '}') return i;
    i += 1;
  }
  return -1;
}

export function extractPartialArtifactArgs(raw: string): PartialArtifactFields {
  const result: PartialArtifactFields = { complete: false };
  let i = skipWhitespace(raw, 0);
  if (raw[i] !== '{') return result;
  i += 1;

  for (;;) {
    i = skipWhitespace(raw, i);
    if (i >= raw.length) return result;
    if (raw[i] === '}') {
      result.complete = true;
      return result;
    }
    if (raw[i] === ',') {
      i += 1;
      continue;
    }
    if (raw[i] !== '"') return result;

    const key = scanString(raw, i);
    if (!key.terminated) return result;
    i = skipWhitespace(raw, key.next);
    if (raw[i] !== ':') return result;
    i = skipWhitespace(raw, i + 1);
    if (i >= raw.length) return result;

    const valueStart = raw[i];
    if (valueStart === '"') {
      const value = scanString(raw, i);
      assignField(result, key.value, value.value);
      if (!value.terminated) return result;
      i = value.next;
      continue;
    }
    if (valueStart === '{' || valueStart === '[') {
      const next = skipContainer(raw, i);
      if (next < 0) return result;
      i = next;
      continue;
    }
    const next = skipScalar(raw, i);
    if (next < 0) return result;
    i = next;
  }
}

function assignField(target: PartialArtifactFields, key: string, value: string): void {
  switch (key) {
    case 'artifact_type':
      target.artifactType = value.trim().toLowerCase();
      return;
    case 'title':
      target.title = value;
      return;
    case 'content':
      target.content = value;
      return;
    case 'language':
      target.language = value.trim();
      return;
    default:
  }
}

export class PartialArtifactAccumulator {
  private raw = '';
  private expectedSeq = 0;
  private desynced = false;

  push(delta: string, seq: number): PartialArtifactFields | null {
    if (this.desynced) return null;
    if (!Number.isInteger(seq) || seq !== this.expectedSeq) {
      this.desynced = true;
      this.raw = '';
      return null;
    }
    this.expectedSeq += 1;
    this.raw += delta;
    return extractPartialArtifactArgs(this.raw);
  }

  get isDesynced(): boolean {
    return this.desynced;
  }

  get rawArguments(): string {
    return this.raw;
  }
}
