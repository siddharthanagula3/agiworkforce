# Feature: Settings
> Central configuration surface — 12 tabs covering LLM config, API keys, agent behavior, UI preferences, privacy, MCP, and more — backed by Zustand v5 persist (localStorage) with a companion JSON file on disk via the Rust backend.

## Where It Lives

| Layer | Location |
|-------|----------|
| Frontend Entry | `components/Settings/SettingsPanel.tsx` — Dialog-based panel (Radix Dialog); 12-tab navigation |
| Tab Components | `GeneralSettings.tsx`, `AccountSettings.tsx`, `PrivacySettings.tsx`, `MCPServerSettings.tsx`, `MCPToolsSettings.tsx`, `ExtensionsSettings.tsx`, `NotificationsSettings.tsx`, `AgentsSettings.tsx`, `CustomModelsSettings.tsx`, `SkillsPluginsSettings.tsx`, `ResearchSettings.tsx`, `VoiceSettings.tsx`, `TaskRoutingSettings.tsx`, `CustomInstructionsSettings.tsx`, `AllowedDirectoriesSettings.tsx`, `MasterPasswordSettings.tsx`, `ModelSelector.tsx`, `API Keys` tab content + `BYOKApiKeysSection` (inline in `SettingsPanel.tsx`) |
| Primary Store | `stores/settingsStore.ts` — Zustand v5 + devtools + persist v13 + subscribeWithSelector |
| Dialog Store | `stores/settingsDialogStore.ts` — non-persisted; tracks dialog open/close and active tab |
| Sub-stores | `appPreferencesStore.ts` (window/UI), `chatPreferencesStore.ts` (agent mode, auto-approve), `executionPreferencesStore.ts` (timeouts), `securityPreferencesStore.ts`, `llmConfigStore.ts` (provider/model config) |
| Rust Commands | `sys/commands/settings.rs` — `settings_load`, `settings_save`, `settings_load_from_disk`; `settings_v2.rs` — key-value store (9 commands defined, 3 registered in lib.rs: `settings_v2_get`, `settings_v2_set`, `settings_v2_clear_cache`); `mcp_oauth.rs:1704` — `save_api_key` (encrypted); `llm.rs:352` — `llm_set_default_provider`; `tool_confirmation.rs:422` — `set_agent_mode` |
| Disk Persistence | `<app_data_dir>/settings.json` — written by `settings_save` |
| Web App | `apps/web/features/settings/pages/SettingsPage.tsx`; `hooks/use-settings-queries.ts` — 21 React Query hooks; `services/user-preferences.ts` — Supabase CRUD |
| Web API Routes | `apps/web/app/api/settings/test-provider/route.ts`, `apps/web/app/api/models/route.ts` |

## Settings Tabs (12)

| Tab Key | Label | Icon | Content |
|---|---|---|---|
| `general` | General | Settings2 | Theme, language, startup, LLM config, allowed directories |
| `account` | Account & Billing | CreditCard | Auth info, subscription tier |
| `personalization` | Personalization | Sparkles | Custom instructions, favorite models, agent mode, custom models |
| `privacy` | Privacy & Data | Shield | Feature privacy, automation permissions, master password, cache management, analytics |
| `connectors` | Connectors | Plug | ConnectorsGallery, OAuth credentials |
| `api-keys` | API Keys | Server | 8 BYOK providers (Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Perplexity, OpenRouter) |
| `mcp` | MCP & Skills | Wrench | MCPToolsSettings + SkillsPluginsSettings |
| `mcp-server` | MCP Server | Share2 | MCPServerSettings |
| `extensions` | Extensions | Puzzle | ExtensionsSettings |
| `notifications` | Notifications | Bell | NotificationsSettings |
| `tools` | Tools | TerminalSquare | ToolsPanel |
| `research` | Research | FlaskConical | ResearchSettings |

## Data Flow

1. **Opening settings** — Any component calls `useSettingsDialogStore.openSettings(tab?)` → sets `settingsOpen: true`.

2. **Hydration** — Zustand persist rehydrates from `localStorage` key `agiworkforce-settings` (v13). Concurrently, `settings_load_from_disk` loads `<app_data_dir>/settings.json` and reconciles.

3. **User changes setting** — Most setters are synchronous store updates (no IPC):
   - Theme: `setTheme(theme)` → mutates `document.documentElement.classList`
   - Language/temperature/etc: store-only updates

4. **Settings requiring Rust IPC**:
   - `setDefaultProvider(provider)` → `invoke('llm_set_default_provider', { provider })` → `LLMRouter.set_default_provider()`
   - `setAutoApproveTools/setAgentMode` → `invoke('set_agent_mode', { mode })` → `ToolGuardState.set_agent_mode()`
   - API key save → `apps/desktop/src/api/mcp.ts` / `McpClient.saveApiKey(provider, key)` → `save_api_key` → `encrypt_credential(key)` → SQLite `settings_v2` table, `encrypted: true`

5. **Disk persistence** — `settings_save(settings)`:
   - Normalizes hotkey combo
   - Updates in-memory `Mutex<Settings>`
   - Writes JSON to `<app_data_dir>/settings.json`
   - Applies hotkey if `ShortcutsState` available

6. **Settings v2** — Lower-level key-value store backed by SQLite (`SettingsService`). Typed values (String/Integer/Float/Boolean/Json) with optional encryption. Used primarily by `save_api_key`.

