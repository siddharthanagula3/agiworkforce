/**
 * apps/web/features/analytics - public API barrel
 *
 * Workspace analytics: token/usage data, agent execution tracking,
 * team leaderboards, time-series charts.
 *
 * Canonical Web analytics feature.
 */

export { ActivityTable } from './components/ActivityTable';
export type { ActivityRow } from './components/ActivityTable';
export { AnalyticsSummaryCard } from './components/AnalyticsSummaryCard';
export { SimpleBarChart } from './components/SimpleBarChart';
export { SimpleLineChart } from './components/SimpleLineChart';
export { default as AnalyticsDashboard } from './pages/AnalyticsDashboard';
