# 8-Platform PRDs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Write 8 comprehensive, SDLC-grade PRDs — one per platform — covering every screen, component, interaction, wording, API connection, and build pipeline.

**Architecture:** 8 parallel sub-agents (one per PRD), each reading the codebase + existing PRD.md + competitor research, then writing a complete platform PRD to `docs/prd/PRD-<PLATFORM>.md`. All PRDs follow the 13-section template defined in `docs/plans/2026-03-09-8-platform-prds-design.md`.

**Tech Stack:** Markdown docs, existing codebase (`apps/desktop`, `apps/web`, `apps/mobile`, `apps/extension`, `apps/extension-vscode`, `services/`), `docs/PRD.md` as baseline.

---

## Pre-Flight Checklist

- [ ] `docs/prd/` directory exists
- [ ] Design doc saved at `docs/plans/2026-03-09-8-platform-prds-design.md`
- [ ] Existing `docs/PRD.md` readable (3888 lines of baseline)
- [ ] All 8 source app directories exist

---

## EXECUTION NOTE

**All 8 tasks below are INDEPENDENT and MUST be dispatched in parallel** using a single message with 8 simultaneous Agent tool calls (subagent_type: general-purpose). Each agent writes one PRD. Do NOT run them sequentially.

---

## Task 1: PRD-MACOS.md — macOS Desktop

**Output:** `docs/prd/PRD-MACOS.md`
**Target length:** ~8,000 lines

**Agent instructions:**

Read these files first (in parallel):

- `docs/PRD.md` (full — all 3888 lines)
- `apps/desktop/src/components/` (directory listing + key component files)
- `apps/desktop/src-tauri/src/lib.rs` (command registrations)
- `apps/desktop/src-tauri/src/sys/commands/` (directory listing)
- `apps/desktop/src/stores/` (all store files)
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/Cargo.toml`

Then write `docs/prd/PRD-MACOS.md` following the 13-section template. Cover:

**Section 4 must include every screen:**

- Onboarding flow (welcome → API key setup → model selection → first chat)
- Main chat interface (sidebar, conversation list, message area, composer)
- Agent mode (goal input, execution timeline, tool approval dialogs, progress view)
- Settings (General, Models, API Keys, MCP Tools, Voice, Security, Account, Billing)
- Computer Use (screen capture preview, action plan, execution feedback)
- Voice Input overlay (Wispr-style: hold hotkey → record → release → transcribe)
- Background Agents panel (list, status, pause/resume/cancel)
- Skill Marketplace (grid, categories, install/uninstall)
- Multi-agent Swarm view (node graph, task assignment, progress)
- System tray menu (macOS-specific: icon, quick actions, status)
- Model Comparison panel (side-by-side outputs)
- Research panel (web research progress, citations, report)
- Canvas/Artifacts (code artifacts, image artifacts, document artifacts)
- Tool History / Audit Log
- Scheduling panel (create/edit/list scheduled tasks)
- Notifications panel
- Onboarding tips/hints overlay

**macOS-specific capabilities to cover:**

- Universal binary (Apple Silicon + Intel)
- DMG distribution + Notarization
- AXUIElement accessibility tree
- NSUserNotification for system notifications
- macOS Keychain for secret storage fallback
- Menu bar icon + tray menu (right-click actions)
- `cmd+space`-style global hotkey for quick invoke
- Sparkle auto-updater (or Tauri updater)
- macOS-specific keyboard shortcuts (Cmd+N, Cmd+T, etc.)
- Full Disk Access permission request flow
- Accessibility permission request flow (for computer use)
- macOS `open` command fallback for Navigate action

**Competitor analysis section must cover:**

- Claude Desktop (macOS) — features, UI patterns, gaps
- Claude Cowork — VM-based agent, what it does better, what AGI Workforce surpasses
- ChatGPT Desktop — feature comparison
- Perplexity Computer — connector ecosystem comparison

**Component architecture must list:**

- Every component in `apps/desktop/src/components/` directory
- Which Zustand store each component reads from
- Which Tauri commands each component calls

---

## Task 2: PRD-WINDOWS.md — Windows Desktop

**Output:** `docs/prd/PRD-WINDOWS.md`
**Target length:** ~7,000 lines

**Agent instructions:**

Read these files first (in parallel):

- `docs/PRD.md` (sections 1-3 especially)
- `apps/desktop/src-tauri/Cargo.toml` (Windows-specific deps: `windows` crate)
- `apps/desktop/src-tauri/src/automation/` (directory listing)
- `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/src/components/` (directory listing)

Write `docs/prd/PRD-WINDOWS.md` following the 13-section template. The Windows PRD should:

1. Reference the macOS PRD for features that are identical across both desktop platforms
2. Focus in depth on Windows-specific differences:

**Windows-specific capabilities:**

- WiX MSI installer (.exe) + Authenticode signing
- UI Automation (UIA) element tree (replaces AXUIElement)
- Windows Notification Center (`windows-notify` or `tauri-plugin-notification`)
- Windows Credential Manager / DPAPI for keychain fallback
- Windows-specific keyboard shortcuts (Ctrl+N, Win+hotkey, etc.)
- System tray (notification area) icon + jump list
- Taskbar progress indicator (for background agents)
- Windows Registry entries (auto-start, file associations)
- Windows Defender / SmartScreen interaction (first-run warning flow)
- UAC prompt handling for privileged operations
- Win32 clipboard API
- DirectX/GDI screen capture (xcap on Windows)
- PowerShell execution policy considerations for shell commands
- Windows-specific paths (`%APPDATA%`, `%LOCALAPPDATA%`, etc.)
- High-DPI / scaling support (Windows display scaling 100-300%)

**Windows-unique UI behaviors:**

- Title bar styling (custom vs native Windows chrome)
- Right-click context menus (Windows shell integration)
- File drag-and-drop with Windows Explorer
- Alt+Tab integration
- Windows dark mode detection and application

**Competitor analysis:**

- Claude Desktop for Windows (launched Feb 10, 2026) — feature parity status
- ChatGPT Windows app
- Windows-only tools (PowerToys comparison)

---

## Task 3: PRD-LINUX.md — Linux Desktop

**Output:** `docs/prd/PRD-LINUX.md`
**Target length:** ~5,000 lines

**Agent instructions:**

Read these files first:

- `docs/PRD.md` (sections 1-2, platform targets section)
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs`
- `.github/workflows/` (any CI workflow files)

