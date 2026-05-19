/**
 * src/features/analytics — public API barrel
 *
 * Workspace analytics: token/usage data, agent execution tracking,
 * team leaderboards, time-series charts.
 *
 * Migrated from apps/web/features/analytics/ — Phase 5, 2026-05-18
 */

export { ActivityTable } from './components/ActivityTable';
export type { ActivityRow } from './components/ActivityTable';
export { AnalyticsSummaryCard } from './components/AnalyticsSummaryCard';
export { SimpleBarChart } from './components/SimpleBarChart';
export { SimpleLineChart } from './components/SimpleLineChart';
export { default as AnalyticsDashboard } from './pages/AnalyticsDashboard';
