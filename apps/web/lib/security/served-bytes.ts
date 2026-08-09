import 'server-only';

/**
 * Content-Type / Content-Disposition for stored bytes this app hands back to a
 * browser on its OWN origin.
 *
 * Two routes do that: `/api/files/[id]` (sandbox- and model-generated files)
 * and `/api/projects/[id]/knowledge-files/[fileId]` (user-uploaded project
 * sources). Both echoed the stored Content-Type with an `inline` disposition.
 * For a markup type that means the browser PARSES AND EXECUTES the bytes as a
 * document on this origin the moment someone opens the URL — an uploaded
 * `.html` knowledge file, or an `.svg` a sandbox produced, becomes script
 * running against the signed-in session.
 *
 * `X-Content-Type-Options: nosniff` does not close this. It stops a browser
 * guessing a type the server did not send; it does not stop it honouring one
 * the server did send.
 *
 * So a markup type is served as an opaque download instead of a document.
 * Nothing in the product renders these bytes *from a URL*: HTML, SVG and code
 * artifacts are read with `fetch().text()` and rendered into a sandboxed
 * iframe's `srcDoc`, and both `fetch()` and `srcDoc` ignore Content-Type and
 * Content-Disposition entirely. Images (`<img src>`) and the gated PDF viewer
 * are not markup and are untouched. The only caller whose behaviour changes is
 * a top-level navigation, which is exactly the case being closed.
 *
 * This is a serving-side backstop, NOT a substitute for inspecting bytes at
 * ingest (`lib/security/upload-scan.ts`). It is what protects rows that were
 * stored before that inspection existed and cannot be rescanned retroactively.
 */

/**
 * Types a browser renders as an executable document. `text/xml` and
 * `application/xml` are on the list because an XML document can carry an
 * `xml-stylesheet` PI pointing at XSLT, which runs script in some engines.
 */
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
  // MHTML archives: a single file that reconstitutes a full HTML document.
  'message/rfc822',
  'multipart/related',
]);

/** True when a browser would execute these bytes as a document on our origin. */
function isBrowserExecutableContentType(contentType: string): boolean {
  const mime = (contentType ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!mime) return false;
  if (MARKUP_CONTENT_TYPES.has(mime)) return true;
  // `+xml` structured suffix (RFC 6839) — anything a browser parses as XML,
  // including vendor types the explicit roster above will never enumerate.
  return mime.endsWith('+xml');
}

export interface ServedByteHeaders {
  contentType: string;
  contentDisposition: string;
}

/**
 * Resolve the pair of headers a byte-serving route should send.
 *
 * `filename` must already be sanitised for a quoted-string header value by the
 * caller (each route has its own rule); omit it to send a disposition with no
 * filename parameter, which is what the knowledge-file preview path does.
 */
export function servedByteHeaders(params: {
  contentType: string;
  filename?: string;
  /** Caller wants a download even for an inert type (an explicit `?download`). */
  forceAttachment?: boolean;
}): ServedByteHeaders {
  const executable = isBrowserExecutableContentType(params.contentType);
  const disposition = executable || params.forceAttachment ? 'attachment' : 'inline';
  const filenamePart = params.filename ? `; filename="${params.filename}"` : '';
  return {
    // Downgraded, not merely re-dispositioned: a browser that ignores
    // Content-Disposition still must not be told these bytes are a document.
    contentType: executable ? 'application/octet-stream' : params.contentType,
    contentDisposition: `${disposition}${filenamePart}`,
  };
}
