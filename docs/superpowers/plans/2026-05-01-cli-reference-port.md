# CLI Reference Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all 33 missing `codex-rs` Rust crates into `crates/agiworkforce-*` and copy `reference/src` TypeScript into `apps/cli-ts/src/`, renaming all `codex`/`claude` identifiers to `agiworkforce` throughout.

**Architecture:** Bulk copy each missing crate from `~/Desktop/reference/codex-cli/codex-rs/{name}/` → `~/Desktop/agiworkforce/crates/agiworkforce-{name}/`, run a sed rename pass, expand `{ workspace = true }` deps to explicit path/version deps, then add to workspace. The TypeScript source is copied from `~/Desktop/reference/src/` into a new `apps/cli-ts/src/` package with a fresh `package.json`.

**Tech Stack:** Rust (Cargo workspaces), TypeScript, bash, Python 3.11+, sed, pnpm

---

## Variables

```
REF_RS=~/Desktop/reference/codex-cli/codex-rs
REF_TS=~/Desktop/reference/src
AGI=~/Desktop/agiworkforce
CRATES=$AGI/crates
```

---

## Task 1: Write the workspace-dep expansion script

**Files:**

- Create: `~/Desktop/agiworkforce/scripts/expand-workspace-deps.py`
- Create: `~/Desktop/agiworkforce/scripts/port-crate.sh`

This script converts `{ workspace = true }` in a ported crate's Cargo.toml to explicit versions (external) or path deps (internal), using codex-rs/Cargo.toml as the lookup source.

- [ ] **Step 1: Create expand-workspace-deps.py**

```python
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

def path_for_internal(codex_name: str) -> str:
    agi_name = codex_to_agi_name(codex_name)
    return f'{{ path = "../{agi_name}" }}'

def expand_dep_value(dep_name: str, ws_val: str, ws_deps: dict) -> str:
    """
    dep_name: the name as it appears in the crate's Cargo.toml (already renamed to agiworkforce-*)
    ws_val: original value from workspace Cargo.toml for the original codex name
    """
    ws_val = ws_val.strip()
    # Internal crate: has path = "..."
    if 'path' in ws_val:
        return path_for_internal(dep_name)
    # External crate: has version string or { version = ... }
    # Return as-is (it's already a valid dep value)
    return ws_val

def process_cargo_toml(cargo_path: Path, ws_deps: dict):
    text = cargo_path.read_text()
    lines = text.splitlines()
    new_lines = []

    for line in lines:
        # Remove [lints] workspace = true (not valid without workspace)
        if line.strip() in ("workspace = true", "[lints]"):
            continue
        # Skip edition.workspace / version.workspace / license.workspace
        for field in ("edition", "version", "license"):
            if line.strip().startswith(f"{field}.workspace"):
                if field == "edition":
                    line = line.replace(f"{field}.workspace = true", 'edition = "2024"')
                elif field == "version":
                    line = line.replace(f"{field}.workspace = true", 'version = "0.1.0"')
                elif field == "license":
                    line = ""

        # Expand dep = { workspace = true, ... }
        m = re.match(r'^(\s*)([\w-]+)\s*=\s*\{\s*workspace\s*=\s*true(.*)\}', line)
        if m:
            indent, dep_name, extras = m.group(1), m.group(2), m.group(3).strip()
            # extras may be ", features = [...]" etc

            # Look up by original codex name
            codex_name = dep_name.replace("agiworkforce-", "codex-").replace("agiworkforce_", "codex_")
            ws_val = ws_deps.get(codex_name) or ws_deps.get(dep_name, "")

            if ws_val and 'path' in ws_val:
                # Internal: use path to agi crate
                agi_name = dep_name  # already renamed
                replacement = f'{{ path = "../{agi_name}" }}'
            elif ws_val:
                # External: use version from workspace
                if ws_val.startswith('"'):
                    # Simple version string
                    if extras:
                        replacement = f'{{ version = {ws_val}{extras} }}'
                    else:
                        replacement = ws_val
                else:
                    # Already { version = ... } or similar
                    if extras and extras not in ws_val:
                        # Merge features
                        replacement = ws_val.rstrip('}') + extras + '}'
                    else:
                        replacement = ws_val
            else:
                # Unknown dep, leave workspace = true but comment
                replacement = f'{{ workspace = true{extras} }}  # TODO: unknown dep'

            line = f"{indent}{dep_name} = {replacement}"

        new_lines.append(line)

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
```

