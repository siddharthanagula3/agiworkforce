# apps/mobile/src/features/skills

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile skills catalog access, installed-skill state, and active skill selection.

## Rules

- Import skills catalog I/O from `@/src/features/skills/service`.
- Import installed-skill state from `@/src/features/skills/store`.
- Do not import `@agiworkforce/skills` at runtime in React Native; keep shared package references type-only.
- Keep skill bodies lazy-loaded and avoid bundling file-system dependent skill loaders into Mobile.
