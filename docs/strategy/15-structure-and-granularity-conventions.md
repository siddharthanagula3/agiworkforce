# Structure & Granularity Conventions

Status: Strategy analysis → graduate into `docs/engineering/` once adopted
Owner: Platform lead
Last updated: 2026-06-28
Extends: `docs/engineering/naming-conventions.md` (branding/file names) — this doc adds **deep folder/file granularity**.
Enforced by (target): `scripts/check-structure-conventions.mjs` (extend it — see §7)

You want AGI's surfaces to have the clean, deeply-modular structure of the best-organized agent codebases (folder-per-tool, one concern per file, co-located prompt + UI + logic, barrel exports, domain-grouped utils, isolated generated code). These are **organizational conventions** — we adopt the _patterns_, written in AGI's own names and idioms. This is the standard; we apply it to new code and refactor toward it as each surface's production plan touches a subsystem.

---

## 1. The seven principles (what makes a tree clean)

1. **One concern per file.** A file does one thing and is named for it. One migration per file, one tool per module, one hook per file. Soft cap ~300 lines; if it grows, split.
2. **Folder-per-feature.** Every tool, command, agent, and major UI feature is a _folder_, not a loose file — so everything it needs lives together.
3. **Co-locate by feature, not by file type.** A tool's logic, its `prompt`, its `UI`, its `constants`, its validators, and its `types` sit in the same folder. You should never hunt across `prompts/`, `ui/`, `logic/` to understand one tool.
4. **Barrels (`index.ts` / `mod.rs`).** Each folder exposes a single public surface; consumers import the folder, not deep paths.
5. **Domain-grouped `utils/`, no junk drawers.** Multi-file domains get a subfolder (`utils/bash/`, `utils/permissions/`); genuine cross-cutting one-offs stay flat (`utils/uuid.ts`). Never `helpers.ts`, `misc.ts`, or `common.ts` as a dumping ground.
6. **Centralize constants & prompts.** Magic numbers/strings live in `constants/`; tool/agent prompts live in a co-located `prompt.ts`/`prompt.rs`. No inline magic values.
7. **Isolate generated & vendored code.** Codegen under `types/generated/`; ported third-party under clearly attributed paths (per `PORTING-TRACKER.md`). Never hand-edit generated files.

---

## 2. The signature pattern: every tool is a folder

This is the highest-leverage change and the one your codebase is furthest from. A tool is a folder containing its logic, prompt, UI, constants, and validators.

**TS tools** (`packages/unified-chat`, web, desktop):

```
tools/<Name>Tool/
  <Name>Tool.ts      # logic — implements the Tool interface
  prompt.ts          # tool description / model-facing prompt
  UI.tsx             # result/preview rendering
  constants.ts       # limits, labels
  <helpers>.ts       # validation, parsing — one concern each
  types.ts           # tool-local types
  index.ts           # barrel: export the tool + public types
```

**Rust tools** (`apps/cli`, crates) — the target that replaces today's flat `tools/{bash,file_ops,git,web}.rs`:

```
features/exec/tools/
  mod.rs             # registry + re-exports
  tool.rs            # the Tool trait (lands with INC-1.2, from codex-rs Apache-2.0)
  bash/
    mod.rs           # BashTool: impl Tool
    prompt.rs
    security.rs      # command-safety classification
    path_validation.rs
    ui.rs
  file_read/
    mod.rs
    prompt.rs
    limits.rs
  file_edit/
    mod.rs
    prompt.rs
    diff.rs
  apply_patch/
    mod.rs
    prompt.rs
  ...
```

This dovetails exactly with the C1 "real Tool trait" increment (`11`/`10`): as each tool moves to implement the trait, it becomes its own folder with its prompt/validation/UI co-located. **Do the structural refactor and the trait migration in the same pass.**

---

## 3. The signature pattern: every command is a folder

Mirror the reference's command layout (your web app already has `features/chat/commands/`):

```
commands/<name>/
  <name>.tsx         # the command implementation (or .ts if no UI)
  index.ts           # barrel: { name, description, handler }
  validation.ts      # arg parsing/validation when non-trivial
```

A registry (`commands.ts`) imports the barrels. New slash commands never add loose files.

---

## 4. Canonical surface skeletons

**TS feature (web/desktop)** — your `apps/web/features/chat/` is already close; lock it as the template and tighten co-location:

```
features/<feature>/
  components/        # grouped by sub-feature, PascalCase .tsx
  hooks/             # one hook per file, use* naming, sub-grouped when many
  stores/            # state (zustand etc.)
  services/          # stateful subsystems, grouped by domain
  lib/               # pure feature-local helpers
  commands/          # folder-per-command (§3)
  types/             # or types.ts if small
  constants.ts
  index.ts           # public surface
  README.md          # what this feature owns
```

