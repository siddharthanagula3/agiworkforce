# opencode Adapter

Status: Current
Owner role: Platform lead
Last updated: 2026-05-21
Kind: tool adapter

## Purpose

`.opencode/` stores the opencode project adapter: config, prompts, commands, plugin hooks, and local tool wrappers. It must point to the same canonical repo context used by other coding agents.

## Tracked Policy

- `.opencode/opencode.json` is the only tracked opencode config entry point.
- `.opencode/instructions/INSTRUCTIONS.md` must stay a thin adapter that points at `AGENTS.md`.
- Every `{file:...}` prompt or command reference in `.opencode/opencode.json` must resolve to a tracked file.
- Root `opencode.json` is retired and must not return.

## Verification

- `pnpm check:agent-context`
- `pnpm check:workspace-scripts`