## API Key Security

Keys flow through a dedicated security path, never through settings JSON or localStorage:

1. User pastes key into `BYOKApiKeysSection` input
2. `McpClient.saveApiKey(provider, key)` → `save_api_key`
3. Rust: `encrypt_credential(key)` (AES-GCM encryption)
4. Upserted into SQLite `settings_v2` table as `api_key_<provider>`, `encrypted: true`

## Component Tree

```
SettingsPanel (Radix Dialog)
├── DialogHeader (title, close)
├── Left nav (12 tab buttons with icons)
└── Right content pane
    ├── general → Theme/Language, LLM config, AllowedDirectories
    ├── account → AccountSettings (auth, subscription)
    ├── personalization → CustomInstructions, FavoriteModels, AgentMode, CustomModels
    ├── privacy → FeaturePrivacy, CacheManagement, AutomationPermissions, MasterPassword, Analytics
    ├── connectors → ConnectorsGallery, OAuthCredentials
    ├── api-keys → BYOKApiKeysSection (8 providers, encrypted save)
    ├── mcp → MCPToolsSettings, SkillsPluginsSettings
    ├── mcp-server → MCPServerSettings
    ├── extensions → ExtensionsSettings
    ├── notifications → NotificationsSettings
    ├── tools → ToolsPanel
    └── research → ResearchSettings
```

## IPC Contracts

| Frontend Call | Rust Handler | Params (camelCase) | Returns | Notes |
|---|---|---|---|---|
| `invoke('settings_load')` | `settings_load` | none | `Settings` | |
| `invoke('settings_save', { settings })` | `settings_save` | `settings: Settings` | `()` | |
| `invoke('settings_load_from_disk')` | `settings_load_from_disk` | none | `Settings` | |
| `invoke('settings_v2_get', { key })` | `settings_v2_get` | `key: String` | `Value` | |
| `invoke('settings_v2_set', { request })` | `settings_v2_set` | `request: { key, value, category, encrypted }` | `SettingsResponse` | |
| `invoke('settings_v2_get_batch', { request })` | `settings_v2_get_batch` | `request: { keys: String[] }` | `{ settings: Record<string, Value> }` | **Not registered in lib.rs** |
| `McpClient.saveApiKey(provider, key)` | `save_api_key` | `provider: String, key: String` | `()` | |
| `invoke('llm_set_default_provider', { provider })` | `llm_set_default_provider` | `provider: String` | `provider: String` | |
| `invoke('set_agent_mode', { mode })` | `set_agent_mode` | `mode: AgentMode` | `()` | |

## Store Architecture

### `useSettingsStore` — Primary (persist v13)

State: `llmConfig` (provider, temperature, maxTokens, taskRouting, favoriteModels), `windowPreferences` (theme, language, startup), `chatPreferences` (agentMode, autoApproveTools, compactMode), `executionPreferences` (timeout, checkpointing), `globalHotkeyPreferences`, `allowedDirectories`, `customModels`, `features` (capability flags).

13 versions of migrations documented inline.

### Sub-stores (extracted for domain separation)

- `appPreferencesStore` — window/UI + global hotkey (persist v1)
- `chatPreferencesStore` — agent mode, auto-approve (calls Rust IPC)
- `executionPreferencesStore` — timeout, checkpointing
- `llmConfigStore` — provider/model config

**Note:** Sub-stores and `settingsStore` overlap — changes in one don't update the other. `SettingsPanel` reads `settingsStore` exclusively.

## Dependencies

- **Requires**: `useAuthStore` (account tab), `useModelStore` (model catalog), `SecretManager` (API keys), `ToolGuardState` (agent mode), `LLMRouter` (default provider), `ShortcutsState` (hotkey)
- **Required by**: `LLMRouter` (provider, temperature, taskRouting), `ToolGuard` (agentMode, autoApprove), `UnifiedAgenticChat` (compactMode, agentMode), `VoiceInput` (voice settings), `MCPManager` (allowed directories), `AgentExecutor` (timeout, checkpointing)

## Known Gaps

1. **Store duplication**: `settingsStore` and sub-stores manage overlapping state without sync.
2. **No sync guarantee**: localStorage (Zustand) and disk (`settings.json`) can diverge.
3. **No `useSettings` hook**: `SettingsPanel` reads store directly with `useShallow`.
4. **BYOK keys not loadable**: `save_api_key` writes but no `get_api_key` command. UI can't verify saved keys.
5. **Settings v1 and v2 coexist**: Typed struct (`settings.rs`) vs key-value (`settings_v2.rs`) not unified.
6. **Web settings independent**: Web/desktop settings don't sync.

## Design Decisions

- **Dialog-based UI**: Full-screen Radix Dialog, not a routed page. Opens from anywhere without navigation.
- **Programmatic navigation**: `openSettings(tab)` deep-links to specific tab from error toasts, etc.
- **Disk + localStorage dual persistence**: localStorage for instant rehydration; disk for backup/inspection.
- **API keys never in localStorage**: All through `save_api_key` → SQLite AES-GCM. Enforced architecturally.
- **Agent mode mirrored in ToolGuard**: `set_agent_mode` updates Rust `ToolGuardState` immediately — no restart needed.
