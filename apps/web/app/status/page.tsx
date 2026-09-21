import Link from 'next/link';

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
import { getCachedSloAttainment, type SloAttainment } from '@/lib/server/slo/attainment';
import { declaredOnlySlos, formatObjective } from '@/lib/server/slo/catalogue';
import { CAPABILITY_DEGRADATION } from '@/lib/server/slo/degradation';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';
import { statusMirrorUrl } from '@/lib/server/incident/out-of-band';

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
    'Core serving passed, but at least one capability or dependency below did not. Read the rows: they name which one.',
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

const ATTAINMENT_PERCENT = 100;
const ATTAINMENT_DECIMALS = 2;
const BUDGET_DECIMALS = 0;

async function fetchAttainment(): Promise<SloAttainment[] | null> {
  try {
    return await getCachedSloAttainment();
  } catch {
    return null;
  }
}

function attainmentValue(measured: SloAttainment): string {
  const objective = `objective ${formatObjective(measured.objective)}`;
  if (measured.attainment === null) {
    return `No samples in the last ${measured.windowDays} days · ${objective}`;
  }
  const attained = (measured.attainment * ATTAINMENT_PERCENT).toFixed(ATTAINMENT_DECIMALS);
  const budget =
    measured.errorBudgetRemaining === null
      ? 'no budget to spend'
      : `${(measured.errorBudgetRemaining * ATTAINMENT_PERCENT).toFixed(BUDGET_DECIMALS)}% of the error budget left`;
  const latency =
    measured.latencyP95Ms === null ? '' : ` · 95th percentile ${measured.latencyP95Ms}ms`;
  return `${attained}% of ${measured.samples.toLocaleString('en-GB')} events over ${measured.windowDays} days · ${objective} · ${budget}${latency}`;
}

type CoveredKey = keyof HealthCheckResult['checks'];

function componentValue(
  check: HealthCheckResult['checks'][CoveredKey],
  checkedLabel: string,
): string {
  const reason = 'message' in check && check.message ? ` (${check.message})` : '';
  return `${COMPONENT_LABEL[check.status]}${reason} · checked ${checkedLabel}`;
}

