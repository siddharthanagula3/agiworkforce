<!-- Migration-UX plan for the AGI CLI (Rust/Ratatui). Owner: migration-UX lead. Date: 2026-06-01. -->
<!-- Source: docs/parity/source-ledger.md (Phase 1 research, 16/16 targets) + code-verified gaps. -->
<!-- Trust-boundary rules (Local/BYOK/Cloud never silently routed) are LOCKED — see CLAUDE.md / MEMORY. -->

# AGI CLI — Migration-UX Plan

> Goal: an existing **Claude Code / Codex / Gemini** user migrates to the AGI CLI **comfortably**, and the **Local / BYOK / Cloud** differentiator is **obvious** from the first session onward.

---

## 1. Migration thesis

A migrant arrives with two things: a set of **muscle-memory reflexes** burned in by Claude Code, Codex, and Gemini, and a **reason to switch**. The plan succeeds only if it serves both.

**Half one — muscle-memory parity (retention).** The migrant's hands already know what every key does. Today the AGI CLI traps the most load-bearing reflexes:

- **Esc kills the entire app** — even mid-generation — instead of interrupting the turn. This is the single worst muscle-memory break: in all three reference CLIs Esc _stops the turn and keeps the session_.
- **No Ctrl+C interrupt.** There is no responsive way to stop an in-flight turn and stay in the app.
- **Tool calls are completely invisible** — zero tool cells ever render; every tool's progress is `eprintln!`'d to a stderr the alternate-screen TUI swallows. The migrant cannot see what the agent is doing, which reads as a catastrophic quality gap versus the references.
- **Up/Down scroll the transcript** instead of recalling input history; **Ctrl+L wipes the conversation** instead of redrawing; **streamed output** is a 5-line preview that pops to final wholesale; the composer **panics on CJK/Indic/emoji** (a release blocker for the India-first market).

**Half two — the differentiator made continuously visible (the wedge that makes them stay).** AGI is not just another cloud CLI: it runs **fully on-device (Local, no key, offline)**, **brings your own key (BYOK)**, or uses a **Cloud subscription** — and it **never silently moves chats or files between those boundaries**. That promise is _locked_ in product rules but **invisible in the surface the user stares at all day**: the header labels only Ollama as "Local"; BYOK and Cloud render as raw lowercase provider names; there is no persistent trust-boundary chip; `/login` offers only two cloud OAuth subscriptions; and a BYOK key entered in onboarding is **never read by the live chat path** (a dead-end setup loop). Roughly **half the verified gaps carry the `access-mode` tag** for exactly this reason — surfacing the boundary is not polish, it is the conversion pitch delivered at the moment the migrant decides whether to stay.

**Constraint that shapes every fix.** Keep existing CLI compatibility and the three trust boundaries intact:

- `agi exec`, REPL, `review.rs`, the a2a server, and all JSON/event paths must be **byte-identical** after these changes (the new TUI sinks default to `None` everywhere except the TUI; the `eprintln!` lines stay for non-TUI surfaces).
- **No new dependencies** for interrupt/cancel (drop the pinned turn future — Rust cancels at its `.await` points).
- Tool-event cells carry **only** the tool name + a truncated one-line summary + status — **never** full file/command output (truncate to ~200 chars). No network call, no routing change, no model-ID touch.
- Any **Local → BYOK / Cloud** transition (picker switch, `@file` expansion under a remote boundary) must run through the existing **payload-preview / secret-scan / consent** path, never silently ship local bytes across the boundary.

---

## 2. Prioritized roadmap

Priorities are extracted verbatim from the verified-gap tags (`[pN / effort / access-mode]`); they are **not** re-prioritized here. There are exactly **two P0s**. "Access-mode?" = the gap carries the `/access-mode` tag (touches the Local/BYOK/Cloud differentiator).

