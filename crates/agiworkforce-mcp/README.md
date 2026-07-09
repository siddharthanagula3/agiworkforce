# agiworkforce-mcp

Status: Current
Owner role: Rust platform + CLI lead
Last updated: 2026-07-09
Kind: rust-crate
Criticality: high

## Purpose

Shared Model Context Protocol (MCP) client for AGI's Rust surfaces (restructure Wave 5 stage d). Extracted from the CLI's MCP implementation so the CLI and (via stage d2) the desktop share one transport/JSON-RPC/OAuth client instead of maintaining parallel ones.

## Consumers

`apps/cli` (adopted via the `McpConnection` facade over `McpClient`). `apps/desktop/src-tauri` is the planned second consumer (stage d2, swapping its transport/client internals behind unchanged manager/registry interfaces).

## Public API / Exports

Rust library `agiworkforce_mcp`: `McpClient` (`connect`, typed `list_tools`/`call_tool`, `request`, `notifications`, `shutdown`), `TransportConfig` (Stdio/SSE/streamable-HTTP), `McpTimeouts`, `ClientHooks`, and the `TokenStore`/`ElicitationHandler`/`BrowserAuthorizer` traits. MCP wire types are reused from `agiworkforce_protocol::mcp` (never redefined).

## What Belongs Here

- JSON-RPC framing + id-correlation + timeouts + stale-request cleanup.
- The 3 transports and reconnect/session-stickiness handling.
- OAuth (RFC 9728/8414/7591 discovery + registration) with in-crate S256 PKCE, behind `TokenStore`.

## What Does Not Belong Here

- Token persistence implementation (CLI file store / desktop encrypted store implement `TokenStore`).
- Elicitation UI (`tui_handler`), config-file/`.mcp.json` loading, result namespacing.
- The MCP _server_ and extension/connector management.

## Key Files

- `src/{client,config,hooks,elicitation,error,jsonrpc,notification}.rs`, `src/transport/{sse,http}.rs`, `src/oauth/{flow,pkce}.rs`
- `tests/support/` (scripted stdio + axum SSE/HTTP sim harness — the frozen contract for the desktop d2 swap)
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-mcp`
- `cargo test -p agiworkforce-mcp`

## Environment / Secrets

No secrets belong in this crate. OAuth tokens flow through the caller-supplied `TokenStore`; the crate holds them only in memory during a session.

## Security, Privacy, Data Boundaries

Security review required for OAuth flow, PKCE, token handling, and transport auth. `reqwest` pinned at 0.12 (CLI TLS stance).

## Tests Required For Changes

Extend the sim harness (initialize/versions, tools list+call, session stickiness, OAuth 401→registration→retry, reconnect cap, stale timeout, oversized frame) for any transport or OAuth change.

## Release / Deployment Notes

Reconnect/health and OAuth changes are behavior-observable; the desktop d2 swap should add SSE-channel-delivery + SSE-elicitation sim cases (verbatim-ported but not yet exercised).

## Known Caveats

Reconnect re-initializes with a reset `request_id`; ids are opaque correlation tokens (non-observable). The SSE channel-drain + SSE-elicitation paths are ported but not covered by a sim case yet — d2 owns adding them.

## CODEOWNERS

Primary: Rust platform. Secondary: CLI lead.
