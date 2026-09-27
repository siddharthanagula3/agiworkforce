# Unlinking a device on web doesn't cut its live relay

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

Web revocation posts to the signaling server (`apps/web/lib/device-steps/device-registry.ts:189-208`). But the server binds a socket to a device only in `bindDevice` (`services/signaling-server/src/connection-manager.ts:141`), which only tests call, and the desktop's register message carries no device id. So a revoked device's live remote-control relay stays up until the desktop itself stops it. Found by the second reviewer.
