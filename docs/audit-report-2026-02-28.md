# AGI Workforce — Full Codebase Audit Report
**Date**: 2026-02-28
**Auditors**: 5-agent parallel team (research, web, desktop, extension, mobile)
**Scope**: apps/web, apps/desktop, apps/extension, apps/extension-vscode, apps/mobile
**Competitive baseline**: Claude Code, Claude Desktop / Cowork, Claude.ai, ChatGPT, Gemini, Perplexity Computer

---

## Executive Summary

The codebase is **architecturally sound and production-quality** across all five apps. Code quality is excellent (0 `any` types in desktop, 0 `@ts-ignore`, comprehensive test coverage on web). The main risks are:

1. **Two critical mobile bugs** that break the #1 killer differentiator (QR desktop pairing)
2. **Stale model catalog** (missing GPT-4o, GPT-4.5, Gemini 2.0) — users cannot select current flagship models
3. **Massive competitive feature gap** vs Claude Cowork, ChatGPT, and Gemini — 8 P0-level missing features

---

## Part 1: Bug & Code Quality Findings

### 🔴 CRITICAL

| # | App | File | Issue | Fix |
|---|-----|------|-------|-----|
| C1 | mobile | `app/_layout.tsx` | **No deep linking config** for `agiw://` scheme — QR pairing fails if app is closed/backgrounded. The `scheme: "agiworkforce"` in app.json is defined but never consumed in the root layout's `linking` object | Add `Linking.addEventListener` + `initialURL` handling in root `_layout.tsx`. Use expo-router's `<ExpoRoot linking={linkingConfig} />` |
| C2 | mobile | Global | **No Android hardware back button handler** — users are hard-exiting the app instead of navigating back. No `BackHandler` from `react-native` found anywhere | Add `BackHandler.addEventListener('hardwareBackPress', ...)` in root layout or nav container |
| C3 | desktop | `src/constants/llm.ts` | **Missing current flagship models**: GPT-4o, GPT-4.5, Gemini 2.0 Flash, Gemini 2.0 Pro — users cannot select these even with valid API keys | Add model entries to `MODEL_METADATA` map (see model spec below) |
| C4 | web | `app/error.tsx:16` | **`console.error('Application error:', error)`** in production error boundary — leaks stack traces and internal error details. Should route to error reporting service | Replace with Sentry/LogRocket `captureException(error)` call |

### 🟠 HIGH

| # | App | File | Issue |
|---|-----|------|-------|
| H1 | mobile | `stores/connectionStore.ts:~80-120` | 5 `any` types in WebRTC event handlers (`icecandidate`, `datachannel`, `onmessage`, `setupDataChannel` param). Breaks type safety for the pairing system. Use `RTCPeerConnectionIceEvent`, `RTCDataChannelEvent`, `MessageEvent` |
| H2 | mobile | `app/(app)/settings/index.tsx:19` | `icon: any` on `SettingRow` prop — use `React.ComponentType<{ size?: number; color?: string }>` or Lucide icon type |
| H3 | desktop | Missing feature | **No share conversation link** — Claude Desktop has this; no endpoint or UI found |
| H4 | desktop | Missing feature | **No conversation branching/forking** — Claude Desktop allows forking from any message |
| H5 | extension-vscode | `package.json` | `activationEvents: ["onStartupFinished"]` — activates on EVERY VS Code startup. Adds latency for all users regardless of whether they use AGI extension. Should scope to `onLanguage`, `onCommand` |
| H6 | web | `next.config.ts` | `style-src 'unsafe-inline'` in CSP — required for Tailwind + Radix but allows style injection. Document nonce migration plan |

### 🟡 MEDIUM

