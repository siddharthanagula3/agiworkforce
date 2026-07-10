# Platform Spec Gap Audit — founder 71-section architecture vs repo (2026-07-10)

Status: Triage queue (NOT remediation — per repo rule, each item must be confirmed in source and fixed in production paths before closing)
Owner: Founder + platform lead
Method: code-verified audit (files opened, real logic vs stub confirmed) against the founder's 71-section "AGI Platform Architecture" spec (Parts 1–3). Founder-overridden items (no BYOK on web/mobile, simple home) and image generation/editing are excluded from gaps by directive.

## TOP-20 genuinely-missing (ranked)

1. **No remote execution backends** — SSH/Docker/K8s/remote-machine targets don't exist anywhere; `"ssh *"`/`"docker *"`/`"kubectl *"` are local-shell allow-list strings only (`apps/desktop/src-tauri/src/core/agi/executors/terminal_executor.rs:283`). Execution is local-process + E2B only.
2. **RLS enforced on only ~11 of ~118 routes** — policies exist and are enabled (migrations 0037/0039/0049) but only ~11 routes go through `rls-db.ts`; ~107 use raw `getNeonDb()` relying on app-layer `where user_id`. Security-critical.
3. **Desktop code execution has no real OS sandbox** — network isolation is advisory env vars (code comments admit no namespaces/seccomp/seatbelt). CLI has real fail-closed isolation (Seatbelt/bubblewrap/Landlock, `apps/cli/src/features/exec/tools/bash/mod.rs:157`).
4. **Conflict resolution is coarse last-writer-wins by `updated_at`** — concurrent edits silently drop the losing write; no merge/version-vector. Delta sync = monotonic `server_version` cursor (0038). Skills and connectors do not delta-sync.
5. **No transactional email capability at all** — no resend/sendgrid/ses/nodemailer anywhere. Blocks email invites, receipts, notification email, verify flows.
6. **Server-side push-send pipeline absent** — mobile stores expo push tokens server-side but nothing in-repo delivers pushes.
7. **No AI-eval/routing/judge harness** — `.golden.test.ts` are I/O snapshots, not model-quality evals. No regression net for a model-routing product.
8. **No remote feature-flag/config/kill-switch system** — mobile flags compile-time (`apps/mobile/lib/v1FeatureFlags.ts`); only env kill-switch is managed-compute.
9. **No force-update / minimum-version gate** on desktop or mobile — Tauri updater is opt-in; mobile has none.
10. **Files/library not synced cross-device + no web Library page + no collections/favorites/tags** — `media_assets` has no collection/favorite/tag columns; mobile strips attachments from sync (`cloudSyncEngine.ts:180`).
11. **Billing tier enum drift across 4 sources** — catalog has basic/team; DB constraint 0030 has legacy `hobby` and lacks basic/team; PLAN_HIERARCHY omits basic. Gating/pricing correctness risk.
12. **Custom 2FA is step-up only (does not gate login) + custom SSO/SAML is metadata-only, never wired into a real auth flow.** Clerk MFA unused.
13. **Interrupted/stopped turns not marked or resumable; no "continue generating" affordance on any surface** (partial text persists on abort; no lifecycle status enum — matches roadmap W1.A).
14. **No vector memory retrieval on web/mobile (lexical ILIKE); no org/team memory; no episodic/semantic taxonomy; no connector-sourced memory.** Project memory desktop-only.
15. **Repo indexing / symbol search / dependency graph / debugger missing in AGI Work** — only ripgrep text search; no tree-sitter/ctags/symbol index. Embedded browser also missing (agent drives external Chrome via CDP).
16. **Auto-resume-on-crash is dead code** — `resume_all_tasks()` (`continuous_executor.rs:1068`) never called; recovery is manual-trigger only.
17. **CLI agent task/cron tools are non-executing registries** — `task_create` never spawns (`task_registry/mod.rs:131`); session `cron_create` records never fire; `/background` is a stub. Only the file-config daemon runs.
18. **No per-device session list/revoke UI** — only "log out all devices".
19. **Web in-app notification center is a non-functional Tauri-mock stub; mobile + CLI have no crash reporting; no product analytics SaaS anywhere** (web+desktop Sentry real).
20. **No automated extension/VS Code store-publish pipelines (build-only); macOS desktop signing flagged in-flux.**

