import Link from 'next/link';

export interface FeatureItem {
  title: string;
  body: string;
  meta?: string;
  href?: string;
}

export interface RouteItem {
  title: string;
  body: string;
  href: string;
  meta?: string;
}

export interface LedgerRow {
  k: string;
  v: string;
}

export function FeatureGrid({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string;
  title: string;
  items: FeatureItem[];
}) {
  return (
    <section className="agi-section">
      <p className="agi-section-eyebrow">{eyebrow}</p>
      <h2 className="agi-section-h2">{title}</h2>
      <div className="agi-signal-grid">
        {items.map((item) => {
          const content = (
            <>
              {item.meta ? <p className="agi-signal-meta">{item.meta}</p> : null}
              <h3 className="agi-signal-title">{item.title}</h3>
              <p className="agi-signal-body">{item.body}</p>
            </>
          );

          return item.href ? (
            <Link key={item.title} href={item.href} className="agi-signal-card agi-signal-link">
              {content}
            </Link>
          ) : (
            <article key={item.title} className="agi-signal-card">
              {content}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function LedgerSection({
  eyebrow,
  title,
  rows,
}: {
  eyebrow: string;
  title: string;
  rows: LedgerRow[];
}) {
  return (
    <section className="agi-section">
      <p className="agi-section-eyebrow">{eyebrow}</p>
      <h2 className="agi-section-h2">{title}</h2>
      <table className="agi-ledger">
        <tbody>
          {rows.map((row) => (
            <tr key={row.k}>
              <td>{row.k}</td>
              <td>{row.v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function RouteMap({
  eyebrow,
  title,
  routes,
}: {
  eyebrow: string;
  title: string;
  routes: RouteItem[];
}) {
  return (
    <section className="agi-section">
      <p className="agi-section-eyebrow">{eyebrow}</p>
      <h2 className="agi-section-h2">{title}</h2>
      <div className="agi-route-grid">
        {routes.map((route) => (
          <Link key={route.title} href={route.href} className="agi-route-card">
            {route.meta ? <span className="agi-route-meta">{route.meta}</span> : null}
            <span className="agi-route-title">{route.title}</span>
            <span className="agi-route-body">{route.body}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
