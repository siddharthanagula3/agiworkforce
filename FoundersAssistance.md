# Founder assistance

Status: Current
Owner: Platform lead
Last updated: 2026-08-09

Things the remediation cannot finish in code, because they need a dashboard, a
credential, a paid account, or a product decision that is not mine to make.

Each entry states what is blocked, what it costs to leave it, and the exact
steps. Nothing here is a suggestion for improvement — every item is a gate that
something else is waiting behind.

---

## 1. Restore `tools/skill-vetting/README.md` on `chore/retire-stale-docs`

**Blocks:** the skill supply-chain security gate, on that branch only.

Commit `7214d0c70` deleted `tools/skill-vetting/README.md`, but
`tools/skill-vetting/pyproject.toml:9` declares `readme = "README.md"`. Hatchling
treats that as a hard requirement, so `uv pip install` fails with
`OSError: Readme file does not exist: README.md`, and `verify.sh` runs under
`set -euo pipefail` — it aborts before scanning anything.
`.github/workflows/repo-operability.yml:188` runs that script, so the vetting
proof and the follow-on `scan-skills-with-vetting.mjs` step are both skipped.

Reproduced end to end by a verification agent. It does **not** reproduce on the
current branch (`fix/codeql-high-severity-batch-1`), where the README is present
and byte-identical to the pre-deletion version — so this is only a problem for
`chore/retire-stale-docs`, and only until that branch merges.

**Do:** on `chore/retire-stale-docs`, `git checkout 7214d0c70^ --
tools/skill-vetting/README.md`. Restore the file rather than dropping `readme =`
from `pyproject.toml` — the pointer is correct, the deletion was the mistake.
That commit's own message states its policy as "kept every markdown a build or a
published artifact consumes" and lists the Cargo and npm cases; hatchling
`readme =` is exactly that case and was missed.

---

## 2. Stop `verify.sh` reusing a cached venv in CI

**Blocks:** nothing today. It makes item 1 invisible, which is worse.

`tools/skill-vetting/verify.sh` reuses `$TMPDIR/skill-vetting-venv` when present.
A warm venv skips the install step entirely, so the gate reports success even
when the README is missing and the package cannot build. A CI runner with a
cached `TMPDIR` would go green while the gate was disarmed.

Found only because the verifying agent deleted the venv and re-ran; the first run
printed "reusing venv" and passed.

**Do:** decide whether CI should pass `--no-cache` (or set a per-run `TMPDIR`)
while local developer runs keep the cache. A security gate that passes because
it skipped its own setup is the failure mode this whole remediation exists to
find.

---

## 3. Vercel Git Comments toggle

**Blocks:** preview deployments.

Carried forward from earlier in this remediation and not yet actioned.

---

## 4. Disable CodeQL default setup

**Blocks:** Rust analysis on pull requests.

The repository has both default and advanced CodeQL setup. While default setup
is enabled, the advanced configuration's Rust analysis does not run on PRs, so
Rust findings are only ever discovered after merge.

**Do:** Settings → Code security → Code scanning → disable **Default setup**, so
`.github/workflows/codeql.yml` becomes the only configuration.

---

## Not blocked, but worth a decision

**`readme = "<file>"` is an invisible coupling.** A documentation sweep can
disarm a security gate through it, and nothing in the guard chain knows the
pointer exists. Either `check-executable-docs.mjs` should learn about hatchling
`readme =` pointers the way it already knows about Cargo `readme` and npm
`files[]`, or the coupling should be removed. Left alone so far because it sits
outside the write set of the item that found it.