Write `docs/prd/PRD-LINUX.md` following the 13-section template. Focus on:

**Linux-specific distribution:**

- AppImage format (self-contained, no install required)
- Ed25519 signature verification for AppImage
- Snap / Flatpak / AUR packaging (roadmap)
- `.desktop` file for application menu integration

**Linux-specific capabilities:**

- X11 vs Wayland display server support
- `wmctrl` / `xdotool` for window management (with injection fix from ground truth sprint)
- libsecret / GNOME Keyring for secret storage
- D-Bus notifications (libnotify)
- XDG base directory spec (`~/.config`, `~/.local/share`, `~/.cache`)
- AppArmor/SELinux considerations for accessibility and shell access
- `libclang` requirement for SQLCipher (build dependency)
- Linux screen capture via XCB/XRandR
- No Authenticode — Ed25519 signature on AppImage instead

**Linux user profile (different from macOS/Windows users):**

- Developer-heavy audience
- CLI-comfortable, may prefer keyboard-first
- Privacy-focused, likely to use local models (Ollama, LM Studio)
- May use tiling window managers (i3, Sway, Hyprland)

**Distributions tested:**

- Ubuntu 22.04 LTS / 24.04 LTS (primary target)
- Fedora 39+
- Debian 12+
- Arch Linux (AUR package roadmap)

**No direct competitor** — this is a gap we own entirely. Document why this matters.

---

## Task 4: PRD-WEB.md — Web Application

**Output:** `docs/prd/PRD-WEB.md`
**Target length:** ~6,000 lines

**Agent instructions:**

Read these files first (in parallel):

- `docs/PRD.md` (section 4: Web Application)
- `apps/web/app/` (directory listing of all routes)
- `apps/web/components/` (directory listing)
- `apps/web/lib/` (supabase, stripe, csrf, cors files)
- `apps/web/middleware.ts`
- `apps/web/features/` (directory listing)
- `apps/web/stores/` (directory listing)
- `apps/web/app/api/` (directory listing of all API routes)

Write `docs/prd/PRD-WEB.md` following the 13-section template. Cover:

