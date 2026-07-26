# AGI VS Code Extension — Volume 27 — Localization

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, and real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/src/extension.ts`, `apps/extension-vscode/src/core/commandSetup.ts`, `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts`, `apps/extension-vscode/src/memory/memoryTreeProvider.ts`, `apps/extension-vscode/src/features/model-picker/modelMetrics.ts`, `apps/extension-vscode/src/core/subsystemHealth.ts`, `packages/ui/design-tokens/src/index.ts`.

## Overview & stance

This volume defines how the AGI VS Code Extension handles text encoding, fonts, translation of its own UI, and date/number formatting. The surface is IDE-native and workspace-scoped, with three explicitly selected trust modes: Local, BYOK (Desktop/CLI/VS Code only), and Managed Cloud (public alpha, open by default for signed-in users). Localization is largely trust-mode-agnostic — it governs presentation, not routing — but two rules bind it: (1) locale, timezone, and language must be resolved from the **VS Code host** (`vscode.env.language`, host clock), never fetched from or leaked to the cloud gateway; and (2) any explicit, redacted handoff to app chat (`agi-workforce.sendToDesktop`, `syncContextToDesktop`) must not smuggle locale-derived PII (usernames in localized paths, timezone that fingerprints location) past the secret-scan/payload-preview gate. There is **no automatic app-chat sync** from this surface. Today the extension ships an English-only UI with locale-aware date/number formatting inherited from the host runtime; full translation is design intent, not shipped.

## Unicode

All extension surfaces must be UTF-8 end to end. The sidebar/chat webview declares `<meta charset="UTF-8" />` and `<html lang="en">` ✅ (`src/features/sidebar-webview/webviewContent.ts:71,73`). User- and model-supplied text is HTML-escaped before injection via `escapeHtml` (amp/lt/gt/quote/apostrophe) ✅ (`webviewContent.ts:15`), and markdown is rendered through the CSP-nonce'd markdown-it + DOMPurify bundle, so multibyte scripts, emoji, and combining marks render without breaking the CSP.

Requirements: never assume single-byte or fixed-width characters when truncating labels, computing context-line budgets, or slicing model output for previews — use code-point-aware operations so surrogate pairs (emoji, CJK extension planes) are not split. Filenames and workspace paths carrying non-ASCII must round-trip unchanged through the History and Context Files trees and through the localhost bridge frames.

Gap: there is no explicit Unicode **normalization** (NFC/NFKC) before comparison or hashing — no `String.prototype.normalize` call exists in `src/`. Path/identifier comparisons that mix NFC and NFD can miscompare. Canonical NFC normalization at ingest for paths, `@`-file mentions, and memory-fact keys is 🔭 Planned.

Label: 🟡 Partial — UTF-8 transport and HTML-escape are shipped (`webviewContent.ts`), but normalization and code-point-safe truncation are not audited.

## Fonts

The webview uses a system UI font stack `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` for body text ✅ (`webviewContent.ts:105`) and a monospace stack `'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace` for code and token readouts ✅ (`webviewContent.ts:570,828`). The Codicon icon font is bundled into the VSIX (`out/codicons/codicon.css`) and loaded under a `font-src ${cspSource}` CSP directive ✅ (`webviewContent.ts:59,80`). Shared font-family tokens are exported from `packages/ui/design-tokens/src/index.ts` and mirrored as `--chat-font-*` CSS variables ✅.

Requirements: for CJK, Arabic, Hebrew, Devanagari, and other scripts the extension must fall through to the OS/editor system font rather than force a Latin-only face; the current stacks already end in generic `sans-serif`/`monospace`, satisfying this. Editor-side rendering (inline completions, code lens, hover, inline diff) inherits the user's `editor.fontFamily` and must not be overridden. RTL bidi mirroring of the webview layout (`dir="rtl"` when the host locale is RTL) and self-hosted webfont bundling for offline Local mode are 🔭 Planned; today the webview hardcodes `lang="en"` and no `dir` attribute.

Label: ✅ Built for the font stacks and CSP-scoped icon font; 🔭 Planned for RTL/bidi layout and locale-driven font selection.

## Translation

The extension UI is **English-only** today. Command titles, chat-participant descriptions, configuration descriptions, and enum labels are hardcoded English strings in `apps/extension-vscode/package.json` (e.g. `"AGI Workforce: Open Chat"`, the `@agi` participant `sampleRequest` strings). There is **no** `package.nls.json`, no `package.nls.<locale>.json`, and no `l10n/` bundle (verified absent), and no `vscode.l10n.t(...)` calls in `src/` — so VS Code's display-language switch has no effect on AGI strings.

Requirements for the target state: adopt VS Code's native l10n pipeline — externalize manifest strings to `package.nls.json` with `%key%` placeholders and runtime strings via `vscode.l10n.t()` with an `l10n/` bundle; resolve the active language from `vscode.env.language`. Model output, code, and user content are **never** machine-translated — only the extension's own chrome (menus, prompts, status bar, error toasts) is localized. Provider/model names and IDs stay verbatim (IDs come only from `packages/contracts/types/src/models.json`). Pricing/upgrade copy must use the canonical ladder — Free / Basic $8 (₹399) / Pro $20 / Max $100 and $200 / Enterprise — and must not print INR for Pro/Max (TBD). Translation memory and pluralization (ICU MessageFormat) are 🔭 Planned.

