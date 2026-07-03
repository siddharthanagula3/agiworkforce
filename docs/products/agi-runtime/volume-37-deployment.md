# AGI Runtime — Volume 37 — Deployment

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/desktop/AGENTS.md` (nearest high-risk surface AGENTS for the local host). Grounded in: `apps/desktop/src-tauri/tauri.conf.json`, `apps/web/app/api/releases/[target]/[version]/route.ts`, `.github/workflows/{release-desktop,release-cli,deploy-signaling-server,ci}.yml`, `apps/mobile/{eas.json,app.config.js,EAS_SIGNING_RUNBOOK.md}`, `crates/agiworkforce-{protocol,task-runtime,plugin-runtime,command-registry,app-server}`, `packages/runtime/package.json`, `services/signaling-server`, and `Cargo.toml`/`pnpm-workspace.yaml` at the repo root.

## Overview & stance

AGI Runtime is the **internal shared execution layer**, not a user product. It therefore has **no standalone installer, package, or update channel of its own** — and the spec must never invent a monolithic runtime daemon that ships or auto-updates independently. Deployment of the Runtime means: its Rust crates and TS packages are **compiled into each host surface's bundle**, and its one long-running service (the WebRTC `signaling-server`) deploys as an ordinary containerized backend.

The three trust modes shape this directly. **Local** and **BYOK** compute runs inside the host binary (Desktop, CLI, VS Code) that a user installs; there is no server-side component to update for those modes, so Local/BYOK never gains a cloud-update surface that could exfiltrate a session. **Managed Cloud** paths (Neon delta-sync APIs, signaling relay) deploy separately and are the only Runtime pieces that live on AGI infrastructure. Remote Control is a secure window over a locally running session, so shipping a Desktop update does not move any Local session to the cloud. Signature verification and pinned dependencies are load-bearing precisely because a compromised update is the fastest way to break a trust boundary.

## Packaging — build runtime packages (bundled per surface)

The Runtime has **no independent build target**; each surface embeds it.

- ✅ **Rust crates compile into the host binary.** `crates/agiworkforce-{protocol,task-runtime,plugin-runtime,command-registry,app-server}` are members of the root Cargo workspace (`Cargo.toml`, `Cargo.lock`) and link into the Desktop Tauri binary and the CLI `agi` binary. `agiworkforce-app-server` is consumed **only** by the CLI (`crates/agiworkforce-app-server/README.md`).
- ✅ **TS runtime compiles into JS bundles.** `packages/runtime` builds via `tsc` (`packages/runtime/package.json` `build` script) and is imported by Web, Mobile, and the Desktop webview through the pnpm workspace (`pnpm-workspace.yaml`).
- ✅ **Desktop bundle config** is `apps/desktop/src-tauri/tauri.conf.json`; the Chrome native-messaging host and 127.0.0.1 WS host build as Rust bins under `apps/desktop/src-tauri/src/bin/native_messaging_host.rs` and `.../integrations/realtime/websocket_server.rs`.
- ✅ **Signaling server** packages as a Docker image (`services/signaling-server`, built in `.github/workflows/deploy-signaling-server.yml`).
- 🔭 A **unified runtime SBOM / version stamp** shared across surfaces (so a phone can assert host-runtime compatibility before pairing) is design intent only; no cross-surface runtime version field exists today.

Requirement: every surface pins the same workspace crate/package versions from `Cargo.lock` and `pnpm-lock.yaml`; a Runtime change must rebuild **all** consuming surfaces, not one.

## Distribution — distribute runtime

Runtime reaches users only through each surface's existing channel.

- 🟡 **Desktop** distributes via GitHub Releases and `/download`; today `release-desktop.yml` ships **Linux `.AppImage`/`.deb` only** — macOS and Windows jobs are gated off pending `APPLE_*` secrets and an EV cert (documented in the workflow header). The update endpoint (`apps/web/app/api/releases/[target]/[version]/route.ts`) and `apps/web/app/api/releases/latest/[platform]/route.ts` still advertise all three targets.
- ✅ **CLI** distributes via npm: `release-cli.yml` builds 6 platform binaries and publishes 7 npm packages on `v-cli-*` tags.
- ✅ **Mobile** distributes via EAS build + store channels (`apps/mobile/eas.json`: `appVersionSource: remote`, `requireCommit: true`, channels `development`/`preview`; signing in `EAS_SIGNING_RUNBOOK.md`).
- 🟡 **Signaling server** deploys to Railway/Fly via `deploy-signaling-server.yml` (Docker → GHCR → target); `workflow_dispatch` default target is `none`, so promotion is deliberate.
- 🔭 VS Code and Chrome runtime attach ship through their own marketplaces; the Desktop↔Mobile companion channel that would distribute remote-control capability is **off** (`apps/mobile/lib/v1FeatureFlags.ts` `companion:false`, `dispatch:false`) and the desktop last-mile is unwired.

## Automatic Updates — update runtime safely

- ✅ **Desktop auto-update** uses the Tauri updater. `apps/desktop/src-tauri/tauri.conf.json` sets `endpoints` to `https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}`, a minisign `pubkey`, and Windows `installMode: passive`. The endpoint returns update JSON **only** when the GitHub release is newer (`isNewerVersion` semver compare) and a matching `.sig` is present; a missing signature yields `204` (no update).
- 🟡 **Mobile OTA** uses `expo-updates` (`apps/mobile/app.config.js` plugin + `updates.fallbackToCacheTimeout: 0`) over EAS channels; a runtime-version policy that blocks incompatible native/runtime pairs is not yet configured.
- 🟡 **CLI** updates are user-driven via npm; there is no in-binary self-updater.
- 🔭 The Runtime has **no independent auto-update path** — by design, it rides the host surface's updater. Signature/pubkey verification is mandatory on every path that gains one.

## Rollback — recover failed updates

- ✅ **Desktop rollback** is release-gated. `release-desktop.yml`'s `update-database` job writes the release into Neon; `publish-release` flips draft→published. To roll back, stop advancing "latest" or publish a patched release — the updater refuses to downgrade because `isNewerVersion` only serves strictly-newer versions, and minisign verification blocks tampered artifacts. Channels `stable`/`beta`/`nightly` isolate blast radius.
- 🟡 **Mobile rollback** republishes a prior EAS update to the channel; because `updates.fallbackToCacheTimeout: 0` the client keeps the cached build until a good update lands.
- 🟡 **Signaling / sync** roll back by redeploying the previous GHCR image tag via `deploy-signaling-server.yml`.
- 🔭 Cross-surface health-gated rollback (auto-halt an update wave on error spikes) needs presence: `apps/web/app/api/control-plane/status` exists but the `surface_heartbeats` table does not, so this is Planned.

## CI/CD — runtime deployment pipeline

- ✅ Core CI is `.github/workflows/ci.yml`; supply-chain guards are `actions-pinned-check.yml` and `codeql.yml`; tests run via `e2e-tests.yml`, `test-l1-l2.yml`, `test-l3-l4.yml`, `repo-operability.yml`.
- ✅ Release pipelines are tag-triggered and isolated per surface: `release-desktop.yml` (`v*`), `release-cli.yml` (`v-cli-*`), `deploy-signaling-server.yml` (push to `services/signaling-server/**`). Mobile builds through EAS (`eas.json`). Web/sync APIs deploy with `apps/web` (`vercel.json`).
- 🟡 A single "runtime release" gate that rebuilds and re-tests **every** consuming surface on a crate/package change is not yet a workflow; today each surface releases on its own tag.

## Repository map

- `crates/agiworkforce-{protocol,task-runtime,plugin-runtime,command-registry,app-server}` — embedded Rust runtime.
- `packages/runtime/` — embedded TS runtime (`package.json`, `src/`).
- `apps/desktop/src-tauri/tauri.conf.json`, `.../src/bin/native_messaging_host.rs`, `.../src/integrations/realtime/websocket_server.rs` — Desktop host bundle + updater.
- `apps/web/app/api/releases/**`, `apps/web/app/api/download/**` — updater/download endpoints.
- `apps/mobile/{eas.json,app.config.js,EAS_SIGNING_RUNBOOK.md}` — mobile build/OTA.
- `services/signaling-server/` — relay service + its Dockerfile.
- `.github/workflows/{ci,release-desktop,release-cli,deploy-signaling-server,codeql,actions-pinned-check}.yml` — pipelines.
- `Cargo.toml` / `Cargo.lock` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` — version pins.

## Competitor notes

Claude Code and Codex ship a CLI/desktop client plus a cloud remote-control fabric; their runtime is a single vendor stack updated centrally. AGI diverges deliberately: the Runtime is **multi-surface and multi-provider**, compiled into six surfaces rather than one, and it keeps **per-surface trust** — Local/BYOK compute lives in the user's own binary with no server-side update surface, so an AGI update cannot silently move a Local session to the cloud (the parity claim "nothing moves to the cloud" is enforced by architecture, not policy). Only the Managed-Cloud pieces (signaling, delta-sync) deploy on AGI infrastructure, and even those relay approval-gated control verbs, not Local data.

## Acceptance / Definition of Done

The domain is production-ready when every distributed Runtime artifact is signature-verified, every surface pins identical locked versions, updates cannot downgrade or cross a trust boundary, and each pipeline is tag-gated with a documented rollback.

- [ ] **Build:** a crate/package change rebuilds every consuming surface from `Cargo.lock` + `pnpm-lock.yaml`; no surface ships a stale runtime version.
- [ ] **Trust:** no update path routes Local/BYOK sessions to Cloud; Managed-Cloud services deploy separately; remote-control stays an outbound-only window.
- [ ] **Security:** every downloadable artifact carries a valid minisign/EAS signature; the updater serves only strictly-newer, signed builds; CI actions stay pinned (`actions-pinned-check.yml`) and CodeQL is green.

## Anti-patterns

- Inventing a standalone "runtime daemon" installer or auto-updater — the Runtime rides host surfaces; there is none.
- Serving an unsigned or non-newer update, or bypassing the minisign `pubkey` / EAS signing.
- Any update flow that would route a Local or BYOK session into Managed Cloud, or expose BYOK/Web/Mobile to BYOK where the canon forbids it.
- Claiming macOS/Windows desktop auto-update is shipped — it is gated in `release-desktop.yml`; mark 🟡/🔭.
- Hardcoding model IDs, routes, env vars, INR prices, or command names; CLI examples use `agi`, never `agiworkforce <cmd>`.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups, or referencing Supabase — the stack is Clerk + Neon + Stripe; Next.js uses `proxy.ts`.
