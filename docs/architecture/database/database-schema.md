# Database Schema Documentation

This document provides a comprehensive overview of the AGI Workforce database architecture, including both Supabase PostgreSQL (web/cloud) and SQLite (desktop) schemas.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Supabase PostgreSQL Schema](#supabase-postgresql-schema)
3. [SQLite Desktop Schema](#sqlite-desktop-schema)
4. [Entity Relationship Diagrams](#entity-relationship-diagrams)
5. [Common Patterns](#common-patterns)
6. [Data Types and Conventions](#data-types-and-conventions)

---

## Architecture Overview

### Dual Database Strategy

AGI Workforce uses a dual database approach:

- **Supabase PostgreSQL**: Cloud database for web application, authentication, billing, and cross-device synchronization
- **SQLite**: Local embedded database for desktop application, offline-first operation, and privacy-sensitive data

```
┌─────────────────────────────────────────────────────────────┐
│                    AGI Workforce Platform                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐              ┌──────────────────┐    │
│  │   Web Frontend   │              │ Desktop App      │    │
│  │   (Next.js)      │              │ (Tauri/Rust)     │    │
│  └────────┬─────────┘              └────────┬─────────┘    │
│           │                                  │               │
│           ▼                                  ▼               │
│  ┌─────────────────────────────────────────────────┐       │
│  │         Supabase PostgreSQL (Cloud)             │       │
│  │  - Authentication (auth.users)                  │       │
│  │  - Subscriptions & Billing                      │       │
│  │  - Device Authorization                         │       │
│  │  - Cross-Device Sync                            │       │
│  │  - Organizations & Teams                        │       │
│  └─────────────────────────────────────────────────┘       │
│                                                               │
│                                  ┌──────────────────┐       │
│                                  │  SQLite (Local)  │       │
│                                  │  - Conversations │       │
│                                  │  - Messages      │       │
│                                  │  - Automation    │       │
│                                  │  - Permissions   │       │
│                                  │  - Cache         │       │
│                                  │  - History       │       │
│                                  └──────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Database Selection Criteria

**Use Supabase PostgreSQL for:**

- Multi-user/multi-device data
- Billing and subscription management
- Authentication and authorization
- Cross-device synchronization
- Team collaboration
- Audit logs requiring centralized access
- Data requiring backup and high availability

**Use SQLite for:**

- Single-user local data
- Offline-first functionality
- Privacy-sensitive information
- High-performance local queries
- Desktop-specific features
- Chat history and conversations
- Local automation history

---

## Supabase PostgreSQL Schema

### Core Tables

#### 1. profiles

Extends Supabase Auth with user profile information.

```sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,                            -- FK to auth.users(id)
  email text,
  display_name text,
  avatar_url text,
  stripe_customer_id text,                        -- Stripe integration
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX idx_profiles_stripe_customer_id ON public.profiles(stripe_customer_id);
```

**Purpose**: Central user profile linked to Supabase Auth
**Key Relationships**:

- Parent of: subscriptions, organizations, beta_redemptions
- Child of: auth.users

**RLS Policies**:

- Users can view/update own profile
- Service role has full access

---

#### 2. subscriptions

Manages user subscription plans and billing status.

```sql
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE,                   -- FK to profiles(id)
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  plan_tier text NOT NULL DEFAULT 'free'          -- free, hobby, pro, max, enterprise
    CHECK (plan_tier IN ('free', 'hobby', 'pro', 'max', 'enterprise')),
  status text NOT NULL DEFAULT 'active'           -- active, trialing, past_due, canceled, etc.
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled',
                      'incomplete', 'incomplete_expired', 'unpaid')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  canceled_at timestamptz,
  stripe_coupon_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- Indexes
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
```

**Purpose**: Track subscription lifecycle and plan tiers
**Plan Tier Hierarchy**: free (0) < hobby (1) < pro (2) < max (3) < enterprise (4)

**RLS Policies**:

- Users can view own subscription
- Service role manages all subscriptions

---

#### 3. token_credits

Tracks monthly and daily credit allocations for API usage.

```sql
CREATE TABLE public.token_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                          -- FK to auth.users(id)
  subscription_id uuid,                           -- FK to subscriptions(id)
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  credits_allocated_cents integer NOT NULL DEFAULT 0,
  credits_used_cents integer NOT NULL DEFAULT 0,
  credits_remaining_cents integer NOT NULL DEFAULT 0
    CHECK (credits_remaining_cents >= 0),
  daily_used_cents integer DEFAULT 0,
  last_daily_reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT token_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT token_credits_subscription_id_fkey FOREIGN KEY (subscription_id)
    REFERENCES public.subscriptions(id)
);

-- Indexes
CREATE INDEX idx_token_credits_user_id ON public.token_credits(user_id);
CREATE INDEX idx_token_credits_subscription_id ON public.token_credits(subscription_id);
CREATE INDEX idx_token_credits_period ON public.token_credits(period_start, period_end);

-- Unique constraint for upsert in reset operations
CREATE UNIQUE INDEX idx_token_credits_unique_period
  ON public.token_credits(user_id, subscription_id, period_start, period_end);
```

**Purpose**: Credit management with monthly allocations and daily limits (30% of monthly)
**Credit System**:

- Credits stored in cents (1 credit = 100 cents)
- Daily limit = 30% of monthly allocation
- Automatic daily reset every 24 hours

**RLS Policies**:

- Users can view own credits
- Service role manages all credits

---

#### 4. credit_transactions

Audit log of all credit operations.

```sql
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                          -- FK to auth.users(id)
  credit_account_id uuid,                         -- FK to token_credits(id)
  transaction_type text NOT NULL                  -- allocation, deduction, reset, refund
    CHECK (transaction_type IN ('allocation', 'deduction', 'reset', 'refund')),
  amount_cents integer NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_transactions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id),
  CONSTRAINT credit_transactions_credit_account_id_fkey FOREIGN KEY (credit_account_id)
    REFERENCES public.token_credits(id)
);

-- Indexes
CREATE INDEX idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_account_id ON public.credit_transactions(credit_account_id);
```

**Purpose**: Immutable audit trail of all credit changes
**Transaction Types**:

- `allocation`: Initial credit grant or top-up
- `deduction`: Credit usage for API calls
- `reset`: Period renewal
- `refund`: Credit restoration for failed operations

---

#### 5. beta_invites

Invitation system for beta access and trial plans.

```sql
CREATE TABLE public.beta_invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  email text,
  max_uses integer DEFAULT 1,
  current_uses integer DEFAULT 0,
  plan_tier text NOT NULL DEFAULT 'hobby'
    CHECK (plan_tier IN ('free', 'hobby', 'pro')),
  trial_days integer DEFAULT 90,
  discount_percent integer DEFAULT 50
    CHECK (discount_percent >= 0 AND discount_percent <= 100),
  stripe_coupon_id text,
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_by uuid,                                 -- FK to profiles(id)
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_invites_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES public.profiles(id)
);
```

**Purpose**: Manage beta invite codes with usage tracking
**Features**:

- Reusable codes (max_uses > 1)
- Email-specific invites
- Automatic expiration
- Stripe coupon integration

---

#### 6. beta_redemptions

Tracks which users have redeemed beta invites.

```sql
CREATE TABLE public.beta_redemptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invite_id uuid NOT NULL,                        -- FK to beta_invites(id)
  user_id uuid NOT NULL,                          -- FK to profiles(id)
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_redemptions_invite_id_fkey FOREIGN KEY (invite_id)
    REFERENCES public.beta_invites(id),
  CONSTRAINT beta_redemptions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles(id)
);
```

**Purpose**: Prevent duplicate invite redemptions
**Enforcement**: Used by `claim_beta_invite()` function for atomic claim operations

---

### Device Management

#### 7. device_authorization_codes

OAuth-style device authorization for desktop and mobile clients.

```sql
CREATE TABLE public.device_authorization_codes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id text NOT NULL,
  device_name text,
  device_type text,
  user_code text NOT NULL UNIQUE,                 -- 6-digit pairing code
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'expired', 'revoked')),
  user_id uuid,                                   -- FK to auth.users(id), set on authorization
  authorized_at timestamptz,
  expires_at timestamptz NOT NULL,                -- Typically 5 minutes from creation
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT device_authorization_codes_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes
CREATE UNIQUE INDEX idx_device_auth_user_code ON public.device_authorization_codes(user_code);
CREATE INDEX idx_device_auth_device_id ON public.device_authorization_codes(device_id);
CREATE INDEX idx_device_auth_user_id ON public.device_authorization_codes(user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_device_auth_status ON public.device_authorization_codes(status)
  WHERE status = 'pending';
```

**Purpose**: Secure device pairing flow
**Flow**:

1. Desktop generates 6-digit code
2. User enters code in web app
3. Web app authorizes device
4. Desktop polls for authorization status

---

#### 8. desktop_devices

Registered desktop clients for persistent tracking.

```sql
CREATE TABLE public.desktop_devices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,                          -- FK to auth.users(id)
  name text NOT NULL
    CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  platform text NOT NULL
    CHECK (platform IN ('macos', 'windows', 'linux')),
  version text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  registered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT desktop_devices_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_desktop_devices_user_id ON public.desktop_devices(user_id);
CREATE INDEX idx_desktop_devices_last_seen ON public.desktop_devices(last_seen_at DESC);
```

**Purpose**: Track registered desktop clients across restarts
**Replaces**: In-memory device registry in API gateway

---

#### 9. mobile_devices

Registered mobile clients with push notification support.

```sql
CREATE TABLE public.mobile_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                          -- FK to auth.users(id)
  platform text NOT NULL,
  name text NOT NULL,
  push_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_devices_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_mobile_devices_user_id ON public.mobile_devices(user_id);
CREATE INDEX idx_mobile_devices_push_token ON public.mobile_devices(push_token)
  WHERE push_token IS NOT NULL;
```

**Purpose**: Mobile device registration for sync and notifications

---

### Cross-Device Synchronization

#### 10. sync_data

Persistent storage for cross-device synchronization events.

```sql
CREATE TABLE public.sync_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                          -- FK to auth.users(id)
  device_id text NOT NULL,
  sync_type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sync_data_user_device_idx UNIQUE (user_id, device_id, sync_type, created_at),
  CONSTRAINT sync_data_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_sync_data_user_timestamp ON sync_data(user_id, created_at DESC);
CREATE INDEX idx_sync_data_device ON sync_data(device_id, created_at DESC);
```

**Purpose**: Replace in-memory sync storage with persistent database
**Features**:

- 24-hour TTL for automatic cleanup
- Per-user limit of 1000 entries
- Efficient timestamp-based queries

**Cleanup Function**:

```sql
CREATE FUNCTION cleanup_old_sync_data() RETURNS void AS $$
BEGIN
  DELETE FROM sync_data WHERE created_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

#### 11. signaling_sessions

WebSocket pairing sessions for real-time device connection.

```sql
CREATE TABLE public.signaling_sessions (
  code text PRIMARY KEY,                          -- 6-digit pairing code
  created_at bigint NOT NULL,                     -- Unix timestamp (ms)
  expires_at bigint NOT NULL,                     -- Unix timestamp (ms)
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Index for cleanup
CREATE INDEX idx_signaling_sessions_expires_at ON public.signaling_sessions(expires_at);
```

**Purpose**: Temporary pairing codes for WebSocket connections
**TTL**: 5 minutes default
**Service Role Only**: No user access via RLS

---

### Webhook & Event Processing

#### 12. processed_stripe_events

Idempotency tracking for Stripe webhooks.

```sql
CREATE TABLE public.processed_stripe_events (
  event_id text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);
```

**Purpose**: Ensure each Stripe webhook is processed exactly once
**Usage**: Called by `process_stripe_event_idempotent(event_id)` function

---

### Organizations & Collaboration

#### 13. organizations

Multi-user organizations for team features.

```sql
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_by uuid,                                -- FK to profiles(id)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES public.profiles(id)
);
```

---

#### 14. organization_members

Organization membership with role-based access.

```sql
CREATE TABLE public.organization_members (
  organization_id uuid,                           -- FK to organizations(id)
  user_id uuid,                                   -- FK to profiles(id)
  role text NOT NULL
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (organization_id, user_id),
  CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE
);
```

**Role Hierarchy**:

- `owner`: Full control, billing access
- `admin`: Manage members, settings
- `member`: Standard access
- `viewer`: Read-only access

---

### Additional Tables

#### 15. pricing_plans

Available subscription plans and pricing.

```sql
CREATE TABLE public.pricing_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_product_id text,
  stripe_price_id text UNIQUE,
  name text NOT NULL,
  tier text NOT NULL
    CHECK (tier IN ('free', 'hobby', 'pro', 'max')),
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  interval text CHECK (interval IN ('month', 'year', 'one_time')),
  features jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  monthly_credits_cents integer DEFAULT 0,
  stripe_coupon_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

---

#### 16. waitlist

Pre-launch email collection.

```sql
CREATE TABLE public.waitlist (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  name text,
  company text,
  role text,
  use_case text,
  referral_source text,
  referral_code text,
  ip_address text,
  user_agent text,
  marketing_consent boolean DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'invited', 'converted', 'unsubscribed')),
  invited_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

