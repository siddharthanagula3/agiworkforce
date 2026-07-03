# AGI VS Code Extension — Volume 02 — Installation

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, and the real repo paths this volume covers: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/platform/version.ts`, `apps/extension-vscode/src/platform/config.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/scripts/vsce-package.js`, `docs/surfaces/vscode-extension.md`, and `docs/production-cloud-blueprint.md`.

## Overview & stance

This volume defines how the AGI VS Code Extension is packaged, distributed, discovered, updated, and version-gated. Installation is workspace-scoped and must never itself become a trust-boundary event: fetching and enabling the extension moves no prompts, files, or provider keys anywhere. The three trust modes — Local, BYOK, Managed Cloud — are selected _after_ install and enforced at runtime; BYOK is allowed here because VS Code is a developer surface, but Local sessions must never be silently routed to BYOK or Cloud. Install is free: Local and BYOK are free access modes, and the paid ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) applies only to signed-in Managed-Cloud usage. Untrusted workspaces get a restricted surface: `capabilities.untrustedWorkspaces` is `"limited"`, so `agiWorkforce.apiEndpoint`, `agiWorkforce.gatewayUrl`, `agiWorkforce.cliPath`, `agiWorkforce.systemPrompt`, and agent auto-apply cannot be overridden by workspace settings, and Agent Mode file writes stay disabled until the workspace is trusted (✅ `apps/extension-vscode/package.json:46-61`).

## Marketplace Installation

🟡 Partial. The manifest is publish-ready: publisher `agiworkforce`, id `agi-workforce`, `displayName "AGI Workforce"`, `version 0.3.0`, `preview: true`, `pricing "Free"`, plus `galleryBanner`, `icon media/icon.png`, `categories`, and `keywords` (✅ `apps/extension-vscode/package.json:1-63`); the resolved identity is `agiworkforce.agi-workforce` (✅ `src/platform/version.ts:11`). Packaging is wired via `pnpm --filter agi-workforce package`, which runs `esbuild --production` then `node scripts/vsce-package.js package --no-dependencies` (✅ `package.json:926`, `scripts/vsce-package.js`), producing `agi-workforce-0.3.0.vsix`. The gap: no live Marketplace listing exists yet, and `vsce publish` needs a Publisher account + PAT (a one-time founder action, 🟡 per `docs/surfaces/vscode-extension.md` "Marketplace listing ⏳ no listing yet"). Requirements: manifest publisher/id/version must match the release before publish; the public brand is "AGI" (a pending `displayName` reconciliation is tracked in the surface doc); do not claim a live listing until one exists.

## Open VSX

🔭 Planned. Open VSX distribution (for VS Code forks such as Cursor, Codeium, and Google forks that do not use the MS Marketplace) is designed but not wired in CI. The plan (`docs/production-cloud-blueprint.md` M7 §"Open VSX publishing") is a one-time `npx ovsx create-namespace agiworkforce -p $OVSX_PAT` plus a CI `ovsx publish --no-dependencies -p $OVSX_PAT` step, and an `OVSX_PAT` secret alongside the existing `vsce` flow (the `LICENSE` file requirement is already satisfied — `apps/extension-vscode/LICENSE` exists next to `"license": "PROPRIETARY"` in `package.json`, so ovsx CI mode will not prompt). No `ovsx` dependency or publish script exists in `apps/extension-vscode/` today; do not claim Open VSX availability until the CI step and namespace land.

## CLI Detection — detect agi binary

🔭 Planned. The extension does not currently detect or shell out to the AGI CLI binary. `agiWorkforce.cliPath` is referenced only as a trust-restricted key — it appears in `capabilities.untrustedWorkspaces.restrictedConfigurations` (✅ `package.json:53`) and is "handled at use-site with explicit Workspace Trust check" (`src/platform/config.ts:19`) — but it is **not** declared in `contributes.configuration.properties`, and no detection/PATH-scan logic exists (a 🟡 gap between the trust wiring and any real feature). When built, detection must locate the `agi` binary (with `agiworkforce` kept only as a backward-compatible alias), never invent a path, and honor Workspace Trust so an untrusted workspace cannot point `cliPath` at an attacker binary. Shared CLI↔extension developer sessions are a target direction (🔭 until the protocol lands in `packages/types`/Rust crates); any handoff that surfaces content into app chat must stay explicit and redacted, never automatic (per `apps/extension-vscode/AGENTS.md`).

## Runtime Installation

🟡 Partial. The shared AGI Runtime TS is a workspace dependency (`@agiworkforce/runtime`, `package.json:940`) compiled into `out/extension.js` by esbuild at build time (✅ imports at `src/data/sendQueue.ts:15`), so there is **no** separate download step for the extension's own runtime code. Two host runtimes are user-managed and installed out-of-band:

- **Local model runtimes** (Ollama / LM Studio) back the Local trust mode; the extension references them via `agiWorkforce.providerStreamProvider` (`ollama`, `ollama-cloud`, `lmstudio`) but does not install or bundle them — it only connects (🔭 for any managed install).
- **AGI Desktop app** is the local compute host and bridge server: it writes the shared token at `~/.agiworkforce/bridge-token` (mode `0600`), which the extension reads before connecting to `ws://127.0.0.1:8787/ws` (✅ `src/features/desktop-bridge/desktopBridge.ts:38-104`, `299-317`). The bridge is opt-in via `agiWorkforce.desktopBridge.enabled` (default `true`) and needs the Desktop app installed separately; a missing token surfaces an actionable warning rather than failing silently (✅ same file, `:303-313`).

