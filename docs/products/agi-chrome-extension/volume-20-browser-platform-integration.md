# AGI Chrome Extension — Volume 20 — Browser Platform Integration

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension/AGENTS.md`, and repo evidence in `apps/extension/manifest.json`, `apps/extension/MANIFEST_NOTES.md`, `apps/extension/THREAT_MODEL.md`, `apps/extension/native-host/`, `apps/extension/scripts/install-native-host.sh`, `apps/extension/scripts/install-native-host.ps1`, `apps/extension/src/surface.ts`, `apps/extension/src/features/computer-use/cdpDriver.ts`, and `apps/extension/src/features/computer-use/cloudAgentClient.ts`.

## Overview & stance

This volume defines which browsers the AGI Browser Companion targets, what "supported" means per browser, and how our shipped Chromium/MV3 reality maps onto Chrome, Edge, Brave, Arc, Opera, and Vivaldi. The Chrome product is a permission-gated **browser agent**, not a standalone assistant: the extension holds **no provider keys and runs no inference of its own**, streams chat through the cloud gateway (`cloudAgentClient.ts` → gateway allowlist), and reaches the local Desktop host via native messaging (`com.agiworkforce.browser`) plus a loopback pairing bridge on port 8787. That trust shape is browser-independent, so browser support is fundamentally a **packaging + API-availability** question, not a re-architecture per browser.

Trust modes bind here: Chrome is a **developer/task-scoped surface** — it never joins consumer chat/memory/Projects sync (`src/surface.ts` asserts `chrome` is a `DeveloperSessionSurface` at load; history and memory stay `chrome.storage.local`). BYOK is **never** available on this surface (BYOK is Desktop/CLI/VS Code only). Every browser we add must preserve: site allowlist + explicit permissions, ask-before-acting approvals, the exact-match gateway egress allowlist, and the loopback-only bridge. A browser that cannot enforce those gates is not "supported."

## Chrome

Primary and only fully verified target. ✅ Built — `apps/extension/manifest.json` declares Manifest V3 with `minimum_chrome_version: 132`, the `sidePanel`, `debugger`, `tabGroups`, `nativeMessaging`, `cookies`, `alarms`, and `scripting` permissions, and a hardened `content_security_policy` (`default-src 'self'`; `connect-src` enumerates loopback + AGI origins only). Requirements: install must surface pairing + site approval on-screen (`THREAT_MODEL.md` §2.1); CDP computer-use attaches per-tab and detaches on every code path (`cdpDriver.ts`); the "started debugging this browser" banner is expected and must not be suppressed. Chrome is the release-blocking baseline — CI, Chrome Web Store submission, and all `__tests__/` invariants target Chrome first.

## Microsoft Edge

🟡 Partial. The extension is MV3/Chromium and runs unmodified on Edge, and the native-messaging installer already writes an **Edge** host manifest alongside Chrome: `scripts/install-native-host.sh` targets `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts` (macOS) and `~/.config/microsoft-edge/NativeMessagingHosts` (Linux); `native-host/INSTALL.md` states "The script writes manifests for Chrome and Edge." Gap: no Windows Edge registry path is documented in `install-native-host.ps1` beyond Chrome, no Edge Add-ons store listing exists, and Edge is not in CI. DoD for full support: Windows Edge host registration, an Edge Add-ons submission, and a smoke pass of pairing + one computer-use task on Edge.

## Brave

🔭 Planned. Brave is Chromium/MV3 and can side-load or install the Chrome build, but there is **no** Brave-specific native-messaging host directory written by `scripts/install-native-host.sh` (only Chrome + Edge), so the Desktop bridge will not auto-pair on Brave until we add its `NativeMessagingHosts` path. Additional Brave-specific requirement: Brave Shields can block or alter content-script injection and network requests; support must document a Shields-off/allowlist step for approved origins and verify the loopback bridge (`localhost`/`127.0.0.1`) is reachable. Until a Brave host path + Shields guidance ship and are tested, mark Brave unsupported.

## Arc

🔭 Planned. Arc is Chromium-based and generally loads Chrome MV3 extensions, but Arc's window/sidebar model does not expose Chrome's `sidePanel` UX the same way, and our default open-panel flow assumes `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` (Chrome 116+, per `docs/parity/claude-style-side-panel-redesign-2026-06-14.md`). No Arc native-host path is written today. Support requires verifying side-panel availability (or a popup/in-page-panel fallback via `src/features/content/in-page-panel/`), adding an Arc host directory, and confirming CDP `debugger` attach works in Arc.

## Opera

🔭 Planned. Opera is Chromium/MV3 and can install from the Chrome Web Store via Opera's "Install Chrome Extensions" add-on, but has no dedicated AGI packaging, no native-host directory in the installer, and is not tested. Opera's built-in VPN/ad-blocking may interfere with content scripts and the loopback bridge. Full support requires an Opera host path, an add-ons listing decision, and a pairing + computer-use smoke test.

## Vivaldi

🔭 Planned. Vivaldi is Chromium/MV3 and runs Chrome extensions, but shares the same gaps as Opera/Brave: no Vivaldi `NativeMessagingHosts` path in `scripts/install-native-host.sh`, no CI coverage, and unverified `sidePanel`/`debugger` behavior in Vivaldi's custom chrome. Treat as unsupported until a host path and a smoke pass exist.

## Chromium Compatibility

✅ Built (baseline) / 🔭 (breadth). The extension is written to the Chromium MV3 baseline — service-worker background (`manifest.json` → `background.type: "module"`), `chrome.*` APIs only, no Firefox `browser.*` polyfill, and `minimum_chrome_version: 132`. Any Chromium fork at or above the equivalent engine version that supports `sidePanel`, `chrome.debugger` (CDP), `tabGroups`, and `nativeMessaging` can, in principle, run the Chrome build. Requirement: the feature-detection contract is that missing APIs degrade, not crash — e.g. absent `sidePanel` falls back to the in-page panel, absent `debugger` disables CDP computer-use rather than throwing. Non-Chromium engines (Firefox/Gecko, Safari/WebKit) are **out of scope** for this volume; they need a separate manifest/port and are not planned here.

## Browser API Differences

🔭 Planned (as an explicit compatibility matrix). Track these per-browser deltas as testable rows:

- **Native messaging host dir** differs per browser and OS (Chrome vs Edge vs Brave vs Opera vs Vivaldi); only Chrome + Edge are written today (`scripts/install-native-host.sh`, `install-native-host.ps1`). Each new browser needs its `NativeMessagingHosts` path added.
- **`sidePanel`** requires Chrome 116+ and is not uniformly present in forks (Arc, older Opera). Fallback: popup / in-page panel.
- **`chrome.debugger` / CDP** powers computer-use (`cdpDriver.ts`, `MANIFEST_NOTES.md`); the un-suppressable debug banner and detach-on-completion behavior must be verified per browser.
- **`openPanelOnActionClick`** behavior and toolbar-click routing vary; guarded by feature detection.
- **Content-blocking layers** (Brave Shields, Opera ad-block) can strip content scripts or block the loopback bridge — every browser row must confirm the allowlisted-origin flow and `localhost`/`127.0.0.1`/`[::1]` reachability (`validateBridgeUrl`).
- **CSP enforcement** of extension pages is consistent across Chromium; page-context content scripts obey the host page's CSP regardless of browser.

## Repository map

- `apps/extension/manifest.json` — MV3 manifest, `minimum_chrome_version`, permissions, CSP.
- `apps/extension/MANIFEST_NOTES.md` — `debugger`/CDP + host-permission rationale.
- `apps/extension/native-host/` (`INSTALL.md`, `install.sh`, `com.agiworkforce.browser.json.template`) — native-messaging host manifest + install entry.
- `apps/extension/scripts/install-native-host.sh` / `install-native-host.ps1` — Chrome + Edge host-manifest writers (macOS/Linux/Windows).
- `apps/extension/src/features/computer-use/cdpDriver.ts` — CDP action layer (per-browser `debugger` dependency).
- `apps/extension/src/features/computer-use/cloudAgentClient.ts` — gateway egress allowlist (browser-independent).
- `apps/extension/src/surface.ts` — asserts Chrome is a developer/task-scoped surface (no consumer sync).
- `apps/extension/THREAT_MODEL.md` — trust planes, install/permission story, invariants.

## Competitor notes

Claude for Chrome and ChatGPT's browser features ship Chrome-first on a single first-party model; OpenAI Codex remote connections pair a phone to a host. AGI's deliberate divergence: (1) **per-surface trust** — Chrome is task-scoped, never syncs consumer chat/memory, and excludes BYOK; (2) **no in-extension inference or keys** — chat streams via the gateway, so browser support never leaks credentials into a fork; (3) **local-first bridge** — native messaging + loopback pairing keep compute on the Desktop host across whichever Chromium browser runs; (4) **multi-provider** upstream (model IDs from `packages/contracts/types/src/models.json`, model-by-plan gating). We support the Chromium family by packaging + host paths, not by cloning a per-browser build.

## Acceptance / Definition of Done

A browser is "supported" only when: the extension installs, pairing + site approval render on-screen, the native-messaging host manifest is written to that browser's directory, chat streams through the gateway allowlist, and at least one ask-before-acting computer-use task passes with the debugger detaching cleanly.

- [ ] Build: extension loads on the browser; `sidePanel` present or in-page-panel fallback active; no console errors on install.
- [ ] Trust: Chrome-family surface stays task-scoped (no consumer sync); BYOK absent; history/memory remain `chrome.storage.local`; loopback bridge validated by `validateBridgeUrl`.
- [ ] Security: native host manifest scoped to the extension ID; CDP attaches only to allowlisted origins and detaches on every path; page text passes `sanitizePageText` before egress; gateway calls stay on `GATEWAY_URL_ALLOWLIST_EXACT`.

## Anti-patterns

- Claiming Brave/Arc/Opera/Vivaldi "supported" without a native-host path in `scripts/install-native-host.sh` and a smoke pass — cite a path or mark 🔭.
- Adding a Firefox/Safari port under this volume (out of scope; needs its own manifest and trust review).
- Routing chat through any provider host directly from a fork — egress must stay on the gateway allowlist; the extension holds no keys.
- Enabling BYOK or consumer chat/memory sync on any browser (violates the Chrome trust boundary).
- Suppressing the CDP debug banner or leaving the debugger attached after a task.
- Hardcoding model IDs (use `packages/contracts/types/src/models.json`), referencing Supabase (fully migrated; use Clerk + Neon + Stripe), or surfacing removed tiers ("Plus"/`pro_plus`/"Hobby") or credit top-ups in any browser build. Never invent INR prices beyond Basic ₹399.
