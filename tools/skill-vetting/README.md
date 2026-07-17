# skill-vetting (SkillSpector)

Status: Adopted (Phase-0 machinery, INC-0.5)
Owner: Platform + security
Kind: service
Criticality: high
Donor: **SkillSpector** by NVIDIA — Apache-2.0

## Purpose

Pre-install security scanner for agent **skills / plugins / MCP servers**. This is
the trust differentiator for a privacy-first marketplace: every skill/plugin/MCP
is scanned _before_ install and again at install-time (rug-pull diff), and a
`DO_NOT_INSTALL` verdict blocks the install.

It runs offline analyzers (regex + Python AST + YARA + OSV CVE lookup) plus an
**optional** LLM pass, producing a 0–100 risk score →
`SAFE` / `CAUTION` / `DO_NOT_INSTALL` (SARIF/JSON output). It detects prompt
injection (incl. hidden/zero-width/base64), data exfiltration, dangerous
execution, credential access, obfuscation, declared-vs-actual permission diff,
agent-snooping, supply-chain (typosquatting/unpinned deps), MCP tool-poisoning,
and rug-pull (permissions added after approval).

## Attribution

This directory is an **adoption** of NVIDIA's SkillSpector (Apache-2.0). The
upstream `LICENSE` and `THIRD_PARTY_NOTICES.md` are preserved verbatim. Source:
<https://github.com/NVIDIA/skillspector>. See the repo-root `THIRD_PARTY_LICENSES.md`
and `docs/strategy/PORTING-TRACKER.md` for the attribution record. Local changes:
trimmed to the runnable package (`src/skillspector`) + two sample fixtures +
this README; `model_registry.yaml` rewritten to AGI catalog model IDs (below).

## Model IDs

The vetting **gate runs with `--no-llm`**, so no model is required for the
blocking path. The optional LLM analyzer reads `model_registry.yaml`, which has
been rewritten to carry only AGI catalog model IDs — the single source of truth
is `packages/contracts/types/src/models.json`. Do not hand-add model IDs here; mirror
`models.json`.

## Run the gate

Requires Python 3.12 and [`uv`](https://docs.astral.sh/uv/).

```bash
# from services/skill-vetting/
./verify.sh          # creates a venv, installs, scans both samples, asserts verdicts
```

`verify.sh` is the verification for INC-0.5: it asserts the malicious sample
resolves to `DO_NOT_INSTALL` and the safe sample does not. It is intentionally
**not** wired into `check:llm-operability` (it provisions a Python venv and is
slow); run it directly or in a dedicated CI job.

Manual scan:

```bash
skillspector scan <path-to-skill> --no-llm --format json --output report.json
```
