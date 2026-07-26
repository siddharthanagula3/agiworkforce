# AGI Workforce Mobile — Product & Engineering Overview

> Generated 2026-06-23; Cloud/subscription status refreshed 2026-07-26 from
> `lib/v1FeatureFlags.ts`, the shared billing catalog, and the Mobile/Web API
> contracts. Status labels below: **wired** (reachable end-to-end), **partial**
> (server/deployment dependent), **stubbed** (UI shell, no real logic), and
> **missing/dark** (not wired into any flow).

---

## 1. High-level overview

- **Name.** Brand **"AGI"**; platform/repo **"AGI Workforce"**; CLI command `agi`. Mobile `app.config.js` name = `AGI Workforce` (slug `agi-workforce`, scheme `agiworkforce`, bundle `com.agiworkforce.app`). App Store listing name = **"AGI"**, subtitle "On-device AI assistant". ⚠️ **Version mismatch:** `app.config.js` = `1.2.0`, store-listing metadata = `1.0.0` ("AGI 1.0 — first release"). Reconcile before submit.
- **Problem.** Most AI apps funnel every conversation through remote servers. AGI runs an open-source LLM **on-device first** — works offline / airplane mode, no account, no Wi-Fi, no data leaving the phone in Local Mode, encrypted at rest, "free at inference, forever." Suite-level thesis: pick **Local / BYOK / managed cloud** instead of being locked into one model lab.
- **Audience.** Individual users plus paid Team/Enterprise customers who need
  cross-surface managed Cloud continuity. Mobile retains a Local-first privacy
  boundary, but Cloud subscription behavior is a first-class shipped path.
- **Stage.** **Pre-release / not yet on the App Store.** Managed Cloud is public
  alpha and open to signed-in users; the private-beta environment variable is
  an incident-response kill-switch, not a normal waitlist gate.

**Current runtime feature flags** (`lib/v1FeatureFlags.ts`): ON →
`cloudChat`, `auth`, `projects`, `cloudTasks`, `schedules`, `connectors`,
`webSearch`, `research`, `imageGen`, `usageDashboard`, `codeExecution`. OFF →
`billing`, `iap`, `byokKeys`, `agents`, `dispatch`, `companion`, `messaging`,
`computerUse`, `crossDeviceSync`. A true flag never overrides the server
capability handshake, model capabilities, or canonical plan entitlements.

---

## 2. Current features

**Wired (reachable end-to-end as shipped):**
| Feature | Evidence |
|---|---|
| Auth (Clerk Expo, native AuthView, SecureStore token cache) | `app/_layout.tsx:29-34,77-83` |
| Local chat (on-device tiered LLM, token streaming, `<think>` parsing, tok/s metering) | `chatExecutionStore.ts:744-892` |
| Cloud chat (SSE `/api/llm/v1/chat/completions`, Clerk bearer) — signed-in public alpha | `chatExecutionStore.ts`, `services/streaming.ts` |
| Streaming (SSE reader + reconnect/backoff + paywall handling) | `services/streaming.ts:150-267` |
| Model picker (catalog from `@agiworkforce/types`, no hardcoded IDs; local+cloud scopes) | `model-picker/service.ts` |
| Voice dictation (on-device STT, `expo-speech-recognition`) | `voice/services/voiceInput.ts:148-255` |
| Voice live mode (STT→local model→system TTS loop, local) | `VoiceConversationScreen.tsx` |
| OCR (native Apple Vision / ML Kit, offline) | `image/services/ocr.ts` + `native/ios|android/AGIVisionOCR` |
| File upload/attachments (camera, library, docs; cloud upload requires explicit consent) | `chat/[id].tsx:470-542` |
| Memory + memory-RAG (sqlite-vec vector search → injected context; per-turn fact extraction) | `memory/store.ts:336-361` |
| Chat search, Artifacts capture, Compare (multi-model), Translate (local), Share/Export | `chatViewStore.ts`, `chatExecutionStore.ts:390-416`, `compare/index.tsx` |
| Notifications (expo-notifications + push token registration) | `services/notifications.ts` |
| Settings tree (~30 screens) + Profile; Offline send queue; Camera/Scan | `app/(app)/settings/*` |
| Read-only Cloud plan/usage, canonical entitlements, and Team/Enterprise Web administration handoff | `billing/store.ts`, `settings/cloud-billing`, `settings/cloud-usage` |
| Deployment-truthful connector directory (operator mapped, GitHub App, custom remote MCP) | `services/connectors.ts`, `settings/cloud-connectors` |
| Durable active Cloud Tasks (cursor pagination, foreground refresh, owning-chat handoff) | `app/(app)/agents`, `services/streaming.ts` |
| Plan-gated daily-or-slower Cloud schedules with run history and Cloud-only models | `app/(app)/schedules`, `src/features/schedules` |
| Authenticated durable generated images in chat, Library, Artifacts, fullscreen, and share | `src/features/image`, `services/cloudSyncEngine.ts`, `services/fileCreation.ts` |

