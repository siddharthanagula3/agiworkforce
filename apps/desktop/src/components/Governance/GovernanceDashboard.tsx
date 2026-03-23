import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Scale,
  Shield,
  ShieldCheck,
} from 'lucide-react';

import { cn } from '../../lib/utils';
import { useGovernanceStore } from '../../stores/governanceStore';
import { AuditEventsList } from './AuditEventsList';
import { AuditLog } from './AuditLog';
import { PendingApprovals } from './PendingApprovals';
import { SafetyPolicies } from './SafetyPolicies';
import { ToolHistoryTable } from './ToolHistoryTable';
import { Button } from '../ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';

type GovernanceTab = 'overview' | 'approvals' | 'audit' | 'policies' | 'history';

interface SummaryCard {
  title: string;
  value: string;
  detail: string;
  tone: 'default' | 'success' | 'warning' | 'danger';
  icon: React.ElementType;
}

interface AlertItem {
  title: string;
  detail: string;
  tone: 'warning' | 'danger' | 'success';
  tab: GovernanceTab;
}

const CARD_TONE_STYLES: Record<SummaryCard['tone'], string> = {
  default: 'border-white/10 bg-white/[0.03] text-zinc-100',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  danger: 'border-red-500/30 bg-red-500/10 text-red-100',
};

const ALERT_TONE_STYLES: Record<AlertItem['tone'], string> = {
  success: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-100',
  warning: 'border-amber-500/25 bg-amber-500/8 text-amber-100',
  danger: 'border-red-500/25 bg-red-500/8 text-red-100',
};

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatTimeRemaining(timestamp: number, now: number): string {
  const diffMs = timestamp - now;
  if (diffMs <= 0) return 'Expired';

  const diffMinutes = Math.round(diffMs / (60 * 1000));
  if (diffMinutes < 60) return `${diffMinutes}m remaining`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h remaining`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d remaining`;
}

function getTabCountLabel(tab: GovernanceTab, pendingCount: number, auditCount: number): string {
  switch (tab) {
    case 'approvals':
      return pendingCount > 0 ? String(pendingCount) : '';
    case 'audit':
      return auditCount > 0 ? String(auditCount) : '';
    default:
      return '';
  }
}

