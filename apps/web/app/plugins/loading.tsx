/**
 * Streaming fallback for /plugins.
 *
 * The catalogue is a live database read now, so the page really can be
 * in-flight; this is the loading state for that wait, not decoration.
 */
export default function PluginsLoading() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Plugins</h1>
          <p className="agi-page-lede" role="status" aria-live="polite">
            Loading the plugin catalogue…
          </p>
        </section>
      </main>
    </div>
  );
}
