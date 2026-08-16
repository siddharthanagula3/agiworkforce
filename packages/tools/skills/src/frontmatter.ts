
const FRONTMATTER_FENCE =
  /^---[ \t]{0,32}\r?\n([\s\S]{0,131072}?)\r?\n---[ \t]{0,32}(?:\r?\n[ \t]{0,256}){0,64}/;

const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrontmatterError';
  }
}

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const match = FRONTMATTER_FENCE.exec(source);
  if (!match) {
    return { data: {}, body: source };
  }
  const yamlText = match[1] ?? '';
  const body = source.slice(match[0].length);
  const data = parseYamlBlock(yamlText);
  return { data, body };
}

function parseYamlBlock(text: string): Record<string, unknown> {
  const lines = text.split(/\r?\n/);
  const root: Record<string, unknown> = Object.create(null) as Record<string, unknown>;

  const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [
    { obj: root, indent: -1 },
  ];

  function assign(target: Record<string, unknown>, key: string, value: unknown): void {
    if (RESERVED_KEYS.has(key)) {
      throw new FrontmatterError('Reserved key: ' + key);
    }
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  let pendingListKey: string | null = null;
  let pendingListTarget: Record<string, unknown> | null = null;
  const pendingList: string[] = [];

  function flushList(): void {
    if (pendingListKey && pendingListTarget && pendingList.length > 0) {
      assign(pendingListTarget, pendingListKey, [...pendingList]);
    }
    pendingListKey = null;
    pendingListTarget = null;
    pendingList.length = 0;
  }

  for (const rawLine of lines) {
    const stripped = rawLine.replace(/\s{1,4096}$/, '');
    if (!stripped.trim()) {
      flushList();
      continue;
    }
    if (stripped.trim().startsWith('#')) continue;
    const indent = leadingSpaces(stripped);

    const listMatch = /^[ \t]{0,256}-[ \t]{1,256}(.{0,4096})$/.exec(stripped);
    if (listMatch && pendingListKey) {
      pendingList.push(unquote(listMatch[1] ?? ''));
      continue;
    }

    flushList();

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]!.obj;

    const keyValueMatch =
      /^[ \t]{0,256}([A-Za-z0-9_$-]{1,128})[ \t]{0,256}:(?:[ \t]{0,256}(.{0,8192}))?$/.exec(
        stripped,
      );
    if (!keyValueMatch) continue;
    const key = keyValueMatch[1] ?? '';
    const valueText = (keyValueMatch[2] ?? '').trim();

    if (valueText === '') {
      const childObj: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      assign(parent, key, childObj);
      stack.push({ obj: childObj, indent });
      pendingListKey = key;
      pendingListTarget = parent;
      continue;
    }

    if (valueText.startsWith('[') && valueText.endsWith(']')) {
      const inner = valueText.slice(1, -1).trim();
      const parts = inner ? inner.split(',').map((s) => unquote(s.trim())) : [];
      assign(parent, key, parts);
      continue;
    }

    assign(parent, key, parseScalar(valueText));
  }

  flushList();
  return root;
}

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line[i] === ' ') i++;
  return i;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseScalar(text: string): string | number | boolean | null {
  const lower = text.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (lower === 'null' || lower === '~') return null;
  if (/^-?\d+$/.test(text)) {
    const n = Number(text);
    if (Number.isFinite(n) && Number.isSafeInteger(n)) return n;
  }
  if (/^-?\d+\.\d+$/.test(text)) {
    const n = Number(text);
    if (Number.isFinite(n)) return n;
  }
  return unquote(text);
}
