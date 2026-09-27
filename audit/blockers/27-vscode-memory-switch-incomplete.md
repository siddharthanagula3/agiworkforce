# VS Code's memory switch

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

"Off" hides only the extension's fact block. The CLI runtime still injects memory and saves new memories (`apps/cli/src/agent/mod.rs:575-580`).
