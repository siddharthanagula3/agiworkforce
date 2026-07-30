export interface DayStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromYesterday: number;
  topAutomation: string;
  topAutomationTimeSaved: number;
}

export interface WeekStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromLastWeek: number;
  topAutomations: TopAutomation[];
  dailyBreakdown: DailyBreakdown[];
}

export interface MonthStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromLastMonth: number;
  topAutomations: TopAutomation[];
  weeklyBreakdown: WeeklyBreakdown[];
}

export interface AllTimeStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  milestonesAchieved: number;
  topAutomations: TopAutomation[];
  monthlyTrend: MonthlyTrend[];
}

export interface TopAutomation {
  automationName: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
  successRate: number;
}

export interface DailyBreakdown {
  date: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
}

export interface WeeklyBreakdown {
  weekStart: string;
  weekEnd: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
}

export interface MonthlyTrend {
  month: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
}

export interface Milestone {
  id: string;
  type: 'time' | 'cost' | 'automations';
  threshold: number;
  achievedAt: number;
  acknowledged: boolean;
  value: string;
  nextMilestone: string;
  message: string;
}

export type ComparisonMode = 'manual_vs_auto' | 'period' | 'benchmark';

export interface ComparisonData {
  manualTimeHours: number;
  automatedTimeHours: number;
  manualCostUsd: number;
  automatedCostUsd: number;
  manualQuality: number;
  automatedQuality: number;
  timeSavedHours: number;
  costSavedUsd: number;
  efficiencyGain: number;
  qualityImprovement: number;
}

export interface PeriodComparisonData {
  currentPeriodLabel: string;
  previousPeriodLabel: string;
  currentTimeSavedHours: number;
  previousTimeSavedHours: number;
  currentCostSavedUsd: number;
  previousCostSavedUsd: number;
  currentAutomationsRun: number;
  previousAutomationsRun: number;
  percentageChange: number;
}

export interface BenchmarkComparisonData {
  yourTimeSavedHours: number;
  industryAverageTimeSavedHours: number;
  yourCostSavedUsd: number;
  industryAverageCostSavedUsd: number;
  yourAutomationsRun: number;
  industryAverageAutomationsRun: number;
  percentageBetter: number;
}

export interface ActivityItem {
  id: string;
  type: 'automation_run' | 'milestone_achieved' | 'goal_completed';
  title: string;
  description: string;
  timestamp: number;
  timeSavedMinutes?: number;
  costSavedUsd?: number;
  automationName?: string;
  status?: 'success' | 'failed' | 'partial';
}

export interface MetricsUpdate {
  newStats: DayStats;
  milestoneAchieved?: boolean;
  milestone?: Milestone;
}

export interface ExportOptions {
  dateRange: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  format: 'pdf' | 'csv' | 'json';
  includeCharts: boolean;
  includeDetailedLog: boolean;
  includeComparison: boolean;
  includeAutomationBreakdown: boolean;
  startDate?: string;
  endDate?: string;
}

export interface ChartDataPoint {
  date: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
  label?: string;
}

export interface AutomationChartData {
  automationName: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
  successRate: number;
}
