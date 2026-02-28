'use client';

/**
 * Support page - placeholder until a dedicated support page component is built.
 * The support feature currently only has a service layer (support-service.ts).
 */
export default function SupportPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Support</h1>
        <p className="mt-2 text-zinc-400">Get help, submit tickets, and browse FAQs.</p>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-zinc-400">
          Support page coming soon. Use the support service API in the meantime.
        </p>
      </div>
    </div>
  );
}
