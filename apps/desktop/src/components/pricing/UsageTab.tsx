/**
 * UsageTab Component
 * Displays usage breakdown: Included Usage and On-Demand Usage
 * Matches the reference design with model-level token and cost tracking
 */

import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/Table';
import { Badge } from '../ui/Badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { useBillingStore } from '../../stores/billingStore';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { CheckCircle2, Info } from 'lucide-react';

interface UsageItem {
  item: string;
  tokens: number;
  cost: number;
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
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000;
      const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).getTime() / 1000;
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

    const fetchUsage = async () => {
      setLoading(true);
      try {
        // Get usage stats from backend
        await invoke<any>('stripe_get_usage', {
          customerId: customer.id,
          periodStart: selectedPeriod.start,
          periodEnd: selectedPeriod.end,
        });

        // Transform usage data to match reference design
        // In a real implementation, this would come from detailed usage tracking
        
        // Mock included usage data (in production, this would come from detailed tracking)
        const included: UsageItem[] = [
          {
            item: 'claude-4.5-sonnet-thinking',
            tokens: 54900000,
            cost: 42.40,
            status: 'included',
          },
          {
            item: 'Auto - Unlimited *',
            tokens: 98600000,
            cost: 0,
            status: 'included',
            isUnlimited: true,
          },
          {
            item: 'gpt-5-codex-high',
            tokens: 12000000,
            cost: 2.98,
            status: 'included',
          },
          {
            item: 'gpt-5-codex',
            tokens: 810700,
            cost: 0.24,
            status: 'included',
          },
        ];

        // Calculate totals
        const totalTokens = included.reduce((sum, item) => sum + item.tokens, 0);
        const totalCost = included.reduce((sum, item) => sum + item.cost, 0);
        included.push({
          item: 'Total',
          tokens: totalTokens,
          cost: totalCost,
          status: 'included',
        });

        setIncludedUsage(included);
        setOnDemandUsage([]); // No on-demand usage currently
      } catch (error) {
        console.error('Failed to fetch usage:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchUsage();
  }, [customer, selectedPeriod, subscription]);

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
    return `$${cost.toFixed(2)}`;
  };

  const planName = subscription?.plan_name || 'Free';

  return (
    <div className="p-6 space-y-8 bg-zinc-950 text-gray-100">
      {/* Included Usage Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-100">Included Usage</h2>
            <p className="text-sm text-gray-400 mt-1">
              Included in {planName}
            </p>
            {selectedPeriod && (
              <p className="text-xs text-gray-500 mt-1">
                {selectedPeriod.label}
              </p>
            )}
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

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-gray-400">Loading usage data...</div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableHead className="text-gray-300">Item</TableHead>
                    <TableHead className="text-gray-300 text-right">Tokens</TableHead>
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
                          isTotal && 'font-semibold border-t-2 border-zinc-700'
                        )}
                      >
                        <TableCell className="text-gray-100">
                          <div className="flex items-center gap-2">
                            {item.status === 'included' && !isTotal && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            <span>{item.item}</span>
                            {item.status === 'included' && !isTotal && (
                              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/20">
                                Included
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-100 text-right">
                          {isUnlimited ? 'Unlimited' : formatTokens(item.tokens)}
                        </TableCell>
                        <TableCell className="text-gray-100 text-right">
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
                    * Your plan currently includes unlimited Auto for the current billing period. This will transition to new pricing in a future billing cycle.{' '}
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
            <p className="text-sm text-gray-400 mt-1">
              Usage not covered by your plan
            </p>
            {selectedPeriod && (
              <p className="text-xs text-gray-500 mt-1">
                {selectedPeriod.label}
              </p>
            )}
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
                    Cycle Starting {new Date(period.start * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            {loading ? (
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
                    <TableHead className="text-gray-300">Type</TableHead>
                    <TableHead className="text-gray-300 text-right">Tokens</TableHead>
                    <TableHead className="text-gray-300 text-right">Cost</TableHead>
                    <TableHead className="text-gray-300 text-right">Qty</TableHead>
                    <TableHead className="text-gray-300 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {onDemandUsage.map((item, index) => (
                    <TableRow key={index} className="border-zinc-800 hover:bg-zinc-800/50">
                      <TableCell className="text-gray-100">{item.item}</TableCell>
                      <TableCell className="text-gray-100 text-right">
                        {formatTokens(item.tokens)}
                      </TableCell>
                      <TableCell className="text-gray-100 text-right">
                        {formatCost(item.cost)}
                      </TableCell>
                      <TableCell className="text-gray-100 text-right">1</TableCell>
                      <TableCell className="text-gray-100 text-right">
                        {formatCost(item.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-zinc-800 border-t-2 border-zinc-700 font-semibold">
                    <TableCell colSpan={4} className="text-gray-100">
                      Subtotal
                    </TableCell>
                    <TableCell className="text-gray-100 text-right">
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
