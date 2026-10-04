import Link from 'next/link';

export default function SharedScheduleNotFound() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground"
    >
      <div className="max-w-md">
        <h1 className="mb-2 text-2xl font-semibold">Shared schedule unavailable</h1>
        <p className="mb-6 text-muted-foreground">
          This link may have been revoked or entered incorrectly. Ask the sender for a new link.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Open AGI
        </Link>
      </div>
    </main>
  );
}
