# lib/services - Neon database adapter contract

## Rule: every service method that touches user-scoped data MUST accept a `DatabaseAdapter` parameter or use the established overload pattern.

### Why

Web platform data lives in Neon. User-scoped service methods must either receive
a caller-provided `DatabaseAdapter` or take an explicit `userId` and query with
that value. This keeps auth policy in route handlers and avoids hidden cross-user
reads in reusable services.

### Correct pattern

```ts
// USER-CONTEXT method: caller passes an RLS-bound client
static async getSubscription(
  db: DatabaseAdapter,
  userId: string,
): Promise<SubscriptionInfo | null> {
  return db.query('select ... from subscriptions where user_id = $1', [userId]);
}

// SERVICE-CONTEXT method (Stripe webhook, cron): caller uses getNeonDb()
// and the doc-comment MUST say so explicitly.
/**
 * SERVICE-CONTEXT: called from Stripe webhook or cron without a user session.
 * This method runs without user context (Stripe webhook, cron).
 */
static async resetCreditsForNewPeriod(...) { ... }
```

### Route handler responsibility

```ts
// In a user-facing route handler:
const authHeader = request.headers.get('authorization');
const jwt = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
const db = jwt ? getNeonDb().withUser(jwt) : getNeonDb();

await SubscriptionService.getSubscription(db, user.id);

// In a Stripe webhook / cron route:
await SubscriptionService.resetCreditsForNewPeriod(userId, subscriptionId, planTier, start, end); // these methods call getNeonDb() internally
```

### Adding a new service method checklist

- [ ] Does it read/write user-owned rows? Accept `db: DatabaseAdapter` or use an explicit `userId` overload.
- [ ] Is it called from a webhook, cron, or admin context only? Use `getNeonDb()` internally and document it with a `// SECURITY:` comment.

### Files in scope (all migrated as of 2026-05-05)

- `subscription-service.ts` — `getSubscription` (user), webhook/cron methods (service-role)
- `credit-service.ts` — `getBalance`, `checkAvailable`, `deductCredits` (synchronous
  reservation overloads); `settleCreditsDurably` (post-provider idempotent
  settlement); `processPendingSettlements` (cron-only cross-user recovery)
- `audit-service.ts` — `log` (service-role, system writes), `getOrganizationLogs` (user)
- `api-key-service.ts` — `createApiKey`, `listApiKeys`, `revokeApiKey` (user); `verifyKey` (service-role)
- `organization-service.ts` — all methods (user)
- `notification-service.ts` — `getUserNotifications`, `markAsRead`, `markAllAsRead` (user); `send` (service-role)
- `security-monitoring-service.ts` — all methods (service-role; admin/cross-tenant table)
