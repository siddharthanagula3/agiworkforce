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
  const filenamePart = params.filename ? `; filename="${params.filename}"` : '';
  return {
    contentType: executable ? 'application/octet-stream' : params.contentType,
    contentDisposition: `${disposition}${filenamePart}`,
  };
}