export const GovernanceDashboard: React.FC = () => {
  const {
    auditEvents,
    approvalRequests,
    approvalStatistics,
    auditIntegrityReport,
    isLoadingAudit,
    isLoadingApprovals,
    auditError,
    approvalError,
    fetchAuditEvents,
    verifyAuditIntegrity,
    fetchPendingApprovals,
    fetchApprovalStatistics,
    expireTimedOutRequests,
  } = useGovernanceStore(
    useShallow((state) => ({
      auditEvents: state.auditEvents,
      approvalRequests: state.approvalRequests,
      approvalStatistics: state.approvalStatistics,
      auditIntegrityReport: state.auditIntegrityReport,
      isLoadingAudit: state.isLoadingAudit,
      isLoadingApprovals: state.isLoadingApprovals,
      auditError: state.auditError,
      approvalError: state.approvalError,
      fetchAuditEvents: state.fetchAuditEvents,
      verifyAuditIntegrity: state.verifyAuditIntegrity,
      fetchPendingApprovals: state.fetchPendingApprovals,
      fetchApprovalStatistics: state.fetchApprovalStatistics,
      expireTimedOutRequests: state.expireTimedOutRequests,
    })),
  );

  const [activeTab, setActiveTab] = useState<GovernanceTab>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRunningIntegrityCheck, setIsRunningIntegrityCheck] = useState(false);
  const [isExpiringRequests, setIsExpiringRequests] = useState(false);

  const pendingRequests = useMemo(
    () => approvalRequests.filter((request) => request.status === 'pending'),
    [approvalRequests],
  );

  const now = Date.now();
  const expiringSoonRequests = useMemo(
    () =>
      pendingRequests.filter(
        (request) => request.expires_at > now && request.expires_at <= now + 60 * 60 * 1000,
      ),
    [now, pendingRequests],
  );
  const overdueRequests = useMemo(
    () => pendingRequests.filter((request) => request.expires_at <= now),
    [now, pendingRequests],
  );
  const recentBlockedOrFailedEvents = useMemo(
    () =>
      auditEvents.filter(
        (event) =>
          (event.status === 'blocked' || event.status === 'failure') &&
          event.timestamp >= now - 24 * 60 * 60 * 1000,
      ),
    [auditEvents, now],
  );
  const recentSuccessfulEvents = useMemo(
    () =>
      auditEvents.filter(
        (event) => event.status === 'success' && event.timestamp >= now - 24 * 60 * 60 * 1000,
      ),
    [auditEvents, now],
  );
  const criticalPendingCount = pendingRequests.filter(
    (request) => request.risk_level === 'critical',
  ).length;

  const summaryCards = useMemo<SummaryCard[]>(() => {
    const totalRequests = approvalStatistics?.total_requests ?? approvalRequests.length;
    const approved = approvalStatistics?.approved ?? 0;
    const rejected = approvalStatistics?.rejected ?? 0;
    const timedOut = approvalStatistics?.timed_out ?? 0;
    const verifiedEvents = auditIntegrityReport?.verified_events ?? 0;
    const totalIntegrityEvents = auditIntegrityReport?.total_events ?? 0;

    return [
      {
        title: 'Pending approvals',
        value: String(pendingRequests.length),
        detail:
          criticalPendingCount > 0
            ? `${criticalPendingCount} critical request${criticalPendingCount === 1 ? '' : 's'}`
            : 'No critical approvals waiting',
        tone: pendingRequests.length > 0 ? 'warning' : 'success',
        icon: Clock3,
      },
      {
        title: 'Approval rate',
        value: formatPercent(approved, Math.max(totalRequests, 1)),
        detail: `${approved} approved · ${rejected} rejected · ${timedOut} timed out`,
        tone: rejected > approved && totalRequests > 0 ? 'warning' : 'default',
        icon: Scale,
      },
      {
        title: 'Audit issues (24h)',
        value: String(recentBlockedOrFailedEvents.length),
        detail: `${recentSuccessfulEvents.length} successful events in the same window`,
        tone: recentBlockedOrFailedEvents.length > 0 ? 'danger' : 'success',
        icon: AlertTriangle,
      },
      {
        title: 'Integrity coverage',
        value:
          totalIntegrityEvents > 0
            ? formatPercent(verifiedEvents, totalIntegrityEvents)
            : auditIntegrityReport
              ? '0%'
              : 'Not run',
        detail:
          auditIntegrityReport && auditIntegrityReport.tampered_events.length > 0
            ? `${auditIntegrityReport.tampered_events.length} tampered event${auditIntegrityReport.tampered_events.length === 1 ? '' : 's'}`
            : 'Run integrity verification to confirm log health',
        tone:
          auditIntegrityReport && auditIntegrityReport.tampered_events.length > 0
            ? 'danger'
            : auditIntegrityReport
              ? 'success'
              : 'default',
        icon: ShieldCheck,
      },
    ];
  }, [
    approvalRequests.length,
    approvalStatistics,
    auditIntegrityReport,
    criticalPendingCount,
    pendingRequests.length,
    recentBlockedOrFailedEvents.length,
    recentSuccessfulEvents.length,
  ]);

  const alerts = useMemo<AlertItem[]>(() => {
    const nextAlerts: AlertItem[] = [];

    if (criticalPendingCount > 0) {
      nextAlerts.push({
        title: `${criticalPendingCount} critical approval${criticalPendingCount === 1 ? '' : 's'} waiting`,
        detail: 'Review the approvals queue before high-risk actions continue.',
        tone: 'danger',
        tab: 'approvals',
      });
    }

    if (expiringSoonRequests.length > 0) {
      const soonest = [...expiringSoonRequests].sort(
        (left, right) => left.expires_at - right.expires_at,
      )[0];
      nextAlerts.push({
        title: `${expiringSoonRequests.length} approval${expiringSoonRequests.length === 1 ? '' : 's'} expiring soon`,
        detail: soonest
          ? `Earliest expiry: ${formatTimeRemaining(soonest.expires_at, now)}`
          : 'Open approvals to review time-sensitive requests.',
        tone: 'warning',
        tab: 'approvals',
      });
    }

    if (recentBlockedOrFailedEvents.length > 0) {
      nextAlerts.push({
        title: `${recentBlockedOrFailedEvents.length} blocked or failed audit event${recentBlockedOrFailedEvents.length === 1 ? '' : 's'} in 24h`,
        detail: 'Inspect recent audit events for policy gaps or execution failures.',
        tone: 'warning',
        tab: 'audit',
      });
    }

    if ((auditIntegrityReport?.tampered_events.length ?? 0) > 0) {
      nextAlerts.push({
        title: `${auditIntegrityReport?.tampered_events.length ?? 0} tampered audit event${auditIntegrityReport?.tampered_events.length === 1 ? '' : 's'} detected`,
        detail: 'Run a deeper audit review before trusting downstream compliance reports.',
        tone: 'danger',
        tab: 'audit',
      });
    }

    if (nextAlerts.length === 0) {
      nextAlerts.push({
        title: 'No urgent governance issues',
        detail: 'Approvals, audit events, and integrity checks are currently clear.',
        tone: 'success',
        tab: 'overview',
      });
    }

    return nextAlerts;
  }, [
    auditIntegrityReport,
    criticalPendingCount,
    expiringSoonRequests,
    now,
    recentBlockedOrFailedEvents.length,
  ]);

  const refreshWorkspace = useCallback(
    async (showToast = false) => {
      setIsRefreshing(true);
      try {
        await Promise.all([
          fetchAuditEvents({ limit: 100 }),
          fetchPendingApprovals(),
          fetchApprovalStatistics(),
        ]);
        const { auditError: nextAuditError, approvalError: nextApprovalError } =
          useGovernanceStore.getState();
        if (nextAuditError || nextApprovalError) {
          if (showToast) {
            toast.error(nextAuditError || nextApprovalError || 'Failed to refresh governance data');
          }
          return;
        }
        if (showToast) {
          toast.success('Governance workspace refreshed');
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [fetchApprovalStatistics, fetchAuditEvents, fetchPendingApprovals],
  );

  useEffect(() => {
    void refreshWorkspace(false);
  }, [refreshWorkspace]);

  const handleRunIntegrityCheck = useCallback(async () => {
    setIsRunningIntegrityCheck(true);
    try {
      await verifyAuditIntegrity();
      const { auditError: nextAuditError, auditIntegrityReport: nextReport } =
        useGovernanceStore.getState();
      if (nextAuditError) {
        toast.error(nextAuditError);
        return;
      }
      if ((nextReport?.tampered_events.length ?? 0) > 0) {
        toast.error('Integrity check found tampered events');
        setActiveTab('audit');
        return;
      }
      toast.success('Integrity check completed');
    } finally {
      setIsRunningIntegrityCheck(false);
    }
  }, [verifyAuditIntegrity]);

  const handleExpireTimedOutRequests = useCallback(async () => {
    setIsExpiringRequests(true);
    try {
      const expired = await expireTimedOutRequests();
      await Promise.all([fetchPendingApprovals(), fetchApprovalStatistics()]);
      if (expired > 0) {
        toast.success(`Expired ${expired} timed-out request${expired === 1 ? '' : 's'}`);
      } else {
        toast.success('No timed-out requests to expire');
      }
    } finally {
      setIsExpiringRequests(false);
    }
  }, [expireTimedOutRequests, fetchApprovalStatistics, fetchPendingApprovals]);

  const errorMessage = auditError || approvalError;
  const tabs: GovernanceTab[] = ['overview', 'approvals', 'audit', 'policies', 'history'];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[hsl(var(--card))] text-[hsl(var(--foreground))]">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-zinc-100">Governance workspace</h2>
                <p className="text-sm text-zinc-400">
                  Approvals, audit trails, integrity checks, and policy controls.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRunIntegrityCheck()}
              disabled={isRunningIntegrityCheck}
            >
              {isRunningIntegrityCheck ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Verify integrity
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleExpireTimedOutRequests()}
              disabled={isExpiringRequests}
            >
              {isExpiringRequests ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Clock3 className="h-4 w-4" />
              )}
              Expire timed-out
            </Button>
            <Button size="sm" onClick={() => void refreshWorkspace(true)} disabled={isRefreshing}>
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </div>
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as GovernanceTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-white/10 px-4 py-3">
          <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0">
            {tabs.map((tab) => {
              const countLabel = getTabCountLabel(tab, pendingRequests.length, auditEvents.length);
              const tabLabel =
                tab === 'overview'
                  ? 'Overview'
                  : tab === 'approvals'
                    ? 'Approvals'
                    : tab === 'audit'
                      ? 'Audit'
                      : tab === 'policies'
                        ? 'Policies'
                        : 'History';

              return (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="gap-2 border border-transparent bg-transparent px-3 py-1.5 text-xs text-zinc-400 data-[state=active]:border-white/10 data-[state=active]:bg-white/5 data-[state=active]:text-zinc-100 data-[state=active]:shadow-none"
                >
                  {tabLabel}
                  {countLabel && (
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                      {countLabel}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <TabsContent value="overview" className="m-0 space-y-4">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {summaryCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.title}
                    className={cn('rounded-xl border p-4 shadow-sm', CARD_TONE_STYLES[card.tone])}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                          {card.title}
                        </div>
                        <div className="mt-2 text-2xl font-semibold">{card.value}</div>
                        <p className="mt-1 text-sm text-zinc-300">{card.detail}</p>
                      </div>
                      <div className="rounded-lg bg-black/20 p-2">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Operational alerts</h3>
                  <p className="text-sm text-zinc-400">
                    Items that need review before teams rely on this workspace.
                  </p>
                </div>
                <span className="text-xs text-zinc-500">
                  {approvalStatistics?.total_requests ?? approvalRequests.length} requests tracked
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={`${alert.title}-${alert.tab}`}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3',
                      ALERT_TONE_STYLES[alert.tone],
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{alert.title}</div>
                      <p className="text-xs text-current/80">{alert.detail}</p>
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setActiveTab(alert.tab)}
                      className="shrink-0 text-current hover:bg-white/10 hover:text-current"
                    >
                      Open {alert.tab}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <FileText className="h-4 w-4 text-zinc-400" />
                Queue snapshot
              </div>
              <div className="mt-3 space-y-2 text-sm text-zinc-300">
                <div className="flex items-center justify-between gap-3">
                  <span>Pending approvals</span>
                  <span>{pendingRequests.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Expiring within 1 hour</span>
                  <span>{expiringSoonRequests.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Past expiry and not cleaned up</span>
                  <span>{overdueRequests.length}</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="approvals" className="m-0">
            <PendingApprovals requests={approvalRequests} isLoading={isLoadingApprovals} />
          </TabsContent>

          <TabsContent value="audit" className="m-0 space-y-4">
            {auditIntegrityReport && (
              <div
                className={cn(
                  'rounded-xl border px-4 py-3 text-sm',
                  auditIntegrityReport.tampered_events.length > 0
                    ? 'border-red-500/30 bg-red-500/10 text-red-200'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  {auditIntegrityReport.tampered_events.length > 0 ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Integrity check
                </div>
                <p className="mt-1 text-xs text-current/80">
                  Verified {auditIntegrityReport.verified_events} of{' '}
                  {auditIntegrityReport.total_events} events.
                  {auditIntegrityReport.tampered_events.length > 0 &&
                    ` ${auditIntegrityReport.tampered_events.length} event${
                      auditIntegrityReport.tampered_events.length === 1 ? ' was' : 's were'
                    } flagged as tampered.`}
                </p>
              </div>
            )}

            <AuditEventsList events={auditEvents} isLoading={isLoadingAudit} />
          </TabsContent>

          <TabsContent value="policies" className="m-0">
            <SafetyPolicies />
          </TabsContent>

          <TabsContent value="history" className="m-0 space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <History className="h-4 w-4 text-zinc-400" />
                Approval and action history
              </div>
              <AuditLog />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <FileText className="h-4 w-4 text-zinc-400" />
                Tool execution history
              </div>
              <ToolHistoryTable />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default GovernanceDashboard;
