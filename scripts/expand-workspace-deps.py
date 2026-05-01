#!/usr/bin/env python3
"""
Expand { workspace = true } deps in a ported crate's Cargo.toml.
Usage: python3 expand-workspace-deps.py <path-to-Cargo.toml>
"""
import re, sys
from pathlib import Path

CODEX_WS = Path.home() / "Desktop/reference/codex-cli/codex-rs/Cargo.toml"
AGI_CRATES = Path.home() / "Desktop/agiworkforce/crates"

def parse_workspace_deps(ws_toml: str) -> dict:
    """Return {dep_name: replacement_string} from [workspace.dependencies]."""
    deps = {}
    in_section = False
    for line in ws_toml.splitlines():
        if line.strip() == "[workspace.dependencies]":
            in_section = True
            continue
        if in_section and line.startswith("[") and line.strip() != "[workspace.dependencies]":
            break
        if not in_section:
            continue
        # e.g.  anyhow = "1"   or   codex-core = { path = "core" }
        m = re.match(r'^(\S+)\s*=\s*(.+)$', line.strip())
        if not m:
            continue
        name, val = m.group(1), m.group(2).strip()
        deps[name] = val
    return deps

def codex_to_agi_name(codex_name: str) -> str:
    """codex-foo -> agiworkforce-foo, codex_foo -> agiworkforce_foo"""
    return codex_name.replace("codex-", "agiworkforce-").replace("codex_", "agiworkforce_")

def path_for_internal(agi_name: str) -> str:
    return f'{{ path = "../{agi_name}" }}'

def expand_dep_value(dep_name: str, ws_val: str, extras: str) -> str:
    ws_val = ws_val.strip()
    # Internal crate: has path = "..."
    if 'path' in ws_val:
        agi_name = dep_name  # already renamed
        replacement = f'{{ path = "../{agi_name}" }}'
        return replacement
    # External crate: has version string or { version = ... }
    if ws_val.startswith('"'):
        # Simple version string
        if extras:
            replacement = f'{{ version = {ws_val}{extras} }}'
        else:
            replacement = ws_val
    else:
        # Already { version = ... } or similar
        if extras and extras not in ws_val:
            replacement = ws_val.rstrip('}') + extras + '}'
        else:
            replacement = ws_val
    return replacement

def process_cargo_toml(cargo_path: Path, ws_deps: dict):
    text = cargo_path.read_text()
    lines = text.splitlines()
    new_lines = []
    skip_next = False

    i = 0
    while i < len(lines):
        line = lines[i]

        # Remove [lints] section (workspace = true inside not valid)
        if line.strip() == "[lints]":
            # skip until next section
            i += 1
            while i < len(lines) and not lines[i].startswith("["):
                i += 1
            continue

        # Skip bare workspace = true lines
        if line.strip() == "workspace = true":
            i += 1
            continue

        # Fix edition.workspace / version.workspace / license.workspace
        for field in ("edition", "version", "license"):
            if re.match(rf'^{field}\.workspace\s*=\s*true', line.strip()):
                if field == "edition":
                    line = re.sub(rf'{field}\.workspace\s*=\s*true', 'edition = "2024"', line)
                elif field == "version":
                    line = re.sub(rf'{field}\.workspace\s*=\s*true', 'version = "0.1.0"', line)
                elif field == "license":
                    line = ""

        # Expand dep = { workspace = true, ... }
        m = re.match(r'^(\s*)([\w-]+)\s*=\s*\{\s*workspace\s*=\s*true(.*)\}', line)
        if m:
            indent, dep_name, extras = m.group(1), m.group(2), m.group(3).strip()
            # extras may be ", features = [...]" etc — strip leading comma
            extras = re.sub(r'^,\s*', '', extras)
            if extras:
                extras = ", " + extras

            # Look up by original codex name
            codex_name = dep_name.replace("agiworkforce-", "codex-").replace("agiworkforce_", "codex_")
            ws_val = ws_deps.get(codex_name) or ws_deps.get(dep_name, "")

            if ws_val:
                replacement = expand_dep_value(dep_name, ws_val, extras)
            else:
                # Unknown dep, leave as explicit workspace ref with comment
                replacement = f'"*"  # TODO: unknown workspace dep'

            line = f"{indent}{dep_name} = {replacement}"

        new_lines.append(line)
        i += 1

    cargo_path.write_text('\n'.join(new_lines) + '\n')
    print(f"Expanded: {cargo_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: expand-workspace-deps.py <path/to/Cargo.toml>")
        sys.exit(1)

    ws_text = CODEX_WS.read_text()
    ws_deps = parse_workspace_deps(ws_text)

    cargo_path = Path(sys.argv[1])
    process_cargo_toml(cargo_path, ws_deps)
