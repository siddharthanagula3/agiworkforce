---
id: "F039-11"
type: "feature"
title: "Capacity display"
aliases: ["Memory capacity", "Max facts", "/memories settings", "Memory Settings overlay", "Auto-memory settings", "S39.23"]
area: "39 Memory product"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S39.23"]
depends_on: ["SYS-memory-projects-and-context", "SYS-local-inference", "SYS-execution-boundaries", "SYS-observability-and-operations", "surface:cli", "mode:local", "mode:own-key", "mode:cloud", "store:memories/settings.json", "file:apps/cli/src/memory_pipeline.rs", "file:apps/cli/src/tui/widgets/memories_settings.rs", "F039-09", "F039-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-11 Capacity display

Only the CLI shows a memory limit. Its /memories overlay shows 'N of M stored' and lets the person pick a cap (100 to 2000 facts) that the on-disk memory file is trimmed to, newest kept. It does not list which facts fall outside. Web, desktop, mobile, VS Code and Chrome show no capacity.

Area: [39. Memory product](README.md). Requirement items: [S39.23](../../10-requirements/capabilities/039-memory-product.md#s3923).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** In the terminal app, the Memory Settings view shows auto-memory on or off, a decay period in days, and a maximum number of facts with the number currently stored. When memory is merged, older lines beyond the maximum are dropped.

**Why it exists.** Brief S39.23 says that where memory has a limit, the person should see how much is used and which memories fall outside it. The CLI stores memory in plain files on disk, so a cap keeps them bounded.

**Who uses it.** CLI users who keep learned memory on their machine.

**Problems it solves**

- Memory files growing without bound.
- Not knowing why old facts disappeared.

**Use cases**

- Open /memories in the terminal UI and see '[120 of 500 stored]'.
- Cycle the cap to 100 and save so the next merge keeps only the 100 newest facts.
- Turn auto-memory off for this machine.

## 2. User experience

**Where to find it**

- CLI full-screen terminal UI: slash command /memories, listed as 'Configure auto-memory settings' (apps/cli/src/tui/tui_app.rs:4519,6518). The overlay is titled 'Memory Settings' (apps/cli/src/tui/widgets/memories_settings.rs).
- Web, desktop, mobile, VS Code, Chrome: not present. Web Settings, Memory shows only a count line '<N> saved memories' with no limit (apps/web/features/settings/sections/MemorySection.tsx, line with counts.savedMemories).

**Before you start**

- The CLI terminal UI (the line-based REPL does not render overlays; the command is dispatched only in the terminal UI per the comment near tui_app.rs:4510).
- A local CLI install with a config home.

**Screens and controls**

- Three rows: 'Auto-memory [ON/OFF]', 'Decay threshold [N days]' (presets 7, 14, 30, 60, 90) and 'Max facts [N of M stored]' (presets 100, 250, 500, 1000, 2000).
- Keys: up and down move, Enter toggles or cycles, S saves, Esc closes without saving (memories_settings.rs:122,133).

**Journey**

1. 1. Type /memories in the terminal UI.
2. 2. Read the stored count against the cap on the Max facts row.
3. 3. Press Enter on a row to change it.
4. 4. Press S to save; Esc discards.
5. 5. The next memory merge (hourly cooldown) trims each memory file to the cap.

**What the person sees and gets**

- Row text 'Max facts [N of M stored]'.
- On save failure a chat error 'The memory settings were not saved: <error>' (tui_app.rs:1294).
- The on-screen hint lists navigate, Enter and Esc but not the S key to save (memories_settings.rs:122).

**Settings**

- auto_memory, decay_threshold_days and max_facts in the file memories/settings.json under the CLI home (apps/cli/src/memory_pipeline.rs:72-120). Defaults: on, 30 days, 500 facts.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Settings are loaded and saved as JSON with safe defaults when the file is missing (memory_pipeline.rs:79,103).
- The overlay is wired to /memories and writes the settings on save (tui_app.rs:6518-6545,1276-1295).
- stored_fact_count counts non-empty, non-heading lines across all memory files (memory_pipeline.rs:149).
- Merge applies the cap per project file, keeping the newest lines (memory_pipeline.rs:127,495).
- The auto-memory flag is read when a session starts, together with the account-wide memory off state (apps/cli/src/agent/mod.rs:186).

**Incomplete**

- Which memories fall outside the cap is not shown: lines past the cap are removed during merge and not listed anywhere (memory_pipeline.rs:127-147).
- The stored count adds all files across projects and boundaries, while the cap is applied to each file separately, so 'N of M' can exceed M without any trimming having failed [inferred from memory_pipeline.rs:149-165 and :495].
- The save key S is not in the hint line (memories_settings.rs:122).
- The file header comment says Enter on a boolean saves immediately, which the code does not do (memories_settings.rs:1-6 versus :133) [inferred stale comment].
- The module is marked allow(dead_code) (memories_settings.rs:8).

**Present but disconnected or switched off**

- Account memory fetched from the cloud is not subject to max_facts; it has its own 30-memory prompt cap on the server (managed-memory-context-service.ts:67) and no cap display.

**Not available**

- Capacity or limit display in web, desktop, mobile, VS Code and Chrome. Internal prompt limits exist (web 30 memories and 8,000 characters at managed-memory-context-service.ts:67,71; mobile 50 facts at apps/mobile/src/features/memory/services/personalContext.ts:16; desktop Tauri injects up to 10 by default at apps/desktop/src-tauri/src/core/llm/memory_integration.rs:36) but none is shown to the person.

## 4. Required behaviour

**Established requirements**

- Where memory has a limit, the user can see how much is used and which memories fall outside it. (source: brief S39.23 Should)
- The CLI keeps a maximum number of facts (max_facts) in its memory settings. (source: brief people/should lines for F039-11 and apps/cli/src/memory_pipeline.rs:79)
- Every memory entry exposes provenance, last update, edit, exclusion, export and deletion. (source: docs/product/experience-contract.md:28)

**Acceptance criteria**

1. /memories shows the current count against the cap.
2. Changing the cap and pressing S writes memories/settings.json.
3. Esc leaves the file unchanged.
4. After a merge with a lower cap each memory file holds at most that many content lines, newest kept.
5. The person can learn which facts were dropped or are outside the cap (not met today).
6. A missing or broken settings file falls back to 500 and does not crash.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The count shown should match the unit the cap is applied to (per file) [inferred].
- Web and the other apps have no hard cap on account memory that the person must see, other than the prompt limits [inferred; no stored-count limit found].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show per-file counts or apply the cap to the total so the number is true.
- [proposed] Keep a trimmed-facts list the person can read or restore.
- [proposed] Add S to the hint line and fix the file comment.
- [proposed] Show on web a note when more memories exist than reach a prompt (30).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MemoriesSettingsView | `apps/cli/src/tui/widgets/memories_settings.rs` | Overlay with three rows and the stored count |
| command | /memories slash command | `apps/cli/src/tui/tui_app.rs` | Opens the overlay seeded with saved settings |
| event | OverlayResult::Memory | `apps/cli/src/tui/widgets/interactive.rs` | Carries settings out of the overlay |
| service | apply overlay result | `apps/cli/src/tui/tui_app.rs` | Saves settings and flips session memory flag |
| config | memories/settings.json | `apps/cli/src/memory_pipeline.rs` | auto_memory, decay_threshold_days, max_facts |
| service | load_memory_settings / save_memory_settings | `apps/cli/src/memory_pipeline.rs` | Read and write the settings with defaults |
| service | cap_consolidated_facts | `apps/cli/src/memory_pipeline.rs` | Trims to the newest N facts |
| service | stored_fact_count | `apps/cli/src/memory_pipeline.rs` | Counts stored facts for display |
| job | MemoryPipeline consolidation | `apps/cli/src/memory_pipeline.rs` | Hourly merge that applies the cap |
| service | session_memory_enabled | `apps/cli/src/agent/mod.rs` | Reads the auto-memory flag at session start |
| service | web prompt limits | `apps/web/lib/services/managed-memory-context-service.ts` | 30 memories and 8,000 characters per prompt (not shown) |
| service | mobile personalContext limits | `apps/mobile/src/features/memory/services/personalContext.ts` | 50 facts, 8,000 characters (not shown) |
| config | desktop MemoryIntegration max_memories | `apps/desktop/src-tauri/src/core/llm/memory_integration.rs` | Injection cap default 10 (not shown) |
| test | memories_settings inline tests | `apps/cli/src/tui/widgets/memories_settings.rs` | Defaults, cycling, save and cancel, render |
| test | memory_pipeline inline tests | `apps/cli/src/memory_pipeline.rs` | Settings roundtrip and cap keeps newest |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types /memories; the app reads settings and counts stored facts. | device | apps/cli/src/tui/tui_app.rs:6518-6532 |
| Person changes values and presses S; the app writes memories/settings.json and updates the session flag. | device | apps/cli/src/tui/tui_app.rs:1276-1295; memory_pipeline.rs:103 |
| At the next merge, the pipeline summarises recent sessions into the memory file and trims it to max_facts. | device | apps/cli/src/memory_pipeline.rs:127,307,495 |
| The merge uses the session's configured model route to extract and merge facts. | outside service | apps/cli/src/memory_pipeline.rs:488-495 (route passed to consolidate_project); which provider depends on the session's mode |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Memory settings | memories/settings.json under the CLI config home | No | Until the person edits or deletes the folder |
| Consolidated facts | One file per project and trust boundary under memories/ | No (account memory is a separate cache, cloud/memory.json) | Older lines beyond the cap are discarded at merge; session summaries older than the decay period are pruned (memory_pipeline.rs:627) |

**Models and providers.** Merging facts calls a model through the session's route (memory_pipeline.rs:488-495); the capacity view itself calls none. The route and provider depend on whether the session is Local, own key or Managed.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for the capacity view; it works without sign-in. |
| Permissions | Local file access in the CLI config folder. |
| Subscription | none found in the code. |
| Limits and metering | Cap presets 100, 250, 500, 1000, 2000 (memories_settings.rs:32); decay presets 7 to 90 days; default 500. Merge model calls count against the session's own provider (memory_pipeline.rs:488). |
| Feature flags | CLI flag --no-memory switches memory off for a process (apps/cli/src/lib.rs:6691); auto_memory setting in settings.json. |
| Model compatibility | Not applicable to the view. |
| Provider restrictions | Merged memory is kept in one file per trust boundary and only read by sessions allowed to receive it (apps/cli/src/cloud/memory.rs header comment). |
| Local mode | Works fully in Local mode with no account and no payment; files stay on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Settings file missing or unreadable | Defaults of on, 30 days, 500 facts | memory_pipeline.rs:79-100 |
| Stored count unavailable | Row shows 'N facts' without 'of' | memories_settings.rs:99-107 |
| Cancel | Esc closes and applies nothing | memories_settings.rs:136-139 |
| Save failure | Chat error message | tui_app.rs:1294 |
| Line REPL | not handled: the overlay is a terminal-UI feature | apps/cli/src/tui/tui_app.rs:4510-4519 comment |
| Accessibility | not handled in the code searched (text-only overlay) | memories_settings.rs render function |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/tui/widgets/memories_settings.rs`: Inline tests: defaults, Enter toggles and cycles, Esc cancels, S saves, render shows values, navigation
- `apps/cli/src/memory_pipeline.rs`: Inline tests memory_settings_defaults_when_absent_and_roundtrips (line 931) and cap_consolidated_facts_keeps_most_recent_within_cap (line 941)

**Test scenarios**

- **See capacity**
  1. Open the CLI terminal UI.
  2. Type /memories.
  - Expected: Max facts row shows 'N of M stored'.
- **Lower the cap**
  1. Cycle Max facts to 100.
  2. Press S.
  3. Wait for or trigger a merge.
  - Expected: Each memory file holds at most 100 content lines, newest kept.
- **Cancel**
  1. Change a row then press Esc.
  2. Reopen /memories.
  - Expected: Previous values are shown.
- **Count versus cap with several projects**
  1. Have memory files for two projects with 300 lines each.
  2. Open /memories with cap 500.
  - Expected: Row shows 600 of 500 stored although each file is under the cap; confirms the display gap.
- **No overflow list**
  1. After trimming, look for a way to see the dropped facts.
  - Expected: None exists (gap).

**Where to look when it fails**

- Chat error text 'The memory settings were not saved'.
- Settings file memories/settings.json in the CLI home.
- Memory files under memories/ per project key and boundary file name.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/039-memory-product.md](../../70-qa/test-plans/cli/039-memory-product.md)

## 10. Gaps and dependencies

- **The person cannot see which memories fall outside the cap** Affects: CLI users. Evidence: memory_pipeline.rs:127-147 drops lines with no record. Work needed: Keep or list the trimmed facts
- **Stored count and cap use different units** Affects: CLI users with several projects. Evidence: memory_pipeline.rs:149 versus :495. Work needed: Show per-file counts or cap the total
- **Save key not shown in the hint** Affects: CLI users. Evidence: memories_settings.rs:122. Work needed: Add S save to the hint
- **No capacity display in web, desktop, mobile, VS Code, Chrome** Affects: All other apps. Evidence: No code found; internal limits exist but are hidden. Work needed: Decide whether account memory needs a visible limit; show prompt-limit note
- **Overlay only in terminal UI** Affects: Line REPL users. Evidence: tui_app.rs:4510-4519. Work needed: Offer a command form
- Not built on: Web, Desktop, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-memory-projects-and-context
- SYS-local-inference
- SYS-execution-boundaries
- SYS-observability-and-operations
- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- store:memories/settings.json
- file:apps/cli/src/memory_pipeline.rs
- file:apps/cli/src/tui/widgets/memories_settings.rs
- F039-09
- F039-12

## Unknown

- Whether the account has any stored-memory count limit; none was found in the memory API read.
- What the consolidation model route is for each privacy mode (only the call site was read).
- Whether the stored count and the cap mismatch happens in practice (read from code only).
- No tests were run.