## Honorable mentions (real, lower severity)

- Message-action parity drift: shared ActionBar = copy/thumbs/retry only; fork desktop-only, pin web-only, bookmark desktop-only, export mobile-only; **share/translate/view-raw missing everywhere**; edited-timestamp rendered desktop-only.
- LaTeX/math missing from the shared unified-chat renderer (web/desktop/mobile each have it separately — parity drift).
- Web composer `accept="image/*"` dead-ends document upload (**bug**).
- Attachments: no OCR, no virus scan, no upload progress/resume, thumbnails client-only.
- Composer: PromptStash missing on web/mobile; variables/substitution missing everywhere; slash/mention autocomplete missing on mobile; composer undo/redo missing.
- Desktop local-model tuning (GPU layers/threads/quantization) missing — endpoint URLs only.
- Developer settings (hooks/flags/logs viewer) missing everywhere.
- Providers missing vs spec: cohere, together, fireworks, cerebras (real adapters exist for anthropic/openai/google/xai/mistral/groq/openrouter/deepseek/perplexity/qwen/zhipu/moonshot/lmstudio/ollama).
- No neural local embeddings: desktop offline fallback stub errors "install Ollama" (`embeddings/generator.rs:156`); mobile RAG is lexical.
- Storybook absent (zero stories); design tokens single-palette.
- Teams/orgs: APIs real but `TeamSettingsPanel` unmounted (member management unreachable); invites only match existing profiles.
- Voice chat missing on web (desktop+mobile have full conversational mode); CLI cannot send images to vision models; VS Code has no task provider.
- Search is SQL ILIKE substring only (FTS planned W3; pgvector deliberately deferred FD-3).
- Backups: UNKNOWN in-repo (Neon PITR out-of-band).
- Orphaned dead files worth deleting: `CodeModeHome.tsx`, `AgiWorkHome.tsx` (unused, hardcoded fake stats).

## What the audit confirmed as REAL (selected)

AGI Work desktop core (folder selection, 693-line planner, 2,901-line git executor, PTY terminal, browser automation via CDP, real computer-use on mac/win); command palette on web/desktop/mobile; temporary chat on all 3; offline queue/backoff on all 3 (duplicated implementations); Ollama/LM Studio/llama.cpp/vLLM desktop adapters; real mobile on-device runtimes (llama.rn + ExecuTorch); chats/projects/memory/settings delta-sync; real Stripe invoices UI; credit-ledger metering; rate limiting broad and fail-closed (165 call-sites); append-only audit logs (0043); real crypto for secrets (Stronghold/keyring/SQLCipher/Argon2); CI real and gating (13 workflows); desktop updater (Ed25519) and mobile EAS pipelines.

## Monorepo vs spec sections 40–64 (structural)

No top-level `sdk/`. Runtime fragmented across `packages/runtime` + `llm-runtime` + `local-llm` + Rust `crates/agiworkforce-llm` (not one runtime layer). Providers are one package, not per-provider packages. 18 `crates/*` mirror TS concerns (known split-brain). No eval or telemetry packages. `apps/` 7-surface layout matches the spec; `services/` are stubs.

## Detailed evidence — Part-2/3 addendum (file paths per item)

### Message actions / rendering / interrupt state

- fork/branch: desktop only (`apps/desktop/src/features/chat/MessageBubble/useMessageActions.ts` `onFork`); web edit-rollback-branch via `apps/web/lib/pendingEdit.ts`; unified-chat `BranchNavigator` exists but unwired; mobile missing.
- bookmark: desktop only (`toggleMessageBookmark`). pin: web only. export: mobile only (`FileExportButton`). speak/read-aloud: desktop only (`useTauriStreamListeners.ts:669`).
- share / translate / view-raw-response: missing on all surfaces.
- edited-timestamp: desktop renders (`MessageBubble/MessageHeader.tsx:79`); web persists `edited` (`services/conversation-storage.ts:63`) but renders no indicator; mobile none.
- LaTeX: web `lib/markdown-config.ts` (remark-math+rehype-katex), desktop `MessageContent.tsx`, mobile `MathBlock` — shared unified-chat renderer is regex-only (parity drift).
- Mermaid: artifact-rendered on web/desktop/unified; mobile gated off ("requires sandbox").
- Interrupted state: `apps/web/lib/hooks/useChatStream.ts:1010` persists partial text on abort; no `status:'interrupted'` enum, no continue affordance (roadmap W1.A).