const COVERED: { key: CoveredKey; label: string; what: string }[] = [
  {
    key: 'environment',
    label: 'Configuration',
    what: 'Core service configuration is present in the serving environment.',
  },
  {
    key: 'database',
    label: 'Postgres',
    what: 'A query is executed against the primary database and returns. The answer is reused for up to a minute before another query runs, so this row can be that far behind the database itself.',
  },
  {
    key: 'stripe',
    label: 'Payments',
    what: 'A read call to the payments API returns. A failure here degrades billing only: chat is unaffected, so it does not report a platform outage.',
  },
  {
    key: 'chat',
    label: 'Chat',
    what: 'The default managed chat route resolves to a live model, at least one provider behind it is configured, and the router has not marked every one of them degraded. It does not send a message through the model.',
  },
  {
    key: 'work',
    label: 'Work',
    what: 'The background job queues are draining: nothing has waited past the critical threshold and no worker lease has lapsed in bulk. This is the queue itself, not any one task.',
  },
  {
    key: 'voice',
    label: 'Voice',
    what: 'The default managed voice route resolves to a live model with a configured, non-degraded provider behind it. It does not open a voice session.',
  },
  {
    key: 'search',
    label: 'Search',
    what: 'The retrieval index the search over your own content reads is present in the database. It runs beside the Postgres probe and is reused for the same minute, and it never runs a query on your behalf.',
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
  const mirrorUrl = statusMirrorUrl();
  const health = await fetchHealth();
  const attainment = await fetchAttainment();
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
          lede="A real health check against the hosted services at most once a minute, with the time it ran and what it does not cover. Local and BYOK work runs on your device and never depends on our servers."
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
                      value: componentValue(checks[component.key], checkedLabel),
                    }))
                  : []),
              ]}
            />
            <Prose size="sm">{HEALTH_NOTE[health.state]}</Prose>
          </Stack>
        </Section>

        <Section id="independent" labelledBy="agi-status-independent-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-status-independent-title">
                Where to read this when this page is down.
              </h2>
              <Prose>
                This page is served by the same deployment it reports on, so an outage broad enough
                to take the application down takes this page with it. Two fallbacks exist for that
                case, and both are last resorts rather than a second live feed. When an incident
                alert reaches nobody by email, pager or our own channel, it is retried on a
                transport that shares no vendor with our email, and the incident headline is written
                to an origin we do not serve. Neither runs while things are healthy, so the mirror
                carries the last incident rather than the current state, and both are silent unless
                configured in the serving environment.
              </Prose>
            </div>
            <Ledger
              caption="Independent of this deployment"
              rows={[
                {
                  label: 'Status mirror',
                  value:
                    mirrorUrl ?? 'Not configured. This page is the only place status is published.',
                  quiet: mirrorUrl === undefined,
                },
                {
                  label: 'If neither answers',
                  value: `Write to ${CONTACT_EMAIL}. A reply may be delayed while the incident is open, but the mailbox is not hosted by this deployment.`,
                },
              ]}
            />
            {mirrorUrl ? (
              <Prose size="sm">
                <Link href={mirrorUrl} className="agi-ds-link">
                  Open the status mirror
                </Link>
              </Prose>
            ) : null}
          </Stack>
        </Section>

        <Section id="scope" labelledBy="agi-status-scope-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-status-scope-title">
                What this signal proves, and what it does not.
              </h2>
              <Prose>
                A green row here is worth exactly {COVERED.length} checks, so here they are. Each
                one states what it actually proves, which is narrower than the name above it.
                Reading them as whole-platform coverage would be reading them wrong.
              </Prose>
            </div>
            <Ledger
              caption="Scope of the check"
              rows={[
                ...COVERED.map((component) => ({ label: component.label, value: component.what })),
                {
                  label: 'Model routes',
                  value:
                    'The router tracks each model route separately and fails away from one that starts erroring, and operators read that per route behind their own sign-in. It is not published here, because the reading names which provider is failing and that is a third party outage to report, not ours. The Chat row above is the public half of it: it goes amber only once every provider behind the default route is degraded.',
                },
                {
                  label: 'Not covered',
                  value: `${NOT_COVERED.join(' · ')}. A green signal above says nothing about any of these. If one of them is failing for you, the report channel below is the fastest path.`,
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="service-levels" labelledBy="agi-status-slo-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-status-slo-title">
                Service levels, measured rather than declared.
              </h2>
              <Prose>
                Each row is computed from production rows over a rolling window, not from a
                hand-kept spreadsheet, and the objectives it is measured against are on{' '}
                <Link href="/sla" className="agi-ds-link">
                  /sla
                </Link>
                . When a domain burns its error budget fast enough to empty the month inside two
                days, the same numbers page whoever is on call. A window with no events says so
                rather than reporting a perfect score over nothing.
              </Prose>
            </div>
            <Ledger
              caption="Measured service levels"
              rows={
                attainment === null
                  ? [
                      {
                        label: 'Attainment',
                        value:
                          'The attainment query did not return. That is a fault in this page, not a statement about the platform.',
                        quiet: true,
                      },
                    ]
                  : attainment.map((measured) => ({
                      label: measured.domain,
                      value: attainmentValue(measured),
                    }))
              }
            />
            <Ledger
              caption="Domains with no instrument"
              rows={declaredOnlySlos().map((slo) => ({
                label: slo.domain,
                value: `Not measured. ${slo.missingInstrument ?? ''}`,
                quiet: true,
              }))}
            />
          </Stack>
        </Section>

        <Section id="degraded-modes" labelledBy="agi-status-degraded-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-status-degraded-title">
                What each capability does when its dependency is gone.
              </h2>
              <Prose>
                Degrading is a decision made in advance, not whatever the last error path happens to
                produce. Work that has been accepted is held; work that cannot be held is refused at
                the door rather than queued against a page or a device that has moved on.
              </Prose>
            </div>
            <Ledger
              caption="Degraded modes"
              rows={CAPABILITY_DEGRADATION.map((entry) => ({
                label: entry.capability,
                value: `Without ${entry.dependency}: ${entry.behaviour}`,
              }))}
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
                  body: 'CLI Local sessions run on your own hardware through Ollama or LM Studio. They keep working during a hosted incident, including a full outage.',
                },
                {
                  meta: 'BYOK',
                  title: 'Traffic goes straight to your provider.',
                  body: 'BYOK requests from the released CLI travel directly to the provider you chose. VS Code support is coming soon; Desktop does not accept provider keys. If a model misbehaves, the provider’s own status page is the source of truth.',
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
                Release notes live in the changelog. Email an incident report with what you saw and
                when; the support page states the available channels and response commitments.
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
