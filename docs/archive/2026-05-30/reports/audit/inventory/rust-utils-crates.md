# Inventory Audit — Rust small utils crates (in-closure)

**Slice:** `crates/agiworkforce-utils-{absolute-path,cache,home-dir,image,rustls-provider,string,template}`
**Date:** 2026-05-29
**Auditor:** inventory recon (read-only)
**Method:** Full Read of every `src/*.rs` in all 7 crates + all `Cargo.toml`/`README.md`; grep sweep for panic/unwrap/expect/todo/unimplemented, TODO/FIXME/HACK, security patterns; consumer tracing across `apps/cli` and `crates/`. No builds run.

---

## 1. Purpose & Architecture

All seven are small leaf utility crates, edition 2024, inheriting `[lints] workspace = true`. They are ports/adaptations of `codex-rs` utility crates (several comments and the `BUILD.bazel` reference `codex_*` names). Each has a README with a `Status: Current / Last updated: 2026-05-20` header.

| Crate | Purpose | LOC (src) |
|---|---|---|
| `utils-absolute-path` | `AbsolutePathBuf` newtype: lexical absolutization + `~` expansion + Windows verbatim-prefix normalization + serde/schemars/ts-rs. Vendors `path-absolutize` logic locally in `absolutize.rs`. | ~870 (incl. heavy tests) |
| `utils-cache` | `BlockingLruCache<K,V>` (Tokio-mutex-guarded `lru::LruCache`) + `sha1_digest`. | ~194 |
| `utils-home-dir` | `find_agiworkforce_home()` — resolve `$AGIWORKFORCE_HOME` or `~/.agiworkforce`. | ~136 |
| `utils-image` | `load_for_prompt_bytes()` — decode/resize/re-encode prompt images, LRU-cached by SHA-1. | ~333 |
| `utils-rustls-provider` | `ensure_rustls_crypto_provider()` — install process-wide ring crypto provider once. | ~13 |
| `utils-string` | JSON ASCII-escape, UTF-8-safe byte truncation, metric-tag sanitize, UUID finder, markdown `#L..` location normalize, token/byte estimates, middle-truncation. | ~213 + ~160 |
| `utils-template` | Strict `{{ name }}` placeholder templating, fails on malformed/missing/extra/duplicate. | ~443 (incl. tests) |

**Dependency edges among the slice:** `utils-image` depends on `utils-cache`. The rest are independent leaves.

---

## 2. Alive vs Dead