#### 17-21. Email System

Tables for email campaigns and preferences:

- `email_campaigns`: Campaign management
- `email_preferences`: User email settings
- `email_sends`: Individual email tracking

---

#### 22-28. Platform Features

- `feature_flags`: User-specific feature toggles
- `feedback`: User feedback submissions
- `referrals`: Referral program tracking
- `usage_events`: User activity analytics
- `api_keys`: API authentication
- `audit_logs`: System audit trail
- `notifications`: In-app notifications

---

## SQLite Desktop Schema

The SQLite database powers the desktop application with 75+ tables organized into functional domains.

### Schema Version Management

```sql
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Current Version**: 45
**Migration Strategy**: Sequential versioned migrations with savepoint-based rollback

---

### Core Communication

#### conversations

```sql
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose**: Chat conversation threads
**Relationships**: Parent of messages

---

#### messages

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens INTEGER,
  cost REAL,
  provider TEXT,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Full-text search index
CREATE VIRTUAL TABLE messages_fts USING fts5(
  message_id UNINDEXED,
  conversation_id UNINDEXED,
  content,
  sender UNINDEXED,
  message_type UNINDEXED,
  timestamp UNINDEXED,
  tokenize = 'porter unicode61 remove_diacritics 2'
);
```

**Purpose**: Individual chat messages with cost tracking
**FTS**: Full-text search powered by SQLite FTS5
**Auto-sync**: Triggers keep FTS table synchronized

---

### Settings & Configuration

#### settings_v2

```sql
CREATE TABLE settings_v2 (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
  category TEXT NOT NULL DEFAULT 'general',
  encrypted BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose**: Type-safe settings with optional encryption
**Categories**: general, llm, security, ui, automation
**Encryption**: AES-GCM for sensitive values (API keys)

---

### Automation & History

#### automation_history

```sql
CREATE TABLE automation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  error TEXT,
  duration_ms INTEGER NOT NULL,
  cost REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Task Types**: windows_automation, browser_automation, file_operation, terminal_command, code_editing, database_query, api_call

---

#### command_history

```sql
CREATE TABLE command_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command TEXT NOT NULL,
  args TEXT,  -- JSON array
  working_dir TEXT NOT NULL,
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose**: Terminal command execution log

---

#### clipboard_history

```sql
CREATE TABLE clipboard_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose**: Clipboard monitoring and history

---

### Security & Permissions

#### permissions

```sql
CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  permission_type TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('allowed', 'prompt', 'prompt_once', 'denied')),
  pattern TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(permission_type, pattern)
);
```

**Permission Types**:

- FILE_READ, FILE_WRITE, FILE_DELETE, FILE_EXECUTE
- COMMAND_EXECUTE
- APP_LAUNCH, APP_TERMINATE
- CLIPBOARD_READ, CLIPBOARD_WRITE
- PROCESS_LIST, PROCESS_TERMINATE

---

#### audit_log

```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_type TEXT NOT NULL,
  operation_details TEXT NOT NULL,
  permission_type TEXT NOT NULL,
  approved BOOLEAN NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose**: Immutable audit trail of all permission checks