| # | App | File | Issue |
|---|-----|------|-------|
| M1 | mobile | `components/ui/bottom-sheet.tsx`, `AddMemorySheet.tsx`, `ModelPickerSheet.tsx`, `PlatformSetupSheet.tsx` | Sheet refs typed as `any` — use `BottomSheetModal` ref type from `@gorhom/bottom-sheet` |
| M2 | mobile | Global | **No crash reporting** — no Sentry, no Crashlytics, no expo-updates error tracking. Production crashes are invisible |
| M3 | desktop | `src/components/` | Component memoization inconsistent — `Sidebar.tsx` uses `memo<>` correctly but 100+ other components may be missing it. Run React DevTools Profiler on UnifiedAgenticChat tree |
| M4 | desktop | `src/components/Settings/` | **Theme selector not in SettingsPanel** — theme context and toggle exist (DesktopShell line 82-85) but no dedicated settings tab. Users can't control theme from Settings |
| M5 | desktop | `src/components/Settings/` | **Global hotkeys config has no UI** — `globalHotkeyPreferences` exists in settingsStore but no panel to configure it |
| M6 | web | `app/**/*.tsx` | 49 `'use client'` directives — audit for components that can be server components. Reduces hydration payload |
| M7 | mobile | `app/(app)/companion/index.tsx` | **Agent dashboard UI is a stub** — `AgentDashboard` component referenced but not implemented. Phase 6 blocker |
| M8 | mobile | `app/(app)/` | **No pinning UI** for conversations — `pinned: boolean` exists in schema and types but no swipe/long-press action to pin |

### 🟢 LOW

| # | App | File | Issue |
|---|-----|------|-------|
| L1 | web | Various | 71 `console.log` instances — mostly in tests, production impact minimal (only C4 is critical) |
| L2 | mobile | `app.json` | Android `READ_EXTERNAL_STORAGE` permission may be broader than needed for SDK 33+; use `READ_MEDIA_IMAGES` instead |
| L3 | extension-vscode | Missing | No inline ghost-text completions (`InlineCompletionItemProvider`) — planned in Phase 7 |
| L4 | extension-vscode | Missing | No terminal integration — planned in Phase 8 |
| L5 | extension-vscode | Missing | No MCP server integration — planned in Phase 9 |
| L6 | extension-vscode | Missing | No desktop bridge (WebSocket to AGI Workforce app) — planned in Phase 9 |
| L7 | mobile | Global | `expo-updates` not installed — no OTA update capability. Users must re-download from App Store for every patch |
| L8 | mobile | Global | No VoiceOver (iOS) / TalkBack (Android) accessibility implementation — no ARIA roles, no screen reader support |
| L9 | mobile | `stores/connectionStore.ts` | No background disconnect handling for WebRTC signaling — connection drops when app is backgrounded |

### ✅ PASSED (Excellent)

| App | Area | Result |
|-----|------|--------|
| web | Auth (Supabase SSR) | `getUser()` + token verification on all protected routes ✅ |
| web | 59 API routes | Comprehensive CSRF, rate limiting, Zod validation ✅ |
| web | Secrets | No hardcoded keys, proper env management ✅ |
| web | TypeScript | Strict mode, 116 tests ✅ |
| web | `dangerouslySetInnerHTML` | All 5 uses are safe (JSON-LD + nonce) ✅ |
| desktop | TypeScript | 0 `: any`, 0 `as any`, 0 `@ts-ignore` across 715 files ✅ |
| desktop | Zustand stores | 40+ stores with v5 patterns, devtools + persist + subscribeWithSelector ✅ |
| desktop | Chat features | Edit, regenerate, copy, bookmark, react, TTS, pin, archive, search, export ✅ |
| desktop | Settings UI | 8 comprehensive tabs ✅ |
| extension | Chrome MV3 | Manifest V3, service worker with keepalive, type-safe message passing ✅ |
| extension | Native messaging | Proper reconnect, exponential backoff, timeout management ✅ |
| extension | Content script safety | Blocklist for event handlers + dangerous URL attrs, no eval() ✅ |
| extension | VS Code chat participant | Streaming, slash commands, error handling, secrets storage ✅ |
| extension | VS Code webview | Nonce-based CSP, bidirectional postMessage, disposable cleanup ✅ |
| mobile | Expo SDK | SDK 52 (current), all packages up to date ✅ |
| mobile | FlashList | Correct usage with estimatedItemSize and memoized renderItem ✅ |
| mobile | Auth | MMKV persistence, token refresh, Apple + Google + email ✅ |
| mobile | Streaming | SSE with abort controller, delta updates, error fallback ✅ |
| mobile | WebRTC | react-native-webrtc installed and integrated ✅ |
| mobile | QR Scanner | Fully implemented with flash, fallback, animated scan line ✅ |

