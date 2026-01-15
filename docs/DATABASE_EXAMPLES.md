# Database Operations Examples

Practical examples of common database operations for AGI Workforce, with code samples in SQL, TypeScript, and Rust.

## Table of Contents

1. [Supabase Client Examples](#supabase-client-examples)
2. [SQLite Rust Examples](#sqlite-rust-examples)
3. [Common Query Patterns](#common-query-patterns)
4. [Data Migration Examples](#data-migration-examples)
5. [Stored Procedures](#stored-procedures)
6. [Testing Examples](#testing-examples)

---

## Supabase Client Examples

### Setup

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client-side (anon key, RLS enforced)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side (service role, bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
```

---

### User Profile Operations

```typescript
// Get current user's profile
async function getUserProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

  if (error) throw error;
  return data;
}

// Update user profile
async function updateUserProfile(userId: string, updates: Partial<Profile>) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Link Stripe customer
async function linkStripeCustomer(userId: string, customerId: string) {
  const { error } = await supabaseAdmin.rpc('link_stripe_customer', {
    p_user_id: userId,
    p_customer_id: customerId,
  });

  if (error) throw error;
}
```

---

### Subscription Management

```typescript
// Get user's subscription
async function getUserSubscription(userId: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      `
      *,
      profiles (
        email,
        display_name
      )
    `,
    )
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return data;
}

// Create or update subscription (service role)
async function upsertSubscription(subscription: SubscriptionData) {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        user_id: subscription.user_id,
        stripe_customer_id: subscription.stripe_customer_id,
        stripe_subscription_id: subscription.stripe_subscription_id,
        stripe_price_id: subscription.stripe_price_id,
        plan_tier: subscription.plan_tier,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
      },
      {
        onConflict: 'user_id',
      },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Cancel subscription
async function cancelSubscription(userId: string) {
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      cancel_at_period_end: false,
    })
    .eq('user_id', userId);

  if (error) throw error;
}
```

---

### Credit System

```typescript
// Get credit balance
async function getCreditBalance(userId: string) {
  const { data, error } = await supabase.rpc('get_credit_balance', { p_user_id: userId });

  if (error) throw error;

  return {
    allocated: data.credits_allocated_cents,
    used: data.credits_used_cents,
    remaining: data.credits_remaining_cents,
    dailyLimit: data.daily_limit_cents,
    dailyUsed: data.daily_used_cents,
    dailyRemaining: data.daily_remaining_cents,
    periodStart: new Date(data.period_start),
    periodEnd: new Date(data.period_end),
  };
}

// Check if user has sufficient credits
async function checkCreditsAvailable(userId: string, amountCents: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_credits_available', {
    p_user_id: userId,
    p_amount_cents: amountCents,
  });

  if (error) throw error;
  return data;
}

// Deduct credits (service role)
async function deductCredits(
  userId: string,
  amountCents: number,
  description: string,
  metadata?: Record<string, any>,
) {
  const { data, error } = await supabaseAdmin.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount_cents: amountCents,
    p_description: description,
    p_metadata: metadata || {},
  });

  if (error) throw error;

  if (!data.success) {
    throw new Error(data.error || 'Credit deduction failed');
  }

  return {
    success: true,
    remaining: data.remaining_cents,
    dailyRemaining: data.daily_remaining,
  };
}

