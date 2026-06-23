# Production-Hardened Release Plan

Status: Current
Owner: Platform lead
Last updated: 2026-06-06

## Summary

This plan locks the demo-readiness order after the June 6 planning reset.
The first implementation priority is the Website landing page, then the
production-hardening loop across Web, Desktop, Mobile, CLI, Chrome, and VS Code.

The landing page must sell AGI as a serious multi-surface AI workspace without
inflated counts, public managed-cloud claims, or public Web BYOK claims. Provider
choice should appear as a professional multi-provider banner, not as a fragile
numeric proof point.

## Immediate Landing Page Direction

- Use a ChatGPT-familiar neutral default theme with AGI-owned tokens.
- Do not hardcode component colors. Raw color values belong only in the central
  marketing token block.
- Remove brittle count-led claims such as "10+ providers" and "6 platforms" from
  the homepage hero path.
- Add a horizontally scrolling provider banner using existing provider assets.
- Keep the main promise simple: one AI workspace for chat, code, research, files,
  projects, artifacts, tools, connectors, memory, and automation.
- Keep Web copy honest: Web is the demo/account/chat surface. BYOK belongs to
  Desktop and developer surfaces. Managed cloud remains invite gated.
- Use real product previews where available. Do not use generic abstract AI art.

## Reference Workflow

- Build a screenshot index before broad visual work.
- Rename generic reference screenshots in a dedicated file-management wave only.
- Keep a rename map in `tasks/release-hardening/README.md` or a child ledger.
- Use local references frequently:
  - `/Users/siddhartha/Desktop/reference/ui/web`
  - `/Users/siddhartha/Desktop/reference/ui/desktop`
  - `/Users/siddhartha/Desktop/claude_reference`
  - `/Users/siddhartha/Desktop/reference`
- Use ChatGPT references for neutral spacing and familiar composer layout.
- Use Claude references for artifacts, inline tool traces, skills, plugins, and
  connector presentation.
- Use Perplexity references for model picker and source/connectors menu patterns.
- Do not copy proprietary code or protected brand assets.

## Parallel Agent Waves

Each agent must read `AGENTS.md`, the nearest path-scoped `AGENTS.md`, this plan,
and its lane ledger before editing. Each lane writes a per-agent ledger first.
The lead integrator consolidates `CHANGELOG.md` after each wave to avoid write
conflicts.

| Lane | Responsibility                                                |
| ---- | ------------------------------------------------------------- |
| A0   | Lead integrator, conflicts, changelog, final verification     |
| A1   | Billing, credits, usage ledger, Stripe, quota semantics       |
| A2   | Managed cloud gates, invite/waitlist, private beta boundaries |
| A3   | Security, auth, ownership, trust boundaries, secret handling  |
| A4   | Connectors, MCP, apps, OAuth, tool permissions                |
| A5   | Skills, plugins, agent harness, activation rules              |
| A6   | Unified Web/Desktop chat, settings, shared UI                 |
| A7   | Artifacts, previews, publishing, sandbox boundaries           |
| A8   | Desktop native host, local files, browser/computer approvals  |
| A9   | CLI, AGI Code, terminal UI, hooks, permissions                |
| A10  | QA, visual review, release gates, CI status                   |

## Required Ledger Format

Every lane ledger must include:

- Lane and owner role.
- Files read.
- Files changed.
- References used.
- Product claims added, removed, or changed.
- Checks run.
- Screenshots or visual QA notes.
- Unresolved risks and blockers.

## Verification Baseline

Use the smallest relevant check first, then run the surface checks from
`docs/agent-context/commands.json`.

Landing page baseline:

```bash
pnpm --filter @agiworkforce/web typecheck
pnpm --filter @agiworkforce/web test
pnpm --filter @agiworkforce/web build
pnpm check:agent-context
pnpm check:repo-organization
pnpm check:llm-operability
git diff --check
```

Manual visual QA must cover desktop, tablet, and mobile widths; header nav;
primary and secondary CTAs; provider marquee; no text clipping; focus states;
reduced-motion behavior; console and network errors.

## Current Caveats

- GitHub hosted CI is currently blocked by account quota or billing status, not by
  workflow YAML evidence.
- The working tree may already include CLI, Desktop, and Web changes. Preserve
  user or prior-agent changes and do not reset them.
- Managed cloud is not public GA. Do not imply broad hosted capacity is available.
- Web does not expose BYOK. Do not market Web BYOK as a current user path.
