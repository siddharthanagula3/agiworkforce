# Inventory — apps/sandbox (artifact renderer)

> Filled in by the lead (the Wave-1 agent for this slice failed to emit structured output). Manual pass.

## Purpose & Architecture
Single static `index.html` (+ `vercel.json`, `README.md`, `package.json` with **zero deps**). A cross-origin artifact renderer intended to deploy to a **separate origin** (`sandbox.agiworkforce.com`) so artifact code is cross-origin-isolated from the parent app. Receives artifact payloads via `postMessage`.

## Alive vs Dead
**Likely UNWIRED / aspirational.** The shipping artifact-rendering path in Web + Desktop uses the **in-app** iframe renderers in `packages/unified-chat` (`buildSandboxedHtml`, `ArtifactPanel`, `ArtifactRenderer`, `ReactPreview`), NOT this separate-origin sandbox. No `apps/web`/`apps/desktop` reference to `apps/sandbox` was found. So the **more secure** renderer (this one) is not the one that ships.

## Security
Strong by design: CSP meta (`connect-src` blocked entirely; `script-src 'self' 'unsafe-inline' 'unsafe-eval'` + pinned CDNs), parent-origin allowlist (`*.agiworkforce.com`), `postMessage` origin validation (drops disallowed origins), inline `<script>` in `innerHTML` does not execute (scripts injected via pinned CDN tags only). This is the correct model.

## Key finding (architecture inversion → see AUDIT)
The secure cross-origin renderer exists here but is unused, while the shipping in-app `ReactPreview` ships **no CSP** (unrestricted network egress from LLM-authored artifacts — pkg-tools P2). Either route artifact rendering through this cross-origin sandbox, or bring the in-app renderers up to this CSP/isolation bar.

## Issues
- **P2 (cross-ref pkg-tools):** shipping artifact iframes (`ReactPreview`) lack the CSP this sandbox already implements. Decide one canonical, hardened renderer.
- **P3:** `apps/sandbox` orphaned/aspirational — confirm intent; wire it or document it as the target architecture.

## Coverage
No tests (static HTML). Acceptable for its size, but the security envelope deserves a smoke test if it becomes the live path.