| Pri    | Effort | Access-mode? | Gap                                                                                                                                        | One-line fix                                                                                                                                                                                                                                                                                       |
| ------ | ------ | :----------: | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | M      |      –       | Tool calls completely invisible in the TUI (no tool cells ever render)                                                                     | Wire the existing-but-dead tool-event scaffolding (`app_event.rs` + `transcript_cell.rs`) into the render path: fire ToolStarted/ToolCompleted at the 4 `eprintln!` sites, drain via a new `select!` arm, render one indented status row per tool.                                                 |
| **P0** | M      |      –       | No Ctrl+C interrupt of a running turn; only Esc responds and it kills the app                                                              | Single Ctrl+C while `is_loading` interrupts the in-flight turn (drop `send_fut`); double-press within window quits when idle/empty. Shares the cancellation handle with the Esc fix.                                                                                                               |
| P1     | M      |     yes      | TUI `/login` far poorer than onboarding (only Copilot + ChatGPT; no API-key/local/OAuth menu)                                              | Route `/login` into the same access-mode-grouped picker as onboarding; `interactive_login_for_provider(None)` calls the full `select_auth_provider` flow.                                                                                                                                          |
| P1     | S      |     yes      | BYOK key saved to `auth.json` in onboarding is **never read** by the live chat path (dead setup loop)                                      | Make `resolve_key`/`resolve_api_key` fall back to `AuthStore::load().entries.get(provider) -> AuthEntry::ApiKey { key }`; explicit env-var > stored-key precedence with a label; add a smoke test.                                                                                                 |
| P1     | M      |      –       | Full-fidelity `migrate` is Claude-only; Codex/Gemini get the second-class scan/import path                                                 | Generalize `migrate` with `migrate_codex` / `migrate_gemini` reusing `copy_if_missing` / `import_markdown_prompts`; implement the Gemini YAML branch in `parse_mcp_config`; route unsupported sources to the working `ecosystem import` instead of a bare error.                                   |
| P1     | M      |     yes      | MCP import copies provider secrets (env vars) verbatim — no preview or consent                                                             | Pre-write preview listing each server + masked env keys (`STRIPE_API_KEY=sk-****`) with per-server import-with-secrets / without-secrets / skip, mirroring Codex's checkbox+Proceed gate.                                                                                                          |
| P1     | M      |   (onramp)   | Migration engine fully built but **ignition unwired** — no first-run/auto-surface prompt                                                   | After the trust step in `run_onboarding`, call `ecosystem::scan()`; if any tool detected, show a Proceed/Skip/Skip-forever checkbox prompt reusing `build_context` + `migrate`; persist dismissal in `~/.agiworkforce/config.toml`; add a welcome-banner hint.                                     |
| P1     | S      |      –       | Typing `/` renders **two** stacked command pickers (inline slash popup + overlay CommandPopup)                                             | Keep the overlay `CommandPopup`; stop setting `show_slash_popup` / skip `render_slash_popup` (delete the dead path). Confirm via existing snapshot + key tests.                                                                                                                                    |
| P1     | M      |      –       | **Esc kills the app** (even mid-generation) instead of interrupting — worst muscle-memory break                                            | Remap Esc to interrupt the stream when `is_loading` and clear-input/dismiss-popups when idle; move quit to Ctrl-C-twice / Ctrl-D; update the three advertised hints. **Highest-leverage single edit for migrant retention.**                                                                       |
| P1     | L      |     yes      | Cost/context%/tokens **triplicated** across header + cost HUD + status bar; bottom-bar scan targets live in the top header                 | Consolidate into one footer chip set in `render_status_bar`; demote/remove the floating cost HUD and header stat dup; chip order leads with `[mode] · [ACCESS MODE] · [model] · [provider] · [branch] · [ctx N%] · [tokens] · [$]`; width-based progressive drop never drops the access-mode chip. |
| P1     | S      |      –       | `/settings` is not a command — typing it sends literal `/settings` to the model                                                            | Register `/settings` as an alias (→ `/config`) so it never leaks; then build one `InteractiveView` Settings overlay with Config / Usage / Permissions tabs.                                                                                                                                        |
| P1     | M      |     yes      | `/permissions` opens a non-functional placeholder while the real tabbed editor (`render_permissions`) is dead code                         | Wire `render_permissions` into an `InteractiveView` backed by `permissions.rs` (tab switch, type-to-search, Enter to add/toggle); until then replace the fake "Approve action?" overlay with a truthful read-only rule listing.                                                                    |
| P1     | S      |      –       | `/sessions` is actively **broken** in the TUI (`eprintln` into the alternate screen)                                                       | Convert FIRST: wrap `list_managed_sessions()` in an `InteractiveView` (up/down + Enter-to-resume + Esc, calling `repl::handle_load`); stop all `eprintln` from within the TUI. Cheapest interactive win + fixes a live bug.                                                                        |
| P1     | L      |      –       | Panel classification: `/mcp /tasks /usage /models` are static dumps; `/permissions` non-functional; `/sessions` broken; `/settings` absent | Adopt a tri-state model: interactive panels for stateful/selectable surfaces, text for read-only status; reuse the existing `render_*` String outputs inside overlays.                                                                                                                             |
| P1     | S      |      –       | Streamed assistant output buffered + rendered as a 5-line preview, then replaced wholesale                                                 | Render the streaming buffer through the same `render_markdown` path as the final message; stop truncating to 5 lines; let existing scroll handle overflow with auto-scroll-to-bottom while loading.                                                                                                |
| P1     | M      |      –       | Long diffs push approval action buttons below the fold (invisible)                                                                         | Cap the box to `area.height`; anchor the action row + hint to the box bottom outside the scrollable detail; truncate the detail with a "… N more lines" marker.                                                                                                                                    |
| P1     | M      |      –       | "Always Allow" is a silent no-op for file writes/edits/patches (only bash persists)                                                        | Make `file_ops` consult+update `PermissionStore` like `bash.rs` (session-scoped allow); until then hide/relabel the button so it doesn't over-promise.                                                                                                                                             |
| P1     | M      |      –       | AcceptEdits mode does not actually accept edits in the TUI path (its own description is false)                                             | Thread `permission_mode` / `auto_approve_edits` into `ToolExecOptions`; auto-approve `write_file`/`edit_file`/`apply_patch` when mode==AcceptEdits (commands still prompt).                                                                                                                        |
| P1     | M      |      –       | Up/Down scroll the transcript; no command-history recall                                                                                   | Add a persisted prompt-history ring; bind plain Up/Down to history recall on first/last input line; move transcript scroll to Shift+Up/Down (PageUp/PageDown already mapped). Bind Ctrl-P/Ctrl-N as aliases.                                                                                       |
| P1     | S      |      –       | Ctrl+L wipes the conversation instead of redrawing (silent data loss)                                                                      | Make Ctrl+L a non-destructive redraw (clear visible scrollback, preserve `session`/`chat_messages`); move destructive clear behind `/clear` with confirmation.                                                                                                                                     |
| P1     | L      |      –       | Enter always submits — no Shift+Enter / multiline; input box is one row                                                                    | Switch `input: String` to a multi-line buffer that grows to a max height; bind Shift+Enter / Ctrl+J / trailing-backslash to newline. Bundle with the unicode-buffer rework.                                                                                                                        |
| P1     | L      |     yes      | No `@file` reference in the composer (and a naive port leaks local bytes across the boundary)                                              | Add an `@`-triggered file-search popup inserting a path token; under BYOK/Cloud route the expansion through the existing payload-preview/consent path; Local sessions expand inline.                                                                                                               |
| P1     | M      |      –       | No bracketed-paste handling — multi-line paste submits a half-message mid-stream                                                           | `EnableBracketedPaste` in terminal setup + an `Event::Paste(s)` arm; port Codex's paste-burst detector fallback; collapse large pastes to `[Pasted N lines]`.                                                                                                                                      |
| P1     | M      |      –       | Composer **panics** on CJK/Indic/emoji (byte-index cursor desync) — release blocker for India-first                                        | Replace the raw-String input with a unicode-aware buffer (`unicode-segmentation` + char-boundary cursor); at minimum advance by `c.len_utf8()` and snap all offsets to char boundaries.                                                                                                            |
| P1     | M      |     yes      | Picker shows no auth/connection status — migrant can't tell which providers are configured/need a key                                      | Pass `auth::auth_status()` into `rebuild_rows`; annotate rows with connected / needs-key / running / waitlist chips; BYOK "needs key" rows offer inline key entry.                                                                                                                                 |
| P1     | S      |     yes      | In-session header labels only Ollama as "Local"; LM Studio/BYOK/Cloud render as raw provider names                                         | Replace the single `ollama→Local` match with a derive-from-`AccessMode` helper so every session shows a consistent color-coded Local/BYOK/Cloud chip.                                                                                                                                              |
| P1     | M      |     yes      | Two divergent auth entry points: wizard surfaces Local/BYOK/Cloud, in-session `/login` only two cloud OAuth                                | Make `/login` open the same access-mode-first menu as `onboarding::select_auth_provider`; extract the AuthChoice menu into a shared function both call.                                                                                                                                            |
| P2     | S      |     yes      | Env-var BYOK keys resolved + used silently with no visible label/consent                                                                   | On first use, surface a dismissible "Using `<PROVIDER>` key from `<ENV_VAR>` — BYOK, you pay `<provider>` directly" notice with an override; adopt Codex's `prepopulated_from_env` pattern.                                                                                                        |
| P2     | S      |     yes      | The "coming from X?" moment doesn't surface the three-trust-boundary headline differentiator                                               | Add one skippable screen after import: "AGI runs on-device (Local), BYOK, or Cloud — and never silently moves chats/files. Your imported MCP + memory work the same in all three."                                                                                                                 |
| P2     | S      |     yes      | Header provider label under-reports Local and never distinguishes BYOK from Cloud                                                          | Delete the ad-hoc `"ollama"=>"Local"` match; show the real `provider_display(id).label` chip; put the boundary word on a dedicated access-mode chip from `privacy_mode`/`access_mode()`.                                                                                                           |
| P2     | M      |      –       | `/tasks` and `/usage` claim interactivity in footers but cannot act                                                                        | Stop emitting interactive-looking footers from static renderers; wrap `render_*` in `InteractiveView` (Enter-to-view + kill/cancel for `/tasks`; fold `/usage` into the Settings overlay).                                                                                                         |
| P2     | M      |      –       | `/mcp` cannot authenticate a server from the TUI (`render_mcp_detail` NeedsAuth is dead code)                                              | Promote `/mcp` to an `InteractiveView` listing servers, Enter-drills into `render_mcp_detail`; on NeedsAuth trigger the existing `auth_oauth.rs` path (`/mcp auth <server>` minimum).                                                                                                              |
| P2     | S      |     yes      | Header shows provider name, not the trust boundary — Local/BYOK/Cloud not visually distinct                                                | Render `session.privacy_mode.label()` as a color-coded badge in `render_header` (LOCAL green / BYOK cyan / CLOUD amber), driven by `PrivacyMode` not a hardcoded string.                                                                                                                           |
| P2     | M      |      –       | No diff/patch rendering — file edits show no before/after, no +/- gutter                                                                   | Render `edit_file`/`write_file`/`apply_patch` results as a Patch cell with green +/red - gutter (borrow `diff_review.rs`); ship the compact `edited path (+12 -3)` header first, expandable diff body second.                                                                                      |
| P2     | L      |      –       | Structured-cell / event-bus migration scaffolded but never connected (three dead modules)                                                  | Adopt incrementally: `Vec<Box<dyn TranscriptCell>>` behind a feature gate (PlainTranscriptCell for User/Assistant/System), then an Exec/Tool cell impl, then drive from the `app_event` channel; drop `#![allow(dead_code)]` per module as it goes live.                                           |
| P2     | L      |      –       | Core inspection commands print static text where the giants open interactive panels (`/usage /tasks /status /mcp`)                         | Promote to interactive overlays reusing `InteractiveView`; keep text fallback for `--no-tui`/REPL via the same `render_*` functions.                                                                                                                                                               |
| P2     | S      |      –       | Four rich interactive overlays are orphaned — not in the registry, so `/` never shows them                                                 | Register the four overlay-backed commands as builtins; add a registry test asserting every `open_overlay()` in `handle_slash` has a matching `RegistryCommand`.                                                                                                                                    |
| P2     | S      |     yes      | Composer never shows which trust boundary the prompt is heading to                                                                         | Add an access-boundary chip to the composer title/footer (`[Local · qwen3]`, `[BYOK · gpt-5]`, `[Cloud]`), distinct color per boundary, design tokens only.                                                                                                                                        |
| P2     | S      |     yes      | Steady-state empty-state + placeholder hide AGI's own value (no `/login`/`/model`/access-mode hint)                                        | Expand the empty-state into a 3-4 line Tips block reflecting actual state (`/model`, `/login` only when unauthenticated, active boundary otherwise).                                                                                                                                               |
| P2     | S      |     yes      | No persistent provider / access-mode label anywhere in the steady-state TUI                                                                | Add a persistent right-aligned header segment `<provider> · <Local\|BYOK\|Cloud>`, distinct color per boundary, rendered next to token counts.                                                                                                                                                     |
| P3     | L      |     yes      | Local→BYOK switch in the picker has no fork/consent/payload-preview/secret-scan (violates the locked rule)                                 | Interpose a one-screen consent gate before the first post-switch turn: destination label + payload preview + `redact_args`/`redact_secrets` scan + Enter-to-send; persist consent per session.                                                                                                     |
| P3     | S      |     yes      | Trust-boundary differentiator invisible in `/help` and the welcome screen                                                                  | Add a "Trust & Privacy" block to `format_command_help` naming the three boundaries + the active one + `/trust-boundary` / `/continue-with-byok` / `/privacy-mode`; add one welcome line; label the header span.                                                                                    |
| P3     | S      |     yes      | Status bar shows no Local/BYOK/Cloud label — hides the differentiator and a required safety signal                                         | Add a persistent trust-boundary badge to `render_status_bar` (`Local: qwen3` / `BYOK: anthropic` / `Cloud`), distinct color per boundary.                                                                                                                                                          |

