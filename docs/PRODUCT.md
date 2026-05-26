# AGI Workforce — Product Feature Map

Status: Current
Owner: Platform lead
Last updated: 2026-05-25

AGI Workforce is **Ollama + Claude combined** — a full AI application platform across 6 user-facing surfaces. Local-first is the user acquisition hook; the real product is a multi-provider AI suite rivaling Claude and ChatGPT with cross-surface continuity.

## Desktop App (Tauri v2 + React)

The primary surface. Like Claude Desktop + Ollama: a local compute host with a rich AI assistant.

### What users see and do

**Chat**: The main screen is a chat interface. Users type messages, select a model from the picker, and get streaming responses rendered with markdown, code blocks, and syntax highlighting. The chat supports conversation history, branching (fork a conversation at any message), and folders for organization. Messages are persisted to Neon PostgreSQL and survive page reloads.

**Model Picker**: A dropdown showing all available models from the catalog (`packages/types/src/models.json`). Models are grouped by provider (Anthropic, OpenAI, Google, DeepSeek, Perplexity, xAI, Ollama, LM Studio). Users can switch models mid-conversation. Local models (via Ollama/LM Studio) run entirely on the user's hardware — no data leaves the device.

**BYOK (Bring Your Own Key)**: In Settings, users enter their own API keys for cloud providers. The app uses these keys directly — AGI never sees the plaintext keys. This is the explicit trust boundary: local mode uses no keys, BYOK mode uses the user's keys with full consent.

**Projects**: Users create projects to organize work. Each project has a name, description, instructions (system prompt), knowledge files (uploaded docs that provide context), and an accent color. Projects are shared across surfaces via the web API.

**Artifacts**: When the model generates code, documents, or visualizations, they appear as inline artifacts with preview, copy, and edit controls. Artifacts render in a sandboxed iframe (cross-origin via `sandbox.agiworkforce.com`) so generated code cannot access user cookies or tokens. Publishing artifacts shares them via a link.

**Computer Use**: The model can see the screen, click, type, and browse the web on the user's behalf. On macOS, this uses Accessibility APIs; on Windows, UI Automation. Linux support uses `xdotool` for active window detection (implemented in this session). The user must grant explicit permission.

**MCP (Model Context Protocol)**: Users connect external tool servers that extend the model's capabilities — database queries, API calls, file operations, etc. The MCP client is built into the desktop app and manages server lifecycle.

**Skills**: Pre-built prompt templates users can browse and select. When a skill is selected, its body is injected as a system message before the user's prompt. Skills are loaded progressively (list first, body on demand).

**Memory**: The model remembers user preferences and context across conversations. Memory entries are stored and can be searched, edited, or deleted.

**Settings**: Privacy mode (Local/BYOK/Cloud), model defaults, appearance (dark/light theme), keyboard shortcuts, notification preferences, and billing/subscription management.

**Teams**: Scaffold for inviting collaborators with role-based access (admin/editor/viewer). Governance controls for enterprise.

**Updater**: In-app update notifications via an UpdatePill in the sidebar. Shows changelog and downloads the update.

### Implementation

- Frontend: React 19 + Vite, 1,185 .ts/tsx files in `apps/desktop/src/`
- Backend: Rust (Tauri v2) in `apps/desktop/src-tauri/`, ~650 IPC commands
- State: Zustand stores with local persistence
- Tests: 143 test files, 1,758 tests passing

---

## Web App (Next.js 16)

Account management, billing, and cloud chat. Like claude.ai.

### What users see and do

**Landing Page** (`/`): Marketing site with feature overview, pricing tiers, download links for desktop and mobile, and a cloud waitlist signup. Dark/light theme support.

**Sign Up / Login**: Clerk OAuth — users sign in with Google, GitHub, or email. No password-based auth. Session managed via secure cookies.

**Web Chat** (`/chat`): A chat interface similar to the desktop app but running in the browser. Messages stream from cloud-hosted models. Conversations are persisted to Neon PostgreSQL. The chat supports reactions, bookmarks, folders, shortcuts, and branching (all backed by DB tables added during this session).

**Conversations Sidebar**: Lists past conversations sorted by last activity. Search across conversation titles and message content. Folders for organization. Pagination (50 conversations per page, messages capped at 100 with offset support).

**Projects** (`/projects`): Create and manage projects with knowledge files. CRUD operations with auth, CSRF protection, and input validation. File uploads stored in Vercel Blob.

