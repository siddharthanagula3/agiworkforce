# Analytics and Telemetry System

Comprehensive analytics tracking, performance monitoring, and user behavior analytics for AGI Workforce desktop app.

## Features

- **Privacy-First**: Opt-in analytics with no PII collection
- **Event Tracking**: Track user actions, feature usage, and behavior
- **Performance Monitoring**: Real-time system and app metrics
- **Error Tracking**: Sentry integration for crash reporting
- **Feature Flags**: Remote toggles and A/B testing
- **Offline Support**: Queue events when offline
- **GDPR/CCPA Compliant**: Data export and deletion

## Architecture

### Frontend (TypeScript)

```
src/
├── services/
│   ├── analytics.ts              # Main analytics service
│   ├── performance.ts             # Performance monitoring
│   ├── errorTracking.ts           # Sentry integration
│   ├── featureFlags.ts            # Feature flag service
│   └── analyticsQueries.ts        # Dashboard queries
├── stores/
│   └── analyticsStore.ts          # Zustand store
├── types/
│   └── analytics.ts               # Type definitions
├── utils/
│   └── eventTracking.ts           # Tracking utilities
└── components/
    ├── Analytics/
    │   └── UsageDashboard.tsx     # Analytics dashboard
    └── Settings/
        └── AnalyticsSettings.tsx  # Privacy controls
```

### Backend (Rust)

```
src-tauri/src/
├── telemetry/
│   ├── collector.rs               # Event batching
│   ├── analytics_metrics.rs       # System/app metrics
│   ├── metrics.rs                 # Performance metrics
│   ├── logging.rs                 # Structured logging
│   └── tracing.rs                 # Error tracing
└── commands/
    └── analytics.rs               # Tauri commands
```

## Quick Start

### 1. Install Dependencies

```bash
# Frontend
pnpm add uuid @sentry/react @sentry/tauri

# Backend (already included)
# sysinfo, uuid, serde_json
```

### 2. Initialize Analytics

```typescript
import { analytics } from './services/analytics';
import { errorTracking, setupGlobalErrorHandler } from './services/errorTracking';
import { featureFlags } from './services/featureFlags';

// Initialize on app startup
analytics.setUserProperties({
  app_version: '1.0.0',
  plan_tier: 'free',
  install_date: new Date().toISOString(),
});

// Set up error tracking
setupGlobalErrorHandler();
errorTracking.initialize();

// Track app opened
analytics.track('app_opened', {
  timestamp: Date.now(),
});
```

### 3. Track Events

```typescript
import { trackAutomationEvents, trackGoalEvents } from './utils/eventTracking';

// Track automation execution
trackAutomationEvents.executed('automation-123', 5000, true);

// Track goal completion
trackGoalEvents.completed('goal-456', 30000, 5, ['file_read', 'ui_click']);

// Track custom events
analytics.track('feature_discovered', {
  feature_name: 'parallel_execution',
  discovery_method: 'tooltip',
});
```

### 4. Monitor Performance

```typescript
import { performanceMonitor } from './services/performance';

// Mark performance points
performanceMonitor.mark('operation-start');
// ... do operation
performanceMonitor.mark('operation-end');
performanceMonitor.measure('operation-duration', 'operation-start', 'operation-end');

// Time async operations
await performanceMonitor.timeOperation('api-call', async () => {
  return await fetch('/api/endpoint');
});

// Get system metrics
const systemMetrics = await performanceMonitor.getSystemMetrics();
console.log(`CPU: ${systemMetrics.cpu_usage}%`);
```

### 5. Use Feature Flags

```typescript
import { featureFlags } from './services/featureFlags';

// Check if feature is enabled
if (featureFlags.isEnabled('parallel_execution')) {
  // Enable feature
}

// Get all enabled features
const enabled = featureFlags.getEnabledFeatures();

// Override locally (development)
featureFlags.setLocalOverride('new_dashboard', true);
```

### 6. Handle Errors

```typescript
import { errorTracking, ErrorSeverity } from './services/errorTracking';

try {
  // Risky operation
} catch (error) {
  errorTracking.captureError(error as Error, {
    component: 'AutomationEditor',
    severity: ErrorSeverity.HIGH,
    tags: { automation_type: 'browser' },
  });
}
```

## Privacy Controls

### User Consent

```typescript
import { analytics } from './services/analytics';

// Update privacy consent
analytics.updatePrivacyConsent({
  analytics_enabled: true,
  error_reporting_enabled: true,
  performance_monitoring_enabled: true,
  consent_date: new Date().toISOString(),
  consent_version: '1.0',
});
```

### Data Export (GDPR)

```typescript
// Export user data
await analytics.exportData(); // Downloads JSON file

// Delete all data
await analytics.deleteAllData();
```

## Event Types

### Core Events

- `app_opened`, `app_closed`, `app_updated`
- `session_started`, `session_ended`

### Automation Events

- `automation_created`, `automation_executed`, `automation_failed`
- `automation_scheduled`, `automation_deleted`