---

## 3. Top build specs (approach verbatim)

The two **P0** specs below reproduce their **Approach** text **verbatim**; the source's `Risk`/`Tests` subsections are compressed to one Risk line each for the plan format (the full Tests blocks live in the source spec — restore them when implementing, not here). The third spec (`/login` routing) is reproduced as delivered; the source spec was **truncated mid-sentence** and **continues** beyond what is shown — do not treat it as complete. Specs 4–6 reproduce the verbatim `-> approach` text from the highest-leverage verified gaps the source itself flags (BYOK `resolve_key` fallback, first-run migration ignition, Esc remap).

### Spec 1 — [P0] Wire the existing-but-dead tool-event scaffolding into the render path (tool calls become visible transcript rows)

**Files:** `apps/cli/src/agent/mod.rs`, `apps/cli/src/agent/chat.rs`, `apps/cli/src/tui/tui_app.rs`

**Approach:**

ROOT CAUSE (verified, not from the task text): Two independent gaps must both be closed, or tool cells still won't appear.
(a) The agent loop has no event sink — all tool progress is `eprintln!` to stderr at chat.rs:548 (batch header), :819 (subagent/task result), :993 (parallel-batch result), :1179 (sequential result), which the alternate-screen TUI swallows.
(b) CRITICAL TIMING GAP the task brief understates: during a turn, `render_chat` is NEVER called. send_message (tui_app.rs:2737-2768) parks the whole event loop inside the `select!` on `send_fut`; the main-loop render at tui_app.rs:2670 and the post-turn render at :2808 are the only ones, plus renders inside run_tui_approval_modal. So even after we emit events, nothing repaints mid-turn. The fix must therefore ALSO add an event-drain + render arm to that existing `select!`. This reuses exactly the broker.notified() pattern already there (tui_app.rs:2751) — do NOT invent a new loop.

