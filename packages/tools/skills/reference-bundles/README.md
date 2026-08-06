# Skill Reference Bundles

Status: Current
Owner role: Tooling/security owner
Last updated: 2026-08-05
Kind: reference material

## Purpose

Upstream Anthropic Agent Skills packages kept as **format references** for the
loader in `../src`. They show the real bundle shape — `scripts/`, `evals/`,
`assets/`, `eval-viewer/` — that `loadSkillsFromDir` and
`apps/cli/src/skills.rs` are written against.

## These Are Not Loadable Skills

None of these directories contains a `SKILL.md`. It was never vendored, so no
loader can discover them and no surface ships them. They previously sat in
`apps/desktop/src/data/skills/`, where the path implied the desktop app bundled
working skills; it did not, and `apps/desktop/src/data/` is for Zustand stores,
Zod schemas, and query helpers rather than skill packages.

A `SKILL.md` was deliberately **not** authored for them. The bundled files alone
do not establish what instructions the upstream skills actually carried, and a
written-from-scratch `SKILL.md` would claim capabilities this repo cannot
substantiate.

This is enforced, not just asserted: `scripts/verify-skills-lock.mjs` lists this
directory under `referenceTrees` in `skills-lock.json` and fails if a `SKILL.md`
appears anywhere beneath it. To make one of these a real skill, move the package
under a locked skill root (`.agents/skills/`), author a truthful `SKILL.md`, and
record its provenance in `skills-lock.json`.

## What The Bundles Contain

- `math-olympiad/` — `scripts/check_latex.sh` (probes for `pdflatex`/`xelatex`),
  `scripts/compile_pdf.sh` (wraps a LaTeX proof body in an `amsthm` preamble and
  compiles it), and `evals/trigger_eval.json` (trigger/no-trigger query set).
  Both scripts reference a `SKILL.md` that is absent.
- `skill-creator/` — Python tooling for authoring and evaluating skills:
  description eval loop (`scripts/run_eval.py`, `scripts/run_loop.py`,
  `scripts/improve_description.py`), packaging and validation
  (`scripts/package_skill.py`, `scripts/quick_validate.py`), benchmark
  aggregation and reporting, and a self-contained eval review viewer. The eval
  loop scripts require the `anthropic` Python package and an external agent CLI;
  neither is part of this repo's dependency tree, so they are not runnable
  as-is.

## Rules

- Do not import from this directory in application code.
- Do not add a `SKILL.md` here.
- Do not treat the Python or shell files as maintained first-party source.
