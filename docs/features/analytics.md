# Sub-Feature: Analytics & Metrics

> Local-first analytics platform tracking automation ROI, system health, usage patterns, and LLM costs -- with privacy controls, report generation, and real-time dashboard updates via WebSocket.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust commands (IPC) | `src-tauri/src/sys/commands/analytics.rs` -- telemetry event tracking, usage stats, ROI calculation, trend analysis, report export |
| Rust commands (IPC) | `src-tauri/src/sys/commands/metrics.rs` -- ROI dashboard commands (day/week/month/all-time stats, comparisons, milestones, export) |
| Telemetry system | `src-tauri/src/sys/telemetry/` -- event collection, system/app metrics, operation timing, log redaction, correlation IDs, tracing |
| Data analytics | `src-tauri/src/data/analytics/` -- ROI calculator, metrics aggregator, report generator, scheduled reports |
| Data metrics | `src-tauri/src/data/metrics/` -- realtime collector, comparison engine, live stream broadcasting |
| Database schema | `src-tauri/src/data/db/migrations.rs` -- tables: `realtime_metrics`, `analytics_snapshots`, `user_milestones`, `outcome_tracking`, `automation_history` |
| Frontend store (analytics) | `src/stores/analyticsMetricsStore.ts` -- system/app metrics, feature usage, privacy consent |
| Frontend store (usage) | `src/stores/usageTrackingStore.ts` -- Stripe-metered usage (automations, API calls, tokens, storage) |
| Frontend store (ROI) | `src/components/ROIDashboard/roiStore.ts` -- ROI dashboard state, live updates, comparisons, export |
| Analytics service | `src/services/analytics.ts` -- client-side event tracking, batching, offline queue, PII sanitization |
| Analytics queries | `src/services/analyticsQueries.ts` -- query helpers for DAU/MAU, feature usage, time series, funnels |
| Performance service | `src/services/performance.ts` -- Web Vitals (LCP, FID, CLS), memory monitoring, operation timing |
| ROI Dashboard UI | `src/components/ROIDashboard/` -- RealtimeROIDashboard, BigStatCard, TimeSavedChart, CostSavedChart, ComparisonSection, MilestoneToast, ExportReportModal |
| Analytics Dashboard UI | `src/components/Analytics/` -- UsageDashboard, CostDashboard, CostSidebarWidget |
| Settings UI | `src/components/Settings/AnalyticsSettings.tsx` -- privacy toggles, data export, data deletion |
| Types (analytics) | `src/types/analytics.ts` -- 50+ interfaces: events, metrics, sessions, privacy, feature flags |
| Types (ROI) | `src/types/roi.ts` -- ROI-specific types: DayStats, WeekStats, MonthStats, AllTimeStats, comparisons, milestones |
| Diagnostics | `src-tauri/src/sys/diagnostics/` -- health checks (DB integrity, disk, network, MCP, auth, permissions) -- separate from analytics |

## Architecture Overview

The analytics system has four distinct subsystems that operate independently:

```
+-------------------+     +------------------+     +-------------------+
|  Telemetry Layer  |     |  ROI Metrics     |     |  Usage Tracking   |
|  (Event Tracking) |     |  (Automation ROI)|     |  (Billing Meters) |
+--------+----------+     +--------+---------+     +--------+----------+
         |                         |                         |
    TelemetryCollector      RealtimeMetricsCollector    StripeService
    (in-memory queue)       (SQLite: realtime_metrics)  (Stripe API)
         |                         |                         |
    Flush to:                 Aggregated by:            Tracked via:
    - TELEMETRY_ENDPOINT     - MetricsAggregator        - usage events
    - local JSON file        - ROICalculator            - per-model cost
                             - MetricsComparison
                                    |
                             ReportGenerator
                             (MD / CSV / JSON)
```

**Subsystem 1: Telemetry (Event Tracking)**
- `TelemetryCollector` buffers events in memory, auto-flushes at batch_size (default 50) or interval (30s)
- Flush targets: HTTP POST to `TELEMETRY_ENDPOINT` env var, or local file fallback (`analytics_events.json` in app data dir, capped at 10,000 events)
- Frontend `AnalyticsService` mirrors events locally, sends each to Rust backend via `analytics_track_event`
- Respects `enabled` config flag -- when disabled, all tracking is silently no-op
- PII sanitization on frontend (strips email, phone, API keys, passwords from event properties)
- Log redaction on backend (API keys, bearer tokens, Google keys, GitHub tokens via regex)