**ALL SEVEN ARE ALIVE** in the CLI shipping closure (verified by grep of consumers, matching the brief's cargo-tree closure):

- `utils-absolute-path` → `execpolicy` (`parser.rs`, `policy.rs`, `rule.rs`), `network-proxy` (`config.rs`, `runtime.rs`), `protocol` (`approvals.rs`, `config_types.rs`, `items.rs`, `models.rs`, `permissions.rs`, `protocol.rs`, `request_permissions.rs`). Heavily used.
- `utils-cache` → `utils-image` (`IMAGE_CACHE`). No other in-closure consumer of `BlockingLruCache` found; `sha1_digest` only used by `utils-image`.
- `utils-home-dir` → `network-proxy/src/certs.rs:100` (`find_agiworkforce_home`).
- `utils-image` → `apps/cli/src/lib.rs:2268` (`read_file_contexts`), `protocol/src/models.rs` (`local_image_content_items_with_label_number`).
- `utils-rustls-provider` → `network-proxy/src/http_proxy.rs:116` (`ensure_rustls_crypto_provider`).
- `utils-string` → `protocol/src/error.rs:420-421` (truncate), `protocol/src/protocol.rs:2970,2981` (token estimates). `to_ascii_json_string`, `take_*_bytes_at_char_boundary`, `sanitize_metric_tag_value`, `find_uuids`, `normalize_markdown_hash_location_suffix` — **no in-closure consumers found** (exported public API; likely used by orphan crates or reserved). Not dead per se (public lib API) but unexercised by shipping binaries beyond truncate + token helpers.
- `utils-template` → `protocol/Cargo.toml` declares it. **No in-closure call sites of `Template::parse`/`render` found** outside the crate's own tests. Declared as a dep by `protocol` but I found no source reference to it in `protocol/src`. Possible dormant/forward-declared dependency — see Open Questions.

No fully-dead modules. Some public functions in `utils-string` and the entire `utils-template` API are not exercised by the shipping binaries despite being in the dependency graph.

---

## 3. Test Coverage

| Crate | Inline `#[cfg(test)]` | Assessment |
|---|---|---|
| `utils-absolute-path` | ~20 tests | Strong. Covers home-expansion, base-relative resolution, dot-normalization, canonicalize, ancestors, Windows verbatim prefixes (cfg-gated), symlink-preserving canonicalize, deserialization guard, missing-cwd child process. |
| `utils-cache` | 3 tests | Adequate for happy path. **Gap: no test for current-thread-runtime behavior** (see §4 P-1); the multi-thread flavor is pinned, masking the panic. |
| `utils-home-dir` | 4 tests | Good. Missing-path-fatal, file-path-fatal, valid-dir-canonicalize, default. |
| `utils-image` | 5 tests | Good functional coverage (within/over bounds, original mode, invalid input, cache-bust on content change). Tests pinned to `flavor = "multi_thread"`. |
| `utils-rustls-provider` | **0 tests** | None. README says "Add tests or documented manual verification for certificate loading and TLS initialization changes" — not met. Trivial function, but it is `Criticality: high`. |
| `utils-string` | 7 tests in `lib.rs` | `lib.rs` tested. **`truncate.rs` has ZERO tests** — module comment at lines 155-159 says the upstream `tests` submodule "was not ported … Restore once the truncation tests are recovered from upstream." This is the most complex code in the slice (byte-budget middle truncation) and is currently untested. |
| `utils-template` | ~12 tests | Excellent. Parse errors, render errors, escapes, multiline, reuse, dup/extra/missing. |

---

## 4. Panic / Crash Sites

Regex sweep found **zero** `panic!`/`todo!`/`unimplemented!` in non-test code. One `unreachable!`, several `unwrap()`/`expect()`. After analysis, the material risk is **not** in the regex hits — it is a panic-by-library-call in `utils-cache`.

### P-1 (HEADLINE): `BlockingLruCache` panics inside a `current_thread` Tokio runtime
`crates/agiworkforce-utils-cache/src/lib.rs:122-128`
```rust
fn lock_if_runtime<K, V>(m: &Mutex<LruCache<K, V>>) -> Option<MutexGuard<'_, LruCache<K, V>>> {
    tokio::runtime::Handle::try_current().ok()?;
    Some(tokio::task::block_in_place(|| m.blocking_lock()))
}
```
`Handle::try_current()` succeeds on **any** runtime including `current_thread`. `tokio::task::block_in_place` **panics** ("can call blocking only when running on the multi-threaded runtime") inside a `current_thread` runtime. The doc comment at lib.rs:11-12 ("Calls outside a Tokio runtime are no-ops") is therefore incomplete and misleading: *outside* a runtime it is a no-op, but *inside a current-thread runtime it panics.* The tests being pinned to `flavor = "multi_thread"` (lib.rs:149,158 and image lib.rs:214 etc.) is a tell the authors know it breaks otherwise.

**Reachability — confirmed there IS a current-thread runtime in the shipping CLI:**
- `apps/cli/src/main.rs:4` and `apps/cli/src/bin/agiworkforce.rs:4` build `new_multi_thread()` → main path is SAFE.
- BUT `apps/cli/src/subagent.rs:180` builds `tokio::runtime::Builder::new_current_thread()` on a dedicated OS thread and `block_on(run_subagent(...))`.
- The only `BlockingLruCache` instance in the closure is `IMAGE_CACHE` in `utils-image`, hit via `load_for_prompt_bytes`. That is called from `protocol/src/models.rs:1315` (`local_image_content_items_with_label_number`, the `UserInput::LocalImage` arm of synchronous chat-message construction) and from `apps/cli/src/lib.rs:2269` (`read_file_contexts`).

**Verdict:** If a subagent ever builds a prompt message containing a `LocalImage` (or otherwise reaches `load_for_prompt_bytes`) while executing under that `current_thread` runtime, the subagent thread panics. I could not statically confirm whether `run_subagent` constructs messages with `UserInput::LocalImage` (that flow lives in deeper core code outside this slice). **P1 if a subagent prompt can carry a local image; P2 latent otherwise** (the doc is wrong and any future current-thread consumer or current-thread test will crash). Filed as **P1** because the crash-prone runtime and the only cache consumer both ship in the same binary and the gap is a one-line condition away. Fix hint: in `lock_if_runtime`, detect `Handle::current().runtime_flavor()` and fall back to a non-`block_in_place` lock (e.g. `try_lock` loop or `blocking_lock` directly off-runtime) on `RuntimeFlavor::CurrentThread`; and fix the doc comment.

### Non-test panic hits — analyzed safe (invariants)
- `utils-image/src/lib.rs:182` `unreachable!("unsupported target_format …")` — genuine invariant: the `match target_format` at lines 134-138 maps every input to exactly `Jpeg | WebP | Png`, so the `_` arm is unreachable. Safe.
- `utils-image/src/lib.rs:54` `NonZeroUsize::new(32).unwrap_or(NonZeroUsize::MIN)` — non-panicking (`unwrap_or`). Safe.
- `utils-image/src/lib.rs:106` `.unwrap_or(ImageFormat::Png)` — non-panicking. Safe.
- `utils-string/src/lib.rs:108` `Regex::new(<static UUID pattern>).unwrap()` — static, well-formed regex; `#[allow(clippy::unwrap_used)]` with comment "safe thanks to the tests" (`find_uuids_*` tests). Safe.
- `utils-string/src/truncate.rs:29,143` `u64::try_from(...).unwrap_or(u64::MAX)` — non-panicking. Safe.
- `utils-image/src/error.rs:42` `.unwrap_or_else(|| "unknown")` — non-panicking. Safe.

All `expect()` hits in §grep are inside `#[cfg(test)]` modules (or `test_support`, which is gated `#[expect(clippy::expect_used)]` at absolute-path lib.rs:274 and intended for tests only). No user-reachable panics from those.

---

## 5. TODO / FIXME / HACK

- **0** real TODO/FIXME/HACK in any of the 7 crates. (The single grep hit at `utils-string/src/lib.rs:4` is `\uXXXX` inside a doc comment — false positive.)
- One **historical note** worth tracking, not a TODO marker: `utils-string/src/truncate.rs:155-159` — the truncation test submodule was dropped during the port and never restored ("Restore once the truncation tests are recovered from upstream"). See §3 coverage gap.

---

## 6. Security-sensitive code

### 6.1 `utils-rustls-provider` (Criticality: high) — half-built / never-implemented "native certs"
`crates/agiworkforce-utils-rustls-provider/src/lib.rs` does **only** `rustls::crypto::ring::default_provider().install_default()`. The function correctly idempotently installs a crypto provider, and the `let _ =` swallow of the install result is acceptable (a prior install by another crate is fine). **However:**
- `Cargo.toml` declares `rustls-native-certs = "0.8.3"` as a dependency that is **never referenced** anywhere in `src/`.
- The README "What Belongs Here" lists **"Native certificate loading helpers"** and the crate's stated purpose is "rustls provider/certificate setup."
- => This is a **never-implemented feature** (cert loading), not merely an unused dep. Callers load roots elsewhere; this crate ships only the provider install. Concern: doc/intent vs implementation drift in a `Criticality: high`, security-review-required crate, plus a dead dependency in the supply chain. **P3** (no active vuln; the actual TLS root loading happens in the consumer `network-proxy`). Recommend: either implement the native-certs helper or drop the dep + correct the README. Also: **zero tests** in a high-criticality TLS crate.

### 6.2 `utils-cache` — SHA-1 used as cache key
`sha1_digest` (lib.rs:135) uses SHA-1 only as an `IMAGE_CACHE` content key (image lib.rs:64). Not a security boundary; collision risk is negligible for prompt-image dedup. Note for hygiene only (the CLI elsewhere uses `sha2`). No finding.

### 6.3 `utils-home-dir` — env-driven path + canonicalize
`find_agiworkforce_home` reads `$AGIWORKFORCE_HOME`, requires it to exist + be a dir, then `path.canonicalize()`. No traversal beyond what the user controls (it is the user's own env var). Behavior is documented and matches the README/doc-comment. No finding. (Minor: a non-empty env var pointing at a symlinked dir is canonicalized through the symlink, which is the opposite policy from absolute-path's symlink-preserving helpers — intentional here, not a bug.)

### 6.4 `utils-absolute-path` — lexical normalization (traversal-relevant, feeds the sandbox)
`resolve_path_against_base` / `join` / `absolutize_from` resolve `..` and `.` **lexically**, never touching the filesystem (`absolutize.rs:26-45` `normalize_path` just manipulates `Component`s). Only `canonicalize()` (lib.rs:97) resolves symlinks physically. Separately, `canonicalize_preserving_symlinks` / `canonicalize_existing_preserving_symlinks` (lib.rs:189-212) **intentionally return the logical (lexical) path** when any ancestor is a symlink (`should_preserve_logical_path`, lib.rs:214-221).

`AbsolutePathBuf` is consumed by `execpolicy` (`policy.rs`, `parser.rs`, `rule.rs`) and `canonicalize_preserving_symlinks` by `protocol/src/permissions.rs:8`. If a security boundary (sandbox allow/deny, permission gate) is decided on the *logical/lexical* path while actual file access follows the *physical symlink target*, that is a classic symlink-bypass class: a policy says `/workspace/a` is allowed, `/workspace/a` is a symlink to `/etc`, the lexical path passes the check, the OS opens `/etc`. **Whether this is exploitable depends entirely on how `execpolicy`/`permissions` use these values vs. how file access is performed — which is OUTSIDE this slice.** Documented here as behavior; raised as **P2 + Open Question** for the execpolicy and protocol/permissions slices to confirm. Could be P1 if a consuming slice confirms the boundary is decided on the preserved-logical path.

### 6.5 `utils-string` — UTF-8 byte-slice safety (focus area) — AFFIRMATIVELY SAFE
The task flagged byte-slice panics; here is the explicit analysis:
- `sanitize_metric_tag_value` does `trimmed[..MAX_LEN]` (lib.rs:96). **Safe** because every retained char is mapped to ASCII (the `.map` at 81-87 replaces every non-`[A-Za-z0-9._\-/]` char with `'_'`, all 1-byte), so byte index 256 is always a char boundary.
- `take_bytes_at_char_boundary` (lib.rs:38-51) and `take_last_bytes_at_char_boundary` (lib.rs:55-73) iterate `char_indices()` and only slice at accumulated char boundaries. **Safe.**
- `truncate.rs split_string` (lib.rs:86-124) computes `prefix_end`/`suffix_start` strictly from `char_indices()` boundaries and clamps `suffix_start >= prefix_end`. **Safe.** No raw byte arithmetic into `&s[..]`.
- `to_ascii_json_string` (lib.rs:8-28) iterates `chars()` and pushes escapes — no slicing. Surrogate-pair math for code points > U+FFFF is correct. **Safe.**
- Conclusion: **No UTF-8 byte-boundary panic in this crate.** (Untested, though — see §3.)

### 6.6 `utils-template` — injection (focus area)
Strict templating: placeholders are looked up by exact name in a `BTreeMap`, values are inserted verbatim with no recursive re-expansion (`render`, lib.rs:196-208). A rendered value containing `{{...}}` is **not** re-parsed, so there is no template-injection-via-value. Parser rejects nested/empty/unterminated/unmatched delimiters. The crate does NO HTML/shell escaping — that is the caller's responsibility (it's a text templater). No finding within scope.

