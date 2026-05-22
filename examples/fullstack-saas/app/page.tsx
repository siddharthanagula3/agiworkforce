import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="hero">
      <section>
        <h1>Operate projects with tenant-safe speed.</h1>
        <p className="lede">
          Forgeboard is a compact SaaS reference app with authenticated workspaces, role-aware
          project access, row-level security, rate-limited APIs, Redis-backed caching, structured
          logs, and cloud deployment files.
        </p>
        <Link className="button" href="/login">
          Start workspace
        </Link>
      </section>
      <aside className="panel" aria-label="Architecture summary">
        <p className="muted">Included layers</p>
        <ul>
          <li>Next.js App Router frontend and API handlers</li>
          <li>Supabase Auth, Postgres, RLS, and object storage</li>
          <li>Redis rate limiting and cache TTLs</li>
          <li>AWS ECS, ALB, CloudFront, S3 logs, and autoscaling</li>
          <li>GitHub Actions build, test, image push, and deploy</li>
        </ul>
      </aside>
    </main>
  );
}
