# Phase 6 CLI Baseline — 2026-05-18

## Branch
`claude/phase6-cli-2026-05-18` (worktree: `/Users/siddhartha/Desktop/agiworkforce-phase6-cli`)

## Baseline gate results

### cargo check -p agiworkforce-cli
PASS — `Finished dev profile in 2m 42s`

### cargo test -p agiworkforce-cli --lib
1331 pass / 6 FAIL / 0 ignored
The 6 failures are PRE-EXISTING, unrelated to this reorg — all in model-catalog
data for `deepseek-reasoner`/`deepseek-chat`:
  - output::tests::test_model_pricing_deepseek_reasoner
  - provider::tests::test_catalog_has_new_models
  - provider::tests::test_format_model_detail_no_tools_with_vision
  - provider::tests::test_reasoning_models_flagged
  - provider::tests::test_supports_reasoning_true
  - provider::tests::test_supports_tool_use_true

### cargo clippy -p agiworkforce-cli --lib -- -D warnings -D unsafe-code
PASS — `Finished dev profile in 33.69s`

## File inventory

- Total .rs files: 289
- Top-level .rs (flat): 47 files
- Subdirectories already present: a2a, agent, lsp, mcp, models, output_styles, policy, repl, routing, runtime, safety, sdk_io, tools, tui (14 dirs)

## Pre-existing test failures

These 6 tests fail on `main` branch HEAD — not introduced by this phase:
- Cause: `deepseek-chat` / `deepseek-reasoner` missing from model catalog data or pricing table
- Action: document only, do not fix in this phase (separate concern from reorg)
