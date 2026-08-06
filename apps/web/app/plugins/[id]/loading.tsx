/**
 * Streaming fallback for /plugins/[id] while the registry read is in flight.
 */
export default function PluginDetailLoading() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Plugin</h1>
          <p className="agi-page-lede" role="status" aria-live="polite">
            Loading this pack from the registry…
          </p>
        </section>
      </main>
    </div>
  );
}
