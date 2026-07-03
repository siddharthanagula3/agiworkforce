# AGI Desktop — Volume 17 — Settings

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/desktop/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and the real desktop paths this volume grounds in: `apps/desktop/src/features/settings/SettingsPanel.tsx`, `apps/desktop/src/features/settings/tabs/**`, `apps/desktop/src/features/settings/__tests__/settings-ia.test.ts`, `packages/ui/src/settings-nav.ts`, `apps/desktop/src/stores/settingsStore.ts`, `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `packages/types/src/models.json`, `packages/types/src/billing-catalog.ts`.

## Overview & stance

Desktop is the full-trust surface — **Local + BYOK + Managed Cloud** all selectable with correct visible labels — so its Settings are the most complex of any surface. Settings must never silently move a Local chat, file, or session into BYOK or Cloud: Local→BYOK is an explicit fork (context selection, secret scan, payload preview, provider label, consent), and Managed Cloud is a distinct boundary that is open-by-default for signed-in users but env-gated as a kill-switch. The **locked Settings IA** is the single source of truth in `packages/ui/src/settings-nav.ts` (`SETTINGS_NAV` + `SETTINGS_NAV_GROUPS`), shared with Web so the two cannot drift; `SettingsPanel.tsx` renders local-mode settings and `DesktopCloudSettingsModal.tsx` renders the shared cloud-mode shell. The nav↔renderer contract is test-enforced (`settings-ia.test.ts`). Convergence of older flat panels onto this IA is **🟡** in progress. The subsections below map required domains onto that IA.

## General

App mode toggle (Local/Cloud), **quick-access global hotkey** (Tauri accelerator, `GlobalHotkeyPreferences`), theme, language, system-resource limits, macOS agent/automation permissions, update settings, onboarding restart, and keybindings. **✅ Built** — `apps/desktop/src/features/settings/tabs/General/index.tsx`. **Run-on-startup / launch-at-login is 🔭 Planned** — no Tauri autostart plugin is wired today (per locked desktop-app UX, add it here).

## Appearance

"Personalization" tab composing appearance controls, custom instructions, and themes. **✅ Built** — `apps/desktop/src/features/settings/tabs/Appearance/index.tsx` (renders `PersonalizationSettings`, `CustomInstructionsSettings`, `ThemeSettings`). Accessibility toggles (dyslexic font, density) are aliased in nav `keywords`; font selection via `FontSelector.tsx`.

## Theme

Light / Dark / System selector persisted to `windowPreferences.theme`, plus custom theme authoring. **✅ Built** — theme select in `tabs/General/index.tsx` and `apps/desktop/src/features/settings/ThemeSettings.tsx`; custom-theme editor `apps/desktop/src/features/settings/ThemeEditorDialog.tsx`. Requirement: theme changes apply live without a save round-trip.

## Accent Color

A first-class accent/brand-color picker with a named token exposed to the theme system. **🔭 Planned** — custom theme authoring exists (`ThemeEditorDialog.tsx`), but a dedicated accent-color control that writes a persisted design token is not yet built; add it to the Personalization/Theme surface.

## Language

In-app locale selector driven by `SUPPORTED_LANGUAGES` (12 locales under `apps/desktop/src/i18n/locales/`), persisted via `setLanguage`. **✅ Built** — `tabs/General/index.tsx` + `apps/desktop/src/i18n/`. Requirement: switching locale re-renders settings labels without restart.

## Notifications

Enable/disable, sound, badge, desktop notifications, per-type toggles, and do-not-disturb windows, persisted through `notifications.notificationGetSettings/notificationSetSettings`. **✅ Built** — `apps/desktop/src/features/settings/tabs/Notifications/index.tsx` + `NotificationsSettings.tsx`. Persistence gated to Tauri/cloud host (`canPersistNotificationSettings`).

## Voice

STT engine choice — Local Whisper (offline), Deepgram (cloud), OpenAI Whisper (cloud) — Whisper model download, Piper TTS voices, and persona. **✅ Built** — `apps/desktop/src/features/settings/tabs/Voice/index.tsx` + `VoiceSettings.tsx` + `VoicePersonaSelector.tsx`. Non-LLM engine IDs (Deepgram, Whisper, Piper) are referenced from `VoiceSettings.tsx`, not re-listed. Local Whisper keeps audio on-device.

## Privacy

Data export (JSON), clear-all local data, data-storage-location disclosure, crash-reporting opt-in (Sentry, no conversation/keys), cache management, allowed directories, analytics, and a governance/SafetyPolicies entry. **✅ Built** — `apps/desktop/src/features/settings/tabs/Privacy/index.tsx` + `Privacy/DataSection.tsx`. **Locked:** the "sync chat history to cloud" toggle is removed for the local-default boundary; `chatPreferences.chatStorageMode` defaults `"local"` and is coerced back on load (see `apps/desktop/AGENTS.md`).

## Security

Master password over stored keys/secrets (Argon2id), credential storage, filesystem allow-listing, computer-use consent, and the local host's bridge tokens / IP lockout / HMAC pairing. **✅ Built** — `apps/desktop/src/features/settings/MasterPasswordSettings.tsx` (Argon2id per `master_password.rs`), `AllowedDirectoriesSettings.tsx`, `ComputerUseSettings.tsx`/`ComputerUseConsentDialog.tsx`; bridge auth in `src-tauri/src/integrations/realtime/websocket_server.rs`. **Credential vault (🟡):** the dominant secret-storage path is machine-derived AES-256-GCM (`apps/desktop/src-tauri/src/sys/security/machine_key.rs` — it explicitly "replaces the keyring-based approach"); OS keychains (macOS Keychain / Windows Credential Manager / Linux Secret Service) are the stance's reconciliation target, not the shipped primary vault (see Volumes 16/19/21).

## Memory

Cross-session memory editor (view/edit/delete entries) shared with unified chat. **✅ Built** — `apps/desktop/src/features/settings/tabs/Memory.tsx` (renders the unified-chat `MemoryEditor`). Managed-Cloud memory delta-syncs via `apps/web/app/api/memory/sync`; Local/BYOK memory rows never sync.

## Billing

Plan display, Stripe customer-portal handoff, and invoices. **🟡 Partial** — `apps/desktop/src/features/settings/tabs/Billing/index.tsx` + `BillingSettings.tsx` are wired, but pricing copy must present only the canon ladder — **Free $0 / Basic $8 (₹399) / Pro $20 / Max $100 and $200 / Enterprise** — with no Plus/Hobby/`pro_plus` and no credit top-ups. Gap: `packages/types/src/billing-catalog.ts` and a hardcoded "$20/mo" string in `tabs/General/index.tsx` still encode older/plan-specific values; reconcile to the catalog (tracked separately). INR is fixed only for Basic; Pro/Max INR are TBD.

## Connected Services

OAuth connectors gallery plus MCP server + per-tool enablement, and installed extensions. **✅ Built** — `apps/desktop/src/features/settings/tabs/Connectors/index.tsx` (`ConnectorGallery` + `MCPServerSettings.tsx`) and `tabs/Extensions/index.tsx`. MCP server config (add/edit/enable, per-tool toggles) is a locked desktop-app UX requirement. Connector credentials live in the encrypted local store, never in plaintext settings JSON.

## Cloud Mode Settings

When the app is in Managed-Cloud mode, `App.tsx` swaps in the shared `@agiworkforce/ui` settings shell so Web and Desktop render the same modal; sections general/account/privacy/memory/connectors/skills/plugins/billing/usage/capabilities are wired to desktop stores; appearance/notifications/voice/models-keys stay local-only. **🟡 Partial** — `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx`. Managed Cloud is public-alpha open-by-default; the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident kill-switch. Cloud chats/memory/projects sync via `apps/web/app/api/{chat,memory,projects}/sync`.

## Local Mode Settings

Local mode uses `SettingsPanel.tsx` and keeps data on-device: storage-location disclosure, clear-local-data, master password, allowed directories, Ollama URL/model, and provider request-routing (`auto`/`local`/`cloud`). **✅ Built** — `SettingsPanel.tsx` + `stores/settingsStore.ts` (`chatStorageMode` default `"local"`). Requirement: no Local setting may enable an implicit cloud/BYOK route; provider-routing `local` must guarantee "nothing leaves this device."

## Provider Configuration

BYOK key entry (Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Perplexity, OpenRouter, NVIDIA NIM), test/verify, local Ollama config, custom models, and default-model selection. **✅ Built** — `apps/desktop/src/features/settings/tabs/ModelsKeys/index.tsx` + `CustomModelsSettings.tsx`; keys encrypted and stored locally (`McpClient.saveApiKey`, `llm_check_provider_status`). Model IDs must come only from `packages/types/src/models.json` — never hardcoded. BYOK is Desktop/CLI/VS Code only; this tab must not appear on Web/Mobile.

## Repository map

- `apps/desktop/src/features/settings/SettingsPanel.tsx` — local-mode renderer (nav↔render switch).
- `apps/desktop/src/features/settings/tabs/**/index.tsx` — the 18 canonical tab renderers.
- `apps/desktop/src/features/settings/*.tsx` — panel components (`MasterPasswordSettings`, `ComputerUseSettings`, `MCPServerSettings`, `VoiceSettings`, `ThemeSettings`, `ThemeEditorDialog`, `PersonalizationSettings`, `BillingSettings`, `NotificationsSettings`, `AllowedDirectoriesSettings`, `DotfileSettings`, `AgentExecutionSettings`, `CustomModelsSettings`).
- `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx` — shared cloud-mode shell.
- `apps/desktop/src/features/settings/__tests__/settings-ia.test.ts` — IA contract test.
- `packages/ui/src/settings-nav.ts` — canonical `SETTINGS_NAV` + groups.
- `apps/desktop/src/stores/{settingsStore,settingsDialogStore}.ts` — persisted state.
- `apps/desktop/src-tauri/src/integrations/{realtime,native_messaging}/**` — local host / bridge / pairing.
- `apps/web/app/api/{chat,memory,projects}/sync` — Managed-Cloud delta-sync.
- `packages/types/src/models.json` — model-ID SSOT; `packages/types/src/billing-catalog.ts` — plan catalog (older-tier gap).

## Competitor notes

Claude Desktop and ChatGPT desktop expose a flat single-vendor settings surface (account, appearance, one provider). Codex is CLI/IDE-first with config files. AGI diverges deliberately: **per-surface trust** (Local/BYOK/Cloud selectable with visible labels), **multi-provider BYOK** with encrypted local keys and no markup, **local-first defaults** (data on-device, sync only when the user opts into Cloud), and a settings shell **shared with Web** so parity is structural, not copied. Where competitors imply a single cloud identity, AGI keeps Local, BYOK, and Managed Cloud as separate, labeled trust boundaries.

## Acceptance / Definition of Done

Production-ready when every locked IA section resolves to a rendered, store-backed panel; trust labels are always visible and correct; Local defaults never route data off-device; and billing copy matches canon.

- [ ] Build/UX: every `SETTINGS_NAV` key renders a panel; `settings-ia.test.ts` and `typecheck` pass; settings search resolves via `keywords`.
- [ ] Trust: no Local setting enables implicit BYOK/Cloud routing; Local→BYOK requires the explicit fork (context selection, secret scan, payload preview, provider label, consent); ModelsKeys/Provider Config is hidden on Web/Mobile.
- [ ] Security: keys/secrets in OS keychain behind the master password; connector/BYOK credentials never written to exportable settings JSON; cloud-sync toggle stays removed until ungated.

## Anti-patterns

- Silently syncing Local/BYOK chats, files, or memory to Cloud, or re-adding the cloud-sync toggle before it is ungated.
- Showing BYOK/Provider Configuration on Web or Mobile.
- Hardcoding model IDs instead of reading `packages/types/src/models.json`.
- Displaying removed tiers (Plus, `pro_plus`, Hobby) or credit top-ups; showing prices that contradict the canon ladder or inventing Pro/Max INR figures.
- Referencing Supabase (fully migrated to Clerk + Neon + Stripe) or renaming `proxy.ts` back to `middleware.ts`.
- Claiming a capability is shipped without a real repo path, or letting nav entries orphan (a nav key with no render case).
- Storing API keys or connector secrets in plaintext settings JSON or in the exportable settings bundle.
