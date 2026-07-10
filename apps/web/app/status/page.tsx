import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { runHealthChecks } from '../../lib/server/health-check';

export const metadata = buildMetadata({
  title: 'Status',
  description:
    "A live health signal for AGI's hosted services. Checked when you load the page. Plus release notes and support channels.",
  path: '/status',
});

type HealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

const HEALTH_LABEL: Record<HealthState, string> = {
  healthy: 'Operational',
  degraded: 'Degraded',
  unhealthy: 'Disruption detected',
  unknown: 'Live check unavailable',
};

const HEALTH_NOTE: Record<HealthState, string> = {
  healthy: 'All hosted checks passed on this request.',
  degraded: 'Some hosted checks did not pass on this request.',
  unhealthy: 'One or more hosted checks failed on this request.',
  unknown:
    'We could not complete the health check for this page load. If you are seeing errors, email us.',
};

interface HealthSignal {
  state: HealthState;
  checkedAt: string | null;
}

/**
 * Runs the shared health checks in-process. No self-HTTP request: building a
 * fetch URL from request headers (Host / x-forwarded-proto) is a Host-header
 * SSRF vector, so the page calls the same function the /api/health route
 * uses. A timeout guard keeps a slow dependency from stalling the page.
 */
async function fetchHealth(): Promise<HealthSignal> {
  try {
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 4000);
    });
    const result = await Promise.race([runHealthChecks(), timeout]);
    if (!result) {
      return { state: 'unknown', checkedAt: null };
    }
    return { state: result.status, checkedAt: result.timestamp };
  } catch {
    return { state: 'unknown', checkedAt: null };
  }
}

export default async function StatusPage() {
  const health = await fetchHealth();
  const checkedLabel = health.checkedAt
    ? new Date(health.checkedAt).toUTCString()
    : 'This page load';

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-status-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Status</p>
          <h1 id="agi-status-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">One signal,</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">honestly checked.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            No wall of evergreen badges. This page runs a real health check against AGI's hosted
            services when you load it. Most of AGI doesn't depend on our servers at all. Local and
            BYOK work runs on your device.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <ul className="agi-fl-mode-ribbon" aria-label="Where AGI runs">
              <li>Local · your device</li>
              <li>BYOK · provider-direct</li>
              <li>Cloud · hosted, public alpha</li>
            </ul>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-status-signal-title">
          <p className="agi-fl-eyebrow">Live signal</p>
          <h2 id="agi-status-signal-title" className="agi-fl-h2">
            Checked when you loaded this page.
          </h2>
          <p className="agi-fl-section-lede">
            The result below comes from a server-side call to our health endpoint, which exercises
            the hosted web platform and its core dependencies. It is the same check we run ourselves
            Not a hand-edited badge.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Scope</th>
                <th>Result</th>
                <th>Checked</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Hosted platform</td>
                <td>{HEALTH_LABEL[health.state]}</td>
                <td>{checkedLabel}</td>
              </tr>
            </tbody>
          </table>
          <p className="agi-fl-section-lede">{HEALTH_NOTE[health.state]}</p>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-status-boundaries-title">
          <p className="agi-fl-eyebrow">What depends on us</p>
          <h2 id="agi-status-boundaries-title" className="agi-fl-h2">
            Most of AGI runs without our servers.
          </h2>
          <p className="agi-fl-section-lede">
            The three trust modes have different failure domains. An incident on our side does not
            touch work that never leaves your device.
          </p>
          <div className="agi-fl-trust-grid">
            <div className="agi-fl-trust-card">
              <p className="agi-fl-trust-mode">
                <span aria-hidden="true">◆</span> Local
              </p>
              <h3 className="agi-fl-trust-title">No dependency on AGI's servers.</h3>
              <p className="agi-fl-trust-body">
                Local chats, files, and sessions run on your own hardware through Ollama or LM
                Studio. They keep working during any hosted incident, including a full outage.
              </p>
            </div>
            <div className="agi-fl-trust-card">
              <p className="agi-fl-trust-mode">
                <span aria-hidden="true">◇</span> BYOK
              </p>
              <h3 className="agi-fl-trust-title">Traffic goes straight to your provider.</h3>
              <p className="agi-fl-trust-body">
                BYOK requests on Desktop and CLI travel directly from your machine to the provider
                you chose. If a model misbehaves, the provider's own status page is the source of
                truth.
              </p>
            </div>
            <div className="agi-fl-trust-card">
              <p className="agi-fl-trust-mode">
                <span aria-hidden="true">●</span> AGI Cloud
              </p>
              <h3 className="agi-fl-trust-title">Public alpha, open by default.</h3>
              <p className="agi-fl-trust-body">
                Managed compute is in public alpha — signed-in users can use it now, with metered
                usage and visible provider labels. Team &amp; Enterprise controls are rolling out.
              </p>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-status-more-title">
          <p className="agi-fl-eyebrow">Incidents &amp; history</p>
          <h2 id="agi-status-more-title" className="agi-fl-h2">
            Something looks wrong?
          </h2>
          <p className="agi-fl-section-lede">
            Release notes live in the changelog, and a human reads every incident report. Tell us
            what you saw and when. We'd rather hear it twice than not at all.
          </p>
          <div className="agi-fl-cta-row">
            <a href="mailto:contact@agiworkforce.com" className="agi-fl-cta agi-fl-cta--primary">
              Email an Incident Report
            </a>
            <Link href="/changelog" className="agi-fl-cta agi-fl-cta--secondary">
              Read the Changelog
            </Link>
            <Link href="/support" className="agi-fl-cta agi-fl-cta--ghost">
              Get Support
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
