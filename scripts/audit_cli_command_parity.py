#!/usr/bin/env python3
"""Generate AGI CLI vs reference/src command parity artifacts.

This is intentionally static-analysis only. It records what can be derived from
source without executing either CLI, then marks ambiguous rows for follow-up.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
REFERENCE_SRC = Path.home() / "Desktop" / "reference" / "src"
OUTPUT_DIR = REPO_ROOT / "audit" / "reference-cli-deep-audit" / "command-parity"

AGI_REGISTRY = REPO_ROOT / "crates" / "agiworkforce-command-registry" / "src" / "lib.rs"
AGI_CLI = REPO_ROOT / "apps" / "cli" / "src" / "lib.rs"
AGI_TUI_RENDERERS = (
    REPO_ROOT / "apps" / "cli" / "src" / "tui" / "widgets" / "screen_renderers.rs"
)
REFERENCE_COMMANDS = REFERENCE_SRC / "commands.ts"


@dataclass(frozen=True)
class SlashCommand:
    name: str
    description: str
    allowed_in_readonly: bool
    accepts_args: bool
    aliases: list[str]
    source_file: str


@dataclass(frozen=True)
class CliCommand:
    name: str
    description: str
    aliases: list[str]
    enum_name: str
    source_file: str


@dataclass(frozen=True)
class ReferenceCommand:
    name: str
    variable: str
    import_path: str
    source_file: str
    aliases: list[str]
    description: str | None
    conditional: bool
    internal_only: bool
    resolution: str


@dataclass(frozen=True)
class ParityRow:
    reference_command: str
    status: str
    agi_matches: list[str]
    reference_source: str
    notes: str


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def rel(path: Path) -> str:
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def kebab(name: str) -> str:
    name = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", name)
    return name.replace("_", "-").lower()


def extract_call_blocks(source: str, needle: str) -> list[str]:
    blocks: list[str] = []
    cursor = 0
    while True:
        start = source.find(needle, cursor)
        if start == -1:
            return blocks
        paren = source.find("(", start + len(needle))
        if paren == -1:
            return blocks

        depth = 0
        in_string = False
        escaped = False
        for idx in range(paren, len(source)):
            ch = source[idx]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
                continue
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    blocks.append(source[paren + 1 : idx])
                    cursor = idx + 1
                    break
        else:
            return blocks


def split_top_level_args(block: str) -> list[str]:
    args: list[str] = []
    current: list[str] = []
    depth = 0
    in_string = False
    escaped = False
    for ch in block:
        if in_string:
            current.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            current.append(ch)
            continue
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            args.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
    if current:
        args.append("".join(current).strip())
    return args


def rust_string(value: str) -> str:
    match = re.search(r'"((?:[^"\\]|\\.)*)"', value, re.S)
    if not match:
        return ""
    return bytes(match.group(1), "utf-8").decode("unicode_escape")


def rust_bool(value: str) -> bool:
    return value.strip() == "true"


def rust_vec_strings(value: str) -> list[str]:
    return [bytes(item, "utf-8").decode("unicode_escape") for item in re.findall(r'"((?:[^"\\]|\\.)*)"', value)]


def agi_slash_commands() -> list[SlashCommand]:
    source = read(AGI_REGISTRY).split("#[cfg(test)]", 1)[0]
    commands: list[SlashCommand] = []
    for block in extract_call_blocks(source, "RegistryCommand::builtin_slash"):
        args = split_top_level_args(block)
        if len(args) < 5:
            continue
        commands.append(
            SlashCommand(
                name=rust_string(args[0]),
                description=rust_string(args[1]),
                allowed_in_readonly=rust_bool(args[2]),
                accepts_args=rust_bool(args[3]),
                aliases=rust_vec_strings(args[4]),
                source_file=rel(AGI_REGISTRY),
            )
        )
    return commands


def extract_enum_body(source: str, enum_name: str) -> str | None:
    marker = f"enum {enum_name}"
    start = source.find(marker)
    if start == -1:
        return None
    brace = source.find("{", start)
    if brace == -1:
        return None
    depth = 0
    for idx in range(brace, len(source)):
        if source[idx] == "{":
            depth += 1
        elif source[idx] == "}":
            depth -= 1
            if depth == 0:
                return source[brace + 1 : idx]
    return None


def agi_cli_commands() -> list[CliCommand]:
    source = read(AGI_CLI)
    commands: list[CliCommand] = []
    for enum_name in [
        "Command",
        "CloudSubcommand",
        "SessionAction",
        "PluginSubcommand",
        "EcosystemSubcommand",
        "SyncSubcommand",
        "MarketplaceSubcommand",
    ]:
        body = extract_enum_body(source, enum_name)
        if not body:
            continue
        docs: list[str] = []
        attrs: list[str] = []
        for line in body.splitlines():
            stripped = line.strip()
            if stripped.startswith("///"):
                docs.append(stripped.removeprefix("///").strip())
                continue
            if stripped.startswith("#["):
                attrs.append(stripped)
                continue
            match = re.match(r"([A-Z][A-Za-z0-9_]*)\b", stripped)
            if not match:
                if stripped and not stripped.startswith(("#", "//")):
                    docs = []
                    attrs = []
                continue
            variant = match.group(1)
            alias_match = re.search(r'alias\s*=\s*"([^"]+)"', " ".join(attrs))
            name = kebab(variant)
            if enum_name != "Command":
                parent = enum_name.removesuffix("Subcommand").removesuffix("Action")
                name = f"{kebab(parent)} {name}"
            commands.append(
                CliCommand(
                    name=name,
                    description=" ".join(docs).strip(),
                    aliases=[alias_match.group(1)] if alias_match else [],
                    enum_name=enum_name,
                    source_file=rel(AGI_CLI),
                )
            )
            docs = []
            attrs = []
    return commands


def reference_import_map(source: str) -> dict[str, str]:
    imports: dict[str, str] = {}
    for match in re.finditer(
        r"import\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:,\s*\{([^}]*)\})?\s*from\s*['\"]([^'\"]+)['\"]",
        source,
    ):
        imports[match.group(1)] = match.group(3)
        if match.group(2):
            for raw_name in match.group(2).split(","):
                imported = raw_name.strip().split(" as ")[-1].strip()
                if imported:
                    imports[imported] = match.group(3)
    for match in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*['\"]([^'\"]+)['\"]", source):
        for raw_name in match.group(1).split(","):
            imported = raw_name.strip().split(" as ")[-1].strip()
            if imported:
                imports[imported] = match.group(2)
    return imports


def extract_commands_array_vars(source: str) -> set[str]:
    start = source.find("const COMMANDS = memoize")
    if start == -1:
        return set()
    arrow_match = re.search(r"=>\s*\[", source[start:])
    if not arrow_match:
        return set()
    open_bracket = start + arrow_match.end() - 1
    depth = 0
    end = open_bracket
    for idx in range(open_bracket, len(source)):
        if source[idx] == "[":
            depth += 1
        elif source[idx] == "]":
            depth -= 1
            if depth == 0:
                end = idx
                break
    body = source[open_bracket + 1 : end]
    return set(re.findall(r"\b[A-Za-z_][A-Za-z0-9_]*\b", body))


def extract_internal_vars(source: str) -> set[str]:
    start = source.find("export const INTERNAL_ONLY_COMMANDS")
    if start == -1:
        return set()
    open_bracket = source.find("[", start)
    if open_bracket == -1:
        return set()
    depth = 0
    end = open_bracket
    for idx in range(open_bracket, len(source)):
        if source[idx] == "[":
            depth += 1
        elif source[idx] == "]":
            depth -= 1
            if depth == 0:
                end = idx
                break
    return set(re.findall(r"\b[A-Za-z_][A-Za-z0-9_]*\b", source[open_bracket + 1 : end]))


def command_source_path(import_path: str) -> Path | None:
    if not import_path.startswith("./"):
        return None
    raw = (REFERENCE_SRC / import_path[2:]).resolve()
    candidates = [raw]
    if raw.suffix in {".js", ".jsx", ".mjs"}:
        candidates.extend(
            [
                raw.with_suffix(".ts"),
                raw.with_suffix(".tsx"),
            ]
        )
    if raw.suffix == "":
        candidates.extend(
            [
                raw.with_suffix(".ts"),
                raw.with_suffix(".tsx"),
                raw.with_suffix(".js"),
                raw / "index.ts",
                raw / "index.tsx",
                raw / "index.js",
            ]
        )
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def parse_ts_command_metadata(path: Path | None, variable: str) -> tuple[str, list[str], str | None, str]:
    if path is None:
        return kebab(variable), [], None, "unresolved-import"
    try:
        source = read(path)
    except UnicodeDecodeError:
        return kebab(variable), [], None, "unreadable"

    names = re.findall(r"\bname\s*:\s*['\"]([^'\"]+)['\"]", source)
    aliases: list[str] = []
    alias_match = re.search(r"\baliases\s*:\s*\[([^\]]*)\]", source, re.S)
    if alias_match:
        aliases = re.findall(r"['\"]([^'\"]+)['\"]", alias_match.group(1))
    desc_match = re.search(r"\bdescription\s*:\s*['\"]([^'\"]+)['\"]", source, re.S)
    description = desc_match.group(1).replace("\n", " ") if desc_match else None

    if not names:
        return kebab(variable), aliases, description, "fallback-variable-name"
    if len(names) == 1:
        return names[0], aliases, description, "resolved-source-name"
    preferred = kebab(variable)
    for name in names:
        if name == preferred:
            return name, aliases, description, "resolved-source-name"
    return names[0], aliases, description, "ambiguous-first-source-name"


def reference_commands() -> list[ReferenceCommand]:
    source = read(REFERENCE_COMMANDS)
    imports = reference_import_map(source)
    command_vars = extract_commands_array_vars(source)
    internal_vars = extract_internal_vars(source)

    # Inline command objects in commands.ts are not imports.
    imports["usageReport"] = "./commands.ts"

    out: list[ReferenceCommand] = []
    for variable in sorted(command_vars):
        if variable in {
            "COMMANDS",
            "INTERNAL_ONLY_COMMANDS",
            "process",
            "env",
            "feature",
            "isUsing3PServices",
            "USER_TYPE",
            "IS_DEMO",
            "ant",
        }:
            continue
        import_path = imports.get(variable)
        if import_path is None:
            continue
        path = REFERENCE_COMMANDS if import_path == "./commands.ts" else command_source_path(import_path)
        name, aliases, description, resolution = parse_ts_command_metadata(path, variable)
        variable_pat = re.escape(variable)
        conditional = bool(re.search(rf"\.\.\([^)]*{variable_pat}[^)]*\?", source, re.S))
        out.append(
            ReferenceCommand(
                name=name,
                variable=variable,
                import_path=import_path,
                source_file=path.as_posix() if path else import_path,
                aliases=aliases,
                description=description,
                conditional=conditional,
                internal_only=variable in internal_vars,
                resolution=resolution,
            )
        )
    return out


def agi_keybindings() -> list[dict[str, str]]:
    source = read(AGI_TUI_RENDERERS)
    start = source.find("pub fn render_keybindings()")
    if start == -1:
        return []
    body = source[start : source.find('frame("Keybindings"', start)]
    rows: list[dict[str, str]] = []
    for text in re.findall(r'"([^"]+)"\.to_string\(\)', body):
        stripped = text.strip()
        if not stripped or stripped.endswith(":"):
            continue
        match = re.match(r"(.+?)\s{2,}(.+)", stripped)
        if match:
            rows.append({"key": match.group(1).strip(), "action": match.group(2).strip()})
    return rows


def parity_rows(agi_slash: list[SlashCommand], agi_cli: list[CliCommand], reference: list[ReferenceCommand]) -> list[ParityRow]:
    agi_lookup: dict[str, list[str]] = {}
    for command in agi_slash:
        for name in [command.name, *command.aliases]:
            agi_lookup.setdefault(name, []).append(f"slash:/{command.name}")
    for command in agi_cli:
        for name in [command.name, *command.aliases]:
            agi_lookup.setdefault(name, []).append(f"cli:{command.name}")

    rows: list[ParityRow] = []
    for command in reference:
        candidates = [command.name, *command.aliases]
        matches = sorted({match for candidate in candidates for match in agi_lookup.get(candidate, [])})
        if matches:
            status = "parity"
            notes = "matched by command name or alias"
        elif command.internal_only:
            status = "different-by-design"
            notes = "reference marks this internal-only; AGI should not add blindly"
        elif command.conditional:
            status = "different-by-design"
            notes = "reference command is feature-gated; AGI needs explicit product decision"
        else:
            status = "missing"
            notes = "no static AGI slash or CLI command match found"
        rows.append(
            ParityRow(
                reference_command=command.name,
                status=status,
                agi_matches=matches,
                reference_source=command.source_file,
                notes=notes,
            )
        )
    return sorted(rows, key=lambda row: (row.status, row.reference_command))


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def markdown_report(
    agi_slash: list[SlashCommand],
    agi_cli: list[CliCommand],
    reference: list[ReferenceCommand],
    parity: list[ParityRow],
    keybindings: list[dict[str, str]],
) -> str:
    counts: dict[str, int] = {}
    for row in parity:
        counts[row.status] = counts.get(row.status, 0) + 1

    lines = [
        "# CLI Command Parity Map",
        "",
        "Generated by `python3 scripts/audit_cli_command_parity.py`.",
        "",
        "## Summary",
        "",
        f"- AGI built-in slash commands: {len(agi_slash)}",
        f"- AGI top-level/subcommands discovered from Clap enums: {len(agi_cli)}",
        f"- AGI static keybinding rows discovered from `/keybindings`: {len(keybindings)}",
        f"- `reference/src` commands discovered from `commands.ts`: {len(reference)}",
        f"- Parity rows: {counts.get('parity', 0)} parity, {counts.get('missing', 0)} missing, {counts.get('different-by-design', 0)} different-by-design",
        "",
        "## Missing Reference Commands",
        "",
    ]
    missing = [row for row in parity if row.status == "missing"]
    if not missing:
        lines.append("- None by static name/alias matching.")
    else:
        for row in missing:
            lines.append(f"- `{row.reference_command}` — {row.notes} ({row.reference_source})")

    lines.extend(["", "## Different By Design / Product Decision Needed", ""])
    design = [row for row in parity if row.status == "different-by-design"]
    if not design:
        lines.append("- None.")
    else:
        for row in design:
            lines.append(f"- `{row.reference_command}` — {row.notes} ({row.reference_source})")

    lines.extend(["", "## AGI Slash Commands", ""])
    for command in sorted(agi_slash, key=lambda item: item.name):
        aliases = f" aliases: {', '.join('/' + a for a in command.aliases)}" if command.aliases else ""
        lines.append(f"- `/{command.name}` — {command.description}{aliases}")

    lines.extend(["", "## AGI CLI Subcommands", ""])
    for command in sorted(agi_cli, key=lambda item: item.name):
        aliases = f" aliases: {', '.join(command.aliases)}" if command.aliases else ""
        lines.append(f"- `{command.name}` — {command.description or 'no doc comment found'}{aliases}")

    lines.extend(["", "## Keybindings", ""])
    if not keybindings:
        lines.append("- No static keybinding rows found.")
    else:
        for row in keybindings:
            lines.append(f"- `{row['key']}` — {row['action']}")

    lines.extend(
        [
            "",
            "## Caveats",
            "",
            "- This is static analysis. Dynamic skills, plugins, MCP commands, feature-flagged commands, and runtime availability still need behavioral smoke tests.",
            "- `missing` means no static name/alias match was found. It does not automatically mean AGI should implement the command.",
            "- `different-by-design` rows need explicit product decisions before parity can be claimed.",
            "",
        ]
    )
    return "\n".join(lines)


def generate() -> None:
    agi_slash = agi_slash_commands()
    agi_cli = agi_cli_commands()
    reference = reference_commands()
    keybindings = agi_keybindings()
    parity = parity_rows(agi_slash, agi_cli, reference)

    write_json(OUTPUT_DIR / "agi-slash-commands.json", [asdict(item) for item in agi_slash])
    write_json(OUTPUT_DIR / "agi-cli-subcommands.json", [asdict(item) for item in agi_cli])
    write_json(OUTPUT_DIR / "agi-keybindings.json", keybindings)
    write_json(OUTPUT_DIR / "reference-src-commands.json", [asdict(item) for item in reference])
    write_json(OUTPUT_DIR / "parity.json", [asdict(item) for item in parity])
    (OUTPUT_DIR / "README.md").write_text(
        markdown_report(agi_slash, agi_cli, reference, parity, keybindings),
        encoding="utf-8",
    )


def validate() -> None:
    required = [
        OUTPUT_DIR / "agi-slash-commands.json",
        OUTPUT_DIR / "agi-cli-subcommands.json",
        OUTPUT_DIR / "agi-keybindings.json",
        OUTPUT_DIR / "reference-src-commands.json",
        OUTPUT_DIR / "parity.json",
        OUTPUT_DIR / "README.md",
    ]
    for path in required:
        if not path.exists():
            raise SystemExit(f"missing generated artifact: {path}")
        if path.suffix == ".json":
            json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate generated artifacts")
    args = parser.parse_args()
    if args.check:
        validate()
    else:
        generate()
        validate()


if __name__ == "__main__":
    main()
