# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Build-context node for Skillspector workflow.

Builds flat ScanContext fields (components, file_cache, manifest, etc.)
from a local skill directory.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from skillspector.constants import MODEL_CONFIG
from skillspector.logging_config import get_logger
from skillspector.models import Finding
from skillspector.nodes.analyzers.static_runner import MAX_FILE_BYTES
from skillspector.state import SkillspectorState

logger = get_logger(__name__)

# Directories to skip when walking
_SKIP_DIRS = frozenset(
    {".git", "__pycache__", "node_modules", ".venv", "venv", ".tox", ".pytest_cache"}
)

# File type by extension
_FILE_TYPES: dict[str, str] = {
    ".md": "markdown",
    ".markdown": "markdown",
    ".py": "python",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".txt": "text",
    ".js": "javascript",
    ".ts": "typescript",
    ".rb": "ruby",
    ".go": "go",
    ".rs": "rust",
}
_EXECUTABLE_EXTENSIONS = frozenset(
    {".py", ".sh", ".bash", ".zsh", ".js", ".ts", ".rb", ".go", ".rs", ".pl"}
)

# Manifest fields are attacker-authored and reach every metadata analyzer, so
# they are capped the way file bodies are capped by MAX_FILE_BYTES. Without a
# cap, one multi-megabyte frontmatter value costs each analyzer a full pass (and
# a superlinear one for any pattern that scans for a delimiter), which stalls
# the vetting gate on a skill the attacker submits.
MAX_MANIFEST_FIELD_CHARS = 20_000

# The frontmatter search and the YAML parse run on attacker-authored bytes, so
# they get the same budget the analyzers get for a file body. Both caps are
# reported as a finding whenever they bite: the loader that installs the skill
# reads the whole manifest, so what is cut here is metadata only the scanner is
# blind to, and silence about that is an evasion rather than a saving.
MAX_MANIFEST_BYTES = MAX_FILE_BYTES

_MANIFEST_CATEGORY = "Manifest Integrity"


def _resolve_skill_dir(state: SkillspectorState) -> Path:
    """Resolve state skill_path to an existing directory Path."""
    skill_path = state.get("skill_path")
    if not skill_path or not isinstance(skill_path, str) or not skill_path.strip():
        raise ValueError("skill_path is required; provide input_path or skill_path to scan")
    try:
        resolved = Path(skill_path).resolve()
    except (OSError, RuntimeError) as e:
        raise ValueError(f"Invalid skill_path: {skill_path}") from e
    if not resolved.is_dir():
        raise ValueError(f"Invalid skill_path: {skill_path} is not an existing directory")
    return resolved


def _walk_skill_files(skill_dir: Path) -> tuple[list[str], list[str]]:
    """Walk skill directory and return sorted relative paths plus escaping links.

    Skips _SKIP_DIRS and hidden files except those starting with .claude.

    Symlinks are never followed. ``Path.is_file()`` returns True for a link to a
    file, and ``relative_to`` compares the *link* path, so a skill shipping
    ``notes.txt -> ~/.ssh/id_rsa`` used to have the key read into ``file_cache``
    and transmitted to the analyzers. The second return value names every link
    that pointed outside the skill so the caller can report it rather than
    silently dropping it.
    """
    paths: list[str] = []
    escaping_links: list[str] = []
    skill_root = skill_dir.resolve()
    for item in skill_dir.rglob("*"):
        if item.is_symlink():
            try:
                rel = item.relative_to(skill_dir).as_posix()
            except ValueError:
                rel = str(item)
            try:
                inside = item.resolve().is_relative_to(skill_root)
            except (OSError, RuntimeError):
                inside = False
            if not inside:
                escaping_links.append(rel)
            continue
        if not item.is_file():
            continue
        if any(skip in item.parts for skip in _SKIP_DIRS):
            continue
        if item.name.startswith(".") and not item.name.startswith(".claude"):
            continue
        try:
            rel = item.relative_to(skill_dir)
            # Use forward slashes on every OS: these relative paths are dict keys
            # and SARIF/URI locations, so they must be portable (not OS-specific
            # backslashes on Windows).
            paths.append(rel.as_posix())
        except ValueError:
            logger.debug("Skipping path (not under skill_dir): %s", item)
            continue
    paths.sort()
    escaping_links.sort()
    return paths, escaping_links


def _infer_file_type(path: str) -> str:
    """Infer file type from path (extension)."""
    idx = path.rfind(".")
    suffix = path[idx:].lower() if idx >= 0 else ""
    return _FILE_TYPES.get(suffix, "other")


def _count_lines(file_path: Path) -> int:
    """Count lines in a file, handling binary and errors gracefully."""
    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
        return len(content.splitlines())
    except OSError:
        logger.debug("Could not read file for line count: %s", file_path)
        return 0


