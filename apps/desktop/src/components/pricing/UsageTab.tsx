import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Progress } from '../ui/Progress';
import { ScrollArea } from '../ui/ScrollArea';
import { Select } from '../ui/Select';
import { usePricingStore } from '../../stores/pricingStore';
import { CheckCircle2, XCircle, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { BillableEvent } from '../../types/pricing';

export function UsageTab() {
  const {
    currentUsage,
    billableEvents,
    projectedCost,
    currentPlan,
    fetchUsage,
    fetchBillableEvents,
    calculateProjectedCost,
  } = usePricingStore();

  const [eventFilter, setEventFilter] = useState<'all' | 'successful' | 'failed'>('all');

  useEffect(() => {
    const userId = 'default-user';
    void fetchUsage(userId);
    void fetchBillableEvents(userId);
    void calculateProjectedCost(userId);
  }, [fetchUsage, fetchBillableEvents, calculateProjectedCost]);

  const filteredEvents = billableEvents.filter((event) => {
    if (eventFilter === 'successful') return event.success;
    if (eventFilter === 'failed') return !event.success;
    return true;
  });

  const percentageUsed = currentUsage?.percentage_used ?? 0;
  const isNearLimit = percentageUsed > 80;

  return (
    <div className="p-6 space-y-6">
      {/* Usage Meter */}
      <Card>
        <CardHeader>
          <CardTitle>Current Usage</CardTitle>
          <CardDescription>
            {currentPlan?.name ?? 'Free'} plan - Billing period:{' '}
            {currentUsage
              ? `${new Date(currentUsage.billing_period_start).toLocaleDateString()} - ${new Date(currentUsage.billing_period_end).toLocaleDateString()}`
              : 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Automation hours used</span>
              <span className="text-sm font-semibold">
                {currentUsage?.hours_used ?? 0} / {currentUsage?.hours_limit ?? 10}h
              </span>
            </div>
            <Progress value={percentageUsed} className={cn(isNearLimit && 'bg-orange-100')} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{percentageUsed.toFixed(0)}% used</span>
              <span>{currentUsage?.days_remaining ?? 0} days remaining</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="space-y-1">
              <div className="text-2xl font-bold">{currentUsage?.automations_run ?? 0}</div>
              <div className="text-xs text-muted-foreground">Total runs</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-green-600">
                {currentUsage?.successful_automations ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">Successful</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-red-600">
                {currentUsage?.failed_automations ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>

          {/* Value Generated */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Time saved</span>
              <span className="font-semibold">{currentUsage?.time_saved_hours ?? 0}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Value generated</span>
              <span className="text-xl font-bold text-green-600">
                ${(currentUsage?.cost_saved_usd ?? 0).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Warning if approaching limit */}
          {isNearLimit && currentPlan?.pricing_model === 'free' && (
            <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-orange-900">Approaching limit</div>
                <div className="text-xs text-orange-700 mt-1">
                  You've used {percentageUsed.toFixed(0)}% of your free hours. Upgrade to Pro for
                  unlimited automations.
                </div>
                <Button size="sm" className="mt-2">
                  Upgrade to Pro
                </Button>
              </div>
            </div>
          )}

          {/* Projected Cost (Pay-per-result only) */}
          {currentPlan?.pricing_model === 'pay_per_result' && (
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">Projected monthly cost</div>
                  <div className="text-xs text-muted-foreground">
                    Based on current usage trend
                  </div>
                </div>
                <div className="text-2xl font-bold">${projectedCost.toFixed(2)}</div>
              </div>
              {projectedCost > 39 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <TrendingUp className="inline h-3 w-3 mr-1" />
                  Consider upgrading to Pro ($39/mo) to save ${(projectedCost - 39).toFixed(2)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billable Events Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Automations</CardTitle>
              <CardDescription>Your automation activity this billing period</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="filter" className="text-sm text-muted-foreground">
                Filter:
              </label>
              <select
                id="filter"
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value as typeof eventFilter)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="successful">Successful</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {filteredEvents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No automation events yet</p>
                  <p className="text-sm mt-1">Start automating to see activity here</p>
                </div>
              ) : (
                filteredEvents.map((event) => <EventItem key={event.id} event={event} />)
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function EventItem({ event }: { event: BillableEvent }) {
  const date = new Date(event.timestamp);
  const isSuccess = event.success;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      <div
        className={cn(
          'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0',
          isSuccess ? 'bg-green-100' : 'bg-red-100',
        )}
      >
        {isSuccess ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <XCircle className="h-5 w-5 text-red-600" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="font-medium text-sm">{event.employee_name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {event.description || 'Automation task'}
            </div>
          </div>
          <Badge variant={isSuccess ? 'default' : 'destructive'} className="flex-shrink-0">
            {isSuccess ? 'Success' : 'Failed'}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-2 text-xs">
          <div>
            <span className="text-muted-foreground">Time saved:</span>
            <span className="font-semibold ml-1">{event.time_saved_minutes}min</span>
          </div>
          <div>
            <span className="text-muted-foreground">Value:</span>
            <span className="font-semibold ml-1 text-green-600">
              ${event.cost_saved_usd.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Cost:</span>
            <span className="font-semibold ml-1">
              {isSuccess ? `$${event.billable_amount_usd.toFixed(2)}` : 'Free'}
            </span>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mt-2">
          {date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}
