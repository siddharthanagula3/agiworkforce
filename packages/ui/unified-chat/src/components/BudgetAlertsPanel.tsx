/**
 * BudgetAlertsPanel — renders dismissible alerts pushed to budgetStore.
 * Shown wherever a host wants threshold notifications (sidebar, header, etc).
 */
import { AlertCircle, AlertTriangle, X, XCircle } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '../lib/utils';
import { useBudgetStore } from '../stores/budgetStore';

export function BudgetAlertsPanel() {
  const allAlerts = useBudgetStore((state) => state.budgetAlerts);
  const dismissAlert = useBudgetStore((state) => state.dismissAlert);
  const alerts = useMemo(() => allAlerts.filter((a) => !a.dismissed), [allAlerts]);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 p-4">
      {alerts.map((alert) => {
        const config = {
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
        if (!config) return null;
        const Icon = config.icon;

        return (
          <div
            key={alert.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 transition-all',
              config.bg,
              config.border,
            )}
          >
            <Icon className={cn('h-5 w-5 shrink-0', config.text)} />
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', config.text)}>{alert.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </p>
            </div>
            <button
              type="button"
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
