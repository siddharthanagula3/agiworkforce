# Master Fix Plan — Risk Remediation

_Last updated: 2026-03-20_
_Status: Phase 1 COMPLETE, Phase 2 partially complete_

## Current State

| Risk Factor     | Before   |                    After (2026-03-20) | Target       |
| --------------- | -------- | ------------------------------------: | ------------ |
| Wire ratio      | 24%      |                       45% (643/1,439) | 80%+         |
| Build warnings  | 47       |                                     0 | 0            |
| Agent loop bugs | Multiple | Most fixed (app_handle still missing) | 0            |
| IPC casing      | Unknown  |          Audited, major fixes applied | 0 violations |
| Model ID drift  | Severe   |            Identified (7 phantom IDs) | 0 stale IDs  |

## Remaining Work

### Wire Ratio (45% → 80%)

~796 unwired Tauri commands remain. Top modules to wire:

- `database.rs` (64 commands)
- `tutorials.rs` (21 commands)
- `background_tasks.rs` (18 commands)
- `ocr.rs` (16 commands)
- `api.rs` (15 commands)
- `orchestration.rs` (14 commands)

### Model Catalog Sync

- Replace 7 phantom model IDs in `llm_router.rs`
- Sync desktop `models.json` from web version
- Update mobile + vscode + gateway model references to `gpt-5.4` family

### Agent Runtime

- Set `app_handle` on cloned autonomous agent
- Add frontend listeners for budget/iteration/swarm events
- Register cancellation token in research sessions

See `TODO.md` for the full bug list from the 23-agent audit.
