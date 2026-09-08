/**
 * @file file-input.ts
 * @module @agiworkforce/types/file-input
 *
 * # What a `file` content block means, once, for every provider
 *
 * A `FileBlock` always carries base64 bytes and a media type. What a provider
 * can do with those bytes differs, and the difference was being decided
 * independently inside each adapter:
 *
 *   - Anthropic mapped PDFs to a document block and `text/*` to a decoded text
 *     document, and threw for anything else.
 *   - Google passed every file straight through as `inlineData`.
 *   - The OpenAI Responses translator mapped every file to `input_file`.
 *   - The OpenAI Chat-Completions translator threw `TypeError('File inputs
 *     require an OpenAI Responses-capable model')` for EVERY file block,
 *     unconditionally, with no check on what the target could actually accept.
 *
 * That last one is the whole of AGI-17: it is the shared translator for
 * OpenRouter and every OpenAI-wire-compatible vendor, so attaching a .txt or a
 * .csv to a chat failed on every one of them, and the throw sat above each
 * caller's `try` so it escaped their error handling entirely and reached the
 * user as "The model failed to produce a response."
 *
 * The policy belongs here rather than in an adapter. An adapter translates a
 * canonical request into one vendor's wire format; deciding which attachments
 * a product accepts, and what happens when a route cannot take one, is product
 * policy that must read the same on every route. It sits beside `FileBlock` in
 * `provider-adapter.ts` for the same reason, and because doing so lets the
 * upload contract, the error taxonomy and every adapter share it without any
 * of them taking a dependency on another.
 *
 * ## The rule
 *
 * A text-like file is text. Its bytes decode to characters, so any model that
 * accepts a prompt accepts it, and inlining it costs nothing but tokens. This
 * covers `text/*` and the structured formats that are text with a schema:
 * JSON, CSV, XML, YAML, NDJSON, and the `+json` / `+xml` suffix families.
 *
 * Everything else is opaque bytes: a PDF, an image inside a document wrapper,
 * an Office file. A route that has no native file channel cannot read those,
 * and pretending otherwise by inlining base64 wastes the user's tokens to send
 * the model something it cannot parse. Those raise `UnsupportedFileInputError`,
 * which classifies as `unsupported_input`: not retryable on this route, but
 * eligible for failover, so Auto moves the turn to a route that can read it
 * rather than telling the user their file is broken.
 */

export const UNSUPPORTED_FILE_INPUT_ERROR_NAME = 'UnsupportedFileInputError';

const TEXT_MEDIA_TYPE_PREFIX = 'text/';
const STRUCTURED_TEXT_SUFFIXES = ['+json', '+xml', '+yaml'] as const;
const STRUCTURED_TEXT_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'application/json',
  'application/ld+json',
  'application/x-ndjson',
  'application/jsonl',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  'application/csv',
  'application/x-csv',
  'application/toml',
  'application/sql',
  'application/x-sh',
  'application/javascript',
  'application/typescript',
  'application/graphql',
]);

export interface FileInputBlock {
  filename: string;
  source: { type: 'base64'; mediaType: string; data: string };
}

/**
 * Raised when a route has no channel that can carry this file.
 *
 * `classifyError` in `@agiworkforce/provider-runtime` matches on the exported
 * name constant rather than on the class, the same way it already does for
 * `EmptyProviderResponseError`, so an error crossing a package boundary is
 * still recognised when two copies of the module exist.
 */
export class UnsupportedFileInputError extends Error {
  override readonly name = UNSUPPORTED_FILE_INPUT_ERROR_NAME;
  readonly filename: string;
  readonly mediaType: string;

  constructor(filename: string, mediaType: string, capability: string) {
    super(
      `${filename} is a ${mediaType} file, which this model cannot read: ${capability}. ` +
        'Choose a model that accepts documents, or attach the content as text.',
    );
    this.filename = filename;
    this.mediaType = mediaType;
  }
}

function bareMediaType(mediaType: string): string {
  const [type] = mediaType.split(';');
  return (type ?? '').trim().toLowerCase();
}

/**
 * True when the file's bytes are characters, so the block can be inlined as a
 * text part on any route at all.
 */
export function isTextLikeFileMediaType(mediaType: string): boolean {
  const bare = bareMediaType(mediaType);
  if (bare.startsWith(TEXT_MEDIA_TYPE_PREFIX)) return true;
  if (STRUCTURED_TEXT_MEDIA_TYPES.has(bare)) return true;
  return STRUCTURED_TEXT_SUFFIXES.some((suffix) => bare.endsWith(suffix));
}

export function decodeTextFileBlock(block: FileInputBlock): string {
  return Buffer.from(block.source.data, 'base64').toString('utf8');
}

/**
 * The canonical rendering of an inlined document.
 *
 * Named and delimited so the model can tell the attachment apart from the
 * user's own words, and so a second attachment does not read as a continuation
 * of the first. The delimiter is the filename, which the user chose and can
 * see in the composer.
 */
export function renderFileBlockAsText(block: FileInputBlock): string {
  const body = decodeTextFileBlock(block);
  const mediaType = bareMediaType(block.source.mediaType);
  return `<attached-file name="${block.filename}" type="${mediaType}">\n${body}\n</attached-file>`;
}

/**
 * Inline a file block as text, or say why this route cannot take it.
 *
 * @param capability, what the route CAN accept, quoted back to the user in the
 * refusal. The adapter knows this and the policy does not.
 * @throws UnsupportedFileInputError for opaque bytes.
 */
export function inlineFileBlockAsText(block: FileInputBlock, capability: string): string {
  if (!isTextLikeFileMediaType(block.source.mediaType)) {
    throw new UnsupportedFileInputError(block.filename, block.source.mediaType, capability);
  }
  return renderFileBlockAsText(block);
}
