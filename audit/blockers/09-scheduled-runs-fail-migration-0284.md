# Every scheduled or triggered run fails (migration 0284)

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

The scheduled-run executor writes a "context manifest" that names nine columns that exist only in pending migration 0284 (`scheduled-agent-executor.ts:593` → `packages/platform/context-engine/src/manifest-store.ts:56-60`). The insert isn't guarded, so every run, whether cron, "Run now", webhook or Slack-triggered, is recorded as failed before the model is called. Chat is unaffected. The second reviewer verified this independently. **Fix:** ship 0284, or guard the manifest write so a failure doesn't kill the run.

Related routine defects: Gmail triggers can never fire, because they're created pending and no mailbox watch is registered (`apps/web/lib/triggers/trigger-service.ts:266`). The schedule form also says runs don't use memory or tools, but the executor loads memory and offers web search, code and Always-allow connectors.