### 6.7 `utils-image` — decode of untrusted bytes
`load_for_prompt_bytes` decodes arbitrary file bytes via the `image` crate (lib.rs:77). The `image` crate returns `Err` (handled) rather than panicking on malformed input — confirmed by the `fails_cleanly_for_invalid_images` test. Decompression-bomb / pixel-flood risk exists in principle for any image decoder, but (a) the input is the user's own `-f` file, not network-attacker-controlled, and (b) I cannot verify the pinned `image ^0.25.9` against RUSTSEC offline. One line in Open Questions; not filed as a finding.

---

## 7. AI-slop

- **Misleading doc comment** at `utils-cache/src/lib.rs:11-12` ("Calls outside a Tokio runtime are no-ops") — understates behavior; current-thread runtime panics. (Tied to §4 P-1.)
- **Dead manifest dependencies** (declared, never referenced in `src/`):
  - `utils-absolute-path/Cargo.toml`: `path-absolutize = "3.1.1"` — the crate vendors its own implementation in `absolutize.rs` (comment at lines 1-8) and never imports `path_absolutize`. Dead dep.
  - `utils-cache/Cargo.toml`: `anyhow`, `serde` — neither referenced in `src/`. (`tracing` also declared, no `use` found.) Dead deps.
  - `utils-home-dir/Cargo.toml`: `anyhow`, `serde` — neither referenced in `src/`. Dead deps.
  - `utils-string/Cargo.toml`: `anyhow` — not referenced (`serde`/`serde_json`/`regex-lite` ARE used). Dead dep.
  - `utils-rustls-provider/Cargo.toml`: `rustls-native-certs = "0.8.3"` — never referenced (see §6.1). Dead dep + unimplemented feature.
  - These do not trip the `unused = "deny"` rustc lint (that flags code, not Cargo deps; `cargo-udeps` would catch them). They are supply-chain bloat / drift.
