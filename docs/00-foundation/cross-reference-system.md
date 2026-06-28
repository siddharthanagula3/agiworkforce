# AGI Cross-Reference System

Status: Current
Owner: Platform lead
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: Anyone authoring or validating AGI documentation
Layer: docs/00-foundation
Document ID: AGI-DOC-0007
Related: [documentation-constitution.md](documentation-constitution.md), [documentation-standards.md](documentation-standards.md), [documentation-compiler.md](documentation-compiler.md), [requirement-id-system.md](requirement-id-system.md)

---

The cross-reference system is how AGI documentation stays internally consistent and free of duplication ([documentation-constitution.md](documentation-constitution.md) Article III).

## 1. Single-owner principle

Each concept, term, requirement, and decision has exactly **one owning document**:

| Concept type            | Owning document                                                        | Reference by          |
| ----------------------- | ---------------------------------------------------------------------- | --------------------- |
| Term / vocabulary       | [canonical-glossary.md](canonical-glossary.md)                         | term name             |
| Requirement / invariant | [requirement-id-system.md](requirement-id-system.md)                   | `AGI-<DOMAIN>-<NNNN>` |
| Architecture statement  | [architecture-manifest.md](architecture-manifest.md)                   | section link          |
| Decision                | [adr-index.md](adr-index.md) / `docs/decisions/`                       | ADR/decision ID       |
| Doc status              | [documentation-status-inventory.md](documentation-status-inventory.md) | doc path              |
| Document                | front-matter `Document ID`                                             | `AGI-DOC-<NNNN>`      |

Any other document **references** the owner; it must not restate the definition. If two documents would define the same thing, one is wrong and must be reduced to a reference.

## 2. Link conventions

- **Doc-to-doc:** relative Markdown links (`[title](relative-path.md)`), section anchors where useful.
- **Requirement references:** inline ID, e.g., "(`AGI-TRUST-0001`)". The ID resolves in [requirement-id-system.md](requirement-id-system.md).
- **Term references:** use the exact glossary term; on first significant use in a doc, link to the glossary.
- **Source references:** repo-relative path in backticks (e.g., `packages/types/src/models.json`).

## 3. Required "Related" front-matter

Every document lists its key related documents in the `Related:` front-matter field. This forms the documentation dependency graph and lets agents traverse the corpus.

## 4. Foundation dependency graph

```
README ──▶ constitution ──▶ standards ──▶ cross-reference ──▶ compiler
   │            │                │                                │
   ▼            ▼                ▼                                ▼
glossary ◀── requirement-id ──▶ architecture-manifest        master-index
   │                                    │                        │
   └──────────────▶ adr-index ◀─────────┘                        ▼
                          │                          status-inventory ──▶ migration-plan
```

Read top-down; every arrow is a "depends on / references" edge. The compiler ([documentation-compiler.md](documentation-compiler.md)) validates that these references resolve.

## 5. Consistency rules

- A term used in any doc must exist in the glossary (or be added there).
- A requirement cited in any doc must exist in the requirement registry.
- A `Status` claim must match [documentation-status-inventory.md](documentation-status-inventory.md).
- Conflicting statements across docs are resolved in favor of the **owning** document and, ultimately, the **implementation** ([documentation-constitution.md](documentation-constitution.md) Article I).
