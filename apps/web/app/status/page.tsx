import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { getCachedHealthChecks, type HealthCheckResult } from '../../lib/server/health-check';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';

export const metadata = buildMetadata({
  title: 'Status',
  description:
    "A health signal for AGI's hosted services, re-checked every minute, with an explicit statement of what the check does and does not cover.",
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
  healthy: 'Every check below passed on the most recent run.',
  degraded:
    'Core serving passed, but a non-core dependency did not. Chat keeps working; billing may not.',
  unhealthy:
    'A core check failed on the most recent run. The hosted platform cannot serve normally.',
  unknown:
    'We could not complete the most recent health check. If you are seeing errors, email us.',
};

const COMPONENT_LABEL: Record<'healthy' | 'unhealthy', string> = {
  healthy: 'Passing',
  unhealthy: 'Failing',
};

interface HealthSignal {
  state: HealthState;
  checkedAt: string | null;
  checks: HealthCheckResult['checks'] | null;
}

async function fetchHealth(): Promise<HealthSignal> {
  try {
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 4000);
    });
    const result = await Promise.race([getCachedHealthChecks(), timeout]);
    if (!result) {
      return { state: 'unknown', checkedAt: null, checks: null };
    }
    return { state: result.status, checkedAt: result.timestamp, checks: result.checks };
  } catch {
    return { state: 'unknown', checkedAt: null, checks: null };
  }
}

const COVERED: { key: 'environment' | 'database' | 'stripe'; label: string; what: string }[] = [
  {
    key: 'environment',
    label: 'Configuration',
    what: 'A database connection string is present in the serving environment.',
  },
  {
    key: 'database',
    label: 'Postgres',
    what: 'A query is executed against the primary database and returns.',
  },
  {
    key: 'stripe',
    label: 'Payments',
    what: 'A read call to the payments API returns. A failure here degrades billing only: chat is unaffected, so it does not report a platform outage.',
  },
];

const NOT_COVERED = [
  'Authentication (Clerk)',
  'Object storage (Cloudflare R2)',
  'The API gateway',
  'The rate limiter (Redis)',
  'Individual model providers and model routes',
  'Desktop, mobile, extension, and CLI surfaces',
];

