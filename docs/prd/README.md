# AGI Workforce — Platform PRDs

> Written: 2026-03-09 | Last updated: 2026-03-15
> Total: ~34,300 lines across 8 platform-specific PRDs
> Product status: **Public Alpha**

Each PRD follows a 13-section template (Executive Summary, Platform Requirements, Feature Matrix, Screen-by-Screen UI Spec, Component Architecture, Data Flow & API Connections, Platform-Specific Capabilities, Build/Deploy/Distribution, Testing Strategy, Performance Requirements, Security, Accessibility, Competitive Analysis).

## Current Codebase Metrics (as of 2026-03-15)

| Metric | Value |
| --- | --- |
| Total LOC | ~973K (345K Rust, 379K TS, 249K TSX) |
| Build status | cargo check PASS, cargo clippy PASS (0 warnings), tsc --noEmit PASS, pnpm lint 0 errors |
| Vitest tests (desktop) | 1,460 tests passing |
| Rust tests | 3,267 tests passing |
| Tauri commands registered | 1,042 |
| LLM provider adapters | 12+ (Bedrock not yet implemented) |
| AI Skills | 169 across 23 categories |
| MCP transports | stdio, SSE, streamable HTTP |

## PRD Index

| #   | Platform          | File                                                 | Lines  | Summary                                                                                                                                                |
| --- | ----------------- | ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | macOS Desktop     | [PRD-MACOS.md](PRD-MACOS.md)                         | ~6,043 | Tauri v2 desktop app for macOS — universal binary, DMG distribution, AXUIElement accessibility, Keychain integration, system tray, global hotkey       |
| 2   | Windows Desktop   | [PRD-WINDOWS.md](PRD-WINDOWS.md)                     | ~6,013 | Tauri v2 desktop app for Windows — WiX/NSIS installer, UI Automation, Credential Manager, SmartScreen, high-DPI scaling, taskbar integration           |
| 3   | Linux Desktop     | [PRD-LINUX.md](PRD-LINUX.md)                         | ~4,575 | Tauri v2 desktop app for Linux — AppImage distribution, X11/Wayland support, libsecret, D-Bus notifications, no direct competitor (uncontested market) |
| 4   | Web Application   | [PRD-WEB.md](PRD-WEB.md)                             | ~3,591 | Next.js 16 web app — marketing, auth, billing, browser-based chat, 23 routes, 70+ API endpoints, Supabase auth, Stripe billing                         |
| 5   | Chrome Extension  | [PRD-BROWSER-EXTENSION.md](PRD-BROWSER-EXTENSION.md) | ~3,391 | Manifest V3 browser extension — page context capture, form autofill, DOM automation, native messaging bridge to desktop, side panel chat               |
| 6   | iOS Mobile        | [PRD-IOS.md](PRD-IOS.md)                             | ~3,651 | React Native + Expo iOS app — QR pairing with desktop, live agent dashboard, push approval/denial, Dynamic Island, WidgetKit, Siri Shortcuts           |
| 7   | Android Mobile    | [PRD-ANDROID.md](PRD-ANDROID.md)                     | ~3,793 | React Native + Expo Android app — QR pairing, FCM notifications, Material You, Quick Settings tile, lock screen approve/deny actions                   |
| 8   | VS Code Extension | [PRD-VSCODE.md](PRD-VSCODE.md)                       | ~3,269 | VS Code extension — multi-model AI coding assistant, sidebar chat, agent mode, inline diff, @-mention file context, 20+ commands                       |

## Design Document

- [8-Platform PRDs Design](../plans/2026-03-09-8-platform-prds-design.md) — 13-section template and approach
- [8-Platform PRDs Implementation Plan](../plans/2026-03-09-8-platform-prds.md) — Task breakdown and quality gates