**Subsystem 2: ROI Metrics (Automation Value)**
- `RealtimeMetricsCollector` stores per-automation metrics in SQLite `realtime_metrics` table
- Calculates time saved (estimated_manual_time - actual_execution_time), cost saved (time * hourly rate)
- Aggregates by period (today, week, month, all-time) and by employee
- Broadcasts updates via `RealtimeServer` WebSocket to connected clients (mobile app, live dashboard)
- Milestone system: auto-detects thresholds (10h, 100h, 1000h saved), records in `user_milestones`, broadcasts achievement events
- `ROICalculator` runs comprehensive ROI analysis from `automation_history`, `outcome_tracking`, `messages`, `cache_entries` tables
- `MetricsAggregator` slices data by process type, user, and tool with trend calculation
- Analytics commands now reuse the managed desktop `AppDatabase` connection directly; they no longer open a second SQLite writer for ROI/report queries.

**Subsystem 3: Usage Tracking (Billing Meters)**
- Tracks Stripe-metered usage: automations_executed, api_calls_made, storage_used_mb, llm_tokens_used, browser_sessions, mcp_tool_calls
- Per-model LLM cost tracking with input/output token breakdown
- Checks against subscription limits; shows warnings at usage thresholds
- Entirely frontend-driven via `StripeService` -- does not use Rust backend

**Subsystem 4: System/App Metrics**
- `AnalyticsMetricsCollector` uses `sysinfo` crate for CPU, memory, disk, network stats
- `AppMetrics` tracks in-session counters: automations, goals, MCP servers, cache hit rate, API calls, failures
- `MetricsCollector` (operation timing) records per-operation duration stats with min/max/avg
- `PerformanceMonitoringService` (frontend) tracks Web Vitals (LCP, FID, CLS, FCP, TTFB) via PerformanceObserver

## Data Collection

### Tracked Event Categories (54 event types)

| Category | Events |
|----------|--------|
| App lifecycle | `app_opened`, `app_closed`, `app_updated` |
| Sessions | `session_started`, `session_ended` |
| Automations | `automation_created`, `automation_edited`, `automation_deleted`, `automation_executed`, `automation_failed`, `automation_scheduled` |
| Goals | `goal_submitted`, `goal_completed`, `goal_failed` |
| Agents | `step_executed`, `parallel_agents_started` |
| Chat | `chat_message_sent`, `chat_conversation_started`, `chat_cleared`, `chat_exported` |
| Files | `file_uploaded`, `file_downloaded`, `file_created`, `file_deleted`, `folder_created` |
| Browser | `browser_automation_started`, `browser_automation_completed`, `browser_tab_opened`, `browser_screenshot_taken` |
| MCP | `mcp_tool_called`, `mcp_server_started`, `mcp_server_stopped` |
| Database | `db_query_executed`, `db_connection_created` |
| API | `api_call_made`, `api_key_added` |
| Errors | `error_occurred`, `error_recovered` |
| Billing | `subscription_upgraded`, `subscription_downgraded`, `subscription_cancelled`, `payment_method_added` |
| Features | `feature_discovered`, `feature_enabled`, `feature_disabled` |
| Onboarding | `onboarding_completed`, `onboarding_skipped` |
| Settings | `settings_changed`, `theme_changed`, `provider_configured` |
| Data | `data_exported`, `data_imported`, `backup_created` |

### ROI Metrics Collected Per Automation Run

| Metric | Source |
|--------|--------|
| `time_saved_minutes` | `estimated_manual_time_ms - actual_execution_time_ms` (manual estimate = 10x automated) |
| `cost_saved_usd` | `time_saved_hours * hourly_rate` (default $50/hr) |
| `tasks_completed` | From automation run metadata |
| `errors_prevented` | From automation run metadata |
| `quality_score` | 0.0-1.0 score from run metadata |
| `employee_id` | Which AI employee ran the automation |

### System Metrics (via sysinfo)

CPU usage (%), memory used/total (MB), disk used/total (GB), network rx/tx (bytes), system uptime.

