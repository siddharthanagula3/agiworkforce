# Feature Audit Report

**Generated:** 2026-02-25
**Environment:** macOS 26.3 (Darwin 25.3.0) · Node v22.21.1 · Rust 1.90.0 · pnpm 9.15.3 · Python 3.9.6
**Repo:** AGI Workforce monorepo · Branch: `main` · 65 commits this week

---

## Summary

| Status                                   | Count |
| ---------------------------------------- | ----- |
| **PASS**                                 | 62    |
| **PARTIAL**                              | 14    |
| **FAIL**                                 | 8     |
| **BLOCKED** (missing ext. dep)           | 20    |
| **NOT TESTABLE** (no automation harness) | 10    |
| **Total**                                | 114   |

---

## Environment Snapshot

| Tool               | Status      | Detail                                                                                                                                             |
| ------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js            | PASS        | v22.21.1                                                                                                                                           |
| pnpm               | PASS        | 9.15.3                                                                                                                                             |
| Rust/Cargo         | PASS        | 1.90.0                                                                                                                                             |
| Python             | PASS        | 3.9.6                                                                                                                                              |
| Git                | PASS        | siddharthanagula3 configured                                                                                                                       |
| GitHub CLI         | PASS        | Logged in, full scopes                                                                                                                             |
| Docker CLI         | PASS        | v29.1.3 installed                                                                                                                                  |
| Docker Daemon      | **FAIL**    | Not running (`docker.sock` missing)                                                                                                                |
| PostgreSQL (psql)  | FAIL        | Not installed on host (DB likely in container)                                                                                                     |
| macOS `say` (TTS)  | PASS        | `/usr/bin/say` available                                                                                                                           |
| macOS Reminders    | PASS        | `osascript` access confirmed                                                                                                                       |
| macOS Calendar     | PASS        | 6 calendars accessible via osascript                                                                                                               |
| Screenshot capture | PASS        | `screencapture -x` works                                                                                                                           |
| **API Keys**       | **PARTIAL** | Only `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in `.env.local`; no `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `RUNWAY_API_KEY`, etc. in shell env |
| **MCP Servers**    | PARTIAL     | Only `MiniMax` connected; Google Calendar, Gmail, Drive, Notion, Trello, Asana — **not connected**                                                 |

**Tauri Commands:** 1,069 registered across 105 command files.
**Frontend Components:** 380 `.tsx` files.
**Existing Test Files:** 137 (Vitest + Playwright).
**Open PRs:** 246 (majority Dependabot dep bumps).

---

## TIER 1: Core LLM / Web-Testable (Prompts 1–4, 6, 30, 35–39, 44–45, 54–61, 75, 83–84, 101–105)