Save as `~/Desktop/agiworkforce/scripts/expand-workspace-deps.py`.

- [ ] **Step 2: Create port-crate.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: port-crate.sh <codex-rs-dir-name> [--memories]
# Example: port-crate.sh rollout-trace
# Example for sub-crate: port-crate.sh memories/read

SRC_NAME="${1:?Usage: port-crate.sh <crate-name>}"
REF_RS=~/Desktop/reference/codex-cli/codex-rs
CRATES=~/Desktop/agiworkforce/crates
SCRIPTS=~/Desktop/agiworkforce/scripts

# Derive target name
# memories/read -> agiworkforce-memories-read
# codex-mcp -> agiworkforce-mcp  (strip codex- prefix, add agiworkforce-)
# rollout-trace -> agiworkforce-rollout-trace
BASENAME=$(basename "$SRC_NAME" | sed 's|/|-|g')
if [[ "$BASENAME" == codex-* ]]; then
    NEW_NAME="agiworkforce-${BASENAME#codex-}"
else
    NEW_NAME="agiworkforce-${BASENAME}"
fi

TARGET="$CRATES/$NEW_NAME"

if [ -d "$TARGET" ]; then
    echo "Already exists: $TARGET — skipping"
    exit 0
fi

echo "==> Copying $REF_RS/$SRC_NAME → $TARGET"
cp -r "$REF_RS/$SRC_NAME" "$TARGET"

echo "==> Renaming identifiers (codex→agiworkforce)"
find "$TARGET" -type f \( -name "*.rs" -o -name "*.toml" -o -name "*.md" -o -name "*.json" \) \
    -print0 | xargs -0 LC_ALL=C sed -i '' \
        -e 's/CODEX_/AGIWORKFORCE_/g' \
        -e 's/CODEX/AGIWORKFORCE/g' \
        -e 's/Codex/Agiworkforce/g' \
        -e 's/codex_/agiworkforce_/g' \
        -e 's/codex-/agiworkforce-/g' \
        -e 's/"codex"/"agiworkforce"/g'

echo "==> Expanding workspace deps in Cargo.toml(s)"
find "$TARGET" -name "Cargo.toml" | while read -r ct; do
    python3 "$SCRIPTS/expand-workspace-deps.py" "$ct"
done