STEP 1 — New sink type (mirror ToolApprovalSink at agent/mod.rs:63-70).
In agent/mod.rs add, next to ToolApprovalSink:

```rust
#[derive(Clone)]
pub struct ToolEventSink(pub std::sync::Arc<dyn Fn(crate::tui::app_event::TuiAppEvent) + Send + Sync>);
```

- a Debug impl writing "ToolEventSink(<callback>)" (AgentSession derives Debug; the dyn Fn is not Debug, so this manual impl is mandatory — same reason ToolApprovalSink has one).
  Add field to AgentSession (agent/mod.rs:114 area): `pub on_tool_event: Option<ToolEventSink>,`
  Initialize to None in AgentSession::new (agent/mod.rs:322 area, alongside on_tool_approval). This is the ONLY change needed for the other 4 send() callers (review.rs:68, lib.rs:2578/2628, a2a/server.rs:400) — they leave it None and are unaffected; do not touch them.
  Reuse TuiAppEvent::{ToolStarted,ToolUpdated,ToolCompleted} and ToolStatus from app_event.rs:24-52 verbatim — they already carry call_id/name/summary/status/output. Remove the `#![allow(dead_code)]` blanket only after wiring, or leave it; harmless.

STEP 2 — Fire events in chat.rs (replace/augment the 4 eprintln sites; keep the eprintln as-is for non-TUI exec paths — they are gated by `!self.quiet` and other callers still rely on stderr, so ADD emission, do not delete the eprintln).
Add a tiny private helper on AgentSession:

```rust
fn emit_tool_event(&self, ev: TuiAppEvent) { if let Some(s)=&self.on_tool_event { (s.0)(ev); } }
```

- Sequential path (other_calls loop, chat.rs:1039-1225): before executing each `tc`, call emit_tool_event(ToolStarted{ call_id: tc.id.clone(), name: tc.name.clone(), summary: one_line_summary(&tc.name, &effective_args) }). After result is known (at the status block :1173-1180), emit ToolCompleted{ call_id: tc.id.clone(), status: if tool_result.success {Succeeded} else {Failed}, output: <<= first 200 chars of tool_result.output >> }.
- Parallel path (concurrent_calls, chat.rs:866-1034): emit ToolStarted for each tc when pushed to `runnable` (:949). join_all returns out of order, so keying by call_id is REQUIRED — that is exactly why call_id exists in the event. Emit ToolCompleted in the outcomes loop at :987-994 keyed by tool_use_id.
- Task/subagent path (task_calls, chat.rs:604-863): emit ToolStarted at spawn (:752 push), ToolCompleted at the status block :814-824 keyed by tool_use_id.
  Add a small `fn one_line_summary(name:&str, args:&serde_json::Value)->String` (e.g. for run_command -> the command; read_file/edit_file/write_file -> the path; else name) — keep <=80 chars, single line.

STEP 3 — Receive + render in tui_app.rs.
3a. Add to ChatMessage a tool-cell variant. Do NOT overload the flat `text:String` for status. Add a new field to TuiApp instead: `tool_cells: Vec<ToolCell>` where

```rust
struct ToolCell { call_id:String, name:String, summary:String, state: crate::tui::transcript_cell::TranscriptCellState }
```

This keeps tool rows separate from chat_messages so updates by call_id are O(n) find-and-mutate. Clear tool_cells at the start of send_message (next to stream_buffer.clear() at :2705) and again on ClearChat (:2652).
3b. Channel: in send_message, before installing the broker (~:2721), create an mpsc::unbounded_channel of TuiAppEvent (reuse app_event::channel() if convenient). Build the ToolEventSink closure that does tx.send(ev) (ignore the bool). Assign app.session.on_tool_event = Some(ToolEventSink(...)). Tear down to None right beside the on_tool_approval=None teardown at :2773.
3c. Drain + render in the EXISTING select! (tui_app.rs:2747-2767). Add a third arm:

```rust
ev = rx.recv() => { if let Some(ev)=ev { apply_tool_event(app, ev); render(terminal, app)?; } }
```

Keep `biased;` (send_fut first). The select! already proves this pattern is deadlock-safe; rx.recv() is a clean wakeup source. apply_tool_event: ToolStarted -> push ToolCell{state:Running}; ToolCompleted -> find by call_id, set state Succeeded->Complete / Failed->Failed. (ToolUpdated optional; can no-op for MVP.)
NOTE: the streaming text buffer ALSO only renders post-turn today; this same new render call incidentally makes streaming live too — acceptable and desirable, but call it out so the reviewer expects the diff.
3d. Render the cells. In render_chat (tui_app.rs:620), after the chat_messages loop and before the loading indicator, iterate app.tool_cells and push ONE indented Line each:

```
glyph = match state { Running => app.spinner_char(), Complete => "✔", Failed => "✗", _ => "•" }
```

color via terminal_palette (v3_success/v3_terracotta/teal) — NEVER hardcode hex/Color literals beyond the existing palette helpers already imported in this file (feedback_no_hardcoded_colors). Use the existing Color::DarkGray for summary text to match siblings.
Line: `"  {glyph} {name}  {summary}"`. This satisfies the existing ChatRole::Tool prefix aesthetic (" ▸ "); you may reuse that magenta prefix instead of inventing one.
The ChatRole::Tool enum arm (tui_app.rs:692,705-708) already exists and can stay as a fallback; the new tool_cells path supersedes it.

TRUST-BOUNDARY / COMPAT NOTES (locked rules):

- Events carry only tool name + a truncated one-line summary + status. Do NOT put full tool output or file contents into ToolCompleted.output for render — truncate to ~200 chars. Local/BYOK/Managed boundaries are unaffected (no network, no routing change).
- CLI/exec/JSON-events paths are untouched: on_tool_event defaults None everywhere except the TUI; the eprintln lines remain for those surfaces. No behavior change for `agi exec`, review.rs, a2a server.
- spinner advance: the Running glyph animates only on frames; the existing main-loop spinner tick (:2663) plus the new mid-turn render arm keep it moving.

**Primary risk:** the mid-turn render gap, not the event plumbing. Emitting events is easy; if Step 3c (the new `rx.recv()` arm inside the existing send_message select!) is omitted or mis-placed, tool cells are stored but NEVER painted until the turn ends — reproducing the exact "flat absence" symptom while looking wired. The select! is `biased` on send_fut, so a fast turn can finish before any event drains; ensure the post-turn path also drains residual rx (`while let Ok(ev)=rx.try_recv()`) and renders once. Secondary: join_all ordering — all mutation MUST key on call_id, never positional index. Tertiary: never render raw file/command output into the cell (truncate). Lowest: clippy on the manual Debug impl / `Arc<dyn Fn + Send + Sync>` bound — copy the exact bound style from ToolApprovalSink.

### Spec 2 — [P0] Make Ctrl+C interrupt the in-flight turn (single press while is_loading); double-press to quit when idle

**Files:** `apps/cli/src/tui/tui_app.rs`

> NOTE: real file is `apps/cli/src/tui/tui_app.rs`. ANCHOR BY SYMBOL, NOT LINE NUMBER — this file grows steadily, so the absolute line numbers cited throughout this spec (written 2026-06-01 against ~3362 lines; the file is well over 3700 lines now) WILL be stale. Re-locate each edit target by its function/symbol: the in-turn interrupt branch belongs in `send_message`'s `tokio::select!` loop; idle/loading Ctrl+C and Esc are arms inside `handle_key_event` (find the `Char('c') + CONTROL` arm and the `is_loading` early-return); the parked event loop is `run_event_loop`. `grep` the symbol and read the surrounding code before editing; treat every `:NNNN` below as a hint, not a target.

**Approach:**

ARCHITECTURE CONSTRAINT (the load-bearing finding): during a turn the main event loop (run_event_loop, line 2469-2671) is PARKED inside `send_message(...).await`. While loading, keyboard events are NOT polled at all — only the approval broker is drained via the `select!` at tui_app.rs:2748-2767. So the loading-state key handlers in handle_key_event (lines 1154-1159) are DEAD during an active turn; they only fire between turns. Therefore the interrupt MUST be implemented as a new keyboard-polling branch INSIDE send_message's select! loop, and cancellation is achieved by DROPPING `send_fut` (Rust cancels async futures at their await points). No CancellationToken / tokio-util dependency is needed — dropping the pinned future at line 2745 is the cancel handle the task asks for.

DO NOT add tokio-util. The agent loop in agent/chat.rs (send, line 84; agentic `for iteration` loop at 432) is all `.await` points around network + tool calls; dropping the future at any await boundary is clean cooperative cancellation. This matches the file_ops/bash trust boundary: we cancel locally, we never reroute data.

CHANGE 1 — state (struct TuiApp, line 112-161; constructor TuiApp::new init block ~line 264-285):
Add field `last_ctrl_c: Option<Instant>` (Instant already imported, used by stream_start). Init `last_ctrl_c: None`. Add a const near FALLBACK_BANNER_TTL (line 174): `const CTRL_C_QUIT_WINDOW: Duration = Duration::from_secs(2);`.

CHANGE 2 — idle double-press-to-quit (handle_key_event, replace lines 1178-1182, the existing `Char('c') + CONTROL` arm that clears input and returns None):
New arm logic: if `app.input` is non-empty OR cursor>0 -> clear input, set `app.last_ctrl_c = None`, return InputAction::None (first Ctrl+C on a non-empty line clears it, matching Claude). If input is already empty: check `app.last_ctrl_c`; if Some and `elapsed() <= CTRL_C_QUIT_WINDOW` -> return InputAction::Quit; else set `app.last_ctrl_c = Some(Instant::now())`, push a transient System ChatMessage hint "Press Ctrl+C again to exit" (or set a banner), return InputAction::None. This is reached only when NOT loading because the `if app.is_loading` early-return is at 1154-1159 above the match. Keep Esc-idle (line 1162) as InputAction::Quit unchanged unless the paired Esc fix says otherwise (out of scope here, but the design is compatible).

CHANGE 3 — loading-state Esc/Ctrl+C in handle_key_event (lines 1154-1159): this block is dead during an active turn (see constraint) but DOES fire for the brief windows the loop is at poll. Leave Esc=Quit here for safety, but the real interrupt is Change 4. Do not rely on this path for the in-turn interrupt.

CHANGE 4 — in-turn interrupt (send_message, the `select!` loop at lines 2737-2768). Add a third biased branch that polls the keyboard with a NON-BLOCKING timeout and breaks the loop with an Interrupted sentinel when Ctrl+C (or Esc) is seen. Concretely, introduce a local enum `TurnOutcome { Completed(Result<TurnResult>), Interrupted }` (or reuse a bool flag set before `break`). Inside the loop add:

```rust
_ = tokio::time::sleep(Duration::from_millis(TICK_RATE_MS)) => {
    if event::poll(Duration::ZERO)? {
        if let Event::Key(k) = event::read()? {
            let is_ctrl_c = k.code == KeyCode::Char('c') && k.modifiers.contains(KeyModifiers::CONTROL);
            if is_ctrl_c || k.code == KeyCode::Esc { break TurnOutcome::Interrupted; }
        }
    }
}
```

Keep `biased;` so the turn future (line 2750) and broker (2751) are still polled first; the keyboard branch is the lowest priority so streaming/approvals are never starved. Breaking the loop drops `send_fut` (pinned at 2745) when the `{ ... }` block scope ends, cancelling the agent turn. event/Event/KeyCode/KeyModifiers are already imported (line 6). Use `Duration::ZERO` poll so we never block the async runtime.

CHANGE 5 — interrupt teardown (after the loop, lines 2770-2808). On Interrupted: still run the existing teardown (`app.session.on_tool_approval = None; broker.cancel_all().await;` at 2773-2774), copy any partial stream_buffer (2777-2779), set `app.is_loading = false; app.stream_start = None;` (2781-2782). Then, instead of the `match result` Ok/Err block (2784-2805), push a System ChatMessage "Interrupted." (and append the partial assistant text as an Assistant message if stream_buffer is non-empty so the user keeps what streamed). Fire the Stop hook (mirror the InputAction::Quit hook block at 2482-2497, message "Ctrl+C interrupt") so hook parity holds. Return Ok(()) — the app STAYS alive (the migrant's stop-and-stay model). Reset `app.last_ctrl_c = None` so an interrupt does not arm the idle double-press.

CHANGE 6 — UX hint. In the loading render block (lines 722-741, the "Thinking..." line), append " · Ctrl+C to interrupt" to the dimmed status span so the affordance is discoverable, matching the idle hint at line 664. Optionally render the "Press Ctrl+C again to exit" idle hint from last_ctrl_c.

COMPAT / TRUST BOUNDARY: no new deps, no provider/routing change, no model-ID touch. Interrupt is local-only future-drop; no data crosses Local→BYOK→Cloud. Headless/`send_btw` (chat.rs:1473) and the non-TUI exec path are untouched. The second event loop fragment at line 450 is the approval modal's own loop (run_tui_approval_modal) — leave it; an interrupt during an open approval modal is out of scope (the modal already has Deny-All).

**Primary risk:** dropping `send_fut` cancels the agent turn at whatever `.await` it is parked on — if that is mid tool-execution, an in-flight side effect (a partial file write, a spawned child process) may be left half-done or orphaned. Rust async-drop cancels the future but does NOT kill an already-spawned OS process or roll back a write that already returned. Mitigation: this is acceptable interrupt semantics (no worse than the current Esc-kills-the-app) and matches Claude/Codex; document it, and as a follow-up consider a short grace period before drop. Secondary: `event::poll(Duration::ZERO)` + `event::read()` competes with the main loop's reader — but the main loop is parked during send_message so there is exactly one reader at a time; gate the keyboard branch behind the `sleep` so it does not busy-spin and starve the biased turn future. Tertiary: comment the dead loading-state handlers (1154-1159) to point a future maintainer at the send_message select! branch as the real interrupt site.

### Spec 3 — [P1/access-mode] Route /login (TUI + REPL + `agi login`) through the same access-mode-grouped auth picker as onboarding

> ⚠️ This spec is reproduced as delivered by the source and **continues beyond what is shown** — it was truncated mid-sentence at Step 3. Treat Steps 1–2 as complete; Step 3 (rewiring `onboarding.rs run_onboarding`) must be finished before implementation.

**Files:** `apps/cli/src/auth.rs`, `apps/cli/src/onboarding.rs`, `apps/cli/src/repl/mod.rs`, `apps/cli/src/lib.rs`, `apps/cli/src/tui/tui_app.rs`

**Approach:**

ARCHITECTURE DECISION (confirmed with advisor): This is a dialoguer extraction, NOT a new Ratatui overlay/widget. The TUI already suspends itself via restore_terminal()/setup_terminal() around the existing login call (tui_app.rs:2590-2593), so the full dialoguer-based `select_auth_provider` flow runs correctly on a cooked terminal with zero TUI-render work. Building an `InteractiveView` overlay was explicitly rejected: it would duplicate logic that MUST stay byte-identical to onboarding (parity is the entire point of this item) and would needlessly pull in the terminal_palette no-hardcoded-color requirement that the dialoguer path sidesteps. There is no new struct/enum/render/key-handling code. Reuse `enum AuthChoice` (onboarding.rs:272-282) and the two pure mapping fns as-is.

STEP 1 — Create the shared function in auth.rs (auth-method selection belongs with auth; keeps auth.rs from depending on onboarding.rs). MOVE these four items from onboarding.rs into auth.rs: `enum AuthChoice` (272-282), `fn select_auth_provider` (206-223), `fn select_other_provider` (225-244), `fn auth_choice_for_index` (287-295), `fn other_provider_choice_for_index` (299-309). Make `AuthChoice` and the two select fns `pub(crate)` (onboarding still needs `chose_local`). `run_api_key_flow` (onboarding.rs:315-317) just delegates to `auth::interactive_api_key_login()` — inline that call directly in the new fn; do not move the wrapper. Then ADD:

```rust
/// Shared auth-method picker used by first-run onboarding AND /login (TUI, REPL, `agi login`).
/// Runs the access-mode-grouped dialoguer menu, drills into the Other-providers submenu when
/// chosen, executes the selected auth flow, and returns the resolved choice so onboarding can
/// decide its follow-on model step. AUTH ONLY — never touches model/reasoning/approval/setup-marker.
/// Assumes a cooked (non-TUI) terminal; the suspend/resume wrapper stays at the TUI call site.
pub async fn run_auth_selection() -> Result<AuthChoice> {
    let choice = match select_auth_provider()? {
        AuthChoice::OtherProviders => select_other_provider().unwrap_or(AuthChoice::Skip),
        other => other,
    };
    match &choice {
        AuthChoice::Local(_) => {
            // TRUST BOUNDARY: local-only path — no account, MUST NOT fall through to cloud login.
            println!("\n  {} Local model — no account needed.", "\u{2713}".green().bold());
            println!("  {}", "Runs on your machine. Install Ollama (ollama.com), start it, then `ollama pull llama3.1`.".dimmed());
        }
        AuthChoice::Provider(p) => { interactive_login_for_provider(Some(p)).await?; }
        AuthChoice::ApiKey => { interactive_api_key_login().await?; }
        AuthChoice::OtherProviders | AuthChoice::Skip => {
            println!("\n  {} Skipped authentication.", "\u{2192}".dimmed());
            println!("  {}", "Use /login or `agi login` to authenticate later.".dimmed());
        }
    }
    Ok(choice)
}
```

Note: in onboarding the error path printed a warning and continued (non-fatal). Preserve that for onboarding by having onboarding ignore the Err (see Step 3); for /login surface the Err to the caller (callers already format it). Use `colored::Colorize` (already imported in auth.rs — verify; add `use colored::Colorize;` if absent). `interactive_login_for_provider` and `interactive_api_key_login` are already in auth.rs so the Provider/ApiKey arms are in-module calls.

STEP 2 — Fix the None branch (the task's named target). auth.rs:881 `None => interactive_login().await` becomes `None => run_auth_selection().await.map(|_| ())`. This single change fixes the TUI for free (RunLogin already calls interactive_login_for_provider(None) at tui_app.rs:2592). Leave the legacy `interactive_login()` (810-853) in place — `oauth.rs`/tests may still reference it and the Some(pid) fallback at 877-879 uses it; do not delete.

STEP 3 — Rewire onboarding.rs run_onboarding (681-739). Replace the select_auth_provider + OtherProviders-resolve + dispatch match (the whole 681-739 block) with: **[SPEC TRUNCATED IN SOURCE — continues here; finish before implementation.]**

### Spec 4 — [P1/S/access-mode] BYOK key from onboarding is never read by the live chat path (dead setup loop)

**Files (primary):** `apps/cli/src/config.rs` (`resolve_api_key`, config.rs:485), `apps/cli/src/auth.rs` (`AuthStore`, `AuthEntry::ApiKey`)

**Approach (verbatim):** Make config.resolve_api_key (or resolve_key) fall back to AuthStore::load().entries.get(provider) -> AuthEntry::ApiKey { key } for direct providers, mirroring the copilot/chatgpt path. Precedence should be explicit and labelled (env var > stored key, or surface a one-line 'using stored anthropic key from auth.json'). Add a smoke test: write an ApiKey entry for anthropic, assert resolve_key returns it with no env var set. Without this, the entire BYOK onboarding branch is a dead end.

### Spec 5 — [P1/M/onramp] Migration-engine ignition: wire the built engine into first run

**Files (primary):** `apps/cli/src/onboarding.rs` (`run_onboarding`), `apps/cli/src/ecosystem.rs` (`scan`, `build_context`, `migrate`)

**Approach (verbatim):** Wire the existing engine into first run. In onboarding.rs run_onboarding, after the trust step, add a step that calls ecosystem::scan(); if any tool is detected, show a checkbox prompt ('We found Claude Code / Codex / Gemini on this machine. Import MCP servers, commands, skills, agents, and memory?') reusing ecosystem::build_context + migrate. Copy Codex's UX contract verbatim: Proceed/Skip/Skip-forever + per-scope dismissal + cooldown so it is never nagware. Persist the dismissal in ~/.agiworkforce/config.toml (a notices block mirroring codex's external_config_migration_prompts). Also add a one-line banner hint in print_welcome_banner: 'Coming from Claude Code or Codex? Run /migrate to import your setup.' Effort is S/M because scan/import/migrate already exist — this is glue plus one dialog, not new infrastructure.

### Spec 6 — [P1/M] Esc remap: interrupt the stream, never quit (highest-leverage single edit for migrant retention)

**Files (primary):** `apps/cli/src/tui/tui_app.rs` (handle_key_event + the send_message `select!` loop), `apps/cli/src/repl/command_registry.rs` (advertised hints)

**Approach (verbatim):** Remap Esc to (a) interrupt the active stream when `is_loading` (abort the turn, keep the session) and (b) clear input / dismiss popups when idle. Move 'quit' to Ctrl-C twice or Ctrl-D (matching the REPL shortcuts already documented in command_registry.rs:199), and update the three advertised hints (tui_app.rs:641, :213, :915) to say 'Esc: interrupt / clear · Ctrl-C twice: quit'. This requires wiring a cancellation token into the send_message loop (tui_app.rs:2598-2705), which currently parks the whole event loop inside `send_fut.await` with no abort branch. (Shares the cancellation handle with Spec 2 — build the turn-future drop once, land both Esc and Ctrl+C interrupt.)

---

## 4. Sequencing for a single engineer

Sequence by **shared prerequisite**, not raw priority. Three seams unlock multiple gaps at once; build the seam once, land everything behind it.

### Phase A — The interrupt seam (P0 + the worst muscle-memory break)

One cancellation handle on the turn future (dropping the pinned `send_fut` in send_message's `select!`, tui_app.rs:2745) unlocks **three** fixes. Build it once:

1. **Cancellation plumbing** — add the keyboard-poll arm + Interrupted teardown to the send_message `select!` (Spec 2, Change 4–5). No new deps.
2. **Ctrl+C interrupt** (Spec 2, P0) — single press while loading interrupts; double-press idle quits.
3. **Esc remap** (Spec 6) — Esc interrupts while loading, clears/dismisses idle, never quits. Same handle; land it in the same change so the two keys share one code path and one teardown. Update the three advertised hints + footer ("Esc: stop / clear · Ctrl-C twice: quit").

Result: the migrant's complete stop-and-stay mental model is restored in one coherent edit.

### Phase B — The mid-turn render seam (P0 tool visibility + live streaming)

The new `rx.recv()` arm in the same send_message `select!` (Spec 1, Step 3c) is the shared prerequisite for **both** tool-cell rendering **and** live streaming — the tool-event spec calls this out explicitly.

4. **Tool-event scaffolding** (Spec 1, P0) — sink in `agent/mod.rs`, fire at the 4 `eprintln!` sites in `chat.rs` (ADD, do not delete — exec/REPL/a2a still need stderr), drain + render in the new arm, render one indented status row per tool. Key all mutation on `call_id` (join_all is out of order). Truncate output to ~200 chars (trust boundary).
5. **Live streaming** (P1) — the new render arm already repaints mid-turn; switch the in-progress block to `render_markdown(&app.stream_buffer)` and drop the 5-line `take(5)` truncation. Lands almost for free on the Phase-B render arm.

Sequencing note: Phases A and B both edit the same `select!` block — do A then B (or co-develop) so the two new arms land together and are tested as one loop. Keep `biased;`; the turn future and broker stay highest priority.

### Phase C — The auth / BYOK / trust-boundary seam (the differentiator)

This is the conversion wedge. Order it so the setup loop closes before the front door is widened:

6. **BYOK `resolve_key` fallback** (Spec 4, S) — close the dead-end loop first: a key entered in onboarding must be read by the live chat path, with explicit env-var > stored-key precedence and a one-line label.
7. **`/login` → shared access-mode picker** (Spec 3, M) — extract `run_auth_selection` into `auth.rs`; both `run_onboarding` and `interactive_login_for_provider(None)` call it. (Finish the truncated Step 3 first.)
8. **Persistent trust-boundary chip** (P1/P2 cluster) — one `derive-from-AccessMode` helper drives the header chip, the status-bar badge, the composer chip, and the picker status chips. Build the helper once; the four render sites are then small, color-token-only edits. Map Ollama AND LM Studio → Local, keyed providers → BYOK, OAuth/Cloud → Cloud.
9. **Env-var key notice** (P2, S) — "Using `<PROVIDER>` key from `<ENV_VAR>` — BYOK, you pay `<provider>`" with an override. Cheap, directly serves the differentiator.

### Phase D — The on-ramp seam (migration ignition)

10. **First-run migration ignition** (Spec 5, M) — "biggest on-ramp gap." After the trust step in `run_onboarding`, `scan()` → checkbox prompt → `build_context` + `migrate`, with Codex's Proceed/Skip/Skip-forever + cooldown persisted in `config.toml`. Welcome-banner hint.
11. **Generalize `migrate` to Codex + Gemini** (P1, M) — `migrate_codex` / `migrate_gemini` reusing `copy_if_missing` / `import_markdown_prompts`; implement the Gemini YAML branch in `parse_mcp_config`. Route unsupported sources to `ecosystem import`, not a bare error.
12. **MCP import secret preview/consent** (P1, M) — per-server import-with-secrets / without / skip, masked env values. Lands on top of 10–11.
13. **"Three trust boundaries" screen** (P2, S) — one skippable post-import screen tying the differentiator to the import. Surfaces the wedge at the decide-to-stay moment.

### Phase E — The InteractiveView panel seam (interactive parity)

The `InteractiveView` trait already exists; convert in this order (cheapest + highest-value first, each reuses the prior infra):

14. **`/sessions`** (S) — convert FIRST: fixes a live bug (`eprintln` into the alternate screen), highest muscle memory, lowest effort; proves the overlay pattern.
15. **Dedup the `/` palette** (S) — keep `CommandPopup`, delete the inline `show_slash_popup`/`render_slash_popup` path so `/` shows one picker. Register the four orphaned overlay commands; add the registry test.
16. **`/settings`** (S) — register as an alias (stop the literal `/settings` leaking to the model), then build the tabbed Settings shell (Config / Usage / Permissions) that later folds in `/usage`.
17. **`/permissions`** (M) — wire `render_permissions` into the Settings/Permissions tab backed by `permissions.rs`; make `file_ops` honor Always-Allow / AcceptEdits the way `bash.rs` does (close the silent no-op).
18. **`/mcp` auth** (M) — promote to `InteractiveView`, drill into `render_mcp_detail`, trigger `auth_oauth.rs` on NeedsAuth (`/mcp auth <server>`).
19. **`/tasks`** (S) — Enter-to-view + kill/cancel; or strip the false interactive footer.

### Phase F — Composer hardening (India-first blocker + reflexes)

20. **Unicode-aware input buffer** (M) — release blocker for the India-first market; fixes the CJK/Indic/emoji panic. Bundle the multiline (Shift+Enter) and bracketed-paste work with it (same buffer rework).
21. **Input-history ring** (M) — Up/Down recall on first/last line, transcript scroll to Shift+Up/Down; Ctrl-P/Ctrl-N aliases.
22. **Ctrl+L non-destructive redraw** (S) — preserve session; move destructive clear behind `/clear` + confirmation.
23. **Status-bar / footer consolidation** (L) — single chip set leading with the access-mode chip; demote the floating cost HUD; width-based progressive drop never drops the access-mode chip.

### Phase G — Diff rendering + structured-cell migration (incremental, last)

24. **Patch cells** (M) — render `edit_file`/`write_file`/`apply_patch` results with a +/- gutter (borrow `diff_review.rs`); ship the compact `edited path (+12 -3)` header first.
25. **Structured-cell adoption** (L) — incremental, behind a feature gate; do NOT rewrite `render_chat` wholesale. Drop `#![allow(dead_code)]` per module as it goes live so CI stops hiding regressions.

### Cross-cutting invariants (every phase)

- **Compatibility:** `agi exec`, REPL, `review.rs`, a2a server, and JSON/event paths stay byte-identical — TUI sinks default `None`; `eprintln!` lines stay for non-TUI surfaces.
- **No new deps** for interrupt/cancel; drop the pinned future.
- **Trust boundaries never silently crossed:** truncate tool output (~200 chars); route any Local→BYOK/Cloud transition through payload-preview/secret-scan/consent; colors via `terminal_palette` v3\_\* tokens only (no hardcoded hex).
- **Verify before claiming done** (MEMORY lock — husky skips typecheck): `cargo build -p` the cli crate, `cargo clippy` clean, `cargo test` green, READ the output. Never batch edit → commit.