export default async function StatusPage() {
  const health = await fetchHealth();
  const checks = health.checks;
  const checkedLabel = health.checkedAt
    ? new Date(health.checkedAt).toUTCString()
    : 'Not completed';

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-status-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Status</p>
          <h1 id="agi-status-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">One signal,</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">honestly checked.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            No wall of evergreen badges. This page runs a real health check against AGI&rsquo;s
            hosted services at most once a minute, shows you when that check ran, and tells you
            exactly what it does not cover. Most of AGI doesn&rsquo;t depend on our servers at all :
            Local and BYOK work runs on your device.
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
            Re-checked every {RENDER_CACHE_SECONDS.liveSignal} seconds.
          </h2>
          <p className="agi-fl-section-lede">
            The result below comes from a real run of the checks, shared by everyone who loads this
            page inside the same window: the &ldquo;Checked&rdquo; column is the moment it actually
            ran, not the moment you asked. It calls the health checks directly, in-process, rather
            than making an HTTP request to our own health endpoint. Building a request URL out of
            inbound headers is a server-side request forgery vector, so a status page that
            self-fetches is a status page with a security bug. Running them once per window rather
            than once per visitor also keeps a traffic spike on this page from becoming load on the
            very dependencies it is reporting on. Same checks the monitored endpoint runs. Not a
            hand-edited badge.
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
                <td style={{ color: 'var(--agi-ink)', fontWeight: 500 }}>
                  {HEALTH_LABEL[health.state]}
                </td>
                <td>{checkedLabel}</td>
              </tr>
              {checks
                ? COVERED.map((component) => (
                    <tr key={component.key}>
                      <td>{component.label}</td>
                      <td>{COMPONENT_LABEL[checks[component.key].status]}</td>
                      <td>{checkedLabel}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
          <p className="agi-fl-section-lede">{HEALTH_NOTE[health.state]}</p>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-status-scope-title">
          <p className="agi-fl-eyebrow">Scope of the check</p>
          <h2 id="agi-status-scope-title" className="agi-fl-h2">
            What this signal proves, and what it does not.
          </h2>
          <p className="agi-fl-section-lede">
            A green row here is worth exactly three checks, so here they are. Reading it as
            whole-platform coverage would be reading it wrong.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Covered</th>
                <th>What the check actually does</th>
              </tr>
            </thead>
            <tbody>
              {COVERED.map((component) => (
                <tr key={component.key}>
                  <td style={{ width: '22%' }}>{component.label}</td>
                  <td>{component.what}</td>
                </tr>
              ))}
              <tr>
                <td style={{ width: '22%' }}>Not covered</td>
                <td>
                  {NOT_COVERED.join(' · ')}. A green signal above says nothing about any of these.
                  If one of them is failing for you, the report channel below is the fastest path.
                </td>
              </tr>
            </tbody>
          </table>
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
              <h3 className="agi-fl-trust-title">No dependency on AGI&rsquo;s servers.</h3>
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
                BYOK requests on Desktop, CLI, and VS Code travel directly from the local runtime to
                the provider you chose. If a model misbehaves, the provider&rsquo;s own status page
                is the source of truth.
              </p>
            </div>
            <div className="agi-fl-trust-card">
              <p className="agi-fl-trust-mode">
                <span aria-hidden="true">●</span> AGI Cloud
              </p>
              <h3 className="agi-fl-trust-title">Public alpha, open by default.</h3>
              <p className="agi-fl-trust-body">
                Managed compute is in public alpha: signed-in users can use it now, with metered
                usage and visible provider labels. This is the only mode the signal above describes.
              </p>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-status-incidents-title">
          <p className="agi-fl-eyebrow">Incidents</p>
          <h2 id="agi-status-incidents-title" className="agi-fl-h2">
            How we handle one, and what we owe you.
          </h2>
          <p className="agi-fl-section-lede">
            We have not published an incident archive or postmortems. Rather than leave that as an
            implied &ldquo;no incidents ever&rdquo;, here is the process and the commitment, so you
            can hold us to it.
          </p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td style={{ width: '22%' }}>Severity 1</td>
                <td>
                  Hosted platform cannot serve, or a confirmed unauthorised access to customer data.
                  We start work immediately on discovery and post here once we can describe the
                  impact accurately.
                </td>
              </tr>
              <tr>
                <td>Severity 2</td>
                <td>
                  A major capability is unavailable or badly degraded for many users (for example
                  managed chat, sign-in, or file upload) while the rest of the platform serves.
                </td>
              </tr>
              <tr>
                <td>Severity 3</td>
                <td>
                  Degraded or partial function with a workaround, or an issue affecting a narrow set
                  of users.
                </td>
              </tr>
              <tr>
                <td>Notification</td>
                <td>
                  For a confirmed security incident involving customer personal data, we will notify
                  affected account holders by email at the address on the account, and will do so
                  without undue delay once we have confirmed scope. Where a data protection
                  regulator requires notification, we will meet that obligation.
                </td>
              </tr>
              <tr>
                <td>On-call</td>
                <td>
                  There is no 24/7 rotation. Response is best-effort during working hours. This is
                  stated plainly because assuming otherwise would be the dangerous reading.
                </td>
              </tr>
              <tr>
                <td>Security reports</td>
                <td>
                  A suspected vulnerability is not a status incident: it goes through coordinated
                  disclosure, including our scope and safe-harbour terms, on{' '}
                  <Link href="/security#report" style={{ color: 'var(--agi-ink)' }}>
                    /security
                  </Link>
                  .
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-status-more-title">
          <p className="agi-fl-eyebrow">Report something</p>
          <h2 id="agi-status-more-title" className="agi-fl-h2">
            Something looks wrong?
          </h2>
          <p className="agi-fl-section-lede">
            Release notes live in the changelog, and a human reads every incident report. Tell us
            what you saw and when. We&rsquo;d rather hear it twice than not at all.
          </p>
          <div className="agi-fl-cta-row">
            <a href="mailto:contact@agiworkforce.com" className="agi-fl-cta agi-fl-cta--primary">
              Email an Incident Report
            </a>
            <Link href="/security" className="agi-fl-cta agi-fl-cta--secondary">
              Security Details
            </Link>
            <Link href="/changelog" className="agi-fl-cta agi-fl-cta--ghost">
              Read the Changelog
            </Link>
            <Link href="/sla" className="agi-fl-cta agi-fl-cta--ghost">
              Service Levels
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
