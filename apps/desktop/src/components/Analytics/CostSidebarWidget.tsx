import { useEffect } from 'react';
import { TrendingUp, Wallet, PieChart, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { useCostStore } from '../../stores/costStore';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/Tooltip';

interface CostSidebarWidgetProps {
  collapsed?: boolean;
  onOpenDashboard?: () => void;
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '$0.00';
  }
  return currency.format(value);
}

export function CostSidebarWidget({ collapsed, onOpenDashboard }: CostSidebarWidgetProps) {
  const { overview, loadingOverview, loadOverview } = useCostStore((state) => ({
    overview: state.overview,
    loadingOverview: state.loadingOverview,
    loadOverview: state.loadOverview,
  }));

  useEffect(() => {
    if (!overview && !loadingOverview) {
      void loadOverview();
    }
  }, [overview, loadingOverview, loadOverview]);

  const content = (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-background/80 p-3 shadow-sm transition hover:border-primary/60',
        'backdrop-blur supports-[backdrop-filter]:bg-background/60'
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Spend</p>
          <p className="text-sm font-semibold text-foreground">Cost Snapshot</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-primary"
          onClick={() => void loadOverview()}
          aria-label="Refresh cost overview"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loadingOverview && !overview ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <TrendingUp className="h-3.5 w-3.5" />
              Today
            </span>
            <span className="font-medium text-foreground">{formatCurrency(overview?.today_total)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <PieChart className="h-3.5 w-3.5" />
              Month
            </span>
            <span className="font-medium text-foreground">{formatCurrency(overview?.month_total)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <Wallet className="h-3.5 w-3.5" />
              Remaining
            </span>
            <span className="font-medium text-foreground">
              {overview?.remaining_budget != null
                ? formatCurrency(overview.remaining_budget)
                : 'No budget'}
            </span>
          </div>
        </div>
      )}

      <Button
        variant="link"
        className="mt-2 h-auto p-0 text-xs text-primary"
        onClick={onOpenDashboard}
      >
        View full analytics
      </Button>
    </div>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full border border-border/60"
              onClick={onOpenDashboard}
              aria-label="Open cost analytics"
            >
              <TrendingUp className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="w-52">
            {content}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}