// Get credit transaction history
async function getCreditTransactions(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}
```

---

### Device Management

```typescript
// Request device authorization
async function requestDeviceAuthorization(deviceInfo: {
  device_id: string;
  device_name: string;
  device_type: string;
}) {
  // Generate 6-digit code
  const userCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  const { data, error } = await supabaseAdmin
    .from('device_authorization_codes')
    .insert({
      device_id: deviceInfo.device_id,
      device_name: deviceInfo.device_name,
      device_type: deviceInfo.device_type,
      user_code: userCode,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return {
    userCode,
    expiresAt,
    authorizationId: data.id,
  };
}

// Authorize device (user in web app)
async function authorizeDevice(userCode: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('device_authorization_codes')
    .update({
      status: 'authorized',
      user_id: userId,
      authorized_at: new Date().toISOString(),
    })
    .eq('user_code', userCode)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Poll for authorization status (desktop client)
async function checkAuthorizationStatus(userCode: string) {
  const { data, error } = await supabaseAdmin
    .from('device_authorization_codes')
    .select('status, user_id, expires_at')
    .eq('user_code', userCode)
    .single();

  if (error) throw error;

  if (new Date(data.expires_at) < new Date()) {
    return { status: 'expired' };
  }

  return data;
}

// Register desktop device
async function registerDesktopDevice(deviceInfo: {
  user_id: string;
  name: string;
  platform: 'macos' | 'windows' | 'linux';
  version: string;
}) {
  const { data, error } = await supabase
    .from('desktop_devices')
    .insert(deviceInfo)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get user's devices
async function getUserDevices(userId: string) {
  const { data, error } = await supabase
    .from('desktop_devices')
    .select('*')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Update device heartbeat
async function updateDeviceHeartbeat(deviceId: string) {
  const { error } = await supabase
    .from('desktop_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', deviceId);

  if (error) throw error;
}
```

---

### Beta Invites

```typescript
// Create beta invite (admin)
async function createBetaInvite(inviteData: {
  code?: string;
  email?: string;
  max_uses?: number;
  plan_tier: 'free' | 'hobby' | 'pro';
  trial_days?: number;
  discount_percent?: number;
  expires_at?: Date;
  created_by: string;
}) {
  const code = inviteData.code || generateInviteCode();

  const { data, error } = await supabaseAdmin
    .from('beta_invites')
    .insert({
      code,
      email: inviteData.email,
      max_uses: inviteData.max_uses || 1,
      plan_tier: inviteData.plan_tier,
      trial_days: inviteData.trial_days || 90,
      discount_percent: inviteData.discount_percent || 50,
      expires_at: inviteData.expires_at?.toISOString(),
      created_by: inviteData.created_by,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Validate beta invite
async function validateBetaInvite(code: string) {
  const { data, error } = await supabase
    .from('beta_invites')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Invalid invite code');
    }
    throw error;
  }

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new Error('Invite code has expired');
  }

  // Check usage
  if (data.max_uses && data.current_uses >= data.max_uses) {
    throw new Error('Invite code has reached maximum uses');
  }

  return data;
}

// Claim beta invite
async function claimBetaInvite(userId: string, inviteId: string) {
  const { data, error } = await supabaseAdmin.rpc('claim_beta_invite', {
    p_user_id: userId,
    p_invite_id: inviteId,
    p_plan_tier: 'hobby', // or get from invite
  });

  if (error) throw error;

  const result = typeof data === 'string' ? JSON.parse(data) : data;

  if (!result.success) {
    throw new Error(result.error);
  }

  return result;
}
```

---

## SQLite Rust Examples

### Setup

```rust
use rusqlite::{Connection, Result, params};
use chrono::{DateTime, Utc};

// Get database connection
pub fn get_connection() -> Result<Connection> {
    let db_path = get_database_path();
    let conn = Connection::open(db_path)?;

    // Set pragmas
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    conn.execute("PRAGMA busy_timeout = 5000", [])?;
    conn.execute("PRAGMA journal_mode = WAL", [])?;

    Ok(conn)
}
```

---

### Conversation Operations

```rust
use crate::models::{Conversation, Message, MessageRole};

// Create conversation
pub fn create_conversation(
    conn: &Connection,
    user_id: &str,
    title: &str,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO conversations (user_id, title) VALUES (?1, ?2)",
        params![user_id, title],
    )?;

    Ok(conn.last_insert_rowid())
}

// Get conversation by ID
pub fn get_conversation(
    conn: &Connection,
    conversation_id: i64,
) -> Result<Conversation> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, title, created_at, updated_at
         FROM conversations
         WHERE id = ?1"
    )?;

    let conversation = stmt.query_row([conversation_id], |row| {
        Ok(Conversation {
            id: row.get(0)?,
            user_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;

    Ok(conversation)
}

// Get all conversations for user
pub fn get_user_conversations(
    conn: &Connection,
    user_id: &str,
    limit: i32,
) -> Result<Vec<Conversation>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, title, created_at, updated_at
         FROM conversations
         WHERE user_id = ?1
         ORDER BY updated_at DESC
         LIMIT ?2"
    )?;

    let conversations = stmt.query_map(params![user_id, limit], |row| {
        Ok(Conversation {
            id: row.get(0)?,
            user_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?
    .collect::<Result<Vec<_>>>()?;

    Ok(conversations)
}

// Update conversation title
pub fn update_conversation_title(
    conn: &Connection,
    conversation_id: i64,
    new_title: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE conversations
         SET title = ?1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2",
        params![new_title, conversation_id],
    )?;

    Ok(())
}

// Delete conversation (cascades to messages)
pub fn delete_conversation(
    conn: &Connection,
    conversation_id: i64,
) -> Result<()> {
    conn.execute(
        "DELETE FROM conversations WHERE id = ?1",
        [conversation_id],
    )?;

    Ok(())
}
```

---

### Message Operations

```rust
// Add message to conversation
pub fn add_message(
    conn: &Connection,
    conversation_id: i64,
    user_id: &str,
    role: MessageRole,
    content: &str,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO messages (conversation_id, user_id, role, content)
         VALUES (?1, ?2, ?3, ?4)",
        params![conversation_id, user_id, role.as_str(), content],
    )?;

    let message_id = conn.last_insert_rowid();

    // Update conversation timestamp
    conn.execute(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        [conversation_id],
    )?;

    Ok(message_id)
}

// Get messages for conversation
pub fn get_conversation_messages(
    conn: &Connection,
    conversation_id: i64,
    limit: i32,
) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, user_id, role, content,
                tokens, cost, provider, model, created_at
         FROM messages
         WHERE conversation_id = ?1
         ORDER BY created_at ASC
         LIMIT ?2"
    )?;

    let messages = stmt.query_map(params![conversation_id, limit], |row| {
        Ok(Message {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            user_id: row.get(2)?,
            role: MessageRole::from_str(&row.get::<_, String>(3)?)
                .unwrap_or(MessageRole::User),
            content: row.get(4)?,
            tokens: row.get(5)?,
            cost: row.get(6)?,
            provider: row.get(7)?,
            model: row.get(8)?,
            created_at: row.get(9)?,
        })
    })?
    .collect::<Result<Vec<_>>>()?;

    Ok(messages)
}

// Update message metrics
pub fn update_message_metrics(
    conn: &Connection,
    message_id: i64,
    tokens: i32,
    cost: f64,
    provider: &str,
    model: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE messages
         SET tokens = ?1, cost = ?2, provider = ?3, model = ?4
         WHERE id = ?5",
        params![tokens, cost, provider, model, message_id],
    )?;

    Ok(())
}
```

---

### Full-Text Search

```rust
// Search messages
pub fn search_messages(
    conn: &Connection,
    user_id: &str,
    query: &str,
    limit: i32,
) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT
            m.id, m.conversation_id, m.user_id, m.role, m.content,
            m.tokens, m.cost, m.provider, m.model, m.created_at
         FROM messages m
         JOIN messages_fts fts ON CAST(m.id AS TEXT) = fts.message_id
         WHERE m.user_id = ?1
           AND messages_fts MATCH ?2
         ORDER BY fts.rank
         LIMIT ?3"
    )?;

    let messages = stmt.query_map(params![user_id, query, limit], |row| {
        Ok(Message {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            user_id: row.get(2)?,
            role: MessageRole::from_str(&row.get::<_, String>(3)?)
                .unwrap_or(MessageRole::User),
            content: row.get(4)?,
            tokens: row.get(5)?,
            cost: row.get(6)?,
            provider: row.get(7)?,
            model: row.get(8)?,
            created_at: row.get(9)?,
        })
    })?
    .collect::<Result<Vec<_>>>()?;

    Ok(messages)
}
```

---

### Cache Operations

```rust
use crate::models::CacheEntry;

// Get cached response
pub fn get_cached_response(
    conn: &Connection,
    cache_key: &str,
) -> Result<Option<CacheEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, cache_key, provider, model, prompt_hash, response,
                tokens, cost, created_at, last_used_at, expires_at,
                hit_count, tokens_saved, cost_saved, temperature, max_tokens
         FROM cache_entries
         WHERE cache_key = ?1
           AND expires_at > CURRENT_TIMESTAMP"
    )?;

    let entry = stmt.query_row([cache_key], |row| {
        Ok(CacheEntry {
            id: row.get(0)?,
            cache_key: row.get(1)?,
            provider: row.get(2)?,
            model: row.get(3)?,
            prompt_hash: row.get(4)?,
            response: row.get(5)?,
            tokens: row.get(6)?,
            cost: row.get(7)?,
            created_at: row.get(8)?,
            last_used_at: row.get(9)?,
            expires_at: row.get(10)?,
            hit_count: row.get(11)?,
            tokens_saved: row.get(12)?,
            cost_saved: row.get(13)?,
            temperature: row.get(14)?,
            max_tokens: row.get(15)?,
        })
    }).optional()?;

    if let Some(entry) = &entry {
        // Update hit count and last_used_at
        conn.execute(
            "UPDATE cache_entries
             SET hit_count = hit_count + 1,
                 last_used_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            [entry.id],
        )?;
    }

    Ok(entry)
}

