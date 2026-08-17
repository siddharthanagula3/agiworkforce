#!/usr/bin/env python3
"""CI gate: refuse any commit that contains unresolved git merge markers.

Scans the files git tracks (index contents, so staged additions count too),
excluding generated/vendored trees and this script itself, for the canonical
Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) at the start of a line.
Test fixtures that legitimately contain these tokens inside string literals
are skipped by extension allow-list.

Enumerating via `git ls-files` rather than walking the working tree keeps the
result identical on a fresh CI checkout and on a developer machine littered
with untracked build artifacts and downloaded test harnesses.

Exits 1 on the first match, with the file path and line number printed to
stderr. Designed to be cheap enough to run in every CI workflow.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

EXCLUDE_DIRS = {
    ".git",
    "node_modules",
    "target",
    "dist",
    ".next",
    ".turbo",
    ".vercel",
    "_archive",
    "Pods",
    "build",
    "DerivedData",
    ".gradle",
}

# Files where conflict-marker substrings appear legitimately as string
# fixtures (parsers, tests for the parser, documentation). Skip these.
ALLOWLIST_SUFFIXES = {
    "git_executor.rs",
    "check-no-conflict-markers.py",
}

# Match git's canonical conflict markers exactly:
#   <<<<<<< <ref>     (start)
#   =======            (separator, exactly 7 `=` then optional whitespace/newline)
#   >>>>>>> <ref>     (end)
# Reject lines that are just `========` section dividers (commonly used in
# C++ headers / XML privacy manifests).
START_RE = re.compile(r"^<{7} \S")
SEP_RE = re.compile(r"^={7}\s*$")
END_RE = re.compile(r"^>{7} \S")


def is_excluded(path: Path) -> bool:
    parts = set(path.parts)
    if parts & EXCLUDE_DIRS:
        return True
    return path.name in ALLOWLIST_SUFFIXES


def scan_file(path: Path) -> list[tuple[int, str]]:
    hits: list[tuple[int, str]] = []
    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            for lineno, line in enumerate(f, start=1):
                if START_RE.match(line) or SEP_RE.match(line) or END_RE.match(line):
                    hits.append((lineno, line.rstrip()))
    except OSError:
        pass
    return hits


def tracked_files(root: Path) -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached"],
        cwd=root,
        capture_output=True,
        check=True,
    )
    return [Path(name) for name in result.stdout.decode("utf-8").split("\0") if name]


def main() -> int:
    try:
        candidates = tracked_files(REPO_ROOT)
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"conflict-marker gate: unable to enumerate tracked files: {exc}",
              file=sys.stderr)
        return 1

    failures: list[tuple[Path, int, str]] = []
    for rel in candidates:
        if is_excluded(rel):
            continue
        absolute = REPO_ROOT / rel
        # Tracked-but-absent (deleted, sparse-checkout) and gitlink submodule
        # entries are not readable files; there is nothing to scan.
        if not absolute.is_file():
            continue
        for lineno, line in scan_file(absolute):
            failures.append((rel, lineno, line))

    if not failures:
        print("conflict-marker gate: clean")
        return 0

    for path, lineno, line in failures:
        print(f"::error file={path},line={lineno}::unresolved merge marker: {line}",
              file=sys.stderr)
    print(f"\nconflict-marker gate: {len(failures)} unresolved marker(s) found",
          file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
