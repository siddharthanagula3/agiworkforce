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
/**
 * STB-10: `AnalyticsDashboard` renders SAMPLE DATA ONLY — no analytics API is
 * connected to it. It is safe to import as a layout preview; it is not safe to
 * mount on a route users will read as their workspace's real numbers. The
 * component renders its own sample-data banner so the caveat survives a
 * screenshot.
 */
export { default as AnalyticsDashboard } from './pages/AnalyticsDashboard';
