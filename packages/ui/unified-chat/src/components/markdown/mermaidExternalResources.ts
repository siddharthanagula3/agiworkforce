import { markdownImageSource } from './markdownImageSources';

interface MermaidDiagramParser {
  getDiagramFromText(text: string): Promise<{ db: unknown }>;
}

const CSS_RESOURCE_PATTERN = /url\(|image-set\(|cross-fade\(|src\(|@import/;
const CONFIG_ESCAPE_PATTERN =
  /\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8})|\r?\n|([\s\S]))/g;
const CSS_ESCAPE_PATTERN = /\\(?:([0-9a-fA-F]{1,6})[ \t\n\f]?|\r?\n|([\s\S]))/g;
const EMBEDDED_ICON_PREFIX = '@';
const MAX_CODE_POINT = 0x10ffff;
const REPLACEMENT_CHARACTER = '�';
const EXTERNAL_CONTENT_REASON = 'it loads content from another site';

function codePoint(hex: string): string {
  const value = Number.parseInt(hex, 16);
  return value > 0 && value <= MAX_CODE_POINT ? String.fromCodePoint(value) : REPLACEMENT_CHARACTER;
}

function decodeConfigEscapes(text: string): string {
  return text.replace(
    CONFIG_ESCAPE_PATTERN,
    (_match, byte?: string, unit?: string, point?: string, other?: string) => {
      const hex = byte ?? unit ?? point;
      return hex ? codePoint(hex) : (other ?? '');
    },
  );
}

function decodeCssEscapes(text: string): string {
  return text.replace(CSS_ESCAPE_PATTERN, (_match, hex?: string, other?: string) =>
    hex ? codePoint(hex) : (other ?? ''),
  );
}

function loadsCssResource(source: string): boolean {
  const config = decodeConfigEscapes(source);
  const css = decodeCssEscapes(source);
  return [source, config, css, decodeCssEscapes(config), decodeConfigEscapes(css)].some((text) =>
    CSS_RESOURCE_PATTERN.test(text.toLowerCase()),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function entriesOf(db: Record<string, unknown>, method: string): Record<string, unknown>[] {
  const read = db[method];
  if (typeof read !== 'function') return [];
  const entries: unknown = read.call(db);
  return entries instanceof Map ? [...entries.values()].filter(isRecord) : [];
}

function imageReason(reference: unknown): string | null {
  const image = markdownImageSource(String(reference));
  if (!image) return EXTERNAL_CONTENT_REASON;
  return image.kind === 'cross-origin' ? `it loads an image from ${image.host}` : null;
}

function iconReason(icon: unknown): string | null {
  if (typeof icon === 'string' && icon.trim().startsWith(EMBEDDED_ICON_PREFIX)) return null;
  return imageReason(icon) ?? EXTERNAL_CONTENT_REASON;
}

function diagramImageReason(db: unknown): string | null {
  if (!isRecord(db)) return null;
  for (const vertex of entriesOf(db, 'getVertices')) {
    const reason = vertex['img'] ? imageReason(vertex['img']) : null;
    if (reason) return reason;
  }
  for (const actor of entriesOf(db, 'getActors')) {
    const properties = actor['properties'];
    const reason =
      isRecord(properties) && properties['icon'] ? iconReason(properties['icon']) : null;
    if (reason) return reason;
  }
  return null;
}

export async function mermaidExternalResource(
  parser: MermaidDiagramParser,
  source: string,
): Promise<string | null> {
  if (loadsCssResource(source)) return EXTERNAL_CONTENT_REASON;
  const { db } = await parser.getDiagramFromText(source);
  return diagramImageReason(db);
}
