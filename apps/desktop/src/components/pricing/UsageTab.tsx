/**
 * UsageTab Component
 * Displays usage breakdown: Included Usage and On-Demand Usage
 * Matches the reference design with model-level token and cost tracking
 */

import { ArrowDown, ArrowUp, CheckCircle2, Info, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { useBillingStore } from '../../stores/billingStore';
import { useUsageStore } from '../../stores/usageStore';
import type { ModelUsageStats } from '../../services/stripe';
import { getModelMetadata } from '../../constants/llm';
import { Badge } from '../ui/Badge';
import { Card, CardContent } from '../ui/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';

interface UsageItem {
  item: string;
  modelId?: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  requestCount?: number;
  status: 'included' | 'on-demand';
  isUnlimited?: boolean;
}

interface UsagePeriod {
  start: number;
  end: number;
  label: string;
}

export function UsageTab() {
  const { customer, subscription } = useBillingStore();
  const { stats, statsLoading, fetchUsage, getTokenCost } = useUsageStore();

  const [includedUsage, setIncludedUsage] = useState<UsageItem[]>([]);
  const [onDemandUsage, setOnDemandUsage] = useState<UsageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<UsagePeriod | null>(null);
  const [availablePeriods, setAvailablePeriods] = useState<UsagePeriod[]>([]);

  // Get current billing period from subscription
  useEffect(() => {
    if (subscription) {
      const period: UsagePeriod = {
        start: subscription.current_period_start,
        end: subscription.current_period_end,
        label: `${new Date(subscription.current_period_start * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(subscription.current_period_end * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      };
      setSelectedPeriod(period);
      setAvailablePeriods([period]);
    } else if (customer) {
      // Default to current month if no subscription
      const startOfMonth =
        new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000;
      const endOfMonth =
        new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).getTime() /
        1000;
      const period: UsagePeriod = {
        start: startOfMonth,
        end: endOfMonth,
        label: `${new Date(startOfMonth * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(endOfMonth * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      };
      setSelectedPeriod(period);
      setAvailablePeriods([period]);
    }
  }, [subscription, customer]);

  // Fetch usage data
  useEffect(() => {
    if (!customer || !selectedPeriod) return;

    const loadUsage = async () => {
      setLoading(true);
      try {
        // Get usage stats from backend
        await fetchUsage(customer.id, selectedPeriod.start, selectedPeriod.end);
      } catch (error) {
        console.error('Failed to fetch usage:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadUsage();
  }, [customer, selectedPeriod, fetchUsage]);

  // Transform model usage data when stats change
  useEffect(() => {
    if (!stats) {
      setIncludedUsage([]);
      setOnDemandUsage([]);
      return;
    }

    const modelUsage = stats.model_usage || [];

    // Transform model usage to UsageItem format
    const included: UsageItem[] = modelUsage.map((model: ModelUsageStats) => {
      const metadata = getModelMetadata(model.model_id);
      return {
        item: metadata?.name || model.model_name || model.model_id,
        modelId: model.model_id,
        provider: model.provider,
        inputTokens: model.input_tokens,
        outputTokens: model.output_tokens,
        totalTokens: model.total_tokens,
        cost: model.cost_usd,
        requestCount: model.request_count,
        status: 'included' as const,
      };
    });

    // Sort by total tokens descending
    included.sort((a, b) => b.totalTokens - a.totalTokens);

    // Calculate totals
    const totalInputTokens = stats.llm_input_tokens || 0;
    const totalOutputTokens = stats.llm_output_tokens || 0;
    const totalTokens = stats.llm_tokens_used || 0;
    const totalCost = modelUsage.reduce(
      (sum: number, model: ModelUsageStats) => sum + model.cost_usd,
      0,
    );
    const totalRequests = modelUsage.reduce(
      (sum: number, model: ModelUsageStats) => sum + model.request_count,
      0,
    );

    // Add total row
    if (included.length > 0) {
      included.push({
        item: 'Total',
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens,
        cost: totalCost,
        requestCount: totalRequests,
        status: 'included',
      });
    }

    setIncludedUsage(included);
    setOnDemandUsage([]); // No on-demand usage currently
  }, [stats]);

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  const formatCost = (cost: number): string => {
    if (cost === 0) return 'Free';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const planName = subscription?.plan_name || 'Free';

  // Summary stats from usage store
  const totalInputTokens = stats?.llm_input_tokens || 0;
  const totalOutputTokens = stats?.llm_output_tokens || 0;
  const totalTokens = stats?.llm_tokens_used || 0;
  const totalCost = getTokenCost();

  return (
    <div className="p-6 space-y-8 bg-zinc-950 text-gray-100">
      {/* Included Usage Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-100">Included Usage</h2>
            <p className="text-sm text-gray-400 mt-1">Included in {planName}</p>
            {selectedPeriod && <p className="text-xs text-gray-500 mt-1">{selectedPeriod.label}</p>}
          </div>
          {availablePeriods.length > 1 && (
            <Select
              value={selectedPeriod?.label}
              onValueChange={(value) => {
                const period = availablePeriods.find((p) => p.label === value);
                if (period) setSelectedPeriod(period);
              }}
            >
              <SelectTrigger className="w-[200px] bg-zinc-900 border-zinc-800 text-gray-100">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {availablePeriods.map((period) => (
                  <SelectItem key={period.label} value={period.label}>
                    {period.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Summary Cards */}
        {!loading && stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card className="bg-zinc-800/50 border-zinc-700">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                  <TrendingUp className="h-3 w-3" />
                  Total Tokens
                </div>
                <div className="text-2xl font-bold text-gray-100">{formatTokens(totalTokens)}</div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-800/50 border-zinc-700">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs text-blue-400 mb-1">
                  <ArrowDown className="h-3 w-3" />
                  Input Tokens
                </div>
                <div className="text-2xl font-bold text-blue-400">
                  {formatTokens(totalInputTokens)}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-800/50 border-zinc-700">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs text-green-400 mb-1">
                  <ArrowUp className="h-3 w-3" />
                  Output Tokens
                </div>
                <div className="text-2xl font-bold text-green-400">
                  {formatTokens(totalOutputTokens)}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-800/50 border-zinc-700">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs text-amber-400 mb-1">
                  <span className="text-sm">$</span>
                  Est. Cost
                </div>
                <div className="text-2xl font-bold text-amber-400">{formatCost(totalCost)}</div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            {loading || statsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-gray-400">Loading usage data...</div>
              </div>
            ) : includedUsage.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-sm text-gray-400">No usage data for this period</div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableHead className="text-gray-300">Model</TableHead>
                    <TableHead className="text-gray-300 text-right">
                      <span className="flex items-center justify-end gap-1">
                        <ArrowDown className="h-3 w-3 text-blue-400" />
                        Input
                      </span>
                    </TableHead>
                    <TableHead className="text-gray-300 text-right">
                      <span className="flex items-center justify-end gap-1">
                        <ArrowUp className="h-3 w-3 text-green-400" />
                        Output
                      </span>
                    </TableHead>
                    <TableHead className="text-gray-300 text-right">Total</TableHead>
                    <TableHead className="text-gray-300 text-right">Requests</TableHead>
                    <TableHead className="text-gray-300 text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {includedUsage.map((item, index) => {
                    const isTotal = item.item === 'Total';
                    const isUnlimited = item.isUnlimited;

                    return (
                      <TableRow
                        key={index}
                        className={cn(
                          'border-zinc-800 hover:bg-zinc-800/50',
                          isTotal && 'font-semibold border-t-2 border-zinc-700 bg-zinc-800/30',
                        )}
                      >
                        <TableCell className="text-gray-100">
                          <div className="flex items-center gap-2">
                            {item.status === 'included' && !isTotal && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            <div className="flex flex-col">
                              <span>{item.item}</span>
                              {item.provider && !isTotal && (
                                <span className="text-xs text-gray-500">{item.provider}</span>
                              )}
                            </div>
                            {item.status === 'included' && !isTotal && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-green-500/10 text-green-400 border-green-500/20"
                              >
                                Included
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-blue-400 text-right">
                          {isUnlimited ? '∞' : formatTokens(item.inputTokens)}
                        </TableCell>
                        <TableCell className="text-green-400 text-right">
                          {isUnlimited ? '∞' : formatTokens(item.outputTokens)}
                        </TableCell>
                        <TableCell className="text-gray-100 text-right">
                          {isUnlimited ? 'Unlimited' : formatTokens(item.totalTokens)}
                        </TableCell>
                        <TableCell className="text-gray-400 text-right">
                          {item.requestCount?.toLocaleString() || '-'}
                        </TableCell>
                        <TableCell className="text-amber-400 text-right">
                          {formatCost(item.cost)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {/* Note about unlimited Auto */}
            {includedUsage.some((item) => item.isUnlimited) && (
              <div className="mt-4 p-3 bg-zinc-800/50 border border-zinc-700 rounded-md">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-400">
                    * Your plan currently includes unlimited Auto for the current billing period.
                    This will transition to new pricing in a future billing cycle.{' '}
                    <a href="#" className="text-blue-400 hover:text-blue-300 underline">
                      Learn more
                    </a>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* On-Demand Usage Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-100">On-Demand Usage</h2>
            <p className="text-sm text-gray-400 mt-1">Usage not covered by your plan</p>
            {selectedPeriod && <p className="text-xs text-gray-500 mt-1">{selectedPeriod.label}</p>}
          </div>
          {availablePeriods.length > 1 && (
            <Select
              value={selectedPeriod?.label}
              onValueChange={(value) => {
                const period = availablePeriods.find((p) => p.label === value);
                if (period) setSelectedPeriod(period);
              }}
            >
              <SelectTrigger className="w-[200px] bg-zinc-900 border-zinc-800 text-gray-100">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {availablePeriods.map((period) => (
                  <SelectItem key={period.label} value={period.label}>
                    Cycle Starting{' '}
                    {new Date(period.start * 1000).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            {loading || statsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-gray-400">Loading usage data...</div>
              </div>
            ) : onDemandUsage.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-2xl font-semibold text-gray-100 mb-2">$0.00</div>
                <div className="text-sm text-gray-400">No on-demand usage for this period</div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableHead className="text-gray-300">Model</TableHead>
                    <TableHead className="text-gray-300 text-right">
                      <span className="flex items-center justify-end gap-1">
                        <ArrowDown className="h-3 w-3 text-blue-400" />
                        Input
                      </span>
                    </TableHead>
                    <TableHead className="text-gray-300 text-right">
                      <span className="flex items-center justify-end gap-1">
                        <ArrowUp className="h-3 w-3 text-green-400" />
                        Output
                      </span>
                    </TableHead>
                    <TableHead className="text-gray-300 text-right">Total</TableHead>
                    <TableHead className="text-gray-300 text-right">Requests</TableHead>
                    <TableHead className="text-gray-300 text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {onDemandUsage.map((item, index) => (
                    <TableRow key={index} className="border-zinc-800 hover:bg-zinc-800/50">
                      <TableCell className="text-gray-100">
                        <div className="flex flex-col">
                          <span>{item.item}</span>
                          {item.provider && (
                            <span className="text-xs text-gray-500">{item.provider}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-blue-400 text-right">
                        {formatTokens(item.inputTokens)}
                      </TableCell>
                      <TableCell className="text-green-400 text-right">
                        {formatTokens(item.outputTokens)}
                      </TableCell>
                      <TableCell className="text-gray-100 text-right">
                        {formatTokens(item.totalTokens)}
                      </TableCell>
                      <TableCell className="text-gray-400 text-right">
                        {item.requestCount?.toLocaleString() || '-'}
                      </TableCell>
                      <TableCell className="text-amber-400 text-right">
                        {formatCost(item.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-zinc-800 border-t-2 border-zinc-700 font-semibold bg-zinc-800/30">
                    <TableCell colSpan={5} className="text-gray-100">
                      Subtotal
                    </TableCell>
                    <TableCell className="text-amber-400 text-right">
                      ${onDemandUsage.reduce((sum, item) => sum + item.cost, 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