**Billing** (`/billing`): Stripe-powered subscription management. Users see their current plan (Local Free, BYOK, Hobby, Pro, Max), credit balance, usage analytics by provider, and invoice history. Credit deduction happens during LLM calls via `/api/usage/deduct`. The "Manage Billing" button opens the Stripe Customer Portal. Checkout and credit top-up are CSRF-protected and rate-limited.

**Settings** (`/settings`): Account profile, routing preferences (preferred providers/models), team management (invite/remove/update members), organization settings, API key management (create/revoke), 2FA/TOTP setup, activity logs, and audit trails.

**Admin Console** (`/admin`): Enterprise controls — SSO configuration, directory sync (SCIM scaffold), security settings. Bearer-token and cookie-session auth supported.

**Download** (`/download`): Platform-specific installer links for Desktop (macOS DMG, Linux AppImage) and Mobile (App Store, Play Store).

**Skills Browser** (`/skills`): Browse available skills with progressive loading. Select a skill to use it in chat.

### Implementation

- Framework: Next.js 16 App Router with Turbopack
- Auth: Clerk (OAuth, no passwords)
- Database: Neon PostgreSQL (25 migrations, parameterized queries)
- Payments: Stripe (checkout, webhooks, portal, credit system)
- Security: CSP nonce-based, CSRF on all state-changing POSTs, rate limiting via Upstash Redis
- API Routes: 100+ endpoints across chat, billing, projects, settings, admin, agents, skills, media, messaging, schedules, memory, devices
- Tests: 173 test files, 3,574 tests passing

---

## Mobile App (Expo 55 + React Native)

On-device AI with local inference. Like Ollama mobile + Claude's chat interface.

### What users see and do

**Onboarding**: First-launch flow with model selection. Users can pick from available local models via a ModelPickerSheet. If a model isn't downloadable yet, the app shows honest status instead of fake progress.

**Chat**: Full chat interface with streaming responses. Supports both local models (via `llama.rn` / ExecutorTorch for on-device inference) and cloud models (via BYOK keys). Same message types and rendering as desktop/web.

**Model Picker**: Switch between local and cloud models. Catalog-driven from `packages/types/src/models.json`.

**Biometric Lock**: Face ID / Touch ID / fingerprint unlock. MMKV encrypted storage with biometric key derivation. The app gates all data access behind biometric verification — no data is readable until unlock succeeds.

**Memory**: RAG-based retrieval using character trigram feature hashing (384-dim vectors, implemented this session). Memory search returns semantically relevant context rather than just position-based chunks.

**Settings**: Privacy mode, model defaults, integrations, permissions. 14 stores migrated to `rehydrateWhenMmkvReady` pattern for race-condition-free MMKV hydration.

**Offline Mode**: Local models work without network. An OfflineBanner component shows network status. Cloud features gracefully degrade.

**Profile**: User profile with conversation count, message count, and agent count derived from local store data.

**Cloud Bridge**: InviteCodeModal for cloud waitlist access. Users enter an invite code to join the managed cloud beta.

### Implementation

- Framework: Expo 55 + React Native 0.83
- Navigation: Expo Router with Drawer (iPad permanent, iPhone slide-out) + Tabs
- Local LLM: llama.rn + react-native-executorch
- Storage: MMKV (encrypted, biometric-gated)
- Tests: 79 suites, 1,117 tests passing, 28 snapshots

---

## CLI (Rust + Ratatui TUI)

Developer terminal tool. Like Claude Code: an AI coding assistant in the terminal.

### What users see and do

**REPL**: Run `agi` to enter an interactive chat. Type prompts, get streaming responses with syntax-highlighted code blocks in the terminal.

**Task Execution**: Run commands with a permission system. The CLI evaluates the full command string (not just the program name) before granting permission. Shell metacharacters trigger strict mode — no fallback to program-only matching.

**Hooks**: 32 hook events (PreToolUse, PostToolUse, SessionStart, SessionEnd, UserPromptSubmit, AfterMessage, etc.). Users configure hooks to run custom shell commands on specific events. PreToolUse can block or stop tool execution.

**Permissions**: Allow/deny commands with session persistence. Cached permissions evaluate whole-command before program fallbacks. Unsafe suffixes are rejected.

**MCP**: Connect Model Context Protocol servers for external tool integration.

**Multi-Agent**: Task registry for parallel agent orchestration. Multiple agents can work on independent tasks simultaneously.

**TUI**: Ratatui-based terminal UI with 8 modules: color, cost_hud, icons, shimmer, terminal_palette, markdown_renderer, tui_app, widgets.

