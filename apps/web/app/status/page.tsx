import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import {
  FactGrid,
  FactLine,
  PageHero,
} from '@/features/marketing/components/pages/surfaces/shared';
import { getCachedHealthChecks, type HealthCheckResult } from '../../lib/server/health-check';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';
import { contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Status: a live, honestly scoped health signal',
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

const HERO_FACT_LABEL = {
  platform: 'Hosted platform',
  checked: 'Checked',
  scope: 'Checks in scope',
} as const;

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
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-status-title"
          eyebrow="Status"
          title="One signal, honestly checked."
          lede="No wall of evergreen badges. This page runs a real health check against AGI's hosted services at most once a minute, shows you when that check ran, and tells you exactly what it does not cover. Most of AGI does not depend on our servers at all: Local and BYOK work runs on your device."
          ctas={[]}
        />

        <FactLine
          facts={[
            `${HERO_FACT_LABEL.platform}: ${HEALTH_LABEL[health.state]}`,
            `${HERO_FACT_LABEL.checked}: ${checkedLabel}`,
            `${HERO_FACT_LABEL.scope}: ${COVERED.length}`,
          ]}
        />

        <Section id="signal" labelledBy="agi-status-signal-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-status-signal-title">
                Re-checked every {RENDER_CACHE_SECONDS.liveSignal} seconds.
              </h2>
              <Prose>
                The result below comes from a real run of the checks, shared by everyone who loads
                this page inside the same window: the checked time is the moment it actually ran,
                not the moment you asked. It calls the health checks directly, in-process, rather
                than making an HTTP request to our own health endpoint. Building a request URL out
                of inbound headers is a server-side request forgery vector, so a status page that
                self-fetches is a status page with a security bug. Running them once per window
                rather than once per visitor also keeps a traffic spike on this page from becoming
                load on the very dependencies it is reporting on. Same checks the monitored endpoint
                runs. Not a hand-edited badge.
              </Prose>
            </div>
            <Ledger
              caption="Live signal"
              rows={[
                {
                  label: 'Hosted platform',
                  value: `${HEALTH_LABEL[health.state]} · checked ${checkedLabel}`,
                },
                ...(checks
                  ? COVERED.map((component) => ({
                      label: component.label,
                      value: `${COMPONENT_LABEL[checks[component.key].status]} · checked ${checkedLabel}`,
                    }))
                  : []),
              ]}
            />
            <Prose size="sm">{HEALTH_NOTE[health.state]}</Prose>
          </Stack>
        </Section>

        <Section id="scope" labelledBy="agi-status-scope-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-status-scope-title">
                What this signal proves, and what it does not.
              </h2>
              <Prose>
                A green row here is worth exactly three checks, so here they are. Reading it as
                whole-platform coverage would be reading it wrong.
              </Prose>
            </div>
            <Ledger
              caption="Scope of the check"
              rows={[
                ...COVERED.map((component) => ({ label: component.label, value: component.what })),
                {
                  label: 'Not covered',
                  value: `${NOT_COVERED.join(' · ')}. A green signal above says nothing about any of these. If one of them is failing for you, the report channel below is the fastest path.`,
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="boundaries" labelledBy="agi-status-boundaries-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-status-boundaries-title">
                Most of AGI runs without our servers.
              </h2>
              <Prose>
                The three trust modes have different failure domains. An incident on our side does
                not touch work that never leaves your device.
              </Prose>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Local',
                  title: 'No dependency on AGI’s servers.',
                  body: 'Local chats, files, and sessions run on your own hardware through Ollama or LM Studio. They keep working during any hosted incident, including a full outage.',
                },
                {
                  meta: 'BYOK',
                  title: 'Traffic goes straight to your provider.',
                  body: 'BYOK requests on Desktop, CLI, and VS Code travel directly from the local runtime to the provider you chose. If a model misbehaves, the provider’s own status page is the source of truth.',
                },
                {
                  meta: 'AGI Cloud',
                  title: 'Public alpha, open by default.',
                  body: 'Managed compute is in public alpha: signed-in users can use it now, with metered usage and visible provider labels. This is the only mode the signal above describes.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="incidents" labelledBy="agi-status-incidents-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-status-incidents-title">
                How we handle an incident, and what we owe you.
              </h2>
              <Prose>
                We have not published an incident archive or postmortems. Rather than leave that as
                an implied &ldquo;no incidents ever&rdquo;, here is the process and the commitment,
                so you can hold us to it.
              </Prose>
            </div>
            <Ledger
              caption="Incident process"
              rows={[
                {
                  label: 'Severity 1',
                  value:
                    'Hosted platform cannot serve, or a confirmed unauthorised access to customer data. We start work immediately on discovery and post here once we can describe the impact accurately.',
                },
                {
                  label: 'Severity 2',
                  value:
                    'A major capability is unavailable or badly degraded for many users (for example managed chat, sign-in, or file upload) while the rest of the platform serves.',
                },
                {
                  label: 'Severity 3',
                  value:
                    'Degraded or partial function with a workaround, or an issue affecting a narrow set of users.',
                },
                {
                  label: 'Notification',
                  value:
                    'For a confirmed security incident involving customer personal data, we will notify affected account holders by email at the address on the account, and will do so without undue delay once we have confirmed scope. Where a data protection regulator requires notification, we will meet that obligation.',
                },
                {
                  label: 'On-call',
                  value:
                    'There is no 24/7 rotation. Response is best-effort during working hours. This is stated plainly because assuming otherwise would be the dangerous reading.',
                },
                {
                  label: 'Security reports',
                  value:
                    'A suspected vulnerability is not a status incident: it goes through coordinated disclosure, including our scope and safe-harbour terms, on /security.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="report" labelledBy="agi-status-report-title" rule>
          <Stack>
            <div>
              <h2 className="agi-ds-h2" id="agi-status-report-title">
                Something looks wrong?
              </h2>
              <Prose>
                Release notes live in the changelog, and a human reads every incident report. Tell
                us what you saw and when. We would rather hear it twice than not at all.
              </Prose>
            </div>
            <ButtonRow>
              <Button href={contactMailto()}>Email an incident report</Button>
              <Button href="/security" variant="secondary">
                Security details
              </Button>
              <Button href="/changelog" variant="secondary">
                Read the changelog
              </Button>
              <Button href="/sla" variant="secondary">
                Service levels
              </Button>
              <Button href="/support" variant="secondary">
                Get support
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
