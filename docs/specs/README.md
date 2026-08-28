# docs/specs

One directory per substantial feature or change: `NNN-feature-name/`.

- `spec.md` — what, why, requirements, acceptance criteria, non-goals
- `plan.md` — approach, affected surfaces, migrations, rollout, risks
- `tasks.md` — the executable work

Add `research.md`, `data-model.md` or `contracts/` only when the work needs
them. A cross-platform feature gets one spec, not one per surface. When the work
ships, the spec goes away — git keeps it.
