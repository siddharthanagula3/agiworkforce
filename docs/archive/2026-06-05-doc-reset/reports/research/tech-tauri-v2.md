# Tauri v2 (2.11) — Best Practices, Security & Pitfalls

Research date: 2026-05-29
Author: Research analyst (AGI Workforce)
Scope: Tauri v2 stable line (2.11.x). Framed against AGI Workforce's Desktop surface (`apps/desktop`, Tauri 2), v1 = Local + BYOK, local-first privacy.

> Confidence: **medium-high**. Repo facts below come from direct file reads (high confidence). The headline security advisory was independently verified through GitHub's structured advisory API (high confidence). Several framework-mechanism descriptions are derived from official-docs page summaries (e.g., isolation AES-GCM mechanism, async borrowed-args limitation); these are very likely correct but are doc-summary-derived rather than independently re-tested. Where a claim is thinner, it is flagged inline.

---

## Summary

Tauri v2 is the maintained line; the current stable as of 2026-05-29 is **tauri 2.11.2** (core), with `@tauri-apps/api` 2.11.0, `@tauri-apps/cli`/`tauri-cli` 2.11.2, `tauri-bundler` 2.9.2, `wry` 0.55.1, `tao` 0.35.3 ([Tauri release page](https://v2.tauri.app/release/), accessed 2026-05-29). The security model is built on a layered **permission → capability → window** access-control list (ACL): commands are gated by permissions, permissions are granted to windows/webviews via capability files, and command implementations enforce optional fine-grained **scopes** (e.g., filesystem path allow/deny). CSP is configured in `tauri.conf.json` and Tauri auto-injects nonces/hashes for bundled assets at build time. The updater enforces **mandatory** minisign signature verification that cannot be disabled.

**The single most important finding for AGI:** AGI's desktop crate pins `tauri = "2.11.0"`, which is the **last version affected by CVE-2026-42184 / GHSA-7gmj-67g7-phm9** (origin-confusion IPC bypass, published 2026-05-06), patched in **2.11.1**. This is a Windows + Android issue; AGI ships a Windows desktop build, so it applies to AGI's Windows users. AGI mobile is Expo/React Native (not Tauri), so the Android half does not apply. The fix is a one-line bump to `tauri = "2.11.2"`.

AGI's existing posture is otherwise strong: it already uses scoped `fs` permissions with an extensive deny-list (`.ssh`, `.aws`, `.gnupg`, `.kube`, browser profiles, `.env`, `.git-credentials`, keychains), a restrictive CSP, `removeUnusedCommands: true`, OS-keychain secret storage (`keyring`), `unsafe_code = "deny"`, and a clippy lint against holding sync locks across `.await`. The main gaps are: the affected pinned version, no Isolation Pattern, a permissive `shell:allow-open` URL regex, and the absence of `freezePrototype`.

---

## Current bar (what best practice requires as of 2026-05-29)

These are the practices a modern Tauri 2 desktop app is expected to meet. Items are marked with AGI status where verifiable from the repo.

1. **Pin to a non-vulnerable core version and keep current.** Track [Tauri's release page](https://v2.tauri.app/release/) and [GitHub security advisories](https://github.com/tauri-apps/tauri/security/advisories). Run `cargo audit` + `npm/pnpm audit` in CI ([Tauri lifecycle threats](https://v2.tauri.app/security/lifecycle/), accessed 2026-05-29). **AGI: pinned at 2.11.0 — affected, must bump.**

2. **Least-privilege capabilities.** Grant only the permissions each window needs; security boundaries are keyed on window **labels**, not titles. Keep capability files small and organized; scope `remote` access only to domains you own ([Capabilities](https://v2.tauri.app/security/capabilities/), accessed 2026-05-29). **AGI: single `default` capability, 92 permissions, one window (`main`), no `remote` — acceptable for a single-window app.**

3. **Scoped permissions with deny-lists for filesystem/shell.** Use `scope.allow` / `scope.deny`; deny wins. Restrict `fs` to needed roots and explicitly deny sensitive paths ([Permissions](https://v2.tauri.app/security/permissions/), accessed 2026-05-29). **AGI: already does this well.**

4. **Strict CSP, no remote scripts.** Make CSP as restrictive as possible; load assets only from hosts you own; bundle locally rather than from a CDN; include `'wasm-unsafe-eval'` only if using WASM. Tauri appends its own nonces/hashes for bundled code automatically ([CSP](https://v2.tauri.app/security/csp/), accessed 2026-05-29). **AGI: has a detailed CSP; see gaps re `'unsafe-inline'` in style-src.**

5. **Validate all IPC command inputs in Rust.** Type safety is the first layer, but argument validation (paths, sizes, enums) must happen in the handler — the docs note no implicit per-argument security mechanism ([Calling Rust](https://v2.tauri.app/develop/calling-rust/), accessed 2026-05-29).

6. **Mandatory signed updates.** Use the updater plugin with a minisign keypair; keep the private key off `.env` files and ideally on a hardware token; sign via `TAURI_SIGNING_PRIVATE_KEY` in CI ([Updater plugin](https://v2.tauri.app/plugin/updater/), accessed 2026-05-29). **AGI: configured with minisign pubkey + endpoints.**

7. **Sign and notarize binaries per platform.** Code signing is "essential for user trust"; store signing keys on hardware tokens ([lifecycle threats](https://v2.tauri.app/security/lifecycle/)). **AGI: macOS Developer ID + entitlements + Windows SHA-256 timestamping configured.**

8. **Consider the Isolation Pattern when frontend dependency trust is a concern.** It injects a sandboxed iframe that intercepts and AES-GCM-encrypts IPC before it reaches Core, defending against compromised npm dependencies ([Isolation Pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/), accessed 2026-05-29). **AGI: not enabled (Brownfield).**

9. **`removeUnusedCommands` to shrink IPC attack surface.** Strips command handlers not referenced by any capability ([config schema](https://schema.tauri.app/config/2)). **AGI: enabled.**

10. **Sidecars locked down.** Bundle via `externalBin` with `-$TARGET_TRIPLE` suffixes; in capabilities, mark `"sidecar": true` and constrain `args` (never `"args": true` for untrusted input) ([Sidecar](https://v2.tauri.app/develop/sidecar/), accessed 2026-05-29). **AGI: ships `binaries/native_messaging_host` as a sidecar.**

---

## Version-specific facts (exact versions + dates)

Verified from the [official Tauri release page](https://v2.tauri.app/release/) (accessed 2026-05-29):

| Component | Latest stable (2026-05-29) | AGI repo pin |
|---|---|---|
| `tauri` (core) | **2.11.2** | **2.11.0** ⚠️ vulnerable |
| `@tauri-apps/api` | 2.11.0 | (frontend) |
| `@tauri-apps/cli` / `tauri-cli` | 2.11.2 | — |
| `tauri-build` | 2.x (bundler 2.9.2) | `tauri-build = "2.5.6"` |
| `wry` (webview) | 0.55.1 | transitive |
| `tao` (windowing) | 0.35.3 | transitive |

AGI plugin pins (from `apps/desktop/src-tauri/Cargo.toml`, read 2026-05-29): `tauri-plugin-shell` 2.3.5, `-process` 2.3.1, `-fs` 2.5.1, `-dialog` 2.7.1, `-updater` 2.10.0, `-notification` 2.3.3, `-clipboard-manager` 2.3.2, `-window-state` 2.4.1, `-global-shortcut` 2.3.0, `-deep-link` 2.4.7.

**Recommended action:** bump `tauri` and `tauri = { features = ["test"] }` dev-dep to `2.11.2`; refresh other plugins via `cargo update` and re-run `cargo audit`.

### Critical advisory — CVE-2026-42184 / GHSA-7gmj-67g7-phm9

Independently verified via GitHub's structured advisory API (`gh api /advisories/GHSA-7gmj-67g7-phm9`, queried 2026-05-29):

- **Title:** "Tauri has an Origin Confusion Issue that Allows Remote Pages to Invoke Local-Only IPC Commands"
- **CVE:** CVE-2026-42184 · **GHSA:** GHSA-7gmj-67g7-phm9
- **Published:** 2026-05-06
- **Severity:** Medium · **CVSS v4.0:** 6.1 (`CVSS:4.0/AV:N/AC:H/AT:P/PR:N/UI:P/VC:L/VI:H/VA:L/SC:N/SI:N/SA:N`)
- **Affected (Rust crate `tauri`):** `>= 2.0.0, <= 2.11.0` · **Patched:** `2.11.1`
- **Platforms:** Windows **and** Android only.
- **Root cause:** On Windows/Android, custom URI-scheme protocols are mapped to `http://<scheme>.localhost/`. `is_local_url()` validated origin using `split_once('.')`, which only inspects the first dot-delimited label. A remote page like `http://app.evil.com/` is therefore misclassified as the local `app.localhost` origin if an app registers an "app" protocol — letting remote pages invoke IPC commands intended to be local-only.

This is the **central upgrade driver**. AGI's `2.11.0` pin is the exact boundary of the affected range.

> Note: A WebSearch pass failed to surface this GHSA by ID; it was confirmed only through the authoritative GitHub advisory API and the affected/patched ranges there. Treat the GitHub API result as the source of truth.

### Other notable Tauri advisories (context)

From [Tauri security advisories](https://github.com/tauri-apps/tauri/security/advisories) (accessed 2026-05-29):
- **GHSA-57fm-592m-34r7** (2024-05-23, Moderate) — "iFrames Bypass Origin Checks for Tauri API Access Control." Same theme (origin/iframe IPC access) — reinforces being conservative with iframes and `remote` capabilities.
- **GHSA-2rcp-jvr4-r259** (2023-10-19, Low) — "Updater Private Keys Possibly Leaked via Vite Environment Variables." Keep the updater private key out of any bundler-exposed env (`VITE_*`).

---

## Known pitfalls & gotchas

1. **Pinning a version inside an affected advisory range.** AGI's `2.11.0` is the worst case here — current enough to look fine, but the last vulnerable version. Pin-and-forget without `cargo audit` in CI is the trap. ([advisory above])

2. **Async commands cannot take borrowed args.** `#[tauri::command] async fn` cannot accept `&str` or `State<'_, T>` directly; convert to owned (`String`) or wrap the return in `Result<T, E>`. Async commands run on `async_runtime::spawn` task pools, not the main thread ([Calling Rust](https://v2.tauri.app/develop/calling-rust/), accessed 2026-05-29). *(Doc-summary-derived.)*

3. **Holding a sync lock across `.await` (state management).** A `std::sync::MutexGuard` held across an await point can deadlock the async runtime. AGI already guards this with `clippy::await_holding_lock = "warn"` and CI `-D warnings` — keep it; for hot async paths use `tokio::sync::Mutex` or scope the lock to return cloned data ([AGI `Cargo.toml` lints], read 2026-05-29).

4. **Commands in `lib.rs` must not be `pub`.** Glue-code generation breaks if a command in `lib.rs` is `pub`; commands in separate modules *should* be `pub` ([Calling Rust](https://v2.tauri.app/develop/calling-rust/)). *(Doc-summary-derived.)*

5. **No implicit IPC argument validation.** Type-deserialization is the only built-in check; path-traversal, size limits, and enum validation must be hand-written in the handler. Combine with `fs`/`shell` scopes — don't rely on either alone.

6. **CSP `'unsafe-inline'` in `style-src`.** AGI's CSP allows `style-src 'self' 'unsafe-inline'`. `'unsafe-inline'` for styles is a common practical concession but weakens CSP; nonce/hash-based styles are stricter where the frontend allows it ([CSP](https://v2.tauri.app/security/csp/)).

7. **Permissive `shell:allow-open` regex.** AGI scopes `shell:allow-open` to `^https?://` and `^mailto:`. This is the conventional "open in default browser" pattern and is **not a vulnerability**, but `^https?://` matches any URL host. Low-priority hardening: anchor to known hosts or validate before calling. *(Hardening suggestion, not a finding.)*

8. **Sidecar `"args": true` = command injection.** Allowing arbitrary args on a sidecar removes the guardrail. AGI ships `native_messaging_host` as a sidecar — its capability `args` should be static or regex-validated, never `true` ([Sidecar](https://v2.tauri.app/develop/sidecar/)). **(Verify in AGI's shell capability — not fully inspected in this pass.)**

9. **Updater key handling.** The minisign private key must come from `TAURI_SIGNING_PRIVATE_KEY` in CI, never committed or placed in a bundler-readable `.env` (cf. GHSA-2rcp-jvr4-r259). Losing the private key permanently breaks updates for installed users ([Updater](https://v2.tauri.app/plugin/updater/)). *(Signature verification cannot be disabled — doc-stated.)*

10. **Sidecar target-triple naming.** Each `externalBin` needs a `-$TARGET_TRIPLE` variant per platform or the bundle silently lacks the binary on that platform; get the triple from `rustc --print host-tuple` ([Sidecar](https://v2.tauri.app/develop/sidecar/)).

11. **Remote capabilities on Linux/Android can't distinguish iframe vs window requests** — enabling `remote` there widens exposure; only grant to owned domains ([Capabilities](https://v2.tauri.app/security/capabilities/)).

12. **`removeUnusedCommands` can strip commands you invoke only dynamically.** If a command is referenced only via a string built at runtime (not statically in a capability), it may be removed — confirm every needed command is granted in a capability.

---

## Implications / gaps for AGI Workforce

Priority-ordered, scoped to `apps/desktop` (do not edit source per task constraints — these are recommendations):

**P0 — Patch the advisory.**
- Bump `tauri` (and the `tauri` dev-dependency with `features=["test"]`) from `2.11.0` → `2.11.2` in `apps/desktop/src-tauri/Cargo.toml`. This closes CVE-2026-42184 (affects AGI's Windows desktop users). Verify with `cargo update -p tauri` then `cargo audit`. The Android half does not apply (AGI mobile = Expo/RN).

**P1 — Make the patch durable.**
- Add `cargo audit` (and `cargo deny`/`cargo vet` if feasible) plus `pnpm audit` as blocking CI steps so the next in-range advisory is caught automatically. AGI's lifecycle bar already expects this ([lifecycle threats](https://v2.tauri.app/security/lifecycle/)).

**P2 — Consider the Isolation Pattern.** AGI is a multi-provider AI app with a large npm dependency tree; the Isolation Pattern is precisely designed for "untrusted frontend dependency" supply-chain risk. It adds modest AES-GCM overhead and a `dist-isolation` dir. Worth a spike given local-first/BYOK secrets flow through the webview ([Isolation](https://v2.tauri.app/concept/inter-process-communication/isolation/)).

**P3 — Hardening polish.**
- Tighten `shell:allow-open` beyond `^https?://` (anchor to known hosts) — low risk, easy win.
- Evaluate replacing `'unsafe-inline'` in `style-src` with nonces/hashes.
- Add `app.security.freezePrototype: true` to mitigate prototype-pollution from the webview side (not currently present in `tauri.conf.json`).
- Confirm the `native_messaging_host` sidecar capability constrains `args` (not `"args": true`).

**Already strong — keep:**
- Scoped `fs` allow/deny with an extensive sensitive-path deny-list (.ssh/.aws/.gnupg/.kube/browser profiles/.env/keychains) — this directly serves the local-first privacy promise and is above the typical bar.
- `removeUnusedCommands: true`, `unsafe_code = "deny"`, `await_holding_lock` lint, OS-keychain secret storage via `keyring`, `ed25519-dalek` + minisign updater signing, macOS notarization + Windows SHA-256 timestamping, restrictive CSP with `frame-ancestors 'none'` and `object-src 'none'`.

**Cross-surface note:** The origin-confusion class (this advisory + the 2024 iframe advisory) is a recurring Tauri IPC theme. AGI's BYOK design routes provider API keys through the desktop webview; any future use of remote content, iframes, or `remote` capabilities should be treated as high-risk and reviewed against these advisories. This is consistent with AGI's locked trust-boundary rules (Local / BYOK / Managed Cloud are separate boundaries; never silently cross them).

---

## Sources

- Tauri Core Ecosystem Releases (version table) — https://v2.tauri.app/release/ — accessed 2026-05-29
- Tauri Security overview — https://v2.tauri.app/security/ — accessed 2026-05-29
- Tauri Capabilities — https://v2.tauri.app/security/capabilities/ — accessed 2026-05-29
- Tauri Permissions — https://v2.tauri.app/security/permissions/ — accessed 2026-05-29
- Tauri Content Security Policy — https://v2.tauri.app/security/csp/ — accessed 2026-05-29
- Tauri Isolation Pattern — https://v2.tauri.app/concept/inter-process-communication/isolation/ — accessed 2026-05-29
- Tauri Application Lifecycle Threats — https://v2.tauri.app/security/lifecycle/ — accessed 2026-05-29
- Tauri Calling Rust from the Frontend (commands, async, State, channels) — https://v2.tauri.app/develop/calling-rust/ — accessed 2026-05-29
- Tauri Updater plugin (signature verification) — https://v2.tauri.app/plugin/updater/ — accessed 2026-05-29
- Tauri Embedding External Binaries (sidecar) — https://v2.tauri.app/develop/sidecar/ — accessed 2026-05-29
- Tauri Security Advisories index — https://github.com/tauri-apps/tauri/security/advisories — accessed 2026-05-29
- GHSA-7gmj-67g7-phm9 / CVE-2026-42184 (GitHub advisory API, structured) — https://github.com/tauri-apps/tauri/security/advisories/GHSA-7gmj-67g7-phm9 — published 2026-05-06, verified 2026-05-29
- GHSA-57fm-592m-34r7 (iframe origin bypass) — https://github.com/tauri-apps/tauri/security/advisories/GHSA-57fm-592m-34r7 — published 2024-05-23
- GHSA-2rcp-jvr4-r259 (updater key leak via Vite env) — https://github.com/tauri-apps/tauri/security/advisories/GHSA-2rcp-jvr4-r259 — published 2023-10-19
- Context7 Tauri v2 docs (CLI permission/capability commands, updater capability) — /websites/v2_tauri_app — accessed 2026-05-29
- AGI repo: `apps/desktop/src-tauri/Cargo.toml`, `tauri.conf.json`, `capabilities/default.json` — read 2026-05-29

---

*Methodology: official Tauri v2 docs and the structured GitHub advisory API were treated as primary sources; community/social were not relied upon for any load-bearing claim. The headline advisory was confirmed via `gh api` after a WebSearch failed to corroborate it. Repo claims are from direct file reads. Doc-mechanism descriptions sourced via small-model page summaries are flagged inline.*
