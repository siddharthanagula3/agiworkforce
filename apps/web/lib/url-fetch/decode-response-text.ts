const CONTENT_TYPE_CHARSET = /(?:^|;)\s*charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s;]+))/i;
const META_CHARSET = /<meta\b[^>]*?\bcharset\s*=\s*["']?\s*([^\s"'>;]+)/i;
const META_PRESCAN_BYTES = 1024;

export type DecodedResponseText = { ok: true; text: string } | { ok: false; charset: string };

export function charsetFromContentType(contentType: string): string | null {
  const match = CONTENT_TYPE_CHARSET.exec(contentType);
  const label = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
  return label.length > 0 ? label : null;
}

function byteOrderMarkCharset(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return null;
}

function charsetFromHtmlPrescan(bytes: Uint8Array): string | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, META_PRESCAN_BYTES));
  return META_CHARSET.exec(head)?.[1] ?? null;
}

export function decodeResponseText(
  bytes: Uint8Array,
  contentType: string,
  options: { html: boolean },
): DecodedResponseText {
  const label =
    byteOrderMarkCharset(bytes) ??
    charsetFromContentType(contentType) ??
    (options.html ? charsetFromHtmlPrescan(bytes) : null) ??
    'utf-8';
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(label, { fatal: false });
  } catch {
    return { ok: false, charset: label.replace(/[^\w.:-]/g, '').slice(0, 64) };
  }
  return { ok: true, text: decoder.decode(bytes) };
}