echo "==> Done: $NEW_NAME"
echo "    Add to workspace if needed: cargo check -p $NEW_NAME 2>&1 | head -20"
```

Make executable:

```bash
chmod +x ~/Desktop/agiworkforce/scripts/port-crate.sh ~/Desktop/agiworkforce/scripts/expand-workspace-deps.py
```

- [ ] **Step 3: Commit the scripts**

```bash
cd ~/Desktop/agiworkforce
git add scripts/port-crate.sh scripts/expand-workspace-deps.py
git commit -m "chore(scripts): add port-crate.sh and expand-workspace-deps.py for codex-rs porting"
```

---

## Task 2: Port simple dependency-free crates (Batch 1)

These crates have only external deps (no missing internal codex crates) and can be ported immediately.

**Files:** Creates `crates/agiworkforce-{rollout-trace,analytics,agent-identity,collaboration-mode-templates,device-key,install-context,test-binary-support,aws-auth,file-system,uds}`

- [ ] **Step 1: Port rollout-trace**

```bash
cd ~/Desktop/agiworkforce
bash scripts/port-crate.sh rollout-trace
```

Verify Cargo.toml looks correct:

```bash
cat crates/agiworkforce-rollout-trace/Cargo.toml
```

Expected: `name = "agiworkforce-rollout-trace"`, deps use `{ path = "../agiworkforce-code-mode" }` etc.

- [ ] **Step 2: Port analytics**

```bash
bash scripts/port-crate.sh analytics
cat crates/agiworkforce-analytics/Cargo.toml
```

- [ ] **Step 3: Port agent-identity**

```bash
bash scripts/port-crate.sh agent-identity
cat crates/agiworkforce-agent-identity/Cargo.toml
```

- [ ] **Step 4: Port collaboration-mode-templates**

```bash
bash scripts/port-crate.sh collaboration-mode-templates
```

- [ ] **Step 5: Port device-key**

```bash
bash scripts/port-crate.sh device-key
```

- [ ] **Step 6: Port install-context**

```bash
bash scripts/port-crate.sh install-context
```

- [ ] **Step 7: Port test-binary-support**

```bash
bash scripts/port-crate.sh test-binary-support
```

- [ ] **Step 8: Port aws-auth**

```bash
bash scripts/port-crate.sh aws-auth
```

- [ ] **Step 9: Port file-system**

```bash
bash scripts/port-crate.sh file-system
```

- [ ] **Step 10: Port uds (stdio-to-uds)**

```bash
bash scripts/port-crate.sh uds
# Note: if agiworkforce-stdio-to-uds already exists, check for overlap first:
ls crates/ | grep uds
```

- [ ] **Step 11: cargo check batch 1**

```bash
cd ~/Desktop/agiworkforce
cargo check -p agiworkforce-rollout-trace -p agiworkforce-analytics -p agiworkforce-agent-identity -p agiworkforce-device-key -p agiworkforce-install-context 2>&1 | head -40
```

Fix any errors: typically missing `{ path = "..." }` for a dep that the script didn't expand. Edit the Cargo.toml directly to point to the right crate.

- [ ] **Step 12: Commit batch 1**

```bash
cd ~/Desktop/agiworkforce
git add crates/agiworkforce-rollout-trace crates/agiworkforce-analytics crates/agiworkforce-agent-identity crates/agiworkforce-collaboration-mode-templates crates/agiworkforce-device-key crates/agiworkforce-install-context crates/agiworkforce-test-binary-support crates/agiworkforce-aws-auth crates/agiworkforce-file-system crates/agiworkforce-uds
git commit -m "chore(crates): port codex-rs batch 1 — rollout-trace, analytics, agent-identity, device-key, install-context, aws-auth, file-system, uds"
```

---

## Task 3: Port model and memory crates (Batch 2)

These depend on crates from Batch 1 or already-ported crates.

**Files:** Creates `crates/agiworkforce-{model-provider-info,memories-read,memories-write,response-debug-context,responses-api-proxy,cloud-tasks-mock-client}`

- [ ] **Step 1: Port model-provider-info**

```bash
cd ~/Desktop/agiworkforce
bash scripts/port-crate.sh model-provider-info
cargo check -p agiworkforce-model-provider-info 2>&1 | head -20
```

- [ ] **Step 2: Port memories/read and memories/write**

```bash
bash scripts/port-crate.sh memories/read
bash scripts/port-crate.sh memories/write
# These land as agiworkforce-memories-read and agiworkforce-memories-write
ls crates/ | grep memories
cargo check -p agiworkforce-memories-read -p agiworkforce-memories-write 2>&1 | head -20
```

- [ ] **Step 3: Port response-debug-context**

```bash
bash scripts/port-crate.sh response-debug-context
cargo check -p agiworkforce-response-debug-context 2>&1 | head -20
```

- [ ] **Step 4: Port responses-api-proxy**

```bash
bash scripts/port-crate.sh responses-api-proxy
cargo check -p agiworkforce-responses-api-proxy 2>&1 | head -20
```

- [ ] **Step 5: Port cloud-tasks-mock-client**

```bash
bash scripts/port-crate.sh cloud-tasks-mock-client
```

- [ ] **Step 6: Commit batch 2**

```bash
cd ~/Desktop/agiworkforce
git add crates/agiworkforce-model-provider-info crates/agiworkforce-memories-read crates/agiworkforce-memories-write crates/agiworkforce-response-debug-context crates/agiworkforce-responses-api-proxy crates/agiworkforce-cloud-tasks-mock-client
git commit -m "chore(crates): port codex-rs batch 2 — model-provider-info, memories-read/write, response-debug-context, responses-api-proxy"
```

---

## Task 4: Port model-provider, models-manager, thread-store, agent-graph-store (Batch 3)

These depend on model-provider-info and memories from Batch 2.

**Files:** Creates `crates/agiworkforce-{model-provider,models-manager,thread-store,agent-graph-store}`

- [ ] **Step 1: Port model-provider**

```bash
cd ~/Desktop/agiworkforce
bash scripts/port-crate.sh model-provider
cargo check -p agiworkforce-model-provider 2>&1 | head -30
```

- [ ] **Step 2: Port models-manager**

```bash
bash scripts/port-crate.sh models-manager
cargo check -p agiworkforce-models-manager 2>&1 | head -30
```

- [ ] **Step 3: Port thread-store**

```bash
bash scripts/port-crate.sh thread-store
cargo check -p agiworkforce-thread-store 2>&1 | head -30
```

- [ ] **Step 4: Port agent-graph-store**

```bash
bash scripts/port-crate.sh agent-graph-store
cargo check -p agiworkforce-agent-graph-store 2>&1 | head -30
```

- [ ] **Step 5: Commit batch 3**

```bash
cd ~/Desktop/agiworkforce
git add crates/agiworkforce-model-provider crates/agiworkforce-models-manager crates/agiworkforce-thread-store crates/agiworkforce-agent-graph-store
git commit -m "chore(crates): port codex-rs batch 3 — model-provider, models-manager, thread-store, agent-graph-store"
```

---

## Task 5: Port plugin system crates (Batch 4)

`core-plugins` depends on `plugin`, `model-provider`, `core-skills` — port in dependency order.

**Files:** Creates `crates/agiworkforce-{core-skills,plugin,core-plugins}`

- [ ] **Step 1: Port core-skills**

```bash
cd ~/Desktop/agiworkforce
bash scripts/port-crate.sh core-skills
cargo check -p agiworkforce-core-skills 2>&1 | head -30
```

- [ ] **Step 2: Port plugin**

```bash
bash scripts/port-crate.sh plugin
cargo check -p agiworkforce-plugin 2>&1 | head -30
```

- [ ] **Step 3: Port core-plugins**

```bash
bash scripts/port-crate.sh core-plugins
cargo check -p agiworkforce-core-plugins 2>&1 | head -30
```

- [ ] **Step 4: Commit batch 4**

```bash
cd ~/Desktop/agiworkforce
git add crates/agiworkforce-core-skills crates/agiworkforce-plugin crates/agiworkforce-core-plugins
git commit -m "chore(crates): port codex-rs batch 4 — core-skills, plugin, core-plugins"
```

---

## Task 6: Port app-server and API crates (Batch 5)

**Files:** Creates `crates/agiworkforce-{app-server,app-server-test-client,core-api,mcp,backend-openapi-models,external-agent-migration,external-agent-sessions,tools,thread-manager-sample}`

- [ ] **Step 1: Port app-server**

```bash
cd ~/Desktop/agiworkforce
bash scripts/port-crate.sh app-server
# Note: agiworkforce-app-server-client and -protocol already exist; app-server is the server itself
cargo check -p agiworkforce-app-server 2>&1 | head -30
```

- [ ] **Step 2: Port app-server-test-client**

```bash
bash scripts/port-crate.sh app-server-test-client
```

- [ ] **Step 3: Port core-api**

```bash
bash scripts/port-crate.sh core-api
cargo check -p agiworkforce-core-api 2>&1 | head -30
```

- [ ] **Step 4: Port codex-mcp → agiworkforce-mcp**

```bash
bash scripts/port-crate.sh codex-mcp
# Script produces agiworkforce-mcp (strips codex- prefix)
# Note: agiworkforce-mcp-server already exists; this is the client-side MCP crate
ls crates/ | grep mcp
cargo check -p agiworkforce-mcp 2>&1 | head -20
```

- [ ] **Step 5: Port codex-backend-openapi-models → agiworkforce-backend-openapi-models**

```bash
bash scripts/port-crate.sh codex-backend-openapi-models
cargo check -p agiworkforce-backend-openapi-models 2>&1 | head -20
```

- [ ] **Step 6: Port external-agent-migration**

```bash
bash scripts/port-crate.sh external-agent-migration
```

- [ ] **Step 7: Port external-agent-sessions**

```bash
bash scripts/port-crate.sh external-agent-sessions
cargo check -p agiworkforce-external-agent-migration -p agiworkforce-external-agent-sessions 2>&1 | head -30
```

- [ ] **Step 8: Port tools**

```bash
bash scripts/port-crate.sh tools
cargo check -p agiworkforce-tools 2>&1 | head -30
```

- [ ] **Step 9: Port thread-manager-sample**

```bash
bash scripts/port-crate.sh thread-manager-sample
```

- [ ] **Step 10: Commit batch 5**

```bash
cd ~/Desktop/agiworkforce
git add crates/agiworkforce-app-server crates/agiworkforce-app-server-test-client crates/agiworkforce-core-api crates/agiworkforce-mcp crates/agiworkforce-backend-openapi-models crates/agiworkforce-external-agent-migration crates/agiworkforce-external-agent-sessions crates/agiworkforce-tools crates/agiworkforce-thread-manager-sample
git commit -m "chore(crates): port codex-rs batch 5 — app-server, core-api, mcp, backend-openapi-models, external-agent-*, tools"
```

---

## Task 7: Port realtime-webrtc (Batch 6)

This crate has unusual deps (tokio-tungstenite, WebRTC) — handle separately.

**Files:** Creates `crates/agiworkforce-realtime-webrtc`

- [ ] **Step 1: Check realtime-webrtc deps**

```bash
cat ~/Desktop/reference/codex-cli/codex-rs/realtime-webrtc/Cargo.toml
```

- [ ] **Step 2: Port realtime-webrtc**

```bash
cd ~/Desktop/agiworkforce
bash scripts/port-crate.sh realtime-webrtc
```

- [ ] **Step 3: Verify Cargo.toml has correct tungstenite git patches**

The agiworkforce root Cargo.toml already has the tungstenite git patches:

```bash
grep -A3 "tungstenite" ~/Desktop/agiworkforce/Cargo.toml
```

Expected output: `tokio-tungstenite` and `tungstenite` git overrides present.

- [ ] **Step 4: cargo check realtime-webrtc**

```bash
cargo check -p agiworkforce-realtime-webrtc 2>&1 | head -40
```

Fix any missing feature flags or dep mismatches by editing the Cargo.toml directly.

- [ ] **Step 5: Commit batch 6**

```bash
cd ~/Desktop/agiworkforce
git add crates/agiworkforce-realtime-webrtc
git commit -m "chore(crates): port codex-rs batch 6 — realtime-webrtc"
```

---

## Task 8: Wire high-value crates into apps/cli

Add the highest-value new crates as optional deps in `apps/cli/Cargo.toml`.

**Files:**

- Modify: `apps/cli/Cargo.toml`
- Modify: `apps/cli/src/main.rs` (feature gate imports)

- [ ] **Step 1: Read current apps/cli/Cargo.toml**

```bash
cat ~/Desktop/agiworkforce/apps/cli/Cargo.toml | grep -A5 "\[dependencies\]"
```

- [ ] **Step 2: Add new optional deps**

In `apps/cli/Cargo.toml`, under `[dependencies]`, add:

```toml
agiworkforce-rollout-trace   = { path = "../../crates/agiworkforce-rollout-trace",   optional = true }
agiworkforce-core-plugins    = { path = "../../crates/agiworkforce-core-plugins",    optional = true }
agiworkforce-core-skills     = { path = "../../crates/agiworkforce-core-skills",     optional = true }
agiworkforce-memories-read   = { path = "../../crates/agiworkforce-memories-read",   optional = true }
agiworkforce-memories-write  = { path = "../../crates/agiworkforce-memories-write",  optional = true }
agiworkforce-thread-store    = { path = "../../crates/agiworkforce-thread-store",    optional = true }
agiworkforce-model-provider  = { path = "../../crates/agiworkforce-model-provider",  optional = true }
agiworkforce-models-manager  = { path = "../../crates/agiworkforce-models-manager",  optional = true }
agiworkforce-agent-graph-store = { path = "../../crates/agiworkforce-agent-graph-store", optional = true }
agiworkforce-plugin          = { path = "../../crates/agiworkforce-plugin",          optional = true }
```

Under `[features]`, add:

```toml
[features]
default = []
full = [
  "agiworkforce-rollout-trace",
  "agiworkforce-core-plugins",
  "agiworkforce-core-skills",
  "agiworkforce-memories-read",
  "agiworkforce-memories-write",
  "agiworkforce-thread-store",
  "agiworkforce-model-provider",
  "agiworkforce-models-manager",
  "agiworkforce-agent-graph-store",
  "agiworkforce-plugin",
]
```

- [ ] **Step 3: cargo check apps/cli**

```bash
cd ~/Desktop/agiworkforce
cargo check -p agiworkforce-cli 2>&1 | head -30
cargo check -p agiworkforce-cli --features full 2>&1 | head -30
```

- [ ] **Step 4: Commit wiring**

```bash
git add apps/cli/Cargo.toml
git commit -m "feat(cli): wire new ported crates as optional deps under full feature flag"
```

---

## Task 9: Full workspace cargo check

- [ ] **Step 1: Run workspace check**

```bash
cd ~/Desktop/agiworkforce
cargo check --workspace 2>&1 | grep "^error" | head -50
```

- [ ] **Step 2: Fix any remaining errors**

Common patterns:

- `unresolved import agiworkforce_X` → add `agiworkforce-X = { path = "..." }` to that crate's Cargo.toml
- `no field X in struct AgiworkforceY` → the struct was renamed but a field kept old name; do targeted find/replace
- `edition.workspace not found` → script missed a field; manually set `edition = "2024"`

For each error, fix the specific Cargo.toml or .rs file. Do NOT run global sed again — targeted fixes only.

- [ ] **Step 3: Re-run until clean (or errors are feature-not-yet-implemented, not naming)**

```bash
cargo check --workspace 2>&1 | grep "^error\[" | wc -l
```

Target: 0 errors, or all remaining errors are `E0432`/`E0425` from genuinely unimplemented code (acceptable).

- [ ] **Step 4: Commit fixes**

```bash
cd ~/Desktop/agiworkforce
git add -u
git commit -m "fix(crates): resolve workspace cargo check errors from port batch 1-6"
```

---

## Task 10: Port reference/src TypeScript to apps/cli-ts

**Files:**

- Create: `apps/cli-ts/` (full directory)
- Create: `apps/cli-ts/package.json`
- Create: `apps/cli-ts/tsconfig.json`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Create apps/cli-ts directory and copy source**

```bash
mkdir -p ~/Desktop/agiworkforce/apps/cli-ts
cp -r ~/Desktop/reference/src ~/Desktop/agiworkforce/apps/cli-ts/src
echo "Copied $(find ~/Desktop/agiworkforce/apps/cli-ts/src -name '*.ts' -o -name '*.tsx' | wc -l) TypeScript files"
```

Expected output: `Copied 1884 TypeScript files`

- [ ] **Step 2: Rename claude→agiworkforce in all TypeScript files**

```bash
cd ~/Desktop/agiworkforce/apps/cli-ts
find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" \) \
    -print0 | xargs -0 LC_ALL=C sed -i '' \
        -e 's/CLAUDE_/AGIWORKFORCE_/g' \
        -e 's/CLAUDE/AGIWORKFORCE/g' \
        -e 's/Claude/Agiworkforce/g' \
        -e 's/claude_/agiworkforce_/g' \
        -e 's/claude-/agiworkforce-/g' \
        -e 's/"claude"/"agiworkforce"/g' \
        -e 's|\.claude|\.agiworkforce|g'
