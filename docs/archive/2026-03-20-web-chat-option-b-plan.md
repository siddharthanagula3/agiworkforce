# Plan: Deploy Desktop Chat as Web App (Option B)

> Decision: 2026-03-20
> Status: Next session

## The Insight

The desktop app (`apps/desktop/`) already runs in browser mode via Vite at `127.0.0.1:5173`. It shows "Web Development Mode - Running without Tauri. Some features are mocked." This means the entire UnifiedAgenticChat interface — with all 30+ features we built — already works in a browser.

**Instead of building a separate web chat, deploy this same Vite build as the production web chat.**

## Architecture

```
Current:
  Desktop (Tauri + Vite)  →  invoke() → Rust backend
  Web (Next.js)           →  fetch()  → Supabase

Option B:
  Desktop (Tauri + Vite)  →  invoke() → Rust backend (native)
  Web (Same Vite build)   →  fetch()  → API Gateway → Supabase (cloud)
  Next.js                 →  Marketing site + Auth + Billing only
```

## What Needs to Change

### 1. `apps/desktop/src/lib/tauri-mock.ts` — The Key File

Currently mocks Tauri APIs with empty returns when `!isTauri`. Needs to:

- Route `invoke()` calls to the API gateway via `fetch()`
- Map each Tauri command name to an API endpoint
- Handle streaming (SSE) for chat responses
- Handle auth via Supabase session token instead of Tauri keychain

### 2. Build & Deploy

- Build: `cd apps/desktop && pnpm build` (Vite production build)
- Deploy: Upload `dist/` to Vercel/Cloudflare Pages as static site
- Domain: `chat.agiworkforce.com` (or similar)
- The Next.js app stays at `agiworkforce.com` for marketing/billing

### 3. Auth Flow (Web)

- Use Supabase browser client (already imported)
- Login: Redirect to Supabase auth, callback to `chat.agiworkforce.com/auth/callback`
- Session: Stored in browser cookies (Supabase SSR pattern)
- No Tauri keychain needed

### 4. Feature Gating (Web)

Features that need Tauri and should be hidden on web:

- Terminal execution (needs OS shell)
- Browser automation / Computer Use (needs native APIs)
- File system access (needs Tauri fs)
- Voice mode (needs native audio capture)
- Desktop notifications (use browser notifications instead)
- System tray

Features that work on web as-is:

- Chat + streaming
- Model selector
- Branded greeting + Quick-start pills
- Cmd+K search
- Skills marketplace
- Images gallery
- Scheduled tasks
- Artifacts gallery
- Deep research
- Settings (most)
- Memory
- Sidebar + navigation
- Source pills, follow-up suggestions, thinking display
- Share dialog
- Usage dashboard
- Personalization

### 5. Remove "Web Development Mode" Banner

For production web build, remove the yellow banner or replace with a subtle "Web" indicator.

### 6. Tauri-Mock Enhancement Priority

Map these invoke() commands to API gateway calls:

```
llm_send_message        → POST /api/v1/chat/send (SSE)
list_conversations      → GET /api/v1/conversations
create_conversation     → POST /api/v1/conversations
get_conversation        → GET /api/v1/conversations/:id
delete_conversation     → DELETE /api/v1/conversations/:id
get_model_catalog       → GET /api/v1/models
cost_analytics          → GET /api/v1/usage
memory_*                → GET/POST /api/v1/memory/*
```

## Implementation Tasks (Next Session)

1. **Enhance tauri-mock.ts** — Route invoke() to API gateway for cloud mode
2. **Add web build config** — Vite config for production web deployment
3. **Configure Vercel/Cloudflare** — Static site deployment
4. **Hide Tauri-only features** — Conditional rendering based on `isTauri`
5. **Web auth flow** — Supabase browser client integration
6. **Remove dev banner** — Clean production web experience
7. **Test full flow** — Chat, search, settings, navigation all work on web
8. **DNS setup** — `chat.agiworkforce.com`

## Why This Is Better Than Option A

1. **Zero component duplication** — same code, same UI
2. **Features ship to both surfaces simultaneously** — any desktop feature automatically works on web
3. **Less maintenance** — one codebase, not two
4. **Already proven** — the browser mode works today
5. **Faster** — no porting work, just wiring the mock layer