---

### Caching System

#### cache_entries

```sql
CREATE TABLE cache_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  response TEXT NOT NULL,
  tokens INTEGER,
  cost REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  tokens_saved INTEGER NOT NULL DEFAULT 0,
  cost_saved REAL NOT NULL DEFAULT 0.0,
  temperature REAL,
  max_tokens INTEGER
);

CREATE INDEX idx_cache_entries_key ON cache_entries(cache_key);
CREATE INDEX idx_cache_entries_expires ON cache_entries(expires_at);
CREATE INDEX idx_cache_entries_provider_model ON cache_entries(provider, model);
```

**Purpose**: LLM response caching for cost savings
**Features**:

- Hit count tracking
- Cost savings calculation
- Automatic expiration

---

### Browser Automation

#### browser_sessions

```sql
CREATE TABLE browser_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  browser_type TEXT NOT NULL,
  profile_name TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  tabs_opened INTEGER NOT NULL DEFAULT 0,
  actions_performed INTEGER NOT NULL DEFAULT 0
);
```

---

#### browser_tabs

```sql
CREATE TABLE browser_tabs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  tab_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES browser_sessions(session_id)
);
```

---

#### browser_automation_history

```sql
CREATE TABLE browser_automation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  action_type TEXT NOT NULL,
  target_url TEXT,
  target_selector TEXT,
  success BOOLEAN NOT NULL,
  error TEXT,
  duration_ms INTEGER NOT NULL,
  screenshot_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES browser_sessions(session_id)
);
```