echo "Rename pass done"
```

- [ ] **Step 3: Rename claude\* files**

```bash
cd ~/Desktop/agiworkforce/apps/cli-ts/src
find . -name "claude*" | while read f; do
    newf=$(echo "$f" | sed 's/claude/agiworkforce/g')
    mv "$f" "$newf"
    echo "Renamed: $f → $newf"
done
```

- [ ] **Step 4: Check for reference/parent package.json to use as tsconfig base**

```bash
ls ~/Desktop/reference/*.json 2>/dev/null || ls ~/Desktop/reference/codex-cli/*.json 2>/dev/null | head -5
```

- [ ] **Step 5: Create package.json**

```bash
cat > ~/Desktop/agiworkforce/apps/cli-ts/package.json << 'EOF'
{
  "name": "@agiworkforce/cli-ts",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "agi-ts": "./dist/entrypoints/agiworkforce.js"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "ink": "^5.0.0",
    "react": "^18.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/node": "^20.0.0"
  }
}
EOF
```

- [ ] **Step 6: Create tsconfig.json**

```bash
cat > ~/Desktop/agiworkforce/apps/cli-ts/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
```

- [ ] **Step 7: Add to pnpm-workspace.yaml**

```bash
# Check current pnpm-workspace.yaml
cat ~/Desktop/agiworkforce/pnpm-workspace.yaml
```

Add `- 'apps/cli-ts'` to the packages list:

```bash
sed -i '' 's/packages:/packages:\n  - '"'"'apps\/cli-ts'"'"'/' ~/Desktop/agiworkforce/pnpm-workspace.yaml
# Verify:
cat ~/Desktop/agiworkforce/pnpm-workspace.yaml | grep cli-ts
```

- [ ] **Step 8: pnpm install**

```bash
cd ~/Desktop/agiworkforce
pnpm install 2>&1 | tail -5
```

- [ ] **Step 9: TypeScript typecheck**

```bash
cd ~/Desktop/agiworkforce/apps/cli-ts
pnpm typecheck 2>&1 | grep "^src/" | head -30
```

Errors are expected (missing imports, renamed types). Document count:

```bash
pnpm typecheck 2>&1 | grep "^src/" | wc -l
```

- [ ] **Step 10: Commit apps/cli-ts**

```bash
cd ~/Desktop/agiworkforce
git add apps/cli-ts pnpm-workspace.yaml
git commit -m "chore(cli-ts): port reference/src TypeScript — 1884 files, renamed claude→agiworkforce"
```

---

## Task 11: Update root Cargo.toml workspace member list (if needed)

The workspace uses `crates/*` glob so new crates are auto-discovered. Verify:

- [ ] **Step 1: Verify glob picks up new crates**

```bash
cd ~/Desktop/agiworkforce
cargo metadata --no-deps --format-version 1 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
pkgs = sorted(p['name'] for p in data['packages'])
print(f'Total workspace packages: {len(pkgs)}')
for p in pkgs:
    if 'agiworkforce' in p:
        print(' ', p)
" | head -60
```

- [ ] **Step 2: Final full workspace check**

```bash
cd ~/Desktop/agiworkforce
cargo check --workspace 2>&1 | grep -E "^error" | head -20
echo "Exit: $?"
```

- [ ] **Step 3: Commit final state**

```bash
cd ~/Desktop/agiworkforce
git add -u
git commit -m "chore: complete codex-rs port — 33 new crates + cli-ts TypeScript package"
```

---

## Dependency Port Order Summary

```
Batch 1 (no internal deps): rollout-trace, analytics, agent-identity,
         collaboration-mode-templates, device-key, install-context,
         test-binary-support, aws-auth, file-system, uds

Batch 2 (dep on batch 1 or existing): model-provider-info, memories-read,
         memories-write, response-debug-context, responses-api-proxy,
         cloud-tasks-mock-client

Batch 3 (dep on batch 2): model-provider, models-manager, thread-store,
         agent-graph-store

Batch 4 (dep on batch 3): core-skills → plugin → core-plugins

Batch 5 (dep on batch 3-4): app-server, core-api, codex-mcp,
         codex-backend-openapi-models, external-agent-migration,
         external-agent-sessions, tools, thread-manager-sample

Batch 6 (special deps): realtime-webrtc

TypeScript (independent): reference/src → apps/cli-ts
```

---

## Error Fix Reference

| Error                               | Fix                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `unresolved import agiworkforce_X`  | Add `agiworkforce-X = { path = "../../crates/agiworkforce-X" }` to Cargo.toml        |
| `edition.workspace = true`          | Change to `edition = "2024"`                                                         |
| `version.workspace = true`          | Change to `version = "0.1.0"`                                                        |
| `can't find crate for X`            | The dep X crate isn't ported yet; comment it out, add `// TODO: port agiworkforce-X` |
| `workspace = true` still present    | Re-run `expand-workspace-deps.py` on that Cargo.toml                                 |
| TS: `Cannot find module './claude'` | The file was renamed; update the import path to `./agiworkforce`                     |