- **Stale bazel artifact**: `utils-template/BUILD.bazel` references `codex_rust_crate` / `crate_name = "codex_utils_template"` — leftover from the codex-rs port; the repo is pnpm+cargo (no bazel in use per CLAUDE.md). Cosmetic.
- **Inconsistent Cargo.toml shape**: `utils-template/Cargo.toml` has no `[lib]` section and no `[dependencies]` (only dev-deps). It compiles via default `src/lib.rs` autodetection (cargo check passes per brief). Not a bug, just inconsistent with the other six crates which all declare explicit `[lib]`.

No fabricated/hardcoded data rendered to users, no hallucinated APIs, no dead UI branches in this slice.

---

## 8. Broken / half-built features

1. **`utils-rustls-provider` native-cert loading never implemented** — README + stated purpose + an unused `rustls-native-certs` dep promise cert loading; `src/lib.rs` only installs the ring provider. (file: `utils-rustls-provider/src/lib.rs:1-13`, `Cargo.toml`). P3.
2. **`utils-string` truncation tests dropped, never restored** — `truncate.rs:155-159`; the most intricate code in the slice ships untested. Not user-facing breakage, but a verification hole. P2.
3. No dead buttons/empty shells (these are libraries, not UI).

---

## 9. Severity-ranked issues

