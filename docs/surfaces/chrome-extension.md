# Chrome extension surface

> **Path:** `apps/extension/` · **Stack:** Chrome MV3 + TypeScript · **Owner:** founder · **Status:** v1.2.0; CWS-ready (extension.zip built 2026-05-05). **Updated:** 2026-05-18.

## Mission

The Chrome extension is the BYOK control plane for the browser. It surfaces AGI's chat in any page via side panel, handles LinkedIn / Lever job autofill, and bridges to the desktop app via the native messaging host (when configured). Platform-specific assistant prompts for Slack / Gmail / Calendar / Docs / GitHub.

## Status at HEAD

| Item                     | State                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest version         | v1.2.0 (MV3)                                                                                                                                                                                            |
| `extension.zip`          | ✅ 136 KB built 2026-05-15 (was 116,792 bytes per older claim)                                                                                                                                          |
| Chrome Web Store listing | ⏳ no listing yet                                                                                                                                                                                       |
| Lint clean               | ✅                                                                                                                                                                                                      |
| Tsc clean                | ✅                                                                                                                                                                                                      |
| Prod build clean         | ✅                                                                                                                                                                                                      |
| Red-team status          | 13 of 16 findings closed at source + regression tests; 2 deferred (CSP `'unsafe-inline'` style — UI refactor; plaintext-localhost transport — desktop-side TLS); 1 acceptable-as-is (SW restart TOCTOU) |

## Verified codebase numbers (2026-05-17 audit)

- **33** source files in `apps/extension/src/`
- **16,207** LOC
- **22** test files
- **11** declared permissions
- **136 KB** built `extension.zip` (older claim was 116,792 bytes — verify which is current)

## Stack

| Item             | Choice                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- |
| Manifest version | MV3                                                                                     |
| Language         | TypeScript (TS-only — older `.js` files deleted 2026-05-05)                             |
| Bundler          | Vite / esbuild (per workspace setup)                                                    |
| Test runner      | Vitest                                                                                  |
| Lint             | ESLint (separate config: `pnpm lint:extension`)                                         |
| Site detectors   | LinkedIn + Lever autofill modules in `src/sites/`                                       |
| Native messaging | Port 8787 desktop bridge plus bundled `native_messaging_host` manifests for Chrome/Edge |

## File layout

```
apps/extension/
├── manifest.json                   ⚠ MV3 v1.2.0; 11 permissions
├── src/                            33 .ts files
│   ├── background.ts               service worker
│   ├── content.ts                  content script
│   ├── sidepanel/                  Chrome side panel UI
│   ├── popup/                      browser action popup
│   ├── autofill/                   LinkedIn + Lever site detectors
│   ├── desktop-bridge/             port 8787 native messaging client
│   ├── platforms/                  Slack / Gmail / Calendar / Docs / GitHub assistant prompts
│   └── ...
├── native-host/
│   ├── com.agiworkforce.browser.json.template
│   └── install.sh                   macOS/Linux manual installer shim
├── scripts/
│   ├── install-native-host.sh       macOS/Linux Chrome+Edge manifest installer
│   └── install-native-host.ps1      Windows HKCU Chrome+Edge manifest installer
├── __tests__/                      22 test suites
├── dist/                           5-file CWS-ready build (sourcemaps stripped)
└── extension.zip                   136 KB CWS-submittable
```

## Permissions declared (11)

Per `manifest.json`:

`activeTab`, `tabs`, `storage`, `nativeMessaging`, `alarms`, `contextMenus`, `sidePanel`, `scripting`, `cookies`, `notifications`, `tabGroups`.

Host permissions: **localhost + 127.0.0.1 only** (http) — for desktop-bridge port 8787.

## Build + test commands

```bash
# Build (Vite/esbuild via workspace)
pnpm --filter @agiworkforce/extension build
# Output: apps/extension/dist/

# Package for Chrome Web Store
pnpm --filter @agiworkforce/extension package
# Output: apps/extension/extension.zip (136 KB)

# Tests
pnpm --filter @agiworkforce/extension test

# Lint (uses extension-specific config)
pnpm lint:extension

# Typecheck
pnpm --filter @agiworkforce/extension typecheck
```

## Release process

1. Bump `manifest.json` version
2. `pnpm --filter @agiworkforce/extension package` → `extension.zip`
3. Upload to Chrome Web Store Developer Dashboard (manual one-time setup)
4. Submit for review (~3-7 days typical)
5. Once approved, future updates auto-deploy via CWS

## Provider integrations on Chrome ext

Same 10+ providers as other surfaces. Cloud requests route through `services/api-gateway` or directly to provider per BYOK key.

## Current open work

1. **CSP `'unsafe-inline'` removal** — deferred (UI refactor)
2. **Plaintext-localhost transport** — deferred (desktop-side TLS)
3. **`autoSubmit: true` payload-controllable without confirmation** — current behavior; user-confirm gate to add
4. **Keep-alive alarm at 0.5 minutes** — Chrome silently bumps to 1 min. Adjust to 1.0 explicitly to avoid silent override.

## Gotchas

- **`innerHTML` count**: 52 sites audited 2026-05-05. All static strings, numeric template literals, or DOMPurify-sanitized LLM output. Older docs claimed 40 or 50 — verified 52.
- **Legacy `.js` files deleted 2026-05-05**: only compiled `.ts` outputs ship. Manifest-resolution risk eliminated.
- **Lint separated**: `pnpm lint` excludes apps/extension; use `pnpm lint:extension` to lint this surface.
- **`nativeMessaging` permission declared but host manifest absent**: extension declares the permission but `com.agiworkforce.browser.json` host file isn't installed without a script. Native bridge silently fails until install.sh ships.

## Current References

- [docs/current/product-suite.md](../current/product-suite.md) - six-surface product role and sync boundary.
- [docs/current/technical-architecture.md](../current/technical-architecture.md) - provider, connector, and runtime ownership.
- [docs/current/agent-and-repo-operability.md](../current/agent-and-repo-operability.md) - current docs and agent workflow rules.
- [docs/decisions/CURRENT_DECISIONS.md](../decisions/CURRENT_DECISIONS.md) - current trust-boundary and managed-cloud decisions.
- Historical PRD details live in `docs/archive/2026-05-21-docs-consolidation/`.

## Memory references

- `memory/reference/competitive/dotfile-architectures.md` — extension dotfile patterns
- `memory/audits/ui-cross-surface-2026-05-05.md` — cross-surface UI audit findings

## Operational owner

Founder. Chrome Web Store Developer Dashboard under founder's account ($5 one-time fee paid).