### App Metrics (in-session counters)

Automations count, goals count, MCP servers count, cache hit rate, avg goal duration, active sessions, total API calls, failed operations.

### Operation Timing

The `MetricsCollector` + `Timer` + `time_operation!` macro system records per-named-operation: count, total/min/max/avg duration in ms, last execution time.

## Storage

### SQLite Tables

**`realtime_metrics`** (migration v33) -- core ROI data
```sql
CREATE TABLE realtime_metrics (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    automation_id TEXT,
    employee_id TEXT,
    time_saved_minutes INTEGER NOT NULL,
    cost_saved_usd REAL NOT NULL,
    tasks_completed INTEGER DEFAULT 1,
    errors_prevented INTEGER DEFAULT 0,
    quality_score REAL,
    timestamp INTEGER NOT NULL
);
-- Indexes: user_id+timestamp, employee_id+timestamp, automation_id+timestamp, timestamp
```

**`user_milestones`** (migration v34) -- achievement tracking
```sql
CREATE TABLE user_milestones (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    milestone_type TEXT NOT NULL,
    threshold_value REAL NOT NULL,
    achieved_at INTEGER NOT NULL,
    shared INTEGER DEFAULT 0 CHECK(shared IN (0, 1))
);
-- Indexes: user_id+achieved_at, milestone_type
```

**`analytics_snapshots`** (migration v26) -- periodic ROI snapshots
```sql
CREATE TABLE analytics_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    team_id TEXT,
    snapshot_date INTEGER NOT NULL,
    roi_data TEXT NOT NULL,       -- JSON-serialized ROIReport
    metrics_data TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
-- Indexes: snapshot_date, user_id+snapshot_date, team_id+snapshot_date
```

