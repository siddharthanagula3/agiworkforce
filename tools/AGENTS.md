# Tools Agent Rules

Status: Current
Owner: Tooling/security lead
Last updated: 2026-08-05

Read root `AGENTS.md`, then this file, then the tool's own README closest to
the code.

## Scope

`tools/` holds developer-facing, non-deployable tooling — CLIs and scanners
used during development or CI, not services with a runtime trust boundary.
It is distinct from `services/` (deployable server boundaries) and
`scripts/` (repo-operability automation).

## Lane Contract

- Primary lanes: `tooling-security` and `repo-operability`.
- Owned write path: `tools/**`.
- Vendored code (e.g. `tools/skill-vetting/src/skillspector/**`) is
  read-mostly: it is a wholesale-adopted upstream package, not first-party
  source under active feature development.

## High-Risk Areas

- `tools/skill-vetting` is a vendored supply-chain scanner (NVIDIA
  SkillSpector fork, Apache-2.0). It is the trust differentiator for
  skill/plugin/MCP pre-install vetting.
- What the scanner actually gates today: the `skill-supply-chain` job in
  `.github/workflows/repo-operability.yml` runs `verify.sh` and then
  `scripts/scan-skills-with-vetting.mjs`, which fails the build on a
  `DO_NOT_INSTALL` verdict for any skill package vendored under a
  `skills-lock.json` root. It does **not** gate runtime installs from the CLI,
  desktop, or web surfaces — no product code path invokes the scanner.
- `README.md`, `THIRD_PARTY_NOTICES.md`, and both `samples/*/SKILL.md`
  fixtures were deleted by the repo-wide markdown purge in `906fe5cda`, which
  left the package uninstallable (`pyproject.toml` requires `README.md`) and
  `verify.sh` unable to run at all between `906fe5cda` and 2026-08-05. They
  were restored verbatim from `906fe5cda^`. Deleting them again silently
  disables the gate.
- Do not make behavior edits to vendored scanner code without an upstream
  diff review; changes must be traceable to an upstream commit or an
  explicitly documented local patch.
- Never weaken vetting rules, detection signatures, or the
  malicious-sample→`DO_NOT_INSTALL` guarantee.
- Preserve `LICENSE` and `THIRD_PARTY_NOTICES.md` verbatim.

## Verification

- `tools/skill-vetting/verify.sh` — proves malicious→`DO_NOT_INSTALL`,
  safe→`SAFE`. Requires `uv` and network for the first dependency install.
- `node scripts/scan-skills-with-vetting.mjs` — applies the same scanner to
  in-repo skill packages; reuses the venv `verify.sh` provisions, or
  `SKILLSPECTOR_BIN`.
- `pnpm check:repo-organization` — `tools` must stay a guarded, allowed root.
- `pnpm check:agent-context` — keeps this file's rules mirrored where
  required.