**All web pages/routes (screen-by-screen):**

- `/` — Marketing homepage (hero, features, pricing preview, CTA)
- `/login` — Login page (email/password, Google OAuth, magic link)
- `/signup` — Registration (name, email, password, terms acceptance)
- `/dashboard` — User dashboard (usage stats, recent conversations, quick actions)
- `/chat` — Web-based chat (similar to desktop chat but in browser)
- `/pricing` — Pricing page (Free/Hobby/Pro/Max/Team/Enterprise tiers)
- `/download` — Download page (macOS/Windows/Linux installers)
- `/features/agents` — Feature landing page for agents
- `/features/ai-skills` — Feature landing page for skills
- `/features/plugins` — Feature landing page for plugins
- `/features/tools` — Feature landing page for tools
- `/docs` — Documentation landing
- `/settings` — Web account settings (profile, billing, API keys, connected apps)
- `/workforce` — Workforce/team dashboard
- `/workforce/[employeeId]` — Individual AI employee page

**All API routes:**

- `POST /api/chat` — Chat completion proxy
- `POST /api/completion` — Ghost-text prompt completion
- `GET/POST /api/auth/*` — Supabase auth routes
- `POST /api/autotag` — Auto-tag conversations
- `POST /api/voice` — Voice transcription
- `POST /api/media` — Media generation
- `GET /api/models` — Model catalog endpoint
- `POST /api/llm/v2/*` — LLM proxy routes
- `GET/POST /api/marketplace/*` — Skill marketplace
- `GET/POST /api/workforce/*` — Workforce management

**Auth & billing flows:**

- Full Supabase auth flow (signup → verify email → dashboard)
- Stripe checkout flow (select plan → Stripe checkout → success/failure)
- Subscription management (upgrade/downgrade/cancel)
- Usage dashboard (token usage, cost breakdown, limits)

**Competitor analysis:**

- claude.ai — UI patterns, features, what they do well
- chatgpt.com — comparison
- perplexity.ai — comparison

---

## Task 5: PRD-BROWSER-EXTENSION.md — Chrome Browser Extension

**Output:** `docs/prd/PRD-BROWSER-EXTENSION.md`
**Target length:** ~3,500 lines

**Agent instructions:**

Read these files first (in parallel):

- `apps/extension/manifest.json`
- `apps/extension/src/` (all source files — background.js, content.js, side_panel/)
- `apps/desktop/src-tauri/src/integrations/native_messaging/` (desktop bridge)
- `docs/PRD.md` (section 5: Services & Extensions)

Write `docs/prd/PRD-BROWSER-EXTENSION.md` following the 13-section template. Cover:

**Extension architecture:**

- Manifest V3 structure
- Service Worker (background.js) — responsibilities, lifecycle
- Content Script (content.js) — DOM injection, page context capture
- Side Panel UI — full screen-by-screen spec
- Native Messaging bridge to desktop app

**All UI surfaces:**

- Extension popup (toolbar icon click) — chat input, quick actions, status
- Side Panel (persistent panel) — full chat interface in browser sidebar
- Content script overlay — text selection → "Ask AGI Workforce" tooltip
- Options page — extension settings
- Context menu items (right-click on page, selected text, images)

**DOM automation features:**

- Page context capture (selected text, full page, visible area)
- Form autofill (job applications, forms)
- DOM reading and element interaction
- Job board integration (LinkedIn, Indeed, etc.)

**Native messaging bridge:**

- How content script communicates with desktop app
- Message format and routing
- Security (origin validation, allowlist)
- Fallback when desktop app not running

**Chrome-specific:**

- Manifest permissions required and why
- chrome.storage.session for API key (from ground truth fix)
- Chrome Web Store submission requirements
- CSP in extension context

**Competitor:**

- Claude Browser Extension — feature comparison, UI comparison

---

## Task 6: PRD-IOS.md — iOS Mobile Application

**Output:** `docs/prd/PRD-IOS.md`
**Target length:** ~5,000 lines

**Agent instructions:**

Read these files first (in parallel):

- `apps/mobile/` (directory listing)
- `apps/mobile/stores/authStore.ts`
- `apps/mobile/services/` (all service files)
- `apps/mobile/lib/secureStorage.ts`
- `apps/mobile/package.json`
- `docs/PRD.md` (any mobile sections)