### P1
- **`BlockingLruCache` will panic if reached from the CLI's current-thread subagent runtime.** `utils-cache/src/lib.rs:122-128` (`block_in_place` under `Handle::try_current()`) + reachable current-thread runtime at `apps/cli/src/subagent.rs:180` + the only cache consumer `IMAGE_CACHE` reachable via `load_for_prompt_bytes` (`protocol/src/models.rs:1315`, `apps/cli/src/lib.rs:2269`). Main CLI path (multi-thread, `main.rs:4`) is safe. *Fix:* branch on `RuntimeFlavor::CurrentThread` and avoid `block_in_place`; correct the doc comment. *Severity caveat:* downgrade to P2 if it is provably impossible for a subagent prompt to carry a `LocalImage`/reach the image cache — I could not confirm that bound within this slice.

### P2
- **Lexical/logical path normalization may underlie a sandbox/permission symlink-bypass.** `utils-absolute-path/src/lib.rs:189-221` (symlink-preserving canonicalize) + `absolutize.rs:26-45` (lexical `..`), consumed by `execpolicy` and `protocol/src/permissions.rs`. Bypass only if those slices decide a boundary on the logical path while file access follows the physical target — must be confirmed by the execpolicy/permissions slices. *Fix:* ensure security decisions use a fully physically-canonicalized path, or document why logical is correct.
- **`utils-string/src/truncate.rs` is entirely untested** (lines 155-159 note removed tests). Complex middle-truncation byte logic. *Fix:* restore/port truncation tests.

