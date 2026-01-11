/**
 * ComparisonSection Component
 * Side-by-side comparison display for different comparison modes
 */

import { Bot, Clock, DollarSign, Target, TrendingUp, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/Select';
import type {
  BenchmarkComparisonData,
  ComparisonData,
  ComparisonMode,
  PeriodComparisonData,
} from '../../../types/roi';
import { useROIStore } from '../roiStore';

interface ComparisonColumnProps {
  title: string;
  timeTaken: number;
  cost: number;
  quality: number;
  icon: typeof User | typeof Bot;
  color: 'muted' | 'primary';
}

function ComparisonColumn({
  title,
  timeTaken,
  cost,
  quality,
  icon: Icon,
  color,
}: ComparisonColumnProps) {
  const formatTime = (hours: number): string => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    }
    return `${hours.toFixed(1)}h`;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-3 rounded-lg ${color === 'primary' ? 'bg-primary/10' : 'bg-muted'}`}>
          <Icon
            className={`h-6 w-6 ${color === 'primary' ? 'text-primary' : 'text-muted-foreground'}`}
          />
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Time</span>
          </div>
          <span className="font-semibold">{formatTime(timeTaken)}</span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Cost</span>
          </div>
          <span className="font-semibold">{formatCurrency(cost)}</span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Quality</span>
          </div>
          <span className="font-semibold">{(quality * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

function ManualVsAutoComparison({ data }: { data: ComparisonData }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-8 mb-6">
        <ComparisonColumn
          title="Manual Process"
          timeTaken={data.manualTimeHours}
          cost={data.manualCostUsd}
          quality={data.manualQuality}
          icon={User}
          color="muted"
        />
        <ComparisonColumn
          title="With AGI Workforce"
          timeTaken={data.automatedTimeHours}
          cost={data.automatedCostUsd}
          quality={data.automatedQuality}
          icon={Bot}
          color="primary"
        />
      </div>

      {/* Savings Callout */}
      <div className="p-6 bg-primary/10 border border-primary/20 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">Total Savings</p>
            <p className="text-2xl font-bold text-primary">
              {data.timeSavedHours.toFixed(1)}h saved = ${data.costSavedUsd.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Quality improved by {(data.qualityImprovement * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-5xl font-bold text-primary">{data.efficiencyGain.toFixed(1)}x</p>
            <p className="text-sm text-muted-foreground mt-1">faster</p>
          </div>
        </div>
      </div>
    </>
  );
}

function PeriodComparison({ data }: { data: PeriodComparisonData }) {
  const percentageColor =
    data.percentageChange >= 0
      ? 'text-green-600 dark:text-green-500'
      : 'text-red-600 dark:text-red-500';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground mb-2">{data.currentPeriodLabel}</p>
          <div className="space-y-2">
            <p className="text-lg font-semibold">{data.currentTimeSavedHours.toFixed(1)}h saved</p>
            <p className="text-lg font-semibold">${data.currentCostSavedUsd.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">
              {data.currentAutomationsRun} automations
            </p>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground mb-2">{data.previousPeriodLabel}</p>
          <div className="space-y-2">
            <p className="text-lg font-semibold">{data.previousTimeSavedHours.toFixed(1)}h saved</p>
            <p className="text-lg font-semibold">${data.previousCostSavedUsd.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">
              {data.previousAutomationsRun} automations
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 bg-primary/10 border border-primary/20 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Period-over-Period Change</p>
          <div className={`flex items-center gap-2 text-2xl font-bold ${percentageColor}`}>
            <TrendingUp className="h-6 w-6" />
            <span>
              {data.percentageChange > 0 ? '+' : ''}
              {data.percentageChange.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BenchmarkComparison({ data }: { data: BenchmarkComparisonData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-2">Metric</p>
          <div className="space-y-3">
            <p className="font-medium">Time Saved</p>
            <p className="font-medium">Cost Saved</p>
            <p className="font-medium">Automations</p>
          </div>
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-2">Your Performance</p>
          <div className="space-y-3">
            <p className="font-semibold text-primary">{data.yourTimeSavedHours.toFixed(1)}h</p>
            <p className="font-semibold text-primary">${data.yourCostSavedUsd.toLocaleString()}</p>
            <p className="font-semibold text-primary">{data.yourAutomationsRun}</p>
          </div>
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-2">Industry Average</p>
          <div className="space-y-3">
            <p className="font-semibold">{data.industryAverageTimeSavedHours.toFixed(1)}h</p>
            <p className="font-semibold">${data.industryAverageCostSavedUsd.toLocaleString()}</p>
            <p className="font-semibold">{data.industryAverageAutomationsRun}</p>
          </div>
        </div>
      </div>

      <div className="p-6 bg-primary/10 border border-primary/20 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">vs Industry Average</p>
          <div className="flex items-center gap-2 text-2xl font-bold text-primary">
            <TrendingUp className="h-6 w-6" />
            <span>{data.percentageBetter.toFixed(0)}% better</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ComparisonSection() {
  const { comparisonMode, comparisonData, setComparisonMode, loading } = useROIStore();

  const handleModeChange = (value: string) => {
    setComparisonMode(value as ComparisonMode);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Comparison</CardTitle>
          <Select value={comparisonMode} onValueChange={handleModeChange}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual_vs_auto">Manual vs Automated</SelectItem>
              <SelectItem value="period">This Month vs Last Month</SelectItem>
              <SelectItem value="benchmark">vs Industry Benchmark</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-pulse text-muted-foreground">Loading comparison...</div>
          </div>
        ) : !comparisonData ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No comparison data available
          </div>
        ) : (
          <>
            {comparisonMode === 'manual_vs_auto' && (
              <ManualVsAutoComparison data={comparisonData as ComparisonData} />
            )}
            {comparisonMode === 'period' && (
              <PeriodComparison data={comparisonData as PeriodComparisonData} />
            )}
            {comparisonMode === 'benchmark' && (
              <BenchmarkComparison data={comparisonData as BenchmarkComparisonData} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
