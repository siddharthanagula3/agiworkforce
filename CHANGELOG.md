# Changelog

All notable changes to AGI Workforce Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### [0.2.0] - 2025-11-21 - Grand Unification Refactor

#### 🎨 Major UI/UX Overhaul

**The "Grand Unification"** - Complete architectural consolidation of the chat experience, inspired by Claude Desktop's minimalist aesthetic.

#### Added

- **Unified Chat Architecture**: Single store (`unifiedChatStore`) and single UI (`UnifiedAgenticChat`)
- **ID Translation Layer**: Client-side mapping between backend numeric IDs and frontend UUIDs (localStorage persistence)
- **Floating Input Area**: Claude Desktop-inspired centered input (`max-w-3xl mx-auto`) with backdrop blur
- **Agent Status Pill**: Floating status indicator above input showing current agent step/goal with animated Brain icon
- **Model Fallback System**: Automatic fallback to `openai/gpt-4o` when model is undefined (prevents "Assistant Not Replying" bug)
- **QuickModelSelector Integration**: AI-powered model recommendations now integrated into input area (bottom-right)
- **BudgetAlertsPanel Integration**: Token budget warnings now appear at top of chat stream

#### Changed

- **Layout**: Replaced 3-panel layout (sidebar + main + sidecar) with centered column layout
- **Header**: Simplified to "New Chat" button + minimal accessories (no branding clutter)
- **Thinking Indicator**: Changed from `<Sparkles>` to `<Brain className="animate-pulse">` with "Thinking..." text
- **Input Styling**: Applied floating physics (`rounded-2xl border-zinc-700/50 bg-zinc-800/90 backdrop-blur-xl`)
- **MissionControlPanel**: Updated to use `useUnifiedChatStore` instead of legacy `chatStore`

#### Removed

- **Legacy Components**: Deleted `ChatInterface.tsx` and `chatStore.ts` (hard cutover, no backward compatibility)
- **Test Files**: Removed obsolete test files for legacy components
- **3-Panel Complexity**: Removed sidebar navigation, sidecar panel, and drag resize handles
- **Input Clutter**: Already clean (no footer text, tool toggles, or visible token counters)

#### Technical Details

**Files Modified:**

- `apps/desktop/src/stores/unifiedChatStore.ts` - Added ID translation layer (lines 260-305)
- `apps/desktop/src/components/UnifiedAgenticChat/index.tsx` - Added model fallback, agent status pill, integrated components
- `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx` - Applied floating physics styling
- `apps/desktop/src/components/UnifiedAgenticChat/ChatMessageList.tsx` - Changed thinking indicator to Brain icon
- `apps/desktop/src/components/UnifiedAgenticChat/AppLayout.tsx` - Complete layout refactor to centered column
- `apps/desktop/src/components/MissionControl/MissionControlPanel.tsx` - Updated imports to unified store

**Files Deleted:**

- `apps/desktop/src/components/Chat/ChatInterface.tsx`
- `apps/desktop/src/stores/chatStore.ts`
- `apps/desktop/src/components/__tests__/ChatInterface.test.tsx`
- `apps/desktop/src/stores/__tests__/chatStore.test.ts`
- `apps/desktop/src/__tests__/stores/chatStore.test.ts`

**Files Migrated:**

- `apps/desktop/src/components/Chat/QuickModelSelector.tsx` → `apps/desktop/src/components/UnifiedAgenticChat/QuickModelSelector.tsx`
- `apps/desktop/src/components/Chat/BudgetAlertsPanel.tsx` → `apps/desktop/src/components/UnifiedAgenticChat/BudgetAlertsPanel.tsx`

#### Verification

- ✅ TypeScript: 0 errors (`pnpm typecheck` passed)
- ✅ ESLint: 0 errors, 0 warnings (`pnpm lint` passed)
- ✅ Backend compatibility: Uses same `chat_send_message` command

#### Critical Success Factors (All Achieved)

| Requirement                           | Status | Implementation                       |
| ------------------------------------- | ------ | ------------------------------------ |
| Input box floating & centered         | ✅     | `w-full max-w-3xl mx-auto mb-6`      |
| No footer instruction text            | ✅     | Already absent                       |
| "Thinking..." with Brain icon         | ✅     | `<Brain className="animate-pulse">`  |
| Assistant replies (backend connected) | ✅     | Model fallback to `gpt-4o`           |
| Model selector visible                | ✅     | QuickModelSelector in rightAccessory |
| No large title in header              | ✅     | Removed branding                     |
| QuickModelSelector integrated         | ✅     | Migrated to UnifiedAgenticChat       |
| BudgetAlertsPanel integrated          | ✅     | Added at top of ChatStream           |

---

## [0.1.0] - 2025-11-01

### Initial Beta Release

- Multi-LLM support (OpenAI, Anthropic, Google, Ollama)
- AGI system with 19 production tools
- Desktop automation via Windows UI Automation
- Browser control via Playwright
- MCP integration (1000+ tools)
- Real SSE streaming
- SQLite-backed conversation persistence

---

[Unreleased]: https://github.com/siddharthanagula3/agiworkforce-desktop-app/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/siddharthanagula3/agiworkforce-desktop-app/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/siddharthanagula3/agiworkforce-desktop-app/releases/tag/v0.1.0