---

## Part 2: Competitive Gap Analysis

### What Competitors Launched (Jan–Feb 2026)

| Competitor | New Launch | Our Status |
|-----------|-----------|-----------|
| **Claude Cowork** (Jan 30) | Agentic task execution, Office add-ins, enterprise plugins, Windows support | No equivalent shipped |
| **Claude Desktop** (Jan 2026) | MCP Apps — interactive UIs (Figma, Amplitude, Canva, Slack etc.) rendered inside chat via MCP iframes | Not implemented |
| **Claude Desktop** | Connectors GUI — graphical setup for Google Drive, Gmail, Salesforce etc. | Planned (105 connectors) but no GUI shipped |
| **Claude Code** (v2.1) | Agent Teams (peer-to-peer multi-agent coordination), resumable subagents, context fork, skill hot-reload | Swarm exists but no peer messaging or shared task lists |
| **ChatGPT** | Agent Mode — virtual browser, navigates websites, fills forms autonomously | Browser automation exists, not polished into agent flow UX |
| **ChatGPT** | Canvas — collaborative document editing, version control, export | Not implemented |
| **ChatGPT** | Recurring task scheduling | Not implemented |
| **Perplexity Computer** | Long-running autonomous workflows (hours/months), 19-model orchestration | Session-bound only |
| **Gemini** | Deep Research with Workspace integration (Gmail, Drive, Sheets context) | Not implemented |

### P0 Gaps — Build Immediately

| Gap | Why P0 | Effort |
|-----|--------|--------|
| **1. Connectors GUI (Phase 1: 10 connectors)** | All major competitors have this. 105-connector plan exists — just needs the OAuth flow UI and `ConnectorCard` component. Without this, MCP tools are invisible to non-technical users | M (2 weeks) |
| **2. MCP Apps — in-chat interactive UI** | Claude Desktop's biggest Jan 2026 launch. Renders third-party app UIs (charts, forms, dashboards) inside chat via sandboxed iframes through MCP. This is the paradigm shift from "chat + tools" to "AI operating system" | L (3-4 weeks) |
| **3. Agentic task UX (Cowork-style)** | Agent runtime exists but there's no user-facing "Create Task" → "Schedule" → "Monitor" flow. Need to surface `autonomous_mode` + `scheduler` as a clean task management UI | M (2 weeks) |
| **4. Canvas / Document workspace** | ChatGPT Canvas and Gemini Canvas are setting user expectations. Inline code execution, document editing, visualization rendering. Our Artifacts panel is limited | L (3-4 weeks) |
| **5. Fix mobile QR pairing (C1+C2)** | This is our #1 differentiator claim ("only competitor with mobile companion"). It's broken for Android and for cold-start iOS. Fix today | S (1 day) |

### P1 Gaps — Build Next Quarter

| Gap | Notes |
|-----|-------|
| **Deep Research mode** | Multi-step autonomous web research with citations. ChatGPT, Gemini, Perplexity all have this. Our research module exists in `core/research/` — needs a UI surface |
| **Task scheduling (recurring/cron)** | `core/scheduler/` exists in Rust. Needs frontend: task creation form, schedule picker, task monitor/history view |
| **Lifecycle hooks** | Claude Code's PreToolUse/PostToolUse hooks are a killer feature for power users. Need hook configuration UI + backend support |
| **Memory management UI** | ChatGPT lets users search, edit, delete memories. We need a Memory panel in Settings |
| **Granular permission rules** | ToolGuard is binary. Need per-tool allow/deny/ask rules configurable by user |
| **Enterprise plugin marketplace** | Private plugin repos, admin provisioning, per-department plugins |
| **Dynamic model routing per subtask** | Auto-select best model for each sub-task (reasoning task → o3, vision → GPT-4o, etc.) |
| **Artifacts panel (interactive)** | Claude's artifacts run code, render visualizations. We need proper sandboxed iframe execution |