def _build_component_metadata(
    skill_dir: Path, components: list[str]
) -> tuple[list[dict[str, object]], bool]:
    """Build component_metadata list and has_executable_scripts from paths."""
    metadata: list[dict[str, object]] = []
    has_executable = False
    for path in components:
        full = skill_dir / path
        if not full.is_file():
            continue
        suffix = full.suffix.lower()
        file_type = _infer_file_type(path)
        lines = _count_lines(full)
        executable = suffix in _EXECUTABLE_EXTENSIONS
        if executable:
            has_executable = True
        try:
            size_bytes = full.stat().st_size
        except OSError:
            logger.debug("Could not stat file: %s", path)
            size_bytes = 0
        metadata.append(
            {
                "path": path,
                "type": file_type,
                "lines": lines,
                "executable": executable,
                "size_bytes": size_bytes,
            }
        )
    return metadata, has_executable


def _read_file_cache(skill_dir: Path, components: list[str]) -> dict[str, str]:
    """Build file_cache: relative path -> file contents. Uses utf-8 with replace for errors."""
    file_cache: dict[str, str] = {}
    for path in components:
        full = skill_dir / path
        if not full.is_file():
            continue
        try:
            content = full.read_text(encoding="utf-8", errors="replace")
            file_cache[path] = content
        except OSError:
            logger.debug("Could not read file: %s", path)
            file_cache[path] = ""
    return file_cache


def _unread_manifest_finding(file_name: str, message: str) -> Finding:
    """Report manifest metadata the scanner cut before any analyzer saw it."""
    return Finding(
        rule_id="MF1",
        message=message,
        severity="HIGH",
        confidence=0.85,
        file=file_name,
        category=_MANIFEST_CATEGORY,
        explanation=(
            "A skill loader reads the whole manifest, while the analyzers here only see what "
            "this node parsed. Padding a manifest past these caps therefore hides later "
            "fields, including any hidden instruction, from every metadata check."
        ),
        remediation=(
            "Keep SKILL.md frontmatter and its fields small enough to analyze, and close the "
            "frontmatter with '---'. Treat a manifest that needs cutting as untrusted."
        ),
    )


def _unparsed_manifest_finding(file_name: str) -> Finding:
    """Report a frontmatter that exists but yields no manifest to analyze."""
    return Finding(
        rule_id="MF2",
        message=f"{file_name} frontmatter is not a YAML mapping this scanner can parse.",
        severity="MEDIUM",
        confidence=0.7,
        file=file_name,
        category=_MANIFEST_CATEGORY,
        explanation=(
            "Every manifest analyzer skips a skill whose frontmatter fails to parse, so YAML "
            "this parser rejects and a skill loader accepts would clear the gate unexamined."
        ),
        remediation="Fix the SKILL.md frontmatter so it parses as a YAML mapping, then rescan.",
    )


def _cap_text(value: str, field: str, truncated: list[str]) -> str:
    """Truncate an over-long manifest string so analyzers see a bounded field."""
    if len(value) <= MAX_MANIFEST_FIELD_CHARS:
        return value
    truncated.append(field)
    logger.warning(
        "Manifest field %s is %d chars; truncating to %d before analysis",
        field,
        len(value),
        MAX_MANIFEST_FIELD_CHARS,
    )
    return value[:MAX_MANIFEST_FIELD_CHARS]


def _cap_field(value: object, field: str, truncated: list[str]) -> object:
    """Cap a manifest value of unknown type, leaving non-strings untouched."""
    return _cap_text(value, field, truncated) if isinstance(value, str) else value


def _cap_parameter(param: dict, index: int, truncated: list[str]) -> dict:
    """Return a parameter dict whose string values are length-capped."""
    return {
        key: _cap_field(value, f"parameters[{index}].{key}", truncated)
        for key, value in param.items()
    }


def _capped_manifest(data: dict, truncated: list[str]) -> dict[str, object]:
    """Build the manifest analyzers consume, capping every attacker-authored string."""
    manifest: dict[str, object] = {}
    if "name" in data:
        manifest["name"] = _cap_field(data["name"], "name", truncated)
    if "description" in data:
        manifest["description"] = _cap_field(data["description"], "description", truncated)
    triggers = data.get("triggers", [])
    manifest["triggers"] = (
        [_cap_text(str(t), f"triggers[{i}]", truncated) for i, t in enumerate(triggers)]
        if isinstance(triggers, list)
        else []
    )
    permissions = data.get("permissions", [])
    manifest["permissions"] = (
        [_cap_text(str(perm), f"permissions[{i}]", truncated) for i, perm in enumerate(permissions)]
        if isinstance(permissions, list)
        else []
    )
    # Preserve parameter definitions as dicts so the MCP tool-poisoning
    # analyzer (TP1/TP2/TP3 parameter checks) can inspect them. Without
    # this, those checks never fire on real scans because the manifest
    # carried no `parameters` key.
    parameters = data.get("parameters", [])
    manifest["parameters"] = (
        [_cap_parameter(p, i, truncated) for i, p in enumerate(parameters) if isinstance(p, dict)]
        if isinstance(parameters, list)
        else []
    )
    return manifest


