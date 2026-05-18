# CLI Source Shape — Phase 6 Layer Map

Target architecture for `apps/cli/src/`. Rust-idiomatic, NOT forced into frontend folder shape.

## Layer map

```
apps/cli/src/
├── lib.rs            # crate entry, pub mod declarations, Cli parser, run()
├── main.rs           # binary entry (8 lines)
│
├── core/             # [PLANNED] session state, REPL state, hooks dispatch, command registry
│   │                 # Currently declared at top-level: errors, context, permissions,
│   │                 # compaction, message_queue, agent_events, cli_options, command_registry
│   └── agent/        # ACTIVE — agent executor, chat, history, prompt, tools
│
├── features/
│   ├── exec/         # PLACEHOLDER — one-shot exec, apply_patch, notebook_edit, review,
│   │                 #   tool_search, runtime/ (session_control, tool_catalog)
│   ├── repl/         # PLACEHOLDER — repl/ (dialogs, registry, slash_commands), voice, sdk_io/
│   ├── session/      # PLACEHOLDER — memory, skills, agents, subagent, teams, onboarding,
│   │                 #   init, ecosystem, a2a, a2a_ws
│   ├── mcp/          # PLACEHOLDER — mcp/ migrates here after Sprint B stabilises
│   ├── hooks/        # PLACEHOLDER — hooks.rs (19 canonical events) migrates here (next pilot)
│   ├── plugins/      # PLACEHOLDER — plugins.rs (5 manifest paths) migrates here
│   ├── plan/         # PLACEHOLDER → PILOT — plan_mode.rs migrates here (Step 4)
│   ├── tui/          # PLACEHOLDER — tui/ (~100K LOC) migrates here last; EXCLUDED from pilot
│   └── providers/    # PLACEHOLDER — provider.rs, auth*, oauth*, models/, routing/
│
├── platform/         # PLACEHOLDER — OS abstractions, terminal, sandbox/execpolicy bridges,
│   │                 #   daemon, lsp/, output, design_system, markdown, safety/, policy/
│   │                 # Currently declared at top-level: sandbox, exec_policy, shell_snapshot,
│   │                 # powershell_tool, daemon, app_server, markdown, output, design_system
│   ├── mcp/          # [already at crate::mcp — 3 transports + OAuth]
│   ├── policy/       # [already at crate::policy — macOS/Linux/Windows sandbox policy]
│   └── safety/       # [already at crate::safety — approval, dangerous_commands]
│
└── data/             # PLACEHOLDER — config/sessions on disk, persistence, sync
                      # Currently declared at top-level: config, sessions, conversations,
                      # cost_ledger, model_catalog, models_cache, tier_cache,
                      # project_registry, project_scope, sync, cloud
```

## Migration rules

1. When moving a file `foo.rs` → `features/plan/foo.rs`:
   - `git mv apps/cli/src/foo.rs apps/cli/src/features/plan/foo.rs`
   - Add `pub mod foo;` to `apps/cli/src/features/plan/mod.rs`
   - Add re-export at old path in `lib.rs`: `pub use features::plan::foo as plan_mode;`
     (OR update all callers to use `crate::features::plan::foo`)
   - Run `cargo check -p agiworkforce-cli` — must pass before committing
2. Never rename the crate (`agiworkforce-cli` in Cargo.toml stays).
3. Never change external subcommand names or the `cargo run -p agiworkforce-cli` interface.
4. Each move is its own commit: `refactor(cli): move plan_mode → features/plan`.

## Pre-existing baseline (2026-05-18)

- cargo check: PASS
- cargo clippy --lib -D warnings -D unsafe-code: PASS
- cargo test --lib: 1331 pass / 6 fail (pre-existing, model catalog data gaps)
- Files: 289 .rs, ~155K LOC
