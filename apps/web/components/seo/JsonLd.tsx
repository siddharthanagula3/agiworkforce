import { headers } from 'next/headers';

/**
 * Renders one or more Schema.org JSON-LD blocks as
 * `<script type="application/ld+json">` tags.
 *
 * CSP-nonce-aware: the per-request nonce is set by the proxy (see the site CSP)
 * and read here from the `x-nonce` header, so the inline script survives a
 * strict `script-src 'nonce-...'` policy without threading the nonce through
 * props. Server Component only.
 *
 * Escapes `<` to `<` so a stray `</script>` inside serialized content
 * cannot break out of the script element (XSS hardening for any user- or
 * data-derived strings).
 */
export async function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? undefined;
  const blocks = Array.isArray(data) ? data : [data];

  return (
    <>
      {blocks.map((block, index) => (
        <script
          // Static, index-keyed list of structured-data blocks; order is stable.
          key={index}
          nonce={nonce}
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(block).replace(/</g, '\\u003c'),
          }}
        />
      ))}
    </>
  );
}
