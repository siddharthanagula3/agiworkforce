# Per-File Audit Ledger

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

This is the focused file-level audit ledger for Claude/OpenAI application parity work. The JSONL source is `per-file-audit-ledger.jsonl`.

## Scope

- CLI engine files under `apps/cli/src`.
- Shared Rust engine crates under `crates`.
- Shared contracts/runtime/provider/MCP/service paths needed by CLI and future Desktop/Web/Mobile reuse.

## Counts By Surface

| Surface             | Files |
| ------------------- | ----: |
| `cli`               |   548 |
| `mcp-connectors`    |     8 |
| `provider-adapters` |    88 |
| `rust-engine`       |   198 |
| `services`          |    99 |
| `shared-runtime`    |    49 |
| `shared-types`      |    63 |
| `unified-chat`      |   129 |

## Counts By Risk Tag

| Risk Tag               | Files |
| ---------------------- | ----: |
| `provider-boundary`    |   103 |
| `cloud-boundary`       |    99 |
| `tool-execution`       |    57 |
| `permission-boundary`  |    37 |
| `mcp-boundary`         |    36 |
| `streaming-protocol`   |    20 |
| `agent-hook-boundary`  |    15 |
| `auth-boundary`        |    15 |
| `sandbox-boundary`     |     8 |
| `sync-boundary`        |     8 |
| `memory-boundary`      |     4 |
| `commercial-boundary`  |     2 |
| `data-boundary`        |     2 |
| `shell-execution`      |     2 |
| `subagent-boundary`    |     2 |
| `filesystem-boundary`  |     1 |
| `multi-agent-boundary` |     1 |

## Row Contract

Each JSONL row includes `path`, `surface`, `owner_lane`, `language`, `file_kind`, `loc`, `risk_tags`, `parity_relevance`, `audit_status`, and evidence placeholders. Agents should update rows from `not-started` to `reviewed` only after reading the full file, checking callers/callees where relevant, and recording verification.
