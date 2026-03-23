# TODO

_Last updated: 2026-03-23_

## Build Status (verified 2026-03-21)

- cargo check: PASS
- cargo clippy -D warnings: PASS (0 warnings)
- pnpm typecheck:all: PASS (13/13 workspaces)
- pnpm lint: PASS (0 errors, 0 warnings)
- Web chat deployed: agiworkforce.com/chat

## Codebase Metrics (verified 2026-03-21)

- 1,447 Tauri commands, 1,866 invoke() calls, 1,104 unique wired (76%)
- 732 tauri-mock entries
- All IPC casing correct (0 violations)
- All shell commands safe (`.arg()` method)

---

## Web Chat Manual Test Report (2026-03-23)

Tested: `agiworkforce.com/chat` via Chrome browser automation.
Reference: Claude Desktop UI (`comp-claude-ui.md`), Claude/ChatGPT/Gemini patterns (`comp-chat-ui-patterns.md`), Option B plan (`docs/archive/2026-03-20-web-chat-option-b-plan.md`).
Decisions: Web = cloud-only SaaS. No BYOK. No local LLMs. No desktop-native features.

### P0 — Blocking (Must Fix)

- [ ] **WEB-001: Chat input disabled** — `runtime={null}` prevents sending. Need WebRuntime connecting to `api.agiworkforce.com/v1/chat/completions` SSE
- [ ] **WEB-002: Model selector broken** — "Select model" shows "Manage API Keys" button instead of inline model dropdown. Need inline picker like Claude.ai
- [ ] **WEB-003: BYOK API keys shown in web** — Settings > Models & Keys shows fields for Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Perplexity, OpenRouter, NVIDIA NIM. Web = cloud-only, hide entire section or replace with plan-based model list
- [ ] **WEB-004: Local LLM settings shown in web** — Settings > Models & Keys shows Local Models section with Auto/Local/Cloud toggle + Ollama URL. Must remove in web mode
- [ ] **WEB-005: Local/Cloud mode toggle in web** — Settings > General shows "Local (Free)" / "Cloud (Pro)" radio. Web should be locked to Cloud, hide toggle

### P1 — Important (Sidebar & Navigation)

- [ ] **WEB-006: Search click does nothing** — Should open search modal (Cmd+K style) to filter conversations
- [ ] **WEB-007: Customize shows stub dialog** — Shows "Settings managed by host application" instead of opening Settings > Customize tab. Note: Skills quick chip correctly opens full Settings
- [ ] **WEB-008: Chats click does nothing** — Should show conversation history in sidebar (grouped Today/Yesterday/Week)
- [ ] **WEB-009: Projects shows stub dialog** — Same stub as WEB-007. Should show projects list or open Settings > Account
- [ ] **WEB-010: Skills click does nothing** — Should open Settings > Customize. The Skills QUICK CHIP works correctly
- [ ] **WEB-011: Connectors shows stub dialog** — Same stub. Should open Settings > Apps & Integrations
- [ ] **WEB-012: Collapse sidebar doesn't work** — PanelLeft icon has no effect, sidebar stays expanded
- [ ] **WEB-013: Voice input does nothing** — Mic icon has no effect. Either hide or implement Web Speech API

### P2 — Settings Cleanup (Desktop-Specific Items in Web)

- [ ] **WEB-014: Hide desktop voice settings** — Settings > Voice shows "Local Whisper (offline)" + dictation hotkey (Option/Alt) — both desktop-only
- [ ] **WEB-015: Hide desktop data storage path** — Settings > Privacy shows `~/.local/share/agi-workforce/` — this is a desktop path, irrelevant in web
- [ ] **WEB-016: Hide MCP local config path** — Settings > Customize > MCP Tools shows `/mock/.mcp.json` — desktop-only concept
- [ ] **WEB-017: Cloud sync toggle confusing** — Settings > Privacy shows "Sync chat history to cloud" toggle — in web everything IS cloud already
- [ ] **WEB-018: Desktop notification toggle** — Settings > Notifications shows "Desktop Notifications" — in web should be "Browser Notifications" and use Notification API
- [ ] **WEB-024: Plan name inconsistency** — Account page shows "HOBBY" badge, Billing page shows "FREE" badge, sidebar shows "Hobby plan" — pick one and unify
- [ ] **WEB-025: Billing "Critical: 95% Usage" says 100% used** — Warning says "95% Usage Reached" but text says "100.0% of your 1M token limit" — math is wrong or threshold is wrong

