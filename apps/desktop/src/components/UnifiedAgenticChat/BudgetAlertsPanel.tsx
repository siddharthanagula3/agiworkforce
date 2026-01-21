import { useMemo } from 'react';
import { AlertCircle, AlertTriangle, XCircle, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useBillingUsageStore } from '../../stores/billingUsage';

export function BudgetAlertsPanel() {
  const allAlerts = useBillingUsageStore((state) => state.budgetAlerts);
  const alerts = useMemo(() => allAlerts.filter((a) => !a.dismissed), [allAlerts]);
  const dismissAlert = useBillingUsageStore((state) => state.dismissAlert);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 p-4">
      {alerts.map((alert) => {
        const alertConfig = {
          warning: {
            icon: AlertTriangle,
            bg: 'bg-warning/10',
            border: 'border-warning/30',
            text: 'text-warning',
          },
          danger: {
            icon: AlertCircle,
            bg: 'bg-destructive/10',
            border: 'border-destructive/30',
            text: 'text-destructive',
          },
          exceeded: {
            icon: XCircle,
            bg: 'bg-destructive/20',
            border: 'border-destructive/50',
            text: 'text-destructive',
          },
        }[alert.type];

        const Icon = alertConfig.icon;

        return (
          <div
            key={alert.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 transition-all',
              alertConfig.bg,
              alertConfig.border,
            )}
          >
            <Icon className={cn('h-5 w-5 shrink-0', alertConfig.text)} />
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', alertConfig.text)}>{alert.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </p>
            </div>
            <button
              onClick={() => dismissAlert(alert.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss alert"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default BudgetAlertsPanel;
