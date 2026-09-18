/**
 * Text surgery on a JSON catalog, so a release write touches the lines it
 * changes and nothing else.
 *
 * Re-serializing the parsed document would reflow the whole file: a JSON round
 * trip loses where the author put the line breaks, and prettier's objectWrap
 * default preserves them, so the only way to keep a release diff readable is to
 * edit the text and let prettier format what was inserted.
 */

const OPEN = '{';
const CLOSE = '}';

/** Index just past the object that starts at `open`, string- and escape-aware. */
export function objectEnd(text, open) {
  let depth = 0;
  let inString = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === OPEN) depth += 1;
    else if (char === CLOSE) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error('unterminated object');
}

function keyIndex(text, key, from, until) {
  const index = text.indexOf(`"${key}":`, from);
  if (index === -1 || index >= until) throw new Error(`no ${key} key in the document`);
  return index;
}

/**
 * The span of the object at a key path. A release record carries its own
 * `slots`, so an unscoped search finds the ledger's copy, not the live policy.
 */
function valueSpanAt(text, keys) {
  let from = 0;
  let until = text.length;
  let span = { start: 0, open: 0, end: text.length };
  for (const key of keys) {
    const start = keyIndex(text, key, from, until);
    const open = text.indexOf(OPEN, start);
    span = { start, open, end: objectEnd(text, open) };
    from = open;
    until = span.end;
  }
  return span;
}

/**
 * Replaces a top-level key's object value, or inserts it after `after` when the
 * document does not carry it yet.
 */
export function spliceTopLevelObject(text, key, value, after) {
  const serialized = JSON.stringify(value);
  if (text.includes(`"${key}":`)) {
    const span = valueSpanAt(text, [key]);
    return `${text.slice(0, span.open)}${serialized}${text.slice(span.end)}`;
  }
  const anchor = keyIndex(text, after, 0, text.length);
  const lineEnd = text.indexOf('\n', anchor);
  return `${text.slice(0, lineEnd + 1)}"${key}": ${serialized},${text.slice(lineEnd + 1)}`;
}

/**
 * Sets or clears the staged candidates on one routing slot, leaving every other
 * key of that slot exactly as the author wrote it.
 */
export function spliceSlotCandidates(text, slotId, candidates) {
  const span = valueSpanAt(text, ['auto', 'slots', slotId]);
  const slot = JSON.parse(text.slice(span.open, span.end));
  for (const kind of ['canary', 'shadow']) {
    if (candidates?.[kind] === undefined) delete slot[kind];
    else slot[kind] = candidates[kind];
  }
  return `${text.slice(0, span.open)}${JSON.stringify(slot)}${text.slice(span.end)}`;
}