### P2 Gaps — Backlog

| Gap | Notes |
|-----|-------|
| Context fork / isolated branches | Claude Code v2.1 feature |
| Skill hot-reload | Requires restart currently |
| Audio Overviews from research | Gemini feature — research → audio podcast |
| Office add-in (Excel/PowerPoint) | Claude Cowork feature |
| Headless/SDK mode for CI/CD | Claude Code `-p` flag |
| Agent Teams with peer messaging | Claude Code Agent Teams |

---

## Part 3: Quick Fix List (Under 1 Day Each)

These are all fixable immediately without architectural changes:

### Fix 1: Mobile deep linking (C1) — 2 hours
```tsx
// apps/mobile/app/_layout.tsx
import * as Linking from 'expo-linking';

const linking = {
  prefixes: [Linking.createURL('/'), 'agiworkforce://', 'agiw://'],
  config: {
    screens: {
      '(app)': {
        screens: {
          'companion/pair': 'pair/:code',
        },
      },
    },
  },
};

// Pass to ExpoRoot or use with expo-router
```

### Fix 2: Android back button (C2) — 1 hour
```tsx
// apps/mobile/app/(app)/_layout.tsx
import { BackHandler } from 'react-native';
import { useRouter } from 'expo-router';

useEffect(() => {
  const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
    if (router.canGoBack()) {
      router.back();
      return true;
    }
    return false;
  });
  return () => subscription.remove();
}, [router]);
```

### Fix 3: Model catalog additions (C3) — 30 minutes
Add to `src/constants/llm.ts` `MODEL_METADATA`:
```typescript
// GPT-4o
'gpt-4o': { name: 'GPT-4o', provider: 'openai', contextWindow: 128000, inputCost: 2.50, outputCost: 10.00, vision: true, streaming: true },
// GPT-4.5
'gpt-4.5-preview': { name: 'GPT-4.5', provider: 'openai', contextWindow: 128000, inputCost: 75.00, outputCost: 150.00, vision: true, streaming: true },
// Gemini 2.0 Flash
'gemini-2.0-flash': { name: 'Gemini 2.0 Flash', provider: 'google', contextWindow: 1048576, inputCost: 0.075, outputCost: 0.30, vision: true, streaming: true },
// Gemini 2.0 Pro
'gemini-2.0-pro-exp': { name: 'Gemini 2.0 Pro (Exp)', provider: 'google', contextWindow: 2097152, inputCost: 0, outputCost: 0, vision: true, streaming: true },
```

### Fix 4: Production console.error (C4) — 30 minutes
```tsx
// apps/web/app/error.tsx
// Replace: console.error('Application error:', error)
// With (if Sentry installed):
import * as Sentry from '@sentry/nextjs';
Sentry.captureException(error);
// Or at minimum: remove the console.error entirely
```

### Fix 5: VS Code activation scope (H5) — 15 minutes
```json
// apps/extension-vscode/package.json
"activationEvents": [
  "onLanguage:javascript",
  "onLanguage:typescript",
  "onLanguage:python",
  "onLanguage:rust",
  "onCommand:agi.startChat",
  "onView:agiWorkforce"
]
```

### Fix 6: WebRTC any types (H1) — 1 hour
```typescript
// apps/mobile/stores/connectionStore.ts
import {
  RTCPeerConnectionIceEvent,
  RTCDataChannelEvent,
  RTCDataChannel,
} from 'react-native-webrtc';

pc.addEventListener('icecandidate', (event: RTCPeerConnectionIceEvent) => { ... });
pc.addEventListener('datachannel', (event: RTCDataChannelEvent) => { ... });
function setupDataChannel(channel: RTCDataChannel) { ... }
channel.onmessage = (event: MessageEvent<string>) => { ... };
```

