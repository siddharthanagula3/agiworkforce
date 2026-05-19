#!/usr/bin/env python3
"""CI gate: refuse any commit that contains unresolved git merge markers.

Scans the working tree (excluding generated/vendored trees and this script
itself) for the canonical Git conflict markers (`<<<<<<<`, `=======`,
`>>>>>>>`) at the start of a line. Test fixtures that legitimately contain
these tokens inside string literals are skipped by extension allow-list.

Exits 1 on the first match, with the file path and line number printed to
stderr. Designed to be cheap enough to run in every CI workflow.
"""

from __future__ import annotations

import os
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
import re as _re

START_RE = _re.compile(r"^<{7} \S")
SEP_RE = _re.compile(r"^={7}\s*$")
END_RE = _re.compile(r"^>{7} \S")


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


def walk_files(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for name in filenames:
            yield Path(dirpath) / name


def main() -> int:
    failures: list[tuple[Path, int, str]] = []
    for f in walk_files(REPO_ROOT):
        rel = f.relative_to(REPO_ROOT)
        if is_excluded(rel):
            continue
        for lineno, line in scan_file(f):
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
