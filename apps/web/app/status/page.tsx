import Link from 'next/link';

import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid } from '@/features/marketing/components/pages/surfaces/shared';
import { getCachedHealthChecks, type HealthCheckResult } from '../../lib/server/health-check';
import { getCachedSloAttainment, type SloAttainment } from '@/lib/server/slo/attainment';
import { declaredOnlySlos, formatObjective } from '@/lib/server/slo/catalogue';
import { CAPABILITY_DEGRADATION } from '@/lib/server/slo/degradation';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';
import { BYOK_SURFACES } from '@/lib/marketing-constants';
import { statusMirrorUrl } from '@/lib/server/incident/out-of-band';
import {
  formatAge,
  STALE_AFTER_SECONDS,
  viewSignal,
  type CheckKey,
  type HealthSignal,
  type SignalState,
  type SignalView,
} from './signal-view';

export const metadata = buildMetadata({
  title: 'Status: hosted dependency and route checks',
  description: `Dependency and route-readiness checks for AGI's hosted services. A result is reused for up to ${RENDER_CACHE_SECONDS.liveSignal} seconds, shown with its age, and marked stale past ${STALE_AFTER_SECONDS} seconds. A passing check does not verify a model response.`,
  path: '/status',
});

export const dynamic = 'force-dynamic';

const HEALTH_LABEL: Record<SignalState, string> = {
  healthy: 'Checks passing',
  degraded: 'Some checks failing',
  unhealthy: 'Core check failing',
  stale: 'Stale result',
  unknown: 'Checks unavailable',
};

const HEALTH_NOTE: Record<SignalState, string> = {
  healthy:
    'Every listed check passed on the most recent run. Model inference and a user chat turn were not tested.',
  degraded:
    'Core checks passed, but at least one capability or dependency did not. The summary and the rows above name which one.',
  unhealthy:
    'A core check failed on the most recent run. Hosted service availability may be affected.',
  stale:
    'The result above comes from an earlier run, so it may not describe the service now. Reading this page asks for a new run in the background: reload after a few seconds to read its result. If the time of the last check has not moved after a reload, the new run has not completed.',
  unknown:
    'We could not complete the most recent health check. If you are seeing errors, email us.',
};

const COMPONENT_LABEL: Record<'healthy' | 'unhealthy', string> = {
  healthy: 'Passing',
  unhealthy: 'Failing',
};

const HEALTH_READ_TIMEOUT_MS = 4_000;

const NO_SIGNAL: HealthSignal = { state: 'unknown', checkedAt: null, checks: null };