**Partial (full code, flag-off or server-dependent):**

- **Image generation** — Cloud generation is wired through
  `/api/media/image/generate`, with canonical Pro+ enforcement. Only
  owner-scoped `/api/files/{uuid}` media persists/syncs; provider URLs and
  inline base64 remain explicitly session-only.
- **Vision (image input)** — local mode is OCR-fallback only (`resolveVisionRoute` always `'ocr-fallback'`); true multimodal only on cloud vision models.
- **Tool calling / web search / code execution** — ambient Web Search and the
  streamed result UI are wired; code execution remains deployment-handshake and
  model gated, so an unconfigured sandbox fails closed.
- **Projects cloud sync** — cloud project detail resolves from
  `cloudProjectStore`; broader companion-style cross-device UI remains off.
- **Project sources** — metadata-only; picked docs are **not** parsed/chunked/embedded.
- **Billing/paywall** — recorded plan/status, limits, usage, and canonical upgrade
  targets render natively. External Mobile billing management stays off.
  StoreKit/Play verification code exists, but purchase/restore controls stay
  hidden until real store products are provisioned.
- **Cloud sync engine** — real 4-surface delta-sync, runs for chat when unlocked; broader cross-device UI gated by `crossDeviceSync=false`.
- **Skills** — real catalog fetch path, cloud/auth-dependent.
- **Connectors** — only the server-advertised deployment set is connectable;
  unavailable catalog providers intentionally remain disabled.
- **Schedules** — Mobile exposes only Once/Daily/Weekly/Monthly and labels the
  selected time as a preference. Deployment still checks once daily and claims
  at most 10 due runs platform-wide, so exact-time/scaled scheduling is not yet
  production-ready.

**Stubbed / dark (gated off for v1):**

- **Agents / multi-agent** — local UI-state store only, no orchestration (`agents=false`).
- **Companion / Messaging / Dispatch** — these native surfaces remain disabled.

---

## 3. Tech stack

**Mobile client (`apps/mobile`):**

- **Expo SDK** `~55.0.23` (New Architecture default), **React Native** `0.83.6`, **React** `19.2.0`, **TypeScript** `~5.9.3` (strict).
- **Routing:** Expo Router `~55.0.14` (typed routes) over React Navigation `^7.x` (drawer-based shell).
- **State:** **Zustand** `^5.0.12` + `persist`/`createJSONStorage` over **react-native-mmkv** `^3.2.0` (encrypted). No Redux/Jotai. **No react-query/SWR** — hand-rolled `fetch` via `services/api.ts`.
- **Styling:** NativeWind `^4.2.3` + Tailwind `^3.4.17`.
- **Local DB:** expo-sqlite `~55.0.16` with **SQLCipher** (`useSQLCipher:true`); 256-bit key in **expo-secure-store** (Keychain); WAL + versioned migrations. Conversations/messages live here; preferences live in MMKV.
- **On-device LLM:** `llama.rn ^0.10.0` (GGUF), `react-native-executorch ^0.8.4`, Apple Foundation Models — via `@agiworkforce/local-llm`.
- **Auth:** Clerk `@clerk/expo ^3.4.2` (⚠️ currently **dev key** `pk_test_*`, no prod Clerk instance yet).
- **Vector/RAG:** **on-device only** — `sqlite-vec` memory vectors (768-dim, nomic-embed) + char-trigram fallback. No pgvector/Pinecone/FAISS.
- **Realtime:** `react-native-webrtc ^124` + WebSocket signaling (desktop pairing).

**Suite/backend (shared infra):**

