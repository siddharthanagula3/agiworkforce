# Approval gate: The web default is "autonomous"

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

The product promises that, under "Ask before every action", nothing with side effects runs without the user's say-so. That promise doesn't hold on seven paths. The second reviewer re-confirmed all of them line by line.

An account that has never chosen a policy gets `autonomous` (`apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:141-145`, applied through `tool-metadata.ts:381-391`). That's a product choice, but it contradicts the "asks each time" copy on connector consent.
