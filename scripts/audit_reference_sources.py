#!/usr/bin/env python3
"""Generate the exhaustive source-audit ledgers for AGI + reference CLIs.

The script records every discovered file as either included for line audit or
explicitly excluded with a reason. It does not inspect secrets or print file
contents; lightweight content scanning is limited to conflict-marker detection
for included text files.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "audit" / "reference-cli-deep-audit"
CONFLICT_MARKER_RE = re.compile(r"^(<<<<<<< .+|=======$|>>>>>>> .+)")
RUST_RAW_START_RE = re.compile(r'(?:^|[^A-Za-z0-9_])b?r(?P<hashes>#{0,255})"')
FINDING_STATUS_VALUES = frozenset({"open", "fixed", "accepted-risk", "false-positive"})


@dataclass(frozen=True)
class RepoSpec:
    name: str
    root: Path
    extra_excluded_dirs: tuple[str, ...] = ()
    extra_excluded_files: tuple[str, ...] = ()


REPOS: tuple[RepoSpec, ...] = (
    RepoSpec(
        "agiworkforce",
        REPO_ROOT,
        extra_excluded_dirs=(
            "ios/Pods",
            "apps/desktop/dist-web",
            "apps/web/public/chat",
            "apps/web/public/downloads",
            "apps/desktop/apps/web/public/downloads",
            "apps/extension-vscode/out",
            ".minimax",
            ".playwright-mcp",
            ".superpowers",
            ".tmp_capture",
            ".expo",
            ".vercel",
            "_archive",
            "audit/reports",
            "downloads",
            "reports",
            ".code-review-graph",
        ),
    ),
    RepoSpec(
        "src",
        Path.home() / "Desktop/reference/src",
        extra_excluded_dirs=(
            "types/generated",
            "native-ts/color-diff",
            "native-ts/file-index",
            "native-ts/yoga-layout",
        ),
    ),
    RepoSpec(
        "codex-cli",
        Path.home() / "Desktop/reference/codex-cli",
        extra_excluded_dirs=(
            "codex-rs/app-server-protocol/schema",
            "codex-rs/codex-backend-openapi-models",
            "codex-rs/hooks/schema/generated",
            "sdk/python/src/codex_app_server/generated",
            "codex-rs/vendor",
            "third_party",
            "patches",
            "codex-rs/tui/frames",
            "examples",
            "samples",
            "thread-manager-sample",
            "codex-rs/app-server-test-client",
            "codex-rs/cloud-tasks-mock-client",
            "codex-rs/test-binary-support",
            "tools/argument-comment-lint/ui",
        ),
        extra_excluded_files=(
            "codex-cli/bin/rg",
            "tools/argument-comment-lint/argument-comment-lint",
        ),
    ),
    RepoSpec(
        "opencode",
        Path.home() / "Desktop/reference/opencode",
        extra_excluded_dirs=(
            "packages/ui/src/assets/icons/file-types",
            "packages/sdk/js/src/gen",
            "packages/sdk/js/src/v2/gen",
        ),
        extra_excluded_files=(
            "packages/sdk/openapi.json",
            "packages/storybook/debug-storybook.log",
            "packages/app/happydom.ts",
            "packages/enterprise/test-debug.ts",
            "sdks/vscode/.vscode-test.mjs",
        ),
    ),
    RepoSpec(
        "gemini-cli",
        Path.home() / "Desktop/reference/gemini-cli",
        extra_excluded_dirs=(
            "integration-tests",
            "perf-tests",
            "memory-tests",
            "third_party",
            "packages/core/vendor",
            "packages/core/src/generated",
            "packages/cli/src/generated",
            ".husky/_",
            "docs/assets",
            "packages/vscode-ide-companion/assets",
            "packages/sdk/test-data",
            "packages/core/src/services/test-data",
            "packages/test-utils",
            "evals",
        ),
        extra_excluded_files=("package-lock.json",),
    ),
)


COMMON_EXCLUDED_DIR_NAMES = {
    ".git": "git",
    "node_modules": "node-modules",
    "target": "rust-target",
    "dist": "dist",
    "build": "build-artifact",
    ".next": "next-build",
    "coverage": "coverage",
    ".cache": "cache",
    "__tests__": "test-artifact",
    "tests": "test-artifact",
    "test": "test-artifact",
    "fixtures": "fixture",
    "fixture": "fixture",
    "e2e": "test-artifact",
    "__snapshots__": "test-artifact",
    "__mocks__": "test-artifact",
    "test-results": "test-artifact",
}

PRUNE_DIR_NAMES = {
    ".git": "git",
    "node_modules": "node-modules",
    "target": "rust-target",
    "dist": "dist",
    "build": "build-artifact",
    ".next": "next-build",
    "coverage": "coverage",
    ".cache": "cache",
    "Pods": "ios-pods",
}

DIR_REASON_BY_PATTERN = {
    "vendor": "vendor",
    "third_party": "vendor",
    "generated": "generated",
    "ios/Pods": "ios-pods",
}

BINARY_EXTS = {
    ".aac",
    ".bmp",
    ".db",
    ".dll",
    ".dmg",
    ".gif",
    ".ico",
    ".ipynb",
    ".jpeg",
    ".jpg",
    ".mov",
    ".mp4",
    ".pdb",
    ".pid",
    ".png",
    ".rlib",
    ".tmp",
    ".ttf",
    ".vsix",
    ".wasm",
    ".wav",
    ".webm",
    ".webp",
    ".woff",
    ".woff2",
    ".zip",
}

GENERATED_OR_ARTIFACT_PATTERNS = (
    "*.lock",
    "*-lock.yaml",
    "*.snap",
    "*.tsbuildinfo",
    "*.map",
    "*.sha256",
    "*.test.*",
    "*.spec.*",
    "*_test.*",
    "*_tests.*",
    "tests.rs",
    "test_support.rs",
    "test_*.py",
    "snapshot.json",
    "sst-env.d.ts",
)

LANG_BY_EXT = {
    ".rs": "rust",
    ".ts": "ts",
    ".tsx": "ts",
    ".js": "js",
    ".jsx": "js",
    ".py": "py",
    ".sh": "shell",
    ".ps1": "shell",
    ".json": "json",
    ".jsonc": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".md": "md",
    ".mdx": "md",
    ".sql": "sql",
    ".swift": "swift",
    ".c": "c",
    ".h": "c",
    ".hpp": "c",
    ".css": "css",
    ".scss": "css",
    ".svg": "svg",
}


def rel_posix(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def path_parts(rel: str) -> tuple[str, ...]:
    return tuple(part for part in rel.split("/") if part)


def matches_dir_prefix(rel: str, prefixes: Iterable[str]) -> str | None:
    rel_parts = path_parts(rel)
    for prefix in prefixes:
        prefix_parts = path_parts(prefix)
        if rel_parts[: len(prefix_parts)] == prefix_parts:
            return prefix
    return None


def git_state(root: Path) -> str:
    try:
        sha = subprocess.check_output(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except Exception:
        return "local-non-git-or-unavailable"
    try:
        dirty = subprocess.check_output(
            ["git", "-C", str(root), "status", "--porcelain"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except Exception:
        dirty = ""
    return f"{sha}{'-dirty' if dirty.strip() else ''}"


def language_for(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if Path(path).name in {"Dockerfile", "Makefile", "justfile"}:
        return "other"
    return LANG_BY_EXT.get(suffix, "other")


def file_kind_for(path: str, included: bool, exclusion_reason: str | None) -> str:
    if not included:
        if exclusion_reason in {"generated", "vendor", "dependency"}:
            return "generated" if exclusion_reason == "generated" else "vendored"
        if exclusion_reason in {"binary", "build-artifact", "dist", "next-build", "cache"}:
            return "binary" if exclusion_reason == "binary" else "build"
        if exclusion_reason in {"test-artifact", "fixture"}:
            return "test"
        return exclusion_reason or "other"

    name = Path(path).name
    suffix = Path(path).suffix.lower()
    if suffix in {".md", ".mdx", ".txt"}:
        return "docs"
    if suffix in {".json", ".yaml", ".yml", ".toml", ".jsonc"} or name.startswith("."):
        return "config"
    if suffix in {".sh", ".ps1", ".py"} or name in {"Makefile", "justfile"}:
        return "script"
    if suffix in {".sql", ".graphql", ".proto"}:
        return "schema"
    if "prompt" in path.lower() or ".agents/" in path or ".claude/" in path or ".codex/" in path:
        return "prompt"
    return "source"


def subsystems_for(repo: str, path: str) -> list[str]:
    tags: set[str] = set()
    lower = path.lower()
    parts = path_parts(path)

    if path.startswith("apps/cli/") or path.startswith("codex-rs/cli/") or "packages/cli/" in path:
        tags.add("cli-entrypoint")
    if "/tui/" in lower or "/ui/" in lower or lower.endswith(".tsx"):
        tags.add("tui-ui")
    if path.startswith("apps/desktop/") or "desktop" in parts:
        tags.add("desktop-ui")
    if path.startswith("apps/web/") or "packages/web/" in path:
        tags.add("web-ui")
    if path.startswith("apps/mobile/"):
        tags.add("mobile-ui")
    if "extension" in lower or "vscode" in lower or "chrome" in lower:
        tags.add("extension-ui")
    if any(word in lower for word in ("provider", "model", "llm", "geminichat", "client")):
        tags.add("provider-runtime")
    if "normalize" in lower or "transform" in lower:
        tags.add("llm-normalization")
    if any(word in lower for word in ("agent", "session", "processor", "turn", "thread")):
        tags.add("agent-loop")
    if any(word in lower for word in ("tool", "bash", "shell", "exec", "command")):
        tags.add("tool-execution")
    if any(word in lower for word in ("sandbox", "execpolicy", "policy")):
        tags.add("sandboxing")
    if any(word in lower for word in ("permission", "approval", "canusetool")):
        tags.add("approval")
    if any(word in lower for word in ("auth", "login", "credential")):
        tags.add("auth")
    if "oauth" in lower:
        tags.add("oauth")
    if "mcp" in lower:
        tags.add("mcp")
    if any(word in lower for word in ("plugin", "extension-manager", "marketplace")):
        tags.add("plugin-system")
    if any(word in lower for word in ("secret", ".env", "keyring", "token")):
        tags.add("secrets")
    if any(word in lower for word in ("network", "http", "web_fetch", "fetch", "websocket", "sse")):
        tags.add("networking")
    if any(word in lower for word in ("storage", "store", "sqlite", "db", "session", "memory")):
        tags.add("storage")
    if any(word in lower for word in ("sync", "realtime", "dispatch")):
        tags.add("sync")
    if any(word in lower for word in ("billing", "stripe", "subscription")):
        tags.add("billing")
    if any(word in lower for word in ("telemetry", "analytics", "sentry")):
        tags.add("telemetry")
    if any(word in lower for word in ("config", "settings", "toml", "yaml", ".json")):
        tags.add("config")
    if any(word in lower for word in ("schema", "types", "protocol")):
        tags.add("schema-types")
    if any(word in lower for word in ("docker", "infra", "deploy", ".github")):
        tags.add("infra-deploy")
    if any(word in lower for word in ("release", "install", "package", "brew", "homebrew")):
        tags.add("build-release")
    if Path(path).suffix.lower() in {".md", ".mdx", ".txt"} or path.startswith("docs/"):
        tags.add("docs-spec")
    if not tags:
        tags.add("unknown")
    return sorted(tags)


def risk_tags_for(path: str, subsystems: Iterable[str]) -> list[str]:
    lower = path.lower()
    systems = set(subsystems)
    risks: set[str] = set()
    if any(s in systems for s in ("tool-execution", "agent-loop", "sandboxing")):
        risks.add("prompt-injection-host-exec")
        risks.add("llm-output-validation")
    if any(s in systems for s in ("mcp", "oauth", "plugin-system")):
        risks.add("mcp-oauth-plugin-trust-failure")
    if "approval" in systems:
        risks.add("approval-deception")
    if any(word in lower for word in ("template", "prompt", "memory", "skill", "xml")):
        risks.add("template-object-traversal")
    if any(word in lower for word in ("catalog", "schema", "protocol", "sdk", "app_server")):
        risks.add("hallucinated-contracts")
    if any(word in lower for word in ("config", "docs", "readme", "architecture")):
        risks.add("semantic-drift")
    if any(word in lower for word in ("sandbox", "safe", "dangerous", "permission", "policy")):
        risks.add("security-false-positives")
    if any(word in lower for word in ("release", "install", "deploy", "workflow")):
        risks.add("operational-fragility")
    return sorted(risks)


def exclusion_for(repo: RepoSpec, rel: str, path: Path) -> str | None:
    parts = path_parts(rel)
    for idx, part in enumerate(parts):
        if part in COMMON_EXCLUDED_DIR_NAMES:
            return COMMON_EXCLUDED_DIR_NAMES[part]
        prefix = "/".join(parts[: idx + 1])
        if prefix in DIR_REASON_BY_PATTERN:
            return DIR_REASON_BY_PATTERN[prefix]

    extra_dir = matches_dir_prefix(rel, repo.extra_excluded_dirs)
    if extra_dir:
        if "generated" in extra_dir:
            return "generated"
        if "vendor" in extra_dir or "third_party" in extra_dir or "patches" in extra_dir:
            return "vendor"
        if "Pods" in extra_dir:
            return "ios-pods"
        if any(word in extra_dir for word in ("dist", "public/chat", "downloads", "out")):
            return "build-artifact"
        if any(word in extra_dir for word in ("test", "frames", "evals")):
            return "test-artifact"
        if any(word in extra_dir for word in ("assets", "icons")):
            return "binary"
        return "generated"

    if rel in repo.extra_excluded_files:
        return "binary" if path.suffix.lower() in BINARY_EXTS else "generated"

    name = path.name
    suffix = path.suffix.lower()
    if suffix in BINARY_EXTS:
        return "binary"
    if name == ".DS_Store":
        return "cache"
    if any(fnmatch.fnmatch(name, pattern) for pattern in GENERATED_OR_ARTIFACT_PATTERNS):
        if "test" in name or "spec" in name or name.endswith(".snap"):
            return "test-artifact"
        if "lock" in name:
            return "generated"
        return "generated"
    return None


def iter_files(repo: RepoSpec) -> Iterable[Path]:
    extra_prune = set(repo.extra_excluded_dirs)
    for dirpath, dirnames, filenames in os.walk(repo.root):
        current = Path(dirpath)
        kept_dirs = []
        for dirname in sorted(dirnames):
            child = current / dirname
            rel = rel_posix(child, repo.root)
            if dirname in PRUNE_DIR_NAMES:
                continue
            if rel in extra_prune and (
                any(
                    token in rel
                    for token in (
                        "node_modules",
                        "target",
                        "dist",
                        "build",
                        ".next",
                        "coverage",
                        ".cache",
                        "Pods",
                    )
                )
                or rel
                in {
                    "apps/desktop/dist-web",
                    "apps/web/public/chat",
                    "apps/web/public/downloads",
                    "apps/desktop/apps/web/public/downloads",
                    "apps/extension-vscode/out",
                }
            ):
                continue
            kept_dirs.append(dirname)
        dirnames[:] = kept_dirs
        for filename in sorted(filenames):
            yield Path(dirpath) / filename


def text_for_scan(path: Path) -> str | None:
    if path.suffix.lower() in BINARY_EXTS:
        return None
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if b"\0" in data[:4096]:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return data.decode("utf-8", errors="replace")
        except Exception:
            return None


def conflict_marker_lines(path: Path, text: str) -> Iterable[tuple[int, str]]:
    """Yield real conflict-marker candidates, ignoring Rust raw-string fixtures."""

    in_rust_raw = False
    rust_raw_end = ""

    for lineno, line in enumerate(text.splitlines(), start=1):
        normalized = line.rstrip("\r")

        if CONFLICT_MARKER_RE.match(normalized) and not in_rust_raw:
            yield lineno, normalized

        if path.suffix == ".rs":
            if in_rust_raw:
                if rust_raw_end in normalized:
                    in_rust_raw = False
                    rust_raw_end = ""
            else:
                match = RUST_RAW_START_RE.search(normalized)
                if match:
                    rust_raw_end = '"' + match.group("hashes")
                    after_start = normalized[match.end() :]
                    if rust_raw_end not in after_start:
                        in_rust_raw = True


def build_ledger(repo: RepoSpec) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    findings: list[dict] = []
    commit = git_state(repo.root)
    finding_index = 1

    for path in iter_files(repo):
        rel = rel_posix(path, repo.root)
        exclusion_reason = exclusion_for(repo, rel, path)
        included = exclusion_reason is None
        subsystems = subsystems_for(repo.name, rel)
        risk_tags = risk_tags_for(rel, subsystems) if included else []
        row = {
            "schema_version": "1.0",
            "repo": repo.name,
            "repo_path": str(repo.root),
            "commit": commit,
            "path": rel,
            "file_kind": file_kind_for(rel, included, exclusion_reason),
            "language": language_for(rel),
            "included": included,
            "exclusion_reason": exclusion_reason,
            "subsystems": subsystems if included else [],
            "risk_tags": risk_tags,
            "audit_status": "not-started" if included else "excluded",
            "auditor": "audit_reference_sources.py",
            "audit_depth": "max-human-authored",
            "evidence": {
                "read_full_file": False,
                "read_related_callers": False,
                "read_related_callees": False,
                "searched_references": False,
                "checked_tests_or_absence": False,
            },
            "findings": [],
            "notes": "",
        }

        text = text_for_scan(path) if included else None
        if text is not None:
            for lineno, _line in conflict_marker_lines(path, text):
                finding_id = f"{repo.name.upper().replace('-', '_')}-AUTO-{finding_index:04d}"
                finding_index += 1
                row["findings"].append(finding_id)
                row["audit_status"] = "needs-followup"
                findings.append(
                    {
                        "id": finding_id,
                        "repo": repo.name,
                        "path": rel,
                        "line_start": lineno,
                        "line_end": lineno,
                        "severity": "critical" if repo.name == "agiworkforce" else "medium",
                        "confidence": "high",
                        "subsystems": subsystems,
                        "risk_tags": ["operational-fragility", "semantic-drift"],
                        "title": "Possible unresolved merge conflict marker",
                        "description": "The file contains a conflict marker and must be manually reviewed.",
                        "impact": "Live source with conflict markers can fail builds or leave contradictory behavior.",
                        "evidence": "Line starts with a standard conflict marker token outside a recognized Rust raw-string fixture.",
                        "recommendation": "Line-audit the file and resolve or mark as intentional fixture.",
                        "status": "open",
                    }
                )
        rows.append(row)
    return rows, findings


def write_jsonl(path: Path, rows: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, sort_keys=True) + "\n")


def validate_finding_statuses(output: Path, *, require_manual: bool = True) -> int:
    """Validate every finding row has a machine-readable lifecycle status."""

    paths = (
        (output / "manual-findings.jsonl", require_manual),
        (output / "ledgers" / "findings.auto.jsonl", True),
    )
    errors: list[str] = []
    checked = 0

    for path, required in paths:
        if not path.exists():
            if required:
                errors.append(f"{path}: missing finding file")
            continue
        with path.open(encoding="utf-8") as handle:
            for lineno, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                checked += 1
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as exc:
                    errors.append(f"{path}:{lineno}: invalid JSON: {exc.msg}")
                    continue
                finding_id = row.get("id", "<missing id>")
                status = row.get("status")
                if status is None:
                    errors.append(f"{path}:{lineno}: {finding_id}: missing status")
                elif status not in FINDING_STATUS_VALUES:
                    allowed = ", ".join(sorted(FINDING_STATUS_VALUES))
                    errors.append(
                        f"{path}:{lineno}: {finding_id}: invalid status {status!r}; "
                        f"expected one of: {allowed}"
                    )

    if errors:
        for error in errors:
            print(error)
        return 1

    allowed = ", ".join(sorted(FINDING_STATUS_VALUES))
    print(f"Validated {checked} finding rows; allowed statuses: {allowed}")
    return 0


def summarize(rows_by_repo: dict[str, list[dict]], findings: list[dict]) -> str:
    lines = [
        "# Reference CLI Deep Audit Coverage",
        "",
        "Generated by `scripts/audit_reference_sources.py`.",
        "",
        "## Coverage",
        "",
        "| Repo | Total files | Included | Excluded | Needs follow-up |",
        "|---|---:|---:|---:|---:|",
    ]
    for repo, rows in rows_by_repo.items():
        total = len(rows)
        included = sum(1 for row in rows if row["included"])
        excluded = total - included
        followup = sum(1 for row in rows if row["audit_status"] == "needs-followup")
        lines.append(f"| `{repo}` | {total} | {included} | {excluded} | {followup} |")

    lines.extend(["", "## Exclusions By Reason", ""])
    for repo, rows in rows_by_repo.items():
        counter = Counter(row["exclusion_reason"] for row in rows if not row["included"])
        lines.append(f"### {repo}")
        if not counter:
            lines.append("")
            lines.append("No exclusions.")
            lines.append("")
            continue
        lines.append("")
        lines.append("| Reason | Files |")
        lines.append("|---|---:|")
        for reason, count in sorted(counter.items()):
            lines.append(f"| `{reason}` | {count} |")
        lines.append("")

    lines.extend(["## Included Files By Primary Subsystem", ""])
    for repo, rows in rows_by_repo.items():
        counter: Counter[str] = Counter()
        for row in rows:
            if row["included"]:
                primary = row["subsystems"][0] if row["subsystems"] else "unknown"
                counter[primary] += 1
        lines.append(f"### {repo}")
        lines.append("")
        lines.append("| Subsystem | Files |")
        lines.append("|---|---:|")
        for subsystem, count in counter.most_common():
            lines.append(f"| `{subsystem}` | {count} |")
        lines.append("")

    lines.extend(
        [
            "## Automatic Findings",
            "",
            f"Conflict-marker style findings: {len(findings)}",
            "",
            "These are triage findings only. Each one still needs manual line-audit review before being treated as a final defect.",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--validate-findings-only",
        action="store_true",
        help="validate manual and generated finding status fields without regenerating ledgers",
    )
    args = parser.parse_args()

    output = args.output
    if args.validate_findings_only:
        return validate_finding_statuses(output)

    ledgers_dir = output / "ledgers"
    rows_by_repo: dict[str, list[dict]] = {}
    all_findings: list[dict] = []

    for repo in REPOS:
        if not repo.root.exists():
            raise SystemExit(f"missing repo root for {repo.name}: {repo.root}")
        rows, findings = build_ledger(repo)
        rows_by_repo[repo.name] = rows
        all_findings.extend(findings)
        write_jsonl(ledgers_dir / f"{repo.name}.files.jsonl", rows)

    write_jsonl(ledgers_dir / "findings.auto.jsonl", all_findings)
    (output / "coverage-summary.md").parent.mkdir(parents=True, exist_ok=True)
    (output / "coverage-summary.md").write_text(summarize(rows_by_repo, all_findings), encoding="utf-8")
    validation_status = validate_finding_statuses(output, require_manual=(output / "manual-findings.jsonl").exists())
    if validation_status != 0:
        return validation_status
    print(f"Wrote audit ledgers to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
