import { AgiTopBar } from './AgiTopBar';
import { AgiFooter } from './AgiFooter';
import { RouterVisualization } from './RouterVisualization';

/*
 * REDESIGN PREVIEW v3 — homepage.
 *
 * The full preview surface lives at /redesign-preview/* — click any link in
 * the top bar to see another page on the same theme.
 */

export default function RedesignPreviewPage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-hero">
        <h1 className="pv-h1">
          <span className="pv-h1-line">Beyond one model.</span>
          <span className="pv-h1-line pv-h1-line--quiet">Beyond one surface.</span>
          <span className="pv-h1-line">AGI in your hands.</span>
        </h1>

        <p className="pv-lede">
          Twelve providers in one thread. Switch mid-conversation; the history follows. Bring your
          own keys, run fully offline, or use our managed cloud.{' '}
          <strong>Anthropic locks you to Claude. We don&rsquo;t.</strong>
        </p>

        <div className="pv-cta-row">
          <a href="/download" className="pv-cta-primary">
            Install
          </a>
          <a href="/redesign-preview/providers" className="pv-cta-ghost">
            Try the demo →
          </a>
        </div>
      </section>

      <section className="pv-demo">
        <RouterVisualization />
      </section>

      <AgiFooter />
    </main>
  );
}
