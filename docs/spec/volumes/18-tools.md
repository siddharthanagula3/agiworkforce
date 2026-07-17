# Volume 18 — Tools

Status: Canonical (depth expansion of `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 18)
Authority: this manual · `docs/strategy/15-structure-and-granularity-conventions.md` §2 (folder-per-tool) · `docs/strategy/09-reference-codebases.md` (Tool trait, C1) · `docs/strategy/10-oss-corpus-port-plan.md` §2 (codex-rs Tool donor) · `apps/cli/src/features/exec/tools/` · `crates/agiworkforce-execpolicy`

## Philosophy & Cloud/Local stance

A tool is the agent's hands. Every tool is a **folder implementing the `Tool` trait/interface** — logic, co-located prompt, validation, UI, and constants together (`docs/strategy/15` §2). It is not a data record and not a `match name` arm: it is a behavioral contract with fail-closed safety flags (`is_read_only`, `is_concurrency_safe`, `is_destructive`, `check_permissions`, `validate_input`). The single highest-leverage structural change in the runtime (gap C1, `docs/strategy/09`) is introducing this trait so per-tool behavior has a home; today the CLI dispatches via a central match, which the trait migration replaces folder by folder.

The trust boundary decides which tools exist and how hard the gate is, never whether safety applies. In Local Mode, only local-capable tools are available (filesystem, git, terminal, local SQL) and outbound tools respect the SSRF allowlist; nothing reaches a hosted endpoint silently. In BYOK/Managed, network tools (REST/GraphQL, SaaS connectors, computer/browser use) are available but every destructive or boundary-crossing call passes a human-in-the-loop approval. Permissions are **layered and fail-closed**: Zod/serde parse → `validate_input` → pre-tool hooks → `allow|deny|ask` with typed reasons → handler chain, where unknown safety classification means unsafe and **deny always beats allow**.

## Binding rules

1. Every tool is a folder implementing the `Tool` trait with explicit `is_read_only`/`is_concurrency_safe`/`is_destructive`/`check_permissions`/`validate_input`; co-locate prompt, validation, and UI (`docs/strategy/15` §2).
2. Unknown safety classification defaults to unsafe; `buildTool()`/registry fills fail-closed defaults.
3. The permission pipeline is layered and fail-closed; deny beats allow; destructive/boundary-crossing tools require approval.
4. Validate every tool input (serde/Zod) before execution — no unvalidated external input reaches a side effect (Vol 38).
5. Outbound tools (web fetch, REST, SSH, SaaS) pass the SSRF allowlist; BYOK base URLs are guarded (`crates/agiworkforce-network-proxy`).
6. Tools never mutate the API-bound input object; backfill observable input on a clone so prompt-cache bytes stay stable (`docs/strategy/09`).
7. Wire `agiworkforce-execpolicy`/`PolicyEngine` into `check_permissions` (C3) — the engine exists; use it instead of the coarse sandbox enum only.
8. Concurrency-safe read-only tools may dispatch mid-stream and run concurrently (bounded); everything else runs serially with queued context modifiers (`docs/strategy/09`).

## Repository map

- CLI tools (today flat; the C1/§15 refactor target): `apps/cli/src/features/exec/tools/{bash,file_ops,dir_ops,git,web,common,task_registry}.rs`, registry/dispatch in `mod.rs`. Target: `bash/`, `file_read/`, `file_edit/`, `apply_patch/` folders each with `mod.rs` + `prompt.rs` + validators (`docs/strategy/15` §2).
- Patch/edit engine: `crates/agiworkforce-apply-patch/` (parser + scenario fixtures).
- Policy + sandbox (wire into permissions): `crates/agiworkforce-execpolicy/` (`decision.rs`, `rule.rs`, `parser.rs`, `execpolicycheck.rs`), `crates/sandbox-policy/src/lib.rs`, `apps/cli/src/platform/policy/`.
- Network/SSRF guard: `crates/agiworkforce-network-proxy/` (`network_policy.rs`, `upstream.rs`, `proxy.rs`).
- Permission/dynamic-tool protocol: `crates/agiworkforce-protocol/src/{request_permissions,dynamic_tools,plan_tool,parse_command}.rs`.
- TS tool/permission surfaces: `packages/client/desktop-command-client/src/toolConfirmation.ts`, `packages/contracts/types/src/tool-display.ts`, `packages/client/desktop-command-client/src/{fileOps,database,email,calendar,messaging,codeEditing,lsp}.ts`; connectors (Vol 20) sit on top of this layer.

## Competitor notes

Claude Code's `Tool` interface is a ~40-method behavioral contract (concurrency/read-only/destructive flags, `checkPermissions`, `validateInput`, render, per-tool disk-spill, `shouldDefer`) — the reference AGI adapts in spirit (`docs/strategy/09`). codex-rs (Apache-2.0) is the **license-clean Rust donor**: `tools/src/tool_executor.rs` (`tool_name`/`spec`/`exposure`/`supports_parallel_tool_calls`/`handle`) and `core/src/tools/orchestrator.rs` (approval→sandbox→attempt→escalated retry) are near-drop-in for C1/C3 (`docs/strategy/10` §2). ChatGPT/Codex ship the broad tool catalog (terminal, computer use, GitHub/Slack/Linear, browser) AGI targets; AGI's divergence is the **fail-closed, trust-partitioned permission layer with a real OS sandbox** (a differentiator — most OSS agents ship no sandbox, `docs/strategy/10` §2). `docs/strategy/01`/`02` track catalog parity.

## Checklists

### Tool trait & structure (C1 / §15)

- [ ] Tool is a folder with `mod.rs`/`<Name>Tool.*` + `prompt.*` + validators + UI co-located.
- [ ] Implements `is_read_only`/`is_concurrency_safe`/`is_destructive`/`check_permissions`/`validate_input`.
- [ ] Registered via the trait registry, not a central `match name` arm.
- [ ] `check:structure-conventions` passes the tool-folder + barrel contract.

### Permission pipeline (fail-closed)

- [ ] Input parsed (serde/Zod) → validated → pre-tool hooks → `allow|deny|ask` (typed reasons) → handler.
- [ ] Unknown safety = unsafe; deny beats allow.
- [ ] `execpolicy`/`PolicyEngine` wired into `check_permissions` (C3), not just the coarse enum.
- [ ] Destructive/boundary-crossing tools require human-in-the-loop approval; consent is recorded.

### Safety & execution

- [ ] Concurrency-safe read-only tools dispatch mid-stream, bounded; others serial with queued context modifiers.
- [ ] Per-tool result-size disk-spill threshold set; Read-class tools avoid a Read→pointer→Read loop.
- [ ] Tools backfill observable input on a clone; API-bound object stays byte-stable.
- [ ] Interrupt/stop cancels in-flight tool execution and records interrupted state (Vol 24).

### Network & filesystem tools

- [ ] Web/REST/GraphQL/SSH outbound passes the SSRF allowlist; BYOK base URL guarded.
- [ ] Filesystem tools confine to permitted roots (absolute-path normalization); no escape via `..`.
- [ ] Local-only tools are unavailable to a hosted call without the explicit fork.

### Per-tool families

- [ ] terminal/bash: command-safety classifier runs (speculative, racing the approval dialog).
- [ ] git/docker: destructive ops (force-push, prune, rm) flagged destructive + gated.
- [ ] SQL: read vs write separated; writes destructive + gated; parameterized only.
- [ ] browser/computer use: every action is approval-gated with a visible target; injection defenses on page content.
- [ ] SaaS tools (email/calendar/Slack/GitHub/Jira/Notion/Drive/OneDrive/Dropbox): see Vol 20 connector contract (explicit permission + context label).

### Trust-boundary tests

- [ ] A Local session cannot invoke a hosted/network tool without the fork (asserted by test).
- [ ] Denied permission cannot be overridden by a later allow rule.

## Definition of Done

Tools implement the `Tool` trait as folders with co-located prompt/validation/UI; the layered fail-closed permission pipeline (with `execpolicy` wired in) gates every call; inputs are validated and outbound calls SSRF-guarded; destructive/boundary-crossing actions are approval-gated; and trust-boundary tests prove Local cannot silently reach hosted/network tools. Verified per Operating Law 4 (`cargo` + targeted + trust-boundary + structure-convention checks).

## Anti-patterns

- A tool as a `match name` arm or a data struct instead of a trait folder.
- Fail-open defaults (unknown safety treated as safe).
- Allow overriding a deny, or skipping approval on destructive ops.
- Unvalidated tool input reaching a side effect.
- Outbound calls bypassing the SSRF allowlist; honoring an unguarded BYOK base URL.
- Mutating the API-bound input object (breaks prompt caching = real money).
