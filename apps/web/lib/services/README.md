# lib/services — Supabase client injection contract

## Rule: every service method that touches user-scoped data MUST accept a `SupabaseClient` parameter.

### Why

The Supabase service-role key bypasses ALL Row-Level Security (RLS) policies.
If a method creates its own `getServiceClient()` and then performs a user-scoped
DB operation (read or write), a single dropped `.eq('user_id', userId)` filter
would silently leak data across tenants.

### Correct pattern

```ts
// USER-CONTEXT method: caller passes an RLS-bound client
static async getSubscription(
  client: SupabaseClient,
  userId: string,
): Promise<SubscriptionInfo | null> {
  // `client` was constructed by the route handler via:
  //   import { getUserClient } from '@/lib/supabase-server';
  //   const userClient = getUserClient(jwtFromBearerHeader);
  return client.from('subscriptions').select(...).eq('user_id', userId);
}

// SERVICE-CONTEXT method (Stripe webhook, cron): caller passes getServiceClient()
// and the doc-comment MUST say so explicitly.
/**
 * SERVICE-CONTEXT: callers MUST pass `getServiceClient()` here.
 * This method runs without user context (Stripe webhook, cron).
 */
static async resetCreditsForNewPeriod(...) { ... }
```

### Route handler responsibility

```ts
import { getUserClient, getServiceClient } from '@/lib/supabase-server';

// In a user-facing route handler:
const authHeader = request.headers.get('authorization');
const jwt = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
const userClient = jwt ? getUserClient(jwt) : getServiceClient(); // cookie-path fallback; MUST still filter by user_id

await SubscriptionService.getSubscription(userClient, user.id);

// In a Stripe webhook / cron route:
await SubscriptionService.resetCreditsForNewPeriod(userId, subscriptionId, planTier, start, end); // these methods call getServiceClient() internally
```

### Adding a new service method checklist

- [ ] Does it read/write user-owned rows? Accept `client: SupabaseClient`.
- [ ] Is it called from a webhook, cron, or admin context only? Use `getServiceClient()` internally and document it with a `// SECURITY:` comment.
- [ ] Never define a private `getSupabaseClient()` inside a route file or service file. Use the canonical exports from `@/lib/supabase-server`.

### Files in scope (all migrated as of 2026-05-05)

- `subscription-service.ts` — `getSubscription` (user), webhook/cron methods (service-role)
- `credit-service.ts` — `getBalance`, `checkAvailable`, `deductCredits` (overload pattern)
- `audit-service.ts` — `log` (service-role, system writes), `getOrganizationLogs` (user)
- `api-key-service.ts` — `createApiKey`, `listApiKeys`, `revokeApiKey` (user); `verifyKey` (service-role)
- `organization-service.ts` — all methods (user)
- `notification-service.ts` — `getUserNotifications`, `markAsRead`, `markAllAsRead` (user); `send` (service-role)
- `security-monitoring-service.ts` — all methods (service-role; admin/cross-tenant table)
