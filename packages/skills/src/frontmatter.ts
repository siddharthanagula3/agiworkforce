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

const FRONTMATTER_FENCE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;

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
  const root: Record<string, unknown> = {};

  // Stack of (object, indent) so we can nest one level (sufficient for `requires:`).
  const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [
    { obj: root, indent: -1 },
  ];

  // We accumulate list values for the most recent `key:` (no value on the line).
  let pendingListKey: string | null = null;
  let pendingListTarget: Record<string, unknown> | null = null;
  const pendingList: string[] = [];

  function flushList(): void {
    if (pendingListKey && pendingListTarget && pendingList.length > 0) {
      pendingListTarget[pendingListKey] = [...pendingList];
    }
    pendingListKey = null;
    pendingListTarget = null;
    pendingList.length = 0;
  }

  for (const rawLine of lines) {
    const stripped = rawLine.replace(/\s+$/, '');
    if (!stripped.trim()) {
      flushList();
      continue;
    }
    if (stripped.trim().startsWith('#')) continue;
    const indent = leadingSpaces(stripped);

    // List entry?
    const listMatch = /^\s*-\s+(.*)$/.exec(stripped);
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

    const keyValueMatch = /^\s*([A-Za-z0-9_$-]+)\s*:(?:\s*(.*))?$/.exec(stripped);
    if (!keyValueMatch) continue;
    const key = keyValueMatch[1] ?? '';
    const valueText = (keyValueMatch[2] ?? '').trim();

    if (valueText === '') {
      // Either object or upcoming list. Probe next non-empty line context.
      const childObj: Record<string, unknown> = {};
      parent[key] = childObj;
      stack.push({ obj: childObj, indent });
      // Also possibly a list — if next non-empty line is `- ...`, listify here.
      pendingListKey = key;
      pendingListTarget = parent;
      continue;
    }

    if (valueText.startsWith('[') && valueText.endsWith(']')) {
      const inner = valueText.slice(1, -1).trim();
      const parts = inner ? inner.split(',').map((s) => unquote(s.trim())) : [];
      parent[key] = parts;
      continue;
    }

    parent[key] = parseScalar(valueText);
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
