import Link from 'next/link';

/**
 * Shared body for `/pair` and `/pair/<anything>`.
 *
 * Both patterns are claimed as app-owned URLs by two live production routes —
 * `app/.well-known/apple-app-site-association/route.ts` (`/pair`, `/pair/*`)
 * and the Android intent filter in `apps/mobile/app.config.js` — and
 * `apps/mobile/scripts/release/verify-production-associations.mjs` gates a
 * release on those claims. Both patterns 404'd on web, so the no-app branch of
 * a claimed URL was a dead end.
 *
 * WHY NO PAIRING CODE IS RENDERED. Nothing in the product mints a
 * `/pair?code=…` or `/pair/<code>` URL: the desktop QR carries the gateway
 * payload `agiw:<code>:<pairToken>` (`services/api-gateway/src/routes/pair.ts`)
 * and is parsed in-app by the scanner, and manual entry uses the companion
 * screen's own input. A code-bearing branch here would never run, so this page
 * does not pretend to have one — and the web browser holds no key material, so
 * it could not complete a pairing even if it did. It says where to go instead.
 */
export function PairBody() {
  return (
    <section
      className="agi-section"
      style={{ borderBottom: 'none', maxWidth: 480, margin: '0 auto' }}
    >
      <p className="agi-section-eyebrow">Pair your phone</p>
      <h1 className="agi-page-h1" style={{ marginBottom: 16 }}>
        Start pairing from AGI Desktop.
      </h1>
      <p className="agi-page-lede" style={{ marginBottom: 24 }}>
        Open AGI Desktop, go to Mobile companion, and generate a pairing code. Scan the QR code with
        the AGI app on your phone, or choose Enter code manually and type the code in.
      </p>
      <div className="agi-callout">
        <h2 className="agi-callout-h">You need the AGI mobile app</h2>
        <p className="agi-callout-p">
          Pairing links your desktop to the app on your phone, so it cannot be completed in a
          browser.{' '}
          <Link href="/download" style={{ color: 'var(--agi-amber)' }}>
            See mobile availability
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