### AGI Events

- `goal_submitted`, `goal_completed`, `goal_failed`
- `step_executed`, `parallel_agents_started`

### Chat Events

- `chat_message_sent`, `chat_conversation_started`
- `chat_cleared`, `chat_exported`

### Feature Events

- `feature_discovered`, `feature_enabled`, `feature_disabled`

See `src/types/analytics.ts` for complete event list.

## Dashboard

The usage dashboard displays:

- Daily/Monthly Active Users (DAU/MAU)
- Feature usage distribution
- Top events and trends
- System metrics (CPU, memory, disk)
- App metrics (automations, goals, cache hit rate)
- Performance metrics (page load, API response times)

Access at `/analytics` route.

## Configuration

### Analytics Config

```typescript
analytics.updateConfig({
  enabled: true,
  batchSize: 50,              // Events before flush
  batchInterval: 30000,       // Flush every 30s
  offline: true,              // Queue offline
  allowErrorReporting: true,
  allowPerformanceMonitoring: true,
});
```

### Error Tracking Config

```typescript
errorTracking.updateConfig({
  enabled: true,
  dsn: 'https://your-sentry-dsn',
  environment: 'production',
  sampleRate: 1.0,            // 100% of errors
  tracesSampleRate: 0.1,      // 10% of traces
});
```

### Feature Flags Config

Feature flags are configured in `src/services/featureFlags.ts`. They support:

- **Rollout Percentage**: Gradually roll out to X% of users
- **User Targeting**: Enable for specific user IDs
- **Plan Tier Targeting**: Enable for specific plan tiers
- **Local Overrides**: Override for development

## Testing

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { AnalyticsService } from './services/analytics';

describe('AnalyticsService', () => {
  it('should track events when enabled', () => {
    const service = new AnalyticsService();
    service.updateConfig({ enabled: true });
    service.track('test_event', {});
    expect(service.getSessionInfo().events_count).toBe(1);
  });
});
```

Run tests:

```bash
pnpm test
pnpm test:coverage
```

### Integration Tests

Test event tracking in actual components:

```typescript
import { render, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('./services/analytics');

it('tracks automation creation', () => {
  const { getByText } = render(<AutomationEditor />);
  fireEvent.click(getByText('Create'));
  expect(analytics.track).toHaveBeenCalledWith('automation_created', expect.any(Object));
});
```

## Performance Considerations

- Events are batched (default: 50 events or 30s)
- Offline queue limited to 1000 events
- Metrics collected every 30s
- No PII collected (automatically sanitized)
- Minimal performance impact (<1% CPU overhead)

## Security

- **No PII**: Names, emails, IPs are never collected
- **Sanitization**: Automatic removal of sensitive data
- **Encryption**: All data encrypted in transit (HTTPS)
- **Opt-in**: Analytics disabled by default
- **Transparency**: Full data access and deletion

## Compliance

### GDPR

- ✅ Right to access data (export)
- ✅ Right to deletion
- ✅ Right to opt-out
- ✅ Data minimization (no PII)
- ✅ Consent management

### CCPA

- ✅ Right to know (data export)
- ✅ Right to delete
- ✅ Right to opt-out
- ✅ Transparent data practices

## Best Practices

1. **Track meaningful events**: Focus on user journey and feature usage
2. **Avoid over-tracking**: Don't track every click, be selective
3. **Respect privacy**: Never log PII or sensitive data
4. **Test tracking**: Verify events in dev/staging
5. **Monitor performance**: Check that tracking doesn't slow app
6. **Review retention**: Clean up old data periodically
7. **Document events**: Keep event catalog up to date

## Troubleshooting

### Events not tracking

1. Check if analytics is enabled: `analytics.isEnabled()`
2. Check privacy consent: `analytics.getPrivacyConsent()`
3. Check browser console for errors
4. Verify Tauri commands are registered

### Dashboard not loading

1. Check if metrics collector is initialized
2. Verify backend commands are available
3. Check for CORS issues (if using remote backend)

### High memory usage

1. Reduce batch size: `updateConfig({ batchSize: 25 })`
2. Increase flush interval: `updateConfig({ batchInterval: 15000 })`
3. Disable offline queue: `updateConfig({ offline: false })`

## Future Enhancements

- [ ] Real-time dashboard updates via WebSockets
- [ ] Cohort analysis and segmentation
- [ ] Funnel visualization
- [ ] A/B test results dashboard
- [ ] Anomaly detection and alerts
- [ ] Session replay (privacy-preserving)
- [ ] User journey mapping
- [ ] Predictive churn analysis

## Resources

- [GDPR Compliance Guide](https://gdpr.eu/)
- [CCPA Compliance Guide](https://oag.ca.gov/privacy/ccpa)
- [Sentry Documentation](https://docs.sentry.io/)
- [Recharts Documentation](https://recharts.org/)
- [Feature Flag Best Practices](https://launchdarkly.com/blog/dos-and-donts-of-feature-flag-management/)
