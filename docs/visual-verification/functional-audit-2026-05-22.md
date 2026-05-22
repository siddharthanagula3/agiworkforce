# R22 Lane 9 — Functional Audit (2026-05-22)

Status: Current
Owner: R22 lane 9
Last updated: 2026-05-22
Mode: Read-only audit (no app code edited).

The R21 "80% acceptance" report was an **element-checklist** parity report — "AGI
has a settings page", "AGI has an /agents palette", "AGI has a memory editor".
The user's pushback is correct: parity by element-presence is not parity by
**function**. This document is the honest functional audit. The audit is based
on reading the repo tree, the migrations, the API routes, the provider adapter
packages, the Tauri-side commands, the mobile feature flags, and the existing
test suite. Live calls were not made.

Legend (per cell in §1):

- ✅ Working E2E — verified via real code path that connects to a real
  service or to a verified local subsystem.
- 🟨 Partial — works in one mode (local) but a claimed feature (cross-surface
  sync, cloud) is disabled, mismatched, or unreachable.
- 🟡 UI shell — UI exists; backend persistence / OAuth / migration is missing.
- ❌ Broken — references nonexistent code, table, or undefined import.
- ⚪ Untested — code looks plausible, no evidence either way without runtime.

---

## 1. Per-feature working-ness matrix

