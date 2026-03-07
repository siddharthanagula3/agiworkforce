import Link from 'next/link';

export function ExpiredShareBanner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="max-w-md text-center">
        <div className="mb-4 text-6xl" role="img" aria-label="Lock">
          🔒
        </div>
        <h1 className="mb-2 text-2xl font-bold text-white">Session Expired</h1>
        <p className="mb-6 text-gray-400">
          This shared session link has expired. Shared sessions are available for 7 days after
          creation.
        </p>
        <Link
          href="/"
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-500"
        >
          Go to AGI Workforce
        </Link>
      </div>
    </div>
  );
}
