# AGI CLI — Volume 27 — Localization

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), the nearest surface rules in `apps/cli/AGENTS.md`, and verified CLI source: `apps/cli/Cargo.toml`, `apps/cli/src/agent/mod.rs`, `apps/cli/src/mcp/mod.rs`, `apps/cli/src/voice.rs`, `apps/cli/src/lib.rs`, `apps/cli/src/memory_pipeline.rs`, `apps/cli/src/approval_audit.rs`, and the TUI render/truncation paths under `apps/cli/src/tui/`.

## Overview & stance

Localization on AGI CLI is a **rendering, encoding, and formatting** concern — it must never move a trust boundary. The three modes are fixed: Local (`local_only`), BYOK (Desktop/CLI/VS Code only), and Managed Cloud. Locale inputs (`LANG`, `LC_*`, terminal capabilities) are read from the **local environment only**; discovering that a user's terminal is `ja_JP.UTF-8` or that their clock is `Asia/Kolkata` is a device-local fact that stays on the device. Any localization step that would require inference — e.g. LLM-driven UI translation or transliteration — is bound by the same privacy gate as every other model call: a Local session cannot silently send strings to a BYOK or Managed provider, and `validate_privacy_boundary` (`apps/cli/src/agent/mod.rs`) blocks it. Speech-to-text language selection (voice mode) is a **non-LLM engine** setting and is exempt from the `models.json` model-ID rule, but it is grounded in real source and referenced rather than re-listed. This volume covers Unicode, terminal encodings, dates, time zones, numbers, and translation, and labels each per the mandatory Built/Partial/Planned scheme.

## Unicode

Rust `String`/`&str` are UTF-8 by construction, so the CLI carries text as well-formed UTF-8 end to end — model I/O, file reads, transcript cells, and JSONL events. **✅ Built** (language-level; the entire `apps/cli/src/` surface). Terminal rendering runs through Ratatui/crossterm, and display-width–aware measurement uses `Line::width()` in several places (e.g. `apps/cli/src/tui/cost_hud.rs`, `apps/cli/src/tui/tui_app.rs`), which honors East Asian wide characters.

The gap is **truncation**: many widgets measure by `chars().count()` (Unicode scalar count), not display columns or grapheme clusters — `apps/cli/src/tui/transcript_cell.rs`, `apps/cli/src/tui/tui_app.rs`, `apps/cli/src/tui/markdown_renderer.rs`, and pickers under `apps/cli/src/tui/widgets/` (`model_picker.rs`, `command_popup.rs`, `diff_review.rs`). For CJK, wide emoji, or combining sequences this can under- or over-fill a line. **🟡 Partial** — target is a single width helper (display columns + grapheme segmentation) applied to every truncation site; there is currently no direct `unicode-width`/`unicode-segmentation` dependency in `apps/cli/Cargo.toml` (width comes transitively via Ratatui). Right-to-left shaping/bidi in the TUI is **🔭 Planned**.

## Terminal Encodings

The CLI assumes a UTF-8 terminal and writes UTF-8 bytes to stdout/stderr. Locale environment variables are treated as first-class child-process context: the MCP client explicitly forwards `LANG`, `LC_ALL`, and `LC_CTYPE` to spawned MCP servers (`apps/cli/src/mcp/mod.rs`), so downstream tools inherit the user's encoding. **✅ Built** for passthrough. Active detection of a non-UTF-8 terminal (legacy `latin-1`, Windows code pages, GBK) with transcoding or a graceful degraded-glyph mode is **🔭 Planned**; today output on a non-UTF-8 `LC_CTYPE` may mojibake. Requirement: on startup, sniff `LC_ALL`/`LC_CTYPE`/`LANG`; if the charset is not UTF-8, emit one advisory line and fall back to ASCII-safe box glyphs rather than corrupting the frame. This is a pure local-render decision and involves no network or provider selection.

## Dates

`chrono` (with `serde`) is a first-class dependency (`apps/cli/Cargo.toml`). Persisted timestamps are written as **RFC 3339 / ISO 8601 UTC** across the codebase — `apps/cli/src/memory_pipeline.rs`, `apps/cli/src/onboarding.rs`, `apps/cli/src/project_registry.rs`, `apps/cli/src/models_cache.rs`, `apps/cli/src/approval_audit.rs`, `apps/cli/src/skills.rs`, and `apps/cli/src/auth.rs`. **✅ Built** for storage/serialization: machine-stable, sortable, unambiguous, and safe for cross-device delta-sync cursors. Human-facing display is fixed-format rather than locale-aware — e.g. session listing formats `"%Y-%m-%d %H:%M:%S"` (`apps/cli/src/lib.rs`). **🟡 Partial**: the gap is a locale-sensitive display layer (order, separators, month names) driven by the detected locale; storage must remain ISO-8601 UTC regardless. Requirement: never localize the on-disk/on-wire form — localize only at the render edge.

## Time Zones

All timestamps are generated with `chrono::Utc::now()` (verified across `auth.rs`, `memory_pipeline.rs`, `approval_audit.rs`, `teams.rs`, `models_cache.rs`). Storing and syncing in UTC is correct and is the property Neon delta-sync relies on for ordering. **✅ Built** for capture/persistence. What is missing is **local-zone display**: rendered timestamps are not consistently converted to the host zone, and there is no per-user time-zone preference. **🟡 Partial** for display; **🔭 Planned** for a configurable zone override. Requirement: convert to the host's local zone (via `chrono` local time) at render, keep UTC on disk, and label ambiguous times. Time-zone display never crosses a trust boundary — it is computed from the local clock.

