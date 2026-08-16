import Link from 'next/link';

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
