# Cursor Adapter

Status: Current
Owner role: Platform lead + security/privacy lead
Last updated: 2026-05-21
Kind: executable tool adapter

## Purpose

`.cursor/` stores Cursor hook wiring used by local agent workflows. These hooks are executable code, so treat changes as security-sensitive.

## Tracked Policy

- Track only reviewed hook adapters and hook configuration.
- Do not add hooks that read secrets, write outside the repo, or run network calls without explicit security review.
- Durable repo instructions belong in `AGENTS.md` and `docs/agent-context/`, not hook comments.

## Verification

- `pnpm check:hooks`
- `pnpm check:agent-context`
- Security/privacy review for hook behavior changes.
