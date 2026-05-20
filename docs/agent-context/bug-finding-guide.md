# Bug-Finding Guide For Coding Agents

Status: Current
Owner: Platform + security
Last updated: 2026-05-20

## Workflow

1. Identify the surface or boundary from `repo-map.json`.
2. Check `known-flaws.md` before calling an issue new.
3. Check `risk-map.json` for required review focus and verification commands.
4. Search code with `rg`; avoid relying on stale plans.
5. Reproduce with the smallest command from `commands.json`.
6. Fix the narrowest owner area first; do not refactor unrelated surfaces.
7. Add or update tests near the owner area.
8. Update `known-flaws.md` when a known issue is fixed, reclassified, or duplicated.

## High-Signal Search Patterns

- Security randomness: `rg "Math\\.random|Date\\.now\\(\\).*id|nonce|token" apps packages services`
- Provider/model drift: `rg "gpt-|claude-|gemini-|sonnet|opus|haiku" apps packages services crates`
- Privacy boundary drift: `rg "privacy_mode|PrivacyMode|BYOK|Managed|Local" apps packages crates services`
- Supabase service role: `rg "SERVICE_ROLE|service_role|getServiceClient|createClient" apps services packages supabase`
- Unsafe rendering: `rg "dangerouslySetInnerHTML|srcDoc|Blob\\(|text/html|iframe" apps packages`
- Tool execution: `rg "Bash|Read|Write|Edit|apply_patch|shell|command" apps/cli apps/desktop crates packages`
- Generated files/artifacts: `rg "Artifact|GeneratedFile|ComputeSession|download|preview" apps packages crates`

## Do Not Trust Blindly

- Older launch plans under `docs/archive/`.
- Historical `docs/planning/` files unless a current doc cites them.
- Stale claims inside `AGENTS.md` or `CLAUDE.md` if they conflict with this folder.
- Root scratch files such as `app-*.md`, `final-*.png`, and `r6-*.md`; those are classification debt.
