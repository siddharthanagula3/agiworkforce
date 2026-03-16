# 8-Platform PRDs — Design Document

> **Status**: Approved for implementation (2026-03-09)
> **Owner**: Product Team

---

## Problem

AGI Workforce has a monolithic `docs/PRD.md` covering architecture and some feature specs, but no platform-specific PRDs. Engineering, design, and investors have no single source of truth that answers "how does this exact platform work, screen by screen, button by button?"

---

## Goal

Create 8 comprehensive, SDLC-grade Product Requirements Documents — one per deployment platform — that serve as the complete build blueprint for each platform. An engineer with no prior context should be able to build the entire platform from the PRD alone.

---

## The 8 Platforms

| #   | File                                | Platform                 | Competitor                    |
| --- | ----------------------------------- | ------------------------ | ----------------------------- |
| 1   | `docs/prd/PRD-MACOS.md`             | macOS Desktop            | Claude Desktop + Cowork       |
| 2   | `docs/prd/PRD-WINDOWS.md`           | Windows Desktop          | Claude Desktop for Windows    |
| 3   | `docs/prd/PRD-LINUX.md`             | Linux Desktop            | No direct competitor          |
| 4   | `docs/prd/PRD-WEB.md`               | Web Application          | claude.ai / chatgpt.com       |
| 5   | `docs/prd/PRD-BROWSER-EXTENSION.md` | Chrome Browser Extension | Claude Browser Extension      |
| 6   | `docs/prd/PRD-IOS.md`               | iOS Mobile               | Claude iOS App                |
| 7   | `docs/prd/PRD-ANDROID.md`           | Android Mobile           | Claude Android App            |
| 8   | `docs/prd/PRD-VSCODE.md`            | VS Code Extension        | Claude Code VS Code Extension |

---

## Section Template (All 8 PRDs)

### 1. Executive Summary

- Platform vision & competitive positioning
- Target users for this platform
- Key differentiators over competitors
- Non-negotiable requirements
- Success metrics

### 2. Platform Requirements

- OS/runtime requirements (minimum version, hardware)
- Distribution format (DMG, EXE, AppImage, App Store, Chrome Web Store)
- Framework & tech stack
- Feature flags applicable to this platform

### 3. Feature Matrix

- Complete feature list with P0/P1/P2/P3 priority
- Implementation status per feature
- Platform-exclusive features (not available elsewhere)
- Feature parity table vs competitors

### 4. Screen-by-Screen UI Specification

For EVERY screen and modal:

- Screen name, route/path, purpose
- Layout description (sidebar, main area, header, footer)
- Component inventory (every button, input, label, icon, tooltip)
- Exact copy/wording for labels, placeholders, error messages, empty states
- Interaction flows (user clicks X → Y happens)
- Navigation paths (how user arrives, where they can go)
- State variations (empty, loading, error, success, locked/gated)
- Platform-specific behavior (keyboard shortcuts, right-click menus, etc.)

### 5. Component Architecture

- Full component tree/hierarchy for the platform
- Shared components vs platform-specific
- State management (Zustand stores, props, events)
- TypeScript interfaces for key data models

### 6. Data Flow & API Connections

- Every backend call (Tauri IPC / REST / WebSocket)
- Request/response shapes for each call
- Auth & session management
- Offline behavior
- Real-time sync (if applicable)

### 7. Platform-Specific Capabilities

- OS-native integrations (system tray, notifications, shortcuts, widgets)
- Hardware access required (camera, mic, clipboard, accessibility)
- Platform permissions model
- Deeplink/URL scheme handling

### 8. Build, Deploy & Distribution

- Build pipeline steps
- Code signing & notarization
- Auto-update mechanism
- Store submission checklist (if applicable)
- CI/CD workflow file reference

### 9. Testing Strategy

- Unit test targets by module
- Integration test scenarios
- E2E test scenarios
- Platform-specific test matrix (OS versions, screen sizes)

### 10. Performance Requirements

- Cold start time target
- Memory footprint budget
- Battery impact budget (mobile)
- Bundle size target
- Rendering performance (60fps animations)

### 11. Security

- Platform threat model
- Secret storage mechanism
- Permission enforcement
- Data at rest / in transit
- Platform-specific CVE mitigations

### 12. Accessibility

- Screen reader support (VoiceOver / TalkBack / NVDA / JAWS)
- Keyboard-only navigation map
- Color contrast requirements (WCAG AA)
- Touch target sizes (mobile)
- Platform a11y APIs used

### 13. Competitive Analysis

- Feature-by-feature comparison table
- Competitor UI patterns (described)
- Where AGI Workforce leads
- Where parity is needed
- Strategic gaps to own

---

## Audience

**Hybrid** — each PRD is self-contained with:

- An executive summary readable by product/investors (non-technical)
- Full technical detail readable by engineers (screens, APIs, components)

---

## Approach

All 8 PRDs written in parallel using specialized sub-agents. Each agent:

1. Reads the existing `docs/PRD.md` for shared context
2. Reads platform-specific source code
3. Researches competitor products
4. Writes the full PRD to `docs/prd/PRD-<PLATFORM>.md`

Estimated output: ~45,000 lines total across all 8 PRDs.