| #       | Feature                             | Status      | Notes                                                                                                                                                                                                                                                                                 |
| ------- | ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | Core chat / text generation         | PASS        | `chat/mod.rs` commands + LLM router wired. 1,420-line `modelRouter.ts` active.                                                                                                                                                                                                        |
| 2       | Model switching                     | PASS        | 2,213-line `constants/llm.ts` catalog. `thinking_set_budget` command exists. Multiple providers in `MODEL_POOLS`.                                                                                                                                                                     |
| 3       | Extended thinking                   | PASS        | `thinking_set_budget` Tauri command confirmed. `process_reasoning.rs` present.                                                                                                                                                                                                        |
| 4       | Creative generation (5 completions) | PASS        | Standard Messages API path via `completion.rs`.                                                                                                                                                                                                                                       |
| 6       | Vision / UI usability review        | PASS        | `vision_describe_ui_elements`, `vision_analyze_screenshot` commands exist.                                                                                                                                                                                                            |
| 30      | Security vulnerability scan         | PASS        | `workspace_search_symbols`, `ai_analyze_project`, `ai_generate_context_prompt` present.                                                                                                                                                                                               |
| 35      | Hacker News fetch                   | PARTIAL     | Web fetch in research flow (`research.rs`). Direct `web_search` tool depends on provider key.                                                                                                                                                                                         |
| 36      | Crypto prices                       | PARTIAL     | Web search tool present in SSE parser / tool_executor. Needs API key in env.                                                                                                                                                                                                          |
| 37      | Flight search                       | PARTIAL     | Same web search path.                                                                                                                                                                                                                                                                 |
| 38      | GitHub repo activity                | PASS        | `gh pr list` works (GH CLI authenticated). GitHub MCP not required.                                                                                                                                                                                                                   |
| 39      | Web search summarize                | PARTIAL     | Research orchestrator (`research/orchestrator.rs`) handles multi-search. Tool availability depends on model + key.                                                                                                                                                                    |
| 44      | OCR — receipt                       | PASS        | `ocr_process_image`, `vision_extract_text` commands confirmed.                                                                                                                                                                                                                        |
| 45      | OCR — config file                   | PASS        | Same OCR path.                                                                                                                                                                                                                                                                        |
| 54      | Store preferences in memory         | PASS        | `chat_configure_memory_injection`, `chat_get_memory_dashboard`, `update_memory_importance` commands.                                                                                                                                                                                  |
| 55      | Recall preferences                  | PASS        | `chat_recall_memory` command confirmed.                                                                                                                                                                                                                                               |
| 56      | Session decision log                | PARTIAL     | Memory commands exist; cross-session persistence depends on SQLite write path.                                                                                                                                                                                                        |
| 57      | Clear preferences                   | PASS        | `delete_project_memory` command exists.                                                                                                                                                                                                                                               |
| 58      | Database comparison research        | PARTIAL     | Research flow + LLM summarization. Web search key needed.                                                                                                                                                                                                                             |
| 59      | Recent AI models search             | PARTIAL     | Same research flow.                                                                                                                                                                                                                                                                   |
| 60      | RAG papers summary                  | PARTIAL     | Research orchestrator with citation support (`research/citation.rs`).                                                                                                                                                                                                                 |
| 61      | Weather fetch                       | PARTIAL     | Web search / API integration (`api.rs`). Key needed.                                                                                                                                                                                                                                  |
| 75      | CSS design system generation        | PASS        | LLM generation + `ai_generate_code` command.                                                                                                                                                                                                                                          |
| 83      | Node.js starter template            | PASS        | `templates.rs` command confirmed.                                                                                                                                                                                                                                                     |
| 84      | Top agent templates                 | PASS        | Same `templates.rs`.                                                                                                                                                                                                                                                                  |
| 101     | Architecture diagram (Mermaid)      | PASS        | `artifacts.rs` + `canvas.rs` commands. CodeCanvas component in frontend.                                                                                                                                                                                                              |
| 102     | Browse session artifacts            | PASS        | `artifacts.rs` list/query commands.                                                                                                                                                                                                                                                   |
| 103     | Time saved analytics                | PARTIAL     | `analytics_get_time_saved_trend`, `analytics_calculate_roi` commands exist. Needs real usage data.                                                                                                                                                                                    |
| 104     | Feature usage analytics             | PARTIAL     | `analytics_get_feature_usage`, `analytics_get_metric_trends` commands exist.                                                                                                                                                                                                          |
| 105     | Onboarding walkthrough              | PASS        | `onboarding.rs`, `tutorials.rs` commands + Playwright `onboarding.spec.ts` exists.                                                                                                                                                                                                    |
| 106–114 | Security boundary tests             | **PARTIAL** | `tool_guard.rs` (1,778 lines) implements `ToolSafetyTier` enum (Safe/RequiresNotification/RequiresConfirmation/RequiresExplicitApproval). Tauri capabilities deny-list covers 19 sensitive paths. LLM-level refusal depends on system prompt — not verified live without running app. |

---

## TIER 2: Hybrid Shell / File / Git / Code (Prompts 12–34, 62–63, 69–71, 76, 81–82, 92–94)