## Numbers

Numeric output (token counts, USD cost in the cost HUD/ledger, durations, table columns) uses Rust's default `Display`/format — no thousands separators, no locale decimal/grouping, and currency is USD-only in the ledger (`apps/cli/src/agent/mod.rs` cost fields; `apps/cli/src/tui/cost_hud.rs`). **🟡 Partial**. Locale-aware grouping (`1,23,456` vs `123,456`), decimal comma, and INR/multi-currency display are **🔭 Planned**. Note the pricing canon: Free, **Basic $8 · ₹399**, Pro $20, Max **$100 and $200**, Enterprise — INR is fixed only for Basic; Pro/Max INR are TBD and must not be invented in any number-formatting sample. No "Plus"/"Hobby" and no top-ups appear anywhere in numeric UI.

## Translation

There is **no** UI-string internationalization framework in the CLI — no `gettext`/`fluent` catalog and no message bundles (verified: no such dependency or module). All operator-facing strings, prompts, and error text are hard-coded US English. UI translation is therefore **🔭 Planned** (extract strings to a catalog; select locale from `LANG`; ship English as the base). Distinct and already real is **voice/STT language selection**: `apps/cli/src/voice.rs` defines a `SUPPORTED_LANGUAGES` table and `agi` exposes a `--voice-lang` flag defaulting to `en` (`apps/cli/src/lib.rs`) that feeds the transcription engine — a non-LLM engine setting, so exempt from the `models.json` rule but grounded here rather than re-listed. **🟡 Partial** for voice-input language, **🔭 Planned** for interface translation. Any future LLM-assisted translation of content is a model call and obeys the Local/BYOK/Managed gate — never a silent Local→cloud leak.

## Repository map

- `apps/cli/Cargo.toml` — `chrono` (dates/time); no direct `unicode-width`/`unicode-segmentation` (width is transitive via Ratatui).
- `apps/cli/src/agent/mod.rs` — privacy modes + `validate_privacy_boundary`; USD cost fields.
- `apps/cli/src/mcp/mod.rs` — `LANG`/`LC_ALL`/`LC_CTYPE` passthrough to MCP servers.
- `apps/cli/src/voice.rs`, `apps/cli/src/lib.rs` — STT `SUPPORTED_LANGUAGES`, `--voice-lang`, `%Y-%m-%d %H:%M:%S` display.
- `apps/cli/src/{memory_pipeline,onboarding,project_registry,models_cache,approval_audit,skills,auth}.rs` — RFC-3339 UTC timestamps.
- `apps/cli/src/tui/{transcript_cell,tui_app,markdown_renderer,cost_hud}.rs`, `apps/cli/src/tui/widgets/*` — width/truncation render paths.

## Competitor notes

Claude Code, ChatGPT/Codex CLIs, and Codex ship largely English-first TUIs that assume a UTF-8 terminal and UTC-stored timestamps — the same baseline AGI CLI meets. AGI's deliberate divergence is trust-scoped localization: locale is read locally and never leaves the device without consent; translation, when it lands, runs through the multi-provider, per-surface trust gate (Local/BYOK/Managed) rather than a single hosted service; and BYOK on the CLI means locale-aware model choice stays the user's decision. AGI targets first-class India/multi-locale display (INR, Indian digit grouping) because Basic is priced in both USD and INR.

## Acceptance / Definition of Done

Production-ready when: text is UTF-8 end to end; every truncation site is display-width and grapheme aware; timestamps store UTC and render in the host zone; numbers/currency format per detected locale (INR grouping supported); a non-UTF-8 terminal degrades gracefully with an advisory; and no localization path crosses a trust boundary or invents INR prices for Pro/Max.

- [ ] Build: one shared width helper (display columns + graphemes) replaces `chars().count()` truncation; non-UTF-8 `LC_CTYPE` triggers ASCII-safe fallback, not mojibake.
- [ ] Trust: locale/TZ derived only from local env; translation calls honor `validate_privacy_boundary`; no Local→BYOK/Managed leak.
- [ ] Security: locale env values are not logged with secrets; STT language codes validated against `SUPPORTED_LANGUAGES` before use.

## Anti-patterns

- Localizing on-disk/on-wire timestamps or numbers (breaks sync/sorting) — localize only at the render edge.
- Measuring truncation by byte length or `chars().count()` and clipping a wide glyph or grapheme cluster mid-cell.
- Sending UI strings to a cloud/BYOK provider for translation from a Local session without the explicit fork (context selection, secret scan, payload preview, provider label, consent).
- Inventing INR numbers for Pro/Max, or reviving "Plus"/"Hobby"/`pro_plus`/top-ups in any numeric or pricing UI.
- Hardcoding a model ID for a "translation model" — model IDs come only from `packages/contracts/types/src/models.json`.
- Referencing Supabase, renaming `proxy.ts` to `middleware.ts`, or showing `agiworkforce <cmd>` in examples (use the `agi` binary).
