# AGI VS Code Extension — Volume 02 — Installation

Status: Current implementation notes
Owner: Founder + platform lead
Last updated: 2026-07-25

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, and the real repo paths this volume covers: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/platform/version.ts`, `apps/extension-vscode/src/platform/config.ts`, `apps/extension-vscode/src/integrations/localRuntimeClient.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/scripts/vsce-package.js`, and `docs/surfaces/vscode-extension.md`.

## Overview & stance

This volume defines how the AGI VS Code Extension is packaged, distributed, discovered, updated, and version-gated. Installation is workspace-scoped and moves no prompts, files, or provider keys. Local and BYOK remain free access modes; Managed usage follows the signed-in account plan. Untrusted workspaces get a restricted surface: `apiEndpoint`, `gatewayUrl`, `cliPath`, `autoApplyFixes`, `telemetryEndpoint`, and `tier` cannot be overridden by workspace settings, and Agent Mode file writes stay disabled until trust is granted.

## Marketplace Installation

🟡 Partial. The manifest is publish-ready: publisher `agiworkforce`, id `agi-workforce`, `displayName "AGI Workforce"`, `version 0.3.0`, `preview: true`, `pricing "Free"`, plus `galleryBanner`, `icon media/icon.png`, `categories`, and `keywords` (✅ `apps/extension-vscode/package.json:1-63`); the resolved identity is `agiworkforce.agi-workforce` (✅ `src/platform/version.ts:11`). Packaging is wired via `pnpm --filter agi-workforce package`, which runs `esbuild --production` then `node scripts/vsce-package.js package --no-dependencies` (✅ `package.json:926`, `scripts/vsce-package.js`), producing `agi-workforce-0.3.0.vsix`. The gap: no live Marketplace listing exists yet, and `vsce publish` needs a Publisher account + PAT (a one-time founder action, 🟡 per `docs/surfaces/vscode-extension.md` "Marketplace listing ⏳ no listing yet"). Requirements: manifest publisher/id/version must match the release before publish; the public brand is "AGI" (a pending `displayName` reconciliation is tracked in the surface doc); do not claim a live listing until one exists.

## Open VSX

🔭 Planned. No `ovsx` dependency, publish script, or CI workflow exists in `apps/extension-vscode/`; do not claim Open VSX availability until those repo-owned proofs and the namespace exist.

## CLI Detection — detect agi binary

✅ Built. `agiWorkforce.cliPath` is a contributed machine-scoped setting with default `agi`. `LocalRuntimePool` launches `<cliPath> app-server`, validates developer-session protocol 6, and isolates one lazy runtime per workspace root. The operating system resolves `agi` on `PATH`; an explicit path can be configured in Settings. Missing/outdated binaries produce a visible setup state rather than a silent hang. Untrusted workspaces cannot override the binary path or start developer sessions.

## Runtime Installation

The extension bundle contains its TypeScript client code, but the `agi` CLI is the required local developer-session host and is installed out-of-band:

- **AGI CLI** owns threads, turns, approvals, cancellation, provider credentials, and installed-local-model discovery. Install/update it so `agi` is on `PATH`, or configure `agiWorkforce.cliPath`.
- **Ollama / LM Studio** are optional local providers configured through the CLI/runtime; the extension merges installed rows returned by `model/list`.
- **AGI Desktop app** is an optional bridge server. `agiWorkforce.desktopBridge.enabled` defaults `false`; when explicitly enabled, the extension reads the 0600 token at `~/.agiworkforce/bridge-token` before connecting to localhost.

## Updates

🟡 Partial. Once a listing exists, updates ride the standard editor auto-update path (Marketplace processes the new `.vsix` and pushes to installed users — per `docs/surfaces/vscode-extension.md` "Release process" step 5); this is gated on the listing existing (🟡). The running version is resolved at runtime via `getExtensionVersion()` (✅ `src/platform/version.ts:17-19`) and reported to the Desktop bridge in the `vscode:connected` handshake so the host can reason about compatibility (✅ `desktopBridge.ts:475-482`). Protocol drift is guarded independently of extension version: inbound frames are Zod-validated and unknown/allowlist-failing types dropped (✅ `desktopBridge.ts:440-467`), so a newer host cannot push shapes an older extension mishandles. Never auto-apply a self-update that changes trust behavior without the standard editor consent flow.

## Version Compatibility

✅ Built (baseline). The manifest requires `engines.vscode: "^1.100.0"`, required by the `@agi` chat participant and webview sidebar. The Desktop bridge transport remains a forward-compat axis with a planned socket/pipe migration. Model compatibility is resolved at runtime from the provider catalog, never pinned in the manifest: the default is the routing alias `auto`, and concrete model IDs come only from `packages/contracts/types/src/models.json`.

## Repository map

- `apps/extension-vscode/package.json` — manifest: publisher/id/version, engines, categories, `capabilities.untrustedWorkspaces`, packaging scripts.
- `apps/extension-vscode/scripts/vsce-package.js` — `.vsix` packaging wrapper invoked by `pnpm ... package`.
- `apps/extension-vscode/src/platform/version.ts` — extension id + runtime version resolver.
- `apps/extension-vscode/src/platform/config.ts` — typed settings accessors and defaults (mirrors `package.json`).
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge client, token read, transport-migration plan.
- `docs/surfaces/vscode-extension.md` — surface status, release process, verified counts.

## Competitor notes

Claude Code and the Codex IDE extension ship single-vendor: install from the Marketplace, sign in to one provider, done. AGI diverges deliberately. The same `.vsix` is provider-neutral, supporting Local (Ollama/LM Studio), BYOK (VS Code being one of only three surfaces where BYOK is allowed), and Managed Cloud, chosen after install with a visible provider label. AGI also targets fork distribution via Open VSX (Cursor/Codeium/Google forks), not Marketplace-only, and treats the Desktop app as an optional local compute host over an authenticated loopback bridge rather than a mandatory cloud dependency. Local-first is the default: nothing leaves the machine on install.

## Acceptance / Definition of Done

The domain is production-ready when a clean editor installs the extension from a real listing, the correct version reports at runtime, and no install action crosses a trust boundary.

- [ ] Build: `pnpm --filter agi-workforce package` produces a versioned `.vsix`; manifest publisher/id/version match the release; `getExtensionVersion()` returns that version at runtime.
- [ ] Trust: untrusted-workspace restricted configurations verified non-overridable; Agent Mode writes blocked until trust granted; no Local→BYOK/Cloud routing at install.
- [ ] Security: bridge token read only when mode `0600` (POSIX); missing token surfaces a warning, never a silent insecure fallback; inbound bridge frames Zod-validated; any future `cliPath`/CLI detection honors Workspace Trust and never runs an unverified binary.

## Anti-patterns

- Claiming a live Marketplace or Open VSX listing before one exists (both are 🟡/🔭 today).
- Claiming the CLI is bundled with the `.vsix`; it is required out-of-band and missing/outdated binaries must show the setup state.
- Bundling or hardcoding a model ID at install; model IDs come only from `packages/contracts/types/src/models.json`.
- Referencing removed tiers. The extension access-mode enum preserves every canonical plan value; copy must never reintroduce Plus/Hobby/pro_plus aliases or credit top-ups.
- Making install a data-egress event, or auto-enabling the Desktop bridge, cloud sign-in, or telemetry (`telemetryEnabled` defaults `false`) without explicit consent.
- Referencing Supabase (fully migrated away) or Next.js `middleware.ts` (Web uses `proxy.ts`); the stack is Clerk + Neon + Stripe.
- Downgrading the `engines.vscode` floor below `^1.100.0` to widen reach, which would break the chat participant contribution.
