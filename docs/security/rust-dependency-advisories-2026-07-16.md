# Rust Dependency Advisories — cargo-deny Baseline

Status: Current
Owner: Desktop lead + CLI lead (consuming-crate owners)
Last updated: 2026-07-16
Source: first cargo-deny run against the new root deny.toml (W5 guardrail batch); tracked as RUST-DEPENDENCY-ADVISORIES-01 in docs/agent-context/known-flaws.md.

Final state: `advisories FAILED, bans ok, licenses FAILED, sources ok`.
This is the correct, honest state per item 2's own escape valve — not
suppressed. Full raw output: this session's Bash history
(`cargo deny check` run against the finalized `deny.toml`).

## licenses FAILED — 15 first-party crates, one root cause

Fix: add `publish = false` to each `[package]` table; `deny.toml` already
has `[licenses.private] ignore = true` waiting for it (currently a no-op).
Six of fifteen are co-dirty with the M6 lane right now (marked below) so a
partial fix would leave an undocumented asymmetry — do this as one atomic
follow-up PR touching all fifteen at once.

- agiworkforce-desktop (apps/desktop/src-tauri/Cargo.toml) — DIRTY (M6)
- agiworkforce-cli (apps/cli/Cargo.toml) — DIRTY (M6)
- agiworkforce-app-server (crates/agiworkforce-app-server/Cargo.toml) — DIRTY (M6)
- agiworkforce-network-proxy (crates/agiworkforce-network-proxy/Cargo.toml) — DIRTY (M6)
- agiworkforce-protocol (crates/agiworkforce-protocol/Cargo.toml) — DIRTY (M6)
- agiworkforce-utils-image (crates/agiworkforce-utils-image/Cargo.toml) — DIRTY (M6)
- agiworkforce-command-registry — clean
- agiworkforce-sandbox-policy — clean
- agiworkforce-agent-core — clean
- agiworkforce-execpolicy — clean
- agiworkforce-licensing — clean
- agiworkforce-llm — clean
- agiworkforce-mcp — clean
- agiworkforce-model-registry (Rust crate, crates/agiworkforce-model-registry — distinct from the new TS packages/ai/model-registry) — clean
- agiworkforce-utils-absolute-path — clean

Two sub-categories, same fix: 5 declare `license = "Proprietary"` (not
valid SPDX -> `warning[parse-error]`), 10 have no `license` field at all
(-> `warning[no-license-field]`). Both collapse to `error[unlicensed]`.

## advisories FAILED — 40 distinct RUSTSEC IDs

Not this batch's to fix (dependency upgrades/replacements owned by
desktop/CLI leads who own the consuming crates). Split by severity:

### Real vulnerabilities (7 distinct IDs — triage first)

- RUSTSEC-2026-0098 / 0099 — rustls/webpki: name-constraint validation
  bypass (wildcard names, URI names incorrectly accepted)
- RUSTSEC-2026-0104 — reachable panic in certificate revocation list (CRL)
  parsing
- RUSTSEC-2026-0118 — hickory-dns: NSEC3 closest-encloser proof unbounded
  loop on cross-zone responses
- RUSTSEC-2026-0119 / 0174 — hickory-dns: O(n^2) name compression CPU
  exhaustion (two advisory IDs, same class)
- RUSTSEC-2026-0187 — lopdf: stack overflow via deeply nested PDF objects
- RUSTSEC-2026-0194 / 0195 — quick-xml: quadratic runtime on duplicate
  attribute names + unbounded namespace-declaration allocation (DoS)

### Soundness bugs (2)

- RUSTSEC-2026-0097 — `rand` unsound with a custom logger using `rand::rng()`
- RUSTSEC-2026-0190 — unsoundness in `Error::downcast_mut()`

### Notice (1)

- (unnumbered in grep, "notice" category) `Authorization::value` /
  `WwwAuthenticate::value` can violate ASCII invariants (headers crate)

### Unmaintained (29 distinct IDs, incl. one 10-deep chain)

RUSTSEC-2024-0411 through 0420 (10 IDs) — the entire gtk-rs GTK3 bindings
chain is EOL/no-longer-maintained (Linux desktop tray/webkit integration
path). Also: RUSTSEC-2017-0008 (`serial`), 2024-0320 (`yaml-rust`, CLI's
syntect/two-face syntax highlighting), 2024-0370 (`proc-macro-error`),
2024-0384 (`instant`), 2024-0388 (`derivative`), 2024-0436 (`paste`),
2025-0052 (`async-std` discontinued), 2025-0057 (`fxhash`), 2025-0075/
0080/0081 (`unic-char-range`/`unic-common`/`unic-char-property`),
2025-0098/0100 (`unic-ucd-version`/`unic-ucd-ident`, via urlpattern ->
tauri-utils), 2025-0119 (`number_prefix`), 2025-0134 (`rustls-pemfile`),
2025-0141 (`Bincode`), 2026-0105 (`core2`, also yanked), 2026-0192
(`ttf-parser`).

### Yanked (1, warning not error)

- core2 v0.4.0 (via bitstream-io -> rav1e -> ravif -> image) — also
  covered by RUSTSEC-2026-0105 above; `cargo update -p core2` was
  suggested by the tool itself but not run (out of scope: dependency
  upgrade, not config).

## bans ok / sources ok

- bans: real duplicate-version warnings exist (windows-sys family,
  rand/rand_core, tungstenite, notify, r-efi, webpki-roots, etc.) but stay
  at `warn` per the task's explicit spec — none blocks the check.
- sources: clean after removing the redundant `[sources.allow-org]` entry
  (the exact `allow-git` URLs for the two openai-oss-forks patched crates
  already cover them; the org-level entry was unused and threw
  `warning[unmatched-organization]`).

## Recommended CI wiring (delta, not applied — .github/\*\* is off-limits)

Wire `bans` + `sources` as blocking now (both green). Wire `advisories` +
`licenses` as non-blocking/report-only until: (a) the 15-manifest
`publish = false` follow-up lands, and (b) the 40 RUSTSEC IDs get an owner
triage pass (fix, ignore-with-reason, or accept). Suggested job (new step
in ci.yml or a dedicated job, mirroring the existing Rust toolchain setup
pattern already in ci.yml — actions-rust-lang/setup-rust-toolchain pinned
to rust-toolchain.toml's 1.94.0):
cargo install cargo-deny --locked
cargo deny check bans sources # blocking
cargo deny check advisories licenses # continue-on-error: true, for now