---

## Part 4: AGI Workforce Strengths to Protect & Amplify

These are genuine competitive advantages — do not sacrifice them for speed:

1. **Multi-LLM routing (9+ providers)** — Nobody else does this. Claude=Claude only, ChatGPT=OpenAI only. We route to all. Make this the hero feature on the landing page.
2. **Desktop automation suite** — Screen capture, input simulation, browser control, OCR, computer use. More comprehensive than any competitor.
3. **140 AI skills with domain routing** — More domain coverage than Claude Cowork plugins (enterprise only) or ChatGPT GPTs.
4. **Mobile companion with QR pairing** — Once fixed (C1+C2), this is truly unique. No competitor has desktop→mobile live approval flow.
5. **Local-first + BYOK** — Privacy, no subscription lock-in, cost control. Vs. Perplexity Computer at $200/month.
6. **MCP protocol support** — Already implemented. Claude Desktop's connector GUI is just a UX wrapper over MCP. We're technically ahead, just need the GUI.
7. **Open architecture** — Not a walled garden. Hackable, extensible, community-friendly.

---

## Part 5: Prioritized Action Plan

### Sprint 1 — This Week (Blockers)
1. ✅ Fix C1: Mobile deep linking for QR pairing
2. ✅ Fix C2: Android back button handler
3. ✅ Fix C3: Add GPT-4o, GPT-4.5, Gemini 2.0 Flash/Pro to model catalog
4. ✅ Fix C4: Remove production console.error from error.tsx
5. ✅ Fix H5: Scope VS Code activation events
6. ✅ Fix H1: WebRTC any types in connectionStore.ts

### Sprint 2 — Next 2 Weeks (Competitive Parity)
7. Connectors GUI — OAuth flow + ConnectorCard for Phase 1 (Gmail, Drive, Notion, Slack, GitHub)
8. Agentic task UX — "Create Task" → schedule → monitor flow surfacing core/scheduler
9. Theme selector + hotkeys config UI in desktop Settings panel

### Sprint 3 — Next Month (Market Differentiation)
10. MCP Apps — sandboxed iframe rendering of MCP server UIs in chat
11. Canvas/Document workspace — inline code execution, document editing
12. Deep Research mode — surface core/research/ as a user-facing feature
13. Memory management UI — search/edit/delete memories in Settings
14. Mobile Phase 5: Voice input UI (record button, waveform)
15. Mobile Phase 6: Complete agent dashboard + WebRTC agent state sync

### Sprint 4 — Quarter (Enterprise & Power Features)
16. Task scheduling UI (cron-like recurring tasks)
17. Lifecycle hooks (PreToolUse/PostToolUse)
18. Granular permission rules per tool
19. Enterprise plugin marketplace
20. Dynamic model routing per subtask type

---

## Appendix: File Reference Map

| Finding | File Path |
|---------|-----------|
| C1 deep linking | `apps/mobile/app/_layout.tsx` |
| C2 back button | `apps/mobile/app/(app)/_layout.tsx` |
| C3 model catalog | `apps/desktop/src/constants/llm.ts` |
| C4 console.error | `apps/web/app/error.tsx:16` |
| H1 WebRTC any | `apps/mobile/stores/connectionStore.ts:80-120` |
| H2 icon any | `apps/mobile/app/(app)/settings/index.tsx:19` |
| H5 activation | `apps/extension-vscode/package.json` activationEvents |
| M3 memoization | `apps/desktop/src/components/` (audit with React Profiler) |
| M4 theme UI | `apps/desktop/src/components/Settings/SettingsPanel.tsx` |
| M5 hotkeys UI | `apps/desktop/src/components/Settings/SettingsPanel.tsx` |
| M7 agent dashboard | `apps/mobile/app/(app)/companion/index.tsx` |
| M8 pin UI | `apps/mobile/app/(app)/` conversation list |
| Rust fixes | `docs/rust-fixes-needed.md` (B1, B2, B3, Stream G pending) |
