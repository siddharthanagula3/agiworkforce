# Tool Folder Classification

Status: Current assessment
Owner: Platform lead
Last updated: 2026-05-20

Purpose: classify hidden tool folders before any move/delete. Do not move these folders until this ledger has an accepted decision for the folder.

| Path               | Classification                        | Tracked policy     | Owner                   | Decision                                                                                  |
| ------------------ | ------------------------------------- | ------------------ | ----------------------- | ----------------------------------------------------------------------------------------- |
| `.claude/`         | Tool context                          | Partially tracked  | Platform + Claude users | Keep project-shared agents/settings that help the team; keep local/session files ignored. |
| `.codex/`          | Tool context                          | Partially tracked  | Platform + Codex users  | Keep project-shared agent TOML/config if actively used.                                   |
| `.cursor/`         | Tool context                          | Partially tracked  | Platform + Cursor users | Keep hook definitions only after security review; document what each hook can execute.    |
| `.opencode/`       | Tool context/plugin code              | Partially tracked  | Platform                | Keep only if used by developers; otherwise move to `tools/opencode/` or archive.          |
| `.agents/`         | Agent skills                          | Partially tracked  | Platform                | Keep team skills only after license/purpose review.                                       |
| `.agent/`          | Local/legacy tool context             | Unknown            | Platform                | Review; likely ignore/archive unless still used.                                          |
| `.minimax/`        | Tool skills                           | Unknown            | Platform/docs           | Review for generated document skills; likely ignore unless intentionally team-shared.     |
| `.superpowers/`    | Historical planning/tool context      | Unknown            | Docs/platform           | Move durable content to docs or archive; ignore local cache.                              |
| `.remember/`       | Local memory/cache                    | Ignored/local      | Platform                | Keep ignored; do not track local memory.                                                  |
| `.playwright-mcp/` | Generated browser automation captures | Mixed/tracked debt | QA/platform             | Move durable screenshots to `reports/`; ignore transient console/page captures.           |
| `.mcp.json`        | Local MCP credentials/config          | Ignored/local      | Security/platform       | Never track unless converted to sanitized `.mcp.example.json`.                            |
| `.env.local`       | Local secrets/config                  | Ignored/local      | Security/platform       | Never track.                                                                              |

## Required Follow-Up

- Add a short contract file for each kept tool folder.
- Add ignore rules for transient `.playwright-mcp` logs/page captures after durable reports are moved.
- Add security review before keeping executable Cursor/opencode hooks.
- Add sanitized examples for local credential/config files.