### P3 — UX Polish

- [ ] **WEB-019: Quick chips only set placeholder** — Code/Write/Research/Web Search change input text but don't set system prompt context or mode
- [ ] **WEB-020: + menu "Take a screenshot" is desktop-only** — Needs screen capture API or should be hidden in web
- [ ] **WEB-021: User profile shows "Hobby plan"** — Should match Account page "HOBBY" badge styling consistently
- [ ] **WEB-022: No conversation list in sidebar** — Shows "No conversations yet" — correct when empty but need list after conversations exist
- [ ] **WEB-023: OAuth connector flows unverified** — Apps & Integrations shows 12+ connectors (Gmail, Calendar, Notion, Figma, Slack, etc.) with Connect buttons — need to verify OAuth redirects work

### Critical Codebase Finding: Two Sidebar Implementations

The deployed site (`agiworkforce.com/chat`) uses `packages/chat/src/components/Sidebar.tsx` (shared package).
But `apps/web/components/UnifiedAgenticChat/Sidebar.tsx` has a MORE FUNCTIONAL version with:

- Working Search (Cmd+K modal, client-side filtering)
- Working Collapse (Cmd+B toggle)
- Working Projects view switch
- Working Memory panel
- Working conversation list with archive/delete/pin/share/export

**Decision needed**: Should the deployed web chat use the UnifiedAgenticChat version instead of the shared package version?

### Codebase Audit: Real vs Mock (from code analysis agents)

**REAL in Desktop (All invoke Tauri backend)**:

- Voice: `voice_start_recording`, `speech_stop_and_transcribe`, wake word, global PTT, barge-in, Whisper/Piper model downloads
- Connectors: `mcp_connect_connector`, `mcp_disconnect_connector` + OAuth flow
- Settings: API key save via `McpClient.saveApiKey()`, clear data via `clear_local_database`
- File handling: Tauri file dialog (`@tauri-apps/plugin-dialog`), screen capture (`screen_capture_start`)
- Model selector: Zustand store persistence, backend sync at chat send time

**REAL in Web (browser APIs)**:

- Voice: Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) — works in Chrome
- File attachment: Browser file input + `navigator.mediaDevices.getDisplayMedia()` for screenshots
- Model selector: Loads from store, selection persisted to localStorage

**STUB/MOCK in Shared Package (packages/chat)**:

- Settings modal: Returns "Settings are managed by the host application" placeholder
- Sidebar Customize/Skills/Connectors: Dispatch `openSettings()` but nothing handles it in web
- Attachment menu: Drive/GitHub/project submenus have icons but no handlers
- UserProfile: `apps/web/components/layout/UserProfile.tsx` returns null (stubbed)

### Settings Sections: Real vs Mock Audit

| Section             | Status      | Notes                                                                           |
| ------------------- | ----------- | ------------------------------------------------------------------------------- |
| General             | MIXED       | Keybindings: REAL. Mode toggle: HIDE in web. Onboarding: needs test             |
| Account             | REAL        | Supabase auth, correct plan/email, cost tracking, Stripe billing                |
| Appearance          | REAL        | About You + Response Style sliders + Emoji toggle all persist                   |
| Privacy             | MIXED       | Export Data: needs test. Data Storage path: desktop-only. Cloud sync: confusing |
| Models & Keys       | HIDE IN WEB | BYOK + Local LLMs must not appear in cloud-only web                             |
| Agents              | REAL        | Approval timeout, timeout policy, stream inactivity all persist                 |
| Customize           | MOSTLY REAL | Skills/Plugins, MCP Tools (mock path), Research Defaults, Integrations          |
| Apps & Integrations | REAL        | 12+ OAuth connectors, search, categories, custom connector                      |
| Notifications       | REAL        | Desktop + Sound toggles persist                                                 |
| Voice               | MIXED       | Dictation hotkey + Local Whisper: desktop-only. Test Mic: real                  |

### Working Features (Verified)

