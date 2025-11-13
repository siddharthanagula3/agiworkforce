/**
 * ROI Dashboard Types
 * Type definitions for the Real-Time ROI Dashboard
 */

export interface DayStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromYesterday: number;
  topEmployee: string;
  topEmployeeTimeSaved: number;
}

export interface WeekStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromLastWeek: number;
  topEmployees: TopEmployee[];
  dailyBreakdown: DailyBreakdown[];
}

export interface MonthStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromLastMonth: number;
  topEmployees: TopEmployee[];
  weeklyBreakdown: WeeklyBreakdown[];
}

export interface AllTimeStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  milestonesAchieved: number;
  topEmployees: TopEmployee[];
  monthlyTrend: MonthlyTrend[];
}

export interface TopEmployee {
  employeeId: string;
  employeeName: string;
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
  type: 'automation_run' | 'employee_hired' | 'milestone_achieved' | 'goal_completed';
  title: string;
  description: string;
  timestamp: number;
  timeSavedMinutes?: number;
  costSavedUsd?: number;
  employeeName?: string;
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
  includeEmployeeBreakdown: boolean;
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

export interface EmployeeChartData {
  employeeName: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
  successRate: number;
}