**Action Types**: navigate, click, type, scroll, screenshot, wait, extract

---

### Calendar & Email Integration

#### calendar_accounts

```sql
CREATE TABLE calendar_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'apple')),
  email TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TEXT,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

#### email_accounts

```sql
CREATE TABLE email_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook', 'imap')),
  email TEXT NOT NULL UNIQUE,
  imap_host TEXT,
  imap_port INTEGER,
  smtp_host TEXT,
  smtp_port INTEGER,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TEXT,
  password TEXT,  -- Encrypted
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

#### emails & email_attachments

Full email storage with MIME parsing and attachments.

---

### MCP (Model Context Protocol)

#### mcp_servers

```sql
CREATE TABLE mcp_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  command TEXT NOT NULL,
  args TEXT,  -- JSON array
  env TEXT,   -- JSON object
  is_enabled BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

#### mcp_tools_cache

```sql
CREATE TABLE mcp_tools_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_name TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_schema TEXT NOT NULL,  -- JSON
  cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(server_name, tool_name)
);
```

**Purpose**: Cache MCP tool schemas to avoid repeated server queries

---

### Autonomous Operation

#### autonomous_sessions

```sql
CREATE TABLE autonomous_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  goal TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  approval_mode TEXT NOT NULL CHECK (approval_mode IN ('full_auto', 'ask', 'notify')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  total_tasks INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  failed_tasks INTEGER NOT NULL DEFAULT 0
);
```

---

#### autonomous_task_logs

```sql
CREATE TABLE autonomous_task_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  task_number INTEGER NOT NULL,
  task_type TEXT NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  result TEXT,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES autonomous_sessions(session_id)
);
```

---

### Checkpoints & Restore

#### conversation_checkpoints

```sql
CREATE TABLE conversation_checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  checkpoint_name TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  snapshot_data TEXT NOT NULL,  -- JSON
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
```

**Purpose**: Save conversation state for rollback

---

#### checkpoint_restore_history

```sql
CREATE TABLE checkpoint_restore_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  checkpoint_id INTEGER NOT NULL,
  restored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  messages_removed INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (checkpoint_id) REFERENCES conversation_checkpoints(id)
);
```

---

### Workflows & Templates

#### workflow_definitions

```sql
CREATE TABLE workflow_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  workflow_data TEXT NOT NULL,  -- JSON: nodes, edges, variables
  trigger_config TEXT,          -- JSON
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