- [x] Chat UI renders: sidebar, greeting ("Good evening, agiautomationllc"), input, chips
- [x] - button opens 10-item menu (matching Claude Desktop parity): files, screenshot, project, Drive, GitHub, Skills, Connectors, Research, Web search, Use style
- [x] Quick chips populate input: Code → "Help me write code for", Write → "Help me write", Research → "Research this topic in depth:", Web Search → "Search the web for"
- [x] Skills chip opens full Settings modal (10 sections all accessible)
- [x] Settings > Account: real Supabase data, HOBBY badge, cost tracking
- [x] Settings > Appearance: Name/Occupation/Context fields + 3 sliders + Emoji toggle
- [x] Settings > Agents: Timeout slider, auto-deny policy, stream inactivity
- [x] Settings > Apps & Integrations: 12+ OAuth connectors with Connect buttons
- [x] Dark theme consistent
- [x] "AI can make mistakes" disclaimer
- [x] "Download Desktop App" button in header
- [x] Keyboard shortcut hint (Shift+Cmd+O) on New Chat

---

## Resolved — Session 14 (8-Agent Bug Sweep, 2026-03-21)

- [x] ChatMessage type centralization — canonical type in `packages/types/src/chat.ts`, duplicates removed
- [x] CSP tightened in artifact renderers — documented security trade-offs, removed where possible
- [x] CSRF middleware added to API gateway — `X-Requested-With` header check on state-changing requests
- [x] `execute_code` env_vars blocklist — dangerous vars (LD_PRELOAD, PATH, etc.) filtered
- [x] API base URL consolidated — single config source in `apps/desktop/src/api/config.ts`
- [x] Embedding dimension — standardized, removed meaningless zero-padding
- [x] Pairing code pattern — aligned server and mobile validation
- [x] Billing dead endpoint — updated to correct API gateway path
- [x] Budget/iteration-limit events — added frontend listeners with toast notifications
- [x] MCP connector manifests — removed/fixed broken `@anthropic/*` references
- [x] Console.log cleanup — removed debug logging from 10 production files
- [x] useEffect cleanup — verified timer/listener cleanup in hooks
- [x] Prettier formatting — fixed 288 doc file warnings
- [x] VS Code ext README — fixed 6 inaccuracies
- [x] Chrome ext cookies permission — narrowed or removed overbroad permission
- [x] OAuth state token — added TTL expiration to state tokens
- [x] DB migration verified — `web_conversations` issue addressed
- [x] models.json unified — canonical copy in `packages/types/src/models.json`
- [x] Workspace analytics RLS — added team member access policies

## Resolved — Session 13 (17-Agent Audit, 2026-03-21)

- [x] Phantom model IDs (`gpt-5-pro`, `deepseek-r1`) fixed in modelRouter.ts
- [x] IPC wiring gap: 27% → 76% (added checkpoints, artifacts, analytics, memory, MCP)
- [x] ESLint false positives from `.vercel/` build artifacts (12,360 errors → 0)
- [x] Clippy errors in CLI crate (too_many_arguments, derivable_impls)
- [x] 10 `#[allow(dead_code)]` cleaned from desktop Rust backend
- [x] 13 invoke() calls in workflow.ts wrapped in try/catch
- [x] localStorage token storage removed from 7 web app files
- [x] postMessage wildcard origin documented with safety rationale
- [x] Web chat deployed at chat.agiworkforce.com (prebuilt Vercel deploy)

---

## Features to Build

### Sprint 2 — Web Chat (spec: `docs/specs/sprint-2-web-features.md`)

- [x] Web chat deployment (agiworkforce.com/chat via Vercel prebuilt)
- [x] Cloud web mode in tauri-mock.ts
- [x] SSE LLM proxy in API gateway
- [x] Feature-hide desktop-only UI in web build
- [ ] Inline numbered citations with source cards
- [ ] Design system refresh ("Obsidian Glass" tokens)
- [ ] Rich structured widgets (comparison, pricing, timeline, stats)
- [ ] SSE thinking tag parser (wire to ThinkingBlock)

### Backlog

- [ ] Projects with knowledge base (PRD #6 — RAG pipeline, pgvector)
- [ ] Deep Research mode (PRD #7 — Perplexity integration, progress UI)
- [ ] QR pairing reliability to 99%+
- [ ] Event-triggered agents (Cursor Automations pattern)
- [ ] MCP spec 2025-11-25 full compliance (Tasks, Elicitation, Bundles)
- [ ] Desktop code signing (macOS + Windows)
- [ ] Mobile Expo store configuration
- [ ] CLI distribution pipeline (install script, Homebrew)
- [ ] Chrome extension store submission prep
- [ ] Web SEO + analytics + Sentry setup
- [ ] EU AI Act compliance prep (August 2026)