| Feature                                                                       | Web                                                                                                                                                                                                                                | Desktop                                                                                         | Mobile                                                                                                                                                                        | CLI        | VS Code    | Chrome                                                        |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | ------------------------------------------------------------- |
| Chat send → Anthropic                                                         | ✅ `apps/web/lib/llm-providers/anthropic.ts` via env key                                                                                                                                                                           | ✅ Tauri `chat_send_message`                                                                    | 🟨 Cloud disabled by `FEATURES.cloudChat=false`                                                                                                                               | ⚪ likely  | ⚪ likely  | ⚪ likely                                                     |
| Chat send → OpenAI                                                            | ✅ same                                                                                                                                                                                                                            | ✅ same                                                                                         | 🟨 same                                                                                                                                                                       | ⚪         | ⚪         | ⚪                                                            |
| Chat send → Google / xAI / DeepSeek / Perplexity                              | ✅ same (each in `apps/web/lib/llm-providers/*.ts`)                                                                                                                                                                                | ⚪ adapter path via api-gateway only                                                            | 🟨 same                                                                                                                                                                       | ⚪         | ⚪         | ⚪                                                            |
| Chat send → Mistral / Groq / Together / Cohere / Bedrock / Azure / OpenRouter | ❌ no adapter in `apps/web/lib/llm-providers/` and no adapter in `packages/providers/` despite `models.json` listing them                                                                                                          | ❌ same                                                                                         | ❌ same                                                                                                                                                                       | ⚪         | ⚪         | ⚪                                                            |
| Local LLM (Ollama detect + route)                                             | 🟨 adapter package exists `packages/providers/ollama` but web has no UI to route to it                                                                                                                                             | ✅ Tauri-side ollama commands (`apps/desktop/src-tauri/src/sys/commands/ollama.rs`)             | ✅ `packages/local-llm/src/tier3.ts` via llama.rn (verified `llama.rn ^0.10.0` in mobile package.json)                                                                        | ⚪         | ⚪         | ⚪                                                            |
| Memory save → recall                                                          | ✅ writes `user_memories` table; migration exists                                                                                                                                                                                  | ✅ Rust `core/agi/memory_manager.rs` SQLite-backed                                              | ✅ Mobile MMKV + features/memory                                                                                                                                              | ⚪         | ⚪         | 🟡 read-only popup (`apps/extension/src/popup` memory-bridge) |
| Settings persistence — within session                                         | ✅ user_metadata + localStorage                                                                                                                                                                                                    | ✅ Rust settings.json + zustand persist                                                         | ✅ MMKV                                                                                                                                                                       | ⚪         | ⚪         | ⚪                                                            |
| Settings persistence — Web ↔ Desktop ↔ Mobile sync                            | 🟡 only theme/model-pref sync paths exist; full settings not synced                                                                                                                                                                | 🟡 same                                                                                         | 🟡 same                                                                                                                                                                       | n/a        | n/a        | n/a                                                           |
| Artifacts: create + view                                                      | ✅ in chat composer                                                                                                                                                                                                                | ✅ via canvas command                                                                           | ✅ ArtifactList component                                                                                                                                                     | ⚪         | ⚪         | ⚪                                                            |
| Artifacts: **publish** (R20 feature)                                          | 🟡 `apps/web/lib/artifact-publisher.ts` throws `ArtifactPersistenceUnavailableError` because `published_artifacts` migration is private-beta only — confirmed absent from `supabase/migrations` and `apps/web/supabase/migrations` | 🟡 same                                                                                         | 🟡 same                                                                                                                                                                       | n/a        | n/a        | n/a                                                           |
| Artifacts: copy + file:// download                                            | ✅                                                                                                                                                                                                                                 | ✅                                                                                              | ✅                                                                                                                                                                            | ⚪         | ⚪         | ⚪                                                            |
| Projects: CRUD                                                                | ✅ `apps/web/app/api/projects/route.ts` writes `user_projects` (RLS)                                                                                                                                                               | ✅ `apps/desktop/src-tauri/src/sys/commands/projects.rs`                                        | ✅ `apps/mobile/src/features/projects/`                                                                                                                                       | n/a        | n/a        | n/a                                                           |
| Projects: sync across surfaces                                                | 🟡 web writes `user_projects`; desktop persists locally; **no migration of desktop project writes to `user_projects`** found in `apps/desktop/src-tauri/src/data/supabase_sync.rs`. Project sync claim cannot be substantiated.    | 🟡 same                                                                                         | 🟡 same                                                                                                                                                                       | n/a        | n/a        | n/a                                                           |
| BYOK: enter key + validate                                                    | 🟡 `/byok` page is marketing copy only (no form, no submit handler); `LLMProviderFactory.getProviderApiKey` only reads `process.env`; no `byok_keys` / `provider_credentials` table                                                | 🟡 master_password.rs scaffolding exists; no UI flow that stores a key                          | 🟡 `FEATURES.byokKeys=false`                                                                                                                                                  | ⚪         | ⚪         | ⚪                                                            |
| Connectors: list + install                                                    | 🟡 `POST /api/connectors` persists `{connector_id, auth_type}` shell row only — no OAuth callback handler exists for any connector except GitHub                                                                                   | 🟡 `apps/desktop/src-tauri/src/core/mcp/connectors.rs` exists; OAuth flow stubbed               | n/a                                                                                                                                                                           | n/a        | n/a        | n/a                                                           |
| Connectors: GitHub OAuth                                                      | ✅ `app/api/github/{install,installations,webhook}/route.ts` real                                                                                                                                                                  | ✅                                                                                              | n/a                                                                                                                                                                           | n/a        | n/a        | n/a                                                           |
| Connectors: other 31 (Slack, Notion, Gmail, …)                                | 🟡 metadata-only; no callback handler                                                                                                                                                                                              | 🟡 same                                                                                         | n/a                                                                                                                                                                           | n/a        | n/a        | n/a                                                           |
| Attachments: upload + signed URL                                              | ✅ `app/api/llm/v2/chat` validates `image_url` via egress-policy; rate limit + Zod schema                                                                                                                                          | ✅                                                                                              | ✅                                                                                                                                                                            | ⚪         | ⚪         | ⚪                                                            |
| Voice input → Whisper                                                         | ✅ `app/api/llm/v1/audio/transcriptions/route.ts` real Whisper proxy (magic-byte check + OPENAI_API_KEY env)                                                                                                                       | ✅ Tauri voice.rs                                                                               | ✅ `apps/mobile/src/features/voice/`                                                                                                                                          | ⚪         | ⚪         | ⚪                                                            |
| Vision input                                                                  | ✅ via image_url in chat (image bytes validated)                                                                                                                                                                                   | ⚪                                                                                              | ⚪                                                                                                                                                                            | ⚪         | ⚪         | ⚪                                                            |
| Image generation                                                              | 🟨 `app/api/media/image/generate/route.ts` exists; no first-party UI sends to it                                                                                                                                                   | ⚪                                                                                              | 🟨 `FEATURES.imageGen=false`                                                                                                                                                  | n/a        | n/a        | n/a                                                           |
| StoreKit IAP                                                                  | n/a                                                                                                                                                                                                                                | n/a                                                                                             | 🟡 no in-app-purchase package in `apps/mobile/package.json`; PRD says StoreKit at 15% but UI/native integration absent in v1                                                  | n/a        | n/a        | n/a                                                           |
| Push notifications                                                            | ⚪                                                                                                                                                                                                                                 | ✅ notifications.rs + tray.rs                                                                   | 🟡 Expo dependency present, no permissions request path verified                                                                                                              | n/a        | n/a        | n/a                                                           |
| Cross-surface chat sync (Web ↔ Desktop ↔ Mobile)                              | **❌ broken at data layer.** Web writes `web_conversations`/`web_messages`; Desktop syncs to `conversations`/`messages` via `apps/desktop/src-tauri/src/data/supabase_sync.rs`. Different tables. They cannot see each other.      | **❌ same root cause**                                                                          | 🟨 dead code: `getMobileSyncService().startBackgroundSync` is gated behind `session !== null`, but `FEATURES.auth=false` means session is always null, so sync never executes | n/a        | n/a        | n/a                                                           |
| Knowledge files (project-scoped)                                              | ✅ `app/api/projects/[id]/knowledge-files/[fileId]/route.ts`; `project_knowledge_files` migration present                                                                                                                          | ⚪                                                                                              | ⚪                                                                                                                                                                            | n/a        | n/a        | n/a                                                           |
| Computer use                                                                  | n/a                                                                                                                                                                                                                                | ✅ Tauri `computer_use.rs` (19 commands) — Anthropic-only                                       | n/a (`FEATURES.computerUse=false`)                                                                                                                                            | n/a        | n/a        | n/a                                                           |
| Code execution sandbox                                                        | n/a                                                                                                                                                                                                                                | ✅ `code_execution.rs` → `core/agi/sandbox` with output cap + env filter                        | n/a                                                                                                                                                                           | ✅ sandbox | n/a        | n/a                                                           |
| Web search tool                                                               | ⚪ no first-party search route                                                                                                                                                                                                     | ⚪                                                                                              | 🟨 `FEATURES.webSearch=false`                                                                                                                                                 | ⚪         | ⚪         | ⚪                                                            |
| File system tool                                                              | n/a                                                                                                                                                                                                                                | ✅ `file_ops.rs` (22 commands)                                                                  | n/a                                                                                                                                                                           | ✅ via mcp | ✅ webview | n/a                                                           |
| MCP: connect + discover tools                                                 | 🟨 `app/api/mcp/route.ts` exists as forwarder shim only — comment says actual MCP plumbing belongs in `services/api-gateway/src/mcp/`                                                                                              | ✅ `apps/desktop/src-tauri/src/core/mcp/` 11,398 LoC, real protocol + transport + tool executor | n/a                                                                                                                                                                           | ✅         | ✅         | n/a                                                           |
| MCP: execute tool                                                             | n/a                                                                                                                                                                                                                                | ✅ verified path: registry → tool_executor.execute_tool_inner → client.call_tool                | n/a                                                                                                                                                                           | ✅         | ✅         | n/a                                                           |

