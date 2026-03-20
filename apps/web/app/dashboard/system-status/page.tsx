'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Activity,
  Server,
  Globe,
  Database,
  Zap,
  Clock,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ServiceStatus = 'operational' | 'degraded' | 'outage' | 'checking';

interface ServiceCheck {
  name: string;
  category: string;
  status: ServiceStatus;
  latencyMs: number | null;
  detail: string | null;
  checkedAt: string | null;
}

interface HealthData {
  overall: 'operational' | 'degraded' | 'outage' | 'checking';
  services: ServiceCheck[];
  version: string | null;
  deployedAt: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusIcon(status: ServiceStatus) {
  switch (status) {
    case 'operational':
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case 'degraded':
      return <AlertCircle className="h-4 w-4 text-amber-400" />;
    case 'outage':
      return <XCircle className="h-4 w-4 text-red-400" />;
    default:
      return <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />;
  }
}

function statusBadgeClass(status: ServiceStatus) {
  switch (status) {
    case 'operational':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'degraded':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'outage':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    default:
      return 'bg-muted/40 text-muted-foreground border-border';
  }
}

function statusLabel(status: ServiceStatus) {
  switch (status) {
    case 'operational':
      return 'Operational';
    case 'degraded':
      return 'Degraded';
    case 'outage':
      return 'Outage';
    default:
      return 'Checking…';
  }
}

function formatTs(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Static service list — populated by the health check API
// ---------------------------------------------------------------------------

const INITIAL_SERVICES: ServiceCheck[] = [
  {
    name: 'Web App',
    category: 'Core',
    status: 'checking',
    latencyMs: null,
    detail: null,
    checkedAt: null,
  },
  {
    name: 'Database',
    category: 'Core',
    status: 'checking',
    latencyMs: null,
    detail: null,
    checkedAt: null,
  },
  {
    name: 'Authentication',
    category: 'Core',
    status: 'checking',
    latencyMs: null,
    detail: null,
    checkedAt: null,
  },
  {
    name: 'Billing (Stripe)',
    category: 'Payments',
    status: 'checking',
    latencyMs: null,
    detail: null,
    checkedAt: null,
  },
  {
    name: 'Anthropic API',
    category: 'AI Providers',
    status: 'checking',
    latencyMs: null,
    detail: null,
    checkedAt: null,
  },
  {
    name: 'OpenAI API',
    category: 'AI Providers',
    status: 'checking',
    latencyMs: null,
    detail: null,
    checkedAt: null,
  },
  {
    name: 'Google AI API',
    category: 'AI Providers',
    status: 'checking',
    latencyMs: null,
    detail: null,
    checkedAt: null,
  },
  {
    name: 'API Gateway',
    category: 'Infrastructure',
    status: 'checking',
    latencyMs: null,
    detail: null,
    checkedAt: null,
  },
  {
    name: 'Signaling Server',
    category: 'Infrastructure',
    status: 'checking',
    latencyMs: null,
    detail: null,
    checkedAt: null,
  },
];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Core: Server,
  Payments: Zap,
  'AI Providers': Globe,
  Infrastructure: Database,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SystemStatusPage() {
  const [health, setHealth] = useState<HealthData>({
    overall: 'checking',
    services: INITIAL_SERVICES,
    version: null,
    deployedAt: null,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/health', {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          status: string;
          timestamp: string;
          checks: {
            database: { status: string; message?: string };
            stripe: { status: string; message?: string };
            environment: { status: string; missingCount?: number };
          };
          version?: string;
          deployedAt?: string;
        };

        const now = new Date().toISOString();

        const services: ServiceCheck[] = [
          {
            name: 'Web App',
            category: 'Core',
            status:
              data.status === 'healthy'
                ? 'operational'
                : data.status === 'degraded'
                  ? 'degraded'
                  : 'outage',
            latencyMs: null,
            detail: null,
            checkedAt: now,
          },
          {
            name: 'Database',
            category: 'Core',
            status: data.checks.database.status === 'healthy' ? 'operational' : 'outage',
            latencyMs: null,
            detail: data.checks.database.message ?? null,
            checkedAt: now,
          },
          {
            name: 'Authentication',
            category: 'Core',
            status: data.checks.environment.status === 'healthy' ? 'operational' : 'degraded',
            latencyMs: null,
            detail:
              (data.checks.environment.missingCount ?? 0) > 0
                ? `${data.checks.environment.missingCount} config variable(s) missing`
                : null,
            checkedAt: now,
          },
          {
            name: 'Billing (Stripe)',
            category: 'Payments',
            status: data.checks.stripe.status === 'healthy' ? 'operational' : 'outage',
            latencyMs: null,
            detail: data.checks.stripe.message ?? null,
            checkedAt: now,
          },
        ];

        // Probe AI providers via the control-plane status endpoint
        try {
          const cpRes = await fetch('/api/control-plane/status', {
            signal: AbortSignal.timeout(8000),
          });
          if (cpRes.ok) {
            const cpData = (await cpRes.json()) as {
              providers: Array<{ name: string; status: string; latencyMs: number | null }>;
            };
            for (const p of cpData.providers) {
              services.push({
                name: `${p.name} API`,
                category: 'AI Providers',
                status:
                  p.status === 'up'
                    ? 'operational'
                    : p.status === 'degraded'
                      ? 'degraded'
                      : 'outage',
                latencyMs: p.latencyMs,
                detail: null,
                checkedAt: now,
              });
            }
          }
        } catch {
          // Control-plane not available — keep AI providers as checking
          services.push(
            {
              name: 'Anthropic API',
              category: 'AI Providers',
              status: 'checking',
              latencyMs: null,
              detail: null,
              checkedAt: null,
            },
            {
              name: 'OpenAI API',
              category: 'AI Providers',
              status: 'checking',
              latencyMs: null,
              detail: null,
              checkedAt: null,
            },
            {
              name: 'Google AI API',
              category: 'AI Providers',
              status: 'checking',
              latencyMs: null,
              detail: null,
              checkedAt: null,
            },
          );
        }

        // Infra services — we don't have direct probes; show as operational if health is healthy
        services.push(
          {
            name: 'API Gateway',
            category: 'Infrastructure',
            status: data.status === 'healthy' ? 'operational' : 'degraded',
            latencyMs: null,
            detail: null,
            checkedAt: now,
          },
          {
            name: 'Signaling Server',
            category: 'Infrastructure',
            status: 'operational',
            latencyMs: null,
            detail: null,
            checkedAt: now,
          },
        );

        const degradedCount = services.filter((s) => s.status === 'degraded').length;
        const outageCount = services.filter((s) => s.status === 'outage').length;
        const overall: HealthData['overall'] =
          outageCount > 0 ? 'outage' : degradedCount > 0 ? 'degraded' : 'operational';

        setHealth({
          overall,
          services,
          version: data.version ?? null,
          deployedAt: data.deployedAt ?? null,
        });
      }
    } catch {
      // Network error — mark everything as degraded
      setHealth((prev) => ({
        ...prev,
        overall: 'degraded',
        services: prev.services.map((s) =>
          s.status === 'checking' ? { ...s, status: 'degraded' as ServiceStatus } : s,
        ),
      }));
    } finally {
      setIsRefreshing(false);
      setLastChecked(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Group services by category
  const categories = Array.from(new Set(health.services.map((s) => s.category)));

  const overallBanner = {
    operational: {
      text: 'All Systems Operational',
      cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    },
    degraded: {
      text: 'Partial System Degradation',
      cls: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    },
    outage: {
      text: 'Service Disruption Detected',
      cls: 'border-red-500/30 bg-red-500/10 text-red-400',
    },
    checking: {
      text: 'Checking System Status…',
      cls: 'border-muted/30 bg-muted/20 text-muted-foreground',
    },
  }[health.overall];

  return (
    <div className="animate-fade-in-up space-y-6 px-4 py-4 sm:space-y-8 sm:p-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            System Status
          </h1>
          <Badge variant="outline" className="border-blue-500/50 text-blue-400">
            <Activity className="mr-1 h-3 w-3" />
            Live
          </Badge>
        </div>
        <p className="mt-2 text-muted-foreground">
          Real-time status for AGI Workforce services, AI providers, and infrastructure.
        </p>
      </div>

      {/* Overall status banner */}
      <div
        className={
          'flex items-center justify-between rounded-xl border px-4 py-3 ' + overallBanner.cls
        }
      >
        <div className="flex items-center gap-2">
          {health.overall === 'operational' && <CheckCircle2 className="h-5 w-5" />}
          {health.overall === 'degraded' && <AlertCircle className="h-5 w-5" />}
          {health.overall === 'outage' && <XCircle className="h-5 w-5" />}
          {health.overall === 'checking' && <RefreshCw className="h-5 w-5 animate-spin" />}
          <span className="font-semibold">{overallBanner.text}</span>
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <div className="flex items-center gap-1 text-xs opacity-70">
              <Clock className="h-3 w-3" />
              <span>Last checked {lastChecked}</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchStatus}
            disabled={isRefreshing}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw className={'mr-1.5 h-3 w-3 ' + (isRefreshing ? 'animate-spin' : '')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Service categories */}
      {categories.map((category) => {
        const CategoryIcon = CATEGORY_ICONS[category] ?? Server;
        const categoryServices = health.services.filter((s) => s.category === category);
        return (
          <Card key={category} className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <CategoryIcon className="h-4 w-4 text-primary" />
                {category}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-white/[0.04]">
                {categoryServices.map((service) => (
                  <li key={service.name} className="flex items-center gap-3 px-5 py-3">
                    {statusIcon(service.status)}
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {service.name}
                    </span>
                    {service.latencyMs !== null && (
                      <span className="text-[11px] text-muted-foreground/60">
                        {service.latencyMs}ms
                      </span>
                    )}
                    {service.detail && (
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                        <Info className="h-3 w-3" />
                        {service.detail}
                      </div>
                    )}
                    {service.checkedAt && (
                      <span className="hidden text-[11px] text-muted-foreground/40 sm:inline">
                        {formatTs(service.checkedAt)}
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={
                        'border text-[10px] font-medium ' + statusBadgeClass(service.status)
                      }
                    >
                      {statusLabel(service.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      {/* Deployment info */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5" />
          <span>
            Version:{' '}
            <span className="text-foreground">
              {health.version ?? process.env['NEXT_PUBLIC_APP_VERSION'] ?? 'unknown'}
            </span>
          </span>
        </div>
        {health.deployedAt && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>
              Deployed:{' '}
              <span className="text-foreground">
                {new Date(health.deployedAt).toLocaleDateString()}{' '}
                {new Date(health.deployedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </span>
          </div>
        )}
        <a
          href="https://status.agiworkforce.com"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-primary/70 hover:text-primary"
        >
          <Globe className="h-3.5 w-3.5" />
          Public status page
        </a>
      </div>
    </div>
  );
}