#### workflow_executions

```sql
CREATE TABLE workflow_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  trigger_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  error TEXT,
  execution_data TEXT,  -- JSON
  FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id)
);
```

---

### Billing (Local Mirror)

Local cache of billing data from Supabase:

- `billing_customers`
- `billing_subscriptions`
- `billing_invoices`
- `billing_usage`
- `billing_payment_methods`

**Purpose**: Offline access to billing information

---

### Additional Desktop Tables

**Analytics & Metrics**:

- `analytics_snapshots`
- `process_benchmarks`
- `roi_configurations`
- `realtime_metrics`
- `user_milestones`

**Teams** (Desktop collaboration):

- `teams`
- `team_members`
- `team_invitations`
- `team_resources`
- `team_activity`

**Tutorials & Onboarding**:

- `tutorial_progress`
- `tutorial_step_views`
- `user_rewards`
- `tutorial_feedback`

**Computer Use**:

- `computer_use_sessions`
- `computer_use_actions`

---

## Entity Relationship Diagrams

### Supabase Schema ER Diagram

```
auth.users (Supabase Auth)
    │
    ├── profiles (1:1)
    │       │
    │       ├── subscriptions (1:1)
    │       │       │
    │       │       └── token_credits (1:N)
    │       │               │
    │       │               └── credit_transactions (1:N)
    │       │
    │       ├── beta_redemptions (1:N)
    │       │       │
    │       │       └── beta_invites (N:1)
    │       │
    │       ├── device_authorization_codes (1:N)
    │       ├── desktop_devices (1:N)
    │       ├── mobile_devices (1:N)
    │       ├── sync_data (1:N)
    │       ├── api_keys (1:N)
    │       └── notifications (1:N)
    │
    └── organizations (N:N via organization_members)
            │
            ├── audit_logs
            └── team_resources
```

