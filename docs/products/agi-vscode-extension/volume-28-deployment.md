# AGI VS Code Extension — Volume 28 — Deployment

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, and the real repo paths this volume covers: `apps/extension-vscode/package.json`, `apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md`, `apps/extension-vscode/scripts/vsce-package.js`, `apps/extension-vscode/.vscodeignore`, `apps/extension-vscode/CHANGELOG.md`, `apps/extension-vscode/src/platform/version.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `.github/workflows/ci.yml`, and `docs/surfaces/vscode-extension.md`.

## Overview & stance

This volume defines how the AGI VS Code Extension is built, packaged, published, versioned, updated, and rolled back — the release pipeline, not the end-user install (Volume 02). Deployment must never itself be a trust-boundary event: publishing the `.vsix` ships code and static assets, never user prompts, files, or provider keys, and no secrets are baked at build time. The three trust modes — Local, BYOK, Managed Cloud — are runtime selections made after install; BYOK is allowed on this developer surface, but no release mechanic may silently route a Local session to BYOK or Cloud. The artifact is free (`pricing: "Free"`, ✅ `apps/extension-vscode/package.json:16`) and currently `preview: true` (✅ `package.json:15`); the paid ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) applies only to signed-in Managed-Cloud runtime, never to obtaining the binary. The localhost desktop bridge is a compatibility axis: the extension reports its version to the host and validates inbound frames, so a release cannot let a newer host push shapes an older client mishandles.

## VS Code Marketplace

🟡 Partial. The publish path is documented and manifest-ready but no live listing exists. Identity: publisher `agiworkforce`, id `agi-workforce`, resolving to `agiworkforce.agi-workforce` (✅ `package.json:2,6`), with `galleryBanner`, `icon media/icon.png`, `categories`, and `keywords` set. Packaging runs via `pnpm --filter agi-workforce package`, which executes `esbuild --production` then `node scripts/vsce-package.js package --no-dependencies` (✅ `package.json:926`, `scripts/vsce-package.js`), emitting `agi-workforce-0.3.0.vsix`; `.vscodeignore` trims `src/`, `scripts/`, tests, and `docs/` from the archive (✅ `.vscodeignore`). Publish uses `vsce publish` with a PAT scoped **Marketplace → Manage** for publisher `agiworkforce` (✅ `MARKETPLACE_PUBLISH_RUNBOOK.md`). Gaps: the Publisher account + PAT are a pending one-time founder action, a 128×128 icon and 4–6 screenshots are required, and the public brand is "AGI" while `displayName` reads "AGI Workforce" — a tracked reconciliation (🟡 `docs/surfaces/vscode-extension.md`). Requirement: manifest publisher/id/version must match the release before publish; never claim a live listing until one exists.

## Open VSX

🔭 Planned. Distribution to VS Code forks that do not use the Microsoft Marketplace (Cursor, Windsurf, Codeium, Google forks) via [open-vsx.org] is design intent, not wired. The plan is `npx ovsx create-namespace agiworkforce -p $OVSX_PAT` plus an `ovsx publish --no-dependencies -p $OVSX_PAT` step, an `OVSX_PAT` secret alongside the `vsce` flow, and a real `LICENSE` next to `"license": "PROPRIETARY"` (`package.json:7`) since ovsx CI mode will not prompt. No `ovsx` dependency or publish script exists in `apps/extension-vscode/` today. Requirement: the same `.vsix` and identical version must ship to both registries in lockstep; do not claim Open VSX availability until the namespace and CI step land.

## Versioning

🟡 Partial. The single source of truth is `package.json` `version` (`0.3.0`), governed by SemVer and a Keep-a-Changelog history (✅ `CHANGELOG.md`), with release tags of the form `vscode-vX.Y.Z` (✅ compare/tag links `CHANGELOG.md:65-66`). The running version is resolved at runtime by `getExtensionVersion()` (✅ `src/platform/version.ts`) and reported through telemetry, feedback, GitHub-issue prefill, and the desktop-bridge handshake, so a stale hardcoded literal never masks the real build. The compatibility floor is `engines.vscode: "^1.100.0"` (✅ `package.json:12-14`), required by the `@agi` chat participant and webview APIs. Requirements: bump `version` and add a dated `CHANGELOG.md` entry before packaging; the Marketplace rejects re-publishing an existing version, so every publish is a new number; drop `preview: true` only at GA; never enumerate concrete model IDs in release notes (CHANGELOG already scrubbed rot-prone IDs — `CHANGELOG.md:30`), which come only from `packages/contracts/types/src/models.json`.

## Updates

🟡 Partial. Once a listing exists, updates ride the standard editor auto-update path — the Marketplace processes the new `.vsix` (~1–24 h) and pushes to installed users (`docs/surfaces/vscode-extension.md` "Release process" step 5). Forward-compatibility is enforced independently of the store: inbound bridge frames are Zod-validated and unknown/allowlist-failing types dropped, and the extension version is sent in the `vscode:connected` handshake so the host can reason about compatibility (✅ `src/features/desktop-bridge/desktopBridge.ts`). The bridge transport migration (TCP loopback → Unix domain socket / named pipe behind a planned `agiWorkforce.desktopBridge.transport` flag) is the main forward-compat axis (🔭 `desktopBridge.ts:13-24`). Requirements: never ship a self-updater outside the Marketplace channel; never auto-apply an update that changes trust behavior (new egress, provider default, auto-approval) without the editor consent flow.

## Rollback

🟡 Partial. Within 24 h of publish, a bad version is pulled with `vsce unpublish agiworkforce.agi-workforce@x.y.z` (✅ `MARKETPLACE_PUBLISH_RUNBOOK.md` "Rollback"); after 24 h, only Marketplace support can remove a version. Because the store rejects re-publishing a pulled number, the preferred remedy is **roll forward** — ship a higher patch that reverts. Requirements: retain the prior `.vsix` for reinstall and record the incident. Trust note: a release that misbehaves against **Managed Cloud** is mitigated server-side (the Cloud kill-switch `AGI_MANAGED_COMPUTE_PRIVATE_BETA` re-gates access), not by unpublishing the client. Open VSX rollback is 🔭 until that channel exists.

## CI/CD

🟡 Partial. A CI quality lane exists: `.github/workflows/ci.yml` runs `pnpm typecheck:all` (`:114`), `pnpm test` (`:117`), the webview HTML regression gate `pnpm --filter agi-workforce test:webview` (✅ `ci.yml:123`), and an advisory Semgrep pass (`ci.yml:125-138`). There is **no** dedicated release/publish workflow for the extension — `release-cli.yml`, `release-desktop.yml`, and `build-windows-release.yml` exist, but no `release-vscode` equivalent — so publishing is manual per the runbook (🔭 for automation). Planned: a tag-triggered (`vscode-vX.Y.Z`) job that builds, packages, runs `vsce publish` + `ovsx publish` from GitHub Actions secrets, and uploads the `.vsix` artifact. Requirements: the job must fail if `package.json` version ≠ tag or CHANGELOG is unbumped; secrets live only in Actions secrets, never committed; no keys or model IDs inlined at build.

## Repository map

- `apps/extension-vscode/package.json` — manifest: publisher/id/version, `preview`, `pricing`, `engines`, packaging scripts.
- `apps/extension-vscode/scripts/vsce-package.js` — `.vsix` packaging wrapper (minimatch-compat shim over `@vscode/vsce`).
- `apps/extension-vscode/.vscodeignore` — files excluded from the published archive.
- `apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md` — publish/rollback runbook and publisher details.
- `apps/extension-vscode/CHANGELOG.md` — SemVer / Keep-a-Changelog history and release-tag links.
- `apps/extension-vscode/src/platform/version.ts` — runtime version resolver (`getExtensionVersion()`).
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — version handshake, inbound-frame validation, transport-migration plan.
- `.github/workflows/ci.yml` — typecheck/test/webview/security lanes.
- `docs/surfaces/vscode-extension.md` — surface status, release process, open work.

## Competitor notes

Claude Code and the Codex IDE extension ship single-vendor, Marketplace-only, with vendor-operated publishing tied to one provider. AGI diverges: the released `.vsix` is provider-neutral (Local via Ollama/LM Studio, BYOK — one of only three BYOK surfaces — and Managed Cloud), targets **dual** distribution (Marketplace + Open VSX for forks), and is local-first — deployment ships no keys or user data. Rollback respects the trust boundary: a Managed-Cloud regression is contained server-side, not by yanking a client that may be running purely Local/BYOK. Versioning refuses to pin model IDs into release copy, unlike single-model competitors.

## Acceptance / Definition of Done

The domain is production-ready when a reproducible, versioned `.vsix` builds from a tagged commit, publishes to a real listing, reports the correct version at runtime, has a proven rollback path, and crosses no trust boundary during deployment.

- [ ] Build: `pnpm --filter agi-workforce package` produces `agi-workforce-<version>.vsix`; `package.json` version matches the `vscode-vX.Y.Z` tag and a dated CHANGELOG entry; `getExtensionVersion()` returns that version at runtime.
- [ ] Trust: publishing ships no provider keys, tokens, or user data; no release mechanic routes Local→BYOK/Cloud; the desktop-bridge version handshake and inbound-frame validation hold across the version delta.
- [ ] Security: PAT / OVSX secrets stored only in GitHub Actions secrets (never committed); no model IDs or endpoints hardcoded in release notes; a bad version can be unpublished (<24 h) or rolled forward, with the prior `.vsix` retained.

## Anti-patterns

- Claiming a live Marketplace or Open VSX listing before one exists (both are 🟡/🔭 today).
- Re-publishing an existing version, or publishing without bumping `version` + CHANGELOG.
- Committing `vsce`/`ovsx` PATs, or baking any secret into the `.vsix`.
- Hardcoding a model ID in release notes or the manifest; IDs come only from `packages/contracts/types/src/models.json`.
- Referencing removed tiers. The `agiWorkforce.tier` enum still encodes `hobby`/`pro_plus` (`package.json:818-838`) — a known 🟡 reconciliation gap; copy uses Free / Basic / Pro / Max / Enterprise only, never Plus/Hobby/pro_plus, and never offers top-ups.
- Treating a Marketplace unpublish as remediation for a Managed-Cloud incident (use the server-side kill-switch), or making deployment a data-egress event.
- Referencing Supabase (fully migrated away) or Next.js `middleware.ts` (Web uses `proxy.ts`); the stack is Clerk + Neon + Stripe.
- Lowering the `engines.vscode` floor below `^1.100.0` to widen reach, breaking the chat-participant contribution.
