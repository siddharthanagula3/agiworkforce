/**
 * Tiny YAML frontmatter parser.
 *
 * Skills only need flat key:value frontmatter (plus the occasional list).
 * This avoids a heavy `yaml` runtime dep — we cover:
 *   - `key: value` — string scalar
 *   - `key: 'value'` / `key: "value"` — quoted string
 *   - `key: 12` / `key: 12.5` — number
 *   - `key: true` / `key: false` — boolean
 *   - `key: null` — null
 *   - `key:` followed by a `- value` block — string array
 *   - `key: [a, b, c]` — inline string array (very basic)
 *   - nested objects via two-space indent (one level deep, e.g. `requires.bins`)
 *
 * If a skill needs richer metadata, switch to a real YAML parser at the
 * caller site — but this covers OpenClaw's skill schema 100%.
 */

// AUDIT-FIX: alert-399 — bound whitespace runs to avoid polynomial-redos.
// `^---<spaces>\n` opens the fence, `\n---<spaces>\n<blank lines>` closes it.
// Limiting each whitespace run to 64 keeps the regex linear-time on adversarial
// input while preserving the historic permissive trailing-blank behavior.
const FRONTMATTER_FENCE =
  /^---[ \t]{0,32}\r?\n([\s\S]{0,131072}?)\r?\n---[ \t]{0,32}(?:\r?\n[ \t]{0,256}){0,64}/;

// AUDIT-FIX: H-1 — prototype pollution guard.
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
  // AUDIT-FIX: H-1 — null-prototype containers + defineProperty assignment block setter-based pollution.
  const root: Record<string, unknown> = Object.create(null) as Record<string, unknown>;

  // Stack of (object, indent) so we can nest one level (sufficient for `requires:`).
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

  // We accumulate list values for the most recent `key:` (no value on the line).
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
    // AUDIT-FIX: alert-400 — bound trailing-whitespace strip.
    const stripped = rawLine.replace(/\s{1,4096}$/, '');
    if (!stripped.trim()) {
      flushList();
      continue;
    }
    if (stripped.trim().startsWith('#')) continue;
    const indent = leadingSpaces(stripped);

    // List entry?
    // AUDIT-FIX: alert-401 — bound the leading-whitespace and post-dash
    // whitespace runs so the regex is linear-time on adversarial input.
    const listMatch = /^[ \t]{0,256}-[ \t]{1,256}(.{0,4096})$/.exec(stripped);
    if (listMatch && pendingListKey) {
      pendingList.push(unquote(listMatch[1] ?? ''));
      continue;
    }

    flushList();

    // Pop the stack until indent fits.
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]!.obj;

    // AUDIT-FIX: alert-402 — bound whitespace runs and key/value lengths
    // to defeat polynomial-redos on adversarial frontmatter.
    const keyValueMatch =
      /^[ \t]{0,256}([A-Za-z0-9_$-]{1,128})[ \t]{0,256}:(?:[ \t]{0,256}(.{0,8192}))?$/.exec(
        stripped,
      );
    if (!keyValueMatch) continue;
    const key = keyValueMatch[1] ?? '';
    const valueText = (keyValueMatch[2] ?? '').trim();

    if (valueText === '') {
      // Either object or upcoming list. Probe next non-empty line context.
      const childObj: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      assign(parent, key, childObj);
      stack.push({ obj: childObj, indent });
      // Also possibly a list — if next non-empty line is `- ...`, listify here.
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