// Store cache entry
pub fn store_cache_entry(
    conn: &Connection,
    cache_key: &str,
    provider: &str,
    model: &str,
    prompt_hash: &str,
    response: &str,
    tokens: i32,
    cost: f64,
    expires_in_seconds: i64,
) -> Result<i64> {
    let expires_at = Utc::now() + chrono::Duration::seconds(expires_in_seconds);

    conn.execute(
        "INSERT INTO cache_entries (
            cache_key, provider, model, prompt_hash, response,
            tokens, cost, expires_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            cache_key,
            provider,
            model,
            prompt_hash,
            response,
            tokens,
            cost,
            expires_at.to_rfc3339(),
        ],
    )?;

    Ok(conn.last_insert_rowid())
}

// Clean expired cache entries
pub fn cleanup_expired_cache(conn: &Connection) -> Result<usize> {
    let deleted = conn.execute(
        "DELETE FROM cache_entries WHERE expires_at < CURRENT_TIMESTAMP",
        [],
    )?;

    Ok(deleted)
}
```

---

### Settings Management

```rust
// Get setting
pub fn get_setting(
    conn: &Connection,
    key: &str,
) -> Result<Option<String>> {
    let mut stmt = conn.prepare(
        "SELECT value FROM settings_v2 WHERE key = ?1"
    )?;

    let value = stmt.query_row([key], |row| row.get(0)).optional()?;

    Ok(value)
}

