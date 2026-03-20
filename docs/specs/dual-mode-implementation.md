# Dual-Mode Architecture (Local + Cloud) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Local/Cloud mode toggle to AGI Workforce desktop — Local uses Ollama/BYOK (free, offline), Cloud uses proxied frontier models with Supabase sync (Pro $20/Max $50).

**Architecture:** Desktop app gets an `appModeStore` that routes all LLM calls and data persistence through either the existing Rust/SQLite path (Local) or a new Express API gateway + Supabase path (Cloud). Auth via OAuth2 PKCE through Supabase. No database migration needed — uses existing `conversations`/`messages` tables.

**Tech Stack:** Tauri v2 (Rust), React 19, Zustand v5, Supabase (Auth + Postgres + Realtime), Express API gateway, Stripe billing, SSE streaming.

**Spec:** `docs/specs/2026-03-19-dual-mode-architecture-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `apps/desktop/src/stores/appModeStore.ts` | Mode state (local/cloud), plan tier, persistence |
| `apps/desktop/src/api/cloudApi.ts` | Cloud API client: conversations CRUD, message send (SSE), usage |
| `services/api-gateway/src/routes/cloudChat.ts` | Express routes: `/api/v1/chat/send`, `/api/v1/conversations/*` |
| `services/api-gateway/src/routes/usage.ts` | Express routes: `/api/v1/usage` |
| `services/api-gateway/src/middleware/planGate.ts` | Middleware: check subscription tier before LLM proxy |

### Modified Files
| File | Change |
|------|--------|
| `apps/desktop/src/hooks/useDeepLink.ts` | Add `auth/callback` handler → `exchangeCodeForSession()` |
| `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx` | Add mode choice as new Step 0 |
| `apps/desktop/src/stores/chat/index.ts` | Branch `sendMessage()` on mode (local invoke vs cloud fetch) |
| `apps/desktop/src/components/Settings/SettingsPanel.tsx` | Add mode toggle section |
| `apps/desktop/src/components/UnifiedAgenticChat/Sidebar.tsx` | Add mode indicator pill in footer |
| `services/api-gateway/src/index.ts` | Mount `cloudChatRouter`, add Tauri CORS origins |

---

## Task 1: Create `appModeStore.ts`

**Files:**
- Create: `apps/desktop/src/stores/appModeStore.ts`

- [ ] **Step 1: Create the store**

```typescript
// apps/desktop/src/stores/appModeStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

type AppMode = 'local' | 'cloud';
type PlanTier = 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';

interface AppModeState {
  mode: AppMode;
  planTier: PlanTier;
  hasOnboarded: boolean;
  isOnline: boolean;

  setMode: (mode: AppMode) => void;
  setPlanTier: (tier: PlanTier) => void;
  completeOnboarding: () => void;
  setOnline: (online: boolean) => void;
}

export const useAppModeStore = create<AppModeState>()(
  devtools(
    persist(
      (set) => ({
        mode: 'local',
        planTier: 'free',
        hasOnboarded: false,
        isOnline: navigator.onLine,

        setMode: (mode) => set({ mode }),
        setPlanTier: (tier) => set({ planTier: tier }),
        completeOnboarding: () => set({ hasOnboarded: true }),
        setOnline: (online) => set({ isOnline: online }),
      }),
      {
        name: 'app-mode-store',
        partialize: (state) => ({
          mode: state.mode,
          planTier: state.planTier,
          hasOnboarded: state.hasOnboarded,
        }),
      },
    ),
    { name: 'AppModeStore' },
  ),
);

// Selectors
export const selectMode = (s: AppModeState) => s.mode;
export const selectIsCloud = (s: AppModeState) => s.mode === 'cloud';
export const selectIsLocal = (s: AppModeState) => s.mode === 'local';
export const selectPlanTier = (s: AppModeState) => s.planTier;
export const selectHasOnboarded = (s: AppModeState) => s.hasOnboarded;
```

- [ ] **Step 2: Verify import works**

Run: `cd apps/desktop && npx tsc --noEmit 2>&1 | grep appModeStore || echo "Clean"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/stores/appModeStore.ts
git commit -m "feat(desktop): add appModeStore for local/cloud mode toggle"
```

---

## Task 2: Wire deep link auth callback

**Files:**
- Modify: `apps/desktop/src/hooks/useDeepLink.ts`

- [ ] **Step 1: Read the full file**

Read `apps/desktop/src/hooks/useDeepLink.ts` to find the `handleDeepLink` function and understand current URL routing.

- [ ] **Step 2: Add auth/callback handling**

Inside `handleDeepLink(url)`, add a case for the auth callback path:

```typescript
// In handleDeepLink function, after parsing the URL:
if (parsed.pathname === '/auth/callback' || parsed.pathname === '//auth/callback') {
  const code = parsed.searchParams.get('code');
  if (code) {
    import('../services/supabaseAuth').then(({ supabaseAuth }) => {
      supabaseAuth.exchangeCodeForSession(code).catch((err: unknown) => {
        console.error('[DeepLink] Auth code exchange failed:', err);
      });
    });
  }
  return;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/desktop && npx tsc --noEmit 2>&1 | tail -5`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/hooks/useDeepLink.ts
git commit -m "feat(auth): handle OAuth PKCE callback via deep link"
```

---

## Task 3: Add mode choice to OnboardingWizard

**Files:**
- Modify: `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx`

- [ ] **Step 1: Read the full file** to understand step structure

- [ ] **Step 2: Add 'mode' step as Step 0**

Add to `StepId` type: `'mode'`
Add to `STEPS` array as first element: `{ id: 'mode', label: 'Mode', icon: Shield }`
Import `Shield`, `Cloud` from lucide-react.
Import `useAppModeStore` from stores.

- [ ] **Step 3: Create the mode step content**

Add a new step body for `id === 'mode'`:
- Two cards side by side: "Local Mode" (Shield icon, free/private) and "Cloud Mode" (Cloud icon, synced/frontier)
- Clicking a card sets `useAppModeStore.getState().setMode('local'|'cloud')` and auto-advances

- [ ] **Step 4: Verify typecheck + lint**

Run: `cd apps/desktop && npx tsc --noEmit && cd ../.. && pnpm lint 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/Onboarding/OnboardingWizard.tsx
git commit -m "feat(onboarding): add local/cloud mode choice as wizard step 1"
```

---

## Task 4: Create `cloudApi.ts`

**Files:**
- Create: `apps/desktop/src/api/cloudApi.ts`

- [ ] **Step 1: Read existing API client pattern**

Read `apps/desktop/src/api/index.ts` and `apps/desktop/src/services/supabaseAuth.ts` to find `API_BASE_URL` and auth token retrieval.

- [ ] **Step 2: Create the cloud API client**

```typescript
// apps/desktop/src/api/cloudApi.ts
import { supabaseAuth } from '../services/supabaseAuth';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await supabaseAuth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

export interface CloudConversation {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

export interface CloudMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// List conversations
export async function listCloudConversations(): Promise<CloudConversation[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/v1/conversations`, { headers });
  if (!res.ok) throw new Error(`Failed to list conversations: ${res.status}`);
  return res.json();
}

// Create conversation
export async function createCloudConversation(title: string, model: string): Promise<CloudConversation> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/v1/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, model }),
  });
  if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);
  return res.json();
}

// Get conversation with messages
export async function getCloudConversation(id: string): Promise<{ conversation: CloudConversation; messages: CloudMessage[] }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/v1/conversations/${id}`, { headers });
  if (!res.ok) throw new Error(`Failed to get conversation: ${res.status}`);
  return res.json();
}

// Send message (returns SSE stream)
export async function sendCloudMessage(
  conversationId: string,
  content: string,
  model: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/v1/chat/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ conversationId, content, model }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    onError(new Error(`Chat send failed (${res.status}): ${body}`));
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { onError(new Error('No response body')); return; }

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') { onDone(); return; }
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) onChunk(parsed.text);
        } catch { /* skip non-JSON lines */ }
      }
    }
  }
  onDone();
}

