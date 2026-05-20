# Reference CLI Deep Audit

This directory is the durable audit workspace for comparing AGI Workforce with:

- `~/Desktop/reference/src`
- `~/Desktop/reference/codex-cli`
- `~/Desktop/reference/opencode`
- `~/Desktop/reference/gemini-cli`

The goal is exhaustive source coverage for human-authored, non-test, non-vendor code, then subsystem-by-subsystem implementation against the grand CLI parity plan in `tasks/todo.md`.

## Commands

Regenerate ledgers:

```bash
python3 scripts/audit_reference_sources.py
```

Validate JSONL output:

```bash
python3 - <<'PY'
import json
from pathlib import Path

for path in sorted(Path('audit/reference-cli-deep-audit/ledgers').glob('*.jsonl')):
    count = 0
    with path.open() as handle:
        for line in handle:
            if line.strip():
                json.loads(line)
                count += 1
    print(f'{path.name}: {count}')
PY
```

Validate finding lifecycle statuses:

```bash
python3 scripts/audit_reference_sources.py --validate-findings-only
```

Run the repo-wide conflict-marker gate:

```bash
python3 scripts/check-no-conflict-markers.py
```

Regenerate the CLI command parity map:

```bash
python3 scripts/audit_cli_command_parity.py
```

Validate generated command parity artifacts:

```bash
python3 scripts/audit_cli_command_parity.py --check
```

## Files

- `coverage-summary.md`: generated coverage counts and included subsystem totals.
- `ledgers/*.files.jsonl`: one row for every discovered file, with included/excluded status.
- `ledgers/findings.auto.jsonl`: generated triage findings. Empty is expected when no real conflict markers are found.
- `manual-findings.jsonl`: human-recorded findings from deeper line audit.
- `reference-spine-notes.md`: high-signal patterns found in the reference CLIs.
- `command-parity/`: generated static command, keybinding, and parity maps for AGI CLI vs `reference/src`.

Finding rows must include a machine-readable `status` with one of: `open`, `fixed`, `accepted-risk`, `false-positive`.

## Exclusions

The ledger excludes dependency folders, build output, generated files, fixtures, tests, binaries, caches, and known reference vendored/generated paths. Exclusions are explicit in `scripts/audit_reference_sources.py`.

Intentional Rust raw-string conflict-marker fixtures are ignored by both the audit generator and CI gate. Real markers outside those string fixtures are still reported.

## Current Baseline

Last regenerated on 2026-05-19:

- AGI Workforce: 6,599 total files, 5,240 included, 1,359 excluded, 0 automatic follow-ups.
- `reference/src`: 1,902 total files, 1,894 included, 8 excluded, 0 automatic follow-ups.
- `codex-cli`: 4,070 total files, 1,766 included, 2,304 excluded, 0 automatic follow-ups.
- `opencode`: 4,330 total files, 2,629 included, 1,701 excluded, 0 automatic follow-ups.
- `gemini-cli`: 2,723 total files, 1,386 included, 1,337 excluded, 0 automatic follow-ups.
- Command parity: 58 AGI built-in slash commands, 41 AGI CLI subcommands, 16 AGI keybinding rows, 73 `reference/src` commands, 50 static parity rows, 23 static missing rows.

Do not claim parity from coverage counts alone. A file is only line-audited when its ledger row has been advanced beyond `audit_status: not-started` with supporting notes or findings.
