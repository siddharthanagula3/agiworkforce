# The CLI has no signed release yet

Found by the code audit of `21d4395` on 2026-09-26; re-checked 2026-11-11. The code side is ready; what remains needs the owner's GitHub account. Delete this file after the first signed release installs cleanly, and mark S72.35 cli `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

- **Done in code.** The desktop installer bundles the CLI and the input helper for its own architecture (`apps/desktop/electron/bundleBinaries.mjs`), and local sessions run that bundled CLI (`apps/desktop/electron/runtime/developerSessionService.ts`). The installer and the updater accept only a release whose manifest is signed (`apps/web/public/install.sh`, `apps/cli/src/update_check.rs`). `.github/workflows/release-cli.yml` can be run by hand to build and smoke all six archives without signing or publishing.
- **Not yet proven.** No run of `release-cli.yml` has completed (the last, for `v-cli-1.0.0` on 2026-05-03, failed on a workflow since rewritten), so the Windows arm64, Linux arm64 and macOS Intel builds have never been produced. The manual run proves them before a key exists.
- **Owner.** Follow `docs/runbooks/cli-release.md`: create the P-256 release key, set the `AGI_CLI_RELEASE_SIGNING_KEY` secret, deploy the web app once the public key is pinned in `install.sh`, push the `v-cli-<version>` tag, then mark the CLI available (`apps/web/lib/surface-status.ts` and its test).
- **Until then.** Desktop local coding and VS Code chat work only from a source build, and the `/cli` page says the CLI is coming soon.
