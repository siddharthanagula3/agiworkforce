# Inventory Audit — TS Tool Packages

Slice: `packages/{mcp, skills, browser-tool, apply-patch, api, unified-chat}`
Auditor pass: RECON (read-only). Date context: 2026-05-29.
Anchor doc checked: `docs/current/technical-architecture.md` (last updated 2026-05-21) — accurate at the contract level; does not enumerate these packages individually, so no staleness conflict found.

Method: file enumeration + LOC, package.json/exports, importer graph (alive/dead), signal greps (throw/TODO/exec/spawn/eval/fetch/fs), targeted reads of every entry point and the security-sensitive files, plus consumer-side verification of the two artifact sandboxes and the browser-tool runner. ~10 of 78 unified-chat components were deep-read; the remaining 68 are grep-covered only (see Open Questions).

LOC (non-test src): mcp 539 · skills 524 · browser-tool 793 · apply-patch 825 · api 8,582 · unified-chat 22,019. Total ~33.3k.

---

## Purpose & Architecture

| Package | Purpose | Shape |
| --- | --- | --- |
| `@agiworkforce/mcp` | MCP client: transport factory (stdio/SSE/streamable-http) + connect/catalog builder over `@modelcontextprotocol/sdk`. | 4 src files. Pure factory; no IO until `client.connect()`. |
| `@agiworkforce/skills` | Skills system: scan dir → parse `SKILL.md` frontmatter → `Skill` records; merge/format helpers. Hand-rolled YAML frontmatter parser (no `yaml` dep). | 6 src files. |
| `@agiworkforce/browser-tool` | Agent-controlled browser-automation **contract + Playwright runner**. Discriminated-union `BrowserAction` (10 actions), isolated named profiles, `evaluate` gate, scheme allowlist. Ported lessons from OpenClaw. | 4 src files. |
| `@agiworkforce/apply-patch` | OpenClaw `apply_patch` format: parser + applicator + `FSBridge` abstraction. Workspace-escape (path traversal + symlink) defense. | 5 src files. Mirrors a Rust orphan crate (see below). |
| `@agiworkforce/api` | Typed wrappers for ~1,062 Tauri commands (1,084 `command()` calls verified). One module per Rust command domain (53 modules). | Thin — every fn forwards to `command()` from `@agiworkforce/runtime`. |
| `@agiworkforce/unified-chat` | Cross-surface chat UI contract: 78 React components, 21 zustand stores, 10 hooks, runtime/host-bridge interfaces, prompt classifier, 2 artifact sandboxes. | By far the largest; the only package with a real UI surface. |

Architectural note (matches anchor doc): `api` and `unified-chat` correctly depend only on `@agiworkforce/{runtime,types,utils}` — no app imports, no provider SDKs leaking in. The two trust-boundary-sensitive pieces (`connectorPermissionStore`, `security.ts` wrappers) keep secret material in the Rust/Neon layer, not in the TS package.

---

## Alive vs Dead

All six packages are in a shipping import closure:

- **mcp** — imported by desktop (`src/services/mcp.ts`), mobile, web (`app/api/mcp/route.ts`), and api-gateway (`mcp/mcpProxy.ts`, `mcp/sharedClient.ts`). ALIVE.
- **skills** — desktop (`skillLoader.ts`), mobile (`features/skills/service.ts`), web (`api/skills/route.ts`, `SkillsMenu.tsx`), api-gateway. ALIVE.
- **browser-tool** — imported by `apps/extension` (`background.ts`, `features/content/browserTool.ts`) **as a TYPE-ONLY import** of `BrowserAction` shapes. The Node/Playwright runner (`runBrowserAction`, `runComputerAction`) is **not called by any app or service** (grep returned zero call sites). So the action *contract* ships; the *runner* is reference/unwired. CONTRACT-ALIVE, RUNNER-UNWIRED.
- **apply-patch** — desktop (`services/applyPatch.ts`), web, api-gateway (`tools/file_edit.ts`). ALIVE and is the implementation actually used.
- **api** — desktop (dozens of feature/settings files), web, `packages/stores`, api-gateway, and re-consumed inside unified-chat (`CheckpointManager`, `RewindTimeline`). ALIVE.
- **unified-chat** — desktop (`App.tsx`, v3 shell, chat features) and web (chat pages, project pages, runtimes). ALIVE.

Dead / orphan items found:

- **`crates/agiworkforce-apply-patch` (Rust) — compiled orphan.** It matches the `crates/*` workspace glob so it *compiles* under `cargo check --workspace`, but the root `Cargo.toml` comment confirms shipping binaries (`apps/cli`, `apps/desktop/src-tauri`) only depend on `agiworkforce-protocol` and `agiworkforce-sandbox-policy`. No crate/app/service depends on `agiworkforce-apply-patch` (grep clean). It is a parallel Rust implementation of the same patch format with the same path-traversal hardening (`canonicalize()` + `starts_with(root)`, traversal refusal at `lib.rs:131,146,168`). Zero panic/unwrap/expect/todo in its non-test source. The shipped path is the TS package; the Rust crate is dead weight. (P2/cleanup.)
- **`SettingsShell` + `DEFAULT_SETTINGS_SECTIONS` (unified-chat)** — exported from index but **mounted by no app**. `ChatInterface` mounts `SettingsModal` instead. 6 of its 7 default sections render only descriptive `SectionPlaceholder` text with no controls (only Memory is real). Dead-ish export; harmless today because unused. (P3.)
- **`SettingsModal` (unified-chat)** — by design a `return null` shim that dispatches a `chat:action {type:'open-settings'}` CustomEvent for the host to handle. If a host mounts `ChatInterface` without listening for that event, the in-chat Settings button silently no-ops. Delegation pattern, not a bug, but a footgun. (P3.)

---

## Test Coverage

State plainly — coverage is thin where it matters most:

- **mcp** — 2 test files (`connect.test.ts`, `transport.test.ts`). Covers the security gates (tool-name/schema validation, spawn guard). Reasonable for 539 LOC.
- **skills** — 3 test files (frontmatter, loader, merge). Good for 524 LOC; frontmatter prototype-pollution path is tested.
- **browser-tool** — 4 test files incl. `evaluate-gate.test.ts`, `profile-cleanup.test.ts`, `profile-name.test.ts`, `computer-action-adapter.test.ts`. Security gates tested. Good for 793 LOC.
- **apply-patch** — 2 test files incl. a dedicated `path-traversal.test.ts` + `edge-cases.test.ts`. Good for the criticality.
- **api** — **1 test file** (`memoryImport.test.ts`) for **8,582 LOC / 1,084 command wrappers**. Essentially untested. Mitigated by the wrappers being mechanically thin, but there is no guard against a typo in a command name or arg key.
- **unified-chat** — 26 test files total, of which **15 component tests for 78 components** (+ store/lib/hook tests). Do not read "26 test files" as broad coverage: the artifact sandboxes (`ArtifactPanel.live-preview.test.tsx` exists) get some coverage, but most of the 78 components are untested, and the two sandbox HTML builders are not fuzzed against the bypass branches noted below.

---

## Panic / Crash sites

No Rust `panic!/unwrap!/todo!/unimplemented!` in any TS-slice Rust orphan source (the Rust apply-patch crate is clean in non-test code; 4 unwrap/expect are confined to `tests/scenarios.rs`).

TS `throw` counts (non-test): mcp 2 · skills 1 · browser-tool 5 · apply-patch 8 · api 0 · unified-chat 3. All are typed, intentional error signals on validation failures (e.g. `WorkspaceEscapeError`, `MCPTransportError`, `BrowserToolError`, `FrontmatterError`, no-files-modified), not crash-on-common-path. `runBrowserAction` wraps its whole body in try/catch and returns `{isError:true}` instead of throwing. No user-reachable uncaught-crash sites identified.

---

## TODO / FIXME / HACK

Only 2 in non-test source, both benign:
- `unified-chat/src/components/GeneratedFileCard.tsx:5` — comment referencing a closed suite-transformation TODO.
- `unified-chat/src/components/ArtifactPanel.tsx:82` — `TODO: EXEC-SUMMARY-r2` deferred work note.

(The dozens of `placeholder=`/`mock`/`stub` hits flagged by raw grep are HTML attrs, MSW/test fixtures, prompt-classifier keyword strings, and doc comments — false positives per calibration.)

---

## Security-sensitive code

This slice has clearly been through a documented security audit (`AUDIT-FIX`, `FIX (audit 2026-05-20)`, `alert-NNN` markers throughout). The hardening is real and mostly correct:

**apply-patch (`index.ts`)** — workspace-escape defense is strong: lexical resolve + case-insensitive-FS-aware `startsWith` (probes actual FS via `statSync`, not platform assumption — `index.ts:97-127`) **and** `realpath`-based symlink-escape check on the longest existing ancestor (`assertInsideWorkspace`, `index.ts:143-183`). `workspaceOnly` defaults true. Both hunk `path` and `movePath` are checked. Residual: a classic check-then-write TOCTOU window (realpath validated, then `fs.writeFile`); a symlink swapped in between would not be re-checked. Local-dev-tool risk, low. (P3.)

**mcp (`transport.ts`, `connect.ts`)** — strongest gates in the slice:
- stdio spawn refused unless `signedManifest` OR (`developerMode` AND consent pins BOTH `for_command` AND `for_args` exactly — legacy command-only string consent is rejected). `transport.ts:74-106`.
- Dangerous env keys scrubbed (`PATH`, `LD_PRELOAD`, `DYLD_*`, `NODE_OPTIONS`, `BASH_FUNC_*`, …) `transport.ts:23-55`.
- Tool-name spoofing closed: `isAcceptableMcpToolName` rejects `__`, >128 chars, non-`[A-Za-z0-9_.-]` `connect.ts:53-59`.
- JSON-Schema "billion-laughs" closed: depth ≤16, `$ref` ≤64, keys ≤512 `connect.ts:86-127`.
- ReDoS bounded in `toSafeServerName` `connect.ts:133-138`.
- Residual: `handle.callTool(name, …)` (`connect.ts:228`) does NOT re-validate `name` against the accepted catalog at invocation time — the name gate is at catalog/presentation time only. Defense-in-depth gap. (P3.)
- Note: env passed to `StdioClientTransport` is the scrubbed config env; the SDK's default child env inheritance is out of this package's control.

**browser-tool** — secure-by-default: `evaluate` disabled unless `allowEvaluate:true` (`index.ts:324-339`); navigate scheme allowlist `http/https` only, rejecting `file:/javascript:/data:/chrome:` via URL-parse (`index.ts:225-234`); isolated profiles never touch the user's daily Chrome; profile-name regex + relative-path defense-in-depth (`profile.ts:96-116`); `AGIWORKFORCE_BROWSER_PROFILE_ROOT` env override validated for absoluteness/no-`..`/charset (`profile.ts:71-94`). **Verified no consumer sets `allowEvaluate:true`** (grep clean) and the runner has no shipping caller, so the credential-theft surface the docs warn about is not currently reachable.

**skills (`frontmatter.ts`)** — prototype-pollution guard: null-proto containers (`Object.create(null)`), reserved-key block (`__proto__`/`prototype`/`constructor`), `Object.defineProperty` assignment to defeat setter pollution, and ReDoS-bounded regexes (`alert-399..402`). Loader skips poisoned skills instead of crashing the batch (`loader.ts:78-83`).

**api (`security.ts`, `auth.ts`)** — confirmed thin wrappers. `authLogin(email,password)` forwards to a Tauri `auth_login` command; `secret_manager_*` and `master_password_*` wrap Rust vault commands. No local token storage, no `localStorage`, no crypto in the TS layer — secret material stays in Rust. Clean.

**unified-chat / `connectorPermissionStore.ts`** — trust-boundary-correct: Local mode → encrypted Tauri vault command; Cloud mode → Neon table keyed on authenticated `user_id` (upsert refuses without `user_id`, `:180-181`). However `get()` returns `null` on ANY error (vault read fail, missing client) and delegates the safe default to the caller (`defaultPermissionForTool` in `@agiworkforce/types`, out of slice). If a caller treats `null` as "allow" rather than applying the default, that is a fail-open permission bypass. Severity contingent on the out-of-slice default (could not verify here). (P2, contingent.)

**unified-chat / artifact sandboxes — the two most material findings (both in shipping Desktop closure):**