Write `docs/prd/PRD-IOS.md` following the 13-section template. Cover:

**All screens (screen-by-screen):**

- Splash screen + onboarding flow (4-5 onboarding slides)
- Login / Sign up screens
- Home screen / conversation list
- Chat screen (message bubbles, composer, attachment, voice)
- Agent control screen (live agent dashboard — approve/deny tool calls remotely)
- QR pair screen (scan QR to pair with desktop)
- Settings screen (profile, notifications, connected desktop, subscription)
- Voice input screen (push-to-talk, Siri Shortcuts)
- Notification handling (background agent updates, approval requests)
- Widget (iOS home screen widget — quick message or agent status)

**iOS-specific capabilities:**

- expo-secure-store for token storage (with >2KB chunking fix)
- React Native + Expo framework
- Siri Shortcuts integration
- iOS Share Extension (share page/text to AGI Workforce)
- Push notifications via APNs
- Background fetch for agent status updates
- Face ID / Touch ID for app lock
- iOS 17+ Dynamic Island (agent running indicator)
- Haptic feedback for approvals/denials
- Home screen widgets (WidgetKit via Expo)

**Mobile-first UX patterns:**

- Bottom sheet modals (not full-screen dialogs)
- Swipe to dismiss / swipe actions on list items
- Pull to refresh
- Infinite scroll for conversation history
- Bottom tab navigation vs stack navigation
- Safe area insets (notch, home indicator)
- Keyboard avoidance behavior
- Dark mode support (follows system)

**QR Pairing flow (killer feature):**

- Full flow: open desktop → QR shown → open mobile → scan → paired
- Paired state: live agent dashboard visible on phone
- Approval flow: agent wants to execute tool → push notification → tap Approve/Deny
- Real-time sync via WebSocket (signaling server)

**Competitor:**

- Claude iOS App — screenshots/UI description, feature comparison
- Claude Remote Control feature ($100-$200/mo Max tier)
- Why AGI Workforce's mobile approach is differentiated

**App Store submission:**