- **Backend:** `services/api-gateway` (**Express 5** `^5.2.1`, Node) serves `/api/llm/v1/*` + provider streaming; default host `agiworkforce.com` is the **Next.js `^16.2.6`** web app.
- **Database:** **Neon serverless Postgres** `@neondatabase/serverless ^1.1.0`; migrations in `apps/web/db/neon/0001…0027+`.
- **AI providers:** gateway wires `@agiworkforce/providers-{anthropic,google,openai,ollama}`; mobile recognizes anthropic/openai/google/xai/deepseek/qwen/moonshot/ollama. Model IDs from `packages/contracts/types/src/models.json` (never hardcoded).
- **Cache/limits:** Redis (`ioredis`) + `express-rate-limit` at gateway.

**Gaps in tooling:**

- **Error tracking: NONE** — no Sentry/Bugsnag/Crashlytics. (custom `performanceMonitor.ts` only)
- **Analytics: NONE third-party** — custom opt-in local telemetry queue, fail-closed to cloud-mode + consent.
- **CI/CD:** EAS (build/submit profiles in `eas.json`) but **no dedicated mobile GitHub Actions workflow** — EAS runs from local scripts.
- **Testing:** Jest `^29` + jest-expo + RNTL; Detox configured but **not in devDependencies** (manual install).

---

## 4. Architecture

- **Folder layout (mobile root):** `app/` (Expo Router routes), `src/features/*` (**35 domain modules**: chat, memory, projects, voice, image, model-picker, settings, agents, connectors, cloud-bridge, …), `stores/*` (Zustand), `services/*` (**31 cross-cutting services**), `lib/*` (security primitives), `storage/*` (SQLite layer), `hooks/`, `components/`.
- **Feature module pattern:** `src/features/<x>/{store.ts, service.ts, index.ts (barrel), components/, __tests__/, README.md}`.
- **Two persistence layers:** Zustand+encrypted-MMKV for preferences/feature state; expo-sqlite (SQLCipher) for conversations/messages. Chat store is split: `chatMessageStore` (local) + `chatCloudMessageStore` (separate cloud MMKV namespace) + `chatExecutionStore` (send/stream) + `chatViewStore` (mode/search), merged for display by `chatStore.ts`.
- **API layer:** `services/api.ts` (`get/post/put/delete/uploadFile`) → **every request through `guardedFetch`** → `secureFetch`. Handles 401 (one refresh + retry) and 429 paywall → `ApiPaywallError`.
- **Egress guard (load-bearing privacy chokepoint):** `lib/egressGuard.ts` resolves app mode, **fails closed to Local**, and throws before any network I/O to our-cloud hosts (agiworkforce.com / neon.tech / clerk.\*) when in Local mode. This is what enforces the Local trust boundary.
- **App shell:** `app/_layout.tsx` inits MMKV encryption + biometric gate, blocks render until ready, then `ClerkProvider → ClerkTokenBridge → Slot`; wires deep links (`agiworkforce://pair`), share-intent, push, sync loop, tier refresh, age-gate→onboarding redirect.
- **Navigation:** drawer-based (`DrawerContent`, permanent sidebar ≥768px); `(tabs)` group retained for route-compat with **no visible tab bar**.

---

## 5. Screens

**~65 routed screens** (73 `.tsx` minus 8 layout files). Grouped:

- **Entry/auth/public:** `index`, `error`, `not-found`; `(auth)/login` (Clerk AuthView), `(auth)/reset-password`; `(public)/age-gate`, `(public)/onboarding` (3-step local demo).
- **Core (drawer):** `(tabs)/chat` (default landing), `chat/[id]`, `(tabs)/projects`, `projects/[id]`, `(tabs)/agents`, `(tabs)/settings`, `models`, `compare`.
- **Capture/IO:** `voice` (full-screen companion), `camera`, `scan`, `image`, `translate`.
- **Agentic/desktop (mostly gated):** `agents/index`, `agents/[id]`, `dispatch`, `companion/index` (QR pair), `companion/agent/[id]`, `code/index|[id]|archived`, `schedules/index|create`, `widget-setup`.
- **Content/connectors:** `skills`, `artifacts`, `connectors`, `messaging`, `notifications`.
- **Account/billing:** `account`, `profile`, `billing`, `usage`.
- **Settings cluster (~30):** `general`, `appearance`, `accent-color`, `personalization`, `capabilities`, `voice`, `voice-language`, `notifications`, `auto-approve`, `permissions/*`, `data-controls`, `storage`, `memory`, `memory-import`, `integrations`, `performance`, `safety-security`, `parental-controls`, `shared-links`, plus cloud: `cloud-account`, `cloud-billing`, `cloud-usage`, `cloud-connectors`, `cloud-privacy`.
- **Misc/legal:** `feedback`, `share-preview`, `about`, `legal/index`, `legal/article-50`.