### P3
- **Dead manifest dependencies** across 5 crates (`path-absolutize`, `anyhow`×3, `serde`×2, `tracing`, `rustls-native-certs`). *Fix:* run `cargo-udeps`, prune; supply-chain hygiene.
- **`utils-rustls-provider` is a `Criticality: high` TLS crate with zero tests and an unimplemented native-cert feature** promised by its README/dep. *Fix:* implement or remove the cert-loading promise; add a smoke test for `ensure_rustls_crypto_provider`.
- **Misleading `BlockingLruCache` doc comment** (`utils-cache/src/lib.rs:11-12`). *Fix:* document the current-thread panic. (Pairs with P1.)
- **Stale `BUILD.bazel`** with `codex_*` names (`utils-template/BUILD.bazel`). *Fix:* delete if bazel is unused.
- **`utils-string` exports and the entire `utils-template` API have no in-closure call sites** (template is declared by `protocol` but not referenced in `protocol/src`). *Fix:* confirm intended consumers or mark dormant.

---

## 10. Open questions / uncertainty

1. **(Drives P1 vs P2)** Can a subagent (running under `apps/cli/src/subagent.rs:180`'s `current_thread` runtime) construct a prompt that reaches `load_for_prompt_bytes`/`IMAGE_CACHE`? `run_subagent` (`subagent.rs:384`) does not reference image fns directly; the message-building flow (`protocol/src/models.rs:1290+`) is invoked deeper in core. Needs the CLI-core / subagent slice to confirm.
2. **(Drives P2 severity)** Do `execpolicy` and `protocol/src/permissions.rs` make allow/deny decisions on the *symlink-preserved logical* path returned by `canonicalize_preserving_symlinks` while file access uses the physical target? If yes → symlink bypass (P1). Hand to the execpolicy + protocol/permissions slices.
3. **`utils-template` dependency:** `protocol/Cargo.toml:23` declares `agiworkforce-utils-template` but I found no `use`/reference in `protocol/src`. Is it forward-declared for a planned feature, used via macro, or genuinely dead at the consumer? `cargo-udeps` on `protocol` would settle it.
4. **`image ^0.25.9` decompression-bomb / RUSTSEC status** could not be checked offline. Input is the user's own `-f` file (lower risk), but worth a `cargo audit`.
5. I did **not** run `cargo check`/`cargo test` (brief forbids builds). All "compiles/passes" statements rely on the brief's stated `cargo check --workspace passes`. The dead-dep and template-shape observations are from source/manifest reading, not a build.
