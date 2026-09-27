# Unenforced step-up

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

Four step-up actions are defined but never enforced: account delete, email change, revoke all sessions, and reveal API credential. Mobile does role changes and account deletion with no step-up.