// Set setting
pub fn set_setting(
    conn: &Connection,
    key: &str,
    value: &str,
    value_type: &str,
    encrypted: bool,
) -> Result<()> {
    conn.execute(
        "INSERT INTO settings_v2 (key, value, value_type, encrypted)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            value_type = excluded.value_type,
            encrypted = excluded.encrypted,
            updated_at = CURRENT_TIMESTAMP",
        params![key, value, value_type, encrypted],
    )?;

    Ok(())
}

// Get all settings by category
pub fn get_settings_by_category(
    conn: &Connection,
    category: &str,
) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT key, value FROM settings_v2 WHERE category = ?1"
    )?;

    let settings = stmt.query_map([category], |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?
    .collect::<Result<Vec<_>>>()?;

    Ok(settings)
}
```

---

## Common Query Patterns

### Pagination (Cursor-based)

```typescript
// Cursor-based pagination for messages
async function getMessagesPaginated(
  conversationId: string,
  pageSize: number = 20,
  cursor?: string, // ISO timestamp of last message
) {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(pageSize);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

  if (error) throw error;

  return {
    messages: data,
    nextCursor: data.length === pageSize ? data[data.length - 1].created_at : null,
  };
}
```

---

### Aggregations

```typescript
// Get conversation statistics
async function getConversationStats(userId: string) {
  const { data, error } = await supabase.rpc('get_conversation_stats', { p_user_id: userId });

  if (error) throw error;
  return data;
}

