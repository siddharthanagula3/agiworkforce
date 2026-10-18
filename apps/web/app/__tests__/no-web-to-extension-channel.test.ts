import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const EXTENSION_ROOT = path.resolve(__dirname, '..', '..', '..', 'extension');
const SANDBOX_CHECK_FILE = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'ui',
  'unified-chat',
  'src',
  'lib',
  'artifact-sandbox.ts',
);
const SANDBOX_CHECK = 'isArtifactSandboxMessage';
const EXTENSION_SRC = path.join(EXTENSION_ROOT, 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);

function extensionFile(...segments: string[]): string {
  return readFileSync(path.join(EXTENSION_ROOT, ...segments), 'utf8');
}

function walkSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walkSources(full);
    return SOURCE_EXTENSIONS.has(path.extname(full)) ? [full] : [];
  });
}

const EXTENSION_SOURCES = walkSources(EXTENSION_SRC).map((file) => ({
  file: path.relative(EXTENSION_ROOT, file),
  text: readFileSync(file, 'utf8'),
}));

function sourcesMatching(pattern: RegExp): string[] {
  return EXTENSION_SOURCES.filter((source) => pattern.test(source.text)).map(
    (source) => source.file,
  );
}

function closingIndex(text: string, open: number): number {
  const close = text[open] === '(' ? ')' : '}';
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === text[open]) depth += 1;
    else if (text[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** The first parameter and the body of a handler, written inline or named in this file. */
function handlerAt(text: string, start: number): { param: string; body: string } | null {
  const rest = text.slice(start);
  const named = /^([A-Za-z_$][\w$]*)\s*[,)]/u.exec(rest);
  let from = start;
  if (named) {
    const name = escapeRegExp(named[1]!);
    const declaration = new RegExp(
      `(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=\\s*(?:function\\s*)?\\()`,
      'u',
    ).exec(text);
    if (!declaration) return null;
    from = declaration.index + declaration[0].length - 1;
  } else {
    const inline = /^(?:async\s+)?(?:function\s*[\w$]*\s*)?\(/u.exec(rest);
    if (!inline) {
      const bare = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>\s*\{/u.exec(rest);
      if (!bare) return null;
      const open = start + bare[0].length - 1;
      return { param: bare[1]!, body: text.slice(open, closingIndex(text, open) + 1) };
    }
    from = start + inline[0].length - 1;
  }
  const paramsEnd = closingIndex(text, from);
  const param = /^\(\s*([A-Za-z_$][\w$]*)/u.exec(text.slice(from, paramsEnd + 1))?.[1];
  const open = text.indexOf('{', paramsEnd);
  if (!param || open < 0) return null;
  if (!/^\)\s*(?::\s*[\w$<>[\]|.\s]+?)?\s*(?:=>\s*)?$/u.test(text.slice(paramsEnd, open))) {
    return null;
  }
  return { param, body: text.slice(open, closingIndex(text, open) + 1) };
}

/**
 * A handler may read a message only after it has tied the sender to the
 * extension's own sandbox frame, through the shared check or by comparing
 * both the source window and the origin itself.
 */
function checksSandboxSender({ param, body }: { param: string; body: string }): boolean {
  const name = escapeRegExp(param);
  const shared = new RegExp(`\\b${SANDBOX_CHECK}\\(\\s*${name}\\s*,`, 'u').exec(body);
  const source = new RegExp(`\\b${name}\\.source\\s*[!=]==\\s*[\\w$.?]+\\.contentWindow\\b`, 'u');
  const origin = new RegExp(`\\b${name}\\.origin\\s*[!=]==`, 'u');
  const inline = source.exec(body) && origin.test(body) ? source.exec(body) : null;
  const check = shared ?? inline;
  if (!check) return false;
  const firstRead = new RegExp(`\\b${name}\\.data\\b`, 'u').exec(body);
  return !firstRead || firstRead.index > check.index;
}

/** Every way this source could open a channel with a web page, described. */
function pageBridges(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(
    /\b(?:window|self|globalThis|parent|top|opener)\s*\??\.\s*postMessage\s*\(/gu,
  )) {
    found.push(`posts to a page at offset ${match.index}`);
  }
  for (const match of text.matchAll(/\.contentWindow\s*\??\.\s*postMessage\s*\(/gu)) {
    const open = match.index + match[0].length - 1;
    const call = text.slice(open, closingIndex(text, open) + 1);
    if (/,\s*['"`]\*['"`]\s*,?\s*\)$/u.test(call)) {
      found.push(`posts to a frame with a wildcard target origin at offset ${match.index}`);
    }
  }
  for (const match of text.matchAll(
    /addEventListener\(\s*['"`]message['"`]\s*,\s*|\bonmessage\s*=\s*/gu,
  )) {
    const handler = handlerAt(text, match.index + match[0].length);
    if (!handler || !checksSandboxSender(handler)) {
      found.push(`reads messages from an unchecked sender at offset ${match.index}`);
    }
  }
  return found;
}

describe('web cannot hand a computer-use task to the extension', () => {
  it('finds the extension sources this guard depends on', () => {
    expect(extensionFile('manifest.json').length).toBeGreaterThan(0);
    expect(EXTENSION_SOURCES.length).toBeGreaterThan(0);
    expect(EXTENSION_SOURCES.some((source) => source.file.endsWith('src/content.ts'))).toBe(true);
  });

  it('declares no externally_connectable origins', () => {
    expect(JSON.parse(extensionFile('manifest.json')).externally_connectable).toBeUndefined();
  });

  it('registers no external message listener anywhere in the extension', () => {
    expect(sourcesMatching(/onMessageExternal|onConnectExternal/u)).toEqual([]);
  });

  it('opens no page bridge in either direction', () => {
    const bridges = EXTENSION_SOURCES.flatMap((source) =>
      pageBridges(source.text).map((bridge) => `${source.file}: ${bridge}`),
    );
    expect(bridges).toEqual([]);
  });

  it('trusts a sandbox message only through a check that pins both source and origin', () => {
    const shared = readFileSync(SANDBOX_CHECK_FILE, 'utf8');
    const start = shared.indexOf(`export function ${SANDBOX_CHECK}(`);
    expect(start).toBeGreaterThan(-1);
    const body = shared.slice(
      start,
      closingIndex(shared, shared.indexOf('{', shared.indexOf(')', start))) + 1,
    );
    expect(body).toMatch(/event\.source !== frame\.contentWindow/u);
    expect(body).toMatch(/event\.origin === expected/u);
  });
});

describe('the page-bridge guard', () => {
  it('passes a listener that checks its own sandbox frame before reading', () => {
    const shared = [
      'function onSandboxMessage(event: MessageEvent): void {',
      '  if (!isArtifactSandboxMessage(event, frame)) return;',
      '  const data = event.data;',
      '}',
      "window.addEventListener('message', onSandboxMessage);",
    ].join('\n');
    const inline = [
      "window.addEventListener('message', (event) => {",
      '  if (event.source !== frame.contentWindow || event.origin !== sandboxOrigin) return;',
      '  handle(event.data);',
      '});',
    ].join('\n');
    expect(pageBridges(shared)).toEqual([]);
    expect(pageBridges(inline)).toEqual([]);
  });

  it('passes a post to the sandbox frame that names its origin', () => {
    expect(
      pageBridges("frame.contentWindow?.postMessage({ type: 'render' }, sandboxOrigin);"),
    ).toEqual([]);
  });

  it('fails a listener that reads a message without checking its sender', () => {
    const unchecked = [
      "window.addEventListener('message', (event) => {",
      '  runTask(event.data);',
      '});',
    ].join('\n');
    const originOnly = [
      "window.addEventListener('message', (event) => {",
      "  if (event.origin !== 'https://agiworkforce.com') return;",
      '  runTask(event.data);',
      '});',
    ].join('\n');
    const checkedTooLate = [
      'function onMessage(event) {',
      '  runTask(event.data);',
      '  if (!isArtifactSandboxMessage(event, frame)) return;',
      '}',
      "window.addEventListener('message', onMessage);",
    ].join('\n');
    const unresolved = "window.addEventListener('message', importedHandler);";
    const assigned = 'window.onmessage = (event) => runTask(event.data);';
    for (const source of [unchecked, originOnly, checkedTooLate, unresolved, assigned]) {
      expect(pageBridges(source), source).toHaveLength(1);
    }
  });

  it('fails a post to the page or to a frame with a wildcard origin', () => {
    expect(pageBridges("window.postMessage({ type: 'task' }, '*');")).toHaveLength(1);
    expect(pageBridges('parent.postMessage(result, origin);')).toHaveLength(1);
    expect(pageBridges("frame.contentWindow.postMessage(payload, '*');")).toHaveLength(1);
  });
});