**Shared TS package** (`packages/<pkg>/src/`): same principles — `index.ts` barrel, domain subfolders, `types.ts`, co-located tests in `__tests__/`.

**Rust crate / CLI module**: `mod.rs` barrel, one-concern files, folder-per-tool/feature, `prompt.rs` co-located, domain submodules; reusable runtime → `crates/` only when a second consumer exists (existing rule).

---

## 5. Naming rules (additive to `naming-conventions.md`)

| Thing                          | Convention                       | Example                |
| ------------------------------ | -------------------------------- | ---------------------- |
| React component / class / .tsx | PascalCase                       | `PermissionDialog.tsx` |
| TS utility module              | camelCase                        | `tokenBudget.ts`       |
| Rust file / module             | snake_case                       | `path_validation.rs`   |
| React hook                     | `use` + PascalCase, one per file | `useToolPermission.ts` |
| Tool                           | `<Name>Tool` folder              | `WebFetchTool/`        |
| Command                        | lowercase folder + `index.ts`    | `commands/compact/`    |
| Co-located prompt              | `prompt.ts` / `prompt.rs`        | per tool/agent         |
| Feature constants              | `constants.ts`                   | per feature/tool       |
| Barrel                         | `index.ts` / `mod.rs`            | per folder             |
| Generated code                 | under `*/generated/`             | `types/generated/`     |
| One migration per file         | descriptive verb name            | `migrateXToY.ts`       |

Banned: `helpers.ts`, `misc.ts`, `stuff.ts`, `utils.ts` as a catch-all inside a feature (a domain `utils/` _folder_ is fine); files over ~500 lines without a split rationale; deep relative imports that bypass a barrel.

---

## 6. Current → target gap (grounded)

| Area                 | Today                                           | Target                                                              |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| CLI tools            | flat `tools/{bash,file_ops,dir_ops,git,web}.rs` | folder-per-tool with `mod.rs`/`prompt.rs`/validators (§2)           |
| CLI tool dispatch    | `match name` in `mod.rs`                        | `Tool` trait + registry (C1, INC-1.2)                               |
| Web chat feature     | foldered (good)                                 | tighten: barrels everywhere, folder-per-command, co-located prompts |
| Desktop tools (Rust) | grouped command files                           | folder-per-tool, co-located prompt/validation                       |
| Prompts              | partly inline                                   | co-located `prompt.ts`/`prompt.rs` per tool/agent                   |
| Constants            | some scattered                                  | centralized `constants/` + per-feature `constants.ts`               |

---

## 7. Enforcement (extend `check:structure-conventions`)

Make the convention mechanical, not aspirational. Add rules to `scripts/check-structure-conventions.mjs`:

1. **Tool-folder contract:** anything registered as a tool must be a folder containing at least `<Name>Tool.*` (or `mod.rs`) and `prompt.*`.
2. **Command-folder contract:** every command is a folder with an `index.*` barrel.
3. **No junk-drawer files:** fail on `helpers.ts`/`misc.ts`/`common.ts` inside `features/*` (allow a `utils/` _folder_).
4. **Barrel presence:** every `features/*` and tool folder exports an `index.ts`/`mod.rs`.
5. **File-size soft warning:** warn > 300 lines, error > 800 (with an allowlist for known large files).
6. **Generated isolation:** fail on hand-edits under `*/generated/` (checksum or header marker).

Wire it into the existing `check:llm-operability` aggregate (already runs in CI) so it gates every PR — same path as the INC-0.1 license gate.

---

## 8. How this rolls out (no big-bang)

1. **Lock this doc** (graduate to `docs/engineering/`) and the enforcement rules (§7).
2. **All new code follows it** immediately.
3. **Run the safe step-1 move:** `scripts/migrate-structure.mjs` converts flat leaf modules to folders via import-transparent barrel resolution (`web.rs`→`web/mod.rs`, `web.ts`→`web/index.ts`) — behavior-preserving and build-green. Dry-run by default; `--apply` uses `git mv`. Must run in a git+build environment; verify with the target's build command, then commit.
4. **Refactor opportunistically:** the higher-value internal split (co-locating `prompt`/validation/`UI` inside each folder) rides the C1 Tool-trait increment (INC-1.2) and each WEB-/MOB-/DESK- increment as it touches a subsystem.
5. **Track structural debt** as increments in `PORTING-TRACKER.md` rather than a single risky sweep.

The result: AGI reaches the reference's level of detail and cleanliness _as it ships_, with the convention enforced in CI so it never regresses — rather than a one-time reorg that rots.
