# Routine trigger defects

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

- **Gmail triggers can never fire.** They're created pending, and no mailbox watch is ever registered (`apps/web/lib/triggers/trigger-service.ts:266`).
- **The schedule form misdescribes runs.** It says scheduled runs don't use memory or tools, but the executor loads memory and offers web search, code and Always-allow connectors.

The run failure this file first described (a context manifest insert needing migration 0284) no longer happens: production has applied 0284 since before 2026-09-27 and is now at 0294.
