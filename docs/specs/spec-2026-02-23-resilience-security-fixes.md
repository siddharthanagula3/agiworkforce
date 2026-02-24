# Specification: Resilience & Security Audit Fix Implementation

Generated: 2026-02-23T12:00:00Z

## Task Overview

Implement all fixes identified in the resilience and security audit across 5 parallel agents. Changes span Supabase migrations, API gateway auth hardening, Rust backend resilience (cost caps + circuit breaker), frontend resilience (banners + error boundaries), and web rate limiting / API key logging fixes.

## Team Composition

- **Agent A**: Database & RLS Fixes (Supabase migration)
- **Agent B**: API Gateway Auth Hardening + Admin Kill Switch
- **Agent C**: Rust Backend Resilience (cost caps + circuit breaker)
- **Agent D**: Frontend Resilience (StatusBanner + error boundaries + degraded state)
- **Agent E**: Web Rate Limiting & API Key Logging

## Cross-Agent Dependencies

```
Agent A (migration) --[MUST APPLY FIRST]--> Agent B (auth middleware queries profiles.account_status)
All other agents are independent of each other.
```

Agent B's auth middleware change (querying `profiles.account_status`) will fail at runtime if Agent A's migration has not been applied. However, all agents can write their code in parallel -- the migration just needs to be applied to the database before Agent B's code is deployed.

---

## File Allocation

### Agent A: Database & RLS Fixes

**Files to CREATE:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260223000000_resilience_security_fixes.sql`

**Files to READ (do not modify):**

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260101000000_consolidated_schema.sql` (profiles table definition at line 9-18)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260115000000_critical_fixes_gdpr_compliance.sql` (handle_refund at line 16-64, export_user_data at line 304-468, export_my_data at line 478-504)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260117000000_add_web_chat.sql` (update_web_conversation_timestamp at line 76-84)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260108000002_fix_claim_beta_invite_rpc_security.sql` (claim_beta_invite, already has `SET search_path`)

**DO NOT TOUCH:**

- Any existing migration files -- all changes go into the single new migration file

**Current State:**

- `profiles` table (consolidated_schema.sql line 9-18): has columns `id`, `email`, `display_name`, `avatar_url`, `created_at`, `updated_at`. NO `account_status` column exists.
- `handle_refund` function (critical_fixes.sql line 16-64): `SECURITY DEFINER` but NO `SET search_path` clause.
- `update_web_conversation_timestamp` function (add_web_chat.sql line 76-84): NO `SECURITY DEFINER` (it's a trigger function), but it should still have `SET search_path` added since it references `public.web_conversations`.
- `claim_beta_invite` function (fix_claim_beta_invite.sql line 3-123): ALREADY has `SET search_path TO 'public', 'pg_temp'`. No change needed.
- `export_user_data(UUID)` function: Currently granted to `authenticated` role (line 468). The `export_my_data()` wrapper also exists (line 478-504) and is the safe entry point.

**Will Produce -- exact SQL for the new migration file:**

```sql
-- Migration: Resilience & Security Audit Fixes
-- Date: 2026-02-23
--
-- This migration addresses:
-- 1. P0 Kill Switch: Add account_status column to profiles table
-- 2. P2 export_user_data: Revoke direct access, force use of export_my_data() wrapper
-- 3. M3 search_path: Add SET search_path to SECURITY DEFINER functions missing it

-- =============================================================================
-- 1. P0 KILL SWITCH: Add account_status column to profiles table
-- =============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
CHECK (account_status IN ('active', 'suspended', 'banned', 'disabled'));

COMMENT ON COLUMN public.profiles.account_status IS
  'Account status for kill switch. Only active accounts can authenticate. Values: active, suspended, banned, disabled.';

-- Index for quick lookup during auth middleware checks
CREATE INDEX IF NOT EXISTS idx_profiles_account_status
  ON public.profiles(account_status)
  WHERE account_status != 'active';

-- =============================================================================
-- 2. P2 EXPORT_USER_DATA: Revoke direct authenticated access
-- =============================================================================

-- Revoke EXECUTE on the raw export_user_data(UUID) from authenticated role.
-- Users must use export_my_data() which enforces auth.uid() scoping.
REVOKE EXECUTE ON FUNCTION public.export_user_data(UUID) FROM authenticated;

-- Ensure export_my_data() still has access (it calls export_user_data internally
-- via SECURITY DEFINER, so it runs as the function owner, not as the caller)
-- This GRANT is idempotent:
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- =============================================================================
-- 3. M3 SEARCH_PATH: Fix SECURITY DEFINER functions missing SET search_path
-- =============================================================================

