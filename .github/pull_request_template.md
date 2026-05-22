# Pull Request

Use a specific template when it fits better:

- [Product or surface change](?template=product-surface.md)
- [Refactor or move](?template=refactor-move.md)
- [Security or privacy](?template=security-privacy.md)
- [Docs or research](?template=docs-research.md)
- [Release or infrastructure](?template=release-infra.md)

## Summary

-

## Owned Paths

-

## Risk Classification

- [ ] Low: localized code/docs, no user-visible behavior or trust-boundary change.
- [ ] Medium: user-visible behavior, shared package, migration, or cross-surface contract.
- [ ] High: auth, billing, secrets, local/BYOK/managed routing, file system, shell execution, browser/native messaging, generated files, migrations, or release infrastructure.

## Required Context Checked

- [ ] `AGENTS.md`
- [ ] `docs/agent-context/repo-map.json`
- [ ] `docs/agent-context/risk-map.json`
- [ ] `docs/agent-context/known-flaws.md`
- [ ] Relevant owner README(s)

## Verification

- [ ] Targeted check:
- [ ] `pnpm check:llm-operability` when repo/docs/agent context changed.
- [ ] Broader check, if needed:

## Review Routing

- Primary owner:
- Secondary owner, if high-risk:

## Agent Disclosure

- [ ] Human-authored.
- [ ] Agent-assisted. Agent/tool:
- [ ] Agent-generated first draft. Human reviewer:
