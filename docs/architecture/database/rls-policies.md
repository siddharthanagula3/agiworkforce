# Row Level Security (RLS) Policies

Comprehensive guide to Row Level Security in Supabase PostgreSQL for AGI Workforce.

## Table of Contents

1. [RLS Overview](#rls-overview)
2. [Policy Architecture](#policy-architecture)
3. [Table-by-Table Policies](#table-by-table-policies)
4. [Common Policy Patterns](#common-policy-patterns)
5. [Testing RLS Policies](#testing-rls-policies)
6. [Performance Optimization](#performance-optimization)
7. [Security Best Practices](#security-best-practices)

---

## RLS Overview

### What is Row Level Security?

Row Level Security (RLS) is PostgreSQL's built-in mechanism for controlling which rows users can access in a table. Instead of granting table-level permissions, RLS allows fine-grained, row-by-row access control.

### Why Use RLS?

**Security Benefits**:

- Defense in depth: Even if application logic fails, database enforces access control
- Multi-tenancy: Isolate users' data without separate databases
- Audit trail: Policies are declarative and versionable
- Simplified application code: Less authorization logic in application layer

**When to Use RLS**:

- Multi-user applications
- SaaS platforms
- Any application where users should only access their own data
- Compliance requirements (GDPR, HIPAA, etc.)

### RLS in Supabase

Supabase enables RLS by default on all tables. Policies must be explicitly created to allow access.

**Key Concepts**:

- `authenticated` role: Logged-in users
- `anon` role: Anonymous/public access
- `service_role`: Bypass all RLS (backend services only)
- `auth.uid()`: Current user's ID

---

## Policy Architecture

### Policy Structure

```sql
CREATE POLICY policy_name
  ON table_name
  FOR operation        -- SELECT, INSERT, UPDATE, DELETE, ALL
  TO role             -- authenticated, anon, service_role
  USING (condition)   -- Visibility filter (which rows user can see)
  WITH CHECK (condition);  -- Mutation filter (which rows user can modify)
```

### Policy Evaluation

**SELECT**:

1. User queries table
2. USING clause filters rows
3. Only matching rows returned

**INSERT**:

1. User attempts insert
2. WITH CHECK clause validates new row
3. Insert succeeds only if condition true

**UPDATE**:

1. USING clause filters rows (which rows can be updated)
2. User modifies row
3. WITH CHECK validates new values
4. Update succeeds only if both conditions true

**DELETE**:

1. USING clause filters rows
2. Matching rows can be deleted

### Policy Combinations

**Multiple policies = OR logic**:

```sql
-- Policy 1: Users see own records
CREATE POLICY "Users see own" ON table
  FOR SELECT USING (user_id = auth.uid());

-- Policy 2: Admins see all records
CREATE POLICY "Admins see all" ON table
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Result: Users see own records OR (if admin) all records
```

---

## Table-by-Table Policies

### profiles

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can view own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can update own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role has full access (webhooks, admin operations)
CREATE POLICY "Service role has full access to profiles"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Rationale**:

- Users control their own profile data
- Service role needed for Stripe webhooks to update profiles
- No public read access (privacy)

---

### subscriptions

```sql
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view own subscription
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    user_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
  );

-- Service role manages subscriptions (Stripe webhooks)
CREATE POLICY "Service role manages subscriptions"
  ON public.subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Rationale**:

- Users can read but not modify their subscription (managed by Stripe)
- Service role creates/updates subscriptions via webhooks
- Billing operations must be authoritative from backend

---

### token_credits

```sql
ALTER TABLE public.token_credits ENABLE ROW LEVEL SECURITY;

-- Users can view own credits
CREATE POLICY "Users can view own credits"
  ON public.token_credits
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role manages credits
CREATE POLICY "Service role manages credits"
  ON public.token_credits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Rationale**:

- Read-only for users (display balance)
- Service role deducts credits via RPC functions
- Prevents user manipulation of credit balance

---

### credit_transactions

```sql
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view own transactions (audit trail)
CREATE POLICY "Users can view own transactions"
  ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role manages transactions
CREATE POLICY "Service role manages transactions"
  ON public.credit_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Rationale**:

- Immutable audit log
- Users can view for transparency
- Only service role can create transactions

---

### device_authorization_codes

```sql
ALTER TABLE public.device_authorization_codes ENABLE ROW LEVEL SECURITY;

-- Users can view their own device authorizations
CREATE POLICY "Users can view their own device authorizations"
  ON public.device_authorization_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can manage all device authorizations
CREATE POLICY "Service role can manage all device authorizations"
  ON public.device_authorization_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Rationale**:

- Users see devices they've authorized
- Service role creates authorization codes
- Web app (service role) authorizes devices on behalf of user

---

### desktop_devices

```sql
ALTER TABLE public.desktop_devices ENABLE ROW LEVEL SECURITY;

-- Users can view their own desktop devices
CREATE POLICY "Users can view their own desktop devices"
  ON public.desktop_devices
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can register their own desktop devices
CREATE POLICY "Users can register their own desktop devices"
  ON public.desktop_devices
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own desktop devices (heartbeat)
CREATE POLICY "Users can update their own desktop devices"
  ON public.desktop_devices
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own desktop devices
CREATE POLICY "Users can delete their own desktop devices"
  ON public.desktop_devices
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role has full access (API gateway)
CREATE POLICY "Service role can manage all desktop devices"
  ON public.desktop_devices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Rationale**:

- Users manage their registered devices
- Desktop app sends heartbeats as authenticated user
- Service role for admin operations

---

### mobile_devices

```sql
ALTER TABLE public.mobile_devices ENABLE ROW LEVEL SECURITY;

-- Same pattern as desktop_devices
CREATE POLICY "Users can view their own devices"
  ON public.mobile_devices
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own devices"
  ON public.mobile_devices
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own devices"
  ON public.mobile_devices
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices"
  ON public.mobile_devices
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access"
  ON public.mobile_devices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

---

### sync_data

```sql
ALTER TABLE public.sync_data ENABLE ROW LEVEL SECURITY;

-- Users can only access their own sync data
CREATE POLICY "Users can access own sync data"
  ON public.sync_data
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role has full access to sync data"
  ON public.sync_data
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Rationale**:

- Cross-device sync must be isolated per user
- Full CRUD for authenticated users on own data

---

### signaling_sessions

```sql
ALTER TABLE public.signaling_sessions ENABLE ROW LEVEL SECURITY;

-- Service role only (no user access)
CREATE POLICY "Service role can manage signaling sessions"
  ON public.signaling_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Rationale**:

- Temporary pairing codes
- No user authentication required (public pairing flow)
- Managed entirely by WebSocket server (service role)

---

### processed_stripe_events

```sql
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

-- Service role only
CREATE POLICY "Service role manages stripe events"
  ON public.processed_stripe_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Rationale**:

- Internal idempotency tracking
- No user access needed
- Webhook handler (service role) only

---

### organizations & organization_members

```sql
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Users can view organizations they're members of
CREATE POLICY "Users can view their organizations"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Organization owners can update
CREATE POLICY "Owners can update organization"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Users can view organization members
CREATE POLICY "Members can view organization members"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Admins/owners can manage members
CREATE POLICY "Admins can manage members"
  ON public.organization_members
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
```

**Rationale**:

- Hierarchical access: viewer < member < admin < owner
- Members see organization data
- Only admins/owners modify membership

---

### beta_invites & beta_redemptions

```sql
ALTER TABLE public.beta_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_redemptions ENABLE ROW LEVEL SECURITY;

-- Public can view active invites (for code validation)
CREATE POLICY "Public can view active invites"
  ON public.beta_invites
  FOR SELECT
  TO authenticated, anon
  USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- Service role manages invites
CREATE POLICY "Service role manages invites"
  ON public.beta_invites
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own redemptions
CREATE POLICY "Users can view own redemptions"
  ON public.beta_redemptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role manages redemptions
CREATE POLICY "Service role manages redemptions"
  ON public.beta_redemptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Rationale**:

- Public read for invite validation (before auth)
- Users see their redemption history
- Backend creates redemptions (prevent gaming)

---

## Common Policy Patterns

### Pattern 1: User Owns Resource

```sql
CREATE POLICY "Users access own resources"
  ON resource_table
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

**Use for**: profiles, user_preferences, api_keys

---

### Pattern 2: Organization-Based Access

```sql
CREATE POLICY "Organization members access resources"
  ON resource_table
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );
```

**Use for**: projects, documents, team resources

---

### Pattern 3: Public Read, Authenticated Write

```sql
CREATE POLICY "Public can read"
  ON content_table
  FOR SELECT
  TO authenticated, anon
  USING (is_published = true);

CREATE POLICY "Authors can write"
  ON content_table
  FOR ALL
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
```

**Use for**: blog posts, public documentation

---

### Pattern 4: Role-Based Access

```sql
CREATE POLICY "Admins access all"
  ON sensitive_table
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users access own"
  ON sensitive_table
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

**Use for**: admin panels, audit logs

---

### Pattern 5: Service Role Bypass

```sql
-- Always include for backend operations
CREATE POLICY "Service role full access"
  ON any_table
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Use for**: All tables that need backend modifications

---

### Pattern 6: Time-Based Access

```sql
CREATE POLICY "Access active subscriptions"
  ON subscription_content
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE user_id = auth.uid()
        AND status = 'active'
        AND current_period_end > NOW()
    )
  );
```

**Use for**: Premium content, trial features

---

### Pattern 7: Hierarchical Permissions

```sql
CREATE POLICY "Hierarchical document access"
  ON documents
  FOR SELECT
  TO authenticated
  USING (
    -- Own documents
    owner_id = auth.uid()
    OR
    -- Shared with user
    id IN (
      SELECT document_id FROM document_shares
      WHERE user_id = auth.uid()
    )
    OR
    -- Organization documents
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );
```

**Use for**: Documents, files, nested resources

---

## Testing RLS Policies

### Manual Testing

```sql
-- Test as authenticated user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "user-uuid-here"}';

-- Attempt query
SELECT * FROM profiles;

-- Reset role
RESET ROLE;
```

### Automated Testing

```typescript
// Supabase client test
import { createClient } from '@supabase/supabase-js';

describe('RLS Policies', () => {
  it('users can only view own profile', async () => {
    const user1Client = createClient(SUPABASE_URL, ANON_KEY);
    await user1Client.auth.signInWithPassword({
      email: 'user1@example.com',
      password: 'password',
    });

    const { data, error } = await user1Client.from('profiles').select('*');

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(user1.id);
  });

  it('users cannot view other profiles', async () => {
    const user1Client = createClient(SUPABASE_URL, ANON_KEY);
    await user1Client.auth.signInWithPassword({
      email: 'user1@example.com',
      password: 'password',
    });

    const { data } = await user1Client.from('profiles').select('*').eq('id', 'other-user-uuid');

    expect(data).toHaveLength(0);
  });

  it('service role bypasses RLS', async () => {
    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data } = await serviceClient.from('profiles').select('*');

    expect(data.length).toBeGreaterThan(1);
  });
});
```

### Policy Verification Queries

```sql
-- List all policies for a table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'your_table'
ORDER BY policyname;

-- Check if RLS is enabled
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Find tables without RLS
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
  AND tablename NOT IN ('schema_version', 'migrations');
```

---

## Performance Optimization

### 1. Index Policy Predicates

```sql
-- Policy uses user_id filter
CREATE POLICY "Users access own" ON table
  USING (user_id = auth.uid());

-- Add index for policy
CREATE INDEX idx_table_user_id ON table(user_id);
```

### 2. Avoid Complex Subqueries

```sql
-- Slow: Subquery for every row
CREATE POLICY "Members access resources" ON resources
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Faster: Materialize user's organizations
-- Use application-level caching or database function
```

### 3. Use Security Definer Functions

```sql
-- Instead of complex policy
CREATE FUNCTION user_can_access_resource(resource_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM resources r
    JOIN permissions p ON r.id = p.resource_id
    WHERE r.id = resource_id
      AND p.user_id = auth.uid()
      AND p.level >= 'read'
  );
END;
$$;

CREATE POLICY "Check access via function" ON resources
  USING (user_can_access_resource(id));
```

### 4. Analyze Query Plans

```sql
-- Check policy performance
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM table WHERE condition;

-- Look for:
-- - Sequential scans (should be index scans)
-- - High buffer usage
-- - Slow subplans
```

### 5. Batch Operations

```sql
-- Slow: N queries with RLS check each time
for each item:
  SELECT * FROM table WHERE id = item.id;

-- Fast: Single query
SELECT * FROM table WHERE id = ANY(array_of_ids);
```

---

## Security Best Practices

### 1. Always Enable RLS

```sql
-- Enable RLS on table creation
CREATE TABLE new_table (...);
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- Verify all tables have RLS
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;
```

### 2. Default Deny

Without policies, RLS blocks all access (except service_role). This is safe default.

```sql
-- Enabled RLS, no policies = no access
ALTER TABLE sensitive_table ENABLE ROW LEVEL SECURITY;
-- Users cannot read or write (good!)
```

### 3. Explicit Policy Roles

```sql
-- Bad: Implicit role (applies to all)
CREATE POLICY "Allow access" ON table USING (true);

-- Good: Explicit role
CREATE POLICY "Allow access" ON table
  TO authenticated
  USING (user_id = auth.uid());
```

### 4. Separate Read and Write Policies

```sql
-- More secure: Different conditions for read vs write
CREATE POLICY "Users read own and shared" ON documents
  FOR SELECT
  USING (owner_id = auth.uid() OR shared_with @> ARRAY[auth.uid()]);

CREATE POLICY "Users write only own" ON documents
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

### 5. Test with auth.uid() = NULL

```sql
-- Simulate unauthenticated access
SET LOCAL request.jwt.claims = '{}';
SELECT * FROM table;  -- Should return nothing
```

### 6. Audit Policy Changes

```sql
-- Track policy modifications
CREATE TABLE policy_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  policy_name text NOT NULL,
  action text NOT NULL,
  changed_by text,
  changed_at timestamptz DEFAULT NOW()
);

-- Trigger on pg_policy changes (advanced)
```

### 7. Use Least Privilege

```sql
-- Service role should only be used where necessary
-- Prefer authenticated role with specific policies

-- Bad: Frontend using service_role key (NEVER DO THIS)
const client = createClient(url, SERVICE_ROLE_KEY);

-- Good: Frontend using anon key, backend using service_role
const client = createClient(url, ANON_KEY);  // Frontend
const adminClient = createClient(url, SERVICE_ROLE_KEY);  // Backend only
```

### 8. Regular Security Reviews

Checklist:

- [ ] All tables have RLS enabled
- [ ] No overly permissive policies (USING (true))
- [ ] Service role policies are necessary
- [ ] Policies match application access patterns
- [ ] Indexes exist for policy predicates
- [ ] No sensitive data exposed via policies

---

## Policy Debugging

### Common Issues

#### Issue 1: Policy Not Applied

**Symptom**: Users can access data they shouldn't

**Debug**:

```sql
-- Check if RLS is enabled
SELECT rowsecurity FROM pg_tables
WHERE tablename = 'your_table';

-- List policies
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Test as user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "test-user-id"}';
SELECT * FROM your_table;
```

#### Issue 2: No Data Returned

**Symptom**: Legitimate users see no data

**Debug**:

```sql
-- Check auth.uid() value
SELECT auth.uid();

-- Verify user_id in table matches auth.uid()
SELECT user_id, auth.uid() FROM your_table;

-- Test policy predicate directly
SELECT user_id = auth.uid() AS policy_matches FROM your_table;
```

#### Issue 3: Performance Degradation

**Symptom**: Queries slow after enabling RLS

**Debug**:

```sql
-- Compare with and without RLS
ALTER TABLE your_table DISABLE ROW LEVEL SECURITY;
EXPLAIN ANALYZE SELECT * FROM your_table;

ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;
EXPLAIN ANALYZE SELECT * FROM your_table;

-- Check for missing indexes
SELECT * FROM pg_stat_user_indexes WHERE relname = 'your_table';
```

---

## Next Steps

For more information, see:

- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Schema documentation
- [MIGRATIONS.md](./MIGRATIONS.md) - Adding/modifying RLS policies
- [QUERY_OPTIMIZATION.md](./QUERY_OPTIMIZATION.md) - Optimizing policy performance
