# Approval gate: The CLI's approval setting does nothing

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

The product promises that, under "Ask before every action", nothing with side effects runs without the user's say-so. That promise doesn't hold on seven paths. The second reviewer re-confirmed all of them line by line.

`approval_mode` is written by onboarding (`apps/cli/src/onboarding.rs:716-760`) and merged from managed policy, but nothing reads it. The applied default is `permission_mode` (`apps/cli/src/permissions.rs:171-175`, `apps/cli/src/config.rs:103-115`). The approval audit recorder is never called either. So an admin's managed approval policy does nothing in the CLI.
