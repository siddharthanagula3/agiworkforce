#!/usr/bin/env python3
"""Behaviour tests for the conflict-marker gate.

Run: python3 scripts/check-no-conflict-markers.test.py

Markers are assembled from repeated characters so this file never contains a
literal marker at the start of a line — otherwise the gate it tests would
flag it once the file is tracked.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

GATE = Path(__file__).resolve().parent / "check-no-conflict-markers.py"

START = "<" * 7 + " HEAD"
SEP = "=" * 7
END = ">" * 7 + " feature-branch"
CONFLICTED = f"{START}\nours\n{SEP}\ntheirs\n{END}\n"


class ConflictMarkerGateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = Path(tempfile.mkdtemp(prefix="conflict-gate-"))
        self.addCleanup(shutil.rmtree, self.repo, ignore_errors=True)
        (self.repo / "scripts").mkdir()
        shutil.copy(GATE, self.repo / "scripts" / GATE.name)
        self.git("init", "-q")
        self.git("config", "user.email", "gate@example.test")
        self.git("config", "user.name", "gate")
        self.write("src/clean.ts", "export const ok = 1;\n")
        self.git("add", "-A")
        self.git("commit", "-qm", "base")

    def git(self, *args: str) -> None:
        subprocess.run(["git", *args], cwd=self.repo, check=True,
                       capture_output=True)

    def write(self, rel: str, body: str) -> Path:
        path = self.repo / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        return path

    def run_gate(self) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(self.repo / "scripts" / GATE.name)],
            cwd=self.repo, capture_output=True, text=True,
        )

    def test_clean_tracked_tree_passes(self) -> None:
        self.assertEqual(self.run_gate().returncode, 0)

    def test_untracked_artifact_with_markers_is_ignored(self) -> None:
        self.write("tmp/uiref/agiw-full.tar", CONFLICTED)
        self.write("apps/extension-vscode/.vscode-test/LICENSES.html", CONFLICTED)
        result = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("agiw-full.tar", result.stderr)

    def test_ignored_artifact_with_markers_is_ignored(self) -> None:
        self.write(".gitignore", "tmp/\n")
        self.git("add", ".gitignore")
        self.git("commit", "-qm", "ignore tmp")
        self.write("tmp/harness.txt", CONFLICTED)
        self.assertEqual(self.run_gate().returncode, 0)

    def test_tracked_file_with_markers_fails(self) -> None:
        self.write("src/broken.ts", CONFLICTED)
        self.git("add", "-A")
        self.git("commit", "-qm", "oops")
        result = self.run_gate()
        self.assertEqual(result.returncode, 1)
        self.assertIn("src/broken.ts", result.stderr)
        self.assertIn("3 unresolved marker(s) found", result.stderr)

    def test_staged_but_uncommitted_file_with_markers_fails(self) -> None:
        self.write("src/staged.ts", CONFLICTED)
        self.git("add", "src/staged.ts")
        result = self.run_gate()
        self.assertEqual(result.returncode, 1)
        self.assertIn("src/staged.ts", result.stderr)

    def test_tracked_file_deleted_from_worktree_does_not_crash(self) -> None:
        (self.repo / "src" / "clean.ts").unlink()
        result = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_excluded_tracked_dir_is_skipped(self) -> None:
        self.write("_archive/old.ts", CONFLICTED)
        self.git("add", "-Af")
        self.git("commit", "-qm", "archive")
        self.assertEqual(self.run_gate().returncode, 0)

    def test_section_divider_is_not_a_marker(self) -> None:
        self.write("src/header.ts", "// " + "=" * 40 + "\nconst a = 1;\n")
        self.git("add", "-A")
        self.git("commit", "-qm", "divider")
        self.assertEqual(self.run_gate().returncode, 0)

    def test_missing_git_fails_closed(self) -> None:
        empty = Path(tempfile.mkdtemp(prefix="conflict-gate-nogit-"))
        self.addCleanup(shutil.rmtree, empty, ignore_errors=True)
        (empty / "scripts").mkdir()
        shutil.copy(GATE, empty / "scripts" / GATE.name)
        result = subprocess.run(
            [sys.executable, str(empty / "scripts" / GATE.name)],
            cwd=empty, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("unable to enumerate tracked files", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