---

## 2. MCP audit

### Desktop (Tauri side — canonical home of MCP in this repo)

- Code: `apps/desktop/src-tauri/src/core/mcp/` — 17 files, **11,398 LoC** including `client.rs`, `protocol.rs`, `transport.rs`, `tool_executor.rs`, `registry.rs`, `session.rs`, `oauth.rs`, `connectors.rs`, `manifest.rs`, plus a 1,105-line `tests.rs`.
- Path: real Rust MCP client implementation, double-underscore tool envelope (`mcp__<server>__<tool>`), 30s connection timeout, schema validation with depth + ref caps, name validation against canonical charset.
- Registry: `apps/desktop/src-tauri/mcp-registry.json` lists 9 connectors (filesystem, github, playwright, google-drive, postgres, slack, notion, google-maps, jira).
- Allowlist: `apps/desktop/src-tauri/mcp-allowlist.json` permits 8 npm packages: filesystem, github, gitlab, postgres, sqlite, fetch, brave-search, puppeteer.

**Finding:** Of the 9 registered connectors, only **filesystem, github, postgres** are in the allowlist. The other 6 (playwright, google-drive, slack, notion, google-maps, jira) would be rejected by `manifest.rs::is_package_allowed`. This is a registry vs. allowlist mismatch — discoverable to users via the UI but uninstallable.

