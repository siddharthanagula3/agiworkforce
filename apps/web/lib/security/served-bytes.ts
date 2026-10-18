import 'server-only';

const MARKUP_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'text/html',
  'text/htm',
  'application/xhtml+xml',
  'image/svg+xml',
  'image/svg',
  'text/xml',
  'application/xml',
  'text/xsl',
  'application/xslt+xml',
  'message/rfc822',
  'multipart/related',
]);

function isBrowserExecutableContentType(contentType: string): boolean {
  const mime = (contentType ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!mime) return false;
  if (MARKUP_CONTENT_TYPES.has(mime)) return true;
  return mime.endsWith('+xml');
}

const UNQUOTABLE_FILENAME_CHARACTERS = /[^\x20-\x7e]|["\\]/g;

function filenameParameters(filename: string): string {
  const quoted = filename.replace(UNQUOTABLE_FILENAME_CHARACTERS, '_');
  if (quoted === filename) return `; filename="${quoted}"`;
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `; filename="${quoted}"; filename*=UTF-8''${encoded}`;
}

export interface ServedByteHeaders {
  contentType: string;
  contentDisposition: string;
}

export function servedByteHeaders(params: {
  contentType: string;
  filename?: string;
  forceAttachment?: boolean;
}): ServedByteHeaders {
  const executable = isBrowserExecutableContentType(params.contentType);
  const disposition = executable || params.forceAttachment ? 'attachment' : 'inline';
  const filenamePart = params.filename ? filenameParameters(params.filename) : '';
  return {
    contentType: executable ? 'application/octet-stream' : params.contentType,
    contentDisposition: `${disposition}${filenamePart}`,
  };
}