**Quota**: Displays remaining credit balance fetched from `/api/llm/v1/credits/balance` when authenticated. Falls back to `AGI_QUOTA_REMAINING_PCT` env var if offline.

### Implementation

- Language: Rust (166 .rs files in `apps/cli/src/`)
- TUI: Ratatui
- Model catalog: `include_str!` embeds `models.json` at compile time
- Tests: 1,480 tests passing (cargo test)
- Hooks: 32 events, CI-verified fire sites

---

## Chrome Extension (MV3)

Browser context capture and native bridge to desktop.

### What users see and do

**Side Panel**: A chat interface in the browser sidebar. Users chat with the AI while browsing, with page context automatically available.

**Page Capture**: Extract the current page's content (text, links, structure) for AI context. Uses `innerText` (not `outerHTML`) to avoid XSS.

**Native Messaging Bridge**: TCP connection to the desktop app on port 8787. HMAC-SHA256 session authentication. Auto-reconnect with exponential backoff (1s→30s, 8 attempts).

**Popup**: Quick actions menu from the extension icon.

**Options**: Extension settings page for configuring the bridge port and preferences.

### Implementation

- Manifest: MV3, minimum Chrome 132
- CSP: `style-src 'self'` (no unsafe-inline), `connect-src` restricted to bridge + known origins
- Permissions: 11 declared, all verified in use (activeTab, tabs, storage, nativeMessaging, etc.)
- Tests: 38 files, 853 tests passing

---

## VS Code Extension

IDE integration with chat participant and commands.

### What users see and do

**@agi Chat Participant**: Type `@agi` in the VS Code chat panel to get AI responses with full code context from the workspace.

**420+ Commands**: Explain code, fix bugs, refactor, generate tests, create documentation, code review, memory management, model switching — all accessible via Command Palette (`Cmd+Shift+A`).

**Desktop Bridge**: WebSocket connection to the desktop app at `ws://127.0.0.1:8787/ws`. Auth handshake with token validation.

**Model Picker**: Switch between providers and models. Capability tier annotations (economy/balanced/flagship) guide selection. Catalog-driven from `@agiworkforce/types`.

**Inline Completions**: AI-powered code completions as you type.

### Implementation

- Activation: `onStartupFinished` + `onChatParticipant:agiworkforce.agi`
- Build: esbuild → `out/extension.js`
- Tests: 32 files, 562 tests passing
- Type safety: 3 `as any` suppressions (all in guard/test code)

---

## Shared Infrastructure

**packages/types**: Canonical TypeScript types and model catalog (`models.json`). All surfaces import model IDs from here — never hardcoded.

**packages/unified-chat**: Shared chat UI components used by Desktop and Web. ArtifactPanel, ProjectHeader, message rendering.

**packages/providers**: 8 provider adapters (Anthropic, OpenAI, Google, DeepSeek, Perplexity, xAI, Ollama, LM Studio). SDK-based, implementing the `@agiworkforce/llm-normalize` contract.

**packages/data-layer**: Database adapter factory. Default provider: Neon. Supports Supabase (legacy), Postgres (stub).

**Sandbox** (`apps/sandbox`): Cross-origin artifact renderer at `sandbox.agiworkforce.com`. Single `index.html` (303 lines) with strict CSP (`connect-src 'none'`, `form-action 'none'`). Receives artifacts via `postMessage` from parent. Provides security isolation so generated code cannot access user tokens.

**services/api-gateway**: Backend API orchestration with model routing, tier-based access control, and cloud chat proxy.

**services/signaling-server**: WebRTC connection signaling for peer-to-peer features.

---

## Security Architecture

- **Auth**: Clerk OAuth (web/desktop/mobile). CLI uses OAuth PKCE flow. Extensions use desktop bridge token.
- **CSRF**: All state-changing POST/PUT/DELETE endpoints require CSRF token. Desktop-token endpoint protected (added this session).
- **Rate Limiting**: Upstash Redis-backed. Per-endpoint limits. Sensitive endpoints (auth, checkout, 2FA) have strict limits.
- **Sandbox Isolation**: Artifacts render in cross-origin iframe. CSP blocks exfiltration.
- **Trust Boundaries**: Local → BYOK requires explicit fork with consent. Managed Cloud is waitlist-gated.
- **Data at Rest**: TOTP secrets encrypted with AES-256-GCM. Waitlist emails hashed with SHA-256. API keys stored as SHA-256 hashes with prefix display.
- **SQL Injection**: Zero instances found in audit. All queries use parameterized placeholders ($1, $2).