### SQLite Schema ER Diagram

```
conversations
    │
    ├── messages (1:N)
    │   └── messages_fts (full-text search)
    │
    └── conversation_checkpoints (1:N)
            └── checkpoint_restore_history (1:N)

autonomous_sessions
    └── autonomous_task_logs (1:N)

browser_sessions
    ├── browser_tabs (1:N)
    └── browser_automation_history (1:N)

email_accounts
    └── emails (1:N)
            └── email_attachments (1:N)

workflow_definitions
    └── workflow_executions (1:N)
            └── workflow_execution_logs (1:N)

mcp_servers
    └── mcp_tools_cache (1:N)
```

---

## Common Patterns

### Timestamp Conventions

**Supabase PostgreSQL**:

- Type: `timestamptz` (timestamp with time zone)
- Default: `timezone('utc'::text, now())` or `NOW()`
- Always stored in UTC

**SQLite**:

- Type: `TEXT` (ISO 8601 format)
- Default: `CURRENT_TIMESTAMP`
- Format: `YYYY-MM-DD HH:MM:SS` (UTC)

### UUID Generation

**Supabase**:

```sql
uuid_generate_v4()    -- Requires uuid-ossp extension
gen_random_uuid()     -- Built-in PostgreSQL 13+
```

**SQLite**:

- No native UUID support
- Use `INTEGER PRIMARY KEY AUTOINCREMENT` or generate UUIDs in application code

### Soft Delete Pattern

Not widely used in current schema. When needed:

```sql
-- Add to table
deleted_at timestamptz,
is_deleted boolean DEFAULT false

-- Filter in queries
WHERE deleted_at IS NULL
-- or
WHERE is_deleted = false
```

### Audit Timestamps

Standard pattern for both databases:

```sql
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
```

**Auto-update trigger** (Supabase example):

```sql
CREATE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_table_updated_at
  BEFORE UPDATE ON table_name
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### JSONB Usage

**Supabase**: Native `jsonb` type with indexing

```sql
metadata jsonb DEFAULT '{}'::jsonb

-- Index for specific JSON key
CREATE INDEX idx_metadata_key ON table((metadata->>'key'));
```

**SQLite**: Stored as `TEXT`, parsed in application

```sql
metadata TEXT DEFAULT '{}'

-- JSON functions available in SQLite 3.38+
SELECT json_extract(metadata, '$.key') FROM table;
```

### Foreign Key Cascade Patterns

**CASCADE**: Delete children when parent deleted

```sql
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
```

**SET NULL**: Preserve child, null out reference

```sql
FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
```

**RESTRICT** (default): Prevent parent deletion if children exist

---

## Data Types and Conventions

### String Types

**Supabase**:

- `text`: Variable-length, no limit
- `varchar(n)`: Variable-length with limit
- Use `text` unless specific length constraint needed

**SQLite**:

- `TEXT`: All strings
- No distinction between varchar/char

### Numeric Types

**Supabase**:

- `integer`: 4-byte signed
- `bigint`: 8-byte signed
- `real`: 4-byte float
- `numeric(p,s)`: Arbitrary precision

**SQLite**:

- `INTEGER`: Variable-length signed (1-8 bytes)
- `REAL`: 8-byte float
- No separate bigint type

### Boolean Types

**Supabase**:

- `boolean`: True/false
- Stored efficiently as single bit

**SQLite**:

- `BOOLEAN`: Actually stored as `INTEGER` (0=false, 1=true)
- Use `CHECK (column IN (0, 1))` for validation

### Currency Storage

**Best Practice**: Store as integer cents

```sql
-- Supabase & SQLite
price_cents INTEGER NOT NULL DEFAULT 0

-- Display: price_cents / 100.0
-- Input: FLOOR(price_dollars * 100)
```

**Rationale**:

- Avoids floating-point precision issues
- Exact arithmetic
- Easy currency conversion

### Enumerated Types

**Supabase**: Use `CHECK` constraints

```sql
status TEXT NOT NULL
  CHECK (status IN ('pending', 'active', 'completed'))
```

**SQLite**: Same pattern

```sql
status TEXT NOT NULL
  CHECK (status IN ('pending', 'active', 'completed'))
```

**Application Layer**: Define TypeScript enums

```typescript
enum Status {
  Pending = 'pending',
  Active = 'active',
  Completed = 'completed',
}
```

---

## Next Steps

For more information, see:

- [MIGRATIONS.md](./MIGRATIONS.md) - Migration strategy and how to create new migrations
- [RLS_POLICIES.md](./RLS_POLICIES.md) - Row Level Security documentation
- [QUERY_OPTIMIZATION.md](./QUERY_OPTIMIZATION.md) - Performance tuning guide
- [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) - Backup and disaster recovery procedures
