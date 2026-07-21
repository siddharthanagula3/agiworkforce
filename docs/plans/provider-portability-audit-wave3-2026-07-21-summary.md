# Wave 3 — provider portability / lock-in (sonnet-5)

confirmedLockIn: 5
[auth-clerk] Clerk (risk=medium, seam=True, sites~2)
lock: Server-side JWT verification is implemented TWICE: apps/web/lib/api-auth.ts's verifyBearerToken() calls @clerk/backend's verifyToken() directly (re-de
rec: Delegate apps/web/lib/api-auth.ts's Clerk-JWT path to the existing createAuthClient()/ClerkAuthAdapter seam in @agiworkforce/data-layer instead of re-importing @clerk/backend. This
[deploy-hosting-vercel] Vercel Workflow DevKit (`workflow` npm package, `withWorkflow` in next.config.ts) (risk=medium, seam=True, sites~3)
lock: Durable execution engine for the Managed Cloud AGI-Work agent tool-loop. `'use workflow'`/`'use step'` directives (apps/web/lib/workflows/cloud-agent-
rec: Leave as-is; do not pre-build a second orchestrator (the SDK already provides the seam). Record a known-flaw/ADR entry noting: (1) production currently runs on the implicit Vercel
[billing-stripe] Stripe (risk=medium, seam=False, sites~38)
lock: The payment-OPERATIONS layer (checkout-session creation, customer get-or-create, billing-portal sessions, subscription retrieve/update/preview, invoic
rec: Leave Stripe as the deliberate, sole processor for now — building a second provider today would be speculative (no second processor is planned). When a second payment provider or r
[voice-asr-tts] openai (whisper stt + tts) (risk=low, seam=True, sites~4)
lock: Web backend transcription route hardcodes the OpenAI endpoint and asserts (throws) if the canonical `voice_transcription` routing-slot model isn't pro
rec: Leave the OpenAI call itself as-is (it's isolated, not scattered) — this is a deliberate, well-organized single-vendor integration, not raw duplication. The concrete gap is the web
[voice-asr-tts] deepgram (streaming stt) (risk=low, seam=False, sites~4)
lock: Desktop and mobile both hardwire a direct WebSocket/HTTP call to Deepgram for real-time streaming transcription in a dedicated module with its own IPC
rec: Leave as-is for now — Deepgram is the only streaming STT feature that exists, so there's nothing to abstract away from yet (YAGNI). If/when a second streaming vendor or a self-host

downgraded/refuted: 1
[llm-routing-providers] OpenAI (+ Ollama) — Read all cited lines plus the surrounding file, the LLMProvider trait, DirectApiProvider, and OllamaProvider. The claim'

existingSeams (good abstractions already isolating a vendor): 49
llm-routing-providers: packages/ai/provider-protocol + provider-runtime + providers/\* + providers/factory: a genuine cross-language vendor-agnostic seam. Canoni
llm-routing-providers: Self-hosted/open-weights is already first-class, not bolted on: packages/ai/providers/ollama/src/index.ts:1-60 and packages/ai/providers/
llm-routing-providers: apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts:1-80 is a table-driven ADAPTER_PROVIDERS dispatch built explicitly to a
llm-routing-providers: apps/mobile/lib/providerStreamClient.ts:1-101 is a thin wrapper that imports and re-exports packages/ai/provider-runtime's shared streamF
llm-routing-providers: apps/desktop/src-tauri (Rust, can't consume the TS packages) has its own parallel, equally genuine seam: an LLMProvider trait (core/llm/m
llm-routing-providers: apps/desktop and apps/cli both support arbitrary self-hosted/custom OpenAI-compatible endpoints as first-class, not just the fixed vendor
llm-routing-providers: Auth is not hardwired to one shape: AuthMethod (packages/contracts/types/src/provider-adapter.ts:34-66) is a tagged union covering api-ke
llm-routing-providers: Routing is data-driven, not vendor-conditional: packages/ai/routing/src/auto.ts pulls provider/model/trust-mode/capability data from @agi
database-neon: packages/platform/data-layer: DatabaseAdapter interface (src/types.ts:73-117) + createDatabaseClient() factory (src/factory.ts:118-139) is the ca
database-neon: apps/web: 0 direct @neondatabase/serverless imports found anywhere in apps/web app/lib source (confirmed via grep) outside the adapter package. A
database-neon: A raw Postgres adapter skeleton (packages/platform/data-layer/src/adapters/postgres.ts) already exists with a documented implementation checklist
database-neon: RLS binding uses only standard Postgres mechanisms — SET LOCAL / set_config GUCs and a non-BYPASSRLS app_rls role (src/adapters/neon.ts:279-286)
database-neon: No Neon control-plane/branching API coupling found anywhere in the repo (console.neon.tech / api.neon.tech / NEON_API_KEY / neonctl all return ze
auth-clerk: apps/web/lib/api-auth.ts: getClerkAuthUser() is the single chokepoint ~92 API route files call for authn — routes never import @clerk/backend or aut
auth-clerk: Subscription tier / billing entitlement is resolved from the Neon `profiles` table via lib/services/subscription-service.ts, NOT from Clerk metadata
auth-clerk: packages/platform/data-layer/src/{types.ts,factory.ts,adapters/clerk.ts}: a genuine AuthAdapter interface + VerifiedJwt vendor-neutral type + create
auth-clerk: Desktop (Tauri/Rust, apps/desktop/src-tauri) and CLI (apps/cli, Rust): zero direct Clerk SDK references anywhere in the Rust code (grep confirmed).
auth-clerk: Mobile (Expo/React Native, apps/mobile): Clerk touches contained to 6 files total; apps/mobile/src/integrations/clerk.ts + services/authSession.ts f
auth-clerk: Chrome extension (apps/extension): Clerk touches isolated to a single file, apps/extension/src/features/cloud-bridge/clerkAuth.ts (createClerkClient
deploy-hosting-vercel: Primary datastore is Neon Postgres (not Vercel Postgres) — zero @vercel/postgres, @vercel/blob, @vercel/kv, or @vercel/edge-config import
deploy-hosting-vercel: Object storage runs on Cloudflare R2 via the S3-compatible API (apps/web/lib/server/object-storage.ts), not Vercel Blob.
deploy-hosting-vercel: Code-execution sandboxing runs on E2B (third-party), not Vercel Sandbox — no @vercel/sandbox usage found.
deploy-hosting-vercel: Rate limiting and E2B session caching both use Upstash Redis via its REST client, contained to exactly 2 production files (apps/web/lib/r
deploy-hosting-vercel: Every apps/web/app/api/\*\*/route.ts that declares a runtime uses export const runtime = 'nodejs' (30 files checked) — no Edge Runtime usag
deploy-hosting-vercel: api.agiworkforce.com host-based routing is implemented in framework-native next.config.ts rewrites() (not Vercel-proprietary vercel.json
deploy-hosting-vercel: Cron auth deliberately avoids Vercel's automatic cron-invocation trust in favor of a portable CRON_SECRET bearer-token check (apps/web/li
deploy-hosting-vercel: services/signaling-server (the one non-Vercel-hosted service, on Fly) is packaged as a portable Docker image (Dockerfile + docker-compose
deploy-hosting-vercel: Observability uses @sentry/nextjs via the standard Next.js instrumentation.ts hook, not @vercel/otel or any Vercel-specific telemetry SDK
deploy-hosting-vercel: The Vercel Workflow DevKit itself ships an official pluggable 'World' adapter architecture including a Postgres-backed World, explicitly
code-exec-sandbox: apps/web/lib/e2b/types.ts:43-68 — E2BExecutor interface (runCode/writeFile/createFolder/listFiles/readFileBytes/pause/dispose) is the vendor-
code-exec-sandbox: apps/web/lib/e2b/runtime.ts:78-86,169-265 — single getE2BExecutor() factory is the only place the raw @e2b/code-interpreter SDK is imported/c
code-exec-sandbox: apps/web/lib/e2b/gate.ts — e2bExecutionEnabled()/e2bCutoverEnabled() cleanly separate 'is the vendor binding constructable' from 'is the exec
code-exec-sandbox: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts, execution-tools.ts, generated-files.ts — all consume only the E2BExecutor interfac
code-exec-sandbox: apps/desktop/src-tauri/src/core/agi/executors/code_executor.rs — desktop code execution is a fully independent local SandboxManager path with
storage-cache-queue: apps/web/lib/rate-limit.ts: single module-level Redis client + Ratelimit-instance cache (rateLimiterCache), exposing checkRateLimit/withRat
storage-cache-queue: apps/web/lib/e2b/session-store.ts: single module-level Redis client behind getE2BSession/saveE2BSession/deleteE2BSession, fail-open by desi
storage-cache-queue: apps/web/lib/server/object-storage.ts: single S3Client (targeting Cloudflare R2's S3-compatible endpoint) behind putObject/getObject/delete
storage-cache-queue: Full migration off Vercel Blob (the prior storage vendor) left no residue: no @vercel/blob import, no BLOB_READ_WRITE_TOKEN reference anywh
billing-stripe: packages/contracts/types/src/billing-catalog.ts — fully vendor-neutral plan/tier/interval/capability/pricing domain model (BillingPlanTier, Bill
billing-stripe: apps/web/lib/price-tier-mapping.ts — single source of truth mapping Stripe price IDs (env-var driven, e.g. STRIPE_PRICE_PRO_MONTHLY) to {tier, i
billing-stripe: apps/web/lib/stripe-config.ts — centralizes STRIPE_API_VERSION so all ~10 client instantiations stay pinned to one API version instead of drifti
billing-stripe: apps/web/app/api/stripe-webhook/lib/{verify.ts,idempotency.ts,handlers.ts} — webhook pipeline is decomposed into signature verification, idempot
billing-stripe: apps/web/features/billing/services/stripe-payments.ts (client-side) — talks to internal REST endpoints (/api/checkout, /api/portal, /api/upgrade
voice-asr-tts: Desktop TTS: a real `TextToSpeech` trait + `create_tts_provider(config)` factory (apps/desktop/src-tauri/src/features/speech/tts.rs:101-107,487-4
voice-asr-tts: Desktop already ships genuine self-hosted open-weights voice: local Whisper.cpp for STT (features/speech/local_stt.rs, WhisperLocal) and local Pi
voice-asr-tts: Desktop STT blob-transcription dispatch is an explicit, fail-closed `TranscriptionMode` enum (Local/Managed/ByokOpenai) parsed in dictation/trans
voice-asr-tts: Mobile's primary STT/TTS path is on-device native OS engines (expo-speech-recognition's SFSpeechRecognizer/SpeechRecognizer for STT, AVSpeechSynt
voice-asr-tts: CLI mirrors the desktop philosophy with its own small `TranscriptionBackend` enum (OpenAiApi | LocalBinary) plus privacy-mode gating that refuses
voice-asr-tts: Web and the browser extension's side-panel voice input use only the browser-native Web Speech API client-side — no backend hop, no vendor call at
