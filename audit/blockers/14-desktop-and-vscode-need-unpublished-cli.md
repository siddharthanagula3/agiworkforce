# Desktop local sessions and VS Code chat need a CLI nobody can install

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

- **Desktop.** The desktop app's local coding sessions spawn `agi app-server` from whatever is on the user's PATH (`apps/desktop/electron/runtime/developerSessionService.ts:684-692`). The installer bundles only the input helper.
- **VS Code.** The extension's chat and session list run on the same CLI runtime. Its own code says `CLI_IS_PUBLISHED = false` and tells users to build it from source (`apps/extension-vscode/src/integrations/localRuntimeClient.ts:74`).
- **The CLI itself.** The installer and updater refuse archives that lack signed checksums, and no signed release exists (`apps/cli/src/lib.rs:766-785`).
- **Consequence.** Desktop local coding and VS Code chat are real code that a customer can't use today. The `/cli` marketing page calls the CLI "released".
