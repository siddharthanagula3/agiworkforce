# Design Spec: Dual-Mode Architecture (Local + Cloud)

> Created: 2026-03-19
> Author: Siddhartha Nagula + Claude
> Status: Approved

---

## 1. Problem

AGI Workforce needs two operating modes:

1. **Local Mode** (Free) — Local LLMs + BYOK API keys, local SQLite, no account, fully offline, 100% private
2. **Cloud Mode** (Subscription) — Frontier models included, cloud sync across desktop/web/mobile, no API keys needed

This mirrors the industry pattern (Claude Desktop ↔ claude.ai, ChatGPT Desktop ↔ chatgpt.com) while adding a Local Mode that no competitor offers.

## 2. Business Model

| Tier     | Price  | LLM Access                                        | Data                  | Features                                                         |
| -------- | ------ | ------------------------------------------------- | --------------------- | ---------------------------------------------------------------- |
| **Free** | $0     | Local LLMs (Ollama/LM Studio) + BYOK API keys     | Local SQLite only     | Full desktop app, all 150+ skills, unlimited MCP tools           |
| **Pro**  | $20/mo | Frontier models included (Claude, GPT-4o, Gemini) | Cloud sync (Supabase) | + Web app, mobile companion, usage dashboard, 20 scheduled tasks |
| **Max**  | $50/mo | Unlimited frontier usage                          | Cloud sync            | + Teams, unlimited schedules, unlimited memory, priority access  |

Revenue comes from subscriptions (Pro/Max), not from API key markup. Free tier users pay their own LLM providers directly via BYOK.

## 3. Architecture

### 3.1 Mode Toggle

```
┌─────────────────────────────────────────┐
│            AGI Workforce Desktop         │
│                                          │
│  ┌────────────────┐ ┌────────────────┐  │
│  │  LOCAL MODE     │ │  CLOUD MODE    │  │
│  │                 │ │                │  │
│  │ LLM: Ollama /   │ │ LLM: Proxied   │  │
│  │   BYOK keys     │ │   via Gateway  │  │
│  │                 │ │                │  │
│  │ Data: SQLite    │ │ Data: Supabase │  │
│  │   (local only)  │ │   (cloud sync) │  │
│  │                 │ │                │  │
│  │ Auth: None      │ │ Auth: OAuth2   │  │
│  │                 │ │   PKCE         │  │
│  └────────────────┘ └────────────────┘  │
│                                          │
│       appModeStore.mode: 'local'|'cloud' │
└─────────────────────────────────────────┘
```

- Stored in `appModeStore.ts` (Zustand, persisted)
- Toggle in Settings and sidebar footer
- Switching to Cloud prompts login if not authenticated
- Switching to Local works immediately
- Conversations do NOT migrate between modes — clean separation

### 3.2 First Launch Onboarding

Clean choice screen on first launch:

**Card A: "Local Mode"**

- Icon: Shield
- "Free, private, yours"
- "Use local models or your own API keys. No account needed."
- Button: "Start Local" → enters app immediately

**Card B: "Cloud Mode"**

- Icon: Cloud
- "Frontier models, synced everywhere"
- "Sign in to get Claude, GPT-4o, Gemini with cloud sync."
- Button: "Sign In" → OAuth flow → Stripe checkout

Choice stored in `appModeStore.mode`. Shown only on first launch (`appModeStore.hasOnboarded === false`).

### 3.3 Local Mode

**LLM Routing** (existing `llm_router.rs`):

- Auto-detects Ollama at `localhost:11434`
- Auto-detects LM Studio at `localhost:1234`
- BYOK: User enters API keys in Settings → stored via SecretManager (Argon2id + AES-GCM)
- Routes directly to: Anthropic, OpenAI, Google, Mistral, xAI, DeepSeek
- User pays their own API costs — we never see the bill

**Data Storage**:

- Conversations: Local SQLite (`~/.agiworkforce/sessions.db`)
- Settings: Zustand persist → localStorage
- Memory: Local SQLite
- Files: Local filesystem only
- **Nothing ever leaves the device.**

**Available features**: Everything in the desktop app EXCEPT cloud sync, mobile companion, and web app access.

### 3.4 Cloud Mode