Label: 🔭 Planned — no localization bundle exists; UI strings are hardcoded English in `package.json` and `src/`.

## Dates

Date and time rendering already delegates to the host locale and timezone via `Intl`-backed `Date` methods: `toLocaleDateString()` for conversation and context-file timestamps ✅ (`src/extension.ts:214`, `src/core/commandSetup.ts:81,1271`, `src/features/trees/conversationTreeProvider.ts:69`), `toLocaleString()` for memory facts and conversation detail ✅ (`src/memory/memoryTreeProvider.ts:26,29`, `src/core/commandSetup.ts:702,745`), and `toLocaleTimeString()` for subsystem-health entries ✅ (`src/core/subsystemHealth.ts:110`). Numeric formatting is locale-aware too: token counts render via `toLocaleString()` ✅ (`src/features/model-picker/modelMetrics.ts:174`).

Requirements: continue to use `toLocale*`/`Intl.*` with the host locale rather than hand-formatting dates; never hardcode `MM/DD/YYYY` or a fixed separator. Relative timestamps ("2h ago") in the History tree should use `Intl.RelativeTimeFormat` keyed to `vscode.env.language` (🔭 Planned). Persisted/synced records and bridge frames must store absolute UTC (ISO-8601) and localize only at render, so a chat authored in one timezone reads correctly on another device after Neon delta-sync — remembering that VS Code sessions stay workspace-scoped and do not auto-sync. Explicit timezone selection and `Intl.DateTimeFormat` option control are 🔭 Planned.

Label: 🟡 Partial — locale-aware formatting is shipped (`toLocaleString`/`toLocaleDateString`/`toLocaleTimeString`), but locale/timezone are implicit (host-derived) with no explicit override or relative-time formatting.

## Repository map

- `apps/extension-vscode/package.json` — manifest strings (command titles, participant, config descriptions); no NLS keys yet.
- `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` — charset, `lang`, font stacks, CSP `font-src`, HTML escaping.
- `apps/extension-vscode/src/extension.ts`, `src/core/commandSetup.ts` — date-label helpers.
- `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts`, `src/memory/memoryTreeProvider.ts`, `src/core/subsystemHealth.ts` — locale date/time rendering.
- `apps/extension-vscode/src/features/model-picker/modelMetrics.ts` — locale number formatting.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge (locale/PII must not leak past the redacted handoff gate).
- `packages/ui/design-tokens/src/index.ts` — shared font-family tokens.

## Competitor notes

Claude Code and Codex IDE extensions ship largely English-first developer chrome and localize dates via the editor/host; neither exposes a rich translation matrix, and both keep model output untranslated. AGI's deliberate divergence: (1) localization is **per-surface and host-driven** — the VS Code extension reads `vscode.env.language`/host clock and never round-trips locale through a provider; (2) because AGI is multi-provider with BYOK where allowed, model/provider names and catalog IDs are never localized or aliased away from `models.json`; (3) local-first — offline Local mode must render dates and (target) webfonts without any network call, unlike cloud-tethered assistants. AGI matches the baselines' pragmatic English-first launch while committing to VS Code-native `l10n` as the target rather than a bespoke i18n layer.

## Acceptance / Definition of Done

Production-ready when the UI resolves its display language from the VS Code host, all user-facing chrome is externalized (no hardcoded English in code paths shown to users), text is UTF-8 and NFC-normalized at ingest, code-point-safe truncation is enforced, and dates/numbers render via host-locale `Intl` with UTC persistence.

- [ ] Build: `package.nls.json` + `vscode.l10n.t()` wired; `pnpm --filter agi-workforce typecheck` and `test` green; no user-facing string literals outside the l10n bundle.
- [ ] Trust: locale/timezone derived only from the VS Code host; no locale value sent to or fetched from the cloud gateway; redacted handoff strips locale-derived PII before the payload-preview/consent gate.
- [ ] Security/i18n: UTF-8 verified across bridge frames and webview; NFC normalization on paths/mentions/memory keys; RTL layout verified for at least one RTL locale before claiming bidi support.

## Anti-patterns

- Hardcoding date/number formats (`MM/DD/YYYY`, `.` thousands) instead of `toLocale*`/`Intl.*`; storing local wall-clock instead of UTC in synced/persisted records.
- Machine-translating model output, code, or user content — only the extension's own chrome is localized.
- Fetching or transmitting the user's locale/timezone through the cloud gateway, or letting locale-derived PII cross the trust boundary without redaction.
- Claiming translation is shipped: there is no `package.nls`/`l10n` bundle — mark translation 🔭.
- Splitting surrogate pairs / combining marks when truncating labels; comparing paths without NFC normalization.
- Introducing removed tiers in upgrade/localization copy (no "Plus", `pro_plus`, or "Hobby"); localized copy must use current plans only, never invent INR pricing, and never offer top-ups.
- Hardcoding or inventing model IDs in any localized string (IDs come only from `packages/contracts/types/src/models.json`); referencing Supabase (fully migrated to Clerk + Neon + Stripe).