-- 3a. handle_refund: Add SET search_path
CREATE OR REPLACE FUNCTION public.handle_refund(
  p_user_id UUID,
  p_refund_amount_cents INTEGER,
  p_reason TEXT DEFAULT 'Refund processed'
) RETURNS BOOLEAN AS $$
DECLARE
  v_account RECORD;
  v_credits_to_revoke INTEGER;
BEGIN
  -- Get the user's credit account
  SELECT * INTO v_account
  FROM public.token_credits
  WHERE user_id = p_user_id
  ORDER BY period_end DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Calculate credits to revoke (proportional to refund)
  v_credits_to_revoke := LEAST(p_refund_amount_cents, v_account.credits_remaining_cents);

  -- Deduct credits
  UPDATE public.token_credits
  SET
    credits_remaining_cents = credits_remaining_cents - v_credits_to_revoke,
    updated_at = NOW()
  WHERE id = v_account.id;

  -- Record the transaction
  INSERT INTO public.credit_transactions (
    user_id,
    credit_account_id,
    amount_cents,
    transaction_type,
    description
  ) VALUES (
    p_user_id,
    v_account.id,
    -v_credits_to_revoke,
    'refund',
    p_reason
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp';

-- Ensure proper permissions (idempotent)
GRANT EXECUTE ON FUNCTION public.handle_refund TO service_role;

-- 3b. update_web_conversation_timestamp: Add SET search_path
-- Note: This is a trigger function. Adding SECURITY DEFINER + search_path
-- ensures it cannot be exploited via search_path injection.
CREATE OR REPLACE FUNCTION update_web_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.web_conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp';

-- 3c. claim_beta_invite: Already has SET search_path (no change needed)
-- Verified in migration 20260108000002_fix_claim_beta_invite_rpc_security.sql

-- =============================================================================
-- 4. Analyze affected tables
-- =============================================================================
ANALYZE public.profiles;
```

---

### Agent B: API Gateway Auth Hardening

**Files to MODIFY:**

- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/middleware/auth.ts` (47 lines)
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/routes/auth.ts` (147 lines)
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/websocket.ts` (420 lines)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/admin/security/route.ts` (189 lines)

**Files to READ (do not modify):**

- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/lib/supabase.ts` (supabase client, uses service_role key)
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/env.ts` (requireEnv helper)
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/authenticated-user.ts` (authenticatedUserSchema)

**DO NOT TOUCH:**

- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/middleware/rateLimit.ts` -- Agent E does NOT touch this; only web rate-limit.ts
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/index.ts`
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/routes/desktop.ts`
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/routes/credits.ts`

**Current State & Changes Required:**

#### B1. P0 Kill Switch middleware (`auth.ts`)

Current `auth.ts` line 29: `const payload = jwt.verify(token, JWT_SECRET);`
No algorithm pinning, no audience/issuer, no account_status check.

**Changes:**

1. Import `supabase` from `../lib/supabase`
2. After `jwt.verify()` at line 29, add `{ algorithms: ['HS256'] }` as second options arg
3. Add `issuer: 'agiworkforce-api-gateway'` and `audience: 'agiworkforce'` to verify options
4. After `req.user = authenticatedUserSchema.parse(payload)`, query `profiles.account_status` via supabase:

```typescript
// P0 Kill Switch: Check account status
const { data: profile } = await supabase
  .from('profiles')
  .select('account_status')
  .eq('id', req.user.userId)
  .single();

if (!profile || profile.account_status !== 'active') {
  const status = profile?.account_status || 'unknown';
  res.status(403).json({
    error: `Account ${status}. Contact support for assistance.`,
    code: 'ACCOUNT_NOT_ACTIVE',
  });
  return;
}
```

5. The function must become `async` (currently sync). Change signature to `export async function authenticateToken(...)` and wrap the existing try/catch body to support `await`.

**Exact modification to auth.ts:**

Replace the entire file content. Key changes:

- Line 1: Add `import { supabase } from '../lib/supabase';`
- Line 16: Change `export function authenticateToken` to `export async function authenticateToken`
- Line 29: Change `jwt.verify(token, JWT_SECRET)` to `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'agiworkforce-api-gateway', audience: 'agiworkforce' })`
- After line 30 (after `req.user = ...parse(payload)`): Insert the kill switch check block above

#### B2. P0 Admin ban endpoint (`route.ts` for admin/security)

Current file at `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/admin/security/route.ts`:

- POST handler (line 155-188) only supports `action=cleanup`
- Need to add `suspend-user` and `ban-user` actions

**Add to the POST handler's switch statement (after `case 'cleanup'` block, before `default`):**

```typescript
case 'suspend-user':
case 'ban-user': {
  const body = await request.json();
  const targetUserId = body.userId;
  const reason = body.reason || `Account ${action.replace('-', ' ')} by admin`;

  if (!targetUserId || typeof targetUserId !== 'string') {
    return NextResponse.json(
      { error: 'userId is required in request body' },
      { status: 400 },
    );
  }

  const newStatus = action === 'suspend-user' ? 'suspended' : 'banned';

  const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Update account_status in profiles
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ account_status: newStatus })
    .eq('id', targetUserId);

  if (updateError) {
    logger.error({ error: updateError, targetUserId, action }, 'Failed to update account status');
    return NextResponse.json(
      { error: 'Failed to update account status', detail: updateError.message },
      { status: 500 },
    );
  }

  // Revoke all active sessions for the user via Supabase Auth Admin API
  const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(targetUserId, 'global');

  if (signOutError) {
    logger.warn(
      { error: signOutError, targetUserId },
      'Account status updated but failed to revoke sessions',
    );
  }

  // Log the admin action
  await SecurityMonitoringService.logEvent({
    eventType: 'admin_action',
    severity: 'high',
    userId: targetUserId,
    metadata: { action, reason, performedBy: (await verifyAdminAccess(request)).userId },
  });

  logger.info({ targetUserId, action, newStatus, reason }, 'Admin account action performed');

  return NextResponse.json({
    success: true,
    action,
    userId: targetUserId,
    newStatus,
    sessionsRevoked: !signOutError,
    reason,
  });
}
```

NOTE: The `supabase.auth.admin.signOut(userId, 'global')` method uses the service role key to revoke all sessions. Verify this API exists in the version of `@supabase/supabase-js` used in the project. If not available, use `supabase.auth.admin.deleteUser(userId)` or a direct API call.

#### B3. M1 JWT algorithm pinning

Three locations need `{ algorithms: ['HS256'] }`:

1. **auth.ts line 29**: `jwt.verify(token, JWT_SECRET)` -> `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'agiworkforce-api-gateway', audience: 'agiworkforce' })`

2. **auth.ts (routes) line 138**: `jwt.verify(token, JWT_SECRET)` -> `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'agiworkforce-api-gateway', audience: 'agiworkforce' })`

3. **websocket.ts line 311**: `jwt.verify(message.token, JWT_SECRET)` -> `jwt.verify(message.token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'agiworkforce-api-gateway', audience: 'agiworkforce' })`

#### B4. M2 JWT audience/issuer in jwt.sign()

Two `jwt.sign()` calls need `issuer` and `audience`:

1. **auth.ts (routes) line 86-88**:

```typescript
// BEFORE:
const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, {
  expiresIn: JWT_EXPIRES_IN,
});
// AFTER:
const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, {
  expiresIn: JWT_EXPIRES_IN,
  issuer: 'agiworkforce-api-gateway',
  audience: 'agiworkforce',
});
```

2. **auth.ts (routes) line 117-119**: Same change as above.

#### B5. L1 Bearer parsing fix in /verify endpoint

**auth.ts (routes) line 132**:

```typescript
// BEFORE:
const token = req.headers.authorization?.replace('Bearer ', '');
// AFTER (secure split-based parsing):
const parts = req.headers.authorization?.split(' ');
const token = parts?.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : undefined;
```

Also add algorithm/audience/issuer to the `jwt.verify()` on line 138.

---

### Agent C: Rust Backend Resilience

**Files to MODIFY:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/mod.rs` (300 lines)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/autonomous.rs` (812 lines)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/background_agent.rs` (~1300 lines)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/fallback_chain.rs` (1216 lines)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/llm_router.rs` (~2000 lines)

**Files to READ (do not modify):**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/cost_calculator.rs` (CostCalculator::calculate method at line 679-713)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/mod.rs` (Provider enum, LLMResponse type)

**DO NOT TOUCH:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/planner.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/approval.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/cost_calculator.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`
- All files in `apps/desktop/src/` (frontend -- Agent D's domain)

**Current State & Changes Required:**

#### C1. P1 Agent cost caps in AgentConfig

**mod.rs** -- `AgentConfig` struct (line 253-266):

Current fields: `auto_approve`, `max_concurrent_tasks`, `default_timeout`, `max_retries`, `use_local_llm_fallback`, `local_llm_threshold_tokens`, `screenshot_quality`, `vision_model`, `cpu_limit_percent`, `memory_limit_mb`.

**Add two new fields to the struct (after `memory_limit_mb` at line 266):**

```rust
/// Maximum cost allowed per individual task in USD (default $5.00)
pub max_cost_per_task: f64,
/// Maximum cumulative cost allowed per session in USD (default $50.00)
pub max_session_cost: f64,
```

**Update the Default impl (line 284-298) to include:**

```rust
max_cost_per_task: 5.0,
max_session_cost: 50.0,
```

Also update the Serialize struct field count in `Task::serialize` -- but `Task` and `AgentConfig` are separate structs, so only `AgentConfig` needs updating. Since `AgentConfig` derives `Serialize`/`Deserialize`, the new fields will be automatically included.

#### C2. Cost tracking in autonomous.rs execution loop

The `execute_task` method (line 361-676) runs steps in a loop. Cost tracking needs to:

1. Initialize a `cumulative_cost: f64 = 0.0` before the step loop
2. After each successful step, estimate cost (the step result doesn't carry cost directly, but we can track LLM calls via the router). For a simpler approach: add a `session_cost` field to `AutonomousAgent` itself.

**Recommended approach:**

Add a shared `session_cost: Arc<parking_lot::Mutex<f64>>` field to `AutonomousAgent`.

In `autonomous.rs`:

1. Add field to struct (after `app_handle` at line 42):

```rust
session_cost: Arc<parking_lot::Mutex<f64>>,
```

2. Initialize in `new()` (line 56-69):

```rust
session_cost: Arc::new(parking_lot::Mutex::new(0.0)),
```

3. In `execute_task()`, after the step execution loop succeeds (around line 408), add cost checking. Since `TaskExecutor` does not return cost info directly, we need a different approach:

**Best approach**: Track cost at the LLM router level. The `AutonomousAgent` uses `self.router` (an `Arc<RwLock<LLMRouter>>`). The `LLMRouter` already has `CostCalculator`. We should add a `get_session_cost()` method to the router, or more practically, add cost accumulation to the AutonomousAgent by checking `RouteOutcome.cost` after LLM calls.

However, the planner uses `self.router.read().await.send_message(...)` which internally calls `route_with_retry` and returns the response text (not cost). The cost is calculated but not returned to the caller.

**Practical implementation**: Add a cumulative cost tracker to `AutonomousAgent` and have the planner/replan calls report cost back.

**Simpler viable approach**: Add a `task_cost: f64` tracker in `execute_task()`, and after each step execution, estimate the cost based on a reasonable per-step estimate, or better, instrument the `LLMRouter` to expose a session cost counter.

**Recommended implementation (simplest, most robust):**

Add an `AtomicF64`-like tracker to `LLMRouter` that accumulates cost from every `invoke_candidate` call:

In **llm_router.rs**:

1. Add `cumulative_cost: Arc<parking_lot::Mutex<f64>>` field to `LLMRouter` struct (after line 221)
2. Initialize to 0.0 in `LLMRouter::new()`
3. In `invoke_candidate()` (line 813), after computing cost, add: `*self.cumulative_cost.lock() += outcome.cost;`
4. Add public method:

```rust
pub fn get_cumulative_cost(&self) -> f64 {
    *self.cumulative_cost.lock()
}

pub fn reset_cumulative_cost(&self) {
    *self.cumulative_cost.lock() = 0.0;
}
```

In **autonomous.rs**:

1. In `execute_task()`, before the step loop, record the starting cost:

```rust
let cost_before_task = self.router.read().await.get_cumulative_cost();
```

2. After each step completes successfully (inside the loop, after line 428):

```rust
// P1: Check cost caps
let current_cost = self.router.read().await.get_cumulative_cost();
let task_cost = current_cost - cost_before_task;
if task_cost > self.config.max_cost_per_task {
    task.status = TaskStatus::Failed(format!(
        "Task cost cap exceeded: ${:.2} > ${:.2} limit",
        task_cost, self.config.max_cost_per_task
    ));
    tracing::warn!(
        "[Agent] Task {} aborted: cost ${:.2} exceeds per-task cap ${:.2}",
        task_id, task_cost, self.config.max_cost_per_task
    );
    break;
}
if current_cost > self.config.max_session_cost {
    task.status = TaskStatus::Failed(format!(
        "Session cost cap exceeded: ${:.2} > ${:.2} limit",
        current_cost, self.config.max_session_cost
    ));
    tracing::warn!(
        "[Agent] Task {} aborted: session cost ${:.2} exceeds cap ${:.2}",
        task_id, current_cost, self.config.max_session_cost
    );
    break;
}
```

In **background_agent.rs**:
In `execute_background_agent()` (line 1098-1101), where `AgentConfig` is created:

```rust
let config = AgentConfig {
    auto_approve: true,
    max_cost_per_task: 5.0,   // Background agents use default caps
    max_session_cost: 50.0,
    ..Default::default()
};
```

This is already covered by `Default::default()`, but making it explicit documents the intent.

Also include `session_cost` in `clone_for_task()` (line 782-800) -- share the same Arc.

#### C3. M4 Circuit breaker for 5xx in fallback_chain.rs

**fallback_chain.rs** -- `RateLimitTracker` struct (line 267-273):

Add a new method `record_server_error()` with a shorter cooldown (15s base, 120s max):

```rust
/// Record a 5xx server error for a provider/model.
/// Uses a shorter cooldown than rate limits (15s base, 120s max) to temporarily
/// back off from providers returning server errors.
pub fn record_server_error(
    &self,
    provider: Provider,
    model: Option<&str>,
) {
    let key = format!("5xx:{}", self.key(provider, model));
    let mut cooldowns = self.cooldowns.write();

    let existing = cooldowns.get(&key);
    let consecutive_hits = existing.map(|e| e.consecutive_hits + 1).unwrap_or(1);

    // Shorter cooldown for server errors: 15s base, 120s max
    let base_duration = Duration::from_secs(15);
    let max_duration = Duration::from_secs(120);
    let backoff_factor = self
        .config
        .backoff_multiplier
        .powi((consecutive_hits - 1) as i32);
    let duration = Duration::from_secs_f64(
        (base_duration.as_secs_f64() * backoff_factor)
            .min(max_duration.as_secs_f64()),
    );

    tracing::warn!(
        provider = %provider.as_string(),
        model = model.unwrap_or("(provider-level)"),
        consecutive_hits = consecutive_hits,
        cooldown_secs = duration.as_secs(),
        "Server error (5xx) recorded, entering cooldown"
    );

    cooldowns.insert(
        key,
        CooldownEntry {
            started_at: Some(Instant::now()),
            duration,
            consecutive_hits,
            model: model.map(String::from),
        },
    );
}
```

Also update `is_rate_limited()` to check both rate-limit and 5xx keys:
Add after line 319 (after the provider-level check):

```rust
// Also check 5xx cooldown
let error_key = format!("5xx:{}", model_key);
if let Some(entry) = cooldowns.get(&error_key) {
    if !entry.is_expired() {
        return true;
    }
}
let error_provider_key = format!("5xx:{}", provider_key);
if let Some(entry) = cooldowns.get(&error_provider_key) {
    if !entry.is_expired() {
        return true;
    }
}
```

**llm_router.rs** -- `invoke_with_retry()` (line 1017-1058):

After the `if !is_retryable || attempt == retry_config.max_retries` block at line 1042-1045, before `break`, add server error recording. This requires access to the fallback chain's tracker, but `LLMRouter` does not currently hold a `FallbackChain` reference.

**Practical approach**: Add an optional `rate_limit_tracker: Option<Arc<RateLimitTracker>>` to `LLMRouter` struct. In `invoke_with_retry()`, when a non-retryable 5xx error occurs, record it.

Alternatively, simpler: detect 5xx in the error string and record it via a tracker stored on LLMRouter:

1. Add to `LLMRouter` struct (after `db_connection` field, line 222):

```rust
rate_limit_tracker: Option<Arc<crate::core::llm::fallback_chain::RateLimitTracker>>,
```

2. Initialize to `None` in `LLMRouter::new()` and add setter:

```rust
pub fn set_rate_limit_tracker(&mut self, tracker: Arc<crate::core::llm::fallback_chain::RateLimitTracker>) {
    self.rate_limit_tracker = Some(tracker);
}
```

3. In `invoke_with_retry()` at line 1042-1045, after deciding not to retry:

```rust
// M4: Record server errors for circuit breaker
if is_server_error(&error_str) {
    if let Some(ref tracker) = self.rate_limit_tracker {
        tracker.record_server_error(
            candidate.provider,
            Some(&candidate.model),
        );
    }
}
```

4. Add helper function in llm_router.rs:

```rust
fn is_server_error(error: &str) -> bool {
    let error_lower = error.to_lowercase();
    error_lower.contains("500")
        || error_lower.contains("502")
        || error_lower.contains("503")
        || error_lower.contains("504")
        || error_lower.contains("internal server error")
        || error_lower.contains("bad gateway")
        || error_lower.contains("service unavailable")
        || error_lower.contains("gateway timeout")
}
```

---

### Agent D: Frontend Resilience

**Files to CREATE:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/StatusBanner.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/dashboard/error.tsx`

**Files to MODIFY:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/App.tsx` (527+ lines)

**Files to READ (do not modify):**

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/error.tsx` (root-level error boundary, 76 lines -- use as style reference)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/dashboard/page.tsx` (dashboard page structure)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/ErrorHandling/` (existing ErrorBoundary component)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Errors/ErrorToast.tsx` (existing error toast pattern)

**DO NOT TOUCH:**

- Any Rust files (Agent C's domain)
- Any API route files (Agent B/E's domain)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/error.tsx` (root error -- do not modify)

**Current State & Changes Required:**

#### D1. P3 StatusBanner component

**Create `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/StatusBanner.tsx`:**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Info, XCircle, X } from 'lucide-react';

interface StatusMessage {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  dismissible: boolean;
  expiresAt?: string;
}

interface StatusJson {
  messages: StatusMessage[];
  updatedAt: string;
}

const STATUS_URL = process.env.VITE_STATUS_URL || 'https://status.agiworkforce.com/status.json';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const severityStyles = {
  info: {
    bg: 'bg-blue-500/10 border-blue-500/30',
    text: 'text-blue-300',
    Icon: Info,
  },
  warning: {
    bg: 'bg-amber-500/10 border-amber-500/30',
    text: 'text-amber-300',
    Icon: AlertTriangle,
  },
  critical: {
    bg: 'bg-red-500/10 border-red-500/30',
    text: 'text-red-300',
    Icon: XCircle,
  },
};

export function StatusBanner() {
  const [messages, setMessages] = useState<StatusMessage[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(STATUS_URL, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return;
      const data: StatusJson = await response.json();
      const now = new Date().toISOString();
      const active = data.messages.filter((m) => !m.expiresAt || m.expiresAt > now);
      setMessages(active);
    } catch {
      // Silently fail -- status banner is non-critical
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleDismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const visible = messages.filter((m) => !dismissed.has(m.id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-0">
      {visible.map((msg) => {
        const style = severityStyles[msg.severity] || severityStyles.info;
        const IconComponent = style.Icon;
        return (
          <div
            key={msg.id}
            className={`${style.bg} border-b px-4 py-2 flex items-center gap-2 text-sm ${style.text}`}
          >
            <IconComponent className="h-4 w-4 shrink-0" />
            <span className="font-medium">{msg.title}</span>
            <span className="opacity-80">{msg.message}</span>
            {msg.dismissible && (
              <button
                onClick={() => handleDismiss(msg.id)}
                className="ml-auto p-0.5 rounded hover:bg-white/10"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

#### D2. Add StatusBanner to App.tsx

In `App.tsx`, after the existing `{!isTauri && (` block (line 451-455), add the StatusBanner. Import it at the top (lazy or direct).

**At the top of the file (after line 48, after the UpdateChecker import):**

```typescript
import { StatusBanner } from './components/StatusBanner';
```

**In the JSX return of DesktopShell, inside the `<div className="flex h-screen...">` (line 450), insert after line 455 (after the isTauri conditional block):**

```tsx
<StatusBanner />
```

#### D3. M8 Degraded-state banner for subscription fetch failure

In `App.tsx`, the `DesktopShell` component needs to detect when subscription data fetch has failed and show a banner.

**Approach**: Import `useAccountStore` and check for `subscriptionFetchStatus`. The account store is in `apps/desktop/src/stores/accountStore.ts`. Check if it exposes a fetch status. If not, the agent should check the store's state and add a simple "failed" tracking mechanism.

**Simpler approach**: Add the banner conditionally. Add state to DesktopShell:

After the existing state declarations (around line 64):

```typescript
const [subscriptionFetchFailed, setSubscriptionFetchFailed] = useState(false);
```

In the async init block (around line 145-219), after `await useAccountStore.getState().syncWithBackend()` call, add error handling:

```typescript
// M8: Track subscription fetch status for degraded-state banner
try {
  await useAccountStore.getState().syncWithBackend();
} catch {
  setSubscriptionFetchFailed(true);
}
```

In the JSX, after the StatusBanner (inside the flex column container):

```tsx
{
  subscriptionFetchFailed && (
    <div className="bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between text-sm text-amber-300">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>Using cached account data. Subscription status may be outdated.</span>
      </div>
      <button
        onClick={() => {
          setSubscriptionFetchFailed(false);
          import('./stores/accountStore').then(({ useAccountStore }) => {
            void useAccountStore
              .getState()
              .syncWithBackend()
              .catch(() => {
                setSubscriptionFetchFailed(true);
              });
          });
        }}
        className="ml-4 px-3 py-1 rounded text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
```

Import `AlertTriangle` from lucide-react (already imported on line 15).

#### D4. M7 Dashboard error boundary

**Create `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/dashboard/error.tsx`:**

```tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Home, WifiOff, AlertTriangle } from 'lucide-react';

function isConnectionError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('connection') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('load failed')
  );
}

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  const connectionIssue = isConnectionError(error);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-zinc-800 mx-auto mb-6 flex items-center justify-center">
          {connectionIssue ? (
            <WifiOff className="h-8 w-8 text-amber-500" />
          ) : (
            <AlertTriangle className="h-8 w-8 text-red-500" />
          )}
        </div>

        <h2 className="text-xl font-semibold text-white mb-2">
          {connectionIssue ? 'Service Temporarily Unavailable' : 'Something Went Wrong'}
        </h2>

        <p className="text-zinc-400 mb-6">
          {connectionIssue
            ? 'We are having trouble connecting to our servers. This is usually temporary. Please check your connection and try again.'
            : 'An unexpected error occurred while loading the dashboard. Please try again.'}
        </p>

        {error.digest && <p className="text-zinc-600 text-xs mb-6">Error ID: {error.digest}</p>}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
```

---

### Agent E: Web Rate Limiting & API Key Logging

**Files to MODIFY:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/csrf/route.ts` (49 lines)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/debug/llm-status/route.ts` (126 lines)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/validate-webhook/route.ts` (87 lines)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/webhook-diagnostic/route.ts` (57 lines)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/llm-providers/factory.ts` (~220 lines)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/rate-limit.ts` (563 lines) -- ADD new config keys only

**Files to READ (do not modify):**

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/rate-limit.ts` (for `withRateLimit` function signature and existing config keys)

**DO NOT TOUCH:**

- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/middleware/rateLimit.ts` (Agent B's domain)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/rate-limit.ts` beyond adding new config keys
- Any Supabase migration files (Agent A's domain)
- Any Rust files (Agent C's domain)
- Any desktop frontend files (Agent D's domain)

**Current State & Changes Required:**

#### E1. Add rate limit config keys to rate-limit.ts

In `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/rate-limit.ts`, add new entries to `rateLimitConfigs` (before the `default` entry at line 175-179):

```typescript
// CSRF token generation - unauthenticated, needs strict limiting
csrf: {
  limit: 30,
  window: '1 m', // 30 CSRF tokens per minute per IP
  failClosed: true, // Security-sensitive: block if Redis fails
},
// Debug/diagnostic endpoints - admin only, moderate limits
'debug-llm-status': {
  limit: 10,
  window: '1 m', // 10 status checks per minute
  failClosed: false,
},
'validate-webhook': {
  limit: 10,
  window: '1 m', // 10 validation checks per minute
  failClosed: false,
},
'webhook-diagnostic': {
  limit: 10,
  window: '1 m', // 10 diagnostic checks per minute
  failClosed: false,
},
```

#### E2. M5 Add withRateLimit to csrf/route.ts

Current file has a handler wrapped with `withErrorHandler`. Add rate limiting.

**Replace lines 15-48 of csrf/route.ts:**

```typescript
async function handleGetCsrfToken(request: NextRequest): Promise<NextResponse> {
  // M5: Rate limit CSRF token generation (unauthenticated endpoint)
  const rateLimitResponse = await withRateLimit(request, 'csrf');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // ... rest of existing handler unchanged
```

Add import at top:

```typescript
import { withRateLimit } from '@/lib/rate-limit';
```

#### E3. M5 Add rate limiting to debug/llm-status/route.ts

Add at the very beginning of the `GET` function body (line 14, inside the function):

```typescript
export async function GET(request: NextRequest) {
  // M5: Rate limit debug endpoint
  const rateLimitResponse = await withRateLimit(request, 'debug-llm-status');
  if (rateLimitResponse) return rateLimitResponse;

  // ... rest of existing handler
```

Add import:

```typescript
import { withRateLimit } from '@/lib/rate-limit';
```

#### E4. M5 Add rate limiting to validate-webhook/route.ts

Same pattern. Add at the beginning of the `GET` function body (line 28):

```typescript
export async function GET(request: NextRequest) {
  // M5: Rate limit webhook validation endpoint
  const rateLimitResponse = await withRateLimit(request, 'validate-webhook');
  if (rateLimitResponse) return rateLimitResponse;

  if (!verifyDiagnosticSecret(request)) {
    // ... rest unchanged
```

Add import:

```typescript
import { withRateLimit } from '@/lib/rate-limit';
```

#### E5. M5 Add rate limiting to webhook-diagnostic/route.ts

Same pattern. Add at the beginning of the `GET` function body (line 23):

```typescript
export async function GET(request: NextRequest) {
  // M5: Rate limit webhook diagnostic endpoint
  const rateLimitResponse = await withRateLimit(request, 'webhook-diagnostic');
  if (rateLimitResponse) return rateLimitResponse;

  if (!verifyDiagnosticSecret(request)) {
    // ... rest unchanged
```

Add import:

```typescript
import { withRateLimit } from '@/lib/rate-limit';
```

#### E6. M9 API key prefix logging fix in factory.ts

**factory.ts line 106-111** -- Current code:

```typescript
if (value) {
  // Show first 8 and last 4 chars for debugging (safe for API keys)
  const masked =
    value.length > 12
      ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}`
      : '[short key]';
  status[p] = `configured (${masked})`;
```

**Change to show only first 4 chars:**

```typescript
if (value) {
  // M9: Show only first 4 chars (reduced from 8) for debugging
  const masked =
    value.length > 8
      ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
      : '[short key]';
  status[p] = `configured (${masked})`;
```

**factory.ts line 145-148** -- Current code:

```typescript
logger.debug(
  { provider, keyLength: key.length, keyPrefix: key.substring(0, 8) },
  'Creating provider with API key',
);
```

**Remove `keyPrefix` from the log:**

```typescript
logger.debug({ provider, keyLength: key.length }, 'Creating provider with API key');
```

---

## Interface Contracts

### Agent A -> Agent B

- **Type**: Database column `profiles.account_status TEXT NOT NULL DEFAULT 'active'`
- **Values**: `'active' | 'suspended' | 'banned' | 'disabled'`
- **Location**: Supabase `public.profiles` table
- **Used by**: Agent B queries `profiles.account_status` via supabase client in `auth.ts` middleware

### Agent C internal contracts

- **New field**: `AgentConfig.max_cost_per_task: f64` (default 5.0)
- **New field**: `AgentConfig.max_session_cost: f64` (default 50.0)
- **New method**: `LLMRouter.get_cumulative_cost() -> f64`
- **New method**: `RateLimitTracker.record_server_error(provider, model)`
- These are internal to the Rust backend -- no cross-agent dependency

### Agent B JWT contract

- **jwt.sign()** now includes `issuer: 'agiworkforce-api-gateway'` and `audience: 'agiworkforce'`
- **jwt.verify()** now validates these fields
- **IMPORTANT**: All three verify locations (auth middleware, /verify endpoint, websocket) MUST use the same issuer/audience values. Existing tokens without issuer/audience will FAIL verification after this change. Agent B must consider a migration strategy (e.g., add a grace period, or only enforce on new tokens).
- **RECOMMENDATION**: Initially add issuer/audience to `jwt.sign()` only, and make them optional in `jwt.verify()` by not passing them yet. Then in a follow-up, enable verification. OR add them to both simultaneously and accept that existing sessions will need to re-authenticate. The second approach is cleaner for security.

---

## DO NOT TOUCH Sections

These files/sections must NOT be modified by ANY agent:

1. **`apps/desktop/src-tauri/src/lib.rs`** -- Core entry point and state initialization
2. **`packages/types/index.ts`** -- Shared TypeScript types
3. **`apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`** -- Provider implementations
4. **`apps/desktop/src-tauri/src/core/llm/cost_calculator.rs`** -- Pricing data (read only)
5. **`apps/web/supabase/migrations/20260101000000_consolidated_schema.sql`** through **`20260222000000_add_waitlist_table.sql`** -- All existing migration files (Agent A creates a NEW file only)
6. **`services/api-gateway/src/index.ts`** -- Server bootstrap
7. **`services/api-gateway/src/middleware/rateLimit.ts`** -- API gateway rate limiter (separate from web rate-limit.ts)
8. **`apps/web/app/error.tsx`** -- Root error boundary (Agent D creates dashboard-specific one)

## Shared File Warnings

| File                                                | Agents       | Resolution                                |
| --------------------------------------------------- | ------------ | ----------------------------------------- |
| `apps/web/lib/rate-limit.ts`                        | Agent E only | Agent E adds config keys before `default` |
| `apps/desktop/src/App.tsx`                          | Agent D only | No conflict                               |
| `services/api-gateway/src/middleware/auth.ts`       | Agent B only | No conflict                               |
| `apps/desktop/src-tauri/src/core/agent/mod.rs`      | Agent C only | No conflict                               |
| `apps/desktop/src-tauri/src/core/llm/llm_router.rs` | Agent C only | No conflict                               |

No files are shared between agents. Each agent has exclusive ownership of their files.

## Verification Checklist

Before spawning agents, verify:

- [x] All file paths exist in the codebase (verified via Glob and Read)
- [x] All interface contracts are compatible (profiles.account_status column -> supabase query)
- [x] No circular dependencies between agent scopes
- [x] DO NOT TOUCH sections are clearly communicated
- [x] No agent scope overlaps (each agent owns distinct files)
- [x] Migration naming convention follows existing pattern (YYYYMMDDHHMMSS prefix)
- [x] JWT issuer/audience values are consistent across all three verify locations
- [x] Rate limit config keys match between rate-limit.ts and route files
- [ ] **WARNING**: JWT audience/issuer enforcement will invalidate existing sessions. Agent B should document this breaking change and coordinate deployment timing.
- [ ] **WARNING**: `supabase.auth.admin.signOut(userId, 'global')` API availability should be verified against the project's `@supabase/supabase-js` version.