async function fetchHealth(): Promise<HealthSignal> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), HEALTH_READ_TIMEOUT_MS);
    });
    const result = await Promise.race([getCachedHealthChecks(), timeout]);
    if (!result) {
      return NO_SIGNAL;
    }
    return { state: result.status, checkedAt: result.timestamp, checks: result.checks };
  } catch {
    return NO_SIGNAL;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
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

interface CoveredCheck {
  key: CheckKey;
  label: string;
  what: string;
}

function componentState(check: HealthCheckResult['checks'][CheckKey]): string {
  const reason = 'message' in check && check.message ? ` (${check.message})` : '';
  return `${COMPONENT_LABEL[check.status]}${reason}`;
}

const COVERED: CoveredCheck[] = [
  {
    key: 'environment',
    label: 'Configuration',
    what: 'Core service configuration is present in the serving environment.',
  },
  {
    key: 'database',
    label: 'Postgres',
    what: 'A query is executed against the primary database and returns. The answer is reused for up to a minute. The first read after that starts another query and is itself answered with the older one, so this row is as old as the last successful check stated at the top of this page.',
  },
  {
    key: 'cache',
    label: 'Cache store',
    what: 'One read of a fixed key against the key-value store returns within a second. Rate limiting and cached reads fail closed without that store, so this counts as a core check. It does not exercise the rate limiter, and where no store is configured there is nothing to read, so the row passes and says not configured.',
  },
  {
    key: 'stripe',
    label: 'Payments',
    what: 'A read call to the payments API returns and every plan price on sale is active. A failure here means some or all purchases may fail; existing plans keep working and chat is unaffected.',
  },
  {
    key: 'chat',
    label: 'Chat routing',
    what: 'The default managed chat route resolves to a live model, at least one provider behind it is configured, and the router has not marked every one of them degraded. It does not send a message through the model.',
  },
  {
    key: 'work',
    label: 'Work',
    what: 'The background job queues are draining: nothing has waited past the critical threshold and no worker lease has lapsed in bulk. This is the queue itself, not any one task.',
  },
  {
    key: 'voice',
    label: 'Voice routing',
    what: 'The default managed voice route resolves to a live model with a configured, non-degraded provider behind it. It does not open a voice session.',
  },
  {
    key: 'search',
    label: 'Search',
    what: 'The retrieval index the search over your own content reads is present in the database. It runs after the Postgres probe in the same run, so it is exactly as old as that row, and it never runs a query on your behalf.',
  },
  {
    key: 'vector',
    label: 'Semantic search',
    what: 'The vector extension and the embedding index that semantic search over your own content reads are present in the database. The same catalogue query as the Search row answers it, and it never runs a query on your behalf.',
  },
];

function checkedLine(view: SignalView<CoveredCheck>): string {
  if (view.checkedAtMs === null || view.ageSeconds === null) {
    return 'Last successful check: Not completed';
  }
  return `Last successful check: ${new Date(view.checkedAtMs).toUTCString()} (${formatAge(view.ageSeconds)})`;
}

function failingLine(view: SignalView<CoveredCheck>): string {
  if (view.state === 'unknown') {
    return 'No result to show.';
  }
  const names = view.failing.length > 0 ? view.failing.join(', ') : 'none';
  return view.state === 'stale' ? `Failing in that run: ${names}.` : `Failing: ${names}.`;
}

const CHECK_NAMES = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(
  COVERED.map((row) => row.label),
);

function scopeLine(view: SignalView<CoveredCheck>): string {
  if (view.rows.length > 0) {
    return 'Each row in the list at the top of this page states what it actually proves, which is narrower than its name.';
  }
  return `They are ${CHECK_NAMES}. No result is available on this load, so the list that states what each one proves is not shown. Each proves less than its name suggests.`;
}

const NOT_COVERED = [
  'A completed model response or answer quality',
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
  const view = viewSignal(health, Date.now(), COVERED);

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section id="signal" labelledBy="agi-status-title" size="xs">
          <Stack gap="loose">
            <Stack gap="tight">
              <div>
                <Eyebrow>Status</Eyebrow>
                <h1 className="agi-ds-h2" id="agi-status-title">
                  Service status
                </h1>
              </div>
              <Prose size="sm">
                Hosted checks only. Local and BYOK work runs on your device and does not depend on
                our servers.
              </Prose>
            </Stack>
            <section aria-label="Current status" className="agi-ds-full">
              <Stack gap="tight">
                <h2 className="agi-ds-h3">{HEALTH_LABEL[view.state]}</h2>
                <div>
                  {view.state === 'stale' && view.reported ? (
                    <Prose tone="ink">
                      This result is more than {STALE_AFTER_SECONDS} seconds old. That run reported:{' '}
                      {HEALTH_LABEL[view.reported]}.
                    </Prose>
                  ) : null}
                  <Prose tone="ink">{checkedLine(view)}</Prose>
                  <Prose>
                    {COVERED.length} hosted checks. {failingLine(view)}
                  </Prose>
                  <Prose size="sm">
                    Seeing a fault this page does not show?{' '}
                    <Link href={contactMailto()} className="agi-ds-link">
                      Report a problem
                    </Link>
                    .
                  </Prose>
                </div>
              </Stack>
            </section>
            {view.rows.length > 0 ? (
              <Ledger
                caption="Live signal"
                rows={view.rows.map(({ row, check }) => ({
                  label: row.label,
                  value: (
                    <>
                      <strong>{componentState(check)}</strong>
                      <br />
                      {row.what}
                    </>
                  ),
                }))}
              />
            ) : null}
          </Stack>
        </Section>

        <Section id="method" labelledBy="agi-status-method-title" rule>
          <h2 className="agi-ds-h2" id="agi-status-method-title">
            How these checks work.
          </h2>
          <Prose>{HEALTH_NOTE[view.state]}</Prose>
          <Prose>
            A result is reused for up to {RENDER_CACHE_SECONDS.liveSignal} seconds and shared by
            everyone who loads this page inside that window. The next read after the window starts a
            new run in the background and is itself answered with the older result, so the first
            visit after a quiet period shows an earlier run. Every result is shown with its age, and
            it is marked stale once it is more than {STALE_AFTER_SECONDS} seconds old.
          </Prose>
          <Prose>
            The checked time is the moment the run actually happened, not the moment you asked. The
            page calls the health checks directly, in-process, rather than making an HTTP request to
            our own health endpoint. Building a request URL out of inbound headers is a server-side
            request forgery vector, so a status page that self-fetches is a status page with a
            security bug.
          </Prose>
          <Prose>
            Sharing one run across visitors also keeps a traffic spike on this page from becoming
            load on the very dependencies it is reporting on. Same checks the monitored endpoint
            runs. Not a hand-edited badge. A passing result does not verify that a model returns a
            usable answer.
          </Prose>
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
                A passing result is worth exactly {COVERED.length} checks. {scopeLine(view)} Reading
                them as whole-platform coverage would be reading them wrong.
              </Prose>
            </div>
            <Ledger
              caption="Scope of the check"
              rows={[
                {
                  label: 'Model routes',
                  value:
                    'The router tracks each model route separately and fails away from one that starts erroring, and operators read that per route behind their own sign-in. It is not published here, because the reading names which provider is failing and that is a third party outage to report, not ours. The Chat routing check is the public half of it: a provider fault fails that check only once every configured provider behind the default route is degraded.',
                },
                {
                  label: 'Not covered',
                  value: `${NOT_COVERED.join(' · ')}. A passing result says nothing about any of these. If one of them is failing for you, the report channel below is the fastest path.`,
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
                produce. Work that has been accepted is held. A live action that cannot be held is
                refused at the door rather than queued against a page that has moved on, and a
                durable run that needs a device that is not online waits for it instead of failing.
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
                  body: `BYOK requests from the CLI travel directly to the provider you chose. ${BYOK_SURFACES.availability} Desktop does not accept provider keys. If a model misbehaves, the provider’s own status page is the source of truth.`,
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
                    'Hosted platform cannot serve, or a confirmed unauthorised access to customer data. We start work immediately on discovery. The signal above shows the failing checks while we work; this page carries no written incident posts.',
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