// SQL function
/*
CREATE FUNCTION get_conversation_stats(p_user_id UUID)
RETURNS TABLE (
  conversation_count BIGINT,
  message_count BIGINT,
  total_tokens INTEGER,
  total_cost NUMERIC,
  avg_messages_per_conversation NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT c.id)::BIGINT,
    COUNT(m.id)::BIGINT,
    COALESCE(SUM(m.tokens), 0)::INTEGER,
    COALESCE(SUM(m.cost), 0)::NUMERIC,
    COALESCE(AVG(msg_count), 0)::NUMERIC
  FROM conversations c
  LEFT JOIN messages m ON c.id = m.conversation_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as msg_count
    FROM messages
    WHERE conversation_id = c.id
  ) counts ON true
  WHERE c.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
*/
```

---

### Batch Operations

```rust
// Batch insert messages
pub fn batch_insert_messages(
    conn: &Connection,
    messages: &[Message],
) -> Result<()> {
    let tx = conn.transaction()?;

    let mut stmt = tx.prepare(
        "INSERT INTO messages (conversation_id, user_id, role, content, tokens, cost, provider, model)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    )?;

    for msg in messages {
        stmt.execute(params![
            msg.conversation_id,
            msg.user_id,
            msg.role.as_str(),
            msg.content,
            msg.tokens,
            msg.cost,
            msg.provider,
            msg.model,
        ])?;
    }

    drop(stmt);
    tx.commit()?;

    Ok(())
}
```

---

## Data Migration Examples

### Backfill Missing Data

```sql
-- Add timestamps to existing records
UPDATE profiles
SET created_at = NOW(), updated_at = NOW()
WHERE created_at IS NULL;

-- Populate computed fields
UPDATE token_credits
SET credits_remaining_cents = credits_allocated_cents - credits_used_cents
WHERE credits_remaining_cents IS NULL;

-- Set defaults
UPDATE subscriptions
SET status = 'active'
WHERE status IS NULL AND current_period_end > NOW();
```

---

### Data Transformation

```sql
-- Migrate from old to new structure
INSERT INTO new_table (id, user_id, data, created_at)
SELECT
  id,
  user_id,
  jsonb_build_object(
    'old_field1', old_field1,
    'old_field2', old_field2
  ),
  created_at
FROM old_table;

-- Update JSON structure
UPDATE events
SET metadata = jsonb_set(
  metadata,
  '{new_field}',
  metadata->'old_field'
)
WHERE metadata ? 'old_field';
```

---

## Stored Procedures

### User Cleanup

```sql
CREATE FUNCTION cleanup_inactive_users(inactive_days INTEGER)
RETURNS TABLE (deleted_count INTEGER) AS $$
DECLARE
  cutoff_date TIMESTAMPTZ;
BEGIN
  cutoff_date := NOW() - (inactive_days || ' days')::INTERVAL;

  -- Find inactive users
  WITH inactive_users AS (
    SELECT id FROM profiles
    WHERE updated_at < cutoff_date
      AND id NOT IN (
        SELECT user_id FROM subscriptions WHERE status = 'active'
      )
  )
  -- Delete and count
  DELETE FROM profiles
  WHERE id IN (SELECT id FROM inactive_users)
  RETURNING COUNT(*)::INTEGER INTO deleted_count;

  RETURN QUERY SELECT deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Testing Examples

### RLS Policy Tests

```typescript
import { expect, test } from 'vitest';

test('users can only view own profile', async () => {
  // User 1 client
  const user1 = await createTestUser('user1@test.com');
  const client1 = createClient(SUPABASE_URL, ANON_KEY);
  await client1.auth.signInWithPassword({
    email: 'user1@test.com',
    password: 'password',
  });

  // User 2
  const user2 = await createTestUser('user2@test.com');

  // User 1 queries profiles
  const { data, error } = await client1.from('profiles').select('*');

  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  expect(data[0].id).toBe(user1.id);
  expect(data.find((p) => p.id === user2.id)).toBeUndefined();
});
```

---

For complete documentation, see:

- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Full schema reference
- [MIGRATIONS.md](./MIGRATIONS.md) - Migration guide
- [RLS_POLICIES.md](./RLS_POLICIES.md) - Security policies
- [QUERY_OPTIMIZATION.md](./QUERY_OPTIMIZATION.md) - Performance tuning
- [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) - Backup procedures
