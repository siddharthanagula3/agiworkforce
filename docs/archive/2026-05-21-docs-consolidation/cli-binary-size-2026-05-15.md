# CLI Binary Size Report — 2026-05-15

## Summary

| Metric                                         | Value                    |
| ---------------------------------------------- | ------------------------ |
| Installed binary (`~/.cargo/bin/agiworkforce`) | 6.0 MB (arm64, stripped) |
| Release build (`target/release/agiworkforce`)  | 10.1 MB (.text = 3.3 MB) |
| Prior wave-2 baseline                          | 5.7 MB installed         |
| Growth since wave-2                            | +0.3 MB / **+5.3%**      |

The earlier wave-1 report cited 5.7 MB → 6.20 MB (+14%). The current installed binary is 6.0 MB, so growth since wave-2 is more moderate (+5.3%). The 10.1 MB figure for the release build includes unstripped symbols; `strip` or `cargo-strip` brings it to ~6 MB for distribution.

## Top 30 .text Contributors (cargo bloat --release --crates -n 30)

Run: `cargo bloat --release -p agiworkforce-cli --crates -n 30`

```
 File  .text     Size Crate
11.2%  34.6%   1.1MiB agiworkforce_cli
 5.1%  15.8% 532.5KiB std
 3.1%   9.6% 321.8KiB [Unknown]
 2.3%   7.1% 239.9KiB yaml_rust
 1.4%   4.2% 141.3KiB regex_automata
 1.2%   3.7% 125.9KiB reqwest
 0.8%   2.4%  79.6KiB clap_builder
 0.7%   2.0%  68.2KiB regex_syntax
 0.6%   1.7%  58.2KiB tokio
 0.5%   1.6%  54.4KiB aho_corasick
 0.5%   1.6%  53.4KiB toml_edit
 0.4%   1.3%  42.7KiB h2
 0.3%   1.1%  36.3KiB serde_json
 0.3%   1.0%  35.0KiB axum
 0.3%   1.0%  34.3KiB pulldown_cmark
 0.3%   0.9%  31.4KiB http
 0.3%   0.9%  31.3KiB rustyline
 0.3%   0.9%  29.5KiB chrono
 0.3%   0.8%  26.5KiB hyper
 0.2%   0.8%  25.5KiB hyper_util
 0.2%   0.7%  22.6KiB encoding_rs
 0.2%   0.6%  21.2KiB indicatif
 0.2%   0.6%  20.9KiB cron
 0.2%   0.6%  20.8KiB syntect
 0.2%   0.6%  20.5KiB url
 0.2%   0.6%  19.5KiB clap_complete
 0.2%   0.6%  19.3KiB onig_sys
 0.2%   0.6%  19.2KiB ratatui
 0.1%   0.4%  14.5KiB toml
 0.1%   0.4%  13.9KiB idna
          ...  286.5KiB remaining 134 crates
```

Total .text: 3.3 MiB. File size: 10.1 MiB (unstripped release).

## Notable findings

**`yaml_rust` at 239.9 KiB (#4)** is the biggest surprise. It is pulled in transitively by `syntect` (syntax highlighting) which is used for the TUI code-block renderer. `syntect` embeds full TextMate grammar packs which also drive the large [Unknown] segment. Consider lazy-loading or switching to `tree-sitter-highlight` if binary size becomes a hard constraint.

**`regex_automata` + `regex_syntax` + `aho_corasick` = ~355 KiB** from regex infrastructure — expected given grep/search features.

**`reqwest` at 125.9 KiB** is reasonable for a full HTTP client with TLS; no obvious savings here.

**`agiworkforce_cli` itself at 1.1 MiB** is healthy — the CLI's own code is 34.6% of .text, leaving 65.4% to dependencies.

## Recommendations

1. **`syntect` / `yaml_rust`**: Largest non-std third-party footprint. Evaluate `two-face` (already in the tree as a `syntect` companion) for grammar pruning, or switch to `bat`'s approach of shipping a trimmed asset set.
2. **LTO**: Ensure `Cargo.toml` `[profile.release]` has `lto = "thin"` (reduces monomorphization duplication across crates).
3. **`codegen-units = 1`**: Add to `[profile.release]` for better dead-code elimination at the cost of build time.
4. **Strip in CI**: Add `strip = "symbols"` to `[profile.release]` to get distribution binaries closer to 6 MB automatically.

## Workflow

To reproduce:

```bash
cargo install cargo-bloat            # one-time
cargo bloat --release -p agiworkforce-cli --crates -n 30
```

To drill into a specific crate's functions:

```bash
cargo bloat --release -p agiworkforce-cli --filter yaml_rust -n 20
```
