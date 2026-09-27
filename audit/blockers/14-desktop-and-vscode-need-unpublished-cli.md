# The CLI has no signed release yet

Found by the code audit of `21d4395` on 2026-09-26. The code side is fixed; what remains is owner only. Delete this file after the first signed release installs cleanly, and mark S72.35 cli `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

- **Done in code.** The desktop installer bundles the CLI and the input helper for its own architecture (`apps/desktop/electron/bundleBinaries.mjs`), and local sessions run that bundled CLI (`apps/desktop/electron/runtime/developerSessionService.ts:160`). The installer and the updater accept only a release whose manifest is signed (`apps/web/public/install.sh:139`, `apps/cli/src/update_check.rs:221`).
- **Owner.** Set the `AGI_CLI_RELEASE_SIGNING_KEY` secret, publish the first signed release, then mark the CLI available (`apps/web/lib/surface-status.ts:7` and its test). To rotate the key later: pin the new public key beside the old one, release once with the old key, switch the secret, then drop the old key.
- **Until then.** Desktop local coding and VS Code chat work only from a source build, and the `/cli` page says the CLI is coming soon.