## Updates

🟡 Partial. Once a listing exists, updates ride the standard editor auto-update path (Marketplace processes the new `.vsix` and pushes to installed users — per `docs/surfaces/vscode-extension.md` "Release process" step 5); this is gated on the listing existing (🟡). The running version is resolved at runtime via `getExtensionVersion()` (✅ `src/platform/version.ts:17-19`) and reported to the Desktop bridge in the `vscode:connected` handshake so the host can reason about compatibility (✅ `desktopBridge.ts:475-482`). Protocol drift is guarded independently of extension version: inbound frames are Zod-validated and unknown/allowlist-failing types dropped (✅ `desktopBridge.ts:440-467`), so a newer host cannot push shapes an older extension mishandles. Never auto-apply a self-update that changes trust behavior without the standard editor consent flow.

## Version Compatibility

✅ Built (baseline). The manifest requires `engines.vscode: "^1.100.0"` (types match: `@types/vscode ^1.100.0`) — 1.100.0 is the hard floor (✅ `package.json:12-14`, `953`), required by the `@agi` chat participant (`contributes.chatParticipants[].id = agiworkforce.agi`) and webview sidebar, which depend on recent Chat/LM APIs. The Desktop bridge transport is a forward-compat axis: the current TCP loopback socket has a stated migration target of a Unix domain socket / named pipe behind a planned `agiWorkforce.desktopBridge.transport: 'socket' | 'tcp'` flag — not yet declared in the manifest, so 🔭 (design intent in `desktopBridge.ts:13-24`). Model compatibility is resolved at runtime from the provider catalog, never pinned in the manifest: the default is the routing alias `auto-economy` (✅ `package.json:661`, `src/platform/config.ts:38`), and concrete model IDs must come only from `packages/types/src/models.json`.

## Repository map

- `apps/extension-vscode/package.json` — manifest: publisher/id/version, engines, categories, `capabilities.untrustedWorkspaces`, packaging scripts.
- `apps/extension-vscode/scripts/vsce-package.js` — `.vsix` packaging wrapper invoked by `pnpm ... package`.
- `apps/extension-vscode/src/platform/version.ts` — extension id + runtime version resolver.
- `apps/extension-vscode/src/platform/config.ts` — typed settings accessors and defaults (mirrors `package.json`).
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge client, token read, transport-migration plan.
- `docs/production-cloud-blueprint.md` — Open VSX + Marketplace release plan (M7).
- `docs/surfaces/vscode-extension.md` — surface status, release process, verified counts.

## Competitor notes

Claude Code and the Codex IDE extension ship single-vendor: install from the Marketplace, sign in to one provider, done. AGI diverges deliberately. The same `.vsix` is provider-neutral, supporting Local (Ollama/LM Studio), BYOK (VS Code being one of only three surfaces where BYOK is allowed), and Managed Cloud, chosen after install with a visible provider label. AGI also targets fork distribution via Open VSX (Cursor/Codeium/Google forks), not Marketplace-only, and treats the Desktop app as an optional local compute host over an authenticated loopback bridge rather than a mandatory cloud dependency. Local-first is the default: nothing leaves the machine on install.

## Acceptance / Definition of Done

The domain is production-ready when a clean editor installs the extension from a real listing, the correct version reports at runtime, and no install action crosses a trust boundary.

- [ ] Build: `pnpm --filter agi-workforce package` produces a versioned `.vsix`; manifest publisher/id/version match the release; `getExtensionVersion()` returns that version at runtime.
- [ ] Trust: untrusted-workspace restricted configurations (`apiEndpoint`, `gatewayUrl`, `cliPath`, `systemPrompt`, auto-apply) verified non-overridable; Agent Mode writes blocked until trust granted; no Local→BYOK/Cloud routing at install.
- [ ] Security: bridge token read only when mode `0600` (POSIX); missing token surfaces a warning, never a silent insecure fallback; inbound bridge frames Zod-validated; any future `cliPath`/CLI detection honors Workspace Trust and never runs an unverified binary.

## Anti-patterns

- Claiming a live Marketplace or Open VSX listing before one exists (both are 🟡/🔭 today).
- Declaring `agiWorkforce.cliPath` "supported" — it is trust-restricted but undeclared and unwired; do not describe CLI detection as built.
- Bundling or hardcoding a model ID at install; model IDs come only from `packages/types/src/models.json`.
- Referencing removed tiers. The `agiWorkforce.tier` enum still encodes `hobby` and `pro_plus` (`package.json:818-838`) — a known 🟡 reconciliation gap; specs and copy must use Free / Basic / Pro / Max / Enterprise only, never Plus/Hobby/pro_plus, and never offer top-ups.
- Making install a data-egress event, or auto-enabling the Desktop bridge, cloud sign-in, or telemetry (`telemetryEnabled` defaults `false`) without explicit consent.
- Referencing Supabase (fully migrated away) or Next.js `middleware.ts` (Web uses `proxy.ts`); the stack is Clerk + Neon + Stripe.
- Downgrading the `engines.vscode` floor below `^1.100.0` to widen reach, which would break the chat participant contribution.