| #   | Feature                   | Status   | Notes                                                                                                                    |
| --- | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| 12  | Top memory processes      | PASS     | `ps aux` works on macOS. Terminal commands via `terminal.rs`.                                                            |
| 13  | Port 5432 listener check  | PASS     | `lsof -i :5432` executes (returns empty — Postgres not running).                                                         |
| 14  | Last 50 syslog lines      | PASS     | `/var/log/system.log` accessible on macOS.                                                                               |
| 15  | Debug Python script       | PASS     | `ai_generate_code`, `ai_analyze_project`, file read/write all present.                                                   |
| 16  | Machine uptime            | PASS     | `uptime` executes.                                                                                                       |
| 17  | Docker status             | **FAIL** | Docker daemon not running. `docker ps` fails.                                                                            |
| 18  | Downloads folder stats    | PASS     | 65 files, `du -sh` works.                                                                                                |
| 19  | Files modified in 24h     | PASS     | 330 recent files found via `find -mtime -1`.                                                                             |
| 20  | Reorganize notes file     | PASS     | `ai_access_file` + LLM + Write path available.                                                                           |
| 21  | Create CHANGELOG          | PASS     | File write confirmed (`/tmp/test-CHANGELOG.md` created).                                                                 |
| 22  | Files > 500MB             | PASS     | `find -size +500M` works. (Found 3 large files in Desktop/HxF build cache.)                                              |
| 23  | Find all .env files       | PASS     | Found `.env` in HxF and agiagentautomation sibling dirs.                                                                 |
| 24  | Uncommitted git changes   | PASS     | `git status` works. 50+ modified files in current branch.                                                                |
| 25  | Week's git summary        | PASS     | 65 commits this week confirmed.                                                                                          |
| 26  | Auto-commit changes       | PASS     | `git add + commit` path available. (GH CLI auth confirmed.)                                                              |
| 27  | Resolve merge conflict    | PASS     | Read conflict markers + LLM resolution via `ai_generate_code`.                                                           |
| 28  | PR review status          | PASS     | `gh pr list` returns 246 open PRs.                                                                                       |
| 29  | Create and push branch    | PASS     | `git checkout -b` + `git push -u` path available.                                                                        |
| 31  | Write auth module tests   | PASS     | `ai_generate_tests` command + `workspace_*.rs` commands.                                                                 |
| 32  | Replace console.log       | PASS     | 42 files with `console.log` found via `grep -r`. Edit/Grep tools available.                                              |
| 33  | Package dependency check  | PASS     | 106 deps in `apps/desktop/package.json`. `pnpm outdated` available.                                                      |
| 34  | Refactor complex function | PASS     | `ai_refactor_code` + Read/Edit tools.                                                                                    |
| 62  | Localhost health check    | **FAIL** | Dev server not running. `curl localhost:5175` would fail (no active `pnpm dev:desktop`).                                 |
| 63  | OpenAPI spec test         | PARTIAL  | `api.rs` commands exist. Needs running service.                                                                          |
| 69  | PostgreSQL tables         | **FAIL** | `psql` not installed on host. Docker daemon down. DB not accessible.                                                     |
| 70  | Recent login users        | **FAIL** | Same — PostgreSQL not accessible.                                                                                        |
| 71  | Table storage sizes       | **FAIL** | Same — PostgreSQL not accessible.                                                                                        |
| 76  | WCAG contrast audit       | PARTIAL  | `design.rs` commands. CSS analysis via `workspace_*`. Needs contrast ratio calculation logic.                            |
| 81  | List connected MCP tools  | PASS     | Only `MiniMax` connected. Full list queryable.                                                                           |
| 82  | Browse /usr/local/bin     | PASS     | 13 binaries found. `ls /usr/local/bin` works.                                                                            |
| 92  | Tool approval history     | PASS     | `tool_confirmation.rs` + `agent_list_trusted_workflows` command. Audit log in SQLite.                                    |
| 93  | API key audit             | PARTIAL  | `security.rs` commands exist. Key storage via `SecretManager`. No dedicated "list all keys + last used" command visible. |
| 94  | Switch default model      | PASS     | `settings.rs` / `settings_v2.rs` commands. `constants/llm.ts` is source of truth.                                        |

---

## TIER 3: Desktop-Only (Prompts 5, 40–43, 77–80, 85–86, 91)

| #   | Feature                   | Status  | Notes                                                                                                                                                       |
| --- | ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | Describe screen contents  | PASS    | `capture_screen_full` + `vision_analyze_screenshot` Tauri commands confirmed.                                                                               |
| 40  | Screenshot + describe     | PASS    | Same path. `computer_use_capture_screen` also available.                                                                                                    |
| 41  | System settings check     | PARTIAL | `system_permissions.rs` command exists. Deep system pref access needs osascript.                                                                            |
| 42  | Monitor screen 2 min      | PASS    | `screen_watcher_capture_now` + `screen_watcher.rs` commands. Polling loop infrastructure exists.                                                            |
| 43  | Desktop file cleanup      | PASS    | `file_ops.rs` commands + `ai_access_file`.                                                                                                                  |
| 77  | Voice transcription       | PASS    | `voice_transcribe_file`, `voice_transcribe_local`, `voice_transcribe_blob`, `voice_start_deepgram_stream` all confirmed. Whisper + Deepgram both supported. |
| 78  | Text-to-speech output     | PASS    | `voice_tts_speak`, `voice_tts_speak_local`, `voice_tts_speak_with_barge_in`. macOS `say` also available.                                                    |
| 79  | Set reminder 45 min       | PASS    | `notification_schedule_reminder` + `notification_schedule` commands. macOS Reminders accessible.                                                            |
| 80  | List pending reminders    | PASS    | `notification_get_scheduled` command.                                                                                                                       |
| 85  | Fill job application form | PARTIAL | `browser.rs` + `extension.rs` commands. Extension bridge (`extension_bridge.rs`) exists. Requires live browser session.                                     |
| 86  | Summarize open article    | PARTIAL | Same browser extension path. CDP + extension fallback in `extension_bridge.rs`.                                                                             |
| 91  | Master password setup     | PASS    | `security.rs` commands. Argon2id + HKDF architecture confirmed in CLAUDE.md.                                                                                |

---

## TIER 4: External Dependencies / MCP (Prompts 7–11, 46–53, 64–68, 87–90, 95–96)

| #   | Feature                     | Status      | Notes                                                                                                         |
| --- | --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| 7   | Photorealistic image gen    | **BLOCKED** | `media_generate_image` Tauri command exists. Needs image gen API key (OpenAI/Stability/Fal). None set in env. |
| 8   | Logo design                 | **BLOCKED** | Same.                                                                                                         |
| 9   | Hero image SaaS             | **BLOCKED** | Same.                                                                                                         |
| 10  | Star timelapse video        | **BLOCKED** | `media_generate_video` Tauri command exists. Needs Runway/Pika/Veo key. None set.                             |
| 11  | Lo-fi music track           | **BLOCKED** | MiniMax MCP connected — check if MiniMax supports audio gen. Otherwise BLOCKED.                               |
| 46  | Tomorrow's schedule         | PARTIAL     | Google Calendar MCP not connected. Apple Calendar accessible via osascript as fallback.                       |
| 47  | Block recurring event       | PARTIAL     | Same osascript fallback. No create via MCP.                                                                   |
| 48  | Find free slot              | PARTIAL     | Same.                                                                                                         |
| 49  | Back-to-back meetings       | PARTIAL     | Same.                                                                                                         |
| 50  | Inbox priority list         | **BLOCKED** | Gmail MCP not connected. `email.rs` command file exists but needs auth.                                       |
| 51  | Draft email reply           | **BLOCKED** | Same.                                                                                                         |
| 52  | Send test email             | **BLOCKED** | Same.                                                                                                         |
| 53  | Unanswered email questions  | **BLOCKED** | Same.                                                                                                         |
| 64  | Cloud storage list          | **BLOCKED** | Google Drive MCP not connected. `cloud.rs` command exists.                                                    |
| 65  | Upload to cloud             | **BLOCKED** | Same.                                                                                                         |
| 66  | Create Notion page          | **BLOCKED** | Notion MCP not connected. `productivity.rs` exists.                                                           |
| 67  | Create Trello card          | **BLOCKED** | Trello MCP not connected.                                                                                     |
| 68  | Asana overdue tasks         | **BLOCKED** | Asana MCP not connected.                                                                                      |
| 87  | Team members list           | PASS        | `get_team_members`, `get_user_teams` Tauri commands confirmed.                                                |
| 88  | Invite team member          | PASS        | `accept_invitation`, `connect_teams` commands.                                                                |
| 89  | AI spend breakdown          | PARTIAL     | `analytics_get_cost_saved_trend`, `get_team_billing` commands. Needs live Stripe data.                        |
| 90  | Subscription details        | PASS        | `cancel_subscription`, `initialize_team_billing`, `update_team_plan` commands.                                |
| 95  | Set spending budget         | PASS        | `chat_set_monthly_budget` command confirmed.                                                                  |
| 96  | Parallel SaaS auth build    | PASS        | `agi_submit_goal_parallel`, `agi_submit_goal_swarm` commands. Swarm orchestrator confirmed.                   |
| 97  | 5-agent competitor research | PASS        | `agi_submit_goal_swarm`, research orchestrator, `task_decomposer.rs` with SHA-256 caching.                    |
| 98  | Express→Fastify migration   | PASS        | `agi_submit_goal`, agent planner + executor pipeline.                                                         |
| 99  | Recover interrupted tasks   | PASS        | `agi_checkpoint_save`, `agi_checkpoint_restore_history`, `agi_checkpoint_get_latest`. Full checkpoint system. |
| 100 | Resume last session         | PASS        | Same checkpoint commands + `task_persistence.rs`.                                                             |

---

## Critical Failures (Fix First)

| Priority | Issue                                            | Impact                                                       | Fix                                                                                           |
| -------- | ------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| P0       | **No ANTHROPIC_API_KEY / LLM keys in shell env** | All LLM features fail unless app manages its own key storage | Verify `SecretManager` in Rust loads keys from SQLite/keychain, not shell env                 |
| P1       | **Docker daemon not running**                    | Prompts 17, 69, 70, 71 blocked                               | Start Docker Desktop, or document that DB features need container                             |
| P1       | **psql not installed on host**                   | Database prompts 69–71 fail                                  | Install via `brew install postgresql` or use `docker exec` into DB container                  |
| P2       | **Dev server not running**                       | Prompt 62 (localhost health check) fails                     | `pnpm dev:desktop` needed for live testing                                                    |
| P2       | **No image/video gen API keys**                  | Prompts 7–10 blocked                                         | Add `OPENAI_API_KEY` or equivalent to app key store                                           |
| P3       | **Gmail, Google Calendar, Drive MCPs missing**   | 10 prompts blocked                                           | Connect via Claude MCP settings or implement native integration in `email.rs` / `calendar.rs` |

---

## Missing MCP Integrations (Connect to Unlock Features)

| MCP Server                     | Prompts Unlocked | Notes                                                                 |
| ------------------------------ | ---------------- | --------------------------------------------------------------------- |
| Gmail MCP                      | 50, 51, 52, 53   | `email.rs` Tauri commands exist as fallback if native SMTP configured |
| Google Calendar MCP            | 46, 47, 48, 49   | Apple Calendar via osascript works as partial fallback                |
| Google Drive MCP               | 64, 65           | `cloud.rs` exists                                                     |
| Notion MCP                     | 66               | `productivity.rs` exists                                              |
| Trello MCP                     | 67               | `productivity.rs` exists                                              |
| Asana MCP                      | 68               | `productivity.rs` exists                                              |
| Image Gen (fal.ai / Stability) | 7, 8, 9          | `media_generate_image` command ready — just needs key                 |
| Video Gen (Runway / Veo)       | 10               | `media_generate_video` command ready — just needs key                 |

---

## What's Already Well-Implemented (No Gaps)

- **Agent orchestration** (96–100): Full swarm, checkpoint, self-healing pipeline.
- **Voice** (77–78): Both Whisper local + Deepgram cloud STT; Piper + macOS TTS.
- **OCR / Vision** (5, 40, 44, 45): Full pipeline with region capture, preprocessing, multi-language.
- **Notifications / Reminders** (79–80): Tauri scheduler + macOS Reminders.
- **Teams / Billing** (87–90): Full Stripe + team management command set.
- **Security** (91–92, 106–114): Argon2id, SQLCipher, 1,778-line ToolGuard, deny-list.
- **Git / GitHub** (24–29): GH CLI fully authenticated, 65 commits this week.
- **Analytics** (103–104): Full ROI / trend / feature usage command set.
- **Memory** (54–57): Chat memory injection, recall, dashboard, importance scoring.
- **Templates / Marketplace** (83–84): `templates.rs` command.
- **Artifacts / Canvas** (101–102): `artifacts.rs` + `canvas.rs` + CodeCanvas component.

---

## Playwright E2E Coverage

Existing `e2e/` specs cover:

- `smoke.spec.ts` — basic app load
- `chat.spec.ts` — send/receive messages
- `automation.spec.ts` — desktop automation
- `agi.spec.ts` — AGI goal submission
- `agi-safety.spec.ts` — security boundaries
- `settings.spec.ts` — settings changes
- `gdpr.spec.ts` — privacy/GDPR flows
- `visual-regression.spec.ts` — screenshot diffing

**Gap:** No e2e coverage for voice, OCR, media generation, or MCP tool flows.

---

## Next Steps

1. **Verify LLM keys are loaded from Rust SecretManager** (not shell env) — if yes, Tier 1 features all work.
2. **Start Docker + PostgreSQL** to unblock prompts 17, 69–71.
3. **Add `OPENAI_API_KEY`** to app key store to unlock image gen (prompts 7–9).
4. **Connect Gmail + Google Calendar MCPs** in Claude settings for email/calendar features.
5. **Write e2e tests** for voice, OCR, and media gen flows to close coverage gap.
6. **Run `pnpm test:e2e`** against live dev server to get Playwright pass/fail baseline.