// Delete conversation
export async function deleteCloudConversation(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/v1/conversations/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`);
}

// Get usage stats
export async function getCloudUsage(): Promise<{ messagesUsed: number; messagesLimit: number; resetAt: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/v1/usage`, { headers });
  if (!res.ok) throw new Error(`Failed to get usage: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/desktop && npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/api/cloudApi.ts
git commit -m "feat(cloud): add cloud API client for conversations and chat"
```

---

## Task 5: Create API gateway `cloudChat.ts` + `planGate.ts`

**Files:**
- Create: `services/api-gateway/src/routes/cloudChat.ts`
- Create: `services/api-gateway/src/middleware/planGate.ts`

- [ ] **Step 1: Read existing route patterns**

Read `services/api-gateway/src/routes/auth.ts` for middleware patterns, Supabase client usage, and error handling.

- [ ] **Step 2: Create plan gate middleware**

```typescript
// services/api-gateway/src/middleware/planGate.ts
import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env['SUPABASE_URL'] ?? '',
  process.env['SUPABASE_SERVICE_KEY'] ?? '',
);

export async function requireCloudPlan(req: Request, res: Response, next: NextFunction) {
  const userId = (req as Record<string, unknown>)['userId'] as string | undefined;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { data } = await supabase
    .from('subscriptions')
    .select('plan_tier')
    .eq('user_id', userId)
    .single();

  const tier = data?.plan_tier ?? 'free';
  if (tier === 'free' || tier === 'hobby') {
    return res.status(403).json({
      error: 'Cloud models require a Pro or Max subscription',
      upgrade_url: '/dashboard/billing',
    });
  }

  (req as Record<string, unknown>)['planTier'] = tier;
  next();
}
```

- [ ] **Step 3: Create cloud chat routes**

```typescript
// services/api-gateway/src/routes/cloudChat.ts
import { Router } from 'express';
import { requireCloudPlan } from '../middleware/planGate';
// ... conversation CRUD + LLM proxy with SSE streaming
```

Full implementation: conversation list/create/get/delete + `POST /send` that proxies to the LLM provider and streams back SSE.

- [ ] **Step 4: Verify gateway compiles**

Run: `cd services/api-gateway && npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add services/api-gateway/src/routes/cloudChat.ts services/api-gateway/src/middleware/planGate.ts
git commit -m "feat(gateway): add cloud chat routes with plan-tier enforcement"
```

---

## Task 6: Mount routes + CORS in gateway

**Files:**
- Modify: `services/api-gateway/src/index.ts`

- [ ] **Step 1: Add imports and mount**

```typescript
import { cloudChatRouter } from './routes/cloudChat';

// After existing route mounts:
app.use('/api/v1/chat', cloudChatRouter);
app.use('/api/v1/conversations', cloudChatRouter);
```

- [ ] **Step 2: Add Tauri origins to CORS**

In the `corsOrigins` array, add `'tauri://localhost'` and `'https://tauri.localhost'`.

- [ ] **Step 3: Commit**

```bash
git add services/api-gateway/src/index.ts
git commit -m "feat(gateway): mount cloud chat routes, add Tauri CORS origins"
```

---

## Task 7: Add mode-switch guard in chat store

**Files:**
- Modify: `apps/desktop/src/stores/chat/index.ts`

- [ ] **Step 1: Read the chat store** to find `sendMessage` and streaming state

- [ ] **Step 2: Import appModeStore and add mode check**

At the top of `sendMessage()`:
```typescript
import { useAppModeStore } from '../appModeStore';

// Inside sendMessage:
const mode = useAppModeStore.getState().mode;
if (mode === 'cloud') {
  // Import and use sendCloudMessage from cloudApi.ts
  const { sendCloudMessage } = await import('../../api/cloudApi');
  // ... wire SSE callbacks to existing streaming state
  return;
}
// Existing local path continues below...
```

- [ ] **Step 3: Add mode-switch blocking**

In `useAppModeStore.setMode()`, check streaming state:
```typescript
setMode: (mode) => {
  const isStreaming = useChatStore.getState().isStreaming;
  if (isStreaming) {
    toast.error('Finish the current response before switching modes');
    return;
  }
  set({ mode });
},
```

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/desktop && npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/stores/chat/index.ts apps/desktop/src/stores/appModeStore.ts
git commit -m "feat(chat): route messages through local or cloud based on app mode"
```

---

## Task 8: Add Settings mode toggle

**Files:**
- Modify: `apps/desktop/src/components/Settings/SettingsPanel.tsx`

- [ ] **Step 1: Read SettingsPanel to find insertion point**

- [ ] **Step 2: Add Mode section at the top of the General tab**

```typescript
// Mode toggle section:
<div className="space-y-3">
  <Label>App Mode</Label>
  <div className="flex gap-3">
    <button onClick={() => setMode('local')} className={cn(...)}>
      <Shield /> Local (Free)
    </button>
    <button onClick={() => setMode('cloud')} className={cn(...)}>
      <Cloud /> Cloud (Pro)
    </button>
  </div>
  {mode === 'cloud' && !isAuthenticated && (
    <Button onClick={signIn}>Sign in to enable Cloud Mode</Button>
  )}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/Settings/SettingsPanel.tsx
git commit -m "feat(settings): add local/cloud mode toggle"
```

---

## Task 9: Add Sidebar mode indicator

**Files:**
- Modify: `apps/desktop/src/components/UnifiedAgenticChat/Sidebar.tsx`

- [ ] **Step 1: Add mode pill in sidebar footer**

Near the user profile area at the bottom of the sidebar, add:
```typescript
const mode = useAppModeStore(selectMode);

<div className={cn(
  'px-2 py-0.5 rounded-full text-[10px] font-medium',
  mode === 'local' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
)}>
  {mode === 'local' ? 'Local' : 'Cloud'}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/components/UnifiedAgenticChat/Sidebar.tsx
git commit -m "feat(sidebar): show local/cloud mode indicator"
```

---

## Task 10: Integration test — full flow verification

- [ ] **Step 1: Verify typecheck**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 2: Verify lint**

Run: `pnpm lint`
Expected: 0 errors, 0 warnings

- [ ] **Step 3: Manual test — Local Mode**

1. Launch `cd apps/desktop && pnpm dev`
2. First launch → OnboardingWizard shows mode choice
3. Select "Local" → enters app
4. Sidebar footer shows green "Local" pill
5. Chat works with existing local/BYOK models
6. Settings shows "Local" mode selected

- [ ] **Step 4: Manual test — Cloud Mode toggle**

1. Go to Settings → toggle to "Cloud"
2. If not signed in → shows "Sign in" button
3. Sign in via Supabase OAuth (opens browser)
4. Deep link callback returns to app with session
5. Sidebar footer shows blue "Cloud" pill
6. Chat sends through API gateway (verify in gateway logs)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(dual-mode): complete local/cloud mode architecture"
```

---

## Parallelization Guide

Tasks that can run in parallel (no file conflicts):

| Wave | Tasks | Why parallel |
|------|-------|-------------|
| Wave 1 | Task 1 + Task 2 + Task 5 | Different apps/files entirely |
| Wave 2 | Task 3 + Task 4 + Task 6 | After Wave 1, no overlaps |
| Wave 3 | Task 7 + Task 8 + Task 9 | After Wave 2, different files |
| Wave 4 | Task 10 | Integration verification |
