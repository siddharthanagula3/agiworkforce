# AGI Workforce - TODO

## Session 2: 2026-01-31 - COMPLETE ✅

---

## ✅ COMPLETED (This Session)

### Feature: Folder Selector in Chat Input

- [x] Created FolderSelector.tsx component
- [x] Extended projectStore.ts with folder state
- [x] Integrated folder selector into InputToolbar.tsx
- [x] Added project context to chat messages
- [x] Created project_context.rs backend module
- [x] Registered Tauri commands for project folder
- [x] Added project context to LLM system prompt
- [x] Updated tool executor to respect project folder
- [x] Relative paths resolve against project folder

### Fix: Database Tools

- [x] Fixed db_query - now executes real SQLite SELECT queries
- [x] Implemented db_execute with INSERT/UPDATE/DELETE support
- [x] Implemented db_transaction_begin
- [x] Implemented db_transaction_commit
- [x] Implemented db_transaction_rollback
- [x] Added SQL injection protection

### Fix: Missing Tool Implementations

- [x] Implemented api_upload (multipart file upload)
- [x] Implemented git_init (git repository init)
- [x] Implemented github_create_repo (GitHub API via gh CLI)
- [x] Implemented physical_scrape (web scraping with anti-bot UA)

### Fix: Tool-Chat Integration

- [x] Verified tool event flow is working
- [x] Enhanced ActiveToolStreamsDisplay for 3s visibility after completion
- [x] Confirmed action trail shows tool execution

---

## 🟢 ALL PREVIOUS ITEMS COMPLETED

### Session 1 (2026-01-31)

- [x] Implemented 9 missing tool handlers (file*list, memory*_, browser\__, api_download)
- [x] Updated README.md to v1.0.9
- [x] Fixed RiskConfirmationDialog.tsx lint warning
- [x] Pushed to GitHub main

---

## 🔵 FUTURE ENHANCEMENTS (Optional)

- [ ] Add folder history persistence across sessions
- [ ] Auto-detect project root (.git, package.json, etc.)
- [ ] Add nested project support (monorepos)
- [ ] Add per-tool folder exceptions
- [ ] ExtensionBridge native messaging (deferred - using Playwright)
- [ ] E2E testing for folder scope feature

---

## BUILD STATUS

| Check            | Result                  |
| ---------------- | ----------------------- |
| TypeScript       | ✅ 0 errors             |
| ESLint           | ✅ 0 errors, 2 warnings |
| Rust cargo check | ✅ Pass                 |
| Desktop tests    | ✅ 746 passed           |
| Web tests        | ✅ 661 passed           |

---

_Session completed: 2026-01-31_
