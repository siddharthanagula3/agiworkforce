# Bug-Finding Guide For Coding Agents

Status: Current
Owner: Platform + security
Last updated: 2026-11-11

## Workflow

1. Identify the surface or boundary from `repo-map.json`.
2. Check `audit/registers/known-flaws.md` before calling an issue new.
3. Check `risk-map.json` for required review focus and verification commands.
4. Search code with `rg`; avoid relying on stale plans.
5. Reproduce with the smallest command from `commands.json`.
6. Fix the narrowest owner area first; do not refactor unrelated surfaces.
7. Add or update tests near the owner area.
8. Update `audit/registers/known-flaws.md` when a known issue is fixed, reclassified, or duplicated.

## High-Signal Search Patterns

- Full AI/LLM failure taxonomy: `docs/agent-context/llm-failure-taxonomy.json`
- Staged LLM-failure guard: `pnpm check:llm-failures:staged`
- Strict taxonomy guard: `pnpm check:llm-failures:strict`
- Security randomness: `rg "Math\\.random|Date\\.now\\(\\).*id|nonce|token" apps packages services`
- Provider/model drift: `rg "gpt-|claude-|gemini-|sonnet|opus|haiku" apps packages services crates`
- Privacy boundary drift: `rg "privacy_mode|PrivacyMode|BYOK|Managed|Local" apps packages crates services`
- Cloud database credential: `rg "AGI_DATABASE_URL|NEON_DATABASE_URL|DATABASE_URL" apps services packages scripts`
- Unsafe rendering: `rg "dangerouslySetInnerHTML|srcDoc|Blob\\(|text/html|iframe" apps packages`
- Tool execution: `rg "Bash|Read|Write|Edit|apply_patch|shell|command" apps/cli apps/desktop crates packages`
- Generated files/artifacts: `rg "Artifact|GeneratedFile|ComputeSession|download|preview" apps packages crates`

## Do Not Trust Blindly

- Historical planning files unless a current doc cites them.
- Any prose that disagrees with code, schemas, guards or tests: `AGENTS.md` section 2 ranks them, and the code wins.
