import { useMemo } from 'react';
import { AlertCircle, AlertTriangle, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBillingUsageStore } from '@/stores/unified/billingUsage';

const _store = useBillingUsageStore as unknown as (selector?: any) => any;

export function BudgetAlertsPanel() {
  const alerts = useMemo(() => {
    const allAlerts = (_store((state: any) => state.budgetAlerts) ?? []) as any[];
    return allAlerts.filter((a: any) => !a.dismissed);
  }, []);
  const dismissAlert = (_store((state: any) => state.dismissAlert) ?? ((_id: string) => {})) as (
    id: string,
  ) => void;

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 p-4">
      {alerts.map((alert: any) => {
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
        }[alert.type as 'warning' | 'danger' | 'exceeded'];

        const Icon = alertConfig?.icon ?? AlertTriangle;

        return (
          <div
            key={alert.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 transition-all',
              alertConfig?.bg,
              alertConfig?.border,
            )}
          >
            <Icon className={cn('h-5 w-5 shrink-0', alertConfig?.text)} />
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', alertConfig?.text)}>{alert.message}</p>
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