### Shared TS side (`packages/mcp/`)

- 516 LoC. Real `@modelcontextprotocol/sdk` Client + transport resolver + schema-billion-laughs defense.
- Used by api-gateway, not by the web app's chat path.

### Web side (`apps/web/app/api/mcp/route.ts`)

- Shim/forwarder only. Comment in source: "belongs in `services/api-gateway/src/mcp/` which runs the long-lived" connection.

### Project-level Claude Code MCP (`.mcp.json`)

- Not part of the AGI app runtime — these are Claude Code's MCP servers for the developer workflow (filesystem, supabase, vercel, apify, etc.).

Per-server status (best evidence available without running):

| Server       | Registered | Allowlisted | Connects                         | Discovers tools | Executes tool |
| ------------ | ---------- | ----------- | -------------------------------- | --------------- | ------------- |
| filesystem   | ✅         | ✅          | ⚪ (path real, real npm package) | ⚪              | ⚪            |
| github       | ✅         | ✅          | ⚪                               | ⚪              | ⚪            |
| playwright   | ✅         | ❌          | ❌ (allowlist rejects)           | ❌              | ❌            |
| gdrive       | ✅         | ❌          | ❌                               | ❌              | ❌            |
| postgres     | ✅         | ✅          | ⚪                               | ⚪              | ⚪            |
| slack        | ✅         | ❌          | ❌                               | ❌              | ❌            |
| notion       | ✅         | ❌          | ❌                               | ❌              | ❌            |
| google-maps  | ✅         | ❌          | ❌                               | ❌              | ❌            |
| jira         | ✅         | ❌          | ❌                               | ❌              | ❌            |
| gitlab       | ❌         | ✅          | ⚪ (if user invokes by ID)       | ⚪              | ⚪            |
| sqlite       | ❌         | ✅          | ⚪                               | ⚪              | ⚪            |
| fetch        | ❌         | ✅          | ⚪                               | ⚪              | ⚪            |
| brave-search | ❌         | ✅          | ⚪                               | ⚪              | ⚪            |
| puppeteer    | ❌         | ✅          | ⚪                               | ⚪              | ⚪            |

---

## 3. Tool execution audit

