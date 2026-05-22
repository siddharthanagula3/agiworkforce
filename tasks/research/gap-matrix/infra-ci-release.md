# Gap Matrix — Infra / Release / CI vs Anthropic's Release Pipeline

**Scope:** `.github/workflows/` (10 active workflows — note CLAUDE.md says "8" but there are 10), `scripts/` (17 files + `scripts/homebrew/`), `dev-scripts/` (2 files), root configs (`Cargo.toml`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.npmrc`, `.nvmrc`, `commitlint.config.cjs`, `.prettierrc.json`, `.prettierignore`, `.husky/{commit-msg,pre-commit,pre-push}`, `.gitattributes`, `.gitignore`), root `app.json` (Expo placeholder stub), and select linked surface configs (`apps/desktop/src-tauri/tauri.conf.json`, `apps/mobile/{app.json,eas.json}`, `apps/extension/native-host/com.agiworkforce.browser.json.template`).

**Reference (Anthropic Claude Suite, May 2026):** §2.5 native OS integration, §2.6 auto-update + footprint (Stable / Beta channels, Squirrel.Mac, Squirrel.exe, MSIX with `CoworkVMService`, Hyper-V), §2.3 `.mcpb` desktop extensions, §5.1 install (curl `install.sh`, `brew install --cask claude-code`, `npm install -g @anthropic-ai/claude-code`), §6.x mobile (App Store / Play Store), §7 Chrome ext (Web Store), §8 VS Code (Marketplace), §C recent changes log.

**Method:** Read every workflow + script + config in full, cite file:line, grep before declaring missing.

---

## HAVE (one line each — current ground truth)

- **CI workflow** (`.github/workflows/ci.yml:1-364`): Linux runner, lint + typecheck + test + Rust audit + clippy (lib, default features) + Tauri IPC wiring + macOS+Windows Rust smoke jobs gating release-desktop. 10 jobs total across the file once you count the matrix-fanout.
- **Desktop release pipeline** (`.github/workflows/release-desktop.yml:1-524`): triggers on `v*` tags, prepares draft GitHub Release, builds Linux AppImage via `tauri-action@84b9d35` (v0.6.2 SHA-pinned), pushes signed `.AppImage.tar.gz` + `.sig` to GH release, calls Supabase RPC `upsert_release` to update releases DB, publishes draft. **Linux-only** since Wave 1 (`release-desktop.yml:1-29`) — macOS + Windows jobs deleted because Apple cert + Windows EV cert are not configured.
- **CLI release pipeline** (`.github/workflows/release-cli.yml:1-196`): triggers on `v-cli-*` tags. Cross-builds 5 platform binaries (darwin-arm64, darwin-x64, linux-x64, win-arm64, win-x64; **linux-arm64 dropped** v1.0 due to openssl-sys cross-compile, comment lines 41-46), publishes 7 npm packages (1 wrapper + 6 platform binaries), creates GitHub release with tarballs.
- **Generic release fallback** (`.github/workflows/release.yml:1-211`): manual-only `workflow_dispatch`, supports macOS-universal target (`--target universal-apple-darwin`, line 103) and accepts the six APPLE\_\* secrets in env block at lines 175-180 — but is **not the active path** (release-desktop.yml is); kept as lever for future macOS/Windows revival.
- **Windows manual release** (`.github/workflows/build-windows-release.yml:1-149`): `workflow_dispatch` only, builds NSIS `.exe` installer with feature-set `shell,updater,billing,devtools,vad,remote-databases` (line 131), uploads to existing release. Includes Tauri SHA256 timestamping setup for SQLCipher (LIBCLANG_PATH, OPENSSL_DIR fallback chain at lines 75-95). **Not used** since v1.x SSL.com EV cert was not paid for.
- **Rust security workflow** (`.github/workflows/codeql.yml:1-67`): weekly Mon 04:17 UTC + on push/PR for `**/*.rs|Cargo.toml|Cargo.lock`, runs cargo-audit + clippy. Despite the file name, **JS/TS CodeQL is delegated to GitHub's default CodeQL setup** (line 3 comment).
- **E2E tests workflow** (`.github/workflows/e2e-tests.yml:1-150`): nightly @ 2 AM UTC + on push/PR touching `apps/desktop/**`, runs Playwright `--project=smoke` and `--project=chat` against Vite dev server.
- **Signaling-server deploy** (`.github/workflows/deploy-signaling-server.yml:1-260`): builds Docker `linux/amd64,linux/arm64` multi-arch (line 132), pushes to GHCR with `attest-build-provenance@v4` (line 136), deploys to Railway (auto-on-main if `vars.RAILWAY_PUBLIC_URL` set) or Fly.io (manual `workflow_dispatch`). Includes health-check retries + advisory image-pruning.
- **PR bot** (`.github/workflows/agiworkforce-bot.yml:1-268`): handles `/agi help|review|explain|check|stats` slash-comments on PRs.
- **Pinned-actions check** (`.github/workflows/actions-pinned-check.yml:1-54` + `scripts/check-action-pins.sh:1-83`): rejects any third-party action not pinned to a 40-char SHA. Allowlist: `actions/*`, `github/*`, `microsoft/*`, in-repo reusable workflows.
- **Hardcoded-model gate** (`scripts/check-no-hardcoded-models.sh:1-106`): two-gate Rust regression check enforcing CLAUDE.md rule #1; complements ESLint's TS/JS coverage. Wired into ci.yml line 77.
- **install.sh** (`scripts/install.sh:1-244`): supports `curl ... | bash`, platform detection (darwin/linux/windows × arm64/x64, Rosetta + musl detection lines 60-72), tag-prefix `v-cli-`, fallback build-from-source instructions.
- **Homebrew tap automation** (`scripts/update-homebrew-tap.sh:1-99`): generates `Formula/agiworkforce.rb` with sha256 hashes from GH release tarballs, commits/pushes to `siddharthanagula3/homebrew-tap`. Static template at `scripts/homebrew/agiworkforce.rb` with `PLACEHOLDER_SHA256_*` strings (overwritten by the script).
- **npm publish** (`scripts/publish-cli.sh:1-103`): publishes `@agiworkforce/cli` (wrapper) + `@agiworkforce/cli-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-arm64,win32-x64}` to npm. Wired into `release-cli.yml:138-167`.
- **Launch readiness check** (`scripts/launch-readiness-check.sh:1-148`): pre-tag gate verifying git clean, cargo workspace green, CLI tests green, version match between `Cargo.toml` and `apps/cli/npm/package.json`, 22-subcommand smoke test.
- **Verify-surfaces harness** (`scripts/verify-surfaces.sh:1-132`): per-surface typecheck + test pass; modes: `all|fast|cli|desktop|web|mobile|chrome|vscode|services|packages|desktop-build`.
- **Tauri auto-update endpoint configured** (`apps/desktop/src-tauri/tauri.conf.json:76-84`): polls `https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}`, validates `.sig` against minisign pubkey (line 80, base64-encoded), `installMode: "passive"` on Windows.
- **Tauri deep-link scheme** (`apps/desktop/src-tauri/tauri.conf.json:69-75`): registers `agiworkforce://` for desktop only (mobile array empty); equivalent to Claude's `claude://` scheme.
- **Tauri code-signing config (macOS-only at config level)** (`apps/desktop/src-tauri/tauri.conf.json:60-67`): `signingIdentity: "Developer ID Application: AGI AUTOMATION LLC (D2PR62RLT4)"`, `providerShortName: "D2PR62RLT4"`, references `entitlements.plist` and `Info.plist`. **Config is wired but workflow secrets are not present** so the cert is never used in CI.
- **NSIS Windows installer config** (`apps/desktop/src-tauri/tauri.conf.json:48-58`): SHA-256 digest, DigiCert timestamp URL, `installMode: "currentUser"`, single-language ("English").
- **Mobile EAS build config** (`apps/mobile/eas.json:1-40`): three profiles (development, preview, production); production sets `autoIncrement: true`, channel `production`, `m-medium` resource class iOS, `app-bundle` Android. Submit profile only configures Android `track: internal` — **iOS submit profile missing entirely**.
- **Mobile app.json** (`apps/mobile/app.json:1-137`): bundle id `com.agiworkforce.app`, scheme `agiworkforce`, full Apple privacy manifest with usage descriptions and `NSPrivacyAccessedAPI*` reasons, intent filters for Android share-target, 13 Expo plugins including `expo-updates`, `expo-local-authentication`, `expo-notifications`, `expo-secure-store`, `expo-apple-authentication`. Note `extra.eas.projectId: "agi-workforce"` is a **placeholder string**, not a real EAS UUID — line 133.
- **Native-messaging host template** (`apps/extension/native-host/com.agiworkforce.browser.json.template:1-9` + `INSTALL.md:1-96`): MV3 extension declares `nativeMessaging` permission, host name `com.agiworkforce.browser`, manifest template + per-OS install instructions.
- **VS Code ext packaging** (`apps/extension-vscode/scripts/vsce-package.js`, `apps/extension-vscode/package.json` script `package: "node esbuild.js --production && node scripts/vsce-package.js package --no-dependencies"`, `@vscode/vsce@^3.7.1` devDep): produces a `.vsix`. **No `vsce publish`** wiring in any GitHub workflow.
- **Chrome ext packaging** (`apps/extension/package.json` script `package: "pnpm build && cd dist && zip -r ../extension.zip . -x '*.map'"`): outputs `extension.zip`; manual upload to Chrome Web Store. **No CWS auto-publish workflow.**
- **Pinned toolchains:** Node 22 (`.nvmrc:1`, `package.json:14`), pnpm 9.15.3 (`package.json:12, 15`), Rust 1.94.0 (every workflow declares `RUST_VERSION: '1.94.0'`), TypeScript pinned at 5.9.3 via `pnpm.overrides.typescript` (`package.json:49`). `engines.node: "22"` in package.json.
- **Husky hooks** (`.husky/{commit-msg, pre-commit, pre-push}`): commit-msg runs `commitlint --edit "$1"` (`commit-msg:1`), pre-commit runs `lint-staged` (`pre-commit:1`), pre-push **disabled** (`pre-push:1` — comment-only).
- **Commitlint** (`commitlint.config.cjs:1`): `extends: ['@commitlint/config-conventional']` only (no custom max-length config — but CLAUDE.md says ≤100 chars; this is enforced _by convention_, not by the file).
- **Prettier config** (`.prettierrc.json:1-9`): semi true, single-quote, trailing-comma all, printWidth 100, LF endings.
- **lint-staged** (`package.json:93-101`): eslint --fix + prettier on JS/TS, prettier on JSON/MD/CSS/YAML.
- **Workspace deps script** (`scripts/expand-workspace-deps.py:1-152`): one-off helper for porting codex-rs crates; references `~/Desktop/reference/codex-cli/codex-rs/Cargo.toml`. Out-of-band (not CI).
- **Cargo workspace** (`Cargo.toml:1-42`): 14 active members via `crates/*` glob + 2 explicit (apps/cli, apps/desktop/src-tauri). Profile.release locked to `lto=true, opt-level="z", strip=true, panic="abort"`. Patches `tokio-tungstenite` + `tungstenite` to OpenAI's forks.
- **dev-scripts** (`dev-scripts/{reset-app-mac.sh, reset-app.ps1}`): per-OS local dev-data reset.

---

## PARTIAL — 14 categories with named gaps

### P-1. Auto-update channels (Stable / Beta) — wired endpoint, missing channel routing

- **Have:** Tauri updater endpoint at `tauri.conf.json:76-84` polls `https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}`. Workflow `release-desktop.yml:46-54` accepts `channel` input (stable | beta | nightly).
- **Missing:** the endpoint URL takes no `{{channel}}` template variable, so all installations look at the same release feed. Anthropic ships a per-channel feed (stable cohort weekly; beta cohort daily-ish per §2.6). Add `{{channel}}` placeholder + extend `apps/web/api/releases/[target]/[current_version]/route.ts` to filter by `channel` column in the releases table. The Supabase `upsert_release` RPC at `release-desktop.yml:386-398` already passes `p_channel` so the data is there — only the _consumer_ side is missing.
- **Effort:** 1 day. Per-axis: 50%.

### P-2. macOS Squirrel.Mac auto-installer — built-in via Tauri but no notarized bundle

- **Have:** Tauri's `tauri-plugin-updater` ships an in-app updater equivalent to Squirrel.Mac (silent download, signature-verify, restart-prompt). `tauri.conf.json` contains the required `signingIdentity` and `providerShortName`.
- **Missing:** the **APPLE_CERTIFICATE / APPLE_CERTIFICATE_PASSWORD / APPLE_SIGNING_IDENTITY / APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID secrets are not present in the active workflow** (`release-desktop.yml:1-29` explicitly documents this). The `release.yml:175-180` block references them but is `workflow_dispatch`-only and doesn't actually run on tags. Result: macOS DMGs are not signed nor notarized in CI; the universal-binary build target (`--target universal-apple-darwin` at `release.yml:103`) is dormant. Code-signing identity `D2PR62RLT4` is hardcoded but useless without secrets in repo.
- **Effort:** 1 day to upload the existing Developer ID cert (per release-desktop.yml:9-13) + 1 day to revive the `build-macos` job. Per-axis: 30% (config exists, secrets+job missing).

### P-3. Windows MSIX + CoworkVMService — none; only NSIS

- **Have:** NSIS `.exe` installer config at `tauri.conf.json:51-55` and a manual workflow at `build-windows-release.yml`.
- **Missing entirely:** **MSIX target is not configured in `tauri.conf.json`** — there's no `bundle.windows.msix` block, and `tauri.conf.json:40` says `"targets": "all"` (so Tauri _would_ try to bundle MSIX if MSIX-Toolkit were available, but the CI doesn't install it). No `CoworkVMService` (Anthropic uses this Windows service to spawn a Hyper-V VM for Cowork). No Hyper-V VM bundle download. No `vm_bundles/agivm.bundle` or equivalent. No Code-signing via SSL.com EV cert. The release-desktop.yml lines 14-16 explicitly call out the EV-cert gap.
- **Effort:** 2 weeks (1w MSIX-Toolkit integration + signed package + VM service stub, 1w VM bundle pipeline). Per-axis: 5%.

### P-4. Apple notarization + universal binary — config-only, no execution

- **Have:** `--target universal-apple-darwin` flag in `release.yml:103`. Tauri config has macOS bundle metadata.
- **Missing:** `tauri-action` v0.6.2 reads `APPLE_*` secrets from env to call `xcrun notarytool` and `stapler` automatically — but those env vars are _not piped through_ in `release-desktop.yml:322-326` (only `TAURI_SIGNING_*`). The `release.yml` flow does pass them (lines 175-180) but doesn't trigger on tags. Net: no notarization happens for the active Linux-only release path. Universal binary requires both `aarch64-apple-darwin` and `x86_64-apple-darwin` Rust targets installed (only `release.yml:128-132` does this; `release-desktop.yml` does not).
- **Effort:** 0.5 day (re-pipe APPLE\_\* secrets through release-desktop.yml + add target install) once the cert is uploaded. Per-axis: 30%.

### P-5. Hyper-V VM bundle — not present at any layer

- **Have:** Nothing.
- **Missing:** Anthropic Cowork ships a `claudevm.bundle` (~1.5 GB Apple Virtualization Framework image on macOS, Hyper-V on Windows) downloaded on first launch. There is no equivalent in this repo: no VM image, no download URL config, no Hyper-V provisioner, no `lima.yaml` / `tart` / Apple `Virtualization.framework` integration. Cowork-equivalent is not in scope per current product positioning, but if Cowork is ever to be matched (per `decisions-locked.md` §A), the entire pipeline must be authored.
- **Effort:** 4–6 weeks. Per-axis: 0%.

### P-6. Native-messaging host installer — manifest template, no installer

- **Have:** `apps/extension/native-host/com.agiworkforce.browser.json.template:1-9` + `INSTALL.md:1-96` providing per-OS install paths and HKCU registry instructions for Windows. `nativeMessaging` permission declared in `apps/extension/manifest.json:12`.
- **Missing:** **No installer ships the manifest** — users must manually copy the template, replace `<EXTENSION_ID_PLACEHOLDER>`, and place it at the correct OS-specific path. No `agi-workforce-bridge` binary referenced in the template (line 4) — the path `/Applications/AGI Workforce.app/Contents/MacOS/agi-workforce-bridge` assumes a binary that the desktop app must install but the desktop bundle config does not declare it. No Linux `.deb`/`.rpm` post-install hook. No Windows registry entry created by the NSIS installer. This is the open P2 from FINAL_AUDIT (`MEMORY.md:apps/extension`).
- **Effort:** 2 days (1d add post-install scripts in NSIS+pkg+deb to write the manifest; 1d ship the bridge binary side-by-side with the main app). Per-axis: 25%.

### P-7. Squirrel.exe installer — N/A; replaced by NSIS, but no auto-update parity

- **Have:** NSIS installer at `tauri.conf.json:51-55` with `installMode: "currentUser"`.
- **Missing:** Squirrel.Windows-style differential updates are not configured. Tauri's updater on Windows does full-binary replacement (`installMode: "passive"` at `tauri.conf.json:82`), which is functional but not as smooth as Squirrel. Also missing: per-machine vs per-user installation toggle; this hardcodes per-user, which conflicts with enterprise IT policies that demand per-machine MSI/MSIX. Anthropic's Stable + Beta channels (§2.3) are not split here.
- **Effort:** 1 day for per-machine NSIS variant, 3 days for differential-update server. Per-axis: 60% (functional but not feature-equivalent).

### P-8. Linux .deb / .rpm / .AppImage signed packages — AppImage only

- **Have:** `release-desktop.yml:330-338` uploads `.AppImage` + `.AppImage.tar.gz` + `.AppImage.tar.gz.sig` (Tauri minisign).
- **Missing:** No `.deb` or `.rpm` build despite `tauri.conf.json:40` `"targets": "all"`. The Linux deps installed in `release-desktop.yml:276-297` cover `.AppImage` build (`appimagetool` is bundled by tauri-action) but no `dpkg-deb` packaging customization, no `lintian` lint, no APT/YUM repo publishing, no Flatpak manifest, no Snap config. AppImage is unsigned aside from the minisign update bundle (no GPG-signed artifact). No `dpkg-sig`, no Linux package-manager integration. Linux users cannot `apt install agiworkforce`.
- **Effort:** 3 days (.deb + .rpm + signed by GPG key, APT/YUM repo on agiworkforce.com). Per-axis: 30% (AppImage works, distro packages missing).

### P-9. Chrome Web Store auto-publish — only zip + manual upload

- **Have:** `apps/extension/package.json:scripts.package` script that builds + zips: `pnpm build && cd dist && zip -r ../extension.zip . -x '*.map'`.
- **Missing:** No GitHub workflow that calls `chrome-webstore-upload-cli` or the official Web Store API. No `CHROME_WEBSTORE_*` secrets. The CWS publish step from FINAL_AUDIT 2026-05-05 is documented as "CWS-READY" — meaning the zip is ready for manual upload — but auto-publish is **not** wired. The legacy `.js` files were deleted (per MEMORY) but the publishing path is unchanged.
- **Effort:** 1 day (add `chrome-webstore-publish.yml` workflow with OAuth refresh flow). Per-axis: 40%.

### P-10. VS Code Marketplace publish — vsce package only, no publish

- **Have:** `apps/extension-vscode/scripts/vsce-package.js` produces a `.vsix`. `package.json` declares `publisher: "agiworkforce"`. devDep `@vscode/vsce@^3.7.1`.
- **Missing:** No `vsce publish` step in any workflow. No `VSCE_PAT` secret. No Open VSX publish (Anthropic publishes to both Marketplace and Open VSX per §8). No release.yml branch to publish on tag-push for `v-vscode-*`.
- **Effort:** 0.5 day. Per-axis: 50% (package built, publish not wired).

### P-11. npm publish — wrapper + 6 binaries shipped, but linux-arm64 and version-bump policy gaps

- **Have:** `release-cli.yml:138-167` calls `scripts/publish-cli.sh` which publishes 7 packages (`@agiworkforce/cli` + 6 platform packages) using `NPM_TOKEN`. `id-token: write` permission set for npm provenance.
- **Missing:** **`linux-arm64` is dropped** from the matrix per `release-cli.yml:41-46` (openssl-sys cross-compile issue) — users on linux-arm64 must `cargo install`. **`linux-x64-musl` is undeclared** — only glibc is built. No `linux-x86_64-musl` variant for Alpine. `scripts/publish-cli.sh:62-87` writes a fresh `package.json` for each platform package on each publish, which is fine but doesn't include `engines.node`, `bin` field, or post-install verification (Anthropic's CLI uses a post-install script to verify the platform binary loads). No `npm provenance` flag passed in `publish-cli.sh:86` despite workflow having `id-token: write`. No automated changelog generation for npm.
- **Effort:** 1 day (provenance + bin field + linux-musl); linux-arm64 needs rustls migration, 3 days. Per-axis: 75%.

### P-12. Homebrew tap — manual update script, no auto-trigger

- **Have:** `scripts/update-homebrew-tap.sh:1-99` generates `Formula/agiworkforce.rb` with sha256 hashes; `scripts/homebrew/agiworkforce.rb:1-43` is the static template.
- **Missing:** No GitHub workflow that **triggers** `update-homebrew-tap.sh` on `v-cli-*` tag push. The script must be run manually (per `launch-readiness-check.sh:139` "5. ./scripts/update-homebrew-tap.sh 1.0.0"). Anthropic auto-updates `homebrew-tap` via release workflow. Also, the static template at `scripts/homebrew/agiworkforce.rb:11` has `version "1.0.0"` hardcoded with `PLACEHOLDER_SHA256_*` strings — this file is divergent from the auto-generated one (which omits `linux-arm64`); commits drift here will be confusing. The `--cask` flavor (Anthropic ships `claude-code` as a cask, brew install --cask) is not present — only formula. linux-arm64 still missing in the formula (matches release-cli.yml).
- **Effort:** 1 day (homebrew-publish.yml workflow that pushes to homebrew-tap repo on tag); 1d to ship a `--cask` variant for the desktop DMG. Per-axis: 60%.

### P-13. install.sh — works, but version selection logic stale + signature verify missing

- **Have:** `scripts/install.sh:1-244` with platform detection, Rosetta, musl, env-aware shell config update.
- **Missing:** No **GPG/minisign verification** of the downloaded tarball — if the GitHub release URL were compromised, installs would silently install malicious binaries. Anthropic's `install.sh` for Claude Code verifies signatures (per §5.1). The `sha256sums.txt` pattern is not implemented. The `--channel` flag from release-desktop.yml is not exposed via install.sh (no way for users to opt into Beta from `curl ... | bash`). The script's version-fallback at lines 96-99 hardcodes `${TAG_PREFIX}1.0.0` — stale once newer versions exist. The script does not verify Node version (CLI is a Rust binary, this is fine, but `pnpm` users need this).
- **Effort:** 1 day (sha256 + minisign verify + channel flag). Per-axis: 70%.

### P-14. EAS code-signing for Expo + App Store Connect API — partial: prod build configured, submit half-wired

- **Have:** `apps/mobile/eas.json:22-31` production profile with `autoIncrement: true`, channel `production`. App.json has full Apple privacy manifest (`apps/mobile/app.json:28-49`) and Android permissions/intent filters. `expo-updates` plugin loaded for OTA.
- **Missing:** `eas.json:33-39` declares only Android `submit.production.android.track: "internal"` — **no `submit.production.ios.appleId` / `ascAppId` / `appleTeamId` block**, so `eas submit -p ios` will fail. **No EAS code signing key** configured (Expo's "code signing" feature for OTA updates needs `expo-updates.codeSigning` block — not declared in `app.json:114`). `app.json:131-134` declares `extra.eas.projectId: "agi-workforce"` which is **not a real EAS project UUID** — it's a slug. The slug-as-projectId pattern fails on `eas build`. No automated `eas build` in CI (no workflow file). No Fastlane / `app-store-connect-api` integration. The root `app.json:1-6` is a one-line stub (`com.anonymous.agiworkforce`) — different from `apps/mobile/app.json` and likely a stale Expo placeholder; should be deleted or aligned.
- **Effort:** 2 days (EAS UUID + iOS submit profile + code-signing keys + CI workflow). Per-axis: 35%.

---

## MISSING — 14 items from reference scope, not even partial

### M-1. `.mcpb` desktop-extension format

- **Reference:** `.mcpb` is Anthropic's package format for Desktop Extensions (Apple-Aug-2025 admin controls release per §1.2 + §2.3). A `.mcpb` is a signed bundle a user double-clicks, which the desktop app then registers as a local MCP server.
- **Have:** Nothing. No `.mcpb` mime registration in `tauri.conf.json` (no `fileAssociations` block). No bundle-format spec, no install hooks, no admin upload directory, no `mcp.so`/`mcpb.io` server-discovery integration. The CLAUDE.md "single source of truth" doesn't mention it.
- **Effort:** 3 weeks (define format, write bundler tool, wire desktop app to install/uninstall/update, add Team/Enterprise admin server-side enable/disable per §2.3). Per-axis: 0%.

### M-2. Deep-link `claude-cli://` registration parity

- **Reference:** Claude registers `claude://` for opening sessions from the web (§2.5).
- **Have:** Tauri config registers **`agiworkforce://`** at `tauri.conf.json:73`. The scheme is wired but: no signed-link verification, no replay-attack protection (per CLAUDE.md `auth.role()` threat model commit `a0a4baf82`), no Web → Desktop session-handoff flow, no deep-link routing into chat conversation by ID. Mobile array (line 71) is empty so universal links are not declared on iOS/Android side.
- **Effort:** 2 days (handoff flow + signed deep-links + universal-link entitlements on mobile). Per-axis: 30%.

### M-3. OAuth callback signing + replay protection

- **Reference:** Claude Code's OAuth flow uses signed state tokens with replay protection (§5.4 hooks env, §10.3 API keys).
- **Have:** Generic OAuth flows at `apps/cli/src/oauth.rs` (PKCE) and Supabase OAuth, but no signing of callback redirects in the install-time and update-time flows. Tauri's deep-link plugin doesn't enforce HMAC on the callback URL. The desktop app _does_ have a model-id-gate path-anchor as of commit `a0a4baf82` but that's about Rust source code lockdown, not OAuth wire signing.
- **Effort:** 2 days. Per-axis: 0% for HMAC layer (PKCE is present which is partial-equivalent).

### M-4. Code-signing across all 6 surfaces — only partial coverage

- **Reference:** §2.5 macOS notarization, §2.5 Windows MSIX+EV cert, §6 mobile App Store cert, §7 Chrome ext signed by CWS, §8 VS Code ext signed by `vsce`.
- **Have:** Tauri minisign for desktop auto-update payload (works, lines 311-312 of release-desktop.yml). Macros for APPLE\_\* envs in release.yml (dormant). NSIS unsigned (no SSL.com EV cert).
- **Missing:** macOS .dmg+.app code-signing (no Apple cert in CI), Windows .exe code-signing (no EV cert), CWS package signing (none — Chrome handles at upload), `.vsix` signing (vsce default is fine). **Mobile**: `app.json` has full privacy manifest but no certificate or provisioning profile in repo (EAS handles this per-build, but the credentials are not in CI; iOS sign-in keys not wired).
- **Effort:** 1d Apple cert upload + 1w SSL.com EV cert + 1d EAS credential upload. Per-axis: 50%.

### M-5. App Store Connect metadata automation — none

- **Reference:** §6 mobile lifecycles include App Store screenshots, descriptions, version notes uploaded via App Store Connect API.
- **Have:** `apps/mobile/app.json` declares iOS `bundleIdentifier`, `buildNumber`, privacy manifest, usage descriptions. Nothing else.
- **Missing:** No App Store Connect API key, no `fastlane/Deliverfile`, no `fastlane/Snapfile`, no screenshot generation pipeline, no localized strings catalog, no review-notes file, no in-app-purchases config (relevant for paid Hobby tier launch). Same for Google Play Console — `eas.json:36` only sets `track: "internal"`, no Play Console API key.
- **Effort:** 1 week per platform. Per-axis: 5%.

### M-6. Auto-update channel: per-channel feed at `agiworkforce.com/api/releases`

- See P-1 above. Endpoint exists in config but server doesn't accept `{{channel}}`. The `update-database` job at `release-desktop.yml:343-444` writes per-channel data into Supabase, so the data layer is ready; only the consumer route is missing.
- Consolidated with P-1.

### M-7. Per-machine vs per-user Windows install

- **Reference:** Anthropic supports both per-user (Squirrel) and per-machine (MSIX, enterprise) installations. The choice is exposed during install.
- **Have:** Hardcoded `installMode: "currentUser"` at `tauri.conf.json:53`.
- **Missing:** No machine-wide variant. Enterprise customers cannot deploy via SCCM/Intune.
- **Effort:** 0.5 day for NSIS variant; 2 days for MSIX (P-3).

### M-8. Codesigning per-CI-job logging redaction

- **Have:** `release-desktop.yml:309-312` masks `TAURI_SIGNING_PRIVATE_KEY*` via `::add-mask::`. Same in release.yml line 164-167.
- **Missing:** APPLE_CERTIFICATE / APPLE_CERTIFICATE_PASSWORD / NPM_TOKEN / FLY_API_TOKEN / RAILWAY_TOKEN / SUPABASE_SERVICE_ROLE_KEY (the last is masked, line 363 of release-desktop.yml, but the others are not). Per `actions-pinned-check.yml:1-54`'s threat model, a compromised action can read every env secret regardless of masking — the masking only hides them from logs, not from the action itself. Pin-check is in place for that.
- **Effort:** 0.5 day to add masks. Per-axis: 50%.

### M-9. Linux distro-package signing (GPG)

- **Have:** Tauri minisign on `.AppImage.tar.gz`.
- **Missing:** No GPG-signing of `.AppImage` itself (`.AppImage.zsync` + `gpg --detach-sign` typical). Linux package-manager users cannot verify the binary. No `apt-key` / `gpg --import` instructions for users.
- **Effort:** 1 day. Per-axis: 0%.

### M-10. Pinned-toolchain mismatches

- **Have:** Node 22 (`.nvmrc`), pnpm 9.15.3 (`package.json:12`), Rust 1.94.0 (workflows), TypeScript 5.9.3 (overrides).
- **Missing:** **Discrepancy:** `e2e-tests.yml:42` pins Node `'22.12.0'` (specific patch) while `ci.yml:43` and `release-desktop.yml:267` only pin `'22'` (any 22.x). The CLI minimum at `scripts/check-node-version.sh:7` says `22.12.0`. Patch-version drift between CI runs is possible. `package.json:14` says `engines.node: "22"` (loose) and `engines.pnpm: ">=9.15.0"` (could allow 9.30 in future). pnpm 9.15.3 is also pinned via `packageManager` field which most CI follow; loose-`engines` is misleading.
- **Effort:** 0.5 day (pin to `22.12.x` everywhere, tighten engines).

### M-11. Provenance attestation for npm + GH releases

- **Have:** `release-cli.yml:18-19` declares `id-token: write` (provenance scope) and signaling-server build calls `attest-build-provenance@v4` (line 136).
- **Missing:** **`scripts/publish-cli.sh:86` does not pass `--provenance` to `npm publish`** — so npm packages publish without provenance. GitHub releases don't have SBOM (`syft` / `cyclonedx`) attached. No `sigstore`-signed release artifacts (only the minisign `.sig` from Tauri, which is updater-specific not provenance).
- **Effort:** 1 day. Per-axis: 40% (signaling-server has it, others don't).

### M-12. Cargo audit ignore-list completeness + supply-chain audit

- **Have:** `ci.yml:114-122` runs `cargo install cargo-audit --version 0.22.1 --locked --quiet && cargo audit --deny warnings`. CLAUDE.md says ignore list lives in `.cargo/audit.toml`.
- **Missing:** No `cargo deny` run for license / banned-crate / advisories check. No `cargo-vet` for supply-chain audit. No SBOM emission per Rust workspace. Anthropic ships SBOMs for desktop releases (FedRAMP gate per §11).
- **Effort:** 2 days (cargo-deny + SBOM). Per-axis: 30%.

### M-13. Reproducible builds

- **Have:** `Cargo.toml:16-21` profile.release locks `codegen-units=1, lto=true, opt-level="z", strip=true, panic="abort"` — semi-reproducible.
- **Missing:** No `SOURCE_DATE_EPOCH` setup, no `--remap-path-prefix` flags for source-path scrubbing, no Reproducible-Builds.org compliance step. Two different runners producing two different binary hashes for the same source is possible. Hash-pinned dependencies via `Cargo.lock` (committed) is good (`.gitignore:71-72` pins the lock for the workspace root); but JS side via `pnpm-lock.yaml` plus `pnpm install --frozen-lockfile` is good (used in every workflow).
- **Effort:** 3 days. Per-axis: 30%.

### M-14. Mobile root `app.json` stub (anti-pattern)

- **Have:** `app.json:1-6` at repo root reads `{ "ios": { "bundleIdentifier": "com.anonymous.agiworkforce" } }` — the wrong bundle id (Expo's default placeholder).
- **Missing:** This file is harmful — if any tool reads from the repo root (some Expo CLIs do), they'll pick up the wrong bundle id. It conflicts with `apps/mobile/app.json:18`'s correct `com.agiworkforce.app`. **Delete this stub** or align it.
- **Effort:** 0 days (delete). Per-axis: -10% (negative).

---

## Per-axis percentage summary

| Axis                                     | Have                         | Partial                                                 | Missing                                | Score    |
| ---------------------------------------- | ---------------------------- | ------------------------------------------------------- | -------------------------------------- | -------- |
| Auto-update channels (Stable/Beta)       | endpoint+secrets             | channel routing                                         | per-channel feed                       | **50%**  |
| Squirrel.Mac equivalent                  | tauri-updater wired          | Apple secrets absent                                    | universal binary not built             | **30%**  |
| MSIX + CoworkVMService                   | none                         | NSIS as fallback                                        | full MSIX+VM service                   | **5%**   |
| Apple notarization + universal binary    | config                       | secrets + workflow                                      | active path                            | **30%**  |
| Hyper-V VM bundle                        | none                         | none                                                    | full pipeline                          | **0%**   |
| Native messaging host installer          | manifest+docs                | post-install scripts                                    | no installer                           | **25%**  |
| Squirrel.exe (NSIS) installer            | NSIS works                   | no per-machine                                          | differential update                    | **60%**  |
| Linux .deb/.rpm/.AppImage signed         | AppImage+minisign            | none                                                    | .deb/.rpm/GPG                          | **30%**  |
| Chrome Web Store auto-publish            | zip script                   | none                                                    | CWS workflow                           | **40%**  |
| VS Code Marketplace publish              | vsce package                 | none                                                    | publish + Open VSX                     | **50%**  |
| npm publish                              | 7 packages, NPM_TOKEN        | linux-arm64 dropped                                     | provenance, musl                       | **75%**  |
| Homebrew                                 | tap + script                 | manual trigger                                          | auto-trigger + cask                    | **60%**  |
| install.sh                               | full features                | none                                                    | sha256/minisign verify, channel flag   | **70%**  |
| OAuth callback signing                   | PKCE                         | none                                                    | HMAC + replay                          | **0%**   |
| .mcpb desktop extension format           | none                         | none                                                    | full                                   | **0%**   |
| Deep-link `agiworkforce://` registration | scheme registered            | mobile array empty, no signed handoff                   | full session routing                   | **30%**  |
| Codesigning across 6 surfaces            | minisign desktop only        | mac config, mobile manifest                             | Win EV, Apple cert, mobile certs in CI | **50%**  |
| EAS code-signing for Expo                | prod profile                 | iOS submit half                                         | EAS UUID + cert + workflow             | **35%**  |
| App store metadata                       | privacy manifest             | none                                                    | screenshots, deliverfile               | **5%**   |
| Pinned toolchains consistency            | Node22, pnpm9.15.3, Rust1.94 | engines loose, e2e-tests pin patch                      | full coverage                          | **80%**  |
| Provenance attestation                   | signaling-server             | none                                                    | npm + GH release                       | **40%**  |
| Reproducible builds                      | profile-release locked       | none                                                    | SOURCE_DATE_EPOCH, path-remap          | **30%**  |
| Cargo audit                              | wired in CI                  | none                                                    | cargo-deny + SBOM + cargo-vet          | **40%**  |
| Hardcoded model gate (Rust)              | wired ci.yml line 77         | narrow (2 gates)                                        | wide migration of 64 files             | **70%**  |
| Pinned-action SHA check                  | wired                        | actions-pinned-check.yml + scripts/check-action-pins.sh | none                                   | **100%** |
| Husky/Commitlint/Prettier/lint-staged    | wired                        | pre-push disabled                                       | hard 100-char enforcement              | **85%**  |
| Cargo workspace + tsc base               | wired                        | crates/\* glob, tsc strict                              | none                                   | **100%** |

**Aggregate parity (24 axes, weighted equal):** ≈ **41%**.

## Effort to close all gaps

- P-1 (channel routing): 1d
- P-2 (Apple secrets + revive macOS job): 2d
- P-3 (MSIX + VM service): 2w (sized as 10d)
- P-4 (notarization piping): 0.5d
- P-5 (Hyper-V bundle): 4–6w (sized as 25d)
- P-6 (native-messaging installer): 2d
- P-7 (Squirrel-equivalent diff update + per-machine): 3.5d
- P-8 (.deb/.rpm/GPG signing): 3d
- P-9 (CWS auto-publish): 1d
- P-10 (vsce publish + Open VSX): 0.5d
- P-11 (npm provenance + linux-musl): 1d (linux-arm64 deferred 3d if rustls migration)
- P-12 (Homebrew auto-trigger + cask): 2d
- P-13 (install.sh signature verify): 1d
- P-14 (EAS UUID + iOS submit + workflow): 2d
- M-1 (.mcpb): 3w (sized as 15d)
- M-2 (signed handoff + universal links): 2d
- M-3 (OAuth callback HMAC): 2d
- M-4 (full codesigning across surfaces): 9d
- M-5 (App Store Connect / Play Console metadata): 10d (5d each platform)
- M-7 (per-machine Windows): 0.5d (covered by P-3)
- M-8 (additional CI secret masks): 0.5d
- M-9 (Linux GPG signing): 1d
- M-10 (toolchain pin tightening): 0.5d
- M-11 (provenance attestation everywhere): 1d
- M-12 (cargo-deny + SBOM): 2d
- M-13 (reproducible builds): 3d
- M-14 (delete root app.json stub): 0.1d

**Sum:** ≈ 84 engineering days (≈ 17 calendar weeks at 1 FTE) for full parity. Critical path for **public MVP launch** (Hobby paid + multi-platform desktop): P-1, P-2, P-4, P-9, P-10, P-11, P-12, P-13, P-14, M-2, M-8, M-10, M-11, M-14 ≈ **18 days** (4 calendar weeks).

## Top 5 ship-blockers for paid-tier launch

1. **P-3 / M-7 — MSIX installer** required for enterprise IT (CoworkVMService deferred separately).
2. **P-2 / P-4 / M-4 — Apple notarization** + universal binary; users on macOS today see "unidentified developer" on `.AppImage`-equivalent flows; macOS download is dormant.
3. **P-14 / M-5 — EAS submit profile + App Store Connect metadata** — `eas submit -p ios` will fail today.
4. **P-9 — CWS auto-publish** — manual upload risks shipping outdated extension.zip alongside new desktop releases.
5. **M-12 — `cargo-deny` + SBOM** — required by FedRAMP/HIPAA paid tiers per Anthropic Trust Center §11 for any future Enterprise sales.

## Notable strengths not in reference

- **Two-gate model-id check** (`scripts/check-no-hardcoded-models.sh`) — Anthropic enforces this socially via `~/.claude/CLAUDE.md`; this repo enforces it as a CI hard-gate, which is **stronger than reference**.
- **SHA-pinned third-party actions** (`actions-pinned-check.yml`) — Anthropic doesn't publicly enforce this; this repo does. Stronger.
- **C1-pattern env-passthrough for github-script** (release-desktop.yml lines 155-162, release.yml lines 195-198, release-desktop.yml lines 459-463, 499-501) — defends against `${{ ... }}` injection in commit-subject changelogs. Documented red-team finding fixed at workflow-author level.
- **macOS Rust smoke + Windows Rust smoke + clippy-all-features** (`ci.yml:262-364`) — three platform smokes block release on any one. Anthropic's `claude-code` repo runs only Linux+macOS in public CI per `code.claude.com/docs/en/changelog`.
- **commit-subject sanitization with strict semver allowlist** (`release.yml:38-49`) — uncommon defense.
