import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="hero">
      <section>
        <h1>Route not found.</h1>
        <p className="lede">
          The requested page does not exist or you no longer have access to it.
        </p>
        <Link className="button" href="/dashboard">
          Dashboard
        </Link>
      </section>
    </main>
  );
}