### Composer

- Drafts: mobile real (`apps/mobile/src/features/chat/draftStore.ts`, encrypted MMKV); web partial (`setDraftContent` in `v3/WebEmptyChat.tsx`); desktop none.
- PromptStash: desktop (`stores/promptStashStore.ts` + `PromptStash.tsx`) + unified-chat export; missing web/mobile. Variables/substitution: missing all. Composer undo/redo: missing all. Slash/@-mention autocomplete: web+desktop; missing mobile.

### Attachments

- Web ALLOWED_MIME_TYPES in `hooks/use-attachments.ts` includes pdf/office/code, but `ChatComposerNew.tsx:1737` hardcodes `accept="image/*"` — document upload dead-ends (bug). Mobile allowlist at `app/(app)/(tabs)/chat.tsx:433`. OCR / virus scan / upload progress+resume: missing all; thumbnails client-side only.

### Memory

- Project memory desktop-only (`apps/desktop/src-tauri/src/core/agi/project_memory.rs`); web/mobile `0010_memory.sql` flat schema. Cloud retrieval is ILIKE (`apps/web/app/api/memory/search/route.ts`, comment "upgrade to vector later"). Import from ChatGPT/Claude exports exists (`packages/api/src/memoryImport.ts`). Org/team memory, connector-sourced memory: missing.

### Auth

- Clerk prebuilt UI; enabled strategies live in Clerk Dashboard (unknowable from code). Custom TOTP 2FA (`0025_two_factor.sql`, `TwoFactorPanel`) step-up only — does not gate login; Clerk MFA unused. SSO/SAML = Neon metadata store (`api/admin/sso`, `api/auth/sso-check`) never wired to a Clerk SAML flow. Sessions: "log out all devices" only; `desktop_devices`/`mobile_devices` have no list/revoke UI. RBAC = custom Neon teams(0007)/orgs(0015), not Clerk Organizations, per-route enforcement.

### Subscription

- Tier drift: `packages/types/src/billing-catalog.ts` (basic/team/enterprise) vs DB constraint 0030 (legacy `hobby`, no basic/team) vs `PLAN_HIERARCHY` (omits basic). No education plan. Invoices real (`api/billing/invoices` → `stripe.invoices.list`). Per-provider usage breakdown TODO (`use-billing-queries.ts:256`); `increment_usage()` no-op'd in 0044 (double-charge fix).

### Settings

- Developer section: hooks/feature-flags/logs viewer missing everywhere (desktop has config.toml editor + agent timeouts only). Desktop local-model tuning: `LocalRuntimeSettings.tsx` endpoint URLs only; no `n_gpu_layers`/threads/quantization controls. Data controls + notification prefs exist on all 3.

### Notifications

- Mobile push client real (`services/notifications.ts`, token → `/api/mobile/push-token` → `mobile_devices`); no expo-server-sdk/exp.host send path in repo. No email provider anywhere. Web `apps/web/hooks/useNotifications.ts` imports `@/lib/tauri-mock` — non-functional stub; desktop `NotificationCenter.tsx` real. Quiet hours: mobile (`stores/notificationPrefsStore.ts`).

### Analytics / providers / testing / release / design

- No product-analytics SaaS; Sentry real on web+desktop, missing mobile+CLI; perf monitoring desktop-only (`services/performance.ts`).
- Provider adapters real: anthropic, openai, google, xai, mistral, groq, openrouter, deepseek, perplexity, qwen, zhipu, moonshot, lmstudio, ollama. Missing vs spec: cohere, together, fireworks, cerebras. CLI auto-probes ollama+lmstudio only.
- AI-eval harness missing: `.golden.test.ts` are I/O snapshots; routing tests deterministic-unit only.
- CI gating is real (13 workflows, `-D warnings`, SHA-pinned actions). Desktop release via tauri-action (macOS signing "being reconfigured" per release notes); mobile EAS; extension + VS Code store publishing missing (build-only).
- `packages/ui` ~55 primitives; `packages/design-tokens` single palette; Storybook absent (zero stories).