def _read_manifest(path: Path) -> tuple[str, bool]:
    """Read a manifest up to the read cap, reporting whether the cap cut it."""
    with path.open(encoding="utf-8", errors="replace") as handle:
        content = handle.read(MAX_MANIFEST_BYTES + 1)
    if len(content) > MAX_MANIFEST_BYTES:
        logger.warning(
            "Manifest %s exceeds %d characters; analyzing the prefix only",
            path.name,
            MAX_MANIFEST_BYTES,
        )
        return content[:MAX_MANIFEST_BYTES], True
    return content, False


def _load_frontmatter(text: str, *, cut_mid_line: bool) -> object:
    """Parse frontmatter YAML, retrying once without the line the read cap split."""
    try:
        return yaml.safe_load(text)
    except yaml.YAMLError:
        if not cut_mid_line:
            raise
        last_line = text.rfind("\n")
        if last_line < 0:
            return None
        try:
            return yaml.safe_load(text[:last_line])
        except yaml.YAMLError:
            return None


def _parse_manifest(skill_dir: Path) -> tuple[dict[str, object], list[Finding]]:
    """Parse SKILL.md or skill.md YAML frontmatter into a manifest dict.

    Returns the manifest (name, description, triggers, permissions, parameters)
    together with findings for any part of it the scanner could not read the way
    the loader installing the skill will. Returns ({}, []) if no file, no
    frontmatter, or an empty one.
    """
    for name in ("SKILL.md", "skill.md"):
        path = skill_dir / name
        if not path.is_file():
            continue
        try:
            content, capped = _read_manifest(path)
        except OSError:
            logger.debug("Could not read manifest file: %s", name)
            return {}, []
        if not content.startswith("---"):
            return {}, []
        end_match = re.search(r"\n---\s*\n", content[3:])
        if end_match is None and not capped:
            return {}, []
        findings: list[Finding] = []
        if end_match is not None:
            frontmatter = content[3 : end_match.start() + 3]
        else:
            frontmatter = content[3:]
            findings.append(
                _unread_manifest_finding(
                    name,
                    f"{name} frontmatter has no closing '---' within its first "
                    f"{MAX_MANIFEST_BYTES} characters, so any field past that point was "
                    "never analyzed.",
                )
            )
        try:
            data = _load_frontmatter(frontmatter, cut_mid_line=end_match is None)
        except yaml.YAMLError:
            logger.warning("Manifest parse failed for %s", name)
            return {}, [_unparsed_manifest_finding(name)]
        if data is None:
            return {}, findings
        if not isinstance(data, dict):
            return {}, [*findings, _unparsed_manifest_finding(name)]
        truncated: list[str] = []
        manifest = _capped_manifest(data, truncated)
        if truncated:
            findings.append(
                _unread_manifest_finding(
                    name,
                    f"{name} metadata field(s) {', '.join(truncated)} exceed "
                    f"{MAX_MANIFEST_FIELD_CHARS} characters, so only the first "
                    f"{MAX_MANIFEST_FIELD_CHARS} of each were analyzed.",
                )
            )
        return manifest, findings
    return {}, []


def build_context(state: SkillspectorState) -> dict[str, object]:
    """Build flat ScanContext fields from state skill_path (local directory).

    Resolves skill_path to a directory, walks files, builds file_cache
    and manifest. Returns context keys plus any manifest-integrity findings.
    Raises ValueError if skill_path is missing or not an existing directory.
    """
    skill_dir = _resolve_skill_dir(state)

    components, escaping_links = _walk_skill_files(skill_dir)
    if escaping_links:
        logger.warning(
            "Skipped %d symlink(s) pointing outside the skill directory: %s",
            len(escaping_links),
            ", ".join(escaping_links),
        )
    file_cache = _read_file_cache(skill_dir, components)
    manifest, manifest_findings = _parse_manifest(skill_dir)
    component_metadata, has_executable_scripts = _build_component_metadata(skill_dir, components)

    return {
        "components": components,
        "escaping_symlinks": escaping_links,
        "file_cache": file_cache,
        "ast_cache": {},
        "manifest": manifest,
        "findings": manifest_findings,
        "previous_manifest": None,
        "model_config": MODEL_CONFIG,
        "component_metadata": component_metadata,
        "has_executable_scripts": has_executable_scripts,
    }