---

## 6. AI capabilities

| Capability                      | Status            | Note                                                      |
| ------------------------------- | ----------------- | --------------------------------------------------------- |
| Chat (local)                    | **wired**         | on-device tiered runtime, streaming                       |
| Chat (cloud)                    | **wired**         | Signed-in public-alpha SSE via gateway                    |
| Streaming                       | **wired**         | SSE + reconnect; RN `response.text()` fallback caveat     |
| Voice (dictation + live)        | **wired (local)** | system TTS in v1; cloud TTS not implemented               |
| OCR                             | **wired**         | native, offline                                           |
| Memory + memory-RAG             | **wired (local)** | sqlite-vec retrieval into context                         |
| Vision (image input)            | **partial**       | local = OCR-fallback only; true vision = cloud model      |
| Image generation                | **wired**         | Cloud Pro+, durable authenticated media                   |
| Cloud Tasks                     | **wired**         | Active runs, pagination, foreground polling, chat handoff |
| Scheduled tasks                 | **partial**       | Plan/model gated; once-daily/10-run deployment ceiling    |
| Tool calling / function calling | **partial**       | Deployment/provider dependent                             |
| Web search                      | **wired**         | Ambient default; server/model gated                       |
| Code execution                  | **partial**       | Deployment handshake + model gated                        |
| RAG (document)                  | **dark**          | `ragIndex.ts` built but **wired into no flow**            |
| Multi-agent workflows           | **stubbed**       | local UI state only, no orchestration                     |

---

## 7. What's missing (gaps to the vision)

1. **Native Team/Enterprise control plane:** Mobile hands authenticated workspace
   admins to Web; native org/member/role/device administration is still absent.
2. **Store billing provisioning:** self-serve Mobile purchase and restore cannot
   ship until real App Store Connect and Play Console products are configured.
3. **Mobile chat parity:** browser/computer-use remains intentionally
   unavailable; code execution depends on deployment sandbox availability.
4. **Memory/projects depth:** project "sources" are metadata-only (no indexing); doc-RAG dead-from-flow; no memory enable-toggle/summary; memory import broken in cloud.
5. **Settings/account depth:** identity, tier, capability handshake, sign-out
   isolation, usage, and billing status are wired; native organization/device
   administration remains a Web handoff.
6. **Heavy generation** intentionally deferred (mobile previews/shares; not first heavy generator).
7. **Infra debt:** no error tracking, no mobile CI workflow, Detox not installed, dev Clerk key, version-string mismatch (1.0.0 vs 1.2.0).
8. **Verification debt (P0 in docs):** launch-critical flows need screenshot/e2e UI verification, not just typecheck/build.
9. **Scheduled-work capacity:** the UI no longer promises sub-daily cadence,
   but the once-daily runner with a 10-run claim limit is not sufficient for a
   scaled Team/Enterprise rollout.

---

## 8. Vision (v1.0)

- **Suite:** "practical parity with current leading AI application ecosystems" (ChatGPT/Claude as references) **plus one differentiation** — user choice of **Local / BYOK / public-alpha managed cloud**. "Must feel like a serious modern AI application suite, not a demo, not a model playground, not a collection of disconnected tools." Parity = _capability/workflow_ parity, own design system/names (no cloned code/branding).
- **Shared cross-surface model:** every surface native-shaped but sharing one trust model, model/provider rules, session/artifact/memory model, and source of truth. App-chat sync only within Web/Mobile/Desktop; CLI/VS Code/Chrome stay workspace/task-scoped unless explicit redacted handoff.
- **Mobile v1 specifically:** ship a polished public app that preserves the Local
  trust boundary while making paid Cloud continuity, real entitlements, and a
  truthful Team/Enterprise control-plane handoff demo-ready.