| Tool                 | Status        | Citation                                                                                                                     |
| -------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| File read/write/list | ✅ wired      | `apps/desktop/src-tauri/src/sys/commands/file_ops.rs` (22 `#[tauri::command]`)                                               |
| File search          | ✅ wired      | `apps/desktop/src-tauri/src/sys/filesystem/search.rs`                                                                        |
| Web search           | ⚪ unverified | No first-party web-search route in `apps/web/app/api`; relies on MCP brave-search (allowlisted but not installed by default) |
| Code execution       | ✅ wired      | `apps/desktop/src-tauri/src/sys/commands/code_execution.rs` → `core/agi/sandbox`                                             |
| Computer use         | ✅ wired      | `apps/desktop/src-tauri/src/sys/commands/computer_use.rs` (19 commands)                                                      |
| Image generation     | 🟨 partial    | `apps/web/app/api/media/image/generate/route.ts` exists but no Web UI surfaces it                                            |
| Image understanding  | ✅ wired      | `image_url` validated via `lib/egress-policy` in `apps/web/app/api/llm/v2/chat/route.ts`                                     |
| Voice / transcribe   | ✅ wired      | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` (real Whisper)                                                       |
| Browser automation   | ✅ wired      | `apps/desktop/src-tauri/src/sys/commands/browser.rs` (57 commands)                                                           |

---

## 4. Environment / config audit

Five `.env.example` files exist:

- `apps/web/.env.example` — 29 lines, covers Supabase, Stripe (8 price IDs), CRON, OPENAI/ANTHROPIC, Sentry. **Missing:** `GOOGLE_API_KEY`, `XAI_API_KEY`, `QWEN_API_KEY`, `MOONSHOT_API_KEY`, `DEEPSEEK_API_KEY`, `PERPLEXITY_API_KEY`, `ZHIPU_API_KEY` (all read by `apps/web/lib/llm-providers/factory.ts`).
- `apps/desktop/.env.example` — 67 lines, well documented: Supabase, API base URL, signaling, Sentry, dev account override.
- `apps/mobile/.env.example` — 6 lines: `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`.
- `services/api-gateway/.env.example` — 21 lines: Supabase, JWT, Upstash, signaling URL.
- `services/signaling-server/.env.example` — 11 lines.

**Feature → env-var unlock map (incomplete by design — these features in §1 are "Working E2E" but secretly need env vars that are undocumented):**

| Feature                    | Required env var         | Documented? |
| -------------------------- | ------------------------ | ----------- |
| OpenAI chat (web)          | `OPENAI_API_KEY`         | ✅          |
| Anthropic chat (web)       | `ANTHROPIC_API_KEY`      | ✅          |
| Google chat (web)          | `GOOGLE_API_KEY`         | ❌          |
| xAI chat (web)             | `XAI_API_KEY`            | ❌          |
| Qwen chat (web)            | `QWEN_API_KEY`           | ❌          |
| Moonshot chat (web)        | `MOONSHOT_API_KEY`       | ❌          |
| DeepSeek chat (web)        | `DEEPSEEK_API_KEY`       | ❌          |
| Perplexity chat (web)      | `PERPLEXITY_API_KEY`     | ❌          |
| ZhipuAI chat (web)         | `ZHIPU_API_KEY`          | ❌          |
| Stripe live billing        | `STRIPE_SECRET_KEY` etc. | ✅          |
| Voice / Whisper            | `OPENAI_API_KEY`         | ✅          |
| Cron jobs                  | `CRON_SECRET`            | ✅          |
| Provider-base-URL override | `*_BASE_URL`             | ❌          |

---

## 5. Provider integration audit

`packages/types/src/models.json` lists 25+ providers. `packages/providers/` ships **8**: anthropic, openai, google, deepseek, perplexity, xai, ollama, lmstudio. `apps/web/lib/llm-providers/` ships **9**: those 8 minus ollama, plus qwen, moonshot, zhipu.

| Provider                    | Adapter in `packages/providers/` | Adapter in `apps/web/lib/llm-providers/` | Streaming | Tool calls   | Vision | Live test exists |
| --------------------------- | -------------------------------- | ---------------------------------------- | --------- | ------------ | ------ | ---------------- |
| Anthropic                   | ✅ index.ts 158L                 | ✅ anthropic.ts                          | ✅        | ✅           | ✅     | ✅ (gated env)   |
| OpenAI                      | ✅ index.ts 304L (Responses API) | ✅ openai.ts                             | ✅        | ✅           | ✅     | ✅               |
| Google                      | ✅                               | ✅                                       | ✅        | ⚪           | ✅     | ❌               |
| DeepSeek                    | ✅ (uses OpenAI SDK)             | ✅                                       | ✅        | ⚪           | n/a    | ❌               |
| Perplexity                  | ✅                               | ✅                                       | ✅        | n/a (search) | n/a    | ❌               |
| xAI / Grok                  | ✅                               | ✅                                       | ✅        | ⚪           | ⚪     | ❌               |
| Ollama                      | ✅                               | ❌ web has no Ollama lib                 | ✅        | ⚪           | ⚪     | ✅               |
| LMStudio                    | ✅                               | ❌                                       | ✅        | ⚪           | ⚪     | ❌               |
| Qwen                        | ❌                               | ✅ qwen.ts                               | ⚪        | ⚪           | ⚪     | ❌               |
| Moonshot                    | ❌                               | ✅ moonshot.ts                           | ⚪        | ⚪           | ⚪     | ❌               |
| ZhipuAI                     | ❌                               | ✅ zhipu.ts                              | ⚪        | ⚪           | ⚪     | ❌               |
| Mistral                     | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| Groq                        | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| Together AI                 | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| Fireworks                   | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| Cerebras                    | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| DeepInfra                   | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| Cohere                      | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| AI21 Labs                   | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| Sambanova                   | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| Azure OpenAI                | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| AWS Bedrock                 | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| NVIDIA NIM                  | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| OpenRouter                  | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| Runway                      | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |
| Managed Cloud (AGI gateway) | ❌                               | ❌                                       | ❌        | ❌           | ❌     | ❌               |

**Two-adapter-codebase finding:** `apps/web/lib/llm-providers/factory.ts` is the path **production chat actually uses** (`/api/llm/v1/chat/completions` and `/api/llm/v2/chat`). The newer `@agiworkforce/providers-*` packages are reached only via `services/api-gateway` and the not-yet-default `/api/v1/providers/[id]/stream` route — only `apps/web/app/chat-multi/page.tsx` calls it. Polish to the new adapter packages does **not** reach the default chat UI.

---

## 6. Cross-surface chat sync audit (most important finding)

The /goal sync rule says: "Web/Desktop/Mobile sync chats; CLI/VSCode/Chrome must NEVER write `chat_messages`/`conversations`." The contract is **enforced at the type layer** via `assertSurfaceCanSyncChats` in `packages/types/src/suite-contracts.ts` line 185, and tested by `apps/extension/__tests__/surface.test.ts`. Chrome / VS Code / CLI cannot subscribe to the sync channel.

But the type-layer contract does not protect against table-name divergence at the storage layer. The actual writes are:

| Surface | Writes to                                                                                       | Reads from                          | Realtime channel                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web     | `web_conversations`, `web_messages` (`apps/web/lib/conversationSync.ts`)                        | `web_conversations`, `web_messages` | `conversation-sync:{userId}` filtered to those tables                                                                                                        |
| Desktop | `conversations`, `messages` (`apps/desktop/src-tauri/src/data/supabase_sync.rs` lines 116, 161) | `conversations`, `messages`         | does not subscribe to the web realtime channel                                                                                                               |
| Mobile  | `web_conversations`, `web_messages` (via `apps/mobile/services/conversationSync.ts`)            | same                                | **never starts** — gated behind `session != null`, and `FEATURES.auth = false` keeps session null indefinitely (`apps/mobile/app/_layout.tsx` lines 219-250) |

Three independent bugs:

1. **Desktop writes to a different table.** `web_conversations` (web) vs `conversations` (desktop). Both migrations exist:
   - `supabase/migrations/20260308120001_create_conversations.sql` → `public.conversations`
   - `apps/web/supabase/migrations/20260117000000_add_web_chat.sql` → `public.web_conversations`
   - There is no view, trigger, or copy job that bridges them.
2. **Mobile sync is unreachable dead code in v1.** The `useEffect` that calls `getMobileSyncService().startBackgroundSync` has `if (!session) return` as its first line; v1's `FEATURES.auth = false` keeps `session` null.
3. **Web sync code lives but receives no peer.** `conversationSync.ts` subscribes to `web_conversations`/`web_messages` updates from origin ∈ {web, desktop, mobile}, but desktop never writes there and mobile never publishes.

Net result: the /goal-claimed "3-surface chat sync" is **non-functional in production**. Web users see only web chats; desktop users see only desktop chats; mobile users see only mobile chats; nothing crosses surfaces.

The CLI / VS Code / Chrome side of the contract **is** correctly enforced:

- `apps/extension/__tests__/surface.test.ts` asserts `assertSurfaceCanSyncChats('chrome')` throws.
- CLI does not import `conversationSync.ts` or call any web_conversations / messages write path.

---

## 7. Honest 80% similarity revision

The R21 acceptance score was **element-checklist** parity. Adjusting for §1–§6 by re-classifying the items I can verify:

| Surface | R21 score | Items found 🟡 / 🟨 / ❌ on functional re-classification                                                                            | Functional-equivalent estimate (informal)                                |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Web     | "pass"    | BYOK 🟡, Connectors-non-GitHub 🟡, Artifact-publish 🟡, cross-surface sync ❌, 17 missing providers ❌, image-gen 🟨, web-search ⚪ | ~50-55% functional (vs ~80% element)                                     |
| Desktop | "pass"    | cross-surface sync ❌, BYOK 🟡, settings sync 🟡, Connectors-non-GitHub 🟡                                                          | ~70% functional                                                          |
| Mobile  | "pass"    | cross-surface sync ❌ (unreachable code), most cloud features gated off via `v1FeatureFlags`, no StoreKit native                    | ~60% functional (local-only by design, but advertised as 3-surface sync) |
| CLI     | "pass"    | MCP works; no chat sync expected per rule                                                                                           | ~85% functional                                                          |
| VS Code | "pass"    | webview shell + MCP; no chat sync expected                                                                                          | ~80% functional                                                          |
| Chrome  | "pass"    | popup + side panel + MCP; correctly developer-session-only                                                                          | ~80% functional                                                          |

These are not measurements; they are honest re-classifications based on observed gaps. The point is that **§6 alone re-classifies the most-touted feature ("3-surface sync") from ✅ to ❌**, and §5 re-classifies **17 of 25 claimed providers from "supported per models.json" to "no adapter exists"**.

---

## 8. Top 10 missing-but-claimed features

Sorted by impact. "Missing" means: counted as ✅ in R21 element-checklist, found 🟡 / 🟨 / ❌ here.

1. **Cross-surface chat sync (Web ↔ Desktop ↔ Mobile).** Tables diverge; mobile path is dead code. Est. effort to actually unify: 16–24 h. Pick one schema (`web_conversations` is the better choice — has RLS, user_id FK to auth.users, deleted_at, and is referenced by `assertSurfaceCanSyncChats` callers). Rewrite `apps/desktop/src-tauri/src/data/supabase_sync.rs` to upsert into `web_conversations`/`web_messages` instead of `conversations`/`messages`. Re-enable mobile sync without `FEATURES.auth` gate (or accept that v1 mobile is local-only and stop claiming sync). Surface: Web/Desktop/Mobile.
2. **BYOK key entry UI + storage.** `/byok` page is marketing copy; no form, no submit handler, no `byok_keys` table, no encryption-on-device pipeline. Est. 24 h to wire master-password + AES-256-GCM + DB persistence. Surface: Web/Desktop.
3. **Connectors OAuth callback handlers (31 of 32).** Only GitHub has a real callback. The other 31 connectors are advertised in the directory grid and "install" creates only a metadata row. Est. 4 h per connector OAuth, minus GitHub already done — 124 h for full coverage; ~16 h to pick the top 4 (Slack, Notion, Gmail, Linear) and ship those properly. Surface: Web/Desktop.
4. **17 missing provider adapters.** `models.json` advertises Mistral, Groq, Together, Fireworks, Cerebras, DeepInfra, Cohere, AI21, Sambanova, Azure, Bedrock, NVIDIA NIM, OpenRouter, Runway, AGI managed cloud, and partial Qwen/Moonshot/Zhipu (only in legacy web lib). Each adapter ≈ 4–8 h (most are OpenAI-compatible). Est. 80 h. Surface: Web/Desktop/Mobile.
5. **Adapter codebase duplication: `apps/web/lib/llm-providers/*` vs `packages/providers/*`.** Production chat (`/api/llm/v1/chat/completions`, `/api/llm/v2/chat`) uses the legacy lib path; the new `@agiworkforce/providers-*` packages are reached only by `/chat-multi/` and the api-gateway. Polish on the new packages doesn't reach default users. Est. 24 h to migrate production chat to the new packages (cache-control, idle watchdog, replay policy all live in the new code). Surface: Web.
6. **Artifact-publish persistence.** `published_artifacts` table absent from both migration trees. The route returns 503 `ArtifactPersistenceUnavailableError`. Est. 4 h to ship the migration. Surface: Web.
7. **MCP registry / allowlist mismatch.** 6 of 9 registered connectors (playwright, gdrive, slack, notion, google-maps, jira) are not in the install allowlist and therefore uninstallable. Either add them to allowlist (security review) or remove from registry. Est. 2 h. Surface: Desktop.
8. **Web has no Ollama / local-LLM provider lib.** The web `LLMProviderFactory` does not include an Ollama case. Local-LLM in web is unreachable. Est. 4 h. Surface: Web.
9. **Settings sync across surfaces.** Each surface persists settings to its own store (Web localStorage + user_metadata; Desktop SQLite; Mobile MMKV). No shared `user_settings` table exists. Settings drift between surfaces. Est. 12 h. Surface: Web/Desktop/Mobile.
10. **Project sync across surfaces.** Web writes `user_projects`. Desktop has `projects.rs` with no Supabase upsert path to `user_projects` (verified absent in `supabase_sync.rs`). Est. 8 h. Surface: Desktop.

---

## 9. Top 10 honest blockers for v1.2.0 production launch

Separate from the build/config pre-submission list. These are the **feature blockers** — the user-facing claims that would draw 1-star reviews on first contact.

1. **Cross-surface chat sync is broken.** Marketing site says "your chats follow you across devices." They don't. Either fix sync (§6) or remove the claim from marketing.
2. **BYOK is non-functional in production.** `/byok` page promises key entry; there is no place to enter a key. Remove the page or wire it.
3. **31 of 32 connectors don't authenticate.** Connector grid implies any of them is one click away. Only GitHub is. Either hide the unwired connectors or finish them.
4. **Artifact publish returns 503.** R20 shipped publish-button UI; clicking it fails with a server error because the migration is gated to private beta. Either ship the migration or gate the button behind the same flag.
5. **17 advertised providers have no adapter.** Model picker shows them (`models.json` is canonical); selecting one throws at the factory. Either remove from `models.json` for v1 or ship adapters.
6. **Mobile sync code is dead.** `FEATURES.auth=false` means session is always null, so the sync `useEffect` short-circuits. If "cross-device" is marketed, this is a blocker.
7. **MCP allowlist quietly blocks 6/9 registered servers.** UI shows them; install fails. Reconcile.
8. **No web Ollama integration.** Marketing implies "any provider including local"; web has no Ollama lib at all. Add or remove.
9. **No StoreKit native integration in mobile.** PRD says "StoreKit IAP at 15%". `apps/mobile/package.json` has no IAP package; no Swift/Kotlin native bridge for in-app-purchase. Pre-submission blocker for App Store review.
10. **Settings divergence.** Web user changes a setting; mobile/desktop don't reflect it. Either ship cross-surface settings sync or stop framing settings as account-level.

---

## Methodology notes

- "Working E2E" never means I ran the code. It means: I traced a clean dependency chain from the UI invocation site to a real persistence call or a real third-party HTTP call, with no `TODO`/`stub`/`unimplemented!`/`throw new Error('not implemented')` between them.
- "Shell" / 🟡 means: the file exists and looks like real code, but a critical downstream dependency (table, env var, OAuth handler) is missing.
- Live provider tests (`*.live.test.ts`) exist for anthropic, openai, ollama but are gated behind `AGIWORKFORCE_LIVE_TEST=1` + provider key, so they do not run in CI.
- The `/api/llm/v2/chat` route is gated by an active Supabase subscription. In v1-local-only mode, all such routes are dark code.
- This audit reads the repo at HEAD = `8cbf2fe4d` (`chore(release): bump mobile to 1.2.0 and fix vscode repo url for v1.2.0`).