1. **`buildSandboxedHtml` skips its CSP on two reachable branches** (`lib/artifact-sandbox.ts`). The CSP (`connect-src 'none'`, `frame-src 'none'`, etc.) is the only egress control. But:
   - `:40-42` — if the artifact already supplies its own CSP meta, the function returns it **verbatim**. A model-authored artifact declaring `default-src *` is trusted as-is.
   - `:43` — full document with no `<head>` (e.g. `<!DOCTYPE html><html><body>…</body></html>`): the `/<head([^>]*)>/i` replace finds no match and returns content unchanged → CSP never injected. This is ordinary-looking content, not adversarial.
   The sandbox attr is `allow-scripts allow-modals` (no `allow-same-origin`), so cookie/localStorage theft is bounded by the opaque origin — but unrestricted `fetch()` (localhost/LAN SSRF, beaconing from the user's machine) is live. Mounted by `ArtifactPanel`, `ArtifactRenderer`, and `apps/desktop/.../HtmlArtifact.tsx`. Artifact content originates from LLM output, so prompt-injection reaches it. (P2.)

2. **`ReactPreview` ships NO CSP at all** (`artifact-components/ReactPreview.tsx`). The generated iframe doc loads Babel/React/Tailwind from external CDNs (`unpkg.com`, `cdn.tailwindcss.com`, `esm.sh`) and runs LLM-authored JSX with **no `connect-src` restriction** — arbitrary network egress from the user's machine. `sandbox="allow-scripts"` (no same-origin) correctly isolates parent cookies/storage, and `postMessage` is origin+channel+source checked (`:206-209`), so this is egress/SSRF, not host takeover. Mounted by `ArtifactPanel:701` and `ArtifactRenderer:748` (shipping Desktop chat). Secondary: user code is injected into a JS template literal via `escapeCodeForTemplateLiteral` (escapes `` ` ``/`$`/`\`) but a literal `</script>` inside `userCode` could still terminate the inline `<script>` block at HTML-tokenize time of `srcDoc`, breaking the preview (bounded by sandbox — DoS of the preview, not escape). (P2 for the missing CSP; P3 for the `</script>` breakout.)

**unified-chat / `ArtifactRenderer` SVG sanitizer** — correctly hardened: attribute allowlist + URL-scheme allowlist via `new URL` parse (not `startsWith`), blocking `javascript:`/`data:`/`vbscript:` (`alert-450`, `:184-203`). Good.

---

## AI-slop

Low overall; this is a deliberately-engineered, not vibe-generated, slice. Items:

- **`ui/Tooltip.tsx`** — explicit "Minimal stub -- wraps children without tooltip behavior": drops `content` and `side` props, renders `<>{children}</>`. Used by `UserProfile`, `TokenCounter`, `Sidebar`, `ConversationItem` → those tooltips render nothing on hover. Degraded UX, not broken. (P3.)
- **`promptClassifier.ts`** — `ClassifyOptions.hasDocumentAttachment` (`:50`) is declared but never read in `classifyPrompt` (only `hasImageAttachment`/`autoModeId` destructured). Dead option / unimplemented signal. (P3.)
- **Hardcoded colors inside iframe srcDoc** (`artifact-sandbox.ts:24`, `ReactPreview.tsx:54-55,61`) — `#e4e4e7`/`#18181b`/`#f87171`. These are inside self-contained sandbox documents, not the themeable app UI, so the "no hardcoded colors" rule is arguably N/A; still inconsistent with the token discipline used elsewhere. (P3.)
- **`SectionPlaceholder` proliferation** in `SettingsShell` (6 placeholder sections) — looks like a half-built settings UI, but it is an unused export, so no user impact today. (P3.)
- No fabricated/RNG data rendered to users found: every `Math.random`/`crypto.randomUUID` is legitimate ID/key generation; no hardcoded fake metrics, no invented model IDs (routing resolves through `getRoutingSlotModel` from `@agiworkforce/types`, honoring the models.json rule); the "1,062+ commands" claim is accurate (1,084 verified). No hallucinated APIs found.

---

## Broken / half-built features

- **`AttachmentMenu.tsx:208`** — "Add to project" menu item: `onClick` only fires `toast.info('Projects coming soon')` then closes the menu. A dead button rendered to users in a shipping chat composer. (P2.)
- **`buildSandboxedHtml` no-`<head>` branch** — see Security #1; functionally a silent CSP-loss, not a visible break. (P2.)
- **`ReactPreview` no CSP** — see Security #2. (P2.)
- **`SettingsShell` default sections** — 6/7 render placeholder text, no controls; mitigated by being unmounted. (P3.)
- **`SettingsModal` event-only shim** — settings button no-ops if host doesn't listen. (P3.)
- **`Tooltip` stub** — tooltips never show. (P3.)
- **browser-tool runner unwired** — `runBrowserAction` has no shipping caller; the package's main value (Playwright execution) is not actually exercised by any surface. Could be intentional staging, or an integration gap. (P2 — likely-orphaned feature; flag for owner.)

---

## Severity-ranked issues

### P2
- **`ReactPreview` ships no CSP — unrestricted egress from LLM-authored artifacts.** `packages/unified-chat/src/components/artifact-components/ReactPreview.tsx:39-162` (no `connect-src`; loads remote CDNs). Mounted at `ArtifactPanel.tsx:701`, `ArtifactRenderer.tsx:748` (Desktop chat). Fix: add a `<meta http-equiv="Content-Security-Policy">` to the generated doc with a `connect-src` allowlist (esm.sh/unpkg/cdn.tailwindcss.com only) or `'none'` if the preview shouldn't talk to the network at all; keep `script-src` scoped to the CDNs it actually needs.
- **`buildSandboxedHtml` bypasses its CSP on 2 reachable branches.** `packages/unified-chat/src/lib/artifact-sandbox.ts:40-43`. Fix: never trust an artifact-supplied CSP — always strip/replace it with the package CSP; and when there is no `<head>`, inject one (e.g. insert after `<html…>` or fall back to wrapping) so the CSP is always present.
- **`connectorPermissionStore.get()` fails open by returning `null`.** `packages/unified-chat/src/lib/connectorPermissionStore.ts:79-82,155-166`. Fix: confirm every caller applies `defaultPermissionForTool(destructive)` (which must default destructive tools to needs-approval); consider returning the safe default from the store itself for destructive tools rather than `null`. Severity contingent on the out-of-slice default.
- **Dead "Add to project" button.** `packages/unified-chat/src/components/AttachmentMenu.tsx:208`. Fix: wire to the project store/host event or hide the item until Projects ships.
- **browser-tool Playwright runner has no shipping caller.** `packages/browser-tool/src/index.ts` (`runBrowserAction`). Fix: confirm with owner whether this is staged-for-later or a missing integration; if dead, gate behind a clear "experimental" export note.
- **api package is effectively untested.** 1 test file for 8,582 LOC / 1,084 wrappers. `packages/api/src`. Fix: at minimum add a generated test asserting each exported fn calls `command()` with a stable command-name string, to catch rename/typo drift against the Rust registry.
- **Rust `agiworkforce-apply-patch` is a compiled orphan duplicating the shipped TS package.** `crates/agiworkforce-apply-patch/`. Fix: either wire it into a Rust consumer or remove it to drop the maintenance/divergence risk (two patch-traversal implementations to keep in sync).

### P3
- TOCTOU window in apply-patch (`index.ts` realpath-check then write).
- `mcp` `callTool` does not re-validate tool name at invocation (`connect.ts:228`).
- `ReactPreview` `</script>` breakout in `userCode` can break the preview (sandbox-bounded; `:115`).
- `ui/Tooltip.tsx` stub renders no tooltip; 4 consumers affected.
- `promptClassifier` `hasDocumentAttachment` option unread (`:50`).
- `SettingsShell` placeholder sections + `SettingsModal` event-only shim (footguns, currently low-impact).
- Hardcoded colors inside sandbox iframe docs (token-discipline inconsistency).

---

## Open questions / uncertainty

- **Coverage honesty:** I deep-read ~10 of 78 unified-chat components (the artifact/sandbox/settings/attachment/classifier/permission surfaces and the index). The other ~68 components and most of the 21 stores/10 hooks are grep-covered only — there may be additional dead buttons or fabricated-data renders I did not individually read.
- **`connectorPermissionStore` fail-open** hinges on `defaultPermissionForTool` in `@agiworkforce/types` (out of slice). If it returns "allow" for destructive tools, the contingent P2 becomes a real fail-open. Needs the types-package owner to confirm.
- **browser-tool runner** — whether the missing shipping caller is intentional (extension does its own MV3-side automation and uses browser-tool only for shared `BrowserAction` types) or an integration gap. The type-only import in the extension suggests intentional, but no doc confirms the Playwright runner has a home.
- **api command-name correctness** — I did not cross-check all 1,084 `command()` name strings against the Rust command registry; with no tests, drift would be silent.
- I did not run any build, typecheck, or tests (recon is read-only); all "alive/dead" conclusions are from static import-graph greps.