- Bundle ID, capabilities, entitlements
- Privacy manifest requirements (iOS 17+)
- App Store screenshots spec (6.7", 6.1", iPad 12.9")
- Review guideline considerations

---

## Task 7: PRD-ANDROID.md — Android Mobile Application

**Output:** `docs/prd/PRD-ANDROID.md`
**Target length:** ~4,500 lines

**Agent instructions:**

Read these files first (in parallel):

- `apps/mobile/` (same as iOS — shared codebase)
- `apps/mobile/stores/authStore.ts`
- `apps/mobile/services/` (all service files)
- `apps/mobile/lib/secureStorage.ts`
- `apps/mobile/package.json`

Write `docs/prd/PRD-ANDROID.md` following the 13-section template. The Android PRD should:

1. Reference the iOS PRD for shared features
2. Focus deeply on Android-specific differences:

**Android-specific capabilities:**

- expo-secure-store on Android (Keystore-backed)
- FCM (Firebase Cloud Messaging) for push notifications
- Android-specific Share intent
- Home screen widgets (Glance API via Expo)
- Back gesture navigation (Android 13+ predictive back)
- Material You / Material 3 design language adaptation
- Android 12+ notification permission request flow
- `android:exported` considerations for deep link handling
- Play Store submission requirements
- Side-loading / APK distribution (for enterprise/beta)

**Android-specific UX:**

- Floating action button patterns
- Bottom navigation bar (vs iOS tab bar)
- Android-specific gesture navigation (swipe from edge)
- Notification channels for different alert types
- Quick Settings tile (agent status)
- Lock screen notification with approve/deny actions

**Android versions supported:**

- Minimum: Android 8.0 (API 26)
- Target: Android 14+ (API 34)
- Test matrix: Pixel 6, Samsung Galaxy S24, OnePlus 12

**Play Store submission:**

- Target SDK, permissions justification
- Data safety form answers
- App content rating
- Google Play screenshots spec

---

## Task 8: PRD-VSCODE.md — VS Code Extension

**Output:** `docs/prd/PRD-VSCODE.md`
**Target length:** ~3,500 lines

**Agent instructions:**

Read these files first (in parallel):

- `apps/extension-vscode/` (full directory listing)
- `apps/extension-vscode/src/services/agentStatus.ts`
- `apps/extension-vscode/src/services/modelCatalog.ts`
- `apps/extension-vscode/package.json` (if exists — check for VS Code extension manifest)
- `docs/PRD.md` (sections on VS Code)

Write `docs/prd/PRD-VSCODE.md` following the 13-section template. Cover:

**Extension architecture:**

- Extension manifest (`package.json` contributions)
- Extension host process responsibilities
- Webview panel (chat UI rendered in VS Code)
- Language server integration (if applicable)
- File system access via VS Code API

**All VS Code UI surfaces:**

- Activity bar icon (sidebar entry point)
- Primary sidebar panel — chat interface
- Secondary sidebar panel — agent status
- Status bar item (model name + cost + agent running indicator)
- Editor gutter decorations (AI-suggested changes)
- Inline diff view (accept/reject AI edits)
- Minimap annotations
- Command palette commands (full list with keyboard shortcuts)
- Context menu items (right-click in editor, file explorer)
- Quick Pick inputs (model picker, command picker)
- Progress notification (agent running)
- Error/info notifications

**All commands (command palette):**

- `AGI Workforce: New Chat`
- `AGI Workforce: Ask About Selection`
- `AGI Workforce: Explain Code`
- `AGI Workforce: Fix Error`
- `AGI Workforce: Write Tests`
- `AGI Workforce: Refactor Selection`
- `AGI Workforce: Switch Model`
- `AGI Workforce: Open Settings`
- `AGI Workforce: Start Agent`
- `AGI Workforce: View Agent History`
- `AGI Workforce: Compare Models`
- `AGI Workforce: Insert Snippet`

**VS Code settings (contributes.configuration):**

- All user-configurable settings with types, defaults, descriptions
- Workspace vs user scope

**@-mention file reference system:**

- Type `@filename` in chat to attach file context
- Type `@folder` to attach directory tree
- Type `@selection` to reference current selection
- Fuzzy search for file completion

**Keybindings:**

- Default keybindings for all commands
- macOS vs Windows/Linux variants

**Competitor analysis:**

- Claude Code VS Code Extension — feature comparison, UI patterns
- GitHub Copilot Chat — comparison
- Cline / Roo Code — comparison
- Cursor — comparison (noting Cursor is a fork, not an extension)

**VS Code Marketplace submission:**

- Publisher setup
- Extension icon + banner
- README requirements
- Changelog format
- Marketplace category tags

---

## Post-Writing Tasks

### Task 9: Create PRD Index

**Output:** `docs/prd/README.md`

Write a concise index file listing all 8 PRDs with:

- One-sentence platform summary
- Link to each PRD
- Date written
- Estimated page count

### Task 10: Commit All PRDs

```bash
git add docs/prd/
git add docs/plans/2026-03-09-8-platform-prds-design.md
git add docs/plans/2026-03-09-8-platform-prds.md
git commit -m "docs: add 8 platform PRDs covering all deployment targets

Comprehensive SDLC-grade PRDs for:
- macOS Desktop (Tauri v2, ~8000 lines)
- Windows Desktop (Tauri v2, ~7000 lines)
- Linux Desktop (Tauri v2, ~5000 lines)
- Web Application (Next.js 16, ~6000 lines)
- Chrome Browser Extension (MV3, ~3500 lines)
- iOS Mobile (React Native/Expo, ~5000 lines)
- Android Mobile (React Native/Expo, ~4500 lines)
- VS Code Extension (~3500 lines)

Each PRD covers: UI spec (every screen/component/interaction),
feature matrix, data flow, platform capabilities, build pipeline,
testing strategy, security, accessibility, and competitive analysis."
```

---

## Quality Gates (each PRD must pass before committing)

- [ ] Has all 13 sections
- [ ] Section 4 (UI spec) covers every screen with component inventory + exact wording
- [ ] Section 6 (Data Flow) lists every API call with request/response shapes
- [ ] Section 7 covers all platform-native capabilities
- [ ] Section 13 (Competitive Analysis) covers the primary competitor for that platform
- [ ] No placeholder text like "TBD" or "coming soon" — write the full spec
- [ ] Minimum 3,000 lines for focused platforms, 6,000 for desktop platforms
