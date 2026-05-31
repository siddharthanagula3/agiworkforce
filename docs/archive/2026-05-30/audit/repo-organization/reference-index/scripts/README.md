# reference-index/scripts/

Tooling that operates on the contents of `reference-index/`.

| Script                  | What it does                                                                                                                                                                                                                                                                                                                                               | Status             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `validate-ownership.ts` | Loads every `reference-index/*-ownership.json` (or a single one when invoked as `… mobile`) and validates against `reference-index/ownership-schema.json`. Plus semantic checks: every file lives under `scope`, no file has two owners, `--strict` rejects the `unassigned` bucket. Returns exit 0 on success, 1 on validation failure, 2 on usage error. | Phase 8 prototype. |

## Usage

```bash
# Validate every ownership map.
pnpm tsx reference-index/scripts/validate-ownership.ts

# Validate one surface.
pnpm tsx reference-index/scripts/validate-ownership.ts mobile

# Strict mode (rejects `unassigned`).
pnpm tsx reference-index/scripts/validate-ownership.ts --strict
```

The script intentionally has no external dependencies — it ships its
own ~80-line JSON Schema subset checker so it can run before `pnpm
install` finishes (or in CI without installing the workspace).