Follows the same pattern as Claude Desktop and ChatGPT Desktop:

**Authentication**:

- OAuth2 PKCE via Supabase Auth
- Desktop opens Supabase login URL in system browser
- Callback redirects via deep link: `agiworkforce://auth/callback`
- Session token stored in macOS Keychain via Tauri secure storage
- Token refresh handled by Supabase client SDK

**LLM Routing** (private API — NOT public developer APIs):

- Desktop → API Gateway (`services/api-gateway`) → LLM providers
- We proxy all LLM calls and pay for compute
- User selects model in UI, never manages API keys
- Rate limiting per user via Upstash Redis
- Usage tracking per user via billing tables

**Data Storage**:

- Conversations: Supabase Postgres (shared with web app)
- Desktop and web both read/write same tables via Supabase client
- No local conversation cache — cloud-only (matches competitor pattern)
- Settings synced to `user_settings` table in Supabase

**Streaming**:

- SSE (Server-Sent Events) for LLM responses
- Same streaming pattern already used in Local Mode
- Gateway streams from LLM provider → desktop client

**Cross-device sync**:

- Not real-time push (competitors don't do this either)
- Desktop and web both query same Supabase database
- Conversations appear on all surfaces on next load/refresh

### 3.5 API Gateway Routes (Cloud Mode)

New routes in `services/api-gateway/src/routes/chat.ts`:

```
POST   /api/v1/chat/send              — Send message (proxied to LLM, returns SSE stream)
GET    /api/v1/conversations           — List user's conversations
POST   /api/v1/conversations           — Create new conversation
GET    /api/v1/conversations/:id       — Get conversation with messages
DELETE /api/v1/conversations/:id       — Soft-delete conversation
PATCH  /api/v1/conversations/:id       — Update title, archive, etc.
GET    /api/v1/models                  — List available models for user's plan
GET    /api/v1/usage                   — Usage stats for billing period
```

All routes require Supabase JWT validation via existing middleware.

### 3.6 Database Schema (Cloud Mode)

New Supabase migration for cloud conversations:

```sql
-- Cloud conversations (mirrors local SQLite schema)
CREATE TABLE cloud_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_archived BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'
);

-- Cloud messages
CREATE TABLE cloud_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES cloud_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE cloud_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own conversations"
  ON cloud_conversations FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only access messages in their conversations"
  ON cloud_messages FOR ALL
  USING (conversation_id IN (
    SELECT id FROM cloud_conversations WHERE user_id = auth.uid()
  ));
```

### 3.7 Billing Integration

Stripe integration (existing in `apps/web`):

- **Pro ($20/mo)**: `price_pro_monthly` — includes ~500 messages/day with frontier models
- **Max ($50/mo)**: `price_max_monthly` — unlimited usage + team features
- Billing portal: existing Stripe customer portal
- Usage metering: track input/output tokens per user per billing period
- Overage: soft cap with usage warnings (UsageLimitBanner component, already built)

### 3.8 Feature Gating

| Feature                       | Free (Local/BYOK) | Pro ($20/mo)  | Max ($50/mo) |
| ----------------------------- | ----------------- | ------------- | ------------ |
| Local LLMs (Ollama/LM Studio) | Unlimited         | Unlimited     | Unlimited    |
| BYOK API keys                 | Unlimited         | Unlimited     | Unlimited    |
| Cloud frontier models         | None              | ~500 msgs/day | Unlimited    |
| Desktop app                   | Full              | Full          | Full         |
| Web app                       | Read-only         | Full          | Full         |
| Mobile companion              | None              | Full          | Full         |
| Cloud sync                    | None              | Full          | Full         |
| Scheduled tasks               | 3 max             | 20 max        | Unlimited    |
| Teams                         | None              | None          | Full         |
| Cloud memory                  | None              | 1,000 items   | Unlimited    |
| MCP tools                     | Unlimited         | Unlimited     | Unlimited    |
| Skills                        | All 150+          | All 150+      | All 150+     |
| Voice mode                    | Full              | Full          | Full         |
| Computer use                  | Full              | Full          | Full         |

## 4. Chat Store Integration

The key architectural change: `chatStore.sendMessage()` routes based on mode.

```typescript
// In chat store send logic:
const mode = useAppModeStore.getState().mode;

if (mode === 'local') {
  // Existing path: invoke('llm_send_message', { ... })
  // Data saved to local SQLite
} else {
  // New path: fetch('/api/v1/chat/send', { ... })
  // Data saved to Supabase via API gateway
  // SSE streaming for response
}
```

Conversation listing similarly routes:

- Local: `invoke('list_conversations')` → local SQLite
- Cloud: `supabase.from('cloud_conversations').select()` → Supabase

## 5. Files to Create/Modify

### New Files

| File                                                         | Purpose                                                |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| `apps/desktop/src/stores/appModeStore.ts`                    | Mode state (local/cloud), plan tier, onboarding flag   |
| `apps/desktop/src/components/Onboarding/ModeSelector.tsx`    | First-launch mode choice screen                        |
| `apps/desktop/src/api/cloudApi.ts`                           | Cloud Mode API client (conversations, messages, usage) |
| `services/api-gateway/src/routes/chat.ts`                    | Chat CRUD + LLM proxy routes                           |
| `services/api-gateway/src/routes/usage.ts`                   | Usage tracking routes                                  |
| `supabase/migrations/20260319000002_cloud_conversations.sql` | Cloud conversation tables + RLS                        |

### Modified Files

| File                                                         | Change                                       |
| ------------------------------------------------------------ | -------------------------------------------- |
| `apps/desktop/src/stores/chat/index.ts`                      | Route sends to local OR cloud based on mode  |
| `apps/desktop/src/services/supabaseAuth.ts`                  | Desktop OAuth PKCE flow + deep link callback |
| `apps/desktop/src/components/Settings/SettingsPanel.tsx`     | Mode toggle + plan management section        |
| `apps/desktop/src/components/UnifiedAgenticChat/Sidebar.tsx` | Mode indicator in footer                     |
| `apps/desktop/src/App.tsx`                                   | Show ModeSelector on first launch            |
| `services/api-gateway/src/index.ts`                          | Mount new chat + usage routes                |
| `apps/desktop/src-tauri/tauri.conf.json`                     | Deep link scheme registration                |

## 6. Spec Review Fixes (from architectural review)

### Fix 1: Use existing `conversations` + `messages` tables

Do NOT create `cloud_conversations` / `cloud_messages`. Supabase already has `public.conversations` and `public.messages` tables with RLS, Realtime, and richer schema (includes `source`, `provider`, `last_message_at`, `cost`, `tool_calls`). The `cloudApi.ts` client and chat routes reference these existing tables.

### Fix 2: Create `cloudChat.ts`, not overwrite `chat.ts`

`services/api-gateway/src/routes/chat.ts` already exists (mobile bridge). Create `services/api-gateway/src/routes/cloudChat.ts` for LLM-proxy routes under `/api/v1/chat`. Mount both routers in `index.ts`.

### Fix 3: Plan tiers include `hobby` and `enterprise`

Live auth code defines 5 tiers: `free`, `hobby`, `pro`, `max`, `enterprise`. `appModeStore` must use the full `PlanTier` type. `hobby` maps to free-tier feature behavior.

### Fix 4: Integrate mode choice into existing OnboardingWizard

Do NOT create a separate `ModeSelector.tsx`. Add mode choice as Step 1 of the existing `OnboardingWizard.tsx`. Use the same `onboardingCompleted` flag from `useSimpleModeStore` — do not create a second first-launch guard.

### Fix 5: Use `API_BASE_URL` for cloud fetch calls

Desktop `fetch()` calls must use the fully qualified gateway URL (from `API_BASE_URL` in `api/client`), not relative paths. Tauri's asset server does not proxy to external APIs.

### Fix 6: Verify `useDeepLink` handles `auth/callback`

Before Cloud Mode login can work, `apps/desktop/src/hooks/useDeepLink.ts` must handle `agiworkforce://auth/callback?code=...` and call `supabaseAuth.exchangeCodeForSession(code)`. This is the prerequisite for all Cloud Mode auth.

### Fix 7: SSE streaming implementation details

- `POST /api/v1/chat/send` returns `Content-Type: text/event-stream`
- Client uses `fetch()` with `response.body.getReader()` (not `await response.json()`)
- `tauri://localhost` must be in `ALLOWED_ORIGINS` for CORS
- Production Tauri scheme must also be whitelisted

### Fix 8: Block mode switch during active streaming

Before allowing mode toggle, check `chatStore.isStreaming`. If active, show toast: "Finish the current response first." Do not switch modes mid-stream.

### Fix 9: Server-side plan enforcement

`POST /api/v1/chat/send` must check `plan_tier` from `subscriptions` table before proxying to LLM. Return `403 Forbidden` if free tier. Client-side gating is additional UX only, not sole enforcement.

### Fix 10: Cloud Mode offline behavior

When offline in Cloud Mode, show empty state with "No connection — switch to Local Mode or reconnect" prompt. No local conversation cache for cloud data in V1.

## 7. Updated Files List

### New Files

| File                                           | Purpose                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/desktop/src/stores/appModeStore.ts`      | Mode state (local/cloud), plan tier, uses full `PlanTier` type                                 |
| `apps/desktop/src/api/cloudApi.ts`             | Cloud Mode API client using `API_BASE_URL`, targets existing `conversations`/`messages` tables |
| `services/api-gateway/src/routes/cloudChat.ts` | Chat CRUD + LLM proxy routes with plan-tier enforcement                                        |
| `services/api-gateway/src/routes/usage.ts`     | Usage tracking routes                                                                          |

### Modified Files

| File                                                          | Change                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/desktop/src/stores/chat/index.ts`                       | Route sends to local OR cloud based on `appModeStore.mode`               |
| `apps/desktop/src/hooks/useDeepLink.ts`                       | Handle `auth/callback` path, call `exchangeCodeForSession()`             |
| `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx` | Add mode choice as Step 1                                                |
| `apps/desktop/src/components/Settings/SettingsPanel.tsx`      | Mode toggle + plan management                                            |
| `apps/desktop/src/components/UnifiedAgenticChat/Sidebar.tsx`  | Mode indicator in footer                                                 |
| `services/api-gateway/src/index.ts`                           | Mount `cloudChatRouter` under `/api/v1/chat`, add CORS for Tauri origins |

### Removed from original plan

| File                                         | Reason                                                             |
| -------------------------------------------- | ------------------------------------------------------------------ |
| ~~`ModeSelector.tsx`~~                       | Integrated into existing `OnboardingWizard.tsx`                    |
| ~~`20260319000002_cloud_conversations.sql`~~ | Existing `conversations`/`messages` tables already have the schema |

## 8. Build Order

1. Verify/extend `useDeepLink` for `auth/callback` (blocks Cloud Mode login)
2. Create `appModeStore.ts`
3. Integrate mode choice into `OnboardingWizard` Step 1
4. Create `cloudApi.ts` targeting existing Supabase tables
5. Create `cloudChat.ts` in API gateway with plan-tier enforcement
6. Mount `cloudChatRouter` in `index.ts` + CORS update
7. Add mode-switch guard in chat store (block during streaming)
8. Update `chatStore.sendMessage()` to branch on mode
9. Add Settings mode toggle and sidebar indicator
10. Test full flow: Local → Cloud → sign in → chat → see on web

## 9. Out of Scope (V2)

- Real-time cross-device push notifications (WebSocket)
- Conversation migration between Local and Cloud modes
- End-to-end encrypted cloud backup for Local Mode
- Team conversation sharing
- Enterprise SSO (SAML/OIDC)
- Windows/Linux local model auto-detection
- API key cost estimation for BYOK users
- Web app write-gating for free tier (needs web middleware changes)
- Local conversation cache for Cloud Mode offline use

## 10. Success Criteria

1. User can launch app and use Local Mode with Ollama without creating an account
2. User can toggle to Cloud Mode, sign in via OAuth PKCE, and chat with Claude/GPT-4o
3. Cloud conversations appear on both desktop app and web app (same Supabase tables)
4. Switching back to Local Mode shows only local conversations
5. Pro/Max subscription gates enforced server-side (403 on free tier cloud model requests)
6. Mode switch blocked during active streaming
7. `pnpm typecheck` and `pnpm lint` pass with zero errors