**`outcome_tracking`** (migration v22) -- goal/process outcome measurements
```sql
CREATE TABLE outcome_tracking (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    process_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    target_value REAL,
    actual_value REAL,
    achieved INTEGER DEFAULT 0,
    tracked_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**`automation_history`** -- referenced by ROI queries (columns added in v27: `estimated_manual_time_ms`, `time_saved_ms`)

### In-Memory Storage

- `TelemetryCollector.events`: `Vec<TelemetryEvent>` -- buffered until flush (batch_size=50)
- `AnalyticsMetricsCollector.app_metrics`: `AppMetrics` struct -- session-scoped counters, reset on app restart
- `MetricsCollector.metrics`: `HashMap<String, OperationMetrics>` -- operation timing stats

### Local File Storage

- `analytics_events.json` in Tauri app data dir -- local fallback for telemetry events (max 10,000 entries, oldest trimmed)
- `localStorage['analytics_config']` -- frontend analytics config
- `localStorage['privacy_consent']` -- user privacy consent state
- `localStorage['analytics_user_id']` -- anonymous user ID (UUID)
- `localStorage['analytics_offline_events']` -- offline event queue (max 1,000 events)

## Dashboard

### ROI Dashboard (`src/components/ROIDashboard/`)

The primary analytics UI, displaying automation value in real-time.

| Component | Purpose |
|-----------|---------|
| `RealtimeROIDashboard` | Main dashboard: time range selector (today/week/month/all), stat cards, top performers list. Polls every 10s via `get_realtime_stats`. |
| `BigStatCard` | Large KPI card (time saved, cost saved, success rate) with color coding |
| `TimeSavedChart` | Time series chart of time saved over period |
| `CostSavedChart` | Time series chart of cost savings over period |
| `ComparisonSection` | Three comparison modes: manual vs automated, period-over-period, industry benchmark |
| `RecentActivityFeed` | Activity stream (stub -- returns empty from backend) |
| `MilestoneToast` | Toast notification for milestone achievements |
| `ExportReportModal` | Export dialog with format (CSV/JSON/PDF), date range, content options |
| `LiveIndicator` | Green pulsing dot indicating live connection |

### Analytics Dashboards (`src/components/Analytics/`)

| Component | Purpose |
|-----------|---------|
| `UsageDashboard` | System metrics (CPU/memory/disk), app metrics, usage stats (DAU/MAU), time series charts, category breakdowns. Uses Recharts (AreaChart, BarChart, PieChart, LineChart). |
| `CostDashboard` | LLM cost tracking: total spend, per-model breakdown (pie chart), cost trends (line chart), budget management. Uses Recharts. |
| `CostSidebarWidget` | Compact cost summary for sidebar placement |

### Settings

`AnalyticsSettings` provides three privacy toggles (analytics, error reporting, performance monitoring), data export button, and destructive "delete all data" with confirmation.

## Rust Commands (IPC)

### Telemetry Commands (`sys/commands/analytics.rs`)

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `analytics_track_event` | `event: TelemetryEvent` | `()` | Buffer a telemetry event (no-op if disabled) |
| `analytics_flush_events` | -- | `()` | Force flush event queue to backend/file |
| `analytics_get_session_id` | -- | `String` | Get current session UUID |
| `analytics_set_user_property` | `key, value` | `()` | Set user property for segmentation |
| `analytics_delete_all_data` | -- | `()` | Clear all events and user data |
| `feature_flag_get` | `flagName` | `bool` | Check single feature flag |
| `feature_flag_get_all` | -- | `HashMap<String, bool>` | Get all feature flags |

### Usage Stats Commands (`sys/commands/analytics.rs`)

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `analytics_get_usage_stats` | -- | `JSON` | DAU, MAU, session duration, event counts, retention |
| `analytics_get_feature_usage` | -- | `Vec<JSON>` | Feature usage counts grouped by task_type |
| `analytics_calculate_roi` | `startDate, endDate` | `ROIReport` | Full ROI calculation for date range |
| `analytics_get_process_metrics` | `startDate, endDate` | `Vec<ProcessMetrics>` | Metrics aggregated by process type |
| `analytics_get_user_metrics` | `startDate, endDate` | `Vec<UserMetrics>` | Metrics aggregated by user |
| `analytics_get_tool_metrics` | `startDate, endDate` | `Vec<ToolMetrics>` | Metrics aggregated by tool name |
| `analytics_get_metric_trends` | `metric, days` | `Vec<TrendPoint>` | Daily trend data (automations/success_rate/time_saved/cost_savings) |
| `analytics_get_time_saved_trend` | `days` | `Vec<TrendPoint>` | Alias for time_saved metric trend |
| `analytics_get_cost_saved_trend` | `days` | `Vec<TrendPoint>` | Alias for cost_saved metric trend |
| `analytics_get_top_processes` | `startDate, endDate, limit` | `Vec<ProcessMetrics>` | Top N processes by cost savings. **Not registered in `generate_handler!()`** |
| `analytics_export_report` | `format, startDate, endDate` | `String` | Generate report in markdown/csv/json |
| `analytics_generate_weekly_report` | -- | `String` | Auto-generated weekly executive summary. **Not registered in `generate_handler!()`** |
| `analytics_generate_monthly_report` | -- | `String` | Auto-generated monthly report with tool/process detail. **Not registered in `generate_handler!()`** |
| `analytics_save_snapshot` | `teamId?, startDate, endDate` | `String` | Save ROI snapshot to analytics_snapshots table. **Not registered in `generate_handler!()`** |
| `track_workflow_view` | `workflowId` | `()` | Track workflow page view event. **Not registered in `generate_handler!()`** |
| `acknowledge_milestone` | `milestoneId` | `()` | Mark milestone as acknowledged |

### System/App Metrics Commands (`sys/commands/analytics.rs`)

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `metrics_get_system` | -- | `SystemMetrics` | CPU, memory, disk, network stats via sysinfo |
| `metrics_get_app` | -- | `AppMetrics` | In-session app counters |
| `metrics_increment_automations` | -- | `()` | Increment automation counter. **Not registered in `generate_handler!()`** |
| `metrics_increment_goals` | -- | `()` | Increment goal counter. **Not registered in `generate_handler!()`** |
| `metrics_set_mcp_servers` | `count` | `()` | Set MCP server count. **Not registered in `generate_handler!()`** |
| `metrics_set_cache_hit_rate` | `rate` | `()` | Set cache hit rate. **Not registered in `generate_handler!()`** |

### ROI Dashboard Commands (`sys/commands/metrics.rs`)

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `get_realtime_stats` | -- | `RealtimeStats` | Today/week/month/all-time stats with top employees |
| `record_automation_metrics` | `RecordAutomationRequest` | `MetricsSnapshot` | Record automation run, calculate savings, broadcast, check milestones. **Not registered in `generate_handler!()`** |
| `get_metrics_history` | `days` | `Vec<MetricsSnapshot>` | Paginated metrics history (default limit 1000, max 10000). **Not registered in `generate_handler!()`** |
| `get_today_stats` | -- | `DayStats` | Today's ROI with change-from-yesterday |
| `get_week_stats` | -- | `WeekStats` | This week's ROI with daily breakdown and top employees |
| `get_month_stats` | -- | `MonthStats` | This month's ROI with weekly breakdown |
| `get_all_time_stats` | -- | `AllTimeStats` | All-time ROI with monthly trend and milestones count |
| `get_milestones` | -- | `Vec<MilestoneData>` | User's achievement milestones |
| `share_milestone` | `milestoneId` | `()` | Mark milestone as shared (with BOLA ownership check). **Not registered in `generate_handler!()`** |
| `get_manual_vs_automated_comparison` | `automationType` | `ComparisonData` | Manual vs automated time/cost/quality comparison |
| `get_period_comparison` | `period` | `PeriodComparisonData` | Current vs previous period comparison (week/month/quarter/year) |
| `get_benchmark_comparison` | `role` | `BenchmarkComparisonData` | Compare user performance vs industry benchmarks |
| `get_recent_activity` | `limit` | `Vec<ActivityItem>` | Recent activity feed (stub -- returns empty) |
| `compare_to_manual` | `automationType` | `Comparison` | Raw manual vs automated comparison data. **Not registered in `generate_handler!()`** (use `get_manual_vs_automated_comparison` instead) |
| `compare_to_previous_period` | `days` | `PeriodComparison` | Raw period comparison data. **Not registered in `generate_handler!()`** (use `get_period_comparison` instead) |
| `compare_to_industry_benchmark` | `role` | `BenchmarkComparison` | Raw benchmark comparison. **Not registered in `generate_handler!()`** (use `get_benchmark_comparison` instead) |
| `export_roi_report` | `ExportOptions` | `String` | Export ROI report to temp file (CSV/JSON/markdown) |

## Store Schemas

### `analyticsMetricsStore` (Zustand)

```typescript
interface AnalyticsMetricsState {
  systemMetrics: SystemMetrics | null;      // CPU, memory, disk, network
  appMetrics: AppMetrics | null;            // Session counters
  analyticsUsageStats: UsageStats | null;   // DAU/MAU/events/retention
  featureUsage: FeatureUsageStats[];        // Per-feature usage (capped at 500)
  analyticsConfig: AnalyticsConfig;         // Enabled flags, batch config
  privacyConsent: PrivacyConsent | null;    // User consent state
  isLoadingMetrics: boolean;
  isLoadingStats: boolean;
}
```

### `usageTrackingStore` (Zustand)

```typescript
interface UsageTrackingState {
  usageStats: UsageStats | null;  // {automations_executed, api_calls_made,
                                  //  storage_used_mb, llm_tokens_used,
                                  //  llm_input_tokens, llm_output_tokens,
                                  //  browser_sessions, mcp_tool_calls,
                                  //  model_usage: ModelUsageStats[]}
  usagePeriodStartSec: number;
  usagePeriodEndSec: number;
  showAutomationWarning: boolean;
  showApiCallWarning: boolean;
  showStorageWarning: boolean;
  showTokenWarning: boolean;
  usageError: string | null;
}
```

### `roiStore` (Zustand + Immer)

```typescript
interface ROIState {
  todayStats: DayStats | null;
  weekStats: WeekStats | null;
  monthStats: MonthStats | null;
  allTimeStats: AllTimeStats | null;
  lastUpdate: number;
  isConnected: boolean;               // Live WebSocket status
  updateCount: number;
  milestones: Milestone[];
  unacknowledgedMilestones: Milestone[];
  comparisonMode: ComparisonMode;      // 'manual_vs_auto' | 'period' | 'benchmark'
  comparisonData: ComparisonData | PeriodComparisonData | BenchmarkComparisonData | null;
  recentActivity: ActivityItem[];
  chartData: ChartDataPoint[];
  employeeChartData: EmployeeChartData[];
  loading: boolean;
  error: string | null;
}
```

### Managed Rust State

```rust
// TelemetryState (sys/commands/analytics.rs)
struct TelemetryState {
    collector: Arc<RwLock<TelemetryCollector>>,       // Event buffering + flush
    metrics_collector: Arc<RwLock<AnalyticsMetricsCollector>>,  // System + app metrics
}

// MetricsCollectorState (sys/commands/metrics.rs)
struct MetricsCollectorState(Arc<RealtimeMetricsCollector>);  // ROI metrics + milestones

// MetricsComparisonState (sys/commands/metrics.rs)
struct MetricsComparisonState(Arc<MetricsComparison>);  // Comparison engine
```

## Key Patterns

### Privacy Controls

1. **Opt-in by default**: `TelemetryCollector` starts with `enabled: false`. User must explicitly enable via `PrivacyConsent`.
2. **Granular consent**: Three independent toggles -- analytics, error reporting, performance monitoring.
3. **PII sanitization**: Frontend strips 10 PII field names (email, name, phone, ssn, credit_card, password, token, api_key, etc.) from all event properties before sending.
4. **Log redaction**: Rust `RedactingWriter` regex-strips API keys (`sk-*`), bearer tokens, Google API keys (`AIza*`), and GitHub tokens (`ghp_*`) from log output.
5. **Data deletion**: `deleteAllAnalyticsData()` clears localStorage (user ID, config, consent, offline events), flushes Rust-side events, and resets all store state.
6. **Data export**: Users can export all analytics data as JSON via browser download.
7. **Correlation IDs**: `CorrelationGuard` provides thread-local correlation IDs for request tracing, with `RequestContext` carrying user/session metadata.

### ROI Calculation Model

- **Time saved**: `estimated_manual_time - actual_execution_time`. Manual estimate defaults to 10x automation time.
- **Cost saved**: `time_saved_hours * avg_hourly_rate` (default $50/hr, configurable).
- **Error reduction**: Compares automation success rate against baseline error rate (default 15%).
- **Productivity gain**: Based on autonomous session completion rate * 1.5 multiplier.
- **LLM cost savings**: Tracks Ollama local tokens that would have cost ~$0.002/1K tokens on cloud.
- **Cache savings**: Sums `cost_saved` from `cache_entries` table.

### Industry Benchmarks (Hardcoded)

Comparison targets by role:
| Role | Monthly Time Saved | Monthly Cost Saved |
|------|-------------------|-------------------|
| Data Analyst | 40h | $2,000 |
| Sales Rep | 30h | $1,500 |
| Customer Support | 50h | $2,500 |
| Software Engineer | 60h | $3,000 |
| Default | 35h | $1,750 |

### Manual vs Automated Benchmarks (Hardcoded)

| Automation Type | Manual Time | Automated Time | Manual Error Rate |
|----------------|-------------|----------------|-------------------|
| Data Entry | 120 min | 5 min | 15% |
| Report Generation | 60 min | 3 min | 15% |
| Email Processing | 90 min | 4 min | 15% |
| Web Scraping | 180 min | 10 min | 15% |

### Real-time Updates

- `RealtimeMetricsCollector.record_automation_run()` stores metrics, then broadcasts via `RealtimeServer` WebSocket using `RealtimeEvent::MetricsUpdated`.
- Frontend `roiStore.subscribeToLiveUpdates()` listens on Tauri `metrics:updated` event channel.
- Milestone achievements trigger `RealtimeEvent::MilestoneReached` broadcasts.
- `LiveMetricsStream` wraps the broadcast pattern for automation completions and milestones.

### Report Generation

`ReportGenerator` produces three formats:
1. **Markdown**: Executive summary with financial impact, operational efficiency, quality metrics, top processes table, recommendations.
2. **CSV**: Tabular export of process metrics, user metrics, or tool metrics.
3. **JSON**: Full structured export with ROI report + all metric dimensions + timestamp.

`ScheduledReportGenerator` provides weekly and monthly auto-reports with snapshot persistence, comparison reports (month-over-month), trend reports, and full analytics packages (all formats combined).

### Data Retention

- `realtime_metrics`: No automatic cleanup -- grows unbounded.
- `analytics_events.json`: Capped at 10,000 events (oldest trimmed on each flush).
- `localStorage['analytics_offline_events']`: Capped at 1,000 events.
- `featureUsage` array in store: Capped at 500 entries (STR-006 fix).
- `get_metrics_history`: Paginated with max 10,000 records per query (AUDIT-004-003 fix).

## Known Issues / Tech Debt

1. **`get_recent_activity` is a stub**: Returns empty `Vec<ActivityItem>` -- needs activity tracking system implementation.
2. **Industry benchmarks are hardcoded**: `MetricsComparison.compare_to_industry_benchmark()` uses static values, not real data.
3. **Manual vs automated benchmarks are hardcoded**: `MetricsComparison.compare_to_manual()` uses fixed time/error values per automation type.
4. **Manual time estimate is naive**: `estimated_manual_time = automation_time * 10x` multiplier in ROI calculator is a rough approximation.
5. **No automatic data retention/cleanup**: `realtime_metrics` table grows unbounded over time with no TTL or archival.
6. **`analyticsQueries.ts` has stub data**: `queryRetentionRate`, `queryConversionFunnel`, `queryErrorStats`, `queryCategoryData`, `queryPerformanceMetrics` return hardcoded mock data.
7. **Telemetry endpoint not wired**: `TELEMETRY_ENDPOINT` env var is never configured in production -- all events fall back to local file storage.
8. **Duplicate store functionality**: `analyticsMetricsStore` and parts of `billingUsage` store overlap in responsibility for system/app metrics loading.
9. **Top-level usage stats are still desktop approximations**: values like `total_users`, `dau`, and `new_users_*` are synthesized for a local-first single-user product, not derived from a true multi-user analytics model.
10. **`roiStore` IPC snake_case concern**: `fetchComparison` passes `automation_type` (snake_case) to `get_manual_vs_automated_comparison` invoke -- this may silently fail per Tauri IPC rules requiring camelCase params. Needs audit.
11. **Employee names are synthetic**: `RealtimeMetricsCollector.get_top_employees()` generates names as `"Employee {employee_id}"` rather than looking up actual employee names.
12. **`share_milestone` has BOLA protection**: Ownership check is implemented (user_id verification before update), but milestone sharing has no actual sharing mechanism (just sets a `shared` flag).
13. **No WebSocket reconnection logic**: `roiStore.subscribeToLiveUpdates()` sets `isConnected = true` synchronously before the listener is established, with no reconnection on disconnect.

13. **15 commands defined but NOT registered in `generate_handler!()`**: The following commands have `#[tauri::command]` definitions in their respective files but are not listed in `lib.rs`'s `generate_handler![]` macro, making them unreachable via Tauri IPC:

    **From `sys/commands/analytics.rs`** (9 commands):
    - `metrics_increment_automations` -- Increment automation counter
    - `metrics_increment_goals` -- Increment goal counter
    - `metrics_set_mcp_servers` -- Set MCP server count
    - `metrics_set_cache_hit_rate` -- Set cache hit rate
    - `analytics_generate_weekly_report` -- Auto-generated weekly executive summary
    - `analytics_generate_monthly_report` -- Auto-generated monthly report
    - `analytics_get_top_processes` -- Top N processes by cost savings
    - `analytics_save_snapshot` -- Save ROI snapshot to analytics_snapshots table
    - `track_workflow_view` -- Track workflow page view event

    **From `sys/commands/metrics.rs`** (6 commands):
    - `record_automation_metrics` -- Record automation run, calculate savings, broadcast
    - `get_metrics_history` -- Paginated metrics history
    - `share_milestone` -- Mark milestone as shared
    - `compare_to_manual` -- Raw manual vs automated comparison data
    - `compare_to_previous_period` -- Raw period comparison data
    - `compare_to_industry_benchmark` -- Raw benchmark comparison

    Note: The higher-level aliases `get_manual_vs_automated_comparison`, `get_period_comparison`, and `get_benchmark_comparison` ARE registered and internally call the same comparison logic, so the raw `compare_to_*` commands are redundant. However, `record_automation_metrics`, `get_metrics_history`, `share_milestone`, and the 9 analytics.rs commands have no registered equivalents.
