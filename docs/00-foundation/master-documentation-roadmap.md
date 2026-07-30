# The AGI Master Documentation Roadmap

Version: 1.0 (release candidate — conditional/tiered freeze; see §Freeze)
Status: Current
Owner: Founder + platform lead
Last updated: 2026-06-27
Last verified against implementation: 2026-06-25
Audience: Documentation engineers, AI documentation-generation agents, and the founder/platform lead who approves volumes
Layer: docs/00-foundation
Document ID: AGI-DOC-0016
Authority: Canonical documentation-generation roadmap. Every future engineering document for the AGI Platform originates from this roadmap; nothing is generated outside it. It inherits from the Documentation Constitution (AGI-DOC-0002), Platform Constitution (AGI-DOC-0013), and Architecture Constitution (AGI-DOC-0015), and integrates with the requirement system (AGI-DOC-0005), cross-reference system (AGI-DOC-0007), documentation compiler (AGI-DOC-0008), ADR index (AGI-DOC-0010), and Owner Decision Register (AGI-DOC-0014). It governs how documentation is generated; it does NOT itself generate documentation.
Related: [documentation-constitution.md](documentation-constitution.md), [documentation-standards.md](documentation-standards.md), [cross-reference-system.md](cross-reference-system.md), [documentation-compiler.md](documentation-compiler.md), [master-documentation-index.md](master-documentation-index.md), [documentation-migration-plan.md](documentation-migration-plan.md), [platform-constitution.md](platform-constitution.md), [architecture-constitution.md](architecture-constitution.md), [owner-decision-register.md](owner-decision-register.md), [requirement-id-system.md](requirement-id-system.md), [adr-index.md](adr-index.md)

---

## Preamble

This is the **Master Documentation Roadmap** — the canonical generation system for every future engineering document of the AGI Platform. It is designed to govern a 20,000–30,000-page knowledge base across a decade of evolution **without duplication, contradiction, orphaned documents, terminology drift, or architectural drift**. It is not documentation; it is the compiler that produces documentation deterministically.

**Authority & inheritance.** This roadmap inherits from three authorities and never restates them: the **[Documentation Constitution](documentation-constitution.md)** (`AGI-DOC-0002`, how documents are governed), the **[Platform Constitution](platform-constitution.md)** (`AGI-DOC-0013`, what the product is), and the **[Architecture Constitution](architecture-constitution.md)** (`AGI-DOC-0015`, how the platform is engineered). Every Runtime volume maps to a named inheriting book of the Architecture Constitution's _Relationship to Future Documents_. The roadmap integrates with — and defers ownership to — the **[requirement system](requirement-id-system.md)** (`AGI-DOC-0005`), **[cross-reference system](cross-reference-system.md)** (`AGI-DOC-0007`), **[documentation compiler](documentation-compiler.md)** (`AGI-DOC-0008`), **[ADR index](adr-index.md)** (`AGI-DOC-0010`), and **[Owner Decision Register](owner-decision-register.md)** (`AGI-DOC-0014`). It is the detailed realization of the planned information architecture sketched in **[master-documentation-index.md](master-documentation-index.md)** §4 and **[documentation-migration-plan.md](documentation-migration-plan.md)** §5.

**Structure.** The knowledge base is organized into **Volumes → Books → Chapters**. IDs are `VOL-NN` (volume), `BK-NN.MM` (book within a volume), `CH-NN.MM.PP` (chapter within a book). Each document, when generated, additionally receives a sequential `AGI-DOC-####` Document ID continuing from `AGI-DOC-0016`. Generation, review, and approval are governed by the **Generation Pipeline**, **Document Lifecycle**, and **Review System** defined below; every node carries the **Knowledge-Graph Node Schema** metadata and the canonical **Frontmatter Schema**.

**How overlaps are resolved.** The seven design clusters were authored in parallel. Where two volumes' scopes overlapped, the **[Single-Owner Boundary Resolutions](#single-owner-boundary-resolutions)** section is AUTHORITATIVE and governs over any overlapping claim in the volume designs (per the [cross-reference system](cross-reference-system.md) single-owner rule). Coherence findings and their resolutions are recorded transparently in **[Appendix A — Coherence Review](#appendix-a--coherence-review--resolutions)**.

**Scope of this document.** This roadmap is a _design_. It defines what documents will exist, their dependencies, and the order and gates of their generation. It generates **no** documentation, **no** runtime/feature/API/database specifications, and **no** implementation. Volumes and books that are **blocked on founder decisions** (pricing, product separation, surface sequencing) or **on architecture findings** (the `ARCH-D#` register items) are marked blocked and listed in **[Appendix B — Blocked-Work Register](#appendix-b--blocked-work-register)**; they are not designed around an undecided trade-off.

---

## Volume Index

- VOL-01 — Governance & Documentation System _(priority P0)_
- VOL-02 — Product _(priority P1)_
- VOL-03 — Architecture _(priority P1)_
- VOL-04 — Platform _(priority P0)_
- VOL-05 — Applications _(priority P1)_
- VOL-06 — Surfaces _(priority P2)_
- VOL-07 — Experiences _(priority P1)_
- VOL-08 — Capabilities _(priority P1)_
- VOL-09 — Features _(priority P2)_
- VOL-10 — AI Runtime _(priority P0)_
- VOL-11 — Context Runtime _(priority P1)_
- VOL-12 — Memory Runtime _(priority P1)_
- VOL-13 — Workflow Runtime _(priority P2)_
- VOL-14 — Agent Runtime _(priority P1)_
- VOL-15 — Tool Runtime _(priority P1)_
- VOL-16 — Provider Runtime _(priority P0)_
- VOL-17 — Execution Runtime (Streaming, Long-Running & Background) _(priority P1)_
- VOL-18 — Synchronization Runtime (Session & Sync) _(priority P1)_
- VOL-19 — Storage Runtime (Database & Trust-Boundary Stores) _(priority P0)_
- VOL-20 — Security Runtime (Trust Plane Enforcement) _(priority P0)_
- VOL-21 — Observability Runtime (Telemetry, Logging & Cost) _(priority P2)_
- VOL-22 — UX Runtime (Error, Reliability-UX, Performance & Caching) _(priority P2)_
- VOL-23 — Platform Runtime (Local Mode / Cloud Mode / Reliability) _(priority P1)_
- VOL-24 — Backend _(priority P1)_
- VOL-25 — Frontend _(priority P1)_
- VOL-26 — API _(priority P0)_
- VOL-27 — Database _(priority P0)_
- VOL-28 — Infrastructure _(priority P2)_
- VOL-29 — DevOps _(priority P1)_
- VOL-30 — Testing _(priority P1)_
- VOL-31 — Release Engineering _(priority P2)_
- VOL-32 — Operations _(priority P2)_
- VOL-33 — Reference (Auto-Generatable API/CLI/Config) _(priority P1)_
- VOL-34 — Research _(priority P3)_
- VOL-35 — Migration _(priority P2)_
- VOL-36 — Architecture Decisions (ADR Corpus) _(priority P0)_
- VOL-37 — Appendices _(priority P3)_
- VOL-38 — Glossary _(priority P0)_

---

All schemas below **EXTEND** the foundation; they never redefine an owned concept. Every concept marked **REFERENCED** is owned by the cited foundation document and is used by ID/link only (compiler rule 6 / [documentation-constitution.md](documentation-constitution.md) Article III). Only concepts marked **NEW** are owned by AGI-DOC-0016.

## Generation Pipeline

**NEW** (owned by AGI-DOC-0016). The pipeline is the generation order for VOL-01…VOL-38. It is **not** a strict linear march — it is a **priority-gated DAG** keyed on the volume index's `genPriority` (P0→P3) and 7 clusters. Improvement over the bare 14-stage list: (a) two **bookend non-generating stages** — Research and Repository Analysis feed the corpus, Archive retires it; (b) **Foundation is a hard gate** — nothing generates until AGI-DOC-0001…0016 (`docs/00-foundation/`) are Canonical, because every later volume's frontmatter inherits IDs, Status, and traceability anchors from it; (c) **within a stage, P0 volumes lead and gate their P1/P2/P3 dependents** rather than all volumes in a stage emitting at once.

Pipeline stages must satisfy the constraint that **each VOL appears exactly once** (DAG node), even when a stage spans clusters:

| #   | Stage                     | Generates (VOL IDs)                                                                                                                   | Gate                               |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 0   | **Research**              | — (feeds VOL-34 corpus; no published volume)                                                                                          | none                               |
| 1   | **Repository Analysis**   | — (grounds all `Last verified against implementation`; non-generating)                                                                | none                               |
| 2   | **Foundation**            | VOL-01 _(P0)_                                                                                                                         | gates all below                    |
| 3   | **Architecture**          | VOL-03 _(P1)_                                                                                                                         | requires VOL-01                    |
| 4   | **Runtime**               | VOL-16, VOL-10, VOL-19, VOL-20 _(P0)_ → VOL-15, VOL-14, VOL-11, VOL-12, VOL-17, VOL-18, VOL-23 _(P1)_ → VOL-13, VOL-21, VOL-22 _(P2)_ | requires VOL-03                    |
| 5   | **Platform**              | VOL-04 _(P0)_                                                                                                                         | requires VOL-03                    |
| 6   | **Surfaces**              | VOL-05 _(P1)_ → VOL-06 _(P2)_                                                                                                         | requires VOL-04                    |
| 7   | **Experiences**           | VOL-07 _(P1)_                                                                                                                         | requires VOL-05, VOL-06            |
| 8   | **Capabilities**          | VOL-08 _(P1)_                                                                                                                         | requires VOL-07                    |
| 9   | **Features**              | VOL-09 _(P2)_                                                                                                                         | requires VOL-08                    |
| 10  | **Implementation Guides** | VOL-26 _(P0)_, VOL-27 _(P0)_ → VOL-24, VOL-25 _(P1)_ → VOL-28 _(P2)_                                                                  | requires Runtime + Platform        |
| 11  | **Operations**            | VOL-29, VOL-30 _(P1)_ → VOL-31, VOL-32 _(P2)_                                                                                         | requires Implementation Guides     |
| 12  | **Reference**             | VOL-38 _(P0)_, VOL-36 _(P0)_, VOL-33 _(P1)_ → VOL-35 _(P2)_ → VOL-34, VOL-37 _(P3)_                                                   | auto-generatable from prior stages |
| 13  | **Archive**               | — (retires Superseded/Deprecated per lifecycle below; non-generating)                                                                 | requires verification (Article VI) |

VOL-02 (Product, P1) is the entry of the **Product** sub-stage that runs between Foundation and Architecture (cluster C1); it generates immediately after VOL-01 and before VOL-03. **Coverage checklist — all 38 mapped exactly once:** VOL-01(s2) VOL-02(Product) VOL-03(s3) VOL-04(s5) VOL-05(s6) VOL-06(s6) VOL-07(s7) VOL-08(s8) VOL-09(s9) VOL-10(s4) VOL-11(s4) VOL-12(s4) VOL-13(s4) VOL-14(s4) VOL-15(s4) VOL-16(s4) VOL-17(s4) VOL-18(s4) VOL-19(s4) VOL-20(s4) VOL-21(s4) VOL-22(s4) VOL-23(s4) VOL-24(s10) VOL-25(s10) VOL-26(s10) VOL-27(s10) VOL-28(s10) VOL-29(s11) VOL-30(s11) VOL-31(s11) VOL-32(s11) VOL-33(s12) VOL-34(s12) VOL-35(s12) VOL-36(s12) VOL-37(s12) VOL-38(s12). ✓ 38/38.

## Document Lifecycle

**NEW**: the 13 authoring-workflow states (`lifecycle-state`). **REFERENCED**: the 4 publication `Status` values (Current | Needs Update | Deprecated | Superseded), owned by [documentation-standards.md](documentation-standards.md) §2 / [documentation-constitution.md](documentation-constitution.md) Article VI — these are **not** redefined here. A `lifecycle-state` is the _authoring workflow position_; a `Status` is the _published verification state_. The load-bearing deliverable is the mapping, which collapses cleanly onto the existing enum without contradiction:

| `lifecycle-state` (NEW) | Phase           | Published `Status` (REFERENCED, AGI-DOC-0006 §2)                                                                                  |
| ----------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Proposed                | pre-publication | none (not yet in `doc-status.json`)                                                                                               |
| Research                | pre-publication | none                                                                                                                              |
| Draft                   | pre-publication | none                                                                                                                              |
| Internal Review         | pre-publication | none                                                                                                                              |
| Architecture Review     | pre-publication | none                                                                                                                              |
| Founder Review          | pre-publication | none                                                                                                                              |
| Revision                | pre-publication | none                                                                                                                              |
| Approved                | publication     | **Current** (verified on `Last verified` date)                                                                                    |
| Canonical               | publication     | **Current** (registered, all 10 compiler rules pass)                                                                              |
| Versioned               | publication     | **Current** (immutable prior revision retained; new revision also Current)                                                        |
| Superseded              | retirement      | **Superseded** (cites successor)                                                                                                  |
| Deprecated              | retirement      | **Deprecated** (points to replacement)                                                                                            |
| Archived                | retirement      | retains last `Status`; moved to `docs/archive/` **only after** verification no doc depends on it (Article VI — never auto-delete) |

Rules: pre-publication states carry **no** `Status` and are absent from `docs/agent-context/doc-status.json` (so `pnpm check:doc-status` is not triggered prematurely). A doc enters `Status` tracking only at **Approved**. **Versioned** is a Current doc with an immutable prior revision; superseding a version sets the old revision to `Superseded` per the existing scheme. No new state weakens or duplicates the 4-value enum.

## Review System

**NEW** (review-gating matrix). **REFERENCED**: Owner field (AGI-DOC-0006 §1); the rule that any change touching `AGI-TRUST-*` requires mandatory human security review **and** a recorded ADR ([architecture-constitution.md](architecture-constitution.md) §2/AC-98; [adr-index.md](adr-index.md)) — this is **not** reinvented, only invoked. Roles:

- **Owner** — the single accountable role in the `Owner` frontmatter field (REFERENCED). Authors and maintains the volume.
- **Reviewers** — discipline reviewers assigned per gate below.
- **Approval Authority** — who can advance `lifecycle-state` to **Approved**. For trust/security volumes this is the Founder + security review (per AC-98); for all others, the Platform lead.

Eleven review types and which volume types they **gate** (a gate must pass before **Approved**):

| Review                | Gates volume types                                                                                                                                 | Maps to lifecycle-state                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Architecture**      | VOL-03,04,10–23,24–28,36 (architecture/runtime/engineering/ADR)                                                                                    | Architecture Review                                      |
| **Product**           | VOL-02,05,06,07,08,09 (product/surface/experience/capability/feature)                                                                              | Founder Review                                           |
| **Security**          | VOL-19,20,24,26,27 + any volume citing `AGI-TRUST-*`/`AGI-SEC-*`/`AGI-PRIV-*` (**mandatory**, AC-98)                                               | Architecture Review (security sub-gate) + Founder Review |
| **Performance**       | VOL-17,21,22 (execution/observability/UX-perf)                                                                                                     | Internal Review                                          |
| **DX**                | VOL-26,29,30,33 (API/devops/testing/reference)                                                                                                     | Internal Review                                          |
| **QA**                | VOL-30, plus every volume's claim-grounding pass (compiler rule 8)                                                                                 | Internal Review                                          |
| **Release**           | VOL-31,32 (release/operations)                                                                                                                     | Founder Review                                           |
| **Accessibility**     | VOL-06,07,09,25 (surface/experience/feature/frontend) + any volume documenting user-facing presentation                                            | Internal Review                                          |
| **i18n/Localization** | VOL-06,25,09,23 (surface/frontend/feature/platform-runtime) + any volume documenting user-facing copy or locale-sensitive state                    | Internal Review                                          |
| **Compliance/Legal**  | VOL-02,04,19,20,26 + any volume citing `AGI-COMP-*` or documenting compliance/legal/retention/deletion controls (**mandatory** when trigger fires) | Founder Review                                           |
| **Convergence**       | VOL-10,16 — gates Approved on the ARCH-D4 converge-or-justified-divergence proof (BK-10.08 / BK-16.4)                                              | Architecture Review                                      |

Gating rule: a volume passes **only** the reviews mapped to its type(s); **Security** is non-skippable when the trust-domain trigger fires regardless of volume type; likewise **Compliance/Legal** is non-skippable when its `AGI-COMP-*`/compliance/legal trigger fires, and **Convergence** is non-skippable for VOL-10/16 until the ARCH-D4 proof exists — each parallels the Security non-skippability rule.

### ADR-mint → unblock workflow

**EXTENDS** AC-98 ("a trust change requires a recorded ADR before `Approved`") to the general blocked-decision case — REFERENCED, not reinvented. Many books carry a `BLOCKED on D#`/`BLOCKED on ARCH-D#` marker (e.g. BK-04.04 on D4/D7/ARCH-D5, BK-10.08 / BK-16.4 on ARCH-D4, BK-03.02 on ARCH-D16/D17). The marker is a **Target** flag: such a book documents Current state honestly and may not flip to `Status: Current` until the owning decision resolves and an ADR is minted. The workflow:

1. **Who mints.** When a `D#`/`ARCH-D#` resolves, the **Owner of the blocked volume** drafts the ADR (the volume that defers the decision per [owner-decision-register.md](owner-decision-register.md) §9 owns the mint — e.g. ARCH-D4/D1/D2/D3 mint in the AI/Provider Runtime volumes, not in the consuming surface books). The **Approval Authority** ratifies it: Founder + security review for trust/security decisions (AC-98), Platform lead otherwise.
2. **Where recorded.** The minted ADR registers in [adr-index.md](adr-index.md) (AGI-DOC-0010); the corresponding `D#`/`ARCH-D#` in [owner-decision-register.md](owner-decision-register.md) (AGI-DOC-0014) is marked **resolved** with a pointer to the ADR. The book's `traces-to-adrs` and `traces-to-decision-register` fields then resolve (compiler rules 3–5).
3. **SLA (structural).** The ADR must exist **before** the Target→Current flip; minting is gated **within the blocked volume's review cycle** — a volume cannot exit review with an unresolved `BLOCKED on` marker. No wall-clock duration is asserted here (that is founder judgment; see Notes).
4. **Compiler gate (Target → Current).** Before the compiler may advance a Target volume's `lifecycle-state` to **Approved**/**Canonical** (i.e. flip its published `Status` to **Current**), it verifies that **every** `BLOCKED on D#/ARCH-D#` marker the volume (or any of its books/chapters) carries has a resolved entry in the decision register **and** a registered ADR in `adr-index.md`. Any unresolved required ADR fails the build, exactly as an unresolved `AGI-TRUST-*` change fails under AC-98. The **Convergence** review above is the named instance of this gate for VOL-10/16 against ARCH-D4.

## Traceability Model

**NEW** (the traceability field bundle on every doc). **Vertical lineage only** — deliberately disjoint from the Knowledge-Graph (horizontal relations) to avoid defining the same edges twice. Every future doc traces **upward** to authority and **downward** to implementation:

| Trace field (NEW)                     | Resolves to (REFERENCED owner)                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `traces-to-platform-constitution`     | [platform-constitution.md](platform-constitution.md) Part/§ (AGI-DOC-0013)                    |
| `traces-to-architecture-constitution` | [architecture-constitution.md](architecture-constitution.md) §/AC-NN (AGI-DOC-0015)           |
| `traces-to-requirements`              | `AGI-<DOMAIN>-<NNNN>` in [requirement-id-system.md](requirement-id-system.md) (AGI-DOC-0005)  |
| `traces-to-adrs`                      | ADR/decision IDs in [adr-index.md](adr-index.md) / `docs/decisions/` (AGI-DOC-0010)           |
| `traces-to-implementation`            | implementing module/feature path                                                              |
| `traces-to-source-files`              | repo-relative source paths in backticks (compiler rule 8)                                     |
| `traces-to-decision-register`         | D/A/ARCH-D entries in [owner-decision-register.md](owner-decision-register.md) (AGI-DOC-0014) |

**Related Documents** is **not** a traceability field — it reconciles to the single canonical `Related` frontmatter field (see §Frontmatter). Validation: every ID in a trace field must resolve in its owner doc (compiler rules 3–5), else the build fails.

## Knowledge-Graph Node Schema

**NEW** (every doc is a node). **Horizontal relations only** — strictly disjoint from Traceability (vertical lineage). A node declares:

| KG field (NEW)            | Meaning                                                      | Resolves to               |
| ------------------------- | ------------------------------------------------------------ | ------------------------- |
| `kg-parents`              | volumes/docs this node specializes                           | `AGI-DOC-<NNNN>` / VOL ID |
| `kg-children`             | volumes/docs that specialize this node                       | `AGI-DOC-<NNNN>` / VOL ID |
| `kg-dependencies`         | nodes this doc requires to be Canonical first                | `AGI-DOC-<NNNN>` / VOL ID |
| `kg-consumers`            | nodes that depend on this doc                                | `AGI-DOC-<NNNN>` / VOL ID |
| `kg-related-documents`    | **points at the canonical `Related` field** (no second list) | `Related`                 |
| `kg-related-requirements` | `AGI-<DOMAIN>-<NNNN>` (AGI-DOC-0005)                         |
| `kg-related-adrs`         | ADR/decision IDs (AGI-DOC-0010)                              |
| `kg-related-apis`         | route/contract IDs (owned by VOL-26 once Canonical)          |
| `kg-related-runtime`      | runtime VOL IDs (VOL-10…VOL-23)                              |
| `kg-related-features`     | feature IDs (owned by VOL-09 once Canonical)                 |

Reconciliation of the three "related"-ish fields: the frontmatter `Related` field (AGI-DOC-0006 §1) is the **single canonical list of related documents**; `kg-related-documents` and the traceability "Related Documents" requirement both **reference** `Related` rather than restating it. One home, two references — no internal duplication.

## Document ID & Frontmatter Schema

**EXTENDS** [documentation-standards.md](documentation-standards.md) §1. The 8 existing fields are **REUSED verbatim** (Status, Owner, Last updated, Last verified against implementation, Audience, Layer, Document ID, Related). Identity remains `AGI-DOC-<NNNN>` (next available **0016+**, immutable, never reused — AGI-DOC-0006 §1). **VOL/BK/CH are _position_ fields, not identity** — a doc keeps its `Document ID` even as its book/chapter position changes. ADDED field groups: `lifecycle-state`, the `traces-to-*` bundle, the `kg-*` bundle, and `Volume`/`Book`/`Chapter` position.

One complete worked example — **VOL-20 Security Runtime** (P0; trust-domain, so it exercises the Security gate and the AC-98 trust-change rule). The example below literally contains every §Traceability field and every §Knowledge-Graph field:

```
# AGI Security Runtime — Trust Plane Enforcement

Status: Current
Owner: Platform lead + Security
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: Runtime engineers, security reviewers
Layer: docs/07-security
Document ID: AGI-DOC-0042
Related: [architecture-constitution.md](architecture-constitution.md), [platform-constitution.md](platform-constitution.md), [requirement-id-system.md](requirement-id-system.md)

# --- AGI-DOC-0016 extensions ---
Volume: VOL-20
Book: BK-20.01
Chapter: CH-20.01.03
Lifecycle-state: Canonical

# Traceability (vertical lineage)
Traces-to-platform-constitution: platform-constitution.md Part IV §23 (AGI-DOC-0013)
Traces-to-architecture-constitution: architecture-constitution.md §23–27, AC-33..AC-42, AC-98 (AGI-DOC-0015)
Traces-to-requirements: AGI-TRUST-0001, AGI-TRUST-0003, AGI-SEC-0001, AGI-PRIV-0001
Traces-to-adrs: docs/decisions/CURRENT_DECISIONS.md #14; docs/decisions/2026-06-24-egress-guard-parity.md
Traces-to-implementation: egress chokepoint + RLS enforcement
Traces-to-source-files: `apps/desktop/src/lib/egressGuard.ts`, `apps/desktop/src/stores/privacyBoundary.ts`
Traces-to-decision-register: owner-decision-register.md ARCH-D5, ARCH-D13

# Knowledge-graph node (horizontal relations)
Kg-parents: VOL-03, AGI-DOC-0015
Kg-children: VOL-24, VOL-26
Kg-dependencies: VOL-01, VOL-03, VOL-19
Kg-consumers: VOL-05, VOL-06, VOL-07, VOL-26, VOL-27
Kg-related-documents: see Related
Kg-related-requirements: AGI-TRUST-0001, AGI-TRUST-0003, AGI-SEC-0001
Kg-related-adrs: CURRENT_DECISIONS #14
Kg-related-apis: (owned by VOL-26 when Canonical)
Kg-related-runtime: VOL-10, VOL-16, VOL-19
Kg-related-features: (owned by VOL-09 when Canonical)

---
```

Because VOL-20 cites `AGI-TRUST-*`, its **Security review is mandatory** and an **ADR is required** before `Lifecycle-state: Approved` (AC-98 — REFERENCED, not reinvented). The `Document ID` (`AGI-DOC-0042`) is stable; `Volume: VOL-20`/`Book`/`Chapter` are position metadata that can change without changing identity. `Kg-related-documents: see Related` — the single canonical related-docs list lives in `Related`; nothing is duplicated.

---

### Added fields — test traceability & versioning (EXTENDS AGI-DOC-0016)

Two further field groups extend the schema. They **REUSE** existing owners and conventions; they redefine nothing.

| Added field (NEW)        | Meaning                                                              | Resolves to (owner)                                                                      |
| ------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `traces-to-tests`        | the tests that exercise the documented behavior (downward, vertical) | repo-relative test paths/IDs in backticks, owned by **VOL-30 Testing** (compiler rule 8) |
| `version-id`             | the immutable revision identifier of this doc instance               | revision tag tied to the **Versioned** lifecycle-state (Document Lifecycle, line 114)    |
| `prior-revision-pointer` | the immutable prior revision a Versioned doc supersedes-in-place     | `version-id` of the retained prior revision (Article VI never-auto-delete applies)       |

`traces-to-tests` joins the §Traceability vertical bundle (it is **downward** lineage, modeled exactly on `traces-to-source-files`); it is **not** a Knowledge-Graph field. `version-id`/`prior-revision-pointer` are the concrete mechanism the **Versioned** state already implies ("immutable prior revision retained; new revision also Current"): a Versioned doc keeps its stable `Document ID`, mints a new `version-id`, and points `prior-revision-pointer` at the retained revision; superseding a version sets the old revision's `Status` to **Superseded** per the existing scheme. No new identity is created — `Document ID` remains immutable.

### kg-\* synthesis rule (compiler-derived; one home, two references)

The `kg-*` horizontal-relation pairs are **not** hand-authored on both sides. They are **inverse pairs** synthesized by the compiler from the inter-volume edge list in the Global Dependency Graph:

- **`kg-parents` ↔ `kg-children`** and **`kg-dependencies` ↔ `kg-consumers`** are inverses. The author declares **one** side (or relies on the volume's declared `Dependencies` / the edge list); the compiler **derives** the opposing side by inverting every edge. A node listed in another node's `kg-dependencies` is auto-populated into the cited node's `kg-consumers`, and likewise parents/children — the author never restates both directions.
- **Conflict resolution (`kg-dependencies` vs declared `Dependencies`).** The volume's declared `Dependencies` and the Global Dependency Graph edge list are **authoritative**. A hand-authored `kg-dependencies` that introduces an edge absent from (or contradicting) the declared dependency set **fails the build** — it is not silently merged. This mirrors the `Related` reconciliation ("one home, two references"): the dependency graph is the single home; `kg-dependencies`/`kg-consumers` are derived references to it.

### Empty-trace semantics (which traces are optional; how empties compile)

A trace field is either **mandatory** (an empty value fails the build) or **optional** (an empty value compiles via the existing deferred-owner / `none` marker convention — never silent omission):

- **Mandatory (empty fails — compiler rules 3–5):** `traces-to-architecture-constitution` (upward authority — every doc inherits the Architecture Constitution), `traces-to-requirements` (every doc grounds in at least one `AGI-<DOMAIN>-<NNNN>`), and the downward pair `traces-to-implementation` + `traces-to-source-files` (claim-grounding, compiler rule 8). A doc with any of these empty cannot reach `Approved`.
- **Optional (empty compiles to an explicit marker):** `traces-to-platform-constitution`, `traces-to-adrs`, `traces-to-decision-register`, and `traces-to-tests`. When a Target book has unresolved decisions its `traces-to-adrs`/`traces-to-decision-register` compile to the deferred-owner marker form (e.g. `(pending ARCH-D4)`, as `Kg-related-apis: (owned by VOL-26 when Canonical)` already demonstrates); a doc with genuinely no tests yet writes `traces-to-tests: none` explicitly. An optional trace is **never** omitted silently — the field is present with `none` or a deferred-owner marker so the compiler can distinguish "intentionally empty" from "forgotten."

## Single-Owner Boundary Resolutions

The seven design clusters were authored in parallel. Where two volumes' scopes overlapped, the following resolutions are **authoritative** and govern over any overlapping claim in the volume designs below ([cross-reference-system.md](cross-reference-system.md) single-owner rule). Each names the single owner and the deferring volume.

| Overlap                                                                               | Single owner                                                                                                                                                                                                                    | Defers / shares with   | Boundary rule                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Execution mechanics (streaming, long-running, background, reserve/refund)             | **VOL-17 Execution Runtime**                                                                                                                                                                                                    | VOL-24 Backend         | VOL-17 owns the cross-surface execution _behavior_ spec (Architecture Constitution §31–33, §39); VOL-24 documents only the backend service/route composition that _hosts_ it and references VOL-17.                                  |
| Managed database schema, indexes, migration SQL, runner/ledger, branch-first apply    | **VOL-27 Database**                                                                                                                                                                                                             | VOL-19 Storage Runtime | VOL-27 owns the managed Neon Postgres concrete spec (§29); VOL-19 owns the trust-boundary _store model_ and the local/BYOK stores (SQLCipher/MMKV/JSONL) + cross-store identity (§22), and references VOL-27 for the managed schema. |
| Capability-honest rendering derivation (`evaluateModelEnvironment` → render decision) | **VOL-22 UX Runtime**                                                                                                                                                                                                           | VOL-25 Frontend        | VOL-22 owns the derivation _contract_ (§12 capability honesty at the view boundary); VOL-25 documents the view-layer components that consume it.                                                                                     |
| Per-surface UI shell vs shared cross-surface UI                                       | **VOL-06 Surfaces** (per-surface shell + host integration) and **VOL-25 Frontend** (shared UI package contracts + RN-safe shared core)                                                                                          | mutual                 | VOL-06 owns each surface's presentation shell + host runtime (Tauri/Expo/Next/extension); VOL-25 owns the shared, cross-surface component system. Neither documents the other's layer.                                               |
| Deploy targets + CI/CD                                                                | **VOL-28 Infrastructure** (deploy-target topology + provisioned services: Neon/Upstash/Blob/Vercel/Fly + api-gateway host) and **VOL-29 DevOps** (CI/CD pipeline, workflows, guardrail wiring, branch-first _apply automation_) | mutual                 | VOL-28 owns _what runs where_ (topology, provisioning); VOL-29 owns _how it is built and deployed_ (pipelines). This also resolves VOL-28's empty-ownership finding.                                                                 |

**Dependency-graph corrections (applied).** The parallel design emitted two edges to a non-existent node `VOL-02-architecture` (from VOL-16 and VOL-12); these are **retargeted to AGI-DOC-0015 (Architecture Constitution)**, the correct inheriting authority. Additionally, every Runtime volume (VOL-10…VOL-23) inherits from **AGI-DOC-0015** (each elaborates one of its named inheriting books); this inheritance was implicit in the volume prose and is now an explicit graph edge. These corrections are reflected in the Global Dependency Graph below and recorded in Appendix A.

---

## Global Dependency Graph

### Modeling rules

Two edge classes appear in the digest:

1. **Foundation edges** — point at the already-shipped corpus `AGI-DOC-0001..0016` (Documentation Constitution, Platform Constitution, Architecture Constitution, Manifest, Glossary, Requirement-ID system, Compiler, Owner-Decision-Register, etc.). These are treated as a pre-existing **Generation 0 substrate** that every volume sits on. They are NOT scheduling edges among the 38 volumes.
2. **Inter-volume edges** — point from one VOL-xx to another. These alone define the build DAG.

Note on the malformed label: the C4 edges `VOL-16 → VOL-02-architecture` and `VOL-12 → VOL-02-architecture` cite "Architecture Constitution §13/§14/§50/§18" and "foundation layer is more foundational." Face value, this is the foundation document **AGI-DOC-0015**, not the VOL-03 Architecture volume and certainly not VOL-02 (Product). They are therefore treated as foundation edges. (Alternative reading flagged in risks — it does not create a cycle either way.)

### Acyclicity verdict

**VERIFIED ACYCLIC.** Every inter-volume edge points from a more-composite/derived volume toward a more-foundational one; the per-cluster topological sorts compose into a single global topological order with no back-edge. No cycle exists, so the contingency procedure ("re-point the weaker edge toward the more-foundational volume") is **NOT TRIGGERED** and no edge was rewritten.

### Explicit per-volume inter-volume edge list

```
C1  VOL-02 -> VOL-01
    VOL-03 -> VOL-01
    VOL-03 -> VOL-02
C2  VOL-05 -> VOL-04
    VOL-06 -> VOL-05
    VOL-06 -> VOL-04
C3  VOL-07 -> VOL-08
    VOL-09 -> VOL-08
    VOL-09 -> VOL-07
C4  VOL-10 -> VOL-16
    VOL-15 -> VOL-16
    VOL-15 -> VOL-10
    VOL-14 -> VOL-10
    VOL-14 -> VOL-15
    VOL-13 -> VOL-14
    VOL-13 -> VOL-10
    VOL-11 -> VOL-10
    VOL-11 -> VOL-12
C5  VOL-19 -> VOL-20
    VOL-18 -> VOL-19
    VOL-18 -> VOL-20
    VOL-17 -> VOL-19
    VOL-17 -> VOL-20
    VOL-21 -> VOL-20
    VOL-22 -> VOL-17
    VOL-22 -> VOL-21
    VOL-23 -> VOL-17
    VOL-23 -> VOL-18
    VOL-23 -> VOL-19
    VOL-23 -> VOL-20
    VOL-23 -> VOL-21
C6  VOL-24 -> VOL-26
    VOL-24 -> VOL-27
    VOL-26 -> VOL-27
    VOL-25 -> VOL-26
    VOL-28 -> VOL-24
    VOL-28 -> VOL-27
C7  VOL-30 -> VOL-29
    VOL-31 -> VOL-29
    VOL-31 -> VOL-30
    VOL-32 -> VOL-29
    VOL-35 -> VOL-36
    (VOL-33, VOL-34, VOL-36, VOL-37, VOL-38 have foundation-only out-edges)
```

There are **no inter-cluster volume edges** under the foundation reading; the seven clusters are independent subgraphs sharing only the Generation-0 substrate. This is the single most important structural fact for scheduling.

### Topological generation order (volume-level)

Generation 0 (substrate, already shipped): `AGI-DOC-0001..0016`

```
Gen 1 (no volume in-deps; depend only on substrate):
  VOL-01, VOL-04, VOL-08, VOL-16, VOL-20, VOL-27, VOL-29, VOL-36,
  VOL-33, VOL-34, VOL-37, VOL-38, VOL-12

Gen 2:
  VOL-02 (->01), VOL-05 (->04), VOL-07 (->08), VOL-10 (->16),
  VOL-19 (->20), VOL-26 (->27), VOL-30 (->29), VOL-35 (->36),
  VOL-11 (->10,12)

Gen 3:
  VOL-03 (->01,02), VOL-06 (->04,05), VOL-09 (->07,08),
  VOL-15 (->16,10), VOL-18 (->19,20), VOL-21 (->20),
  VOL-24 (->26,27), VOL-25 (->26), VOL-31 (->29,30), VOL-32 (->29)

Gen 4:
  VOL-14 (->10,15), VOL-17 (->19,20), VOL-28 (->24,27)

Gen 5:
  VOL-13 (->14,10), VOL-22 (->17,21), VOL-23 (->17,18,19,20,21)
```

(Per-cluster local depth: C1=3, C2=3, C3=2, C4=5, C5=4, C6=3, C7=2.)

### Critical path

The longest dependency chain in the graph is the **C4 runtime stack**, depth 5:

```
AGI-DOC-0015 (substrate)
   └─> VOL-16 Provider Runtime
        └─> VOL-10 AI Runtime
             └─> VOL-15 Tool Runtime
                  └─> VOL-14 Agent Runtime
                       └─> VOL-13 Workflow Runtime
```

Second-longest is the C5 state/trust chain (depth 4): `VOL-20 Security → VOL-19 Storage → VOL-18 Sync → VOL-23 Platform Runtime` (VOL-23 also depends on 17/21). No chain exceeds the C4 stack. **Critical path = VOL-16 → VOL-10 → VOL-15 → VOL-14 → VOL-13.**

---

# Volume → Book → Chapter Hierarchy

The complete documentation hierarchy. Each volume maps to the planned IA and, for Runtime volumes, to a named inheriting book of the Architecture Constitution. Where scopes overlap, the [Single-Owner Boundary Resolutions](#single-owner-boundary-resolutions) govern.

## Part A — Governance, Product & Architecture (VOL-01…03)

## VOL-01 — Governance & Documentation System

- **Volume ID:** VOL-01 · **Generation Priority:** P0 · **Difficulty:** high
- **Purpose:** Document the existing 00-foundation governance layer (AGI-DOC-0001..0016) as canonical/existing-by-reference, and define only the genuinely new governance machinery the 20k–30k-page roadmap requires: the roadmap compiler, the generation pipeline, traceability-graph maintenance, documentation CI integration (Phase F), and the forward amendment/audit process. This is the meta-volume that lets every other volume be generated, validated, and admitted without duplication, contradiction, orphans, or drift.
- **Scope:** IN — new governance books (roadmap compiler, generation-pipeline governance, traceability graph, CI integration, amendment/audit). OUT — the constitutions and foundation docs themselves (they already exist as AGI-DOC-0001..0015 and are REFERENCED, never redefined); the existing AGI-DOC-0008 documentation-compiler validation ruleset (referenced, not restated — VOL-01 owns the _roadmap generation_ compiler, a distinct artifact); product/architecture content (VOL-02/VOL-03).
- **Owner:** Documentation Systems Lead / Platform lead
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits documentation governance (AGI-DOC-0002), requirement system (AGI-DOC-0005), cross-reference system (AGI-DOC-0007), documentation compiler (AGI-DOC-0008).
- **Dependencies:** none (most foundational volume) · **Prerequisites:** Phase A complete and review-gate passed (AGI-DOC-0012 §2); all 16 foundation docs registered and green.
- **Review Process:** Documentation Review (compiler 10-rule validation per AGI-DOC-0008 §2) + Architecture Review (AGI-DOC-0015 §58) for the compiler/pipeline design; ADR required for any change touching the ID scheme or governance articles (AGI-DOC-0002 Article X).
- **Audience:** AI agents (doc generators), documentation engineers, founders/platform-lead (governance approval).
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 4 / ~160 pages across 4 books
- **Inherits / References (no duplication):** AGI-DOC-0002, 0005, 0006, 0007, 0008, 0009, 0010, 0011, 0012, 0014, 0016. Restates none of them; references the existing foundation set as canonical and defines only forward governance.

### Books

#### BK-01.01 — Foundation Layer Reference & Roadmap ID System

- **Parent Volume:** VOL-01 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Catalogs the existing AGI-DOC-0001..0016 as canonical-by-reference and defines the roadmap's VOL/BK/CH ID scheme and its mapping onto sequential AGI-DOC-#### assignment. Depends on nothing. Prereq: foundation docs registered. Cross-refs AGI-DOC-0006 (ID scheme), AGI-DOC-0009 (master index). Inputs: doc-status.json, master-documentation-index.md. Outputs: the authoritative reference table + ID-allocation rules. Review: Documentation Review.
- **Chapters:**
  - **CH-01.01.01 — Existing foundation set (AGI-DOC-0001..0016), referenced not redefined** — depends-on: — · references: docs/00-foundation/master-documentation-index.md §2, all 16 foundation docs · related features: doc-status registration · est pages: 8 · difficulty: low · review checklist: references-only; no constitution restated; IDs resolve
  - **CH-01.01.02 — Roadmap ID scheme (VOL-NN / BK-NN.MM / CH-NN.MM.PP) and uniqueness rules** — depends-on: CH-01.01.01 · references: AGI-DOC-0006 §1 · related features: — · est pages: 6 · difficulty: med · review checklist: no collision with AGI-DOC scheme; immutability stated
  - **CH-01.01.03 — Mapping roadmap nodes to sequential AGI-DOC-#### at generation time (continuing from 0016)** — depends-on: CH-01.01.02 · references: AGI-DOC-0006 §1, AGI-DOC-0009 §2 · related features: doc-status.json · est pages: 7 · difficulty: med · review checklist: AGI-DOC numbers never pre-assigned; immutable once issued
  - **CH-01.01.04 — Single-owner ledger for roadmap-owned concepts (no two volumes own one concept)** — depends-on: CH-01.01.01 · references: AGI-DOC-0007 §1 · related features: — · est pages: 8 · difficulty: high · review checklist: every owned concept maps to exactly one VOL/BK; duplication = defect

#### BK-01.02 — The Roadmap Compiler

- **Parent Volume:** VOL-01 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Defines the roadmap _generation_ compiler — distinct from AGI-DOC-0008 which validates already-authored docs. This book specifies how a volume/book/chapter enumeration is turned into generated, front-matter-bearing, cross-referenced documents that then pass AGI-DOC-0008's 10 rules. Depends on BK-01.01. Cross-refs AGI-DOC-0008 (validation), AGI-DOC-0007 (link graph). Inputs: roadmap node metadata, owned-concept ledger. Outputs: generation contract + per-doc validation handoff. Review: Architecture + Documentation Review.
- **Chapters:**
  - **CH-01.02.01 — Compiler vs validator boundary (roadmap compiler emits; AGI-DOC-0008 validates)** — depends-on: BK-01.01 · references: AGI-DOC-0008 §2 · related features: — · est pages: 6 · difficulty: high · review checklist: no overlap with AGI-DOC-0008 ownership; boundary explicit
  - **CH-01.02.02 — Front-matter synthesis (Status/Owner/Layer/Document ID per generated doc)** — depends-on: CH-01.02.01 · references: AGI-DOC-0006 §1 (reused schema) · related features: check:doc-status · est pages: 6 · difficulty: med · review checklist: reuses front-matter schema; does not redefine it
  - **CH-01.02.03 — Cross-reference injection (terms->glossary, requirements->IDs, paths in backticks)** — depends-on: CH-01.02.02 · references: AGI-DOC-0007 §2-3, AGI-DOC-0004 · related features: — · est pages: 7 · difficulty: high · review checklist: link conventions reused; no term redefined
  - **CH-01.02.04 — No-invention gate (present-tense claims must cite source path or mark UNKNOWN)** — depends-on: CH-01.02.01 · references: AGI-DOC-0002 Article I, AGI-DOC-0008 §2 rule 8 · related features: — · est pages: 6 · difficulty: high · review checklist: evidence-cited; UNKNOWN allowed; no invented APIs
  - **CH-01.02.05 — Reconciliation handoff when generated doc fails validation (code wins, never change code)** — depends-on: CH-01.02.04 · references: AGI-DOC-0008 §3 · related features: — · est pages: 6 · difficulty: med · review checklist: reconciliation procedure referenced not restated

#### BK-01.03 — Generation Pipeline & Traceability Graph

- **Parent Volume:** VOL-01 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Specifies how volumes are authored at scale — authoring lanes, per-doc task manifests, converge gates — and the global traceability graph that links every volume to its constitutions, requirement domains, ADRs, and decision-register items while guaranteeing acyclicity. Depends on BK-01.01, BK-01.02. Cross-refs AGI-DOC-0014 (decision register), AGI-DOC-0010 (ADR), task-manifest.schema.json. Outputs: pipeline contract + traceability graph spec. Review: Architecture + Documentation Review.
- **Chapters:**
  - **CH-01.03.01 — Authoring lanes & per-doc task manifests (ownedWritePaths, requiredChecks, handoff)** — depends-on: BK-01.02 · references: docs/agent-context/task-manifest.schema.json · related features: agent-driven authoring · est pages: 7 · difficulty: high · review checklist: manifest schema reused; lanes non-overlapping
  - **CH-01.03.02 — Converge gate (spec-first, permission-gated risky changes before generation continues)** — depends-on: CH-01.03.01 · references: AGI-DOC-0014 §7 · related features: — · est pages: 6 · difficulty: med · review checklist: gate criteria explicit; no autonomous boundary-weakening
  - **CH-01.03.03 — Global traceability graph (volume -> constitution/requirement/ADR/decision edges)** — depends-on: CH-01.03.01 · references: AGI-DOC-0007 §4, AGI-DOC-0005, AGI-DOC-0010 · related features: — · est pages: 8 · difficulty: high · review checklist: every volume traces; edges resolve
  - **CH-01.03.04 — Acyclicity guarantee & cycle detection across the whole roadmap** — depends-on: CH-01.03.03 · references: AGI-DOC-0007 · related features: — · est pages: 7 · difficulty: extreme · review checklist: dependencies point inward only; no cycle admitted
  - **CH-01.03.05 — Orphan & drift detection (every doc reachable; terminology drift flagged)** — depends-on: CH-01.03.03 · references: AGI-DOC-0004, AGI-DOC-0011 · related features: — · est pages: 6 · difficulty: high · review checklist: no orphans; glossary-term enforcement

#### BK-01.04 — Documentation CI Integration & Forward Governance

- **Parent Volume:** VOL-01 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Defines Phase F (CI integration of every roadmap-generated doc) and the forward amendment/audit governance for admitting new volumes without duplication. Depends on BK-01.02, BK-01.03. Cross-refs AGI-DOC-0012 §9 (CI integration), AGI-DOC-0002 Article VII/X. Outputs: CI registration contract + amendment process. Review: Documentation Review + founder approval for governance amendments.
- **Chapters:**
  - **CH-01.04.01 — Registering generated docs in doc-status.json; keeping check:doc-status green** — depends-on: BK-01.03 · references: AGI-DOC-0012 §9, AGI-DOC-0006 · related features: pnpm check:doc-status · est pages: 6 · difficulty: med · review checklist: CI preserved; every doc registered
  - **CH-01.04.02 — check:llm-operability and roadmap-scale guard performance** — depends-on: CH-01.04.01 · references: AGI-DOC-0008 §2 rule 10 · related features: pnpm check:llm-operability · est pages: 6 · difficulty: high · review checklist: CI green at 20k-page scale
  - **CH-01.04.03 — Status-lifecycle transitions at scale (Current/Needs Update/Deprecated/Superseded; never auto-delete)** — depends-on: CH-01.04.01 · references: AGI-DOC-0006 §2, AGI-DOC-0002 Article VI · related features: — · est pages: 6 · difficulty: med · review checklist: lifecycle reused; archive only after dependency check
  - **CH-01.04.04 — Forward amendment & audit process for admitting new volumes (ADR-gated, no duplication)** — depends-on: CH-01.04.01 · references: AGI-DOC-0002 Article X, AGI-DOC-0010 §4 · related features: — · est pages: 7 · difficulty: high · review checklist: new-volume proposal references existing owners; ADR required

## VOL-02 — Product

- **Volume ID:** VOL-02 · **Generation Priority:** P1 · **Difficulty:** med
- **Purpose:** Elaborate the Platform Constitution (AGI-DOC-0013) into the working 01-product layer: long-form PRD reconciliation, personas, user journeys, the product surface/experience map, the feature/parity matrix, and the commercial/launch elaboration. This volume turns constitutional product identity (owned by AGI-DOC-0013) into actionable, evidence-grounded product documentation — without ever restating the constitution's identity, values, hierarchy, or trust modes.
- **Scope:** IN — 01-product working docs that elaborate (PRD, personas, journeys, feature matrix, commercial/launch pricing working docs). OUT — the Platform Constitution itself (AGI-DOC-0013: vision/mission/identity/values/hierarchy/non-goals are REFERENCED); trust-boundary _enforcement_ (architecture/security clusters); the canonical Launch Lock and trust-mode matrix (owned by docs/current/* and AGI-DOC-0013 — referenced); runtime/surface *implementation\* (VOL-03 + runtime clusters).
- **Owner:** Principal Product Lead / Founder
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** VOL-01 (compiler/governance) · **Prerequisites:** owner decisions D1-D9 resolved for affected books (AGI-DOC-0014 §3); product trio reconciled (AGI-DOC-0012 §3 item 3).
- **Review Process:** Product Review (founder/product-lead) + Documentation Review (AGI-DOC-0008 10 rules); capability-honesty review for any availability/feature claim (AGI-DOC-0013 §12).
- **Audience:** Founders, product, engineers, AI agents.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** low / high / 3 / ~200 pages across 4 books
- **Inherits / References (no duplication):** AGI-DOC-0013 (all product identity), docs/current/source-of-truth.md, trust-mode-surface-matrix.md, commercial-and-launch.md, product-suite.md, provider-capability-matrix.md, AGI-DOC-0004 (glossary), AGI-DOC-0005 (PROD/SURF/BILL requirements). Restates none.

### Books

#### BK-02.01 — Product Requirements & Long-Form PRD Reconciliation

- **Parent Volume:** VOL-02 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Reconciles the long-form PRD (currently Needs Update, dated 2026-05-28) to implementation and the constitution, and structures 01-product around it. Depends on VOL-01. Prereq: product-trio refresh (A4). Cross-refs AGI-DOC-0013, docs/current/agi-product-requirements.md, AGI-DOC-0005 (PROD IDs). Inputs: PRD, source-of-truth.md. Outputs: reconciled PRD working doc. Review: Product + Documentation Review.
  - **CH-02.01.01 — PRD reconciliation method (mark divergence, cite implementation, set Needs Update where unresolved)** — depends-on: VOL-01 · references: docs/current/agi-product-requirements.md, AGI-DOC-0011, AGI-DOC-0008 §3 · related features: — · est pages: 7 · difficulty: med · review checklist: divergence logged; code wins; status set
  - **CH-02.01.02 — Product invariants by reference (AGI-PROD-0001 one chat; AGI-PROD-0002 two-product model)** — depends-on: CH-02.01.01 · references: AGI-DOC-0005 PROD registry, AGI-DOC-0013 Part III · related features: — · est pages: 6 · difficulty: low · review checklist: requirements cited by ID; not restated
  - **CH-02.01.03 — Problems solved & target users (reference Platform Constitution, do not restate)** — depends-on: CH-02.01.01 · references: AGI-DOC-0013 Parts I-III · related features: — · est pages: 6 · difficulty: low · review checklist: references-only; no identity restated
  - **CH-02.01.04 — Capability-honesty as a product requirement (claims derive from real backend)** — depends-on: CH-02.01.02 · references: AGI-DOC-0013 §12, provider-capability-matrix.md · related features: model pickers/badges · est pages: 6 · difficulty: med · review checklist: no advertised capability beyond actual; honest current state

#### BK-02.02 — Product Definition & Two-Product Model (Local / Cloud)

- **Parent Volume:** VOL-02 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Documents Local Mode and Cloud Mode as two products on one platform at the product layer, elaborating AGI-PROD-0002. Depends on BK-02.01. Prereq: D8 (product-separation scope). Cross-refs AGI-DOC-0013 Part III §23-24, trust-mode-surface-matrix.md. Outputs: two-product working doc. Review: Product + capability-honesty review. BLOCKED on D8.
  - **CH-02.02.01 — Local Mode as a product (reference §23; user-owned compute+storage; never degraded to upsell)** — depends-on: BK-02.01 · references: AGI-DOC-0013 §23, AGI-DOC-0004 'Local Mode' · related features: — · est pages: 7 · difficulty: med · review checklist: trust-boundary correct; §23 referenced not restated
  - **CH-02.02.02 — Cloud Mode as a product (reference §24; managed models, sync, hosted storage)** — depends-on: CH-02.02.01 · references: AGI-DOC-0013 §24 · related features: shared cloud chat store · est pages: 7 · difficulty: med · review checklist: managed-only writer to shared store; referenced
  - **CH-02.02.03 — Shared spine, separate products (one platform; SSOT contracts shared)** — depends-on: CH-02.02.02 · references: AGI-DOC-0013 Part III, AGI-DOC-0004 'Cloud Mode vs Local Mode' · related features: suite spine · est pages: 6 · difficulty: med · review checklist: no trust-boundary collapse; D8 dependency noted
  - **CH-02.02.04 — Product-decomposition hierarchy applied (Platform->Cloud Services->Surfaces->Experiences->Capabilities->Features)** — depends-on: CH-02.02.01 · references: AGI-DOC-0013 Part IV §25 · related features: — · est pages: 6 · difficulty: low · review checklist: hierarchy referenced; each layer one owner

#### BK-02.03 — Surface, Experience & Capability Product Map

- **Parent Volume:** VOL-02 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** The product-level map of which Experiences and Capabilities manifest on which Surfaces, plus personas and journeys. Product-side companion to VOL-03's architecture overview and the downstream Surface/Experience/Capability Spec. Depends on BK-02.02. Prereq: D5, D6, D9. Cross-refs AGI-DOC-0013 Parts IV-V, trust-mode-surface-matrix.md, AGI-DOC-0005 (SURF). Outputs: surface/experience product map + personas/journeys. Review: Product + capability-honesty. BLOCKED on D5/D6/D9.
  - **CH-02.03.01 — Six canonical surfaces at the product layer (reference AGI-SURF-0001; thin clients)** — depends-on: BK-02.02 · references: AGI-DOC-0013 Part V, AGI-DOC-0005 SURF · related features: — · est pages: 6 · difficulty: low · review checklist: surfaces referenced; no parallel surface invented
  - **CH-02.03.02 — Four canonical Experiences (Chat/Code/Agent/Research) as cross-surface compositions** — depends-on: CH-02.03.01 · references: AGI-DOC-0013 Part IV §25, AGI-DOC-0004 'Experience' · related features: — · est pages: 6 · difficulty: med · review checklist: Experiences not standalone apps; one owner each
  - **CH-02.03.03 — Capabilities as reusable building blocks (Projects/Memory/Artifacts/Connectors/Skills/Plugins/...)** — depends-on: CH-02.03.02 · references: AGI-DOC-0013 §25 line 266, AGI-DOC-0004 'Capability' · related features: — · est pages: 7 · difficulty: med · review checklist: each Capability one owner; composed not duplicated
  - **CH-02.03.04 — Surface x trust-mode product matrix (reference canonical matrix; do not contradict)** — depends-on: CH-02.03.01 · references: docs/current/trust-mode-surface-matrix.md, AGI-DOC-0005 TRUST-0004 · related features: — · est pages: 6 · difficulty: med · review checklist: matrix referenced; Mobile no-BYOK honored; D6 noted
  - **CH-02.03.05 — Personas & user journeys (privacy-conscious individuals, developers, power users, enterprises)** — depends-on: CH-02.03.02 · references: AGI-DOC-0013 Part I (target users) · related features: — · est pages: 8 · difficulty: med · review checklist: grounded in constitution audiences; no invented persona
  - **CH-02.03.06 — Feature / parity matrix reconciliation (feature x surface x status grid)** — depends-on: CH-02.03.03 · references: docs/current/parity-implementation-matrix.md · related features: — · est pages: 8 · difficulty: high · review checklist: status grounded; Needs Update drift reconciled

#### BK-02.04 — Commercial & Launch Elaboration

- **Parent Volume:** VOL-02 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Elaborates commercial-and-launch.md and source-of-truth.md Launch Lock into the product layer: tiers, gating, and launch posture — strictly referencing the canonical Launch Lock, never weakening it. Depends on BK-02.02. Prereq: D1/D2/D3/D4/D7. Cross-refs commercial-and-launch.md, AGI-DOC-0005 (BILL), AGI-DOC-0010 (pricing ADRs). Outputs: pricing & launch working doc. Review: Product + founder approval. BLOCKED on D1/D2/D3/D4/D7.
  - **CH-02.04.01 — Tier model working doc (reference canonical pricing once D1 resolved)** — depends-on: BK-02.02 · references: docs/current/commercial-and-launch.md, AGI-DOC-0005 BILL · related features: billing-catalog.ts · est pages: 6 · difficulty: med · review checklist: pricing single-sourced; D1 divergence not papered over
  - **CH-02.04.02 — India/₹ cheapest cloud-chat tier (record D2 outcome; do not assume)** — depends-on: CH-02.04.01 · references: AGI-DOC-0014 §3 D2 · related features: — · est pages: 5 · difficulty: med · review checklist: D2 dependency named; no invented tier
  - **CH-02.04.03 — Launch posture & gating (Managed cloud public alpha, open by default; env kill-switch only)** — depends-on: CH-02.04.01 · references: docs/current/commercial-and-launch.md, docs/current/source-of-truth.md Launch Lock · related features: — · est pages: 7 · difficulty: med · review checklist: Launch Lock referenced; managed public-alpha posture honest (open by default; controls keep pace, not gate access); D7 resolved noted
  - **CH-02.04.04 — Credit/top-up posture (record D4 outcome; managed credits stay gated)** — depends-on: CH-02.04.03 · references: AGI-DOC-0014 §3 D4, AGI-DOC-0004 'managed credits/waitlist' · related features: — · est pages: 5 · difficulty: med · review checklist: D4 named; no top-up claimed before decision

#### BK-02.05 — Team & Enterprise Tier Product Specification

- **Parent Volume:** VOL-02 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Elaborate the Team/Business/Enterprise tier as a PRODUCT (closes gap #31): the seat/org model, SSO/SCIM provisioning, org-policy and role-based access at the product level, org-scoped audit, and SLA posture. Currently profit-first lists these only as commercial gates with no product features. Owns the product-level tier definition; references the admin/ops control plane that enforces it (VOL-04 BK-04.06), the identity/authz model (VOL-20 BK-20.02), and the compliance/SLA commitments (VOL-41). Depends on BK-02.02, BK-02.04. Prereq: D1 (tier model) and D8 (product separation). Cross-refs AGI-DOC-0013 §24-25, commercial-and-launch.md. Inputs: billing-catalog tiers, trust-mode matrix. Outputs: team/enterprise product spec. Review: Product + founder + capability-honesty. BLOCKED on D1/D8.
- **Chapters:**
  - **CH-02.05.01 — Seat and organization product model (org/member/role at product layer)** — depends-on: BK-02.04 · references: AGI-DOC-0013 §24-25, commercial-and-launch.md · related features: team tier · est pages: 5 · difficulty: high · review checklist: BLOCKED on D1; seat model referenced not invented; no fake availability
  - **CH-02.05.02 — SSO / SCIM provisioning as a product feature (references identity)** — depends-on: CH-02.05.01 · references: VOL-20 BK-20.02 identity, Clerk org features · related features: enterprise SSO · est pages: 5 · difficulty: high · review checklist: SSO/SCIM grounded in real identity backend; mechanics deferred to VOL-20
  - **CH-02.05.03 — Org-policy, role-based access and org-scoped audit (product view)** — depends-on: CH-02.05.01 · references: VOL-04 BK-04.06 admin console, VOL-20 BK-20.02 authz · related features: org policy · est pages: 4 · difficulty: high · review checklist: enforcement deferred to admin/security; product-level policy only
  - **CH-02.05.04 — Enterprise SLA posture and compliance commitments (references VOL-41)** — depends-on: CH-02.05.01 · references: VOL-41 BK-41.02 SOC2, VOL-32 BK-32.03.03 SLO · related features: enterprise SLA · est pages: 4 · difficulty: med · review checklist: SLA grounded in real SLO capability; compliance claims reference VOL-41 not restated

#### BK-02.06 — Billing Product Specification

- **Parent Volume:** VOL-02 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Elaborate the billing PRODUCT spec (closes gap #34) distinct from the engineering credit-ledger: metering presentation, credit lifecycle product semantics, overage/upgrade/downgrade flows, refund product policy, and invoice/receipt experience. billing-catalog.ts currently has tiers only with no product-level metering/credit-lifecycle/overage/refund spec. Owns the product semantics; references the credit-ledger and metering engineering (VOL-24 BK-24.02) and the entitlement surface (VOL-04 BK-04.04) — authors no ledger mechanics. Depends on BK-02.04. Prereq: D1/D2/D3/D4 (pricing/credit decisions). Cross-refs commercial-and-launch.md, AGI-DOC-0005 BILL. Inputs: billing-catalog.ts, VOL-24 ledger surface. Outputs: billing product spec. Review: Product + founder. BLOCKED on D1/D2/D3/D4.
- **Chapters:**
  - **CH-02.06.01 — Metering presentation and usage-visibility product semantics** — depends-on: BK-02.04 · references: VOL-24 BK-24.02 ledger, VOL-04 BK-04.04 entitlement · related features: usage meter · est pages: 4 · difficulty: med · review checklist: ledger mechanics deferred to VOL-24; product presentation only
  - **CH-02.06.02 — Credit lifecycle product semantics (grant/consume/expiry, managed-gated)** — depends-on: CH-02.06.01 · references: AGI-DOC-0014 §3 D4, AGI-DOC-0004 'managed credits/waitlist' · related features: credit lifecycle · est pages: 4 · difficulty: med · review checklist: BLOCKED on D4; managed-credits-gated honored; no top-up claimed before decision
  - **CH-02.06.03 — Overage, upgrade/downgrade and proration product flows** — depends-on: CH-02.06.01 · references: billing-catalog.ts tiers, commercial-and-launch.md · related features: plan change · est pages: 4 · difficulty: med · review checklist: BLOCKED on D1; flows referenced not invented; pricing single-sourced
  - **CH-02.06.04 — Refund product policy and invoice/receipt experience (references T&S fraud)** — depends-on: CH-02.06.01 · references: VOL-42 BK-42.02 fraud, VOL-24 ledger · related features: refunds · est pages: 4 · difficulty: med · review checklist: refund abuse deferred to VOL-42; chargeback mechanics deferred to VOL-24

#### BK-02.07 — Support, Help Center & Status Page Product

- **Parent Volume:** VOL-02 · **Canonical Status:** planned · **Generation Order:** 7
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Elaborate the customer-success PRODUCT (closes gap #33): support intake/ticketing product, the help-center/knowledge-base structure, and the public status page and incident-communication surface. Currently profit-first lists support links only as a gate; docs/support is absent. Owns the support product surface; references the incident-response execution and status signals (VOL-32) and the appeals intake (VOL-42 BK-42.03) — authors no ops runbook. Depends on BK-02.03. Prereq: enterprise tier scoped (BK-02.05); observability/ops signals available. Cross-refs AGI-DOC-0013 §12. Inputs: VOL-32 incident comms, support feature dir. Outputs: support/help/status product spec. Review: Product + founder. BLOCKED on enterprise-tier scope (BK-02.05).
- **Chapters:**
  - **CH-02.07.01 — Support intake and ticketing product surface** — depends-on: BK-02.03 · references: AGI-DOC-0013 §12, support feature dir · related features: support tickets · est pages: 5 · difficulty: med · review checklist: support surface grounded; appeals intake referenced from VOL-42
  - **CH-02.07.02 — Help center and knowledge-base structure (references reference docs)** — depends-on: CH-02.07.01 · references: VOL-33 generated reference, AGI-DOC-0008 · related features: help center · est pages: 5 · difficulty: low · review checklist: KB references generated docs; no duplicate API/CLI content authored
  - **CH-02.07.03 — Public status page and incident-communication surface (references ops)** — depends-on: CH-02.07.01 · references: VOL-32 BK-32.02 incident response, VOL-21 signals · related features: status page · est pages: 4 · difficulty: med · review checklist: status signals grounded in real observability; incident execution deferred to VOL-32

#### BK-02.08 — Analytics, Growth & Funnel Product Specification

- **Parent Volume:** VOL-02 · **Canonical Status:** planned · **Generation Order:** 8
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Elaborate the product-analytics and growth PRODUCT (closes gap #45): conversion-funnel and activation definitions, cohort/retention product metrics, and growth-experiment (A/B) governance. Telemetry is currently covered only as privacy-observability; no product analytics/funnels/cohorts exist. This is NOT a launch blocker (post-launch iteration). Owns the product-analytics definitions and growth governance; references the telemetry/privacy predicate (VOL-21/VOL-20) and feature-flag governance (VOL-04 BK-04.05) — authors no telemetry contract and never collects across the trust boundary. Depends on BK-02.03. Prereq: web/mobile analytics infra acknowledged; privacy predicate frozen. Cross-refs AGI-DOC-0013 §12. Inputs: VOL-21 telemetry, single privacy-boundary predicate. Outputs: analytics/growth product spec. Review: Product + Privacy/Security (no Local-Mode analytics).
- **Chapters:**
  - **CH-02.08.01 — Conversion funnel and activation product definitions** — depends-on: BK-02.03 · references: AGI-DOC-0013 §12, VOL-21 telemetry · related features: funnels · est pages: 4 · difficulty: med · review checklist: metrics grounded; Managed-only; no Local-Mode user analytics
  - **CH-02.08.02 — Cohort and retention product metrics (privacy-respecting)** — depends-on: CH-02.08.01 · references: VOL-20 privacy predicate, VOL-21 · related features: cohorts · est pages: 4 · difficulty: med · review checklist: cohort data respects privacy predicate; no cross-boundary collection
  - **CH-02.08.03 — Growth-experiment (A/B) governance (references feature flags)** — depends-on: CH-02.08.01 · references: VOL-04 BK-04.05 flag governance, VOL-05 BK-05.04 · related features: experiments · est pages: 4 · difficulty: med · review checklist: experiments gated by real flags; honesty enforced; no fake variant exposure

#### BK-02.09 — Marketplace, Partners & Affiliate Program

- **Parent Volume:** VOL-02 · **Canonical Status:** planned · **Generation Order:** 9
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Elaborate the marketplace/partner/affiliate PRODUCT (closes gap #51), explicitly post-GA and NOT a launch blocker: partner/affiliate program structure, third-party listing/distribution model, and revenue-share/entitlement linkage. No book currently owns this. Owns the program product structure; references the entitlement surface (VOL-04 BK-04.04), the extension points / connector ecosystem (VOL-04 BK-04.05, VOL-08 connectors), and team/enterprise tier (BK-02.05) — authors no entitlement mechanics. Depends on BK-02.05. Prereq: team/enterprise tier scoped; entitlement surface scoped. Cross-refs AGI-DOC-0013 §25. Inputs: extension manifests, entitlement surface. Outputs: marketplace/partner product spec. Review: Product + founder. BLOCKED on founder decision for marketplace existence/scope (decisionPoint); post-GA gen order.
- **Chapters:**
  - **CH-02.09.01 — Partner and affiliate program structure (post-GA)** — depends-on: BK-02.05 · references: AGI-DOC-0013 §25, commercial-and-launch.md · related features: partner program · est pages: 5 · difficulty: med · review checklist: post-GA stated; BLOCKED on founder decision; no launch-blocker framing
  - **CH-02.09.02 — Third-party listing and distribution model (references extension points)** — depends-on: CH-02.09.01 · references: VOL-04 BK-04.05 extension points, VOL-08 connectors · related features: marketplace listings · est pages: 5 · difficulty: med · review checklist: extension points referenced not re-owned; capability honesty for advertised integrations
  - **CH-02.09.03 — Revenue-share and entitlement linkage (references ledger/entitlement)** — depends-on: CH-02.09.01 · references: VOL-04 BK-04.04 entitlement, VOL-24 BK-24.02 ledger · related features: revenue share · est pages: 4 · difficulty: med · review checklist: ledger/entitlement mechanics deferred; product-level revenue model only; managed-gated honored

## VOL-03 — Architecture

- **Volume ID:** VOL-03 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Elaborate the Architecture Constitution (AGI-DOC-0015) Parts I-II structural law into the working 02-architecture layer: the layered-platform-architecture elaboration, package/module boundary elaboration, the cross-cutting-concerns catalog, the AI-substrate overview, and the per-surface architecture overview. This volume is the engineering-architecture book set that _elaborates_ the canon — it does not restate AC-01..AC-100, the 4-layer model, or the trust plane, and it does not own the 14 inheriting runtime/spec books (those are downstream clusters); it indexes and bridges to them.
- **Scope:** IN — 02-architecture working docs elaborating Constitution Parts I (Foundations/Spine §1-8) and II (Surfaces/Composition/AI-Substrate §9-17), plus a bridge index to the 14 runtime books and per-surface architecture overview. OUT — the Architecture Constitution canon itself (AGI-DOC-0015: philosophy, principles, 4-layer model, AC rules, trust plane, state plane — all REFERENCED); the 14 inheriting runtime/spec books (AI Runtime, Context, Memory, Session&Sync, Security, API, Database, Streaming, Observability, Background/Reliability, Module-Boundary, Surface/Experience/Capability, Tool/MCP, Testing/CI/CD, Cloud-Control-Plane — owned by downstream runtime/security/data/devops clusters, referenced as downstream); architecture-manifest current-state facts (AGI-DOC-0003, referenced).
- **Owner:** Principal AI Systems Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** VOL-01 (compiler/governance), VOL-02 (product intent it traces to) · **Prerequisites:** relevant ARCH-D findings resolved or explicitly recorded (AGI-DOC-0014 §9).
- **Review Process:** Architecture Review (AGI-DOC-0015 §58) + Documentation Review; ADR required for any decision touching AC rules or trust boundaries (AGI-DOC-0015 §59).
- **Audience:** Engineers, AI agents, architects.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 4 / ~200 pages across 3 books
- **Inherits / References (no duplication):** AGI-DOC-0015 (all engineering canon), AGI-DOC-0003 (current-state architecture facts), AGI-DOC-0013 (product intent via VOL-02), AGI-DOC-0005 (ARCH/SYNC requirements), AGI-DOC-0010 (ADRs). Restates none. References the 14 inheriting runtime books as downstream owners.

### Books

#### BK-03.01 — Architecture Constitution Elaboration Frame & Runtime-Book Bridge

- **Parent Volume:** VOL-03 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Establishes how 02-architecture elaborates (never restates) the constitution, and provides the authoritative bridge index from constitution sections to the 14 downstream inheriting runtime/spec books. Depends on VOL-01, VOL-02. Cross-refs AGI-DOC-0015 §1173-1194 (Relationship to Future Documents). Inputs: constitution ToC + deferral map. Outputs: elaboration frame + section->book bridge. Review: Architecture + Documentation Review.
  - **CH-03.01.01 — Elaboration discipline (reference AC rules and 4-layer model; never restate the canon)** — depends-on: VOL-01 · references: AGI-DOC-0015 Preamble, §3, Architectural Rules · related features: — · est pages: 7 · difficulty: high · review checklist: no AC rule restated; references-only
  - **CH-03.01.02 — Section-to-runtime-book bridge index (which downstream book closes each §)** — depends-on: CH-03.01.01 · references: AGI-DOC-0015 §1173-1194 · related features: — · est pages: 9 · difficulty: high · review checklist: all 14 books mapped; no book content authored here
  - **CH-03.01.03 — Architecture-manifest current-state by reference (platform shape, layering, risks)** — depends-on: CH-03.01.01 · references: AGI-DOC-0003 §1-13 · related features: — · est pages: 7 · difficulty: med · review checklist: current-state referenced not duplicated; honest risks
  - **CH-03.01.04 — Design Decision Framework reference (gates for trust boundaries; weights elsewhere)** — depends-on: CH-03.01.01 · references: AGI-DOC-0015 Design Decision Framework · related features: — · est pages: 6 · difficulty: med · review checklist: framework referenced; trust-boundary gate honored

#### BK-03.02 — Layered Architecture & Boundaries Elaboration

- **Parent Volume:** VOL-03 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Elaborates Constitution Part I §3-8 — the Contracts->Mechanics->Orchestration->Surfaces layering, inward-only dependency rule, package boundaries, runtime isolation, and shared-infrastructure SSOT — into working architecture docs, honestly recording the boundary-enforcement gaps. Depends on BK-03.01. Prereq: ARCH-D15/16/17. Cross-refs AGI-DOC-0015 §3,§5-8, AGI-DOC-0003 §2, AGI-DOC-0005 ARCH-0002. Outputs: layering & boundary elaboration. Review: Architecture Review. BLOCKED on ARCH-D15/D16/D17.
  - **CH-03.02.01 — Four-layer architecture elaboration (reference §3; inward-only dependencies)** — depends-on: BK-03.01 · references: AGI-DOC-0015 §3, AGI-DOC-0003 §2 · related features: — · est pages: 8 · difficulty: high · review checklist: layering referenced; dependency direction correct
  - **CH-03.02.02 — Package boundary rules elaboration (apps !-> apps; packages !-> apps; services !-> UI)** — depends-on: CH-03.02.01 · references: AGI-DOC-0015 §6, AGI-DOC-0005 ARCH-0002 · related features: check-boundaries.mjs · est pages: 7 · difficulty: high · review checklist: AC-01..07 referenced; enforcement state honest
  - **CH-03.02.03 — Module/monorepo boundary honesty (Rust crate check unenforced; bare-string exports)** — depends-on: CH-03.02.02 · references: AGI-DOC-0014 §9 ARCH-D16/D17, AGI-DOC-0015 §47-48 · related features: check-boundaries.mjs · est pages: 7 · difficulty: high · review checklist: gaps recorded as current state; ARCH-D dependency named
  - **CH-03.02.04 — Shared-infrastructure SSOT elaboration (model catalog, contracts, version pins)** — depends-on: CH-03.02.01 · references: AGI-DOC-0015 §8, §14, packages/contracts/types/src/models.json · related features: — · est pages: 7 · difficulty: high · review checklist: SSOT referenced; no model ID invented; drift noted
  - **CH-03.02.05 — Runtime isolation elaboration (reference §7; trust-mode isolation across surfaces)** — depends-on: CH-03.02.01 · references: AGI-DOC-0015 §7, AGI-DOC-0003 §3 · related features: — · est pages: 6 · difficulty: high · review checklist: trust-boundary isolation honest; egress gap recorded

#### BK-03.03 — Cross-Cutting Concerns, AI Substrate & Per-Surface Architecture Overview

- **Parent Volume:** VOL-03 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Elaborates Constitution Part II §9-17 — surfaces, application composition, capability architecture, and the AI substrate (provider/model/tool/agent/workflow abstractions) — into a cross-cutting-concerns catalog and per-surface architecture overview, bridging to (not authoring) the downstream runtime books. Depends on BK-03.01, BK-03.02. Prereq: ARCH-D1/D4/D5/D6. Cross-refs AGI-DOC-0015 §9-17, AGI-DOC-0003 §5-6. Outputs: cross-cutting catalog + surface overview. Review: Architecture Review. BLOCKED on ARCH-D1/D4/D5/D6.
  - **CH-03.03.01 — Surface architecture overview & synced-app/developer-session partition (reference §10)** — depends-on: BK-03.02 · references: AGI-DOC-0015 §10, packages/contracts/types/src/suite-contracts.ts · related features: assertSurfaceCanSyncChats · est pages: 7 · difficulty: high · review checklist: partition referenced; sync boundary correct
  - **CH-03.03.02 — Application composition & capability architecture overview (reference §11-12)** — depends-on: CH-03.03.01 · references: AGI-DOC-0015 §11-12 · related features: — · est pages: 7 · difficulty: high · review checklist: capability honesty; bridges to Surface/Experience/Capability Spec not authored here
  - **CH-03.03.03 — AI substrate overview (provider/model/tool abstractions; reference §13-15)** — depends-on: CH-03.03.01 · references: AGI-DOC-0015 §13-15, AGI-DOC-0003 §5 · related features: ProviderAdapter · est pages: 8 · difficulty: extreme · review checklist: ProviderAdapter referenced; SSOT drift (ARCH-D1) recorded; bridges to AI Runtime Spec
  - **CH-03.03.04 — Agent & workflow architecture overview (reference §16-17; consent-bounded crossing)** — depends-on: CH-03.03.03 · references: AGI-DOC-0015 §16-17 · related features: HandoffDraft · est pages: 7 · difficulty: high · review checklist: trust-mode crossing requires consent; bridges to Agent/Tool specs
  - **CH-03.03.05 — Cross-cutting concerns catalog (reliability/observability/error-handling as references to downstream books)** — depends-on: CH-03.03.02 · references: AGI-DOC-0015 §34-41, §1173-1194 · related features: — · est pages: 7 · difficulty: high · review checklist: concerns referenced; gaps (ARCH-D12/13/14) recorded; no behavior authored
  - **CH-03.03.06 — Per-surface architecture overview (web/desktop/mobile/cli/vscode/chrome roles)** — depends-on: CH-03.03.01 · references: AGI-DOC-0003 §1, docs/current/source-of-truth.md Surface Roles · related features: — · est pages: 8 · difficulty: high · review checklist: surfaces referenced; thin-client principle; no per-surface impl invented

## Part B — Platform, Applications & Surfaces (VOL-04…06)

## VOL-04 — Platform

- **Volume ID:** VOL-04 · **Generation Priority:** P0 · **Difficulty:** high
- **Purpose:** Define the documentation home for platform-wide systems that sit beneath every application and surface: the dual-workspace monorepo topology, the shared-infrastructure single sources of truth, the cloud-services / managed control plane as a platform system, and the dual-workspace two-product shape (Local Mode product / Cloud Mode product) that share one platform. This volume documents WHAT platform systems exist and how they relate; it defers all runtime behavior to the Architecture Constitution's inheriting runtime books and all product identity to the Platform Constitution.
- **Scope:** IN: monorepo/workspace topology as a documentation subject; shared-infrastructure SSOT consumption patterns (model catalog, version pins, single DB adapter, cross-language mirror correspondence); cloud-services/managed-control-plane platform surface; the two-product (Local/Cloud) platform composition shape; platform-level lifecycle and infrastructure (Vercel/Fly/Neon/Upstash) as documented systems. OUT: trust-mode state-machine law (owned by AGI-DOC-0015 §1, §23–27); provider/model SSOT rules themselves (owned by §8/§14 — referenced); runtime wire shapes, credential flow, gateway dispatch mechanics, RLS SQL, migration runner (owned by AI Runtime / Cloud Services / Security / Database runtime books — referenced); per-surface presentation (VOL-06); application composition discipline (VOL-05).
- **Owner:** Principal AI Systems Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits documentation governance (AGI-DOC-0002), requirement system (AGI-DOC-0005), cross-reference system (AGI-DOC-0007), compiler (AGI-DOC-0008)
- **Dependencies:** none within this cluster (most-foundational of C2) · **Prerequisites:** Architecture Constitution and Platform Constitution authored; Architecture Manifest current-state inventory present
- **Review Process:** Documentation compiler 10-rule validation (AGI-DOC-0008); Architecture review (trust-boundary and SSOT correctness); founder/platform-lead sign-off for any chapter touching Managed control plane gating
- **Audience:** engineers, AI agents, platform/infra leads, founders
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 3 / ~430 pages across 5 books
- **Inherits / References (no duplication):** AGI-DOC-0015 §3/§6/§8/§14/§43; AGI-DOC-0013 Part III–IV; AGI-DOC-0003 §1/§2/§5/§11; Module Boundary/Monorepo/Dependency Governance Spec, Cloud Services / Managed Control Plane Spec, Database Spec, Security Spec, Observability Spec (runtime books, referenced for behavioral detail)

### Books

#### BK-04.01 — Platform Shape & Dual-Workspace Topology

- **Parent Volume:** VOL-04 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the polyglot monorepo as a platform subject (pnpm + Cargo workspaces, member globs, the seven apps, 21 packages, 17 crates, services). Depends on AGI-DOC-0003 §1–2 for current-state inventory and AGI-DOC-0015 §3/§6 for the layering law. Prereq: manifest inventory verified. Cross-refs: Module Boundary/Monorepo/Dependency Governance Spec (owns enforcement). Inputs: real workspace globs, package/crate lists. Outputs: canonical platform-shape documentation referenced by VOL-05/VOL-06. Review: evidence-cited counts must match repo; no enforcement detail duplicated from the dependency-governance book.
- **Chapters:**
  - **CH-04.01.01 — Platform shape as a documented system** — depends-on: AGI-DOC-0003 §1 · references: `Cargo.toml`, `pnpm-workspace.yaml`, `apps/`, `packages/`, `crates/`, `services/` · related features: monorepo topology · est pages: 20 · difficulty: med · review checklist: evidence-cited; counts match repo; no invented packages
  - **CH-04.01.02 — The four-layer stack referenced (Contracts → Mechanics → Orchestration → Surfaces)** — depends-on: AGI-DOC-0015 §3 · references: AGI-DOC-0003 §2 · related features: layering · est pages: 16 · difficulty: med · review checklist: references §3, does not restate; inward-only law cited not redefined
  - **CH-04.01.03 — Inward-only dependency law as a platform fact** — depends-on: AGI-DOC-0015 §6 · references: `scripts/check-boundaries.mjs`, AGI-ARCH-0002 · related features: boundary enforcement · est pages: 14 · difficulty: med · review checklist: cites AGI-ARCH-0002; enforcement detail deferred to Module Boundary book
  - **CH-04.01.04 — Dual-language workspace boundary (TS pnpm vs Rust Cargo)** — depends-on: CH-04.01.01 · references: `apps/desktop/src-tauri`, `apps/cli`, `crates/*` · related features: cross-language topology · est pages: 22 · difficulty: high · review checklist: cross-language correspondence framed as reference to mirror book
  - **CH-04.01.05 — Package and crate naming and export-surface contract (referenced)** — depends-on: CH-04.01.04 · references: `@agiworkforce/*`, `agiworkforce-*`, AGI-NAME-0001 · related features: naming lock · est pages: 16 · difficulty: med · review checklist: naming-lock honored; no rename instruction; defers detail to dependency-governance book
  - **CH-04.01.06 — Known platform-shape inventory-honesty gaps (current state)** — depends-on: AGI-DOC-0003 §11 · references: `Cargo.toml` L5/L9-12, `apps/cli/Cargo.toml` L39-43 · related features: drift ledger · est pages: 14 · difficulty: med · review checklist: real state documented not intended; cites stale-dependency-surface gap

#### BK-04.02 — Shared Infrastructure & Single Sources of Truth

- **Parent Volume:** VOL-04 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document how the platform's shared single sources of truth are consumed platform-wide (model catalog, provider identity, central version pins, single DB adapter, cross-language mirror correspondence). References the SSOT rules owned by AGI-DOC-0015 §8/§14 rather than redefining them. Cross-refs: Module Boundary book (version pins), Database Spec (adapter detail). Inputs: `models.json`, `provider.ts`, central pin config. Outputs: platform consumption-pattern doc. Review: must reference §8/§14; model IDs read from SSOT, never enumerated as fact in prose. BLOCKED on ARCH-D1 for enforced-vs-target framing of mirror correspondence.
- **Chapters:**
  - **CH-04.02.01 — One home per single source of truth (platform consumption pattern)** — depends-on: AGI-DOC-0015 §8 · references: `packages/contracts/types/src/models.json`, `packages/contracts/types/src/provider.ts` · related features: SSOT · est pages: 16 · difficulty: med · review checklist: references §8/§14; never hardcodes model IDs
  - **CH-04.02.02 — Model catalog SSOT consumed across surfaces** — depends-on: CH-04.02.01 · references: AGI-DOC-0015 §14, `models.json` verificationLog · related features: model catalog · est pages: 18 · difficulty: high · review checklist: catalog facts cited via SSOT; route-object concept referenced from glossary
  - **CH-04.02.03 — Provider identity and cross-language mirror correspondence (current drift)** — depends-on: CH-04.02.02 · references: `provider.ts` (28), `models.json` (25 keys), `apps/desktop/src-tauri/src/core/llm/mod.rs:649` (25) · related features: provider SSOT · est pages: 18 · difficulty: extreme · review checklist: drift documented as current state; BLOCKED on ARCH-D1; no target stated as fact
  - **CH-04.02.04 — Central dependency version pinning as platform discipline** — depends-on: CH-04.02.01 · references: root package.json pins, Node 24 LTS, pnpm 9.15.3 · related features: version governance · est pages: 14 · difficulty: med · review checklist: pins cited; detail deferred to dependency-governance book
  - **CH-04.02.05 — Single vendor-neutral database adapter (platform view)** — depends-on: CH-04.02.01 · references: `packages/platform/data-layer`, AGI-DATA-0001 · related features: data access · est pages: 16 · difficulty: high · review checklist: adapter framed as single boundary; SQL/RLS detail deferred to Database/Security books
  - **CH-04.02.06 — Shared infrastructure services (Vercel/Fly/Neon/Upstash) as documented platform systems** — depends-on: AGI-DOC-0003 §10 · references: AGI-DOC-0003 infrastructure inventory · related features: infra topology · est pages: 16 · difficulty: med · review checklist: infra cited from manifest; no operational runbook content (that is layer 12)

#### BK-04.03 — The Dual Workspace (Local Mode & Cloud Mode as Two Products)

- **Parent Volume:** VOL-04 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the platform-level shape of the two-products-one-platform model: how Local Mode and Cloud Mode are composed as distinct product workspaces over one shared suite spine and SSOT contracts. References AGI-PROD-0002 (owned by AGI-DOC-0013) and the trust-boundary store separation (owned by AGI-DOC-0015 §22) — does not redefine product identity or trust-boundary law. Cross-refs: Platform Constitution Part III; Storage Architecture §22. Inputs: suite-contracts. Outputs: dual-workspace composition doc. Review: trust boundaries documented honestly; no aspiration as fact. BLOCKED on D8 for separation scope.
- **Chapters:**
  - **CH-04.03.01 — Two products, one platform (referenced from AGI-PROD-0002)** — depends-on: AGI-DOC-0013 Part III · references: AGI-PROD-0002, AGI-DOC-0004 'Cloud Mode vs Local Mode' · related features: product split · est pages: 16 · difficulty: med · review checklist: references AGI-PROD-0002; does not restate product identity; BLOCKED on D8
  - **CH-04.03.02 — Shared suite spine across both products** — depends-on: CH-04.03.01 · references: `packages/ui/unified-chat`, AGI-DOC-0015 §3 (Orchestration) · related features: suite spine · est pages: 16 · difficulty: high · review checklist: spine framed as shared orchestration; cites §3
  - **CH-04.03.03 — Three trust-boundary stores at the platform layer (referenced)** — depends-on: AGI-DOC-0015 §22 · references: SQLCipher/JSON/MMKV/Neon, AGI-TRUST-0001 · related features: storage boundary · est pages: 18 · difficulty: high · review checklist: store separation referenced from §22; trust boundaries honest
  - **CH-04.03.04 — Local Mode product workspace shape** — depends-on: CH-04.03.01 · references: AGI-DOC-0013 Part III §23, local-llm package · related features: Local Mode product · est pages: 16 · difficulty: med · review checklist: Local-never-degraded invariant cited; no cloud-upsell language
  - **CH-04.03.05 — Cloud Mode product workspace shape** — depends-on: CH-04.03.01 · references: AGI-DOC-0013 Part III §24, AGI-DOC-0015 §43 · related features: Cloud Mode product · est pages: 16 · difficulty: high · review checklist: managed-cloud public-alpha posture honest (open by default since 2026-06-27; env kill-switch only; controls keep pace, not gate access)
  - **CH-04.03.06 — Boundary crossings between the two products (referenced)** — depends-on: CH-04.03.03 · references: AGI-TRUST-0002, Local→BYOK fork (glossary) · related features: explicit fork · est pages: 14 · difficulty: high · review checklist: fork referenced not redefined; consent/secret-scan cited from owning docs

#### BK-04.04 — Cloud Services & Managed Control Plane (Platform System)

- **Parent Volume:** VOL-04 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Cloud Services and the Managed control plane as a platform system — the gateway dispatch surface, credit-ledger surface, entitlement checks, and the enterprise/compliance control plane that gates Managed cloud — at the level of WHAT platform systems exist and how surfaces depend on them. Defers all behavioral detail (dispatch algorithm, ledger reconciliation, RLS SQL) to the Cloud Services / Managed Control Plane, Security, and Database runtime books. Cross-refs: AGI-DOC-0015 §43; services/api-gateway. Inputs: `services/api-gateway`, Neon migrations. Outputs: platform-system doc for cloud services. Review: managed gating honest; served-vs-advertised provider asymmetry recorded. BLOCKED on D7, D4, ARCH-D5.
- **Chapters:**
  - **CH-04.04.01 — Cloud Services as a platform tier (referenced)** — depends-on: AGI-DOC-0013 Part IV §25 · references: platform hierarchy, `services/api-gateway` · related features: cloud services tier · est pages: 16 · difficulty: high · review checklist: tier referenced from hierarchy; behavioral detail deferred to runtime book
  - **CH-04.04.02 — Gateway dispatch surface (platform view, detail deferred)** — depends-on: AGI-DOC-0015 §43 · references: `services/api-gateway`, ProviderAdapter (§13) · related features: managed dispatch · est pages: 18 · difficulty: high · review checklist: dispatch surface only; wire/algorithm deferred; cites 4-served reality
  - **CH-04.04.03 — Served-vs-advertised provider asymmetry (current state)** — depends-on: CH-04.04.02 · references: ARCH-D5, AGI-DOC-0015 §50 · related features: capability honesty · est pages: 16 · difficulty: extreme · review checklist: 11-advertised/4-served documented as defect; BLOCKED on ARCH-D5; no target as fact
  - **CH-04.04.04 — Credit ledger and entitlement surface (platform view)** — depends-on: CH-04.04.01 · references: `commercial-and-launch.md`, AGI-TRUST-0003 · related features: metering · est pages: 16 · difficulty: high · review checklist: ledger surface only; BLOCKED on D4/D7; reconciliation deferred to Streaming/Cloud Services books
  - **CH-04.04.05 — Enterprise & compliance control plane (platform gate)** — depends-on: CH-04.04.01 · references: `packages/contracts/compliance`, AGI-COMP-\* · related features: enterprise gating · est pages: 16 · difficulty: high · review checklist: control-plane gate documented; GA criteria BLOCKED on D7
  - **CH-04.04.06 — Cloud Mode database isolation at the platform layer (referenced)** — depends-on: AGI-DOC-0015 §43 · references: RLS dormant state, `apps/web/lib/server/rls-db.ts` · related features: per-user isolation · est pages: 14 · difficulty: high · review checklist: RLS-dormant real state cited; SQL deferred to Database/Security books

#### BK-04.05 — Platform Lifecycle, Extensibility & Cross-Platform Strategy

- **Parent Volume:** VOL-04 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document platform-wide lifecycle and extensibility as a system: cross-platform strategy (how the same platform spans seven build targets), versioning/compatibility posture, and the extension points (skills/plugins/MCP/connectors) at the platform level. Defers behavioral detail to Tool/MCP/Extension Integration and Testing/CI/CD runtime books. Cross-refs: AGI-DOC-0015 §9/§45–54. Inputs: extension manifests, packages/tools/skills, packages/tools/mcp. Outputs: platform lifecycle/extensibility doc. Review: extension points referenced; capability honesty for advertised extensibility.
- **Chapters:**
  - **CH-04.05.01 — Cross-platform strategy (one platform, seven targets)** — depends-on: AGI-DOC-0015 §9 · references: AGI-DOC-0003 §9, seven apps · related features: cross-platform · est pages: 16 · difficulty: high · review checklist: references §9; RN-safe shared-core gap cited as current state
  - **CH-04.05.02 — Versioning & compatibility posture at the platform level** — depends-on: AGI-DOC-0015 §49/§50 · references: `models.json` versioning, semver pins · related features: versioning · est pages: 14 · difficulty: med · review checklist: posture referenced; model version policy cited from SSOT
  - **CH-04.05.03 — Platform extension points (skills/plugins/MCP/connectors) overview** — depends-on: AGI-DOC-0015 §45–47 · references: `packages/tools/skills`, `packages/tools/mcp`, glossary 'connector' · related features: extensibility · est pages: 18 · difficulty: high · review checklist: extension points referenced; behavioral detail deferred to Tool/MCP/Extension book
  - **CH-04.05.04 — Platform feature-flag and rollout governance (platform view)** — depends-on: AGI-DOC-0015 §12 · references: mobile v1FeatureFlags, capability honesty · related features: flag governance · est pages: 14 · difficulty: med · review checklist: flags derive from real capability; honesty enforced
  - **CH-04.05.05 — Platform-wide known structural risks (current honest state)** — depends-on: AGI-DOC-0003 §11 · references: known-flaws.md, AGI-DOC-0015 Appendix A · related features: risk ledger · est pages: 16 · difficulty: med · review checklist: real risks cited; references ledger, does not duplicate flaw entries

#### BK-04.06 — Admin & Ops Console (Platform Control Plane)

- **Parent Volume:** VOL-04 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the admin/ops console as a platform CONTROL-PLANE system (closes gap #32): the org/member/role management surface, policy-enforcement surface, reporting/observability surface, and the moderation/enforcement and DSAR triage operator surface. BK-04.04.05 is a blocked placeholder and PRODUCT.md names /admin with no feature enumeration. Documents WHAT control-plane surfaces exist and how they depend on platform systems; defers all enforcement mechanics to the security/identity/observability runtime books and all moderation/enforcement POLICY to VOL-42 and DSAR PROCESS to VOL-41. Depends on BK-04.04 (managed control plane), VOL-02 BK-02.05 (team-tier product), VOL-20 BK-20.02 (identity/authz). Prereq: team-tier product spec scoped; identity/authz model present. Cross-refs AGI-DOC-0015 §43, PRODUCT.md /admin. Inputs: services/api-gateway, entitlement surface. Outputs: admin/ops console platform-system doc. Review: Architecture + Security + founder sign-off (control-plane gating). BLOCKED on D1/D8 (tier scope) and D7 (managed GA gating).
- **Chapters:**
  - **CH-04.06.01 — Admin console as a platform control-plane surface (referenced)** — depends-on: BK-04.04 · references: AGI-DOC-0015 §43, PRODUCT.md /admin, `services/api-gateway` · related features: admin console · est pages: 5 · difficulty: high · review checklist: control-plane surface only; mechanics deferred to runtime books; BLOCKED on D7
  - **CH-04.06.02 — Org/member/role management surface (references identity/authz)** — depends-on: CH-04.06.01 · references: VOL-20 BK-20.02 authz, VOL-02 BK-02.05 team tier · related features: org management · est pages: 4 · difficulty: high · review checklist: BLOCKED on D1/D8; authz mechanics deferred to VOL-20; product semantics deferred to VOL-02
  - **CH-04.06.03 — Policy-enforcement and reporting/observability operator surface** — depends-on: CH-04.06.01 · references: VOL-21 observability, VOL-32 ops runbooks · related features: policy console · est pages: 5 · difficulty: high · review checklist: signal contracts deferred to VOL-21; operator usage only; no observability redefinition
  - **CH-04.06.04 — Moderation/enforcement and DSAR triage operator surface (references VOL-42/VOL-41)** — depends-on: CH-04.06.01 · references: VOL-42 BK-42.01/40.03 moderation+enforcement, VOL-41 BK-41.03 DSAR · related features: triage console · est pages: 4 · difficulty: high · review checklist: moderation/enforcement POLICY deferred to VOL-42; DSAR PROCESS deferred to VOL-41; console hosts actions only

#### BK-04.07 — Module Boundary, Monorepo & Dependency Governance

- **Parent Volume:** VOL-04 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Own the platform-level enforcement spec the other VOL-04 books defer to: the inward-only dependency law as enforced (`check-boundaries.mjs`), the package/crate export-surface contract, central dependency version-pin enforcement, naming-lock enforcement, and monorepo workspace-member governance — documenting honestly the current enforcement gaps (Rust crate boundary check unenforced; bare-string exports). This is the orphaned inheriting book named by BK-04.01/BK-04.02 ("detail deferred to dependency-governance book"); VOL-04 is its most defensible home because VOL-04 documents the monorepo as a platform subject. Depends on BK-04.01 (platform shape) and BK-04.02 (SSOT consumption). Prereq: ARCH-D16/D17 owner decisions for enforced-vs-target framing of the boundary checks. Cross-refs: VOL-03 BK-03.02 (boundary honesty, ARCH-D16/D17), AGI-DOC-0015 §6/§47–48, AGI-ARCH-0002. Inputs: `scripts/check-boundaries.mjs`, `pnpm-workspace.yaml`, `Cargo.toml` member globs, root version pins, `@agiworkforce/*`/`agiworkforce-*` names. Outputs: the dependency-governance enforcement spec referenced by every other VOL-04 book. Review: enforcement gaps recorded as current state, not aspiration; BLOCKED on ARCH-D16/D17 for enforced-vs-target framing; no rename instruction (naming-lock honored).
- **Chapters:**
  - **CH-04.07.01 — Inward-only dependency law as enforced (check-boundaries.mjs)** — depends-on: AGI-DOC-0015 §6 · references: `scripts/check-boundaries.mjs`, AGI-ARCH-0002 · related features: boundary enforcement · est pages: 18 · difficulty: high · review checklist: enforcement cited from script; cites AGI-ARCH-0002; inward-only law referenced from §6 not redefined
  - **CH-04.07.02 — Package & crate export-surface contract (declared exports, no deep imports)** — depends-on: CH-04.07.01 · references: declared package exports, `@agiworkforce/*`, `agiworkforce-*` · related features: export surface · est pages: 16 · difficulty: high · review checklist: widen-the-package rule cited; deep-import prohibition stated; defers composition rule to VOL-05 BK-05.01
  - **CH-04.07.03 — Rust crate boundary check (unenforced) & bare-string export gaps (current state)** — depends-on: AGI-DOC-0003 §11 · references: AGI-DOC-0014 §9 ARCH-D16/D17, AGI-DOC-0015 §47–48 · related features: boundary honesty · est pages: 16 · difficulty: high · review checklist: gaps recorded as current state; BLOCKED on ARCH-D16/D17; no target asserted as fact
  - **CH-04.07.04 — Central dependency version-pin enforcement (platform discipline)** — depends-on: CH-04.07.01 · references: root package.json pins, Node 24 LTS, pnpm 9.15.3 · related features: version governance · est pages: 14 · difficulty: med · review checklist: pins cited from config; stale-dependency-surface gap referenced from BK-04.01 not duplicated
  - **CH-04.07.05 — Naming-lock enforcement (package/crate/product names)** — depends-on: CH-04.07.02 · references: AGI-NAME-0001, naming-conventions · related features: naming lock · est pages: 14 · difficulty: med · review checklist: naming-lock honored; no rename instruction; references naming SSOT not restated
  - **CH-04.07.06 — Monorepo workspace-member governance (pnpm + Cargo member globs)** — depends-on: CH-04.07.01 · references: `pnpm-workspace.yaml`, `Cargo.toml` member globs · related features: workspace governance · est pages: 14 · difficulty: med · review checklist: member globs cited from real config; membership rules referenced from BK-04.01 platform shape

## VOL-05 — Applications

- **Volume ID:** VOL-05 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Define the documentation home for application composition — the disciplined act of assembling each of the seven build targets from the shared four-layer stack into a runnable application, without inverting dependency direction, re-implementing lower layers, reaching sideways into another app, or re-authoring trust-boundary meaning. This volume documents the composition mechanics common to applications (how Orchestration wires over Mechanics over Contracts plus a host shell), the surface-class partition as applied to application packaging, how Experiences and Capabilities are composed into applications, and feature-flag/environment-detection governance. It is distinct from VOL-04 (platform systems beneath applications) and VOL-06 (per-surface presentation above composition).
- **Scope:** IN: application composition discipline and rules; the SyncedApp/DeveloperSession partition as applied to app packaging and sync eligibility; how Experiences (Chat/Code/Agent/Research) and Capabilities are composed from shared contracts into applications; composition-layer feature flags and environment detection; the suite-spine-to-application wiring pattern. OUT: per-surface presentation/shell specifics (VOL-06); platform systems beneath (VOL-04); the Experience/Capability behavioral contracts themselves (owned by AGI-DOC-0015 §12 and the Surface/Experience/Capability runtime book — referenced); trust-mode law (referenced from AGI-DOC-0015 §23–27).
- **Owner:** Principal Application Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002, AGI-DOC-0005, AGI-DOC-0007, AGI-DOC-0008
- **Dependencies:** VOL-04 (platform systems applications compose) · **Prerequisites:** VOL-04 platform-shape and shared-infrastructure books drafted; Surface/Experience/Capability runtime book scoped
- **Review Process:** Documentation compiler 10-rule validation; Architecture review (composition rules, no sideways imports, trust-copy sourced from contracts); cross-reference review to ensure Experience/Capability ownership not duplicated
- **Audience:** engineers, AI agents, surface/application leads
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / med / 2 / ~310 pages across 4 books
- **Inherits / References (no duplication):** AGI-DOC-0015 §10/§11/§12; AGI-DOC-0013 Part IV §25–26; VOL-04 BK-04.01/BK-04.02/BK-04.03; Surface/Experience/Capability Spec, AI Runtime Spec (referenced)

### Books

#### BK-05.01 — Application Composition Discipline

- **Parent Volume:** VOL-05 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the binding composition rules: assemble Orchestration over Mechanics over Contracts plus host shell; never invert dependencies, never re-implement a lower layer, never reach sideways into another app, never re-author trust copy. References AGI-DOC-0015 §11. Cross-refs: VOL-04 BK-04.01 (four-layer stack). Inputs: suite-contracts display tables. Outputs: composition-discipline doc consumed by every surface book. Review: composition rule cited from §11; sideways-import prohibition tied to AGI-ARCH-0002.
- **Chapters:**
  - **CH-05.01.01 — Application as the top of the stack (referenced from §11)** — depends-on: AGI-DOC-0015 §11 · references: VOL-04 BK-04.01, AGI-DOC-0003 §2 · related features: composition · est pages: 16 · difficulty: med · review checklist: references §11; does not restate four-layer law
  - **CH-05.01.02 — No-sideways-import and widen-the-package rule** — depends-on: AGI-ARCH-0002 · references: `check-boundaries.mjs`, declared exports · related features: boundary enforcement · est pages: 14 · difficulty: med · review checklist: cites AGI-ARCH-0002; deep-import prohibition stated
  - **CH-05.01.03 — Trust-boundary copy sourced from contracts, never re-authored** — depends-on: AGI-DOC-0015 §11 · references: `PRIVACY_MODE_DISPLAY`, `PROVIDER_MODE_DISPLAY`, `CHAT_EXECUTION_MODE_DISPLAY` · related features: capability honesty · est pages: 14 · difficulty: high · review checklist: frozen display tables cited; no hardcoded trust wording allowed
  - **CH-05.01.04 — Suite-spine-to-application wiring pattern** — depends-on: CH-05.01.01 · references: `packages/ui/unified-chat`, per-surface runtimes · related features: suite spine · est pages: 16 · difficulty: high · review checklist: spine framed as orchestration; per-surface runtime convergence cited as current gap
  - **CH-05.01.05 — Environment detection and host integration boundary** — depends-on: AGI-DOC-0015 §10 · references: surface shell, `evaluateModelEnvironment` · related features: env detection · est pages: 14 · difficulty: med · review checklist: env fitness fail-closed cited; detail deferred to capability runtime book

#### BK-05.02 — Surface-Class Application Partition

- **Parent Volume:** VOL-05 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document how the typed SyncedAppSurface/DeveloperSessionSurface partition shapes application packaging, sync eligibility, and session-scope at the composition layer. References AGI-DOC-0015 §10 and AGI-SYNC-0001 — does not redefine the partition or the sync transport (owned by Session & Synchronization book). Cross-refs: VOL-04 BK-04.03. Inputs: `suite-contracts.ts` `assertSurfaceCanSyncChats`. Outputs: partition-as-applied doc. Review: partition referenced; developer-surface rejection cited as runtime guard.
- **Chapters:**
  - **CH-05.02.01 — SourceSurface enum and its two partitions (referenced)** — depends-on: AGI-DOC-0015 §10 · references: `packages/contracts/types/src/suite-contracts.ts`, AGI-SURF-0001 · related features: surface identity · est pages: 14 · difficulty: med · review checklist: enum referenced; sandbox-is-infrastructure noted
  - **CH-05.02.02 — Synced-app applications (web/desktop/mobile) packaging** — depends-on: CH-05.02.01 · references: shared cloud chat store, AGI-SYNC-0001 · related features: synced apps · est pages: 16 · difficulty: high · review checklist: sync eligibility cited; transport deferred to sync book
  - **CH-05.02.03 — Developer-session applications (cli/vscode/chrome) packaging** — depends-on: CH-05.02.01 · references: `assertSurfaceCanSyncChats` L185–195, AGI-SYNC-0001 · related features: developer surfaces · est pages: 16 · difficulty: high · review checklist: fail-fast rejection cited; workspace-scoped sessions stated
  - **CH-05.02.04 — Sync-boundary handoff at the application layer (referenced)** — depends-on: CH-05.02.03 · references: redacted-preview handoff, AGI-TRUST-0002 · related features: explicit handoff · est pages: 14 · difficulty: high · review checklist: handoff referenced from trust docs; consent cited not redefined

#### BK-05.03 — Composition of Experiences & Capabilities into Applications

- **Parent Volume:** VOL-05 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document how the four Experiences (Chat/Code/Agent/Research) and the Capabilities they assemble are composed into applications as shared primitives, never per-surface apps. References the Experience/Capability ownership in AGI-DOC-0013 §25 and AGI-DOC-0015 §12 — does not redefine Experiences/Capabilities (owned by the Surface/Experience/Capability runtime book). Cross-refs: capability honesty §12. Inputs: ChatIntentKind, FocusMode, AgentMode, command-capabilities. Outputs: composition-of-experiences doc. Review: single-owner per Experience/Capability; honesty enforced. BLOCKED on unified-Experience-primitive decision.
- **Chapters:**
  - **CH-05.03.01 — Experiences as shared primitives composed into apps (referenced)** — depends-on: AGI-DOC-0013 §25 · references: AGI-DOC-0015 §12 · related features: experiences · est pages: 16 · difficulty: high · review checklist: experiences referenced from constitution; never standalone apps; ownership single
  - **CH-05.03.02 — Current divergence of experience modeling (current state)** — depends-on: CH-05.03.01 · references: ChatIntentKind L279–290, web FocusMode, design-system AgentMode, desktop DeepResearchPanel · related features: experience drift · est pages: 16 · difficulty: extreme · review checklist: four divergent systems documented as current state; BLOCKED on unified-primitive decision
  - **CH-05.03.03 — Capabilities composed into Experiences (referenced)** — depends-on: AGI-DOC-0013 §25 · references: Projects/Memory/Artifacts/Connectors/Skills/Plugins/Computer Use/Voice/Search/Generated Files/Dispatch · related features: capabilities · est pages: 16 · difficulty: high · review checklist: each capability single-owner; behavioral detail deferred to capability volume
  - **CH-05.03.04 — Runtime-tier dispatch in composition (referenced)** — depends-on: AGI-DOC-0015 §12 · references: `RuntimeTier`, `packages/client/client-runtime/src/registry.ts`, `command-capabilities.ts` · related features: runtime fitness · est pages: 14 · difficulty: high · review checklist: fail-safe default cited; dispatch detail deferred to runtime book
  - **CH-05.03.05 — Capability honesty at composition (no advertise-beyond-backend)** — depends-on: AGI-DOC-0015 §12 · references: `evaluateModelEnvironment` L211–224 · related features: honesty · est pages: 14 · difficulty: high · review checklist: pickers/badges derive from real capability; fail-closed cited

#### BK-05.04 — Composition-Layer Feature Flags & Lifecycle

- **Parent Volume:** VOL-05 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document feature-flag governance, gating, and application lifecycle at the composition layer — how an application turns capabilities on/off per surface without re-authoring trust meaning, and how launch posture maps to composed flags. References VOL-04 BK-04.05 platform flag governance and capability honesty §12. Cross-refs: commercial-and-launch.md launch posture. Inputs: mobile v1FeatureFlags. Outputs: composition-flag doc. Review: flags derive from real capability; launch posture cited not invented.
- **Chapters:**
  - **CH-05.04.01 — Feature flags as composition gates (referenced)** — depends-on: VOL-04 BK-04.05 · references: mobile `v1FeatureFlags`, AGI-TRUST-0004 · related features: flag gating · est pages: 14 · difficulty: med · review checklist: flags referenced from platform; honesty enforced
  - **CH-05.04.02 — Launch posture as composed availability (referenced)** — depends-on: AGI-DOC-0013, commercial-and-launch.md · references: launch posture table, AGI-TRUST-0003 · related features: launch gating · est pages: 16 · difficulty: high · review checklist: managed public-alpha posture cited (open by default; env kill-switch only); no fake availability badges
  - **CH-05.04.03 — Per-surface mode availability composed from typed identity** — depends-on: BK-05.02 · references: trust-mode-surface-matrix.md (referenced), AGI-SURF-0001 · related features: mode availability · est pages: 14 · difficulty: med · review checklist: matrix referenced not reproduced; modes derive from surface identity
  - **CH-05.04.04 — Application lifecycle and rollout (composition view)** — depends-on: AGI-DOC-0015 §45–54 · references: build/release gates · related features: lifecycle · est pages: 14 · difficulty: med · review checklist: lifecycle referenced; CI/release detail deferred to Testing/CI/CD book

## VOL-06 — Surfaces

- **Volume ID:** VOL-06 · **Generation Priority:** P2 · **Difficulty:** high
- **Purpose:** Define the documentation home for surface-specific architecture and presentation — one book per build target. Each surface book documents only what is surface-specific and cannot be shared: the platform shell, host integration, environment detection, and presentation layer. Cross-surface logic (Experiences, Capabilities, runtimes, sync) lives in other volumes and is referenced, never re-authored. This volume's 8 books cover the six product surfaces — Web (BK-06.01), Desktop (BK-06.02), Mobile (BK-06.03), CLI (BK-06.04), Chrome Extension (BK-06.05), and VS Code Extension (BK-06.06) — plus the Sandbox isolation primitive (BK-06.07) and the Cross-Surface Presentation Parity & Surface Reuse book (BK-06.08). VS Code (BK-06.06) is a distinct sixth surface book with its own webview + editor-host shell; it shares developer-session runtime and trust identity with CLI (BK-06.04) but is not subsumed by it — each documents a separate host shell.
- **Scope:** IN: per-surface platform shell, host bridge/IPC, presentation/rendering, surface-local presentation state, environment detection specifics, and per-surface current-state risks. OUT: all cross-surface logic (Experiences/Capabilities — VOL-05; runtimes — Architecture Constitution runtime books); composition discipline (VOL-05); platform systems (VOL-04); the trust-mode matrix itself (owned by AGI-DOC-0003 §3 — referenced); sync transport (owned by Session & Synchronization book — referenced).
- **Owner:** Principal Surface Architect (per-surface engineer owners under)
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002, AGI-DOC-0005, AGI-DOC-0007, AGI-DOC-0008
- **Dependencies:** VOL-05 (application composition), VOL-04 (platform systems) · **Prerequisites:** VOL-05 composition discipline drafted; VOL-04 platform-shape drafted; per-surface AGENTS.md files available
- **Review Process:** Documentation compiler 10-rule validation; Surface engineer review per book; trust-boundary review for surfaces offering Local/BYOK; honest-current-state review for desktop (broken local chat) and disabled-build surfaces
- **Audience:** engineers, AI agents, per-surface owners
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / med / 2 / ~440 pages across 8 books
- **Inherits / References (no duplication):** AGI-DOC-0015 §10 (surface identity), AGI-DOC-0003 §3/§11; VOL-05 BK-05.01/BK-05.02; VOL-04 platform systems; AGI-DOC-0004 surface terms; Session & Synchronization Spec, Security Spec (referenced)

### Books

#### BK-06.01 — Web Surface

- **Parent Volume:** VOL-06 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the web surface presentation: Next.js 16 App Router shell, proxy.ts edge, Cloud-only trust posture, synced-chat presentation. References VOL-05 composition and AGI-DOC-0003 §3 matrix. Inputs: `apps/web`. Outputs: web surface doc. Review: Cloud-only posture cited; proxy.ts not renamed to middleware; BLOCKED on D8/launch posture for available-vs-target modes.
- **Chapters:**
  - **CH-06.01.01 — Web shell architecture (Next.js 16 App Router)** — depends-on: VOL-05 BK-05.01 · references: `apps/web`, App Router · related features: web shell · est pages: 16 · difficulty: med · review checklist: Next.js 16 verified; no invented routes
  - **CH-06.01.02 — Edge proxy (proxy.ts) and host integration** — depends-on: CH-06.01.01 · references: `apps/web/proxy.ts` · related features: edge · est pages: 14 · difficulty: med · review checklist: proxy.ts not renamed to middleware.ts; exported proxy function cited
  - **CH-06.01.03 — Web trust posture (Cloud-only) and synced-chat presentation** — depends-on: AGI-DOC-0003 §3 · references: trust-mode-surface-matrix.md (referenced), AGI-SYNC-0001 · related features: cloud-only · est pages: 16 · difficulty: high · review checklist: Cloud-only cited; no Local/BYOK on web; matrix referenced; BLOCKED on launch posture
  - **CH-06.01.04 — Web presentation layer and shared-UI reuse** — depends-on: VOL-05 BK-05.01 · references: `packages/ui/ui`, shared components · related features: presentation · est pages: 16 · difficulty: med · review checklist: shared-package reuse cited; no per-surface rewrite of shared UI

#### BK-06.02 — Desktop Surface

- **Parent Volume:** VOL-06 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the desktop surface presentation: Tauri shell, Rust host bridge, IPC presentation boundary, Local+BYOK+Cloud posture. References AGI-DOC-0003 §3/§11. Inputs: `apps/desktop`. Outputs: desktop surface doc. Review: trust posture cited; broken-local-chat and disabled-build current state recorded honestly. BLOCKED on LOCAL-CHAT-NOINVOKE-01.
- **Chapters:**
  - **CH-06.02.01 — Desktop shell architecture (Tauri + Rust host)** — depends-on: VOL-05 BK-05.01 · references: `apps/desktop`, `apps/desktop/src-tauri` · related features: desktop shell · est pages: 16 · difficulty: high · review checklist: Tauri/Rust host cited; no invented IPC
  - **CH-06.02.02 — IPC presentation boundary (front-end ↔ Rust)** — depends-on: CH-06.02.01 · references: Tauri invoke, IPC commands · related features: IPC · est pages: 16 · difficulty: high · review checklist: IPC boundary cited; broken invoke (LOCAL-CHAT-NOINVOKE-01) recorded
  - **CH-06.02.03 — Desktop trust posture (Local + BYOK + Cloud) and egress** — depends-on: AGI-DOC-0003 §3 · references: `apps/desktop/src/lib/egressGuard.ts`, AGI-TRUST-0001 · related features: egress guard · est pages: 18 · difficulty: high · review checklist: egress opt-in honest state cited; trust modes referenced from matrix
  - **CH-06.02.04 — Desktop presentation and current-state risks** — depends-on: AGI-DOC-0003 §11 · references: known-flaws.md, disabled desktop builds · related features: risk · est pages: 14 · difficulty: med · review checklist: broken local chat and disabled builds documented as real state; BLOCKED on LOCAL-CHAT-NOINVOKE-01

#### BK-06.03 — Mobile Surface

- **Parent Volume:** VOL-06 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the mobile surface presentation: Expo/React Native shell, MMKV-backed presentation state, RN-safe rendering constraints, Local+Cloud (no BYOK) posture. References AGI-DOC-0003 §3 and RN-safe shared-core gap. Inputs: `apps/mobile`. Outputs: mobile surface doc. Review: no-BYOK posture cited (AGI-TRUST-0004); RN-safe constraint as current gap. BLOCKED on D8/launch posture.
- **Chapters:**
  - **CH-06.03.01 — Mobile shell architecture (Expo / React Native)** — depends-on: VOL-05 BK-05.01 · references: `apps/mobile` · related features: mobile shell · est pages: 16 · difficulty: high · review checklist: Expo/RN cited; no invented native modules
  - **CH-06.03.02 — Mobile presentation state (MMKV) and storage boundary** — depends-on: AGI-DOC-0015 §22 · references: MMKV store · related features: mobile storage · est pages: 14 · difficulty: med · review checklist: MMKV cited; trust-boundary store referenced from §22
  - **CH-06.03.03 — Mobile trust posture (Local + Cloud, no BYOK)** — depends-on: AGI-DOC-0003 §3 · references: `v1FeatureFlags.byokKeys=false`, AGI-TRUST-0004 · related features: no-BYOK · est pages: 16 · difficulty: high · review checklist: no-BYOK cited from AGI-TRUST-0004; matrix referenced; BLOCKED on launch posture
  - **CH-06.03.04 — RN-safe shared chat core constraint (current gap)** — depends-on: AGI-DOC-0015 §9 · references: RN-safe shared-core gap · related features: cross-platform · est pages: 14 · difficulty: high · review checklist: no-RN-safe-shared-core documented as current state; remediation deferred

#### BK-06.04 — CLI Surface

- **Parent Volume:** VOL-06 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the CLI surface presentation: terminal/Ratatui rendering, workspace-scoped session presentation, render-context, developer-session (non-sync) posture. References VOL-05 BK-05.02 (developer surfaces). Inputs: `apps/cli`. Outputs: CLI surface doc. Review: developer-session non-sync posture cited; Rust provider runtime divergence referenced as current state.
- **Chapters:**
  - **CH-06.04.01 — CLI shell and terminal rendering architecture** — depends-on: VOL-05 BK-05.01 · references: `apps/cli`, Ratatui · related features: TUI · est pages: 16 · difficulty: high · review checklist: Ratatui/render-context cited; no invented commands
  - **CH-06.04.02 — Workspace-scoped developer-session presentation** — depends-on: VOL-05 BK-05.02 · references: AGI-SYNC-0001, JSON/JSONL store · related features: developer session · est pages: 14 · difficulty: med · review checklist: non-sync developer surface cited; workspace scope stated
  - **CH-06.04.03 — CLI trust posture (Local + BYOK + Cloud, subscription) and egress gap** — depends-on: AGI-DOC-0003 §3 · references: `apps/cli/src/agent/mod.rs`, no-egress-guard gap · related features: trust posture · est pages: 16 · difficulty: high · review checklist: CLI-has-no-egress-guard current gap cited; modes referenced from matrix
  - **CH-06.04.04 — CLI provider runtime divergence (current state, referenced)** — depends-on: AGI-DOC-0015 §13 · references: `apps/cli/src/models/mod.rs` Provider enum · related features: provider runtime · est pages: 14 · difficulty: high · review checklist: Rust runtime divergence cited as current state; convergence target referenced not asserted

#### BK-06.05 — Chrome Extension Surface

- **Parent Volume:** VOL-06 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the Chrome extension surface presentation: background/side-panel composition, isolated chat store presentation, computer-use panel, Cloud-only isolated posture. References VOL-05 BK-05.02. Inputs: `apps/extension`. Outputs: chrome surface doc. Review: isolated chat store cited; computer-use default-ask posture honest (computer-use allow-all flaw recorded).
- **Chapters:**
  - **CH-06.05.01 — Chrome extension shell (background + side panel)** — depends-on: VOL-05 BK-05.01 · references: `apps/extension/src/background.ts`, side-panel · related features: extension shell · est pages: 16 · difficulty: high · review checklist: background/side-panel cited; no invented permissions
  - **CH-06.05.02 — Isolated chat store presentation (Chrome)** — depends-on: VOL-05 BK-05.02 · references: AGI-SYNC-0001, isolated store · related features: isolated chat · est pages: 14 · difficulty: med · review checklist: Chrome-isolated cited; not in shared cloud store
  - **CH-06.05.03 — Computer-use panel presentation and consent posture** — depends-on: AGI-DOC-0015 §16 · references: `apps/extension/src/features/side-panel/computerUsePanel.ts`, THREAT_MODEL.md · related features: computer use · est pages: 16 · difficulty: high · review checklist: default-ask consent cited; computer-use allow-all current flaw recorded honestly
  - **CH-06.05.04 — Chrome trust posture (Cloud-only) and threat model reference** — depends-on: AGI-DOC-0003 §3 · references: `apps/extension/THREAT_MODEL.md`, matrix · related features: cloud-only · est pages: 14 · difficulty: med · review checklist: Cloud-only cited; threat model referenced not duplicated

#### BK-06.06 — VS Code Extension Surface

- **Parent Volume:** VOL-06 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the VS Code extension surface presentation: webview composition, editor-host integration, workspace-scoped developer-session presentation, Local+BYOK+Cloud (subscription) posture. References VOL-05 BK-05.02. Inputs: `apps/extension-vscode`. Outputs: vscode surface doc. Review: developer-session non-sync posture cited; editor-host boundary documented.
- **Chapters:**
  - **CH-06.06.01 — VS Code extension shell (webview + editor host)** — depends-on: VOL-05 BK-05.01 · references: `apps/extension-vscode` · related features: vscode shell · est pages: 16 · difficulty: high · review checklist: webview/editor host cited; no invented APIs
  - **CH-06.06.02 — Editor-host integration and presentation boundary** — depends-on: CH-06.06.01 · references: VS Code extension API surface · related features: host integration · est pages: 14 · difficulty: med · review checklist: host boundary cited; presentation-only scope
  - **CH-06.06.03 — Workspace-scoped developer-session posture** — depends-on: VOL-05 BK-05.02 · references: AGI-SYNC-0001 · related features: developer session · est pages: 14 · difficulty: med · review checklist: non-sync developer surface cited; workspace scope stated
  - **CH-06.06.04 — VS Code trust posture (Local + BYOK + Cloud, subscription)** — depends-on: AGI-DOC-0003 §3 · references: matrix, AGI-TRUST-0004 · related features: trust posture · est pages: 14 · difficulty: med · review checklist: modes referenced from matrix; subscription gating cited

#### BK-06.07 — Sandbox Isolation Surface

- **Parent Volume:** VOL-06 · **Canonical Status:** planned · **Generation Order:** 7
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the Sandbox as an isolation primitive (not a product surface): static cross-origin artifact renderer, sandboxed-iframe presentation contract. References AGI-DOC-0004 'AGI Sandbox' and AGI-DOC-0015 §10 (sandbox is infrastructure, not in SourceSurface). Inputs: `apps/sandbox`. Outputs: sandbox doc. Review: framed as isolation primitive; not advertised as a client surface.
- **Chapters:**
  - **CH-06.07.01 — Sandbox as an isolation primitive (referenced)** — depends-on: AGI-DOC-0004 · references: `apps/sandbox`, glossary 'AGI Sandbox' · related features: isolation · est pages: 14 · difficulty: med · review checklist: infrastructure-not-surface cited from §10; not in SourceSurface
  - **CH-06.07.02 — Static cross-origin artifact renderer presentation** — depends-on: CH-06.07.01 · references: `apps/sandbox/index.html`, `vercel.json` · related features: artifact rendering · est pages: 14 · difficulty: med · review checklist: cross-origin rendering cited; no invented runtime
  - **CH-06.07.03 — Sandboxed-iframe presentation contract and isolation guarantees** — depends-on: AGI-DOC-0015 §23 · references: sandbox-policy crate (referenced), security boundary · related features: isolation contract · est pages: 16 · difficulty: high · review checklist: isolation guarantees referenced from Security book; not redefined

#### BK-06.08 — Cross-Surface Presentation Parity & Surface Reuse

- **Parent Volume:** VOL-06 · **Canonical Status:** planned · **Generation Order:** 8
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document presentation parity rules across surfaces and the shared-UI reuse mandate (build UI in shared packages so desktop/web/mobile reuse, not rewrite). References AGI-DOC-0015 §11 (no re-implementation) and the shared-packages reuse principle. Inputs: `packages/ui/ui`, `packages/ui/design-tokens`. Outputs: parity/reuse doc. Review: reuse-not-rewrite cited; presentation parity does not leak cross-surface logic. Cross-references all BK-06.01..07.
- **Chapters:**
  - **CH-06.08.01 — Shared-UI reuse mandate across surfaces** — depends-on: AGI-DOC-0015 §11 · references: `packages/ui/ui`, `packages/ui/design-tokens` · related features: shared UI · est pages: 16 · difficulty: med · review checklist: reuse-not-rewrite cited; website==desktop-minus-extras principle referenced
  - **CH-06.08.02 — Presentation parity rules (what may differ per surface)** — depends-on: CH-06.08.01 · references: per-surface shells BK-06.01..07 · related features: parity · est pages: 16 · difficulty: med · review checklist: only host/shell may differ; cross-surface logic stays in VOL-05/runtimes
  - **CH-06.08.03 — Design tokens and theme as shared presentation SSOT** — depends-on: CH-06.08.01 · references: `packages/ui/design-tokens` · related features: theming · est pages: 14 · difficulty: med · review checklist: tokens framed as shared SSOT; no per-surface token fork
  - **CH-06.08.04 — Surface presentation current-state divergences (honest)** — depends-on: AGI-DOC-0003 §11 · references: known-flaws.md, per-surface gaps · related features: divergence ledger · est pages: 14 · difficulty: med · review checklist: real divergences cited; references ledger not duplicated

#### BK-06.09 — Desktop Command & Native-Messaging Interface Contracts

- **Parent Volume:** VOL-06 · **Canonical Status:** planned · **Generation Order:** 9
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the desktop-specific surface interface contracts that BK-06.02 names but does not enumerate: the Tauri command surface (the front-end↔Rust invoke boundary) and the native-messaging desktop↔extension bridge transport. CH-06.02.02 (IPC presentation boundary) remains the IPC-boundary owner — this book references it and owns only the enumerated command/transport contracts (the command catalog shape, args/returns/errors/versioning discipline, and the native-messaging transport framing). The bridge THREAT MODEL is owned by VOL-20 BK-20.05 (CH-20.05.08) — this book is referenced by it, never the other way. Inherits VOL-06 Required Constitutions. Depends on BK-06.02 (desktop shell) and references VOL-26 (API patterns) and VOL-04 (platform shape). Inputs: `apps/desktop/src-tauri` command handlers, native-messaging host. Outputs: command-contract + native-messaging transport docs. Review: Surface engineer review; trust-boundary review (command surface crosses Local/host boundary); honest current-state review (broken invoke LOCAL-CHAT-NOINVOKE-01).
- **Chapters:**
  - **CH-06.09.01 — Tauri command surface contract (args / returns / errors / versioning)** — depends-on: CH-06.02.02 · references: `apps/desktop/src-tauri/src/lib.rs` invoke_handler, `tauri::command` handlers · related features: desktop IPC commands · est pages: 16 · difficulty: high · review checklist: references CH-06.02.02 as IPC-boundary owner; command catalog grounded in real `#[command]` handlers; no invented commands
  - **CH-06.09.02 — Command error envelope & versioning discipline** — depends-on: CH-06.09.01 · references: VOL-26 (API error-envelope patterns, referenced), §48 · related features: command versioning · est pages: 12 · difficulty: high · review checklist: error envelope referenced to API patterns not re-owned; versioning discipline grounded; no leakage of internal errors
  - **CH-06.09.03 — Native-messaging desktop↔extension bridge transport contract** — depends-on: CH-06.09.01 · references: `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`, `apps/desktop/src-tauri/src/sys/commands/native_messaging.rs`, computerUsePanel.ts · related features: ext↔desktop handoff · est pages: 16 · difficulty: high · review checklist: transport framing grounded in real native-messaging host; threat model deferred to VOL-20 CH-20.05.08 not duplicated
  - **CH-06.09.04 — Broken-invoke current state (LOCAL-CHAT-NOINVOKE-01) & command-surface risks** — depends-on: CH-06.09.01 · references: known-flaws LOCAL-CHAT-NOINVOKE-01, AGI-DOC-0003 §11 · related features: desktop current-state risk · est pages: 12 · difficulty: med · review checklist: broken invoke recorded as real state; BLOCKED on LOCAL-CHAT-NOINVOKE-01; references ledger not duplicated
  - **CH-06.09.05 — Capability-gating at the command/bridge boundary (presentation scope)** — depends-on: CH-06.09.03 · references: AGI-DOC-0015 §16 (computer use), CH-06.05.03 · related features: capability gating · est pages: 12 · difficulty: high · review checklist: presentation-scope gating only; enforcement/threat owned by VOL-20 referenced not re-owned; default-ask consent posture cited

## Part C — Experiences, Capabilities & Features (VOL-07…09)

## VOL-07 — Experiences

- **Volume ID:** VOL-07 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Document the four canonical cross-surface Experiences — AGI Chat, AGI Code, AGI Agent, AGI Research — at the product-elaboration layer: how each manifests across the Surfaces that support it, which Capabilities it composes, what its surface×trust-mode availability is, and how it maps onto the enforceable Experience primitive. This volume documents the _product manifestation_ of Experiences; it does not define them (Platform Constitution owns that) and does not own the runtime primitive (the Surface/Experience/Capability Spec owns that).
- **Scope:** IN — per-Experience cross-surface manifestation, capability-composition record, surface availability map, current-vs-target availability per surface, traceability to requirement IDs. OUT — canonical Experience definitions (AGI-DOC-0013 §25), the enforceable Experience primitive / ChatIntentKind-FocusMode-AgentMode reconciliation mechanics (AGI-DOC-0015 §1173 Surface/Experience/Capability Spec), per-surface app internals (VOL Platforms cluster), capability internals (VOL-08), runtime behavior (AGI-DOC-0015 inheriting books).
- **Owner:** Principal Product Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits documentation governance (AGI-DOC-0002), requirement system (AGI-DOC-0005), cross-reference system (AGI-DOC-0007), compiler (AGI-DOC-0008).
- **Dependencies:** VOL-08 (Capabilities — Experiences are composed from Capabilities) · **Prerequisites:** AGI-DOC-0013 §25 hierarchy stable; trust-mode-surface-matrix.md current; VOL-08 capability books drafted enough to reference.
- **Review Process:** Product-architecture review (hierarchy/ownership correctness) + capability-honesty review (availability claims derive from real backend, not advertised) + trust-boundary review for any cross-surface claim + documentation-compiler 10-rule gate.
- **Audience:** founders, product engineers, AI agents composing surfaces.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** med / high / 3 / ~210 pages across 5 books
- **Inherits / References (no duplication):** References AGI-DOC-0013 §25 for Experience definitions; references AGI-DOC-0015 §1173 ("Surface, Experience & Capability Specification") for the enforceable Experience primitive — does NOT split, merge, or restate that runtime book, only elaborates the product layer above it; references trust-mode-surface-matrix.md for availability rules; references VOL-08 books for capability composition.

### Books

#### BK-07.01 — AGI Chat Experience

- **Parent Volume:** VOL-07 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document AGI Chat (conversation) as a cross-surface Experience. Depends on VOL-08 (Memory, Artifacts, Connectors, Search, Generated Files). Prereqs: AGI-DOC-0013 §25; AGI-PROD-0001 (one chat). Cross-refs: trust-mode-surface-matrix.md, AGI-DOC-0004 'one chat'. Inputs: canonical Experience definition, surface roster. Outputs: chat manifestation map, capability-composition record. Review: capability-honesty, trust-boundary, one-chat-invariant.
- **Chapters:**
  - **CH-07.01.01 — AGI Chat as a cross-surface Experience (not an app)** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25, canonical-glossary 'Experience' · related features: one-chat · est pages: 8 · difficulty: med · review checklist: references-not-restates definition; cross-surface not per-app
  - **CH-07.01.02 — Surface availability map (Web/Desktop/Mobile/CLI/VS Code/Chrome)** — depends-on: trust-mode-surface-matrix.md · references: AGI-SURF-0001, trust-mode-surface-matrix.md · related features: surface gating · est pages: 9 · difficulty: med · review checklist: matches canonical matrix; capability-honesty; no invented surface support
  - **CH-07.01.03 — Capabilities composed into Chat (Memory/Artifacts/Connectors/Search/Generated Files/Voice)** — depends-on: VOL-08 · references: BK-08.02/03/04/09/10 · related features: per-capability · est pages: 10 · difficulty: med · review checklist: composition not duplication; each capability has one owner
  - **CH-07.01.04 — Trust-mode behavior of Chat (Local/BYOK/Managed) and the one-chat invariant** — depends-on: AGI-DOC-0013 · references: AGI-PROD-0001, AGI-TRUST-0001..0004, AGI-SYNC-0001 · related features: shared cloud chat store · est pages: 9 · difficulty: high · review checklist: trust-boundary correct; no silent cross-boundary; cloud-store writer rule
  - **CH-07.01.05 — Chat current-vs-target and surfaced gaps** — depends-on: AGI-DOC-0003 §11 · references: known-flaws LOCAL-CHAT-NOINVOKE-01, architecture-manifest §11 · related features: local desktop chat · est pages: 6 · difficulty: med · review checklist: Current vs Target separated; honest state; cites real flaw IDs

#### BK-07.02 — AGI Code Experience

- **Parent Volume:** VOL-07 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document AGI Code (coding/developer agent) as a cross-surface Experience across developer surfaces. Depends on VOL-08 (Connectors/MCP, Computer Use, Skills, Generated Files, Artifacts). Prereqs: D5 resolution for Desktop mount status. Cross-refs: trust-mode-surface-matrix.md (CLI/VS Code/Desktop). Inputs: canonical definition, developer-surface roster. Outputs: code manifestation map. Review: capability-honesty (CodeModeHome stub), trust-boundary, developer-session sync rules.
- **Chapters:**
  - **CH-07.02.01 — AGI Code as a cross-surface developer Experience** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25 · related features: developer agent loop · est pages: 8 · difficulty: med · review checklist: references definition; cross-surface
  - **CH-07.02.02 — Surface availability map and developer-session partition** — depends-on: trust-mode-surface-matrix.md · references: AGI-DOC-0015 §10 (DeveloperSessionSurface), trust-mode-surface-matrix.md · related features: session scoping · est pages: 9 · difficulty: high · review checklist: developer-session-stays-local rule; no sync-boundary violation
  - **CH-07.02.03 — Capabilities composed into Code (Connectors/MCP, Computer Use, Skills, Artifacts, Generated Files)** — depends-on: VOL-08 · references: BK-08.04/05/07/03/10 · related features: tool use, generation · est pages: 10 · difficulty: med · review checklist: maps 'tool use'→Connectors+Computer Use (no minted capability); 'generation'→Artifacts+Generated Files
  - **CH-07.02.04 — Trust-mode behavior of Code (Local/BYOK/Managed, subscription gating)** — depends-on: AGI-DOC-0013 · references: AGI-TRUST-0004 (BYOK Desktop/CLI/VS Code only), commercial-and-launch.md · related features: subscription gate · est pages: 8 · difficulty: high · review checklist: BYOK-surface rule; subscription claim grounded
  - **CH-07.02.05 — Code current-vs-target: Desktop mount status (BLOCKED on D5)** — depends-on: owner-decision-register D5 · references: apps/desktop/.../CodeModeHome.tsx (unmounted stub), owner-decision-register §3 D5 · related features: AGI Code mount · est pages: 6 · difficulty: med · review checklist: marked Target/blocked per D5; no invented availability; capability-honesty

#### BK-07.03 — AGI Agent Experience

- **Parent Volume:** VOL-07 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document AGI Agent (autonomous, consent-bounded task execution) as a cross-surface Experience. Depends on VOL-08 (Computer Use, Connectors/MCP, Dispatch/Scheduled/Cowork, Skills, Plugins). Prereqs: consent-gate flows (Security Spec). Cross-refs: AGI-DOC-0015 §16 Agent Architecture (HandoffDraft). Inputs: canonical definition. Outputs: agent manifestation map. Review: consent-boundary, capability-honesty, autonomous-control safety.
- **Chapters:**
  - **CH-07.03.01 — AGI Agent as a consent-bounded cross-surface Experience** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25, AGI-DOC-0015 §16 · related features: autonomy/approval · est pages: 8 · difficulty: high · review checklist: references definition; consent-bounded framing; no autonomy overclaim
  - **CH-07.03.02 — Surface availability map for autonomous execution** — depends-on: trust-mode-surface-matrix.md · references: AGI-SURF-0001 · related features: surface gating · est pages: 8 · difficulty: med · review checklist: capability-honesty; matches matrix
  - **CH-07.03.03 — Capabilities composed into Agent (Computer/Browser Use, Connectors/MCP, Dispatch/Scheduled/Cowork, Skills, Plugins)** — depends-on: VOL-08 · references: BK-08.07/04/11/05/06 · related features: dispatch, computer use · est pages: 10 · difficulty: high · review checklist: composition not duplication; each capability one owner
  - **CH-07.03.04 — Consent, approval, and trust-mode boundaries for autonomous action** — depends-on: AGI-DOC-0015 §16/§24 · references: AGI-TRUST-0001..0004, HandoffDraft, Security Spec book · related features: consent gate · est pages: 9 · difficulty: extreme · review checklist: trust-boundary correct; explicit-consent crossing; references Security Spec for mechanics
  - **CH-07.03.05 — Agent current-vs-target and autonomous-control gaps** — depends-on: AGI-DOC-0003 §11 · references: known-flaws (computer-use allow-all), architecture-manifest §11 · related features: computer use default-ask · est pages: 6 · difficulty: high · review checklist: honest enforcement state; cites real flaws

#### BK-07.04 — AGI Research Experience

- **Parent Volume:** VOL-07 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document AGI Research (multi-source research with citations) as a cross-surface Experience. Depends on VOL-08 (Search, Connectors/MCP, Artifacts, Memory, Generated Files). Prereqs: ResearchTask reconciliation noted as Target (ARCH-D6). Cross-refs: trust-mode-surface-matrix.md. Inputs: canonical definition. Outputs: research manifestation map. Review: capability-honesty (citation claims), trust-boundary.
- **Chapters:**
  - **CH-07.04.01 — AGI Research as a cross-surface citation-bearing Experience** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25 · related features: cited research · est pages: 8 · difficulty: med · review checklist: references definition; cross-surface
  - **CH-07.04.02 — Surface availability map for Research** — depends-on: trust-mode-surface-matrix.md · references: AGI-SURF-0001 · related features: surface gating · est pages: 7 · difficulty: med · review checklist: capability-honesty; matches matrix
  - **CH-07.04.03 — Capabilities composed into Research (Search, Connectors/MCP, Artifacts, Memory, Generated Files)** — depends-on: VOL-08 · references: BK-08.09/04/03/02/10 · related features: search, citations · est pages: 9 · difficulty: med · review checklist: composition not duplication
  - **CH-07.04.04 — Trust-mode behavior and source-egress for Research** — depends-on: AGI-DOC-0015 §24 · references: AGI-TRUST-0001..0004, egress chokepoint, Security Spec book · related features: egress guard · est pages: 8 · difficulty: high · review checklist: trust-boundary correct; egress honest; references Security Spec
  - **CH-07.04.05 — Research current-vs-target (ResearchTask, cross-surface duplication)** — depends-on: ARCH-D6 · references: architecture-constitution Appendix A ARCH-D6, owner-decision-register §9 · related features: ResearchTask · est pages: 6 · difficulty: med · review checklist: marked Target per ARCH-D6; Current vs Target separated

#### BK-07.05 — The Experience Primitive Mapping (cross-Experience)

- **Parent Volume:** VOL-07 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Map the four Experiences onto the enforceable Experience primitive defined by the Surface/Experience/Capability Spec — documenting how ChatIntentKind/FocusMode/AgentMode/research reconcile. BLOCKED on ARCH-D6; documented as Target per Doc-Constitution Article II until converged or ADR-justified. Depends on all VOL-07 books + VOL-08. Cross-refs: AGI-DOC-0015 §1173. Inputs: four Experience books. Outputs: Experience→primitive map; capability-gating derivation reference. Review: must reference (not own) the runtime primitive; current-vs-target.
- **Chapters:**
  - **CH-07.05.01 — Where the Experience primitive is owned vs elaborated (boundary)** — depends-on: AGI-DOC-0015 §1173 · references: Surface/Experience/Capability Spec book, AGI-DOC-0007 · related features: experience contract · est pages: 7 · difficulty: high · review checklist: references runtime book; does not split/merge it; single-owner respected
  - **CH-07.05.02 — Reconciling ChatIntentKind / FocusMode / AgentMode / research flows (Target — ARCH-D6)** — depends-on: ARCH-D6 · references: architecture-constitution Appendix A ARCH-D6, packages/contracts/types/src/design-system (AgentMode) · related features: unified experience · est pages: 10 · difficulty: extreme · review checklist: marked Target/blocked on ARCH-D6; no Current claim; cites evidence
  - **CH-07.05.03 — Runtime-tier dispatch and feature-flag governance (reference)** — depends-on: AGI-DOC-0015 §1173 · references: Surface/Experience/Capability Spec book, AC-51 · related features: capability gating · est pages: 8 · difficulty: high · review checklist: references mechanics; capability-honesty; no invented dispatch
  - **CH-07.05.04 — Experience→Capability→Feature traceability map (cluster compiler view)** — depends-on: VOL-08, VOL-09 · references: BK-08._, BK-09._, AGI-DOC-0008 · related features: traceability · est pages: 9 · difficulty: high · review checklist: no orphan; single-owner per node; acyclic composition

## VOL-08 — Capabilities

- **Volume ID:** VOL-08 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Document the eleven canonical Capabilities (the reusable building blocks Experiences are assembled from) at the product-elaboration layer: each capability's composition-into-Experiences record, its cross-surface availability contract, its feature roll-up, and references to the runtime-spec book that owns its mechanics. This volume documents _what each capability is and where it is available_; it does not own runtime behavior (the AGI-DOC-0015 inheriting books do).
- **Scope:** IN — per-Capability product documentation for Projects, Memory, Artifacts, Connectors/MCP, Skills, Plugins, Computer/Browser Use, Voice, Search, Generated Files, Dispatch/Scheduled/Cowork; cross-surface availability; composition references; feature roll-up. OUT — canonical capability list (AGI-DOC-0013 §25), runtime mechanics (Memory Runtime / Context Runtime / AI Runtime / Tool-MCP-Extension Integration / Streaming / Security specs), Experience composition logic (VOL-07), feature internals (VOL-09). Capabilities depend on nothing within this cluster.
- **Owner:** Principal AI Systems Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002, AGI-DOC-0005, AGI-DOC-0007, AGI-DOC-0008.
- **Dependencies:** none in-cluster (foundational base of C3) · **Prerequisites:** AGI-DOC-0013 §25 capability list stable; trust-mode-surface-matrix.md current; runtime-spec book names fixed in AGI-DOC-0015 §1173.
- **Review Process:** AI-systems-architecture review (single-owner per capability) + capability-honesty review (availability derived from real backend; ARCH-D5 constraint on managed providers) + trust-boundary review + documentation-compiler 10-rule gate.
- **Audience:** AI agents, platform engineers, surface engineers consuming shared capabilities.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 3 / ~330 pages across 11 books
- **Inherits / References (no duplication):** References AGI-DOC-0013 §25 for the canonical capability list and single-owner rule; references AGI-DOC-0015 §1173 inheriting books for mechanics (does NOT restate behavior); references trust-mode-surface-matrix.md and architecture-manifest §3/§5 for availability; never mints a capability outside §25 (e.g. no "Tool Use" capability — that maps onto Connectors/MCP + Computer Use; "generation" maps onto Artifacts + Generated Files).

### Books

#### BK-08.01 — Projects Capability

- **Parent Volume:** VOL-08 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Projects as a reusable capability. Depends on AGI-DOC-0013 §25. Cross-refs: State Persistence & Sync / Session & Synchronization Spec for mechanics; trust-mode-surface-matrix.md. Inputs: capability definition. Outputs: composition + availability record + feature roll-up. Review: single-owner, trust-boundary, capability-honesty.
- **Chapters:**
  - **CH-08.01.01 — Projects capability definition and ownership boundary** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25, canonical-glossary · related features: project scoping · est pages: 7 · difficulty: med · review checklist: references definition; single-owner
  - **CH-08.01.02 — Cross-surface availability and trust-mode behavior** — depends-on: trust-mode-surface-matrix.md · references: AGI-SYNC-0001, AGI-TRUST-0001..0004 · related features: cloud project sync · est pages: 8 · difficulty: high · review checklist: trust-boundary; managed-only sync honest; capability-honesty
  - **CH-08.01.03 — Composition into Experiences and feature roll-up** — depends-on: VOL-09 · references: BK-09.01, Session & Synchronization Spec book · related features: project memory/files · est pages: 7 · difficulty: med · review checklist: references mechanics; no orphan features

#### BK-08.02 — Memory Capability

- **Parent Volume:** VOL-08 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Memory as a reusable capability. Depends on AGI-DOC-0013 §25. Cross-refs: Memory Runtime Spec (mechanics — retrieval/ranking/decay/reconciliation). Inputs: capability definition, canonical-glossary 'Memory'. Outputs: composition + availability + feature roll-up (saved/reference/project/import). Review: single-owner, trust-boundary (local-to-cloud reconciliation), capability-honesty.
- **Chapters:**
  - **CH-08.02.01 — Memory capability definition and ownership boundary (vs Memory Runtime Spec)** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25, AGI-DOC-0015 §1173 Memory Runtime Spec, canonical-glossary 'Memory' · related features: memory model · est pages: 8 · difficulty: high · review checklist: references runtime book for mechanics; does not restate ranking/decay
  - **CH-08.02.02 — Cross-surface availability and local/cloud trust-mode behavior** — depends-on: trust-mode-surface-matrix.md · references: AGI-TRUST-0001..0004, architecture-manifest §3, apps/desktop/.../memory_manager.rs · related features: dual-stack memory · est pages: 9 · difficulty: high · review checklist: trust-boundary; local/cloud divergence honest (ARCH-D gap); capability-honesty
  - **CH-08.02.03 — Composition into Experiences and feature roll-up (saved/reference/project/import)** — depends-on: VOL-09 · references: BK-09.02, Memory Runtime Spec book · related features: saved/reference/project memory, import · est pages: 8 · difficulty: med · review checklist: no orphan features; single-owner

#### BK-08.03 — Artifacts Capability

- **Parent Volume:** VOL-08 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Artifacts (first-class generated outputs rendered in isolated sandbox; versioned, shareable) as a capability. Cross-refs: Streaming & Long-Running Task Spec, Sandbox isolation. Inputs: canonical-glossary 'Artifact'. Outputs: composition + availability + feature roll-up. Review: single-owner (distinct from Generated Files), trust-boundary, sandbox isolation honesty.
- **Chapters:**
  - **CH-08.03.01 — Artifacts capability definition and boundary vs Generated Files** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25, canonical-glossary 'Artifact'/'Generated file' · related features: versioned artifacts · est pages: 8 · difficulty: med · review checklist: clear Artifacts-vs-Generated-Files split; single-owner each
  - **CH-08.03.02 — Cross-surface availability, sandbox isolation, share/version behavior** — depends-on: trust-mode-surface-matrix.md · references: AGI-SURF-0001, Sandbox primitive, AGI-TRUST-0001..0004 · related features: artifact share/versioning · est pages: 9 · difficulty: high · review checklist: sandbox isolation honest; share trust-boundary; capability-honesty
  - **CH-08.03.03 — Composition into Experiences and feature roll-up** — depends-on: VOL-09 · references: BK-09.03, Streaming Spec book · related features: artifact render/share · est pages: 7 · difficulty: med · review checklist: no orphan; references mechanics

#### BK-08.04 — Connectors / MCP Capability

- **Parent Volume:** VOL-08 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Connectors/MCP (external capability integration via MCP, allowlist-gated) as a capability — the canonical owner of "tool use" external integration. Cross-refs: Tool, MCP & Extension Integration Spec (mechanics — transports, signed-manifest/consent gating). Inputs: canonical-glossary 'Connector/MCP server'. Outputs: composition + availability + feature roll-up. Review: single-owner, consent/allowlist honesty, trust-boundary.
- **Chapters:**
  - **CH-08.04.01 — Connectors/MCP capability definition (owns external 'tool use')** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25, packages/tools/mcp, Tool/MCP/Extension Integration Spec book · related features: connector registry · est pages: 8 · difficulty: high · review checklist: 'tool use' mapped here (no minted capability); references runtime book
  - **CH-08.04.02 — Cross-surface availability, allowlist gating, consent and trust-mode** — depends-on: trust-mode-surface-matrix.md · references: AGI-TRUST-0001..0004, Security Spec book (consent gates) · related features: allowlist, consent · est pages: 9 · difficulty: high · review checklist: consent/allowlist honest; trust-boundary; capability-honesty
  - **CH-08.04.03 — Composition into Experiences and feature roll-up** — depends-on: VOL-09 · references: BK-09.04, Tool/MCP/Extension Integration Spec book · related features: MCP servers, signed manifests · est pages: 7 · difficulty: med · review checklist: no orphan; references mechanics

#### BK-08.05 — Skills Capability

- **Parent Volume:** VOL-08 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Skills (prompt-context skill loaders) as a capability, distinct from Plugins. Cross-refs: Tool, MCP & Extension Integration Spec (manifest interop). Inputs: canonical-glossary 'Skill/Plugin/Subagent'. Outputs: composition + availability + feature roll-up. Review: single-owner (Skills vs Plugins), trust-boundary.
- **Chapters:**
  - **CH-08.05.01 — Skills capability definition and boundary vs Plugins/Subagents** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25, packages/tools/skills · related features: skill loader · est pages: 7 · difficulty: med · review checklist: clear Skills-vs-Plugins split; single-owner each
  - **CH-08.05.02 — Cross-surface availability and trust-mode behavior** — depends-on: trust-mode-surface-matrix.md · references: AGI-SURF-0001, Tool/MCP/Extension Integration Spec book · related features: skill discovery · est pages: 7 · difficulty: med · review checklist: capability-honesty; trust-boundary
  - **CH-08.05.03 — Composition into Experiences and feature roll-up** — depends-on: VOL-09 · references: BK-09.05 · related features: skill loading · est pages: 6 · difficulty: low · review checklist: no orphan; references mechanics

#### BK-08.06 — Plugins Capability

- **Parent Volume:** VOL-08 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Plugins (manifest-discovered plugins) as a capability, distinct from Skills. Cross-refs: Tool, MCP & Extension Integration Spec (plugin/skill manifest interop), Module Boundary Spec. Inputs: canonical-glossary, crates/agiworkforce-plugin-runtime. Outputs: composition + availability + feature roll-up. Review: single-owner, trust-boundary, manifest-consent honesty.
- **Chapters:**
  - **CH-08.06.01 — Plugins capability definition and ownership boundary** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25, crates/agiworkforce-plugin-runtime · related features: plugin discovery · est pages: 7 · difficulty: med · review checklist: references definition; single-owner; distinct from Skills
  - **CH-08.06.02 — Cross-surface availability, manifest discovery, consent and trust-mode** — depends-on: trust-mode-surface-matrix.md · references: AGI-TRUST-0001..0004, Tool/MCP/Extension Integration Spec book · related features: plugin manifest/consent · est pages: 8 · difficulty: high · review checklist: consent honest; trust-boundary; capability-honesty
  - **CH-08.06.03 — Composition into Experiences and feature roll-up** — depends-on: VOL-09 · references: BK-09.06 · related features: plugin runtime · est pages: 6 · difficulty: med · review checklist: no orphan; references mechanics

#### BK-08.07 — Computer / Browser Use Capability

- **Parent Volume:** VOL-08 · **Canonical Status:** planned · **Generation Order:** 7
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Computer/Browser Use (screenshot/action loop over desktop or browser, behind AGI-owned action protocol) as a capability — co-owner with Connectors of "tool use". Cross-refs: AI Runtime Spec (agent loop) + Tool/MCP/Extension Integration Spec (autonomous-control safety). Inputs: canonical-glossary 'Computer use/Browser use', packages/tools/browser-tool. Outputs: composition + availability + feature roll-up. Review: single-owner, autonomous-control safety honesty, trust-boundary.
- **Chapters:**
  - **CH-08.07.01 — Computer/Browser Use capability definition and action-protocol boundary** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25, packages/tools/browser-tool, apps/extension CDP driver · related features: action loop · est pages: 8 · difficulty: high · review checklist: references definition; mechanics deferred to runtime books
  - **CH-08.07.02 — Cross-surface availability, default-ask safety, consent and trust-mode** — depends-on: trust-mode-surface-matrix.md · references: AGI-TRUST-0001..0004, known-flaws (computer-use allow-all), Tool/MCP/Extension Integration Spec book · related features: default-ask gating · est pages: 9 · difficulty: extreme · review checklist: honest enforcement state; autonomous-control safety; trust-boundary
  - **CH-08.07.03 — Composition into Experiences (Agent/Code) and feature roll-up** — depends-on: VOL-09 · references: BK-09.07, AI Runtime Spec book · related features: computer use, browser use · est pages: 7 · difficulty: high · review checklist: no orphan; references mechanics

#### BK-08.08 — Voice Capability

- **Parent Volume:** VOL-08 · **Canonical Status:** planned · **Generation Order:** 8
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Voice as a capability. Cross-refs: AI Runtime / Streaming Spec for mechanics. Inputs: canonical capability list. Outputs: composition + availability + feature roll-up. Review: single-owner, capability-honesty (only where a route delivers it), trust-boundary. Note: ground all current claims in code or mark UNKNOWN.
- **Chapters:**
  - **CH-08.08.01 — Voice capability definition and ownership boundary** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25 · related features: voice IO · est pages: 6 · difficulty: med · review checklist: references definition; claims grounded or UNKNOWN
  - **CH-08.08.02 — Cross-surface availability and trust-mode behavior** — depends-on: trust-mode-surface-matrix.md · references: AGI-SURF-0001, Streaming Spec book · related features: voice availability · est pages: 7 · difficulty: med · review checklist: capability-honesty; no invented availability; trust-boundary
  - **CH-08.08.03 — Composition into Experiences and feature roll-up** — depends-on: VOL-09 · references: BK-09.08 · related features: voice IO · est pages: 5 · difficulty: low · review checklist: no orphan; grounded or UNKNOWN

#### BK-08.09 — Search Capability

- **Parent Volume:** VOL-08 · **Canonical Status:** planned · **Generation Order:** 9
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Search as a capability (esp. backing Research). Cross-refs: Tool/MCP/Extension Integration + AI Runtime Spec. Inputs: canonical capability list. Outputs: composition + availability + feature roll-up. Review: single-owner, capability-honesty, trust-boundary (source egress).
- **Chapters:**
  - **CH-08.09.01 — Search capability definition and ownership boundary** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25 · related features: web/source search · est pages: 6 · difficulty: med · review checklist: references definition; single-owner
  - **CH-08.09.02 — Cross-surface availability, source egress, and trust-mode** — depends-on: trust-mode-surface-matrix.md · references: AGI-TRUST-0001..0004, egress chokepoint, Security Spec book · related features: source egress · est pages: 8 · difficulty: high · review checklist: egress honest; trust-boundary; capability-honesty
  - **CH-08.09.03 — Composition into Experiences (Research/Chat) and feature roll-up** — depends-on: VOL-09 · references: BK-09.09 · related features: search, citations · est pages: 6 · difficulty: med · review checklist: no orphan; references mechanics

#### BK-08.10 — Generated Files Capability

- **Parent Volume:** VOL-08 · **Canonical Status:** planned · **Generation Order:** 10
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Generated Files (produced native file with manifest, produced inside a ComputeSession) as a capability — co-owner with Artifacts of "generation", distinct from Artifacts. Cross-refs: Streaming & Long-Running Task Spec, Database Spec (storage/TTL). Inputs: canonical-glossary 'Generated file/Compute session'. Outputs: composition + availability + feature roll-up. Review: single-owner (vs Artifacts), trust-boundary (manifest privacy mode), capability-honesty.
- **Chapters:**
  - **CH-08.10.01 — Generated Files capability definition and boundary vs Artifacts** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25, canonical-glossary 'Generated file', packages/contracts/types GeneratedFile · related features: file manifest · est pages: 8 · difficulty: med · review checklist: clear split from Artifacts; single-owner each
  - **CH-08.10.02 — Cross-surface availability, ComputeSession, manifest privacy-mode and trust-mode** — depends-on: trust-mode-surface-matrix.md · references: AGI-TRUST-0001..0004, Database Spec book · related features: privacy-mode manifest, TTL · est pages: 9 · difficulty: high · review checklist: trust-boundary; manifest privacy honest; capability-honesty
  - **CH-08.10.03 — Composition into Experiences and feature roll-up** — depends-on: VOL-09 · references: BK-09.10, Streaming Spec book · related features: generated files · est pages: 7 · difficulty: med · review checklist: no orphan; references mechanics

#### BK-08.11 — Dispatch / Scheduled / Cowork Capability

- **Parent Volume:** VOL-08 · **Canonical Status:** planned · **Generation Order:** 11
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document Dispatch/Scheduled/Cowork (cross-surface task handoff, collaborative surfaces, scheduled/automation runs) as a capability. Cross-refs: Background Execution/Offline/Reliability Spec (cron/scheduling), Session & Synchronization Spec (handoff). Inputs: canonical-glossary 'Dispatch/Cowork/Scheduled'. Outputs: composition + availability + feature roll-up. Review: single-owner, trust-boundary (handoff crossing), capability-honesty.
- **Chapters:**
  - **CH-08.11.01 — Dispatch/Scheduled/Cowork capability definition and ownership boundary** — depends-on: AGI-DOC-0013 §25 · references: platform-constitution §25, canonical-glossary, desktop AgiWork panels · related features: dispatch, cowork · est pages: 8 · difficulty: high · review checklist: references definition; single-owner; cron deferred to runtime book
  - **CH-08.11.02 — Cross-surface availability, handoff crossing, scheduling and trust-mode** — depends-on: trust-mode-surface-matrix.md · references: AGI-TRUST-0001..0004, HandoffDraft, Background Execution Spec book, Session & Synchronization Spec book · related features: handoff, scheduled runs · est pages: 9 · difficulty: extreme · review checklist: handoff consent/trust-boundary; developer-session rules; capability-honesty
  - **CH-08.11.03 — Composition into Experiences (Agent) and feature roll-up** — depends-on: VOL-09 · references: BK-09.11 · related features: dispatch, scheduled, cowork · est pages: 7 · difficulty: high · review checklist: no orphan; references mechanics

## VOL-09 — Features

- **Volume ID:** VOL-09 · **Generation Priority:** P2 · **Difficulty:** med
- **Purpose:** Document the granular, individually ownable Features — the leaf layer where requirements and tests attach (per AGI-DOC-0013 §25). Each Feature is organized under its owning Capability and traces up to that Capability (and, where it surfaces in a flow, to the Experience). Every feature chapter cites the immutable AGI-<DOMAIN>-<NNNN> requirement IDs it satisfies and names its test attachment points. This volume is the requirement/test anchoring layer for the entire product hierarchy.
- **Scope:** IN — the feature register: per-capability feature inventories with owner, requirement-ID attachments, test attachment points, surface/trust-mode availability, and up-traceability to Capability/Experience. OUT — capability definitions (VOL-08), Experience composition (VOL-07), requirement-ID registry itself (AGI-DOC-0005 owns it; features reference IDs), runtime behavior (AGI-DOC-0015 books), feature implementation/UI internals (Platforms cluster). A chapter that attaches no requirement and no test does NOT belong here — it belongs in VOL-08.
- **Owner:** Lead Product Spec Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002, AGI-DOC-0005, AGI-DOC-0007, AGI-DOC-0008.
- **Dependencies:** VOL-08 (each feature belongs to one capability), VOL-07 (features surface inside Experience flows) · **Prerequisites:** VOL-08 capability books drafted; requirement IDs registered in AGI-DOC-0005; trust-mode-surface-matrix.md current.
- **Review Process:** Spec review (requirement-ID attachment correctness; every feature has one owner) + test-attachment review (named test points exist or marked target) + capability-honesty review + documentation-compiler 10-rule gate (esp. ID-resolution and no-orphan).
- **Audience:** product engineers, QA/test engineers, AI agents implementing/verifying features.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** med / med / 2 / ~220 pages across 3 books
- **Inherits / References (no duplication):** References VOL-08 for capability ownership; references AGI-DOC-0005 for requirement IDs (cites, never re-registers); references AGI-DOC-0015 inheriting books for mechanics; references trust-mode-surface-matrix.md for availability; the Memory feature example (saved/reference/project/import) traces to AGI-DOC-0013 §25 and VOL-08 BK-08.02.

### Books

#### BK-09.01 — Conversation & Context Features

- **Parent Volume:** VOL-09 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Feature register for Chat/Projects/Context-facing affordances (one-chat continuity, project scoping, context attach). Depends on VOL-08 BK-08.01/02, VOL-07 BK-07.01. Cross-refs: Context Runtime Spec. Inputs: capability feature roll-ups. Outputs: features with requirement-ID + test attachments. Review: ID-resolution, one-chat invariant, no-orphan.
- **Chapters:**
  - **CH-09.01.01 — One-chat continuity features** — depends-on: BK-08.01, BK-07.01 · references: AGI-PROD-0001, Context Runtime Spec book, test suites · related features: one chat · est pages: 9 · difficulty: med · review checklist: requirement-ID attached; test point named; single-owner
  - **CH-09.01.02 — Project scoping and project-context features** — depends-on: BK-08.01 · references: AGI-SYNC-0001, Session & Synchronization Spec book · related features: project scope · est pages: 9 · difficulty: med · review checklist: ID attached; trust-boundary; no orphan
  - **CH-09.01.03 — Context-attach and compaction-facing features** — depends-on: BK-08.02 · references: Context Runtime Spec book (mechanics), AGI-AI-\* · related features: context budget · est pages: 8 · difficulty: med · review checklist: references mechanics; ID + test attached
  - **CH-09.01.04 — Memory features (saved / reference-chat / project / import)** — depends-on: BK-08.02 · references: AGI-DOC-0013 §25 (canonical example), Memory Runtime Spec book · related features: memory subtypes · est pages: 10 · difficulty: med · review checklist: matches §25 example; one owner per feature; ID + test attached

#### BK-09.02 — Generation & Tool Features

- **Parent Volume:** VOL-09 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Feature register for Artifacts, Generated Files, Connectors/MCP, Skills, Plugins, Computer/Browser Use, Search, Voice affordances. Depends on VOL-08 BK-08.03..10, VOL-07 BK-07.02/03/04. Cross-refs: Tool/MCP/Extension, AI Runtime, Streaming Specs. Inputs: capability feature roll-ups. Outputs: features with requirement-ID + test attachments. Review: ID-resolution, capability-honesty, autonomous-control safety, no-orphan.
- **Chapters:**
  - **CH-09.02.01 — Artifact features (render / version / share)** — depends-on: BK-08.03 · references: AGI-SURF-0001, Streaming Spec book · related features: artifacts · est pages: 8 · difficulty: med · review checklist: ID + test attached; sandbox-isolation honest
  - **CH-09.02.02 — Generated-file features (manifest / privacy-mode / TTL)** — depends-on: BK-08.10 · references: AGI-TRUST-0001..0004, Database Spec book · related features: generated files · est pages: 8 · difficulty: med · review checklist: trust-boundary; ID + test attached
  - **CH-09.02.03 — Connector/MCP features (allowlist / consent / signed manifest)** — depends-on: BK-08.04 · references: Tool/MCP/Extension Integration Spec book, Security Spec book · related features: connectors · est pages: 9 · difficulty: high · review checklist: consent honest; ID + test attached
  - **CH-09.02.04 — Skill and Plugin features (load / discover / consent)** — depends-on: BK-08.05, BK-08.06 · references: Tool/MCP/Extension Integration Spec book · related features: skills, plugins · est pages: 8 · difficulty: med · review checklist: one owner each; ID + test attached
  - **CH-09.02.05 — Computer/Browser-use features (action loop / default-ask)** — depends-on: BK-08.07 · references: AI Runtime Spec book, known-flaws (computer-use allow-all) · related features: computer use · est pages: 9 · difficulty: high · review checklist: autonomous-control safety; honest enforcement; ID + test attached
  - **CH-09.02.06 — Search and Voice features (query / citation / voice IO)** — depends-on: BK-08.09, BK-08.08 · references: AGI-SURF-0001, Streaming Spec book · related features: search, voice · est pages: 7 · difficulty: med · review checklist: capability-honesty; claims grounded or UNKNOWN; ID + test attached

#### BK-09.03 — Autonomy, Dispatch & Collaboration Features

- **Parent Volume:** VOL-09 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Feature register for Dispatch/Scheduled/Cowork and Agent-experience autonomy affordances. Depends on VOL-08 BK-08.11/07, VOL-07 BK-07.03. Cross-refs: Background Execution/Offline/Reliability Spec, Session & Synchronization Spec, AI Runtime Spec (approval state machine). Inputs: capability feature roll-ups. Outputs: features with requirement-ID + test attachments. Review: consent/trust-boundary, ID-resolution, no-orphan.
- **Chapters:**
  - **CH-09.03.01 — Dispatch and cross-surface handoff features** — depends-on: BK-08.11, BK-07.03 · references: AGI-TRUST-0001..0004, HandoffDraft, Session & Synchronization Spec book · related features: dispatch · est pages: 9 · difficulty: high · review checklist: handoff consent/trust-boundary; ID + test attached
  - **CH-09.03.02 — Scheduled and automation-run features** — depends-on: BK-08.11 · references: Background Execution Spec book, AGI-OPS-\* · related features: scheduled runs · est pages: 8 · difficulty: med · review checklist: references mechanics; ID + test attached
  - **CH-09.03.03 — Cowork collaborative-surface features** — depends-on: BK-08.11 · references: AGI-SYNC-0001, trust-mode-surface-matrix.md · related features: cowork · est pages: 7 · difficulty: med · review checklist: trust-boundary; ID + test attached; no orphan
  - **CH-09.03.04 — Autonomy approval/consent features (agent loop)** — depends-on: BK-08.07, BK-07.03 · references: AI Runtime Spec book (approval state machine), AGI-TRUST-0001 · related features: approval gate · est pages: 9 · difficulty: high · review checklist: consent honest; references mechanics; ID + test attached

#### BK-09.04 — Keyboard, Shortcuts & Command-Palette Features

- **Parent Volume:** VOL-09 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Feature register for keyboard discoverability, shortcut bindings, and the command/slash palette scope per surface. No book currently owns keyboard-UX consistency or palette scope; bindings are scattered (CLI `command_popup.rs`, desktop/web shortcuts). Each feature cites its requirement-ID and test attachment points and traces up to its owning Capability/Experience. Depends on VOL-08 (capabilities the palette invokes), VOL-06 (per-surface shells where bindings render). Cross-refs: VOL-25 BK-25.01 (shell view scope — referenced). Inputs: `apps/cli/src/tui/widgets/command_popup.rs`, web/desktop shortcut handlers. Outputs: keyboard/palette features with requirement-ID + test attachments. Review: ID-resolution, capability-honesty (palette only lists real capabilities), accessibility, no-orphan.
- **Chapters:**
  - **CH-09.04.01 — Command/slash-palette scope and per-surface availability** — depends-on: BK-08.01, BK-06.04 · references: `apps/cli/src/tui/widgets/command_popup.rs`, AGI-SURF-0001, trust-mode-surface-matrix.md · related features: command palette · est pages: 12 · difficulty: med · review checklist: palette lists only real capabilities; per-surface availability honest; ID + test attached
  - **CH-09.04.02 — Keyboard-shortcut binding features and discoverability** — depends-on: CH-09.04.01 · references: web/desktop shortcut handlers, VOL-25 BK-25.01 (shell — referenced) · related features: shortcuts · est pages: 14 · difficulty: med · review checklist: bindings enumerated per surface; discoverability affordance cited; ID + test attached
  - **CH-09.04.03 — Palette-to-capability dispatch and consent-gated actions** — depends-on: CH-09.04.01 · references: VOL-08 (capability owners — referenced), AGI-TRUST-0001 (consent — referenced) · related features: palette dispatch · est pages: 12 · difficulty: high · review checklist: dispatch references capability owners not re-owning; consent-gated actions honest; ID + test attached
  - **CH-09.04.04 — Keyboard accessibility and shortcut-conflict conventions** — depends-on: CH-09.04.02 · references: VOL-25 CH-25.04.04 (a11y conventions — referenced), VOL-01 BK-01.03 (a11y review stage — referenced) · related features: keyboard a11y · est pages: 12 · difficulty: med · review checklist: a11y referenced not duplicated; conflict policy framed; ID + test attached

#### BK-09.05 — Per-Surface Project & Context Management UX Features

- **Parent Volume:** VOL-09 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Feature register for the per-surface project/context management UX affordances — project picker, create, attach, and context scoping as they manifest on each surface. The Projects _capability_ is owned by VOL-08 BK-08.01 and the one-chat/project-scoping _features_ by VOL-09 BK-09.01; this book enumerates the per-surface UX rows those leave un-enumerated (picker/create/attach UI per surface, incl. mobile project scoping) and references both — it never re-owns the capability. Each feature cites requirement-ID and test attachment points. Depends on VOL-08 BK-08.01 (Projects capability), VOL-09 BK-09.01 (project-scoping features), VOL-06 (per-surface shells). Cross-refs: VOL-25 BK-25.01 (shell view scope — referenced). Inputs: per-surface project UI entry points. Outputs: per-surface project/context UX features with requirement-ID + test attachments. Review: ID-resolution, single-owner (capability stays in VOL-08), trust-boundary, no-orphan.
- **Chapters:**
  - **CH-09.05.01 — Project picker / create / attach UX per surface** — depends-on: BK-08.01, BK-09.01 · references: VOL-08 BK-08.01 (Projects capability — referenced), VOL-09 CH-09.01.02 (project scoping — referenced), AGI-SURF-0001 · related features: project picker · est pages: 14 · difficulty: med · review checklist: references capability not re-owning it; per-surface UX enumerated; ID + test attached
  - **CH-09.05.02 — Context-attach and project-context scoping UX** — depends-on: CH-09.05.01 · references: VOL-09 CH-09.01.03 (context-attach features — referenced), Context Runtime Spec book (mechanics — referenced) · related features: context scoping · est pages: 12 · difficulty: med · review checklist: references context features and mechanics not restating; ID + test attached; no orphan
  - **CH-09.05.03 — Mobile and developer-surface project scoping UX** — depends-on: CH-09.05.01 · references: `apps/mobile`, VOL-06 BK-06.03 (mobile surface — referenced), trust-mode-surface-matrix.md · related features: mobile project scope · est pages: 12 · difficulty: med · review checklist: mobile/developer scoping honest; trust-boundary; ID + test attached
  - **CH-09.05.04 — Project-UX trust-mode behavior and cloud-project visibility** — depends-on: CH-09.05.01 · references: AGI-SYNC-0001 (project sync — referenced), AGI-TRUST-0001..0004, VOL-08 CH-08.01.02 (availability — referenced) · related features: cloud project sync UX · est pages: 12 · difficulty: high · review checklist: trust-boundary correct; managed-only sync UX honest; ID + test attached

## Part D — Intelligence Runtimes (VOL-10…16)

## VOL-10 — AI Runtime

- **Volume ID:** VOL-10 · **Generation Priority:** P0 · **Difficulty:** extreme
- **Purpose:** Author the AI Runtime Specification — the inheriting book that owns the execution behavior the Architecture Constitution (AGI-DOC-0015) §13/§15/§16/§17/§54 deliberately defers: the `ProviderAdapter` / `ChatRequest` / `StreamChunk` wire shapes, the credential-resolution flow, cross-provider resilience (retry/fallback/stream-idle watchdog), routing and provider availability, the agent-loop step semantics, the tool-call wire protocol, the autonomy/approval state machine, the workflow execution engine VOL-13 defers here, and the convergence-or-justified-divergence record across the TS / CLI-Rust / desktop-Rust runtimes. This volume specifies how the runtime runs; it does not redefine the inference boundary (owned by §13) or the model SSOT (owned by §14) — it references them.
- **Scope:** IN — adapter contract wire shapes, request/stream/error envelopes, credential resolution, retry/fallback/watchdog, model-route resolution and provider-availability surfacing, agent-loop steps, tool-call protocol, autonomy/approval state machine, workflow node scheduling/state-advance/retry reconciliation/trigger firing (the engine VOL-13 defers here), three-runtime convergence record. OUT — the inference-boundary rule itself (§13, referenced), model/provider SSOT data (§14 / `packages/contracts/types/models.json`, referenced), the egress chokepoint mechanism (Trust-Boundary/Security book, referenced), the HTTP/IPC route-handler contract and `/v1` versioning (API Specification, out of this volume), tool _normalization schema policy_ and MCP transport/consent gating (Tool/MCP/Extension Integration book), streaming gateway TTFT SLO and credit reserve/refund (Streaming & Long-Running Task book).
- **Owner:** AI Runtime lead (Platform architecture)
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015)
- **Dependencies:** none upstream within the runtime family (most foundational runtime volume) · **Prerequisites:** AGI-DOC-0015 §13/§14/§15/§16/§17/§54 ratified; model catalog SSOT `packages/contracts/types/src/models.json` and `provider.ts` present; `AGI-AI-0001` registered
- **Review Process:** Architecture review (gates every chapter for constitution non-contradiction); mandatory human security review for any chapter touching credential resolution or trust-boundary inheritance (AGI-TRUST-\*); ADR required before ratifying the three-runtime convergence decision (closes ARCH-D4)
- **Audience:** Runtime engineers (TS gateway, CLI-Rust, desktop-Rust), provider-adapter authors, agent/workflow engine implementers, security reviewers
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** extreme / extreme / 5 / ~220 pages across 8 books
- **Inherits / References (no duplication):** inherits AGI-DOC-0002 (doc governance), AGI-DOC-0005 (requirement IDs), AGI-DOC-0007 (cross-reference), AGI-DOC-0008 (compiler); maps to AGI-DOC-0015 inheriting book **AI Runtime Specification** (§13,§15,§16,§17,§54 deferrals). References — never restates — "ProviderAdapter as single inference boundary" (§13), "Model Catalog & Provider Identity SSOT" (§14, `models.json`/`provider.ts`), "Capability Honesty" (§12/§54, `evaluateModelEnvironment`), "Agent boundary & HandoffDraft" (§16/§24), "Workflow boundary" (§17), AGI-AI-0001, AGI-TRUST-0001/0002, AGI-ARCH-0001. Defers trust-boundary egress mechanism to Security book; route-handler/`/v1` to API Specification; tool-schema normalization + MCP to Tool/MCP/Extension book; TTFT SLO + credit reconciliation to Streaming book.

### Books

#### BK-10.01 — Adapter & Wire Contracts (ProviderAdapter / ChatRequest / StreamChunk)

- **Parent Volume:** VOL-10 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — fix the canonical wire shapes deferred from §13/§54: the `ProviderAdapter` required surfaces (`id`/`label`/`auth`/`config`/`stream`) and optional hooks (`catalog`/`buildReplayPolicy`/`normalizeToolSchemas`/`wrapStreamFn`), the `ChatRequest` input shape, and the `StreamChunk` discriminated-union normalization from vendor SSE/NDJSON. Dependencies — none (root book). Prerequisites — `packages/contracts/types/src/provider-adapter.ts` contract present. Cross-References — §13 (inference boundary, referenced), §54 (runtime philosophy), AGI-ARCH-0001. Expected Inputs — vendor SSE/NDJSON event formats, contract source. Expected Outputs — canonical wire-shape spec consumable by all three runtimes. Review Requirements — architecture review; no security-sensitive credential content (lives in BK-10.02).
- **Chapters:**
  - **CH-10.01.01 — ProviderAdapter contract surface** — depends-on: — · references: architecture-constitution.md §13, `packages/contracts/types/src/provider-adapter.ts` L321–347 · related features: provider abstraction · est pages: 6 · difficulty: high · review checklist: four required surfaces + four optional hooks enumerated; no §13 rule restated
  - **CH-10.01.02 — ChatRequest input wire shape** — depends-on: CH-10.01.01 · references: `packages/contracts/types/src/provider-adapter.ts`, §54 · related features: chat execution · est pages: 6 · difficulty: high · review checklist: request fields grounded in contract; model id read from SSOT not inlined
  - **CH-10.01.03 — StreamChunk discriminated union & vendor SSE/NDJSON normalization** — depends-on: CH-10.01.01 · references: §13, `packages/contracts/types/src/provider-adapter.ts` · related features: streaming normalization · est pages: 8 · difficulty: extreme · review checklist: every variant mapped to vendor event; lossless normalization stated
  - **CH-10.01.04 — Error envelope & safe-to-expose normalization (runtime side)** — depends-on: CH-10.01.03 · references: §28 (API book owns HTTP envelope), §54 · related features: error handling · est pages: 5 · difficulty: high · review checklist: defers HTTP allowlist to API Spec; only runtime-internal normalization here
  - **CH-10.01.05 — wrapStreamFn & buildReplayPolicy optional hooks** — depends-on: CH-10.01.03 · references: §13, `packages/ai/provider-runtime/src/gateway.ts` · related features: replay/resilience · est pages: 5 · difficulty: high · review checklist: hooks optional; replay determinism stated

  - **CH-10.01.06 — Multimodal input content-block wire shape (text/image; audio/video as Target)** — depends-on: CH-10.01.02 · references: §13, §54, `packages/contracts/types/src/provider-adapter.ts` (ContentBlock/ImageBlock/ProviderMessage), AGI-AI-0001 · related features: vision models, multimodal chat · est pages: 8 · difficulty: extreme · review checklist: variants grounded in provider-adapter.ts; image block Current, audio/video framed Target requiring §14/models.json SSOT addition (referenced not redefined); per-provider codec negotiation deferred to VOL-16 BK-16.1 (seam guard)
  - **CH-10.01.07 — Capability-honest modality gating (vision/imageGen flags from real backend)** — depends-on: CH-10.01.06 · references: §12, §54, `packages/contracts/types/src/models.json` (vision/imageGen/videoGen capability flags), AGI-AI-0001 · related features: model picker honesty · est pages: 6 · difficulty: high · review checklist: modality selectability derived from catalog capability flags (verified present), never model-name-only; no invented modality flag
  - **CH-10.01.08 — Prompt-cache runtime contract (cache-key derivation, hit/miss surfacing)** — depends-on: CH-10.01.02 · references: §54, `packages/contracts/types/src/provider-adapter.ts` (EphemeralCacheControl / StreamChunkUsage cacheRead/WriteTokens), `packages/ai/provider-protocol/src/system-prompt-cache-boundary.ts` · related features: prompt caching, cache-hit visibility · est pages: 7 · difficulty: high · review checklist: canonical cache-key/hit-miss contract owned here; current Anthropic-only ephemeral path noted honestly as Current, cross-provider as Target; credit-reserve/refund reconciliation deferred to Streaming & Long-Running Task book (referenced)
  - **CH-10.01.09 — Cache cost-reconciliation reference (defers to Streaming/Observability books)** — depends-on: CH-10.01.08 · references: §54, Streaming & Long-Running Task book (credit reserve/refund), Observability book (usage/cost taxonomy) · related features: prompt caching, billing accuracy · est pages: 4 · difficulty: med · review checklist: cache-token usage surfaced from StreamChunkUsage; durable cost reconciliation deferred to Streaming/Observability books (no duplicate cost model)

#### BK-10.02 — Credential Resolution & Trust-Mode Honoring

- **Parent Volume:** VOL-10 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the credential-resolution flow deferred from §13/§54: where the adapter resolves provider credentials, how Local/BYOK/Managed mode selects the credential source, and the invariant that BYOK payloads go directly to the user-owned provider and never transit AGI cloud. Dependencies — BK-10.01 (adapter surface). Prerequisites — trust-mode contracts (`suite-contracts.ts`). Cross-References — §3 (Local/BYOK/Managed inheritance), §13, §24 (egress mechanism owned by Security book, referenced), AGI-TRUST-0001/0002. Expected Inputs — per-surface credential stores, PrivacyMode. Expected Outputs — credential-resolution algorithm honoring trust boundary. Review Requirements — mandatory human security review (AGI-TRUST-\*); ADR if resolution flow changes a trust invariant.
  - **Chapters:**
  - **CH-10.02.01 — Credential resolution algorithm by trust mode** — depends-on: CH-10.01.01 · references: §13, §3, `suite-contracts.ts` · related features: BYOK, Managed credentials · est pages: 7 · difficulty: extreme · review checklist: Local/BYOK/Managed source selection explicit; no egress mechanism redefined
  - **CH-10.02.02 — BYOK direct-to-provider invariant (never transits AGI cloud)** — depends-on: CH-10.02.01 · references: §13, AGI-TRUST-0001, AGI-TRUST-0004 · related features: BYOK trust boundary · est pages: 6 · difficulty: extreme · review checklist: references egress chokepoint (Security book), does not restate it; fail-closed stated
  - **CH-10.02.03 — Secret handling & redaction at the runtime boundary** — depends-on: CH-10.02.01 · references: §24, §57 (Security book owns redaction patterns) · related features: secret scan · est pages: 5 · difficulty: high · review checklist: defers redaction patterns to Security Spec; runtime call-sites enumerated only
  - **CH-10.02.04 — Capability honesty: fail-closed environment gating** — depends-on: CH-10.02.01 · references: §54, §12, `packages/contracts/types/src/model-catalog.ts` L211–224, AGI-AI-0001 · related features: model picker honesty · est pages: 6 · difficulty: high · review checklist: `evaluateModelEnvironment` cited; unselectable-until-available stated, not invented

#### BK-10.03 — Cross-Provider Resilience (Retry / Fallback / Stream-Idle Watchdog)

- **Parent Volume:** VOL-10 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the shared resilience layer deferred from §54: gateway fingerprinting, retry policy, provider fallback ordering, and the stream-idle watchdog, owned once in `@agiworkforce/provider-runtime` rather than re-implemented per surface. Dependencies — BK-10.01, BK-10.02. Prerequisites — `packages/ai/provider-runtime/src/gateway.ts`. Cross-References — §54, BK-10.01 (StreamChunk), Streaming & Long-Running Task book (TTFT SLO out of scope, referenced). Expected Inputs — provider health signals, transient error taxonomy. Expected Outputs — deterministic retry/fallback policy spec. Review Requirements — architecture review; resilience must not weaken trust-boundary (no fallback across boundaries).
  - **Chapters:**
  - **CH-10.03.01 — Gateway fingerprinting & request identity** — depends-on: CH-10.01.02 · references: §54, `packages/ai/provider-runtime/src/gateway.ts` · related features: resilience · est pages: 5 · difficulty: high · review checklist: request-id propagation defers to API Spec; runtime fingerprint only
  - **CH-10.03.02 — Retry policy & transient-error taxonomy** — depends-on: CH-10.03.01 · references: §54, `gateway.ts` · related features: retry · est pages: 6 · difficulty: high · review checklist: retriable vs terminal classes explicit; idempotency deferred to Background/Reliability book
  - **CH-10.03.03 — Provider fallback ordering (no cross-boundary fallback)** — depends-on: CH-10.03.02 · references: §54, §13, AGI-TRUST-0001 · related features: fallback · est pages: 6 · difficulty: extreme · review checklist: fallback stays within trust mode; never falls Local→cloud
  - **CH-10.03.04 — Stream-idle watchdog & timeout semantics** — depends-on: CH-10.01.03, CH-10.03.01 · references: §54, `gateway.ts` · related features: streaming resilience · est pages: 5 · difficulty: high · review checklist: idle threshold sourced not guessed; TTFT SLO deferred to Streaming book

#### BK-10.04 — Routing & Provider Availability (ARCH-D5)

- **Parent Volume:** VOL-10 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify model-route resolution and how real provider availability is surfaced at selection time, deferred from §54. **BLOCKED in part on ARCH-D5** (cloud advertises 11 providers / gateway serves 4 with no OpenAI-compatible fallback; cloud vs developer-surface availability asymmetric and not surfaced at selection). Its closing book is shared "AI Runtime Spec / API Spec" — the API-surface portion is OUT of this volume and deferred to the API Specification. Dependencies — BK-10.01, BK-10.02. Prerequisites — model SSOT (`models.json`), ARCH-D5 owner decision (register §9). Cross-References — §12, §13, §28, §50, AGI-AI-0001, ARCH-D5. Expected Inputs — model catalog, provider health, surface/runtime tier. Expected Outputs — route-resolution spec with honest availability. Review Requirements — architecture review; capability-honesty gate; ARCH-D5 must be decided before the availability-asymmetry chapter ratifies.
  - **Chapters:**
  - **CH-10.04.01 — Route object resolution (provider + endpoint class + model id + capability + pricing + health)** — depends-on: CH-10.01.01 · references: §14, canonical-glossary 'Route object', `models.json`, AGI-AI-0001 · related features: auto-routing · est pages: 7 · difficulty: high · review checklist: route fields read from SSOT; no model id hardcoded
  - **CH-10.04.02 — Capability-derived selectability (pickers/badges from real backend)** — depends-on: CH-10.04.01 · references: §12, §54, `model-catalog.ts` · related features: model picker · est pages: 6 · difficulty: high · review checklist: badges derived from backend capability, not static allowlist
  - **CH-10.04.03 — Cloud-vs-developer-surface availability asymmetry (ARCH-D5)** — depends-on: CH-10.04.01 · references: §12/§13/§28/§50, ARCH-D5, register §9 · related features: provider availability · est pages: 7 · difficulty: extreme · review checklist: **BLOCKED on ARCH-D5**; API-surface portion deferred to API Spec; asymmetry documented as current state honestly
  - **CH-10.04.04 — OpenAI-wire-compatible long-tail coverage record** — depends-on: CH-10.04.03 · references: §50, ARCH-D5, `provider-protocol` (Tool/MCP book owns schema policy) · related features: OpenAI-compatible providers · est pages: 5 · difficulty: high · review checklist: coverage stated as desktop/CLI-only current state; normalization policy referenced not restated

#### BK-10.05 — Agent Loop & Step Semantics

- **Parent Volume:** VOL-10 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the agent-loop step semantics deferred from §16/§54: how a bounded multi-step tool-using actor advances through observe/decide/act/observe steps, step limits, and termination, building on the typed `AgentConfig`/`Agent`/`ToolExecution` contracts. Owns the loop, not the boundary (boundary owned by §16, referenced). Dependencies — BK-10.01, BK-10.06 (tool-call protocol). Prerequisites — `packages/contracts/types/src/agent.ts`. Cross-References — §16, §54, §17 (workflow defers engine here), AGI-PROD-0001. Expected Inputs — agent config contracts, tool-call results. Expected Outputs — agent-loop execution spec. Review Requirements — architecture review; trust-boundary inheritance verified (agent runs in single trust mode).
  - **Chapters:**
  - **CH-10.05.01 — Step lifecycle (observe / decide / act / reconcile)** — depends-on: CH-10.06.01 · references: §16, §54, `agent.ts` · related features: AGI Agent experience · est pages: 7 · difficulty: extreme · review checklist: step model grounded in AgentLifecycleStatus; no boundary rule restated
  - **CH-10.05.02 — Step limits, budget & loop termination** — depends-on: CH-10.05.01 · references: §54, Streaming book (tool-loop step limits cross-ref) · related features: agent safety · est pages: 6 · difficulty: high · review checklist: limits sourced; defers TTFT/long-running concerns to Streaming book
  - **CH-10.05.03 — Single-trust-mode execution & HandoffDraft inheritance** — depends-on: CH-10.05.01 · references: §16, §24 (HandoffDraft owned by §24), AGI-TRUST-0002 · related features: trust-boundary · est pages: 6 · difficulty: extreme · review checklist: references HandoffDraft, does not define it; agent never silently crosses boundary
  - **CH-10.05.04 — Multi-agent coordination (Council / A2A handoff) execution** — depends-on: CH-10.05.01 · references: §16, `packages/contracts/types/src/council.ts`, `packages/contracts/types/src/a2a.ts` · related features: dispatch, multi-agent · est pages: 6 · difficulty: extreme · review checklist: coordination contracts cited; trust mode preserved across handoff

#### BK-10.06 — Tool-Call Protocol & Autonomy/Approval State Machine

- **Parent Volume:** VOL-10 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the tool-call wire protocol and the autonomy/approval state machine deferred from §15/§16/§54: how a tool call is emitted, executed, and its result fed back, and the ask-before-acting default-deny state machine for autonomous computer-use/browser/CDP control. Tool _output is untrusted data_ (§15). Schema normalization policy and MCP transport are OUT (Tool/MCP/Extension book). Dependencies — BK-10.01. Prerequisites — `provider-adapter.ts` ToolDef/ToolChoice, `apps/extension/src/background.ts`. Cross-References — §15, §16, §54, Tool/MCP/Extension book (normalization + MCP gating). Expected Inputs — ToolDef/ToolChoice, consent signals. Expected Outputs — tool-call protocol + approval state machine spec. Review Requirements — mandatory security review (autonomous-control default-deny is an AGI-TRUST-class invariant); CI regression test referenced.
  - **Chapters:**
  - **CH-10.06.01 — Tool-call wire protocol (ToolDef / ToolChoice / result feedback)** — depends-on: CH-10.01.01 · references: §15, `provider-adapter.ts` L134–143 · related features: tool calling · est pages: 7 · difficulty: extreme · review checklist: normalization policy deferred to Tool/MCP book; protocol shape only
  - **CH-10.06.02 — Tool output as untrusted data boundary** — depends-on: CH-10.06.01 · references: §15, §16, §17 · related features: prompt-injection defense · est pages: 5 · difficulty: high · review checklist: output never treated as trusted instruction; binds agent/workflow consumers
  - **CH-10.06.03 — Autonomy/approval state machine (ask-before-acting default)** — depends-on: CH-10.06.01 · references: §16, `apps/extension/src/background.ts`, `apps/extension/__tests__/computer-use-default-ask.test.ts` · related features: computer use, browser use · est pages: 7 · difficulty: extreme · review checklist: default-deny stated; allow-all is explicit opt-out only; CI regression test cited
  - **CH-10.06.04 — Consent & surface-scope gating of capability-bearing tools** — depends-on: CH-10.06.03 · references: §12, §15, `suite-contracts.ts` L1146–1167 (ConnectorRegistryEntry) · related features: connectors · est pages: 5 · difficulty: high · review checklist: MCP transport/signed-manifest deferred to Tool/MCP book; runtime gating only

#### BK-10.07 — Workflow Execution Engine (engine deferred here by VOL-13 / §17)

- **Parent Volume:** VOL-10 · **Canonical Status:** planned · **Generation Order:** 7
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — own the workflow _execution engine_ that §17 Workflow Architecture and VOL-13 explicitly defer to the AI Runtime book: how nodes are scheduled, how state advances, how failures/retries are reconciled, and how triggers fire. VOL-13 owns the WorkflowDefinition _composition contract_ and trust-inheritance boundary and references this engine. Dependencies — BK-10.05 (agent loop), BK-10.06 (tool-call), BK-10.03 (resilience). Prerequisites — `packages/contracts/types/src/workflow.ts`. Cross-References — §17, §54, VOL-13 (composition contract), AC-17. Expected Inputs — WorkflowDefinition node-graph, triggers. Expected Outputs — execution-engine spec. Review Requirements — architecture review; workflow MUST NOT widen the trust boundary of its actors (verified against AC-17).
  - **Chapters:**
  - **CH-10.07.01 — Node scheduling & state advance (agent/decision/loop/parallel/wait/script/tool)** — depends-on: CH-10.05.01 · references: §17, §54, `packages/contracts/types/src/workflow.ts` · related features: workflow runtime · est pages: 8 · difficulty: extreme · review checklist: engine here, contract in VOL-13; node kinds grounded in workflow.ts
  - **CH-10.07.02 — Failure & retry reconciliation across nodes** — depends-on: CH-10.07.01, CH-10.03.02 · references: §17, §54 · related features: workflow reliability · est pages: 6 · difficulty: high · review checklist: reuses BK-10.03 retry policy; no duplicate retry model
  - **CH-10.07.03 — Trigger firing (manual/scheduled/event/webhook) execution** — depends-on: CH-10.07.01 · references: §17, Background/Offline/Reliability book (cron contract referenced), VOL-13 (trigger auth) · related features: dispatch, scheduled · est pages: 6 · difficulty: high · review checklist: trigger _authentication_ owned by VOL-13; cron contract deferred to Background book
  - **CH-10.07.04 — Trust-boundary inheritance within a workflow (no widening, AC-17)** — depends-on: CH-10.07.01 · references: §17, AC-17, AGI-TRUST-0001 · related features: trust-boundary · est pages: 5 · difficulty: extreme · review checklist: scheduled/event workflow never a covert Local→cloud channel

#### BK-10.08 — Three-Runtime Convergence Record (ARCH-D4 / ARCH-D1–D3)

- **Parent Volume:** VOL-10 · **Canonical Status:** planned · **Generation Order:** 8
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — own the convergence-or-justified-divergence record across the TS `ProviderAdapter`, the CLI-Rust runtime, and the desktop-Rust runtime, deferred from §13/§54. **BLOCKED on ARCH-D4** (three divergent non-shared AI runtimes; no convergence record or justified-divergence ADR exists). Also closes **ARCH-D1** (provider-identity SSOT drift: union 28 / catalog 25 / desktop enum 25), **ARCH-D2** (`lmstudio` ships adapter package with no catalog entry), **ARCH-D3** (misdirected mirror pointer: `provider.ts` points to `models_config.rs` but enum lives at `core/llm/mod.rs:649`) — all close in AI Runtime Spec per register §9. Dependencies — BK-10.01 (adapter contract). Prerequisites — ARCH-D4 owner decision; ARCH-D1/D2/D3 owner decisions. Cross-References — §13, §14, §50, §54, ARCH-D1/D2/D3/D4, register §9. Expected Inputs — TS/CLI/desktop runtime sources, provider mirrors. Expected Outputs — convergence record + per-divergence justification or convergence plan. Review Requirements — ADR mandatory to ratify convergence/divergence; CI guard requirement for SSOT correspondence recorded.
  - **Chapters:**
  - **CH-10.08.01 — Three-runtime divergence record (TS gateway / CLI-Rust / desktop-Rust)** — depends-on: CH-10.01.01 · references: §13, §54, `apps/cli/src/models/mod.rs:49`, `apps/desktop/src-tauri/src/core/llm/mod.rs:649`, ARCH-D4 · related features: provider abstraction · est pages: 8 · difficulty: extreme · review checklist: **BLOCKED on ARCH-D4**; current divergence documented; convergence vs justified-divergence requires ADR
  - **CH-10.08.02 — Provider-identity SSOT correspondence (union / catalog / Rust enum) (ARCH-D1)** — depends-on: CH-10.08.01 · references: §14, §50, `provider.ts`, `models.json`, ARCH-D1 · related features: model SSOT · est pages: 6 · difficulty: extreme · review checklist: **BLOCKED on ARCH-D1**; 28/25/25 drift cited; CI-guard requirement recorded
  - **CH-10.08.03 — Adapter-package-to-catalog correspondence (lmstudio gap, ARCH-D2)** — depends-on: CH-10.08.02 · references: §14, §50, `packages/ai/providers/lmstudio`, ARCH-D2 · related features: capability honesty · est pages: 5 · difficulty: high · review checklist: **BLOCKED on ARCH-D2**; typed adapter without catalog entry flagged
  - **CH-10.08.04 — Cross-language mirror pointer correction (ARCH-D3)** — depends-on: CH-10.08.02 · references: §14, §50, `provider.ts`, `core/llm/mod.rs:649`, ARCH-D3 · related features: mirror maintenance · est pages: 4 · difficulty: med · review checklist: **BLOCKED on ARCH-D3**; misdirected pointer documented; no code rename instructed

#### BK-10.09 — Model-Output Safety & Moderation Runtime

- **Parent Volume:** VOL-10 · **Canonical Status:** planned · **Generation Order:** 9
- **Maps to:** AGI-DOC-0015 inheriting book **AI Runtime Specification** — model-output safety/moderation portion (closes gap #23, ownership). Disjoint seam: this book owns MODEL-output harm-scoring/refusal/policy checks at the runtime boundary; VOL-15 BK-15.5 owns TOOL-output untrusted-data handling (a distinct boundary, referenced not re-owned); the Security Specification (VOL-20) owns policy authoring, egress and trust-plane enforcement (referenced).
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — own the runtime contract that scores, gates, and (where required) refuses model-generated output, distinct from the `safetyDirectives` system-prompt field which is an input directive, not output validation. Dependencies — BK-10.01 (StreamChunk), BK-10.03 (resilience). Prerequisites — `packages/contracts/types/src/suite-contracts.ts` L625 (`safetyDirectives` as input field, not validator). Cross-References — §15, §16, §54, VOL-15 BK-15.5 (tool-output boundary), VOL-20 Security Specification (policy/egress). Expected Inputs — normalized model output stream, configured safety policy. Expected Outputs — output-safety decision (allow / score / refuse) with audit hook. Review Requirements — architecture review; mandatory security review (safety decisions are AGI-TRUST-class); CI regression reference for refusal behavior.
  - **Chapters:**
  - **CH-10.09.01 — Output-safety boundary (model-output ≠ tool-output ≠ system directive)** — depends-on: CH-10.01.03 · references: §15, §54, `suite-contracts.ts` L625 (safetyDirectives), VOL-15 BK-15.5 · related features: moderation, safety · est pages: 6 · difficulty: high · review checklist: model-output validation owned here; tool-output deferred to VOL-15 BK-15.5; safetyDirectives identified as input field not validator (seam guard)
  - **CH-10.09.02 — Harm-scoring & policy-check runtime (provider-native vs AGI-owned)** — depends-on: CH-10.09.01 · references: §54, VOL-20 Security Specification (policy authoring), `packages/contracts/types/src/models.json` · related features: harm scoring · est pages: 7 · difficulty: high · review checklist: policy authoring referenced from VOL-20 not restated; provider-native moderation vs AGI-owned scoring documented honestly; no invented moderation model
  - **CH-10.09.03 — Refusal & redaction at the runtime boundary** — depends-on: CH-10.09.02 · references: §54, §24 (Security book owns redaction patterns), VOL-20 · related features: refusal, safe rendering · est pages: 6 · difficulty: high · review checklist: redaction patterns deferred to Security Specification; runtime refusal call-sites enumerated only; fail-closed on policy violation
  - **CH-10.09.04 — Safety-decision audit trail & trust-mode scoping** — depends-on: CH-10.09.02 · references: §16, §24, AGI-TRUST-0001, Observability book (audit taxonomy) · related features: safety audit · est pages: 6 · difficulty: extreme · review checklist: safety decision auditable; Local-mode output never silently scored by cloud; audit taxonomy deferred to Observability book

#### BK-10.10 — System-Prompt & Instruction-Template Management

- **Parent Volume:** VOL-10 · **Canonical Status:** planned · **Generation Order:** 10
- **Maps to:** AGI-DOC-0015 inheriting book **AI Runtime Specification** — system-prompt/instruction-template portion of §54 (closes gap #41, ownership). The `ChatRequest.system` field exists at the wire (BK-10.01) but no SSOT/composition/versioning layer owns it; this book owns that layer. Disjoint seam: VOL-11 Context Runtime owns deterministic source-packing of the assembled context (referenced); this book owns the template SSOT and composition that feeds the system field, not the budget packing.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — own the system-prompt/instruction-template SSOT, composition, and versioning deferred from §54, replacing per-surface hardcoded prompts with a single sourced template layer. Dependencies — BK-10.01 (ChatRequest.system wire shape). Prerequisites — `packages/contracts/types/src/provider-adapter.ts` (ChatRequest.system field), per-surface prompt sites. Cross-References — §54, §12, VOL-11 (context packing consumer), VOL-21 Observability (prompt-drift monitoring). Expected Inputs — per-experience template definitions, composition variables. Expected Outputs — template SSOT + composition/versioning spec. Review Requirements — architecture review; capability-honesty gate (template never claims unavailable capability); drift-monitoring reference.
  - **Chapters:**
  - **CH-10.10.01 — Template SSOT & per-experience specialization** — depends-on: CH-10.01.02 · references: §54, §12, `provider-adapter.ts` (ChatRequest.system) · related features: per-experience prompt specialization · est pages: 6 · difficulty: med · review checklist: single template SSOT; current per-surface hardcoded state documented honestly as Current; no invented template registry
  - **CH-10.10.02 — Template composition & variable resolution** — depends-on: CH-10.10.01 · references: §54, VOL-11 (context packing) · related features: prompt composition · est pages: 6 · difficulty: med · review checklist: composition feeds ChatRequest.system; context-budget packing deferred to VOL-11 (seam guard)
  - **CH-10.10.03 — Template versioning & change governance** — depends-on: CH-10.10.01 · references: §54, §49 (versioning, API book owns /v1), Testing/Governance book · related features: prompt versioning · est pages: 4 · difficulty: med · review checklist: template version pinning owned here; API /v1 versioning referenced not restated
  - **CH-10.10.04 — Prompt-drift monitoring handoff (defers to Observability)** — depends-on: CH-10.10.03 · references: §54, VOL-21 Observability book (metric/event taxonomy) · related features: prompt-drift monitoring · est pages: 4 · difficulty: med · review checklist: drift signals emitted; metric taxonomy deferred to Observability book (no duplicate telemetry model)

#### BK-10.11 — Model Evaluation & LLM-as-Judge Runtime

- **Parent Volume:** VOL-10 · **Canonical Status:** planned · **Generation Order:** 11
- **Maps to:** AGI-DOC-0015 inheriting book **AI Runtime Specification** — runtime evaluation portion of §54 (closes gap #43). Disjoint seam: this book owns RUNTIME eval loops, the LLM-as-judge execution contract, quality-regression detection, and prompt A/B execution; VOL-34 BK-34.02 owns the research/prior-art evaluation METHOD (referenced, not re-owned). ModelBenchmarks in the catalog are static scores (§14 SSOT) — this book owns dynamic eval execution, not static catalog scores.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — own the runtime evaluation contract deferred from §54: how an eval loop is run, how an LLM-as-judge scores output, how quality regressions are detected, and how prompt A/B variants are executed. Dependencies — BK-10.01 (ChatRequest/StreamChunk), BK-10.05 (agent loop, for judge-as-agent). Prerequisites — model SSOT (`models.json` ModelBenchmarks static scores). Cross-References — §54, §12, VOL-34 BK-34.02 (research method), VOL-21 Observability (quality metrics). Expected Inputs — eval dataset, model route, judge config. Expected Outputs — eval-loop + judge + regression-gate spec. Review Requirements — architecture review; eval must run within a single trust mode; capability-honesty (judge route real).
  - **Chapters:**
  - **CH-10.11.01 — Eval-loop execution contract (dataset → run → score)** — depends-on: CH-10.01.02 · references: §54, `models.json` (ModelBenchmarks static scores), VOL-34 BK-34.02 · related features: quality gates · est pages: 7 · difficulty: high · review checklist: runtime eval execution owned here; research/prior-art method deferred to VOL-34 BK-34.02 (seam guard); static catalog scores referenced not redefined
  - **CH-10.11.02 — LLM-as-judge execution contract** — depends-on: CH-10.11.01, CH-10.05.01 · references: §54, §16, `agent.ts` · related features: LLM-as-judge · est pages: 7 · difficulty: extreme · review checklist: judge runs as bounded loop in single trust mode; judge route is a real catalog route (capability honesty)
  - **CH-10.11.03 — Quality-regression detection & gating** — depends-on: CH-10.11.01 · references: §54, VOL-21 Observability (quality metrics), Testing/Governance book (quality gates) · related features: degradation alerts · est pages: 6 · difficulty: high · review checklist: regression thresholds sourced; metric persistence deferred to Observability book; gate ladder referenced from Testing book
  - **CH-10.11.04 — Prompt A/B variant execution** — depends-on: CH-10.11.01, CH-10.10.03 · references: §54, BK-10.10 (template versioning) · related features: prompt A/B · est pages: 5 · difficulty: high · review checklist: A/B variants reference BK-10.10 template versions; no duplicate template model

## VOL-11 — Context Runtime

- **Volume ID:** VOL-11 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Author the Context Runtime Specification — the inheriting book that owns the context-assembly behavior the Architecture Constitution (AGI-DOC-0015) §19 defers: the compaction modes and trigger thresholds, the order in which sources (conversation, memory, project, tool results, instructions) are packed into the token budget, and the summarization-to-memory cadence — all bound by the §19 assembly-determinism invariant (and the AC-19/AC-20 state rules). This volume specifies how context is assembled; it does not redefine that assembly is deterministic, budget-bounded from real model metadata, or trust-boundary-scoped (owned by §19, referenced).
- **Scope:** IN — compaction modes (compact / clear-tool-uses / clear-thinking / none), token-trigger thresholds, source-packing order into the budget, summarization-to-memory cadence, budget derivation from the model catalog context window. OUT — the determinism _invariant_ itself (§19, referenced), the model context-window SSOT value (§14 / `models.json` / AGI-AI-0001, referenced), the memory scoring/promotion algorithm that consumes the summarized output (VOL-12 Memory Runtime), the session schema context assembles from (Session & Synchronization book), the trust-boundary egress mechanism (Security book).
- **Owner:** Context Runtime lead (Platform architecture)
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015)
- **Dependencies:** VOL-12 (Memory Runtime — context packs memory and feeds summarization back to it) · **Prerequisites:** AGI-DOC-0015 §19 ratified; `apps/web/lib/llm-providers/context-management.ts` present; model context window in SSOT (AGI-AI-0001)
- **Review Process:** Architecture review (determinism invariant gate on every chapter); reproducibility check (same inputs → same assembled context); trust-boundary review for the cross-boundary read-scoping chapter (AGI-TRUST-\*)
- **Audience:** Context-assembly engineers, web/desktop runtime engineers, memory-runtime engineers (summarization handoff), test engineers verifying assembly reproducibility
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 3 / ~70 pages across 3 books
- **Inherits / References (no duplication):** inherits AGI-DOC-0002, AGI-DOC-0005, AGI-DOC-0007, AGI-DOC-0008; maps to AGI-DOC-0015 inheriting book **Context Runtime Specification** (§19 deferral). References — never restates — "Context Assembly Determinism" (§19), "Model Catalog SSOT context window" (§14, AGI-AI-0001), the Memory Runtime promotion target (VOL-12). Defers the memory scoring/ranking algorithm to VOL-12; defers the egress mechanism to the Security book; defers the session schema to the Session & Synchronization book.

### Books

#### BK-11.01 — Deterministic Assembly & Source-Packing Order (AC-19/AC-20)

- **Parent Volume:** VOL-11 · **Canonical Status:** Canonical — generated as AGI-DOC-0018 (2026-06-25); audit findings in AGI-DOC-0019 · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the deterministic source-packing order deferred from §19: the order in which conversation, memory, project knowledge, tool results, and instructions are packed into the token budget such that fixed inputs always produce the same assembled context. Dependencies — VOL-12 (memory corpus as a packed source). Prerequisites — §19 determinism invariant ratified. Cross-References — §19, AC-19, AC-20, AGI-AI-0001, VOL-12. Expected Inputs — conversation, memory corpus, project, instructions, token budget. Expected Outputs — packing-order spec with reproducibility guarantee. Review Requirements — architecture review; reproducibility test (fixed inputs → identical assembly).
  - **Chapters:**
  - **CH-11.01.01 — Source taxonomy & packing precedence** — depends-on: — · references: §19, AC-19 · related features: context assembly · est pages: 6 · difficulty: high · review checklist: five source classes enumerated; determinism invariant referenced not restated
  - **CH-11.01.02 — Deterministic assembly contract (fixed inputs → identical context)** — depends-on: CH-11.01.01 · references: §19, AC-19, AC-20 · related features: reproducibility · est pages: 6 · difficulty: extreme · review checklist: no ambient nondeterminism; decay/recency admitted only as declared input
  - **CH-11.01.03 — Cross-trust-boundary read scoping (managed turn never assembles local-origin)** — depends-on: CH-11.01.01 · references: §19, AGI-TRUST-0001 · related features: trust-boundary · est pages: 5 · difficulty: extreme · review checklist: context never crosses boundary it is not authorized for; egress mechanism referenced

#### BK-11.02 — Compaction Modes & Trigger Thresholds

- **Parent Volume:** VOL-11 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the compaction modes (compact / clear-tool-uses / clear-thinking / none) and the token-trigger thresholds deferred from §19, with the budget derived from the model's declared context window in the catalog SSOT (never hardcoded). Dependencies — BK-11.01. Prerequisites — `context-management.ts`, model context window (AGI-AI-0001). Cross-References — §19, §14, AGI-AI-0001, `apps/web/lib/llm-providers/context-management.ts`. Expected Inputs — assembled context, token budget, model metadata. Expected Outputs — compaction-mode spec keyed to trigger thresholds. Review Requirements — architecture review; budget must derive from SSOT context window.
  - **Chapters:**
  - **CH-11.02.01 — Compaction modes (compact / clear-tool-uses / clear-thinking / none)** — depends-on: CH-11.01.02 · references: §19, `context-management.ts` · related features: context compaction · est pages: 6 · difficulty: high · review checklist: four modes grounded in implementation; current Anthropic-only state noted honestly
  - **CH-11.02.02 — Token-trigger thresholds & budget derivation from SSOT context window** — depends-on: CH-11.02.01 · references: §19, §14, AGI-AI-0001, `context-management.ts` · related features: budget management · est pages: 6 · difficulty: high · review checklist: window read from catalog SSOT; never hardcoded/guessed
  - **CH-11.02.03 — Per-surface compaction-path reconciliation (web server-side vs desktop)** — depends-on: CH-11.02.01 · references: §19, `apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs` · related features: context runtime · est pages: 5 · difficulty: high · review checklist: two-path current state documented; convergence target separated from fact

#### BK-11.03 — Summarization-to-Memory Cadence

- **Parent Volume:** VOL-11 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the summarization-to-memory cadence deferred from §19: when and how context summarization promotes facts into the memory runtime, handing off to VOL-12 (which owns the memory scoring/promotion algorithm). Dependencies — BK-11.01, BK-11.02, VOL-12 (promotion target). Prerequisites — desktop summarizer present. Cross-References — §19, §18, VOL-12, `apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs`. Expected Inputs — assembled/compacted context. Expected Outputs — summarization cadence spec + memory-promotion handoff contract. Review Requirements — architecture review; promotion never crosses a trust boundary (memory boundary intrinsic, §18).
  - **Chapters:**
  - **CH-11.03.01 — Summarization trigger cadence (periodic / on-compaction)** — depends-on: CH-11.02.01 · references: §19, `conversation_summarizer.rs` · related features: summarization · est pages: 5 · difficulty: high · review checklist: cadence grounded; algorithm itself deferred
  - **CH-11.03.02 — Memory-promotion handoff to VOL-12 (boundary-preserving)** — depends-on: CH-11.03.01 · references: §19, §18, VOL-12, AGI-TRUST-0001 · related features: memory promotion · est pages: 5 · difficulty: high · review checklist: scoring/promotion algorithm owned by VOL-12; local-origin stays local

#### BK-11.04 — Retrieval & RAG Context Packing (non-memory)

- **Parent Volume:** VOL-11 · **Canonical Status:** planned · **Generation Order:** 4
- **Maps to:** AGI-DOC-0015 inheriting book **Context Runtime Specification** (§19 deferral) — the retrieval-and-packing extension that closes the RAG half of gap #9. Disjoint seam (four-way): this book owns external-corpus RETRIEVAL and RAG packing into the deterministic token budget (extending BK-11.01 source-packing); the embedding-GENERATION provider call is owned by VOL-16 BK-16.6 (referenced); the memory scoring/promotion algorithm and memory boundary are owned by VOL-12 and are NOT redefined here (referenced); vector/blob persistence is owned by VOL-19/Database Specification (referenced). MUST NOT redefine memory (VOL-12) — RAG corpora are a distinct packed source class.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify how externally-retrieved corpus chunks (non-memory) are retrieved, ranked, and packed into the deterministic context budget defined by BK-11.01, as a new source class bound by the §19 assembly-determinism invariant. Dependencies — BK-11.01 (source-packing order), VOL-16 BK-16.6 (embedding generation), VOL-12 (memory boundary, not touched), VOL-19 (vector persistence). Prerequisites — §19 determinism invariant; BK-11.01 Canonical. Cross-References — §19, AC-19, AC-20, VOL-16 BK-16.6, VOL-12, VOL-19, AGI-TRUST-0001. Expected Inputs — query, external corpus, embedding route (VOL-16). Expected Outputs — RAG retrieval + packing spec with reproducibility guarantee. Review Requirements — architecture review (determinism gate); trust-boundary review (retrieved corpus never crosses an unauthorized boundary).
  - **Chapters:**
  - **CH-11.04.01 — RAG corpus as a distinct packed source class (not memory)** — depends-on: CH-11.01.01 · references: §19, AC-19, VOL-12 (memory boundary, not redefined) · related features: RAG, knowledge base · est pages: 7 · difficulty: high · review checklist: RAG corpus is a new source class distinct from memory; memory scoring deferred to VOL-12 (seam guard); determinism invariant referenced not restated
  - **CH-11.04.02 — External-corpus retrieval & ranking (embedding call deferred to VOL-16)** — depends-on: CH-11.04.01, VOL-16 BK-16.6 · references: §19, VOL-16 BK-16.6 (embedding generation), VOL-19 (vector persistence) · related features: retrieval, citations · est pages: 7 · difficulty: high · review checklist: embedding-generation call deferred to VOL-16 BK-16.6; vector persistence deferred to VOL-19; ranking deterministic per §19
  - **CH-11.04.03 — Deterministic RAG packing into the token budget** — depends-on: CH-11.04.02, CH-11.02.02 · references: §19, AC-19, AC-20, BK-11.01, BK-11.02 (budget derivation) · related features: context assembly · est pages: 6 · difficulty: extreme · review checklist: fixed inputs → identical packed RAG context; budget derived from SSOT context window (reuses BK-11.02), never hardcoded
  - **CH-11.04.04 — Citation provenance & cross-trust-boundary read scoping** — depends-on: CH-11.04.01 · references: §19, AGI-TRUST-0001, BK-11.01 (CH-11.01.03 read scoping) · related features: citations, trust-boundary · est pages: 5 · difficulty: extreme · review checklist: retrieved corpus never assembled across an unauthorized boundary (reuses BK-11.01 read-scoping rule); citation provenance preserved; egress mechanism referenced

## VOL-12 — Memory Runtime

- **Volume ID:** VOL-12 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Author the Memory Runtime Specification — the inheriting book that owns the memory persistence/retrieval behavior the Architecture Constitution (AGI-DOC-0015) §18 defers: the scoring/ranking algorithm, the semantic index, decay curves, the summarization-to-memory promotion cadence, and the explicit reconciliation contract between the local two-layer memory graph and the cloud flat-fact projection. This volume specifies how memory is scored and retrieved; it does not redefine that retrieval is deterministic or that a memory's trust boundary is intrinsic and immutable (owned by §18, referenced).
- **Scope:** IN — scoring/ranking algorithm, semantic index, decay curves, access-boost, promotion cadence, local two-layer (long-term `user_memory` + append-only `daily_logs`) vs cloud flat-fact (`user_memories`) reconciliation contract. OUT — the retrieval-determinism _invariant_ and the memory-boundary-intrinsic _rule_ (§18, referenced), the cloud delta-sync transport carrying `user_memories` (Session & Synchronization book / §21), the migration SQL for `user_memories` (Database book), the context-assembly packing that consumes memory (VOL-11), the egress mechanism (Security book).
- **Owner:** Memory Runtime lead (Platform architecture)
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015)
- **Dependencies:** none upstream within the runtime family (foundational state-plane runtime; VOL-11 depends on it) · **Prerequisites:** AGI-DOC-0015 §18 ratified; `apps/desktop/src-tauri/src/core/agi/memory_manager.rs` and cloud `user_memories` (migrations 0010/0040) present
- **Review Process:** Architecture review (retrieval-determinism gate on every chapter); mandatory human security review for the local↔cloud reconciliation chapter (memory boundary is AGI-TRUST-class); ADR required to ratify the reconciliation contract (closes ARCH-D9)
- **Audience:** Memory-runtime engineers (desktop-Rust two-layer store, cloud flat-fact projection), retrieval/ranking engineers, context-runtime engineers (promotion consumer), security reviewers
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 4 / ~85 pages across 3 books
- **Inherits / References (no duplication):** inherits AGI-DOC-0002, AGI-DOC-0005, AGI-DOC-0007, AGI-DOC-0008; maps to AGI-DOC-0015 inheriting book **Memory Runtime Specification** (§18 deferral). References — never restates — "Memory Retrieval Determinism & Trust Boundary Ownership" (§18), AGI-TRUST-0001 (local memory never silently promoted), the cloud delta-sync transport (§21 / Session & Synchronization book), the `user_memories` migration (Database book). Defers context packing to VOL-11; defers sync transport to the Session & Synchronization book.

### Books

#### BK-12.01 — Scoring, Ranking & Semantic Index

- **Parent Volume:** VOL-12 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the deterministic scoring/ranking algorithm and the local semantic index deferred from §18: given a fixed corpus and query, which memories are eligible and in what order, reproducibly. Dependencies — none. Prerequisites — §18 determinism invariant; `memory_manager.rs`. Cross-References — §18, AC (state plane), `apps/desktop/src-tauri/src/core/agi/memory_manager.rs`. Expected Inputs — memory corpus, query. Expected Outputs — scoring/ranking + index spec with reproducibility guarantee. Review Requirements — architecture review; determinism (same corpus+query → same eligible set + order).
  - **Chapters:**
  - **CH-12.01.01 — Deterministic scoring & ranking algorithm** — depends-on: — · references: §18, `memory_manager.rs` · related features: memory retrieval · est pages: 7 · difficulty: extreme · review checklist: same inputs → same order; determinism invariant referenced not restated
  - **CH-12.01.02 — Semantic index (local TF-IDF / embedding) structure** — depends-on: CH-12.01.01 · references: §18, `memory_manager.rs` · related features: semantic search · est pages: 6 · difficulty: high · review checklist: index grounded in implementation; no invented embedding model
  - **CH-12.01.03 — Access-boost & relevance reinforcement** — depends-on: CH-12.01.01 · references: §18, `memory_manager.rs` · related features: memory ranking · est pages: 5 · difficulty: high · review checklist: access-boost as declared input to deterministic score

#### BK-12.02 — Decay Curves & Promotion Cadence

- **Parent Volume:** VOL-12 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the importance-decay curves and the promotion cadence deferred from §18: how memory importance decays over time (admitted only as an explicit declared input to the deterministic score) and when facts promote from daily logs / summarized context into long-term memory. Dependencies — BK-12.01, VOL-11 (summarization handoff source). Prerequisites — `memory_manager.rs` decay/daily-log model. Cross-References — §18, §19, VOL-11, `memory_manager.rs`. Expected Inputs — memory age, access, summarized facts. Expected Outputs — decay-curve + promotion-cadence spec. Review Requirements — architecture review; decay is a declared input, never ambient nondeterminism.
  - **Chapters:**
  - **CH-12.02.01 — Importance decay curves (declared-input determinism)** — depends-on: CH-12.01.01 · references: §18, `memory_manager.rs` · related features: memory decay · est pages: 6 · difficulty: high · review checklist: decay admitted only as explicit declared input per §18
  - **CH-12.02.02 — Daily-log → long-term promotion cadence** — depends-on: CH-12.02.01 · references: §18, `memory_manager.rs` · related features: memory promotion · est pages: 6 · difficulty: high · review checklist: two-layer model (user_memory + daily_logs) grounded; cadence sourced
  - **CH-12.02.03 — Summarization-to-memory promotion (VOL-11 handoff consumer)** — depends-on: CH-12.02.02 · references: §18, §19, VOL-11 · related features: summarization promotion · est pages: 5 · difficulty: high · review checklist: consumes VOL-11 handoff; promotion preserves trust boundary

#### BK-12.03 — Local↔Cloud Reconciliation Contract (ARCH-D9)

- **Parent Volume:** VOL-12 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — own the explicit reconciliation contract between the local two-layer memory graph and the cloud flat-fact projection, deferred from §18: what is promotable, what is projection-only, and what never leaves the device. **BLOCKED on ARCH-D9** (local two-layer decay/daily-log/TF-IDF graph has no representation in the cloud flat-fact projection; "one shared state" holds only for the reduced projection; closing book = Memory Runtime Spec per register §9). Dependencies — BK-12.01, BK-12.02. Prerequisites — ARCH-D9 owner decision; local `memory_manager.rs` + cloud `user_memories` (migrations 0010/0040). Cross-References — §18, §21 (sync transport, referenced), ARCH-D9, register §9, AGI-TRUST-0001. Expected Inputs — local memory graph, cloud fact projection. Expected Outputs — reconciliation contract (promotable / projection-only / device-only). Review Requirements — mandatory human security review (memory boundary intrinsic, AGI-TRUST-class); ADR to ratify the contract.
  - **Chapters:**
  - **CH-12.03.01 — Local two-layer graph vs cloud flat-fact projection model** — depends-on: CH-12.01.01 · references: §18, `memory_manager.rs`, architecture-manifest §6/§7, migrations 0010/0040, ARCH-D9 · related features: memory · est pages: 7 · difficulty: extreme · review checklist: **BLOCKED on ARCH-D9**; divergent models documented as current state, not as lossy mirror
  - **CH-12.03.02 — Reconciliation contract (promotable / projection-only / device-only)** — depends-on: CH-12.03.01 · references: §18, ARCH-D9, register §9 · related features: local/cloud memory · est pages: 7 · difficulty: extreme · review checklist: **BLOCKED on ARCH-D9**; cloud projection not authoritative mirror; contract requires ADR
  - **CH-12.03.03 — Boundary-preserving promotion (local→cloud explicit consented handoff only)** — depends-on: CH-12.03.02 · references: §18, §24 (HandoffDraft owned elsewhere), AGI-TRUST-0001 · related features: trust-boundary · est pages: 5 · difficulty: extreme · review checklist: local-origin never silently promoted; crossing is explicit consented handoff; sync transport referenced

## VOL-13 — Workflow Runtime

- **Volume ID:** VOL-13 · **Generation Priority:** P2 · **Difficulty:** high
- **Purpose:** Author the workflow execution/orchestration _boundary_ documentation for the Architecture Constitution (AGI-DOC-0015) §17 Workflow Architecture. **Mapping note (no invented runtime name):** §17 defines only the workflow boundary and explicitly defers the execution algorithm to the AI Runtime book (§54); the constitution's §1173 inheriting-book family contains **no standalone "Workflow Runtime Specification."** Therefore VOL-13 maps to **constitution §17, with its behavioral inheriting book = AI Runtime Specification (shared with VOL-10)**. VOL-13 owns the declarative composition contract (`WorkflowDefinition` node-graph + trigger taxonomy), trust-inheritance per AC-17 (a workflow MUST NOT widen its actors' trust boundary), and externally-originated-trigger authentication/validation — and **defers the execution engine to VOL-10 (BK-10.07)**.
- **Scope:** IN — `WorkflowDefinition` typed node-graph composition contract (agent/decision/loop/parallel/wait/script/tool nodes), trigger taxonomy (manual/scheduled/event/webhook), trust-inheritance boundary (AC-17 no-widening), webhook/event trigger authentication & untrusted-input validation. OUT — the execution engine: node scheduling, state advance, failure/retry reconciliation, trigger _firing_ (all owned by VOL-10 BK-10.07 / §54, referenced); the agent loop (VOL-10 BK-10.05); the cron/scheduling durable contract (Background Execution/Offline/Reliability book); the provider abstraction (§13).
- **Owner:** Workflow lead (Platform architecture) — coordinates with VOL-10 AI Runtime lead for the deferred engine
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015)
- **Dependencies:** VOL-10 (AI Runtime — owns the deferred workflow execution engine, BK-10.07) · **Prerequisites:** AGI-DOC-0015 §17 ratified; `packages/contracts/types/src/workflow.ts` present; AC-17 in the rule canon
- **Review Process:** Architecture review (AC-17 no-widening gate on every chapter); trust-boundary review for the trigger-authentication chapter (externally-originated triggers are untrusted inputs); coordination review with VOL-10 to confirm engine-vs-contract split has no duplication
- **Audience:** Workflow contract authors, trigger/integration engineers, AI Runtime engine implementers (VOL-10 consumers of this contract), security reviewers
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / med / 3 / ~45 pages across 2 books
- **Inherits / References (no duplication):** inherits AGI-DOC-0002, AGI-DOC-0005, AGI-DOC-0007, AGI-DOC-0008; maps to AGI-DOC-0015 **§17 Workflow Architecture**, behavioral inheriting book = **AI Runtime Specification** (shared with VOL-10; no standalone Workflow Runtime Spec exists). References — never restates — "Workflow boundary" (§17), AC-17, the workflow execution engine (VOL-10 BK-10.07), the provider abstraction (§13), consent-gated handoff (§16), capability honesty (§12). Defers the execution engine, node scheduling, and trigger firing to VOL-10; defers the durable cron/scheduling contract to the Background Execution/Offline/Reliability book.

### Books

#### BK-13.01 — Workflow Composition Contract (WorkflowDefinition node-graph)

- **Parent Volume:** VOL-13 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — own the declarative composition contract deferred-as-boundary by §17: the `WorkflowDefinition` typed node-graph (agent/decision/loop/parallel/wait/script/tool nodes) and the trigger taxonomy (manual/scheduled/event/webhook), as a contract the VOL-10 engine consumes. Dependencies — VOL-10 (engine consumer). Prerequisites — `packages/contracts/types/src/workflow.ts`. Cross-References — §17, VOL-10 BK-10.07, `packages/contracts/types/src/workflow.ts`. Expected Inputs — workflow node-graph definitions. Expected Outputs — composition-contract spec (the engine in VOL-10 references this). Review Requirements — architecture review; coordination review confirming engine lives in VOL-10, not here.
  - **Chapters:**
  - **CH-13.01.01 — WorkflowDefinition typed node-graph (node kinds)** — depends-on: — · references: §17, `packages/contracts/types/src/workflow.ts` · related features: workflow definition · est pages: 7 · difficulty: high · review checklist: node kinds grounded in workflow.ts; execution engine deferred to VOL-10 BK-10.07
  - **CH-13.01.02 — Trigger taxonomy (manual / scheduled / event / webhook) contract** — depends-on: CH-13.01.01 · references: §17, `workflow.ts`, Background/Offline/Reliability book (durable cron) · related features: triggers · est pages: 6 · difficulty: high · review checklist: trigger _firing_ deferred to VOL-10; durable cron contract deferred to Background book
  - **CH-13.01.03 — Engine deferral record (VOL-10 BK-10.07 owns execution)** — depends-on: CH-13.01.01 · references: §17, §54, VOL-10 BK-10.07 · related features: workflow runtime · est pages: 4 · difficulty: med · review checklist: explicit deferral; no scheduling/state-advance/retry duplicated from VOL-10

#### BK-13.02 — Trust-Inheritance & Trigger Authentication (AC-17)

- **Parent Volume:** VOL-13 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — own the two boundaries §17 does NOT defer: a workflow inherits and MUST NOT widen the trust boundary of its actors (AC-17), and externally-originated triggers (webhook/event) are untrusted inputs that MUST be authenticated and validated before driving execution. Dependencies — BK-13.01. Prerequisites — AC-17 in canon. Cross-References — §17, AC-17, §13, §16, §12, AGI-TRUST-0001. Expected Inputs — workflow actors, external trigger payloads. Expected Outputs — trust-inheritance + trigger-auth spec. Review Requirements — mandatory trust-boundary review; scheduled/event workflow must not be a covert Local→cloud channel.
  - **Chapters:**
  - **CH-13.02.01 — Trust-inheritance / no-widening (AC-17)** — depends-on: CH-13.01.01 · references: §17, AC-17, §13, §16, §12, AGI-TRUST-0001 · related features: trust-boundary · est pages: 6 · difficulty: extreme · review checklist: workflow node inference/crossing subject to §13/§16/§12 exactly as direct action; no covert channel
  - **CH-13.02.02 — External trigger authentication & untrusted-input validation** — depends-on: CH-13.01.02 · references: §17, AC-17 · related features: webhook/event triggers · est pages: 6 · difficulty: high · review checklist: webhook/event triggers authenticated + validated before driving execution; untrusted by default

## VOL-14 — Agent Runtime

- **Volume ID:** VOL-14 · **Generation Priority:** P1 · **Difficulty:** extreme
- **Purpose:** This volume specifies the orchestration-layer agent runtime: how a single agent turn is decomposed into deterministic loop steps, how tool calls are issued and their results re-ingested, how autonomy and approval are governed as an explicit state machine (ask-before-acting), how agents hand work to other agents across a trust boundary (A2A handoff), and how multiple agents are convened into a council. It maps the agent-loop / autonomy / handoff portion of the Architecture Constitution's AI Runtime Specification inheriting book and owns the _behavioral_ contract the constitution defers; it never restates provider transport (owned by VOL-16) or tool/MCP contracts (owned by VOL-15).
- **Scope:** IN — agent loop step semantics, step budget/termination, tool-call request/result protocol shape at the loop boundary, autonomy levels, approval/consent state machine (ask-before-acting per AC-53), interruption/resume of an agent turn, A2A handoff draft and trust-boundary crossing, council/multi-agent convening and arbitration, agent observability hooks. OUT — ProviderAdapter/StreamChunk wire shapes, credential flow, retry/fallback/watchdog (VOL-16); ToolDef/ToolChoice contracts, provider-protocol schema policy, MCP signed-manifest/consent gating, tool execution safety (VOL-15); context assembly/compaction (Context Runtime book); memory persistence/retrieval (Memory Runtime book); session fork/checkpoint persistence formats (Session & Synchronization book).
- **Owner:** AI Runtime lead
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015)
- **Dependencies:** VOL-15 (Tool Runtime), VOL-16 (Provider Runtime) · **Prerequisites:** AGI-DOC-0015 §15 (AI Runtime), §16 (Agent Architecture), §17 (AI Substrate), §24 (Privacy Architecture); AGI-DOC-0013 Part IV §25 (AGI Agent Experience); canonical-glossary.md (dispatch, computer use, agent terms)
- **Review Process:** Architecture review (constitution-inheritance + AC-canon conformance), trust-boundary security review (mandatory — A2A handoff crosses Local→BYOK/Managed per AGI-TRUST-\*), documentation-compiler validation (10-rule ruleset), owner sign-off on any ARCH-D6-dependent book.
- **Audience:** AI runtime engineers, surface engineers integrating the agent loop, security reviewers, agent-tooling authors.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** extreme / high / 4 / ~360 pages across 5 books
- **Inherits / References (no duplication):** Inherits AGI-DOC-0002 (documentation governance), AGI-DOC-0005 (requirement IDs), AGI-DOC-0007 (cross-reference system), AGI-DOC-0008 (compiler). References — AGI-DOC-0015 §16 "Agent Boundary & Trust Mode Crossing (HandoffDraft)", §13 "ProviderAdapter as Single Inference Boundary" (via VOL-16), §12 "Capability Honesty"; AGI-DOC-0013 Part IV §25 (four Experiences); VOL-15 (tool-call execution side), VOL-16 (inference transport side). AC-53 (ask-before-acting), AC-98 (trust-invariant amendment bar) referenced as review-checklist obligations, not redefined.

### Books

#### BK-14.1 — Agent Loop & Step Semantics

- **Parent Volume:** VOL-14 · **Canonical Status:** planned · **Generation Order:** 1
- **Maps to:** AGI-DOC-0015 inheriting book #1 "AI Runtime Specification" — owns the agent-loop step-semantics portion deferred from §15/§16 (disjoint from VOL-16, which owns the ProviderAdapter/StreamChunk/transport portion of the same book).
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — define the deterministic decomposition of an agent turn into observable steps (plan → call → ingest → continue/terminate) and the termination/budget contract. Dependencies — VOL-16 (inference call boundary), VOL-15 (tool-call execution boundary). Prerequisites — AGI-DOC-0015 §15, §17. Cross-References — VOL-16 BK-16.1 (StreamChunk), VOL-15 BK-15.1 (ToolDef). Expected Inputs — a model route object (from VOL-16), an enabled toolset (from VOL-15), a context bundle (Context Runtime book). Expected Outputs — a step transcript with typed step kinds and a deterministic termination reason. Review Requirements — architecture review for determinism + no-hidden-egress; compiler validation.
- **Chapters:**
  - **CH-14.1.01 — Agent Turn Decomposition & Step Kinds** — depends-on: AGI-DOC-0015 §15 · references: `packages/ai/provider-runtime`, AGI-DOC-0015 §15 "AI Runtime", canonical-glossary "dispatch" · related features: AGI Agent, Dispatch · est pages: 18 · difficulty: high · review checklist: step kinds enumerated, no provider transport leakage into step model
  - **CH-14.1.02 — Step Budget, Loop Limits & Termination Reasons** — depends-on: CH-14.1.01 · references: AGI-DOC-0015 §15, Streaming & Long-Running Task book (tool-loop step limits) · related features: AGI Agent, Dispatch · est pages: 16 · difficulty: high · review checklist: termination deterministic, budget exhaustion fails closed not silently
  - **CH-14.1.03 — Tool-Call Result Ingestion at the Loop Boundary** — depends-on: CH-14.1.01, VOL-15 BK-15.1 · references: VOL-15 ToolDef/ToolChoice, AGI-DOC-0015 §15 · related features: AGI Agent, AGI Code · est pages: 14 · difficulty: high · review checklist: result re-ingestion references VOL-15 contract, does not redefine ToolDef
  - **CH-14.1.04 — Inference Call Boundary Reference (delegated to VOL-16)** — depends-on: VOL-16 BK-16.1 · references: VOL-16 ProviderAdapter/StreamChunk, AGI-DOC-0015 §13 · related features: AGI Agent · est pages: 8 · difficulty: med · review checklist: pure reference to VOL-16, zero transport/credential redefinition (seam guard)
  - **CH-14.1.05 — Cross-Runtime Loop Convergence (TS / CLI-Rust / desktop-Rust)** — depends-on: CH-14.1.01, VOL-16 BK-16.4 · references: AGI-DOC-0015 §15 convergence record, `apps/cli`, `apps/desktop/src-tauri` · related features: AGI Agent on CLI/Desktop · est pages: 16 · difficulty: extreme · review checklist: scope strictly the loop/step-execution shape across runtimes — provider-transport convergence is owned by VOL-16 BK-16.4 (no overlap); divergence documented as Current-vs-Target, ARCH-D4 owned by VOL-16
  - **CH-14.1.06 — Interruption, Cancellation & Resume of an Agent Turn** — depends-on: CH-14.1.02 · references: AGI-DOC-0015 §15, Session & Synchronization book (resume) · related features: AGI Agent, Dispatch · est pages: 14 · difficulty: high · review checklist: interruption leaves no partial egress, resume cites session book not redefines it

#### BK-14.2 — Tool-Call Protocol (Loop-Boundary Contract)

- **Parent Volume:** VOL-14 · **Canonical Status:** planned · **Generation Order:** 2
- **Maps to:** AGI-DOC-0015 inheriting book #1 "AI Runtime Specification" — agent-loop tool-call _protocol_ portion (§15). Disjoint seam with VOL-15: VOL-14 owns the protocol of issuing/receiving tool calls within the loop; VOL-15 owns ToolDef/ToolChoice contracts and execution.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the request/result envelope by which the loop emits a tool-call intent and consumes a tool result, independent of which tool runtime executes it. Dependencies — VOL-15 (executes the call), VOL-16 (carries the model's tool-call emission in StreamChunk). Prerequisites — AGI-DOC-0015 §15, §17. Cross-References — VOL-15 BK-15.1/BK-15.2, VOL-16 BK-16.1. Expected Inputs — a normalized tool-call emission from the model stream. Expected Outputs — a typed result envelope returned to the loop. Review Requirements — architecture review for contract stability + untrusted-result handling deferred to VOL-15 (AC-15).
- **Chapters:**
  - **CH-14.2.01 — Tool-Call Intent Envelope (loop → tool runtime)** — depends-on: VOL-16 BK-16.1 · references: AGI-DOC-0015 §15, VOL-15 ToolDef · related features: AGI Agent, AGI Code · est pages: 14 · difficulty: high · review checklist: envelope references VOL-15 ToolChoice, no provider-protocol redefinition (that is VOL-15)
  - **CH-14.2.02 — Tool-Result Envelope & Error Mapping** — depends-on: CH-14.2.01 · references: AGI-DOC-0015 §15, API book (error envelope) · related features: AGI Agent · est pages: 12 · difficulty: high · review checklist: error envelope cites API book, untrusted-output handling delegated to VOL-15 BK-15.5 (AC-15)
  - **CH-14.2.03 — Parallel & Sequential Tool-Call Ordering Guarantees** — depends-on: CH-14.2.01 · references: AGI-DOC-0015 §15 · related features: AGI Agent, AGI Code · est pages: 12 · difficulty: high · review checklist: ordering deterministic, references VOL-15 for execution-side concurrency
  - **CH-14.2.04 — Tool-Choice Forcing & Loop-Level Constraints** — depends-on: CH-14.2.01, VOL-15 BK-15.1 · references: VOL-15 ToolChoice, AGI-DOC-0015 §15 · related features: AGI Agent · est pages: 10 · difficulty: med · review checklist: ToolChoice referenced from VOL-15, not redefined (seam guard)

#### BK-14.3 — Autonomy & Approval State Machine (Ask-Before-Acting)

- **Parent Volume:** VOL-14 · **Canonical Status:** planned · **Generation Order:** 3
- **Maps to:** AGI-DOC-0015 inheriting book #1 "AI Runtime Specification" — autonomy/approval state-machine portion deferred from §15/§16/§24. Enforces AC-53 (ask-before-acting) as a review obligation referenced here.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — define autonomy levels and the consent/approval state machine that gates side-effecting actions, so the agent asks before acting on irreversible or boundary-crossing operations. Dependencies — VOL-15 (which actions are side-effecting/untrusted), VOL-16 (no consent implications for pure inference). Prerequisites — AGI-DOC-0015 §16, §24; AGI-DOC-0013 §13 (Consent value). Cross-References — VOL-15 BK-15.4 (MCP consent gating), BK-14.4 (handoff consent). Expected Inputs — an action classification (reversible/side-effecting/boundary-crossing). Expected Outputs — a gated approval decision with audit record. Review Requirements — mandatory trust-boundary security review; AC-53 conformance.
- **Chapters:**
  - **CH-14.3.01 — Autonomy Levels & Default Posture (ask-before-acting per AC-53)** — depends-on: AGI-DOC-0015 §16 · references: AGI-DOC-0015 §16, §24, AC-53, `apps/extension/__tests__/computer-use-default-ask.test.ts` · related features: AGI Agent, Computer/Browser Use · est pages: 16 · difficulty: high · review checklist: default is ask, not allow-all; cites AC-53; capability-honesty preserved
  - **CH-14.3.02 — Action Classification (reversible / side-effecting / boundary-crossing)** — depends-on: CH-14.3.01, VOL-15 BK-15.5 · references: AGI-DOC-0015 §24, VOL-15 execution-safety · related features: AGI Agent, Computer/Browser Use · est pages: 14 · difficulty: high · review checklist: classification references VOL-15 not redefines, boundary-crossing flags trust review
  - **CH-14.3.03 — Approval/Consent State Machine & Transitions** — depends-on: CH-14.3.02 · references: AGI-DOC-0015 §16, §24, canonical-glossary "consent" · related features: AGI Agent · est pages: 16 · difficulty: high · review checklist: fail-closed transitions, no implicit grant, audit on every transition
  - **CH-14.3.04 — Per-Surface Autonomy Parity & Allowlist Derivation** — depends-on: CH-14.3.01 · references: AGI-DOC-0015 §10, §12, trust-mode-surface-matrix.md · related features: AGI Agent across surfaces · est pages: 14 · difficulty: high · review checklist: allowlist derived from real capability (no fake availability), per-surface parity table referenced not duplicated
  - **CH-14.3.05 — Consent Audit Trail & Replayable Approval Records** — depends-on: CH-14.3.03 · references: AGI-DOC-0015 §24, Observability book · related features: AGI Agent · est pages: 12 · difficulty: med · review checklist: audit record durable, redaction cites Observability book, no secret leakage

#### BK-14.4 — Agent-to-Agent (A2A) Handoff & Trust-Boundary Crossing

- **Parent Volume:** VOL-14 · **Canonical Status:** planned · **Generation Order:** 4
- **Maps to:** AGI-DOC-0015 inheriting book #1 "AI Runtime Specification" — A2A handoff portion deferred from §16/§24. **BLOCKED (in part) on ARCH-D6** (no unified Experience primitive): the handoff target's Experience binding cannot be finalized until the unified Experience primitive reconciling ChatIntentKind/FocusMode/AgentMode/research flows is decided by the owner. Chapters depending on that binding are marked Target/Needs-Update until ARCH-D6 resolves.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify how one agent hands work to another as an explicit, consented draft that may cross a trust boundary, referencing (not redefining) the HandoffDraft concept owned by AGI-DOC-0015 §16/§24. Dependencies — BK-14.3 (consent gate), VOL-15 (handed-off toolset), VOL-16 (target route). Prerequisites — AGI-DOC-0015 §16 "Agent Boundary & Trust Mode Crossing (HandoffDraft)", §24. Cross-References — AGI-TRUST-0001/0002 (Local→BYOK explicit fork), canonical-glossary "Local→BYOK fork". Expected Inputs — a HandoffDraft with context selection + secret scan + payload preview. Expected Outputs — a consented, provider-labeled continuation in the target agent/boundary. Review Requirements — mandatory trust-boundary security review + recorded ADR (any AGI-TRUST-\* touch).
- **Chapters:**
  - **CH-14.4.01 — HandoffDraft Lifecycle (reference §16, no redefine)** — depends-on: AGI-DOC-0015 §16 · references: AGI-DOC-0015 §16 "HandoffDraft", §24, canonical-glossary "Local→BYOK fork" · related features: AGI Agent, Local→BYOK fork · est pages: 14 · difficulty: high · review checklist: HandoffDraft referenced from §16 not redefined; context selection + secret scan + preview + consent present
  - **CH-14.4.02 — Trust-Boundary Crossing Rules for Handoff (Local/BYOK/Managed)** — depends-on: CH-14.4.01, BK-14.3 · references: AGI-TRUST-0001..0004, AGI-DOC-0015 §24, trust-mode-surface-matrix.md · related features: AGI Agent · est pages: 16 · difficulty: extreme · review checklist: Local never silent-crosses; explicit consented fork only; provider label visible; mandatory security review + ADR
  - **CH-14.4.03 — Handoff Payload Redaction & Secret Scan Contract** — depends-on: CH-14.4.01 · references: AGI-DOC-0015 §23, §24, Security book (redaction) · related features: AGI Agent, Local→BYOK fork · est pages: 14 · difficulty: high · review checklist: redaction references Security book + privacy predicate (single impl), no per-call re-derivation
  - **CH-14.4.04 — Handoff Target Experience Binding (BLOCKED on ARCH-D6)** — depends-on: CH-14.4.01, Surface/Experience/Capability book · references: AGI-DOC-0015 §10–§12, ARCH-D6 (owner-decision-register §9) · related features: AGI Agent, AGI Chat/Code/Research · est pages: 14 · difficulty: extreme · review checklist: marked Target until ARCH-D6 resolves unified Experience primitive; no invented Experience names

#### BK-14.5 — Multi-Agent Council & Arbitration

- **Parent Volume:** VOL-14 · **Canonical Status:** planned · **Generation Order:** 5
- **Maps to:** AGI-DOC-0015 inheriting book #1 "AI Runtime Specification" — multi-agent convening portion deferred from §16/§17. **BLOCKED (in part) on ARCH-D6**: council member roles bind to Experiences/Agent modes, which await the unified Experience primitive; council chapters that assume a stable AgentMode are Target until ARCH-D6.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — define convening multiple agents into a council, the arbitration/aggregation contract for their outputs, and per-member trust-boundary isolation. Dependencies — BK-14.1 (each member runs the loop), BK-14.4 (inter-member handoff), VOL-16 (per-member routes). Prerequisites — AGI-DOC-0015 §16, §17. Cross-References — BK-14.3 (per-member autonomy), VOL-16 BK-16.1. Expected Inputs — a council spec with member roles + routes. Expected Outputs — an arbitrated result with per-member attribution. Review Requirements — architecture review; trust review if any member crosses a boundary.
- **Chapters:**
  - **CH-14.5.01 — Council Convening & Member Role Model (Target until ARCH-D6)** — depends-on: BK-14.1, ARCH-D6 · references: AGI-DOC-0015 §16, §17, ARCH-D6 · related features: AGI Agent, AGI Research · est pages: 14 · difficulty: extreme · review checklist: member roles reference Experience primitive pending ARCH-D6; no invented modes
  - **CH-14.5.02 — Per-Member Trust-Boundary Isolation** — depends-on: CH-14.5.01, BK-14.4 · references: AGI-TRUST-0001..0004, AGI-DOC-0015 §24 · related features: AGI Agent · est pages: 12 · difficulty: extreme · review checklist: members cannot leak across boundaries; isolation references handoff rules not redefines
  - **CH-14.5.03 — Arbitration & Output Aggregation Contract** — depends-on: CH-14.5.01 · references: AGI-DOC-0015 §16, §17 · related features: AGI Agent, AGI Research · est pages: 14 · difficulty: high · review checklist: arbitration deterministic, per-member attribution preserved, capability honesty
  - **CH-14.5.04 — Council Observability & Per-Member Cost Attribution** — depends-on: CH-14.5.01, Observability book · references: AGI-DOC-0015 §17, Observability book, Streaming book (credit reserve) · related features: AGI Agent · est pages: 12 · difficulty: high · review checklist: cost attribution references Observability/Streaming books, durable, no facade telemetry

---

## VOL-15 — Tool Runtime

- **Volume ID:** VOL-15 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** This volume specifies the tool/MCP/extension integration runtime: the ToolDef/ToolChoice contracts that define what a tool is and how the model selects one, the provider-protocol cross-vendor schema policy that keeps tool schemas valid across providers, MCP transports with signed-manifest and consent gating, plugin/skill manifest interop, and the autonomous-control execution safety contract (including the untrusted-output rule). It maps the Architecture Constitution's Tool, MCP & Extension Integration Specification inheriting book and owns the contracts the agent loop (VOL-14) merely references at its boundary.
- **Scope:** IN — ToolDef/ToolChoice contracts, provider-protocol cross-vendor schema normalization policy, MCP transports (stdio/HTTP/SSE) and signed-manifest verification + consent gating, plugin/skill manifest interop and capability declaration, tool execution safety, untrusted tool-output handling (AC-15), computer/browser-use safety contract. OUT — agent-loop step semantics + tool-call protocol envelope (VOL-14 owns the loop-boundary side); ProviderAdapter/StreamChunk transport (VOL-16); inference credential flow (VOL-16); session persistence (Session & Synchronization book); cloud control-plane entitlement (Cloud Services book).
- **Owner:** Tool & Integration Runtime lead
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015)
- **Dependencies:** VOL-16 (Provider Runtime — schema normalization rides the same provider-protocol boundary) · **Prerequisites:** AGI-DOC-0015 §15 (AI Runtime), §17 (AI Substrate), §28 (API Design), §45–§54 (Extensibility); `packages/tools/mcp`, `packages/ai/provider-protocol`, `packages/tools/browser-tool`
- **Review Process:** Architecture review (contract stability + boundary conformance), security review (mandatory for MCP signed-manifest, consent gating, untrusted-output AC-15, autonomous control), documentation-compiler validation.
- **Audience:** Tool/MCP authors, extension and plugin/skill developers, surface engineers wiring toolsets, security reviewers.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 3 / ~280 pages across 5 books
- **Inherits / References (no duplication):** Inherits AGI-DOC-0002, AGI-DOC-0005, AGI-DOC-0007, AGI-DOC-0008. References — AGI-DOC-0015 §13 "Provider Abstraction" (via VOL-16), §28 "API Design Principles", §45–§54 "Extensibility", §12 "Capability Honesty"; VOL-14 BK-14.2 (loop-boundary tool-call protocol), VOL-16 BK-16.2 (provider-protocol on the provider side). AC-15 (untrusted-output) referenced as the governing safety rule, not redefined.

### Books

#### BK-15.1 — ToolDef & ToolChoice Contracts

- **Parent Volume:** VOL-15 · **Canonical Status:** planned · **Generation Order:** 1
- **Maps to:** AGI-DOC-0015 inheriting book #13 "Tool, MCP & Extension Integration Specification" — ToolDef/ToolChoice contract portion deferred from §15/§17.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — define the canonical ToolDef (name, description, parameter schema) and ToolChoice (auto/none/required/named) contracts that surfaces and the agent loop consume. Dependencies — VOL-16 (schema must survive provider normalization). Prerequisites — AGI-DOC-0015 §15, §17. Cross-References — VOL-14 BK-14.2 (loop emits ToolChoice), BK-15.2 (normalization). Expected Inputs — a tool author's parameter schema. Expected Outputs — a validated ToolDef consumable across surfaces. Review Requirements — architecture review for contract stability; compiler validation.
- **Chapters:**
  - **CH-15.1.01 — ToolDef Shape & Parameter Schema Contract** — depends-on: AGI-DOC-0015 §15 · references: `packages/ai/provider-runtime`, AGI-DOC-0015 §15, §17 · related features: Connectors/MCP, Skills, Plugins · est pages: 16 · difficulty: high · review checklist: ToolDef canonical, schema validated, no provider transport in shape
  - **CH-15.1.02 — ToolChoice Semantics (auto / none / required / named)** — depends-on: CH-15.1.01 · references: AGI-DOC-0015 §15, VOL-14 BK-14.2 · related features: AGI Agent, AGI Code · est pages: 12 · difficulty: med · review checklist: ToolChoice owned here; VOL-14 references it (seam guard)
  - **CH-15.1.03 — Tool Registry & Per-Surface Toolset Derivation** — depends-on: CH-15.1.01 · references: AGI-DOC-0015 §10, §12, trust-mode-surface-matrix.md · related features: Connectors/MCP, Skills · est pages: 14 · difficulty: high · review checklist: toolset derived from real capability (capability honesty), per-surface availability not faked
  - **CH-15.1.04 — Tool Versioning & Backward-Compat Contract** — depends-on: CH-15.1.01 · references: AGI-DOC-0015 §49, §50 · related features: Connectors/MCP, Plugins · est pages: 12 · difficulty: med · review checklist: versioning references §49/§50, no breaking change without ADR

#### BK-15.2 — provider-protocol Cross-Vendor Schema Policy

- **Parent Volume:** VOL-15 · **Canonical Status:** planned · **Generation Order:** 2
- **Maps to:** AGI-DOC-0015 inheriting book #13 "Tool, MCP & Extension Integration Specification" — provider-protocol cross-vendor schema-policy portion. Shares the provider-protocol boundary with VOL-16 BK-16.2 (provider-side normalization); this book owns the _tool-schema_ policy, VOL-16 owns the _stream/response_ normalization.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — define how a single ToolDef schema is normalized into each provider's accepted tool-schema dialect without the tool author writing per-vendor variants. Dependencies — BK-15.1 (input ToolDef), VOL-16 (provider dialects). Prerequisites — AGI-DOC-0015 §13, §14, §17; `packages/ai/provider-protocol`. Cross-References — VOL-16 BK-16.2, BK-15.1. Expected Inputs — a canonical ToolDef schema. Expected Outputs — provider-specific tool schemas with lossy-conversion warnings. Review Requirements — architecture review for correspondence; compiler validation.
- **Chapters:**
  - **CH-15.2.01 — Canonical Tool Schema → Provider Dialect Mapping** — depends-on: BK-15.1 · references: `packages/ai/provider-protocol`, AGI-DOC-0015 §13, §14 · related features: Connectors/MCP · est pages: 16 · difficulty: high · review checklist: mapping references VOL-16 dialects not redefines provider transport (seam guard)
  - **CH-15.2.02 — Lossy-Conversion Detection & Capability-Honest Degradation** — depends-on: CH-15.2.01 · references: AGI-DOC-0015 §12, §50 · related features: Connectors/MCP · est pages: 12 · difficulty: high · review checklist: lossy conversion surfaced honestly (capability honesty), never silently downgraded
  - **CH-15.2.03 — Schema Validation & Rejection Policy** — depends-on: CH-15.2.01 · references: AGI-DOC-0015 §28 (API error envelope) · related features: Connectors/MCP, Plugins · est pages: 12 · difficulty: med · review checklist: invalid schema fails closed, error envelope references API book
  - **CH-15.2.04 — Normalization Correspondence with Provider Runtime** — depends-on: CH-15.2.01, VOL-16 BK-16.2 · references: VOL-16 BK-16.2, AGI-DOC-0015 §14 · related features: Connectors/MCP · est pages: 10 · difficulty: med · review checklist: tool-schema vs stream normalization seam kept disjoint with VOL-16

#### BK-15.3 — MCP Transports

- **Parent Volume:** VOL-15 · **Canonical Status:** planned · **Generation Order:** 3
- **Maps to:** AGI-DOC-0015 inheriting book #13 "Tool, MCP & Extension Integration Specification" — MCP transport portion deferred from §45–§54.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify supported MCP transports (stdio, HTTP, SSE), connection lifecycle, and resource/tool discovery. Dependencies — BK-15.1 (discovered tools become ToolDefs), BK-15.4 (manifest gating). Prerequisites — AGI-DOC-0015 §45–§54; `packages/tools/mcp`. Cross-References — BK-15.4 (signed-manifest/consent), BK-15.5 (execution safety). Expected Inputs — an MCP server endpoint/command. Expected Outputs — a discovered, gated toolset. Review Requirements — security review for transport hardening (SSRF for HTTP/SSE), architecture review.
- **Chapters:**
  - **CH-15.3.01 — MCP Transport Matrix (stdio / HTTP / SSE) & Lifecycle** — depends-on: AGI-DOC-0015 §45 · references: `packages/tools/mcp`, AGI-DOC-0015 §45–§54 · related features: Connectors/MCP · est pages: 16 · difficulty: high · review checklist: transports enumerated, lifecycle deterministic, HTTP/SSE flag SSRF review (Security book)
  - **CH-15.3.02 — Resource & Tool Discovery → ToolDef Adaptation** — depends-on: CH-15.3.01, BK-15.1 · references: `packages/tools/mcp`, AGI-DOC-0015 §17 · related features: Connectors/MCP · est pages: 14 · difficulty: high · review checklist: discovered tools become BK-15.1 ToolDefs, no parallel tool model
  - **CH-15.3.03 — Connection Failure, Retry & Isolation** — depends-on: CH-15.3.01 · references: AGI-DOC-0015 §45, Background Execution book (backoff) · related features: Connectors/MCP · est pages: 12 · difficulty: med · review checklist: backoff references Background Execution book, a failing server cannot stall the loop
  - **CH-15.3.04 — Transport Hardening & SSRF Boundary (reference Security book)** — depends-on: CH-15.3.01 · references: AGI-DOC-0015 §23, Security book (SSRF hardening) · related features: Connectors/MCP · est pages: 12 · difficulty: high · review checklist: SSRF rules referenced from Security book not redefined; fail-closed default

#### BK-15.4 — Signed-Manifest & Consent Gating

- **Parent Volume:** VOL-15 · **Canonical Status:** planned · **Generation Order:** 4
- **Maps to:** AGI-DOC-0015 inheriting book #13 "Tool, MCP & Extension Integration Specification" — signed-manifest/consent-gating + plugin/skill manifest interop portion deferred from §45–§54.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — define manifest signing/verification for MCP servers and plugins/skills, the capability declaration each manifest carries, and the consent gate a user must pass before a tool source is enabled. Dependencies — BK-15.3 (transport). Prerequisites — AGI-DOC-0015 §45–§54, §24 (consent). Cross-References — VOL-14 BK-14.3 (autonomy/consent state machine, enforcer), canonical-glossary "skill/plugin", "connector". Expected Inputs — a tool-source manifest + signature. Expected Outputs — a verified, capability-declared, consented tool source. Review Requirements — mandatory security review (signature trust + consent), architecture review.
- **Chapters:**
  - **CH-15.4.01 — Manifest Schema & Capability Declaration** — depends-on: AGI-DOC-0015 §45 · references: AGI-DOC-0015 §45–§54, canonical-glossary "skill/plugin", "connector" · related features: Skills, Plugins, Connectors/MCP · est pages: 14 · difficulty: high · review checklist: capability declaration honest (capability honesty), no over-broad grant by default
  - **CH-15.4.02 — Signed-Manifest Verification & Trust Roots** — depends-on: CH-15.4.01 · references: AGI-DOC-0015 §23, §45, Security book · related features: Connectors/MCP, Plugins · est pages: 16 · difficulty: high · review checklist: signature verification fail-closed, trust roots explicit, references Security book
  - **CH-15.4.03 — Consent Gate Before Enablement (reference VOL-14 BK-14.3)** — depends-on: CH-15.4.01 · references: VOL-14 BK-14.3, AGI-DOC-0015 §24 · related features: Connectors/MCP, Skills, Plugins · est pages: 12 · difficulty: high · review checklist: consent state machine referenced from VOL-14 not redefined (seam guard); no silent enablement
  - **CH-15.4.04 — Plugin/Skill Manifest Interop & Version Pinning** — depends-on: CH-15.4.01 · references: AGI-DOC-0015 §49, §50, `.agents/skills` · related features: Skills, Plugins · est pages: 12 · difficulty: med · review checklist: interop references versioning §49/§50, pinned sources, naming-lock honored

#### BK-15.5 — Tool Execution Safety & Untrusted-Output Rule (AC-15)

- **Parent Volume:** VOL-15 · **Canonical Status:** planned · **Generation Order:** 5
- **Maps to:** AGI-DOC-0015 inheriting book #13 "Tool, MCP & Extension Integration Specification" — autonomous-control safety contract + untrusted-output handling portion. Enforces AC-15 (untrusted tool output) as the governing rule, referenced here.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify how tool outputs (always untrusted) are validated, sandboxed, and prevented from steering the agent unsafely, plus the autonomous-control (computer/browser use) safety contract. Dependencies — BK-15.1 (tool boundary). Prerequisites — AGI-DOC-0015 §15, §24; AC-15. Cross-References — VOL-14 BK-14.2 (loop ingestion), BK-14.3 (approval), Security book (sandbox/redaction). Expected Inputs — a raw tool result. Expected Outputs — a validated, safety-bounded result for loop ingestion. Review Requirements — mandatory security review (AC-15 conformance, autonomous-control), architecture review.
- **Chapters:**
  - **CH-15.5.01 — Untrusted Tool-Output Handling (AC-15)** — depends-on: AGI-DOC-0015 §15 · references: AC-15, AGI-DOC-0015 §15, §24 · related features: Connectors/MCP, Computer/Browser Use · est pages: 16 · difficulty: high · review checklist: all tool output treated untrusted per AC-15; no prompt-injection passthrough; cites AC-15
  - **CH-15.5.02 — Tool Input Validation & Argument Sanitization** — depends-on: BK-15.1, CH-15.5.01 · references: AGI-DOC-0015 §28, llm-failure-taxonomy · related features: Connectors/MCP · est pages: 12 · difficulty: high · review checklist: tool/LLM/IPC inputs validated (no unvalidated input per LLM-failure rules)
  - **CH-15.5.03 — Sandboxing & Resource Limits for Tool Execution** — depends-on: CH-15.5.01 · references: AGI-DOC-0015 §23, Sandbox surface, Security book · related features: Connectors/MCP, Sandbox · est pages: 14 · difficulty: high · review checklist: sandbox references Security book + Sandbox surface, fail-closed limits
  - **CH-15.5.04 — Autonomous-Control (Computer/Browser Use) Safety Contract** — depends-on: CH-15.5.01 · references: VOL-14 BK-14.3, AGI-DOC-0015 §24, `apps/extension/src/features/side-panel/computerUsePanel.ts`, `apps/extension/THREAT_MODEL.md` · related features: Computer/Browser Use · est pages: 16 · difficulty: high · review checklist: default-ask (not allow-all), per-action consent references VOL-14 BK-14.3; threat-model cited
  - **CH-15.5.05 — Tool-Output Redaction & Privacy-Boundary Conformance** — depends-on: CH-15.5.01 · references: AGI-DOC-0015 §23, §24, Security book (privacy predicate) · related features: Connectors/MCP · est pages: 12 · difficulty: med · review checklist: redaction uses single privacy predicate (no per-call re-derivation), references Security book

---

## VOL-16 — Provider Runtime

- **Volume ID:** VOL-16 · **Generation Priority:** P1 · **Difficulty:** extreme
- **Purpose:** This volume specifies the provider/inference runtime: the canonical ProviderAdapter contract through which all inference and catalog traffic must flow, the StreamChunk normalization shape, credential resolution flow per trust boundary, retry/fallback/watchdog resilience, the cross-runtime convergence record (TS / CLI-Rust / desktop-Rust), and the provider-identity SSOT correspondence (Provider union ↔ models.json ↔ desktop Rust enum) enforced by the mirror CI guard. It maps the ProviderAdapter/transport portion of the Architecture Constitution's AI Runtime Specification inheriting book — disjoint from VOL-14, which owns the agent-loop portion of the same book.
- **Scope:** IN — ProviderAdapter contract, StreamChunk wire shape, credential flow per Local/BYOK/Managed boundary, retry/fallback/watchdog resilience, provider catalog fetch, cross-runtime convergence record, provider-identity SSOT correspondence + mirror CI guard (AC-10). OUT — agent-loop step semantics, tool-call protocol, autonomy (VOL-14); ToolDef/ToolChoice + tool-schema normalization (VOL-15); model catalog _content_ authoring (owned by models.json SSOT, referenced not redefined); cloud gateway dispatch/credit ledger (Cloud Services book); streaming SLO/credit-reserve mechanics (Streaming book).
- **Owner:** Provider/Inference Runtime lead
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015)
- **Dependencies:** none below it (most-foundational Mechanics-layer volume in this set) · **Prerequisites:** AGI-DOC-0015 §13 (Provider Abstraction), §14 (Model Abstraction), §49 (Versioning), §50 (Compatibility); `packages/contracts/types/src/provider.ts`, `packages/contracts/types/src/models.json`, `packages/contracts/types/src/provider-adapter.ts`
- **Review Process:** Architecture review (single-inference-boundary + SSOT correspondence conformance), security review (credential flow per trust boundary, no Local→BYOK silent egress), documentation-compiler validation, owner sign-off on ARCH-D1/D2/D3/D4/D5-dependent books.
- **Audience:** Provider/inference engineers, Rust runtime engineers (CLI/desktop), catalog maintainers, security reviewers.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** extreme / high / 4 / ~300 pages across 5 books
- **Inherits / References (no duplication):** Inherits AGI-DOC-0002, AGI-DOC-0005, AGI-DOC-0007, AGI-DOC-0008. References — AGI-DOC-0015 §13 "ProviderAdapter as Single Inference Boundary", §14 "Model Catalog & Provider Identity SSOT", §50 "Cross-Language Mirror & SSOT Correspondence"; AGI-DOC-0003 §5 (provider architecture current-state); models.json/provider.ts as SSOT (referenced, never redefined); VOL-14 BK-14.1/BK-14.4 (inference boundary consumer), VOL-15 BK-15.2 (tool-schema rides same normalization). AC-10 (mirror guard) referenced as the governing CI rule, not redefined.

### Books

#### BK-16.1 — ProviderAdapter Contract & StreamChunk Wire Shape

- **Parent Volume:** VOL-16 · **Canonical Status:** planned · **Generation Order:** 1
- **Maps to:** AGI-DOC-0015 inheriting book #1 "AI Runtime Specification" — ProviderAdapter/StreamChunk wire-shape portion deferred from §13 (disjoint from VOL-14, which owns agent-loop semantics of the same book).
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — define the single ProviderAdapter contract all inference/catalog traffic flows through and the normalized StreamChunk shape. Dependencies — none (foundational). Prerequisites — AGI-DOC-0015 §13; `packages/contracts/types/src/provider-adapter.ts`. Cross-References — VOL-14 BK-14.1 (loop consumes this), VOL-15 BK-15.2 (tool schema). Expected Inputs — a route object (provider + endpoint + model + capability). Expected Outputs — a normalized StreamChunk stream. Review Requirements — architecture review for single-boundary conformance (no ad-hoc HTTP-to-vendor); compiler validation.
- **Chapters:**
  - **CH-16.1.01 — ProviderAdapter Contract (single inference boundary, reference §13)** — depends-on: AGI-DOC-0015 §13 · references: `packages/contracts/types/src/provider-adapter.ts`, AGI-DOC-0015 §13 · related features: all Experiences (inference) · est pages: 16 · difficulty: high · review checklist: ProviderAdapter referenced from §13 as concept, contract detail owned here; no ad-hoc vendor HTTP
  - **CH-16.1.02 — StreamChunk Wire Shape & Normalization** — depends-on: CH-16.1.01 · references: `packages/ai/provider-protocol`, AGI-DOC-0015 §13, §14 · related features: AGI Chat, AGI Code · est pages: 16 · difficulty: high · review checklist: StreamChunk canonical; tool-call emission delimited so VOL-14 BK-14.2 can consume (seam)
  - **CH-16.1.03 — Route Object Resolution (provider + endpoint + model + capability)** — depends-on: CH-16.1.01 · references: canonical-glossary "route object", models.json, AGI-DOC-0015 §14 · related features: auto-routing · est pages: 14 · difficulty: high · review checklist: route object references SSOT models.json; capability metadata honest, never model-name-only
  - **CH-16.1.04 — Catalog Fetch Through the Adapter** — depends-on: CH-16.1.01 · references: AGI-DOC-0015 §13, §5 architecture-manifest · related features: model picker · est pages: 12 · difficulty: med · review checklist: catalog fetch flows through adapter, no bypass; advertised availability derives from real backend

  - **CH-16.1.05 — Per-provider multimodal codec negotiation & normalization map** — depends-on: CH-16.1.02 · references: VOL-10 BK-10.01 (canonical content-block shape), `packages/ai/providers`, `packages/ai/provider-protocol`, AGI-DOC-0015 §13, §14, models.json (vision/imageGen flags) · related features: vision/multimodal per provider · est pages: 14 · difficulty: high · review checklist: canonical content-block shape referenced from VOL-10 BK-10.01 not redefined; per-provider codec map grounded in packages/ai/providers; modality availability derives from catalog flags (verified vision/imageGen present); audio/video input framed Target pending §14 SSOT addition

#### BK-16.2 — Stream/Response Normalization Boundary

- **Parent Volume:** VOL-16 · **Canonical Status:** planned · **Generation Order:** 2
- **Maps to:** AGI-DOC-0015 inheriting book #1 "AI Runtime Specification" — provider-side normalization portion (§13/§14). Shares the provider-protocol boundary with VOL-15 BK-15.2 (tool-schema policy); this book owns stream/response normalization, VOL-15 owns tool-schema dialect mapping.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — define how each provider's native stream/response is normalized to the canonical StreamChunk, including the OpenAI-wire-compatible path for non-native providers. Dependencies — BK-16.1 (target shape). Prerequisites — AGI-DOC-0015 §13, §14; `packages/ai/provider-protocol`. Cross-References — VOL-15 BK-15.2, BK-16.1. Expected Inputs — a provider-native response/stream. Expected Outputs — canonical StreamChunk. Review Requirements — architecture review for correspondence; compiler validation.
- **Chapters:**
  - **CH-16.2.01 — Native Adapter Normalization (anthropic/openai/google/deepseek/xai/perplexity/ollama/lmstudio)** — depends-on: BK-16.1 · references: `packages/ai/providers`, models.json, architecture-manifest §5 · related features: inference · est pages: 16 · difficulty: high · review checklist: 8 native adapters enumerated from source; counts cite models.json not invented
  - **CH-16.2.02 — OpenAI-Wire-Compatible Path & provider-protocol** — depends-on: CH-16.2.01 · references: `packages/ai/provider-protocol`, AGI-DOC-0015 §13 · related features: inference · est pages: 14 · difficulty: high · review checklist: non-native providers via wire-compat path; tool-schema seam delegated to VOL-15 BK-15.2
  - **CH-16.2.03 — Error & Refusal Normalization** — depends-on: CH-16.2.01 · references: AGI-DOC-0015 §28 (error envelope), API book · related features: inference · est pages: 12 · difficulty: med · review checklist: error mapping references API book safe-to-expose allowlist, no provider-internal leakage
  - **CH-16.2.04 — Normalization Correspondence with Tool Runtime** — depends-on: CH-16.2.01 · references: VOL-15 BK-15.2, AGI-DOC-0015 §14 · related features: Connectors/MCP · est pages: 10 · difficulty: med · review checklist: stream-vs-tool-schema seam kept disjoint with VOL-15 (seam guard)

#### BK-16.3 — Credential Flow & Resilience (Retry / Fallback / Watchdog)

- **Parent Volume:** VOL-16 · **Canonical Status:** planned · **Generation Order:** 3
- **Maps to:** AGI-DOC-0015 inheriting book #1 "AI Runtime Specification" — credential-flow + retry/fallback/watchdog portion deferred from §13/§24.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify credential resolution per trust boundary (Local none, BYOK user-owned, Managed gateway-held) and resilience behavior, with no Local→BYOK silent egress. Dependencies — BK-16.1. Prerequisites — AGI-DOC-0015 §13, §24, §42 (Local Mode). Cross-References — AGI-TRUST-0001..0004, egress-guard (§24). Expected Inputs — a route + active trust boundary. Expected Outputs — a resolved, boundary-correct credential + resilient call. Review Requirements — mandatory security review (credential isolation, fail-closed egress), architecture review.
- **Chapters:**
  - **CH-16.3.01 — Credential Resolution Per Trust Boundary (Local / BYOK / Managed)** — depends-on: BK-16.1 · references: AGI-TRUST-0001..0004, AGI-DOC-0015 §13, §24, §42 · related features: BYOK, Managed Cloud · est pages: 16 · difficulty: extreme · review checklist: Local resolves no remote credential; BYOK user-owned; Managed gateway-held; no silent cross-boundary egress
  - **CH-16.3.02 — Egress-Guard Conformance at the Adapter (reference Security book)** — depends-on: CH-16.3.01 · references: `apps/desktop/src/lib/egressGuard.ts`, AGI-DOC-0015 §24, §42, Security book · related features: Local Mode, egress guard · est pages: 14 · difficulty: extreme · review checklist: egress chokepoint referenced from §24/Security book; fail-closed; honest about CLI/Tauri-Rust gap
  - **CH-16.3.03 — Retry, Backoff & Idempotency** — depends-on: BK-16.1 · references: AGI-DOC-0015 §13, Background Execution book (backoff/idempotency) · related features: inference resilience · est pages: 12 · difficulty: high · review checklist: backoff/idempotency-key references Background Execution book; no duplicate side effects
  - **CH-16.3.04 — Fallback Routing & Capability-Honest Degradation** — depends-on: CH-16.3.03, BK-16.1 · references: AGI-DOC-0015 §12, §13 · related features: auto-routing · est pages: 12 · difficulty: high · review checklist: fallback never advertises capability the fallback route lacks (capability honesty)
  - **CH-16.3.05 — Watchdog, Timeouts & Stream Liveness** — depends-on: CH-16.3.03 · references: AGI-DOC-0015 §13, Streaming book (TTFT SLO) · related features: inference resilience · est pages: 12 · difficulty: high · review checklist: watchdog references Streaming book SLO mechanics not redefines; stalled stream fails closed

#### BK-16.4 — Cross-Runtime Convergence Record (TS / CLI-Rust / Desktop-Rust)

- **Parent Volume:** VOL-16 · **Canonical Status:** planned · **Generation Order:** 4
- **Maps to:** AGI-DOC-0015 inheriting book #1 "AI Runtime Specification" — TS/CLI-Rust/desktop-Rust runtime convergence record deferred from §13. **BLOCKED on ARCH-D4** (three divergent AI provider runtimes) and **ARCH-D5** (cloud advertises 11 providers / gateway serves 4 — runtime convergence + cloud asymmetry). Until ARCH-D4/D5 are decided by the owner, this book documents Current divergence honestly and marks the converged target as Target.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — record the three current provider-runtime implementations (TS api-gateway, CLI Rust, desktop Rust), their divergent Provider shapes, and the convergence target or per-divergence justified ADR. Dependencies — BK-16.1, BK-16.2. Prerequisites — AGI-DOC-0015 §13, §50; ARCH-D4, ARCH-D5. Cross-References — architecture-manifest §5, §11 (structural risks), VOL-14 BK-14.1.05 (loop convergence). Expected Inputs — the three runtime implementations. Expected Outputs — a convergence record + ADR pointers. Review Requirements — architecture review; owner decision on ARCH-D4/D5 before Current→Target.
- **Chapters:**
  - **CH-16.4.01 — Three Current Provider Runtimes (TS gateway / CLI-Rust / desktop-Rust)** — depends-on: AGI-DOC-0015 §13 · references: `services/api-gateway`, `apps/cli`, `apps/desktop/src-tauri`, architecture-manifest §5 · related features: inference per surface · est pages: 16 · difficulty: extreme · review checklist: Current divergence cited from source (TS serves 4 provider IDs); honest, not aspirational
  - **CH-16.4.02 — Divergent Provider Enum Shapes & Drift (BLOCKED on ARCH-D4)** — depends-on: CH-16.4.01, ARCH-D4 · references: `packages/contracts/types/src/provider.ts`, desktop Rust enum, ARCH-D4 (owner-decision-register §9) · related features: provider identity · est pages: 14 · difficulty: extreme · review checklist: drift documented as Current; convergence is Target pending ARCH-D4; no invented convergence
  - **CH-16.4.03 — Cloud Provider-Count Asymmetry (BLOCKED on ARCH-D5)** — depends-on: CH-16.4.01, ARCH-D5 · references: ARCH-D5 (cloud advertises 11 / gateway serves 4), architecture-manifest §5, §11 · related features: Managed Cloud, model picker · est pages: 14 · difficulty: extreme · review checklist: asymmetry documented honestly (capability honesty); advertised list must derive from real gateway capability; Target pending ARCH-D5
  - **CH-16.4.04 — Convergence Target or Per-Divergence Justified ADR** — depends-on: CH-16.4.02, CH-16.4.03 · references: AGI-DOC-0015 §59 (ADR), §50 · related features: provider runtime · est pages: 12 · difficulty: high · review checklist: either one adapter or a recorded ADR per divergence; no convergence claimed without owner decision

#### BK-16.5 — Provider-Identity SSOT Correspondence & Mirror CI Guard (AC-10)

- **Parent Volume:** VOL-16 · **Canonical Status:** planned · **Generation Order:** 5
- **Maps to:** AGI-DOC-0015 inheriting book #1 "AI Runtime Specification" — provider-identity SSOT correspondence portion deferred from §14/§50. **BLOCKED on ARCH-D1** (provider-identity SSOT drift across three mirrors), **ARCH-D2** (adapter package ↔ catalog correspondence), and **ARCH-D3** (misdirected mirror pointer / stale cross-language update instructions). The CI guard's enforcement target is unset until ARCH-D1/D2/D3 are decided; this book documents the current drift and the guard's required behavior as Target. Enforces AC-10 (mirror guard) as the governing rule, referenced here.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the required provable correspondence between the three provider mirrors (Provider union ↔ models.json keys ↔ desktop Rust enum) and the CI guard that fails the build on drift, referencing (not redefining) the model-catalog/provider-identity SSOT owned by §14/models.json/provider.ts. Dependencies — BK-16.4 (the diverging runtimes), BK-16.1. Prerequisites — AGI-DOC-0015 §14, §50; ARCH-D1, ARCH-D2, ARCH-D3. Cross-References — architecture-manifest §5, canonical-glossary "model catalog (SSOT)", "provider adapter". Expected Inputs — the three mirror sources. Expected Outputs — a correspondence spec + CI-guard contract. Review Requirements — architecture review; owner decision on ARCH-D1/D2/D3; AC-10 conformance.
- **Chapters:**
  - **CH-16.5.01 — Three Provider Mirrors & SSOT Ownership (reference §14, models.json)** — depends-on: AGI-DOC-0015 §14 · references: `packages/contracts/types/src/provider.ts`, `packages/contracts/types/src/models.json`, desktop Rust enum, AGI-DOC-0015 §14 · related features: provider identity, model catalog · est pages: 14 · difficulty: high · review checklist: catalog/identity referenced from SSOT §14/models.json not redefined; counts cited from source
  - **CH-16.5.02 — Current Drift Inventory (BLOCKED on ARCH-D1)** — depends-on: CH-16.5.01, ARCH-D1 · references: ARCH-D1 (owner-decision-register §9), architecture-manifest §5 · related features: provider identity · est pages: 12 · difficulty: high · review checklist: drift cited from source (union 28 / models.json 25 keys / Rust 25 variants; lmstudio/ollama_cloud/minimax orphans); Target pending ARCH-D1
  - **CH-16.5.03 — Adapter Package ↔ Catalog Correspondence (BLOCKED on ARCH-D2)** — depends-on: CH-16.5.01, ARCH-D2 · references: ARCH-D2, `packages/ai/providers`, models.json · related features: provider adapter · est pages: 12 · difficulty: high · review checklist: correspondence between adapter package and catalog documented as Target pending ARCH-D2; no invented mapping
  - **CH-16.5.04 — Mirror Pointer Correctness & Stale-Instruction Defect (BLOCKED on ARCH-D3)** — depends-on: CH-16.5.01, ARCH-D3 · references: ARCH-D3, AGI-DOC-0015 §50 (mirror pointers must name paths that exist) · related features: provider identity, maintainer DX · est pages: 12 · difficulty: high · review checklist: maintainer pointers must name existing paths; stale cross-language instructions flagged as defects; Target pending ARCH-D3
  - **CH-16.5.05 — Mirror CI Guard Contract (AC-10)** — depends-on: CH-16.5.02, CH-16.5.03, CH-16.5.04 · references: AC-10, AGI-DOC-0015 §14, §50, `scripts/check-generated-artifacts.mjs` · related features: provider identity CI · est pages: 14 · difficulty: high · review checklist: guard fails build when entry exists in one mirror but not others (AC-10); enforcement target set only after ARCH-D1/D2/D3

#### BK-16.6 — Embeddings Request Runtime & Vector-Store Provider Contract

- **Parent Volume:** VOL-16 · **Canonical Status:** planned · **Generation Order:** 6
- **Maps to:** AGI-DOC-0015 inheriting book **AI Runtime Specification** — embedding-generation provider-call portion (§13). Closes the provider-call half of gap #9. Disjoint seam (four-way): this book owns ONLY the embedding-GENERATION provider request/response through the ProviderAdapter; retrieval and RAG context packing are owned by VOL-11 BK-11.04 (referenced); the memory scoring/promotion boundary is owned by VOL-12 and is NOT touched here (referenced); vector/blob persistence is owned by the Database Specification / VOL-19 (referenced, not re-owned inside an AI-runtime volume). Catalog has no embedding capability flag (verified 0 embedding models) — this book is framed Target; closure requires a §14/models.json SSOT addition (referenced not redefined).
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the embedding-generation request/response flowing through the single ProviderAdapter inference boundary, and the vector-store provider contract the runtime calls (without owning the persistence layer). Dependencies — BK-16.1 (adapter), BK-16.3 (credential/resilience). Prerequisites — AGI-DOC-0015 §13, §14; a §14/models.json SSOT entry for embedding models (Target). Cross-References — VOL-11 BK-11.04 (consumer), VOL-12 (memory boundary, not touched), VOL-19/Database Specification (vector persistence). Expected Inputs — text input + embedding route (Target). Expected Outputs — embedding vector + vector-store call contract. Review Requirements — architecture review (single inference boundary; no ad-hoc embedding HTTP); capability-honesty (no embedding capability advertised without a catalog route).
  - **Chapters:**
  - **CH-16.6.01 — Embedding-generation request/response through the adapter (Target)** — depends-on: BK-16.1 · references: AGI-DOC-0015 §13, §14, models.json (no embedding flag — Target) · related features: embeddings · est pages: 14 · difficulty: high · review checklist: embedding call flows through ProviderAdapter, no bypass; framed Target pending §14 SSOT addition (referenced not redefined); no invented embedding model id
  - **CH-16.6.02 — Embedding capability honesty & catalog SSOT gap** — depends-on: CH-16.6.01 · references: §12, §14, models.json, AGI-AI-0001 · related features: capability honesty · est pages: 10 · difficulty: high · review checklist: zero embedding models in catalog documented honestly; embeddings unselectable until a real route exists; SSOT addition is a §14 decision referenced here
  - **CH-16.6.03 — Vector-store provider contract (persistence deferred to Database/VOL-19)** — depends-on: CH-16.6.01 · references: VOL-19 Storage Runtime / Database Specification, §22 · related features: vector store · est pages: 12 · difficulty: high · review checklist: runtime call contract owned here; vector/blob persistence schema deferred to VOL-19/Database Spec (seam guard); no storage schema invented in this volume
  - **CH-16.6.04 — Retrieval/packing handoff to VOL-11 (memory boundary referenced)** — depends-on: CH-16.6.01 · references: VOL-11 BK-11.04 (RAG packing), VOL-12 (memory boundary, not touched), AGI-TRUST-0001 · related features: RAG · est pages: 10 · difficulty: high · review checklist: retrieval/packing owned by VOL-11 BK-11.04; memory scoring owned by VOL-12 and not touched (four-way seam guard); embeddings never silently cross a trust boundary

#### BK-16.7 — Model Fine-Tuning & Customization Runtime

- **Parent Volume:** VOL-16 · **Canonical Status:** planned · **Generation Order:** 7
- **Maps to:** AGI-DOC-0015 inheriting book **AI Runtime Specification** — model-customization portion (§13/§14). Closes gap #50. Disjoint seam: this book owns the FineTune/CustomModelAdapter request lifecycle through the provider boundary; training-data persistence and provenance are owned by VOL-19 Storage Runtime / Database Specification (referenced, not re-owned); the model catalog identity for a custom model is a §14 SSOT concern (referenced). Catalog has no fine-tuning capability flag (verified) — framed Target; some OpenAI models carry prose 'fine-tuning supported' notes only.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify the fine-tuning/customization request lifecycle through the ProviderAdapter and how a resulting custom model becomes a catalog route, without owning training-data storage. Dependencies — BK-16.1 (adapter), BK-16.3 (credential per trust boundary). Prerequisites — AGI-DOC-0015 §13, §14; ProviderAdapter Canonical (BK-16.1). Cross-References — VOL-19/Database Specification (training-data persistence), §14 (custom-model catalog identity), AGI-TRUST-0001..0004. Expected Inputs — training-data reference + base-model route (Target). Expected Outputs — fine-tune job lifecycle + custom-model route contract. Review Requirements — architecture review; mandatory security review (training data crosses a trust boundary — Local data never silently uploaded for cloud fine-tune); capability-honesty.
  - **Chapters:**
  - **CH-16.7.01 — FineTune request lifecycle through the adapter (Target)** — depends-on: BK-16.1 · references: AGI-DOC-0015 §13, §14, models.json (no fine-tune flag — Target; OpenAI prose notes only) · related features: fine-tuning · est pages: 14 · difficulty: high · review checklist: fine-tune job flows through ProviderAdapter; framed Target; prose-only OpenAI notes documented honestly, not as catalog capability
  - **CH-16.7.02 — Custom-model catalog identity & capability honesty (§14)** — depends-on: CH-16.7.01 · references: §12, §14, models.json, AGI-AI-0001 · related features: custom model routing · est pages: 12 · difficulty: high · review checklist: custom-model route identity is a §14 SSOT decision referenced not redefined; custom model unselectable until a real route exists
  - **CH-16.7.03 — Training-data trust boundary & provenance (persistence deferred)** — depends-on: CH-16.7.01, BK-16.3 · references: AGI-TRUST-0001..0004, VOL-19 Storage Runtime / Database Specification, §24 · related features: BYOK/Managed fine-tune, training data · est pages: 14 · difficulty: extreme · review checklist: Local-origin training data never silently uploaded for cloud fine-tune; training-data persistence/provenance deferred to VOL-19/Database Spec (seam guard); fail-closed egress

## Part E — Platform / State / Trust Runtimes (VOL-17…23)

## VOL-17 — Execution Runtime (Streaming, Long-Running & Background)

- **Volume ID:** VOL-17 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Define WHAT documents will exist that own the platform's execution plane behavior — how a single inference request streams to first token and to completion, how multi-step tool loops and long-running tasks live, suspend, and resume, and how background work (cron, durable queues, offline replay) is scheduled and made reliable. This volume is the documentation home for the constitution's **Streaming & Long-Running Task Specification** and **Background Execution, Offline & Reliability Specification** (the two inheriting books deferred from §30–§34, §39, §41).
- **Scope:** IN — stream gateway and `StreamChunk` consumption flow, TTFT SLO mechanics, tool-loop step limits, long-running task lifecycle/cancellation/resumption, credit reserve/refund reconciliation at execution time, cron/scheduling contract, durable queue/event-bus boundary, offline-queue operation taxonomy with backoff/ordering, rate-limiting policy, idempotency-key discipline. OUT — the `ProviderAdapter`/`ChatRequest`/`StreamChunk` wire shapes and agent-loop step _semantics_ (owned by AI Runtime Spec, another cluster — referenced); the credit _ledger_ itself (owned by Cloud Services / Managed Control Plane Spec — referenced); session fork/replay state (owned by VOL-18); persistence schemas (owned by VOL-19).
- **Owner:** Principal Runtime Systems Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits documentation governance (AGI-DOC-0002), requirement system (AGI-DOC-0005), cross-reference system (AGI-DOC-0007), compiler (AGI-DOC-0008)
- **Dependencies:** VOL-19 (Storage Runtime), VOL-20 (Security Runtime) · **Prerequisites:** Architecture Constitution §30–§34/§39/§41 frozen; AI Runtime Spec section deferrals (§13/§54) identified; Storage Runtime store/ledger contracts exist as references
- **Review Process:** Architecture Review (§58) for the streaming/background boundary; Security Review (§57) mandatory because execution touches the egress chokepoint and BYOK no-cloud-transit invariant; ADR required for any change touching AGI-TRUST-\* (§59)
- **Audience:** runtime engineers, backend engineers, AI agents authoring runtime code
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 4 / ~230 pages across 4 books
- **Inherits / References (no duplication):** references §13/§54 AI runtime semantics (AI Runtime Spec), §43 credit ledger (Cloud Services Spec), AGI-DOC-0003 §4 execution-model current state, glossary terms `route object`, `StreamChunk`, `Managed Cloud`; AGI-AI-_ and AGI-OPS-_ requirement IDs; ARCH-D14/A14 (non-durable cost telemetry)

### Books

#### BK-17.01 — Streaming & First-Token Delivery

- **Parent Volume:** VOL-17 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns how a normalized stream is delivered to a surface and the TTFT SLO that governs it. Depends on VOL-20 (egress chokepoint). Prereq: `StreamChunk` union frozen in AI Runtime Spec (referenced). Cross-refs: §33 Streaming, §39 Performance, glossary `StreamChunk`. Inputs: provider stream from AI Runtime; surface transport (SSE/IPC/WS). Outputs: stream-delivery contract, TTFT SLO definition, backpressure rules. Review: Architecture + Performance.
- **Chapters:**
  - **CH-17.01.01 — Streaming Plane Overview & Boundary to AI Runtime** — depends-on: AI Runtime Spec §13/§54 · references: `packages/contracts/types/src/provider-adapter.ts`, §33 · related features: AGI Chat streaming · est pages: 12 · difficulty: med · review checklist: evidence-cited; no invented wire shape; references AI Runtime not duplicates
  - **CH-17.01.02 — Stream Gateway & StreamChunk Consumption Flow** — depends-on: CH-17.01.01 · references: `packages/ai/provider-runtime/src/gateway.ts`, §33 · related features: managed stream proxy · est pages: 16 · difficulty: high · review checklist: gateway-fingerprint/retry cited; trust-boundary correct
  - **CH-17.01.03 — TTFT SLO Mechanics & Measurement** — depends-on: VOL-21 metric taxonomy · references: §39, §38 · related features: latency budgets · est pages: 12 · difficulty: med · review checklist: SLO grounded; metric ownership referenced to VOL-21
  - **CH-17.01.04 — Backpressure, Idle Watchdog & Stream Cancellation** — depends-on: CH-17.01.02 · references: `provider-runtime` stream-idle watchdog, §33 · related features: cancel/abort · est pages: 14 · difficulty: high · review checklist: cancel path fail-closed; no leaked open stream
  - **CH-17.01.05 — Per-Surface Stream Transport Parity (SSE / IPC / WS)** — depends-on: CH-17.01.02 · references: §10 surface partition, §28 · related features: all synced surfaces · est pages: 12 · difficulty: med · review checklist: surface matrix honored; developer-surface scope correct

#### BK-17.02 — Long-Running Tasks & Tool-Loop Lifecycle

- **Parent Volume:** VOL-17 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the lifecycle of execution that outlives a single request — tool-loop step limits, suspension, and resumption. Depends on VOL-19 (persistence) and VOL-18 (session identity, referenced). Cross-refs: §32, §16/§17 agent/workflow (referenced to AI Runtime Spec). Inputs: agent-loop step semantics (AI Runtime). Outputs: task lifecycle state machine, step-limit policy, resumption protocol. Review: Architecture + Security.
- **Chapters:**
  - **CH-17.02.01 — Long-Running Task Model & Boundary to Agent Loop** — depends-on: AI Runtime Spec §16/§17 · references: §32, §54 · related features: AGI Agent · est pages: 14 · difficulty: high · review checklist: defers agent semantics to AI Runtime; no duplication
  - **CH-17.02.02 — Tool-Loop Step Limits & Safety Caps** — depends-on: CH-17.02.01 · references: §32, §15 tool abstraction · related features: tool use, computer use · est pages: 14 · difficulty: high · review checklist: step caps fail-safe; autonomy consent referenced to VOL-20
  - **CH-17.02.03 — Task Suspension, Checkpoint Handoff & Resumption Protocol** — depends-on: VOL-18 BK-18.02, VOL-19 BK-19.02 · references: §20, §32 · related features: resumable agent runs · est pages: 16 · difficulty: extreme · review checklist: checkpoint owned by VOL-18; resume path idempotent
  - **CH-17.02.04 — Credit Reserve / Refund Reconciliation at Execution Time** — depends-on: VOL-21 durable cost · references: §33, §43 (ledger ref) · related features: Managed metering · est pages: 14 · difficulty: high · review checklist: ledger referenced not owned; BLOCKED-on-A14 noted
  - **CH-17.02.05 — Failure, Partial-Result & Compensation Semantics** — depends-on: CH-17.02.03 · references: §34, §35 · related features: degraded runs · est pages: 12 · difficulty: high · review checklist: no silent data loss; error taxonomy referenced to VOL-22

#### BK-17.03 — Background Execution, Scheduling & Event Bus

- **Parent Volume:** VOL-17 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the cron/scheduling contract and the (currently future) durable queue / event-bus boundary. Depends on VOL-19 (durable state). Cross-refs: §30 Event, §31 Background, §34 Reliability. Inputs: scheduled-task definitions, event sources. Outputs: scheduling contract, queue/bus boundary, durability guarantees with current-vs-target markers. Review: Architecture.
- **Chapters:**
  - **CH-17.03.01 — Background Execution Model & Current-vs-Target State** — depends-on: — · references: §31, AGI-DOC-0003 §11 risks · related features: Dispatch/Scheduled/Cowork · est pages: 12 · difficulty: med · review checklist: current state honest; target marked, not as fact
  - **CH-17.03.02 — Cron / Scheduling Contract** — depends-on: CH-17.03.01 · references: §31, §34 · related features: scheduled tasks · est pages: 12 · difficulty: med · review checklist: implementation-grounded or UNKNOWN
  - **CH-17.03.03 — Durable Queue & Event-Bus Boundary (Target)** — depends-on: CH-17.03.01 · references: §30 · related features: future durable jobs · est pages: 14 · difficulty: high · review checklist: clearly target; no invented runtime
  - **CH-17.03.04 — Idempotency-Key Discipline & At-Least-Once Handling** — depends-on: CH-17.03.03 · references: §31, §34 · related features: retried jobs · est pages: 12 · difficulty: high · review checklist: idempotency rule precise; ordering stated

#### BK-17.04 — Offline, Rate-Limiting & Reliability Mechanics

- **Parent Volume:** VOL-17 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the offline-queue operation taxonomy, backoff/ordering guarantees, and rate-limiting policy that make execution reliable at boundaries. Depends on VOL-20 (authz interaction). Cross-refs: §41 Offline, §34 Reliability. Inputs: offline operation set, rate-limit targets. Outputs: offline-queue taxonomy, backoff/ordering contract, rate-limit policy. Review: Architecture + Security.
  - **Chapters:**
  - **CH-17.04.01 — Offline-Queue Operation Taxonomy** — depends-on: VOL-18 (entity model ref) · references: §41 · related features: offline mobile/desktop · est pages: 12 · difficulty: high · review checklist: operation set complete; sync-boundary correct
  - **CH-17.04.02 — Backoff, Ordering & Replay Guarantees** — depends-on: CH-17.04.01 · references: §34, §41 · related features: offline replay · est pages: 12 · difficulty: high · review checklist: ordering guarantee explicit; no double-apply
  - **CH-17.04.03 — Rate-Limiting Policy & Quota Enforcement** — depends-on: VOL-20 authz · references: §34, §28 · related features: managed quotas · est pages: 12 · difficulty: med · review checklist: authz referenced; fail-closed on quota
  - **CH-17.04.04 — Reliability Posture: Timeouts, Retries & Degraded Execution** — depends-on: CH-17.04.02 · references: §34, §39 · related features: resilience · est pages: 12 · difficulty: high · review checklist: degraded mode honest; SLO ownership referenced to VOL-23

---

#### BK-17.05 — Job Lifecycle State Machine & Worker Dispatch

- **Parent Volume:** VOL-17 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the full background-job state machine (queued/claimed/running/succeeded/failed/retried/dead) distinct from the scheduling trigger (BK-17.03 owns cron/scheduling; this book owns what happens to a job after it is enqueued). Closes gap #17 by splitting the job-runtime out of BK-17.03 so worker dispatch, heartbeat/lease, resumption, compensation, and per-job idempotency are first-class. Defers the durable queue/event-bus boundary to BK-17.03.03 and the infrastructure plane realization to VOL-28 BK-28.04 (referenced); defers checkpoint persistence to VOL-18 BK-18.02; defers credit reconciliation to BK-17.02.04; defers the backend route/service composition that hosts dispatch to VOL-24 (referenced, per the Execution-mechanics Single-Owner Resolution: VOL-17 owns behavior, VOL-24 hosts it). Depends on VOL-19 (durable job state), VOL-20 (authz on worker claim). Cross-refs: §31, §32, §34. Inputs: enqueued job descriptors from BK-17.03, scheduled-agent definitions. Outputs: job lifecycle state machine, worker-dispatch/lease contract, heartbeat & resumption protocol, compensation semantics. Review: Architecture + Security (worker claim authz). Traces to Architecture Constitution §31/§34, AGI-OPS-\* requirement domain. BLOCKED-shared on ARCH-D14/A14 (non-durable cost telemetry) for any cost-bearing job and on the durable-queue target (BK-17.03.03) for persistence guarantees.
- **Chapters:**
  - **CH-17.05.01 — Job Lifecycle State Machine (queued→claimed→running→terminal)** — depends-on: VOL-17 BK-17.03.02 · references: §31, §34, VOL-08 BK-08.11 (Dispatch/Scheduled/Cowork capability) · related features: scheduled agents, background runs · est pages: 12 · difficulty: high · review checklist: states exhaustive; transitions explicit; boundary to scheduling (BK-17.03) clean, no re-ownership
  - **CH-17.05.02 — Worker Dispatch, Lease & Heartbeat Contract** — depends-on: CH-17.05.01, VOL-20 BK-20.02 · references: §31, §34 · related features: worker pool, agent-run dispatch · est pages: 12 · difficulty: high · review checklist: lease fail-closed on expiry; worker-claim authz referenced to VOL-20; no double-claim
  - **CH-17.05.03 — Resumption, Retry Budget & Dead-Job Handling** — depends-on: CH-17.05.01, VOL-18 BK-18.02 · references: §32, §34 · related features: resumable agent runs · est pages: 12 · difficulty: high · review checklist: checkpoint owned by VOL-18 referenced; retry budget bounded; dead-job terminal not silently dropped
  - **CH-17.05.04 — Per-Job Idempotency & Exactly-Once-Effect Discipline** — depends-on: CH-17.05.02, VOL-17 BK-17.03.04 · references: §31, §34 · related features: retried jobs · est pages: 11 · difficulty: high · review checklist: idempotency key per job precise; at-least-once delivery referenced to BK-17.03.04; no double-effect
  - **CH-17.05.05 — Compensation & Saga Semantics for Multi-Step Jobs (Target)** — depends-on: CH-17.05.03 · references: §34, VOL-17 BK-17.02.05 (failure/compensation), VOL-13 (workflow runtime, referenced) · related features: workflow resumption · est pages: 10 · difficulty: extreme · review checklist: clearly Target; compensation deterministic; no silent partial completion; workflow engine referenced not re-owned

## VOL-18 — Synchronization Runtime (Session & Sync)

- **Volume ID:** VOL-18 · **Generation Priority:** P1 · **Difficulty:** extreme
- **Purpose:** Define WHAT documents will exist that own session and cross-surface synchronization mechanics — the session schema and its fork/checkpoint/resume/replay state machine, per-surface persistence formats, cursor-frontier semantics, the per-entity conflict matrix, and tombstone propagation. This volume is the documentation home for the constitution's **Session & Synchronization Specification** (inheriting book deferred from §20, §21, §44).
- **Scope:** IN — session identity and lifecycle state machine, fork/checkpoint/resume/replay, cursor-frontier / delta-transport semantics, LWW-vs-append-only conflict matrix per entity, tombstone propagation, the doubly-gated Managed-only sync rule, developer-surface rejection at the sync boundary. OUT — the concrete table schemas and indexes (owned by VOL-19); the egress/identity/authz enforcement the sync gate calls into (owned by VOL-20); the credit/entitlement check on the sync route (referenced to Cloud Services Spec); UI rendering of sync state (owned by VOL-22).
- **Owner:** Principal Distributed State Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002/0005/0007/0008
- **Dependencies:** VOL-19 (Storage Runtime), VOL-20 (Security Runtime) · **Prerequisites:** §20/§21/§44 frozen; UUIDv7 session-identity primitive exists (`packages/platform/utils/src/uuidv7.ts`); store schemas exist as VOL-19 references; AGI-SYNC-0001 fixed
- **Review Process:** Architecture Review (§58); Security Review (§57) mandatory — sync crosses trust boundaries and is doubly-gated; ADR required for any AGI-TRUST-_/AGI-SYNC-_ change (§59)
- **Audience:** distributed-systems engineers, backend engineers, AI agents
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** extreme / high / 4 / ~200 pages across 3 books
- **Inherits / References (no duplication):** references VOL-19 store schemas, VOL-20 egress/identity/authz, glossary `shared cloud chat store`/`sync boundary`/`local store`/`Local→BYOK fork`, AGI-SYNC-0001, AGI-TRUST-0001..0004, AGI-DOC-0003 §6 sync current state, ARCH-D10/A10 (skip-vs-buffer ordering defect)

### Books

#### BK-18.01 — Session Identity & Schema

- **Parent Volume:** VOL-18 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the session schema and its immutable trust-boundary stamp. Depends on VOL-19 (persistence). Cross-refs: §20, glossary `one chat`. Inputs: UUIDv7 primitive, trust-mode tag. Outputs: session schema contract, identity rules. Review: Architecture + Security.
- **Chapters:**
  - **CH-18.01.01 — Session Model & Immutable Trust-Boundary Stamp** — depends-on: VOL-20 trust boundary · references: §20, `packages/platform/utils/src/uuidv7.ts` · related features: one chat · est pages: 14 · difficulty: high · review checklist: UUIDv7 fail-closed cited; trust-mode immutable per session
  - **CH-18.01.02 — Session Schema & Per-Surface Persistence Format Map** — depends-on: VOL-19 BK-19.01 · references: §20, §22 · related features: chat/session storage · est pages: 14 · difficulty: high · review checklist: schema owned by VOL-19 referenced; surface formats correct
  - **CH-18.01.03 — Local vs Synced Session Partition (SyncedApp vs DeveloperSession)** — depends-on: CH-18.01.01 · references: §10, §44, `suite-contracts.ts` · related features: surface matrix · est pages: 12 · difficulty: med · review checklist: matrix honored; developer surfaces stay local
  - **CH-18.01.04 — Local-PK to Cloud-Identity Mapping at Session Level** — depends-on: VOL-19 BK-19.03 · references: §29 · related features: handoff · est pages: 12 · difficulty: high · review checklist: mapping referenced to VOL-19; no silent crossing

#### BK-18.02 — Lifecycle State Machine: Fork / Checkpoint / Resume / Replay

- **Parent Volume:** VOL-18 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the session lifecycle state machine including the consented Local→BYOK fork. Depends on VOL-20 (consent gate). Cross-refs: §20, §24. Inputs: session schema, consent-gate flow (VOL-20). Outputs: state machine, fork/checkpoint/resume/replay contracts. Review: Architecture + Security (mandatory for fork).
- **Chapters:**
  - **CH-18.02.01 — Lifecycle State Machine Overview** — depends-on: BK-18.01 · references: §20 · related features: session lifecycle · est pages: 12 · difficulty: high · review checklist: states exhaustive; transitions explicit
  - **CH-18.02.02 — Checkpoint & Resume Semantics** — depends-on: CH-18.02.01, VOL-17 BK-17.02 · references: §20, §32 · related features: resumable runs · est pages: 14 · difficulty: extreme · review checklist: checkpoint format precise; resume idempotent
  - **CH-18.02.03 — Replay Determinism & Constraints** — depends-on: CH-18.02.02 · references: §19 context determinism (ref) · related features: replay · est pages: 12 · difficulty: high · review checklist: determinism bound; context assembly referenced to other cluster
  - **CH-18.02.04 — Local→BYOK Fork: Consented Trust-Boundary Crossing** — depends-on: VOL-20 BK-20.03 · references: §24, AGI-TRUST-0002, glossary `Local→BYOK fork` · related features: handoff · est pages: 16 · difficulty: extreme · review checklist: explicit consent + secret scan + payload preview; ADR-gated; no silent route

#### BK-18.03 — Delta Synchronization: Frontier, Conflict & Tombstones

- **Parent Volume:** VOL-18 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the Managed-only, doubly-gated delta transport: cursor frontier, per-entity conflict matrix, tombstone propagation, and the buffer-vs-skip ordering decision (ARCH-D10/A10, BLOCKED). Depends on VOL-20 (gate), VOL-19 (store). Cross-refs: §21, §44. Inputs: store delta feed, identity/authz gate. Outputs: frontier semantics, conflict matrix, tombstone rules. Review: Architecture + Security.
- **Chapters:**
  - **CH-18.03.01 — Doubly-Gated Managed-Only Sync Boundary** — depends-on: VOL-20 BK-20.01/20.04 · references: §21, §44, AGI-SYNC-0001 · related features: shared cloud chat store · est pages: 14 · difficulty: high · review checklist: Managed-only writer rule; gate referenced to VOL-20
  - **CH-18.03.02 — Cursor-Frontier & Delta-Transport Semantics** — depends-on: VOL-19 BK-19.01 · references: §21, §44, UUIDv7 ordering · related features: delta sync · est pages: 16 · difficulty: extreme · review checklist: frontier monotonic; UUIDv7 ordering cited
  - **CH-18.03.03 — Per-Entity Conflict Matrix (LWW vs Append-Only)** — depends-on: CH-18.03.02 · references: §21, §44 · related features: chats/artifacts/projects/memory · est pages: 16 · difficulty: extreme · review checklist: every synced entity classified; no ambiguity
  - **CH-18.03.04 — Tombstone Propagation & Deletion Semantics** — depends-on: CH-18.03.03 · references: §21, §44 · related features: cross-surface delete · est pages: 12 · difficulty: high · review checklist: deletion converges; no resurrection
  - **CH-18.03.05 — Ordering Under Missing Parents: Buffer-vs-Skip (BLOCKED ARCH-D10/A10)** — depends-on: CH-18.03.02 · references: register §9 A10, §21 · related features: incomplete-view defect · est pages: 12 · difficulty: high · review checklist: records open decision; no design-around; founder dependency named

---

## VOL-19 — Storage Runtime (Database & Trust-Boundary Stores)

- **Volume ID:** VOL-19 · **Generation Priority:** P0 · **Difficulty:** high
- **Purpose:** Define WHAT documents will exist that own the data layer — concrete schemas, indexes, migration SQL, the migration runner/ledger and branch-first apply workflow, the three distinct trust-boundary store realizations, and the local-PK-to-cloud-identity mapping. This volume is the documentation home for the constitution's **Database Specification** plus the Storage-Architecture detail deferred from §22 and §29.
- **Scope:** IN — Neon Managed schema/indexes/migration SQL, migration runner/ledger and branch-first apply, three trust-boundary stores (local SQLCipher/JSON/MMKV, BYOK user-owned, Managed Neon under non-BYPASSRLS role), local-PK-to-cloud-identity mapping. OUT — RLS _policy SQL/role/GUC enforcement_ mechanics (owned by VOL-20 — referenced; the schema declares where RLS applies, Security owns the policy); sync delta semantics (owned by VOL-18); caching behavior (owned by VOL-22). This volume owns the store _shapes_; VOL-20 owns the store _protection_.
- **Owner:** Principal Data Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002/0005/0007/0008
- **Dependencies:** VOL-20 (Security Runtime) · **Prerequisites:** §22/§29 frozen; Neon migrations `0001`–`0042` inventoried (`apps/web/db/neon`); RLS role model exists as VOL-20 reference; ARCH-D11/A11 migration-ledger decision (BLOCKED)
- **Review Process:** Architecture Review (§58); Security Review (§57) mandatory for store-boundary and RLS-applicability claims; ADR for migration-ledger model (touches AGI-DATA-_ and AGI-TRUST-_)
- **Audience:** data/backend engineers, AI agents writing migrations
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 4 / ~210 pages across 3 books
- **Inherits / References (no duplication):** references VOL-20 RLS enforcement, glossary `local store`/`shared cloud chat store`, AGI-DATA-0001 (Neon canonical), AGI-DOC-0003 §7 storage current state, CURRENT_DECISIONS #17 (Superseded Supabase→Neon), ARCH-D11/A11 (TEMP migrate script, no ledger), AUDIT-IMMUT-01 (referenced to VOL-20)

### Books

#### BK-19.01 — Trust-Boundary Stores & Schema

- **Parent Volume:** VOL-19 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the three distinct stores and the Managed schema/indexes. Depends on VOL-20 (RLS applicability). Cross-refs: §22, §29. Inputs: per-surface storage tech, Neon migrations. Outputs: store catalog, schema/index reference. Review: Architecture + Security.
- **Chapters:**
  - **CH-19.01.01 — Three Trust-Boundary Stores: Local / BYOK / Managed** — depends-on: VOL-20 trust plane · references: §22, glossary trust modes · related features: Local/BYOK/Managed · est pages: 16 · difficulty: high · review checklist: single store would collapse boundary; honest enforcement state
  - **CH-19.01.02 — Local Store Formats (SQLCipher / JSON-JSONL / MMKV)** — depends-on: CH-19.01.01 · references: §22, §42, AGI-DOC-0003 §7 · related features: desktop/CLI/mobile local · est pages: 14 · difficulty: high · review checklist: per-surface format cited; never silently uploaded
  - **CH-19.01.03 — Managed Neon Schema & Index Reference** — depends-on: CH-19.01.01 · references: §29, `apps/web/db/neon` 0001–0042 · related features: cloud chat/projects/memory · est pages: 16 · difficulty: high · review checklist: schema grounded in migrations; counts verified not stale
  - **CH-19.01.04 — Vendor-Neutral Data-Layer Adapter Boundary** — depends-on: CH-19.01.03 · references: §29, AGI-DATA-0001 · related features: data-layer package · est pages: 12 · difficulty: med · review checklist: one adapter SSOT; no ad-hoc DB access

#### BK-19.02 — Migrations, Ledger & Branch-First Apply

- **Parent Volume:** VOL-19 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns migration SQL conventions, the runner/ledger, and the branch-first apply workflow. BLOCKED on ARCH-D11/A11 (no ledger today; TEMP script). Cross-refs: §29. Inputs: migration files, Neon branching. Outputs: migration conventions, ledger model (target), apply workflow. Review: Architecture + Security.
- **Chapters:**
  - **CH-19.02.01 — Migration SQL Conventions & Numbering** — depends-on: BK-19.01 · references: §29, `apps/web/db/neon` · related features: schema evolution · est pages: 12 · difficulty: med · review checklist: numbering grounded; no invented migration
  - **CH-19.02.02 — Migration Runner & Ledger (BLOCKED ARCH-D11/A11)** — depends-on: CH-19.02.01 · references: register §9 A11, `_prod_migrate.mjs` · related features: prod migrate · est pages: 14 · difficulty: high · review checklist: records committed-vs-live drift honestly; founder dependency named; no design-around
  - **CH-19.02.03 — Branch-First Apply Workflow** — depends-on: CH-19.02.02 · references: §29, Neon branching · related features: safe apply · est pages: 12 · difficulty: med · review checklist: branch-first cited; rollback path stated
  - **CH-19.02.04 — Committed-vs-Live Drift Detection** — depends-on: CH-19.02.02 · references: §29, §58 · related features: schema audit · est pages: 12 · difficulty: high · review checklist: target marked; verification command if exists or UNKNOWN

#### BK-19.03 — Local-PK to Cloud-Identity Mapping

- **Parent Volume:** VOL-19 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns how a local-origin primary key is mapped to a cloud identity on consented promotion, without collapsing the boundary. Depends on VOL-20 (identity). Cross-refs: §22, §29. Inputs: local PKs, Clerk identity (VOL-20 ref). Outputs: mapping contract. Review: Architecture + Security.
- **Chapters:**
  - **CH-19.03.01 — Local-PK to Cloud-Identity Mapping Contract** — depends-on: VOL-20 BK-20.02 · references: §29 · related features: Local→Cloud promotion · est pages: 14 · difficulty: high · review checklist: mapping deterministic; identity referenced to VOL-20
  - **CH-19.03.02 — Per-User Isolation & RLS Applicability Map** — depends-on: VOL-20 BK-20.04 · references: §27, §29 · related features: per-user data · est pages: 12 · difficulty: high · review checklist: schema declares RLS-applicable tables; policy owned by VOL-20
  - **CH-19.03.03 — Retention & Deletion at the Storage Layer** — depends-on: CH-19.03.01 · references: §22, §43 GA gating (ref) · related features: deletion controls · est pages: 12 · difficulty: high · review checklist: deletion semantics honest; GA-gating referenced to VOL-23

---

#### BK-19.04 — Blob & Artifact Storage Stores (Local / BYOK / Managed)

- **Parent Volume:** VOL-19 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Closes gap #13 by owning the trust-boundary store _model_ for non-relational binary objects — uploaded files, generated artifacts, generated-file payloads — across the three trust boundaries (local filesystem/encrypted-at-rest, BYOK user-owned bucket, Managed Vercel Blob under metered egress). Extends VOL-19's three-store model (BK-19.01) to blobs; the relational metadata/row for each object stays owned by VOL-27 (referenced), the egress protection of every blob read/write is owned by VOL-20 (referenced), sync of blob references is owned by VOL-18 (referenced), and the Artifacts/Generated-Files _capabilities_ stay owned by VOL-08 BK-08.03/BK-08.10 (referenced — this book owns the store shape, not the capability). Depends on VOL-20 (egress on blob I/O), VOL-27 (relational object-metadata rows). Cross-refs: §22, §29, manifest §7 (Vercel Blob). Inputs: per-surface blob backends, artifact/generated-file payloads, content-addressing scheme. Outputs: blob-store catalog per trust boundary, object key/addressing convention, retention/tombstone-at-blob-layer contract. Review: Architecture + Security (egress + deletion). Traces to Architecture Constitution §22, AGI-DATA-\* domain, glossary `local store`/`Artifact`/`Generated file`. References VOL-20 CH-20.01 egress and VOL-19 CH-19.03.03 retention/deletion (no re-ownership).
- **Chapters:**
  - **CH-19.04.01 — Three Trust-Boundary Blob Stores (local FS / BYOK bucket / Managed Blob)** — depends-on: VOL-19 BK-19.01.01, VOL-20 trust plane · references: §22, manifest §7, glossary trust modes · related features: artifact/file persistence · est pages: 12 · difficulty: high · review checklist: blob store never silently crosses boundary; single store would collapse boundary; Managed Blob is metered-egress-only
  - **CH-19.04.02 — Object Addressing, Content Hashing & Metadata-Row Linkage (to VOL-27)** — depends-on: CH-19.04.01, VOL-27 BK-27.01 · references: §29, `packages/contracts/types` GeneratedFile · related features: artifact versioning, file manifest · est pages: 10 · difficulty: med · review checklist: relational metadata referenced to VOL-27 not duplicated; addressing deterministic
  - **CH-19.04.03 — Blob Egress, Signed-URL & Read/Write Protection (references VOL-20)** — depends-on: CH-19.04.01, VOL-20 BK-20.01 · references: §23, §24, AGI-TRUST-0001 · related features: artifact download, file upload · est pages: 10 · difficulty: high · review checklist: every blob I/O through egress chokepoint; signed-URL scope minimal; egress mechanics referenced to VOL-20
  - **CH-19.04.04 — Blob Retention, Tombstone & TTL at the Storage Layer** — depends-on: CH-19.04.01, VOL-19 BK-19.03.03 · references: §22, glossary `Generated file/Compute session` TTL · related features: deletion controls, compute-session expiry · est pages: 10 · difficulty: high · review checklist: deletion converges to blob removal; tombstone references VOL-19 CH-19.03.03; no orphaned blob; sync of refs referenced to VOL-18

## VOL-20 — Security Runtime (Trust Plane Enforcement)

- **Volume ID:** VOL-20 · **Generation Priority:** P0 · **Difficulty:** extreme
- **Purpose:** Define WHAT documents will exist that own the implementation detail of the **Trust Plane (constitution §23–§27)** — egress-guard wire-level enforcement and per-surface parity, RLS policy SQL / role model / GUC-binding mechanics and activation plan, SSRF hardening, consent-gate flows, secret handling and redaction, the single privacy-boundary predicate, and the security-scan gating ladder. This volume is the documentation home for the constitution's **Security Specification** (deferred from §23, §24, §25, §26, §27, §57). Per the cluster note, Security Runtime depends on the Trust Plane (§23–§27); this volume is its enforcement-mechanics home and the upstream dependency for VOL-18/19/21/23.
- **Scope:** IN — egress chokepoint wire enforcement + per-surface parity, the single privacy-boundary predicate, RLS policy SQL/role/GUC and activation plan, SSRF hardening, consent-gate flows, secret handling/redaction, identity/authn/authz mechanics, security-scan gating ladder. OUT — the threat-model narratives per surface (07-security layer, other cluster — referenced); the store _shapes_ (owned by VOL-19); logging redaction _taxonomy_ application (shared with VOL-21 via the one predicate — VOL-20 owns the predicate, VOL-21 owns logger patterns that consume it); the sync state machine (owned by VOL-18, calls into this gate).
- **Owner:** Principal Security Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002/0005/0007/0008
- **Dependencies:** none within cluster (most foundational of C5) · **Prerequisites:** §23–§27 + §57 frozen; egress guard exists (`apps/desktop/src/lib/egressGuard.ts`); privacy predicate exists (`apps/desktop/src/stores/privacyBoundary.ts`); Clerk identity in place; RLS shipped-but-dormant state acknowledged
- **Review Process:** Security Review (§57) MANDATORY for every book; Architecture Review (§58); ADR REQUIRED for any AGI-TRUST-\* change (§59) — this volume touches them pervasively
- **Audience:** security engineers, backend engineers, AI agents, founders (for trust-boundary decisions)
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** extreme / extreme / 5 / ~270 pages across 4 books
- **Inherits / References (no duplication):** references glossary `trust boundary`/`egress guard`/`Local/BYOK/Managed`, AGI-TRUST-0001..0004, AGI-SEC-0001 (RLS dormant), AGI-DOC-0003 §8 security current state, BYOK-RUST-EGRESS-01, AUDIT-IMMUT-01, ARCH gaps A8 (mobile egress copy); 07-security threat models (other cluster)

### Books

#### BK-20.01 — Egress Chokepoint & The Privacy-Boundary Predicate

- **Parent Volume:** VOL-20 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the fail-closed egress chokepoint and the single privacy-boundary predicate shared by egress/logging/telemetry/sync/cache. Cross-refs: §23, §24, §42. Inputs: privacy predicate, per-surface network paths. Outputs: egress enforcement contract, per-surface parity plan (BLOCKED on BYOK-RUST-EGRESS-01). Review: Security mandatory.
- **Chapters:**
  - **CH-20.01.01 — Fail-Closed Egress Chokepoint Model** — depends-on: — · references: §24, §42, `egressGuard.ts`, AGI-TRUST-0001 · related features: Local/BYOK egress · est pages: 16 · difficulty: extreme · review checklist: fail-closed; enforcement reality not intent; no silent route
  - **CH-20.01.02 — Single Privacy-Boundary Predicate (one impl per surface)** — depends-on: CH-20.01.01 · references: §23, §24, `privacyBoundary.ts` · related features: shared predicate · est pages: 14 · difficulty: high · review checklist: no per-call-site re-derivation; prior BYOK-leak cited
  - **CH-20.01.03 — Per-Surface Egress Parity (BLOCKED BYOK-RUST-EGRESS-01)** — depends-on: CH-20.01.01 · references: known-flaws BYOK-RUST-EGRESS-01, §7, §42 · related features: CLI/VSCode/Tauri Rust egress · est pages: 16 · difficulty: extreme · review checklist: gap honest; founder dependency named; ADR-gated; no design-around
  - **CH-20.01.04 — Mobile Egress Copy Honesty (ARCH gap A8)** — depends-on: CH-20.01.02 · references: register §9 A8, §10, §45 · related features: mobile BYOK absence · est pages: 10 · difficulty: med · review checklist: copy defect recorded; matrix invariant honored

#### BK-20.02 — Identity, Authentication & Authorization

- **Parent Volume:** VOL-20 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns identity/authn/authz mechanics for Managed. Cross-refs: §25, §26, §27. Inputs: Clerk, role model. Outputs: authn flow, authz model. Review: Security mandatory.
- **Chapters:**
  - **CH-20.02.01 — Identity Architecture (Clerk for Managed)** — depends-on: — · references: §25, AGI-DOC-0003 §9 · related features: managed auth · est pages: 12 · difficulty: med · review checklist: Clerk grounded; Local needs no AGI identity
  - **CH-20.02.02 — Authentication Strategy & Session Tokens** — depends-on: CH-20.02.01 · references: §26 · related features: sign-in · est pages: 12 · difficulty: med · review checklist: token flow cited; no invented route
  - **CH-20.02.03 — Authorization Strategy & Role Model** — depends-on: CH-20.02.02 · references: §27 · related features: per-user/entitlement · est pages: 14 · difficulty: high · review checklist: roles enumerated; non-BYPASSRLS role cited

#### BK-20.03 — Consent Gates, Secret Handling & Redaction

- **Parent Volume:** VOL-20 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns consent-gate flows (including the secret scan / payload preview used by Local→BYOK fork), secret handling, and redaction patterns. Cross-refs: §24, §25, §57. Inputs: consent UX hooks (VOL-22 ref), secret stores. Outputs: consent-gate contract, redaction rules (consumed by VOL-21). Review: Security mandatory.
- **Chapters:**
  - **CH-20.03.01 — Consent-Gate Flow Contract** — depends-on: BK-20.01 · references: §24, AGI-TRUST-0002, glossary `Local→BYOK fork` · related features: handoff consent · est pages: 14 · difficulty: high · review checklist: explicit consent steps; payload preview + secret scan required
  - **CH-20.03.02 — Secret Handling & Storage** — depends-on: CH-20.03.01 · references: §25, §57 · related features: BYOK keys · est pages: 12 · difficulty: high · review checklist: secrets never logged; BYOK key path cited
  - **CH-20.03.03 — Redaction Patterns (predicate-driven; consumed by VOL-21)** — depends-on: CH-20.01.02 · references: §37, §38 · related features: logging/telemetry redaction · est pages: 12 · difficulty: high · review checklist: predicate-shared; VOL-21 references this, no duplication

#### BK-20.04 — RLS Mechanics, SSRF Hardening & Security-Scan Gating

- **Parent Volume:** VOL-20 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns RLS policy SQL/role/GUC-binding and the activation plan (BLOCKED on AGI-SEC-0001), SSRF hardening, audit-log immutability (AUDIT-IMMUT-01), and the security-scan gating ladder. Cross-refs: §27, §29, §57. Inputs: role model, Neon GUC, Semgrep. Outputs: RLS policy model, SSRF rules, scan gating ladder. Review: Security mandatory + ADR.
- **Chapters:**
  - **CH-20.04.01 — RLS Policy SQL, Role Model & GUC Binding** — depends-on: BK-20.02, VOL-19 BK-19.03 · references: §27, §29 · related features: per-user isolation · est pages: 16 · difficulty: extreme · review checklist: policy SQL precise; non-BYPASSRLS role; GUC binding cited
  - **CH-20.04.02 — RLS Activation Plan (BLOCKED AGI-SEC-0001)** — depends-on: CH-20.04.01 · references: AGI-SEC-0001, register §5, §27 · related features: live-path RLS · est pages: 14 · difficulty: extreme · review checklist: dormant state honest; only /sync RLS-bound today; ADR-gated; founder dependency named
  - **CH-20.04.03 — Audit-Log Immutability (AUDIT-IMMUT-01)** — depends-on: CH-20.04.01 · references: known-flaws AUDIT-IMMUT-01, §27, §57 · related features: security_audit_logs · est pages: 12 · difficulty: high · review checklist: mutable-by-app_rls gap recorded; target marked
  - **CH-20.04.04 — SSRF Hardening** — depends-on: BK-20.01 · references: §23, §57 · related features: server-side fetch · est pages: 12 · difficulty: high · review checklist: SSRF rules grounded; no invented allowlist
  - **CH-20.04.05 — Security-Scan Gating Ladder** — depends-on: — · references: §57, manifest §11 (Semgrep advisory) · related features: CI security gate · est pages: 12 · difficulty: high · review checklist: enforced-vs-advisory honest; drive-to-zero plan referenced to Testing Spec

---

#### BK-20.05 — Per-Surface Threat Models & Native-Messaging Bridge Threat Model

- **Parent Volume:** VOL-20 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the per-surface threat-model narratives (Web/Desktop/CLI/Mobile/VSCode) and the native-messaging desktop↔extension bridge threat model — the cluster VOL-20's original scope line marked OUT ("07-security layer, other cluster — referenced"); this book brings that cluster home and AMENDS that OUT-line. Inherits VOL-20 Required Constitutions. Depends on BK-20.01..04 (the enforcement mechanics being threat-modeled) and references the per-surface shells in VOL-06 (BK-06.01..06) plus the IPC/transport contract in VOL-06 BK-06.09. The existing `apps/extension/THREAT_MODEL.md` is the Chrome owner — referenced, never re-authored. Cross-refs: §23–§27, §57. Inputs: per-surface attack surfaces, egress paths, native-messaging host. Outputs: per-surface threat-model documents + cross-surface attack-surface attestation. Review: Security Review (§57) MANDATORY per chapter; Architecture Review (§58).
- **Chapters:**
  - **CH-20.05.01 — Threat-model framework, methodology & per-surface scope** — depends-on: BK-20.01 · references: §23–§27, §57, AGI-TRUST-0001..0004 · related features: security-review framework · est pages: 16 · difficulty: high · review checklist: methodology grounded in trust-plane; amends VOL-20 scope OUT-line explicitly; no per-surface detail duplicated from VOL-06
  - **CH-20.05.02 — Web surface threat model (Cloud-only posture)** — depends-on: CH-20.05.01, VOL-06 BK-06.01 · references: `apps/web`, trust-mode-surface-matrix.md, AGI-TRUST-0001 · related features: web attack surface · est pages: 16 · difficulty: high · review checklist: Cloud-only posture cited from matrix; surface shell referenced not re-authored
  - **CH-20.05.03 — Desktop surface threat model (Local + BYOK + Cloud, egress + IPC)** — depends-on: CH-20.05.01, VOL-06 BK-06.02, VOL-06 BK-06.09 · references: `apps/desktop/src/lib/egressGuard.ts`, known-flaws BYOK-RUST-EGRESS-01, LOCAL-CHAT-NOINVOKE-01 · related features: desktop attack surface · est pages: 18 · difficulty: extreme · review checklist: egress + IPC threats grounded in real paths; current-state flaws cited honestly; references command contract not redefined
  - **CH-20.05.04 — CLI surface threat model (developer-session, egress gap)** — depends-on: CH-20.05.01, VOL-06 BK-06.04 · references: `apps/cli/src/agent/mod.rs`, CLI-has-no-egress-guard gap, CH-20.01.03 · related features: CLI attack surface · est pages: 14 · difficulty: high · review checklist: CLI egress-guard absence cited as current state; developer-session non-sync posture referenced
  - **CH-20.05.05 — Mobile surface threat model (Local + Cloud, no BYOK)** — depends-on: CH-20.05.01, VOL-06 BK-06.03 · references: AGI-TRUST-0004, ARCH gap A8 (mobile egress copy), MMKV store · related features: mobile attack surface · est pages: 14 · difficulty: high · review checklist: no-BYOK posture cited from AGI-TRUST-0004; mobile egress copy honesty referenced from CH-20.01.04
  - **CH-20.05.06 — VS Code extension surface threat model (developer-session, editor host)** — depends-on: CH-20.05.01, VOL-06 BK-06.06 · references: `apps/extension-vscode`, VS Code extension API surface · related features: vscode attack surface · est pages: 14 · difficulty: high · review checklist: editor-host trust boundary grounded; developer-session non-sync posture referenced
  - **CH-20.05.07 — Chrome extension threat model (reference existing THREAT_MODEL.md)** — depends-on: CH-20.05.01, VOL-06 BK-06.05 · references: `apps/extension/THREAT_MODEL.md`, computer-use allow-all flaw (CH-06.05.03) · related features: chrome attack surface · est pages: 12 · difficulty: med · review checklist: existing Chrome threat model referenced not duplicated; computer-use allow-all current flaw cited honestly
  - **CH-20.05.08 — Native-messaging desktop↔extension bridge threat model & capability-gating** — depends-on: CH-20.05.03, CH-20.05.07, VOL-06 BK-06.09 · references: `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`, `apps/desktop/src-tauri/src/integrations/native_messaging`, computerUsePanel.ts · related features: ext↔desktop handoff, computer use · est pages: 16 · difficulty: extreme · review checklist: bridge transport referenced from VOL-06 BK-06.09 not re-owned; capability-gating + consent audit threats grounded in real host; clipboard-access risk cited
  - **CH-20.05.09 — Cross-surface attack-surface attestation & incident-playbook hooks** — depends-on: CH-20.05.02, CH-20.05.03, CH-20.05.04, CH-20.05.05, CH-20.05.06, CH-20.05.07 · references: VOL-32 (Operations, referenced), §57 · related features: attestation, incident playbooks · est pages: 14 · difficulty: high · review checklist: attestation rolls up per-surface models without redefining them; incident-response ownership referenced to VOL-32 not claimed

#### BK-20.06 — BYOK Key Lifecycle & Rotation, and Consent-Gate UX Flow

- **Parent Volume:** VOL-20 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** The operational/UX complement to BK-20.03's contracts. Owns (a) the per-surface BYOK key lifecycle — storage location, rotation, breach response — across Desktop/CLI/Mobile, and (b) the user-facing consent-gate review/preview/secret-scan-display/undo flow. CH-20.03.02 (Secret Handling & Storage) remains the secret-handling contract owner; CH-20.03.01 (Consent-Gate Flow Contract) remains the consent contract owner — this book references both and owns only the lifecycle + UX-flow detail those chapters defer. Inherits VOL-20 Required Constitutions. Depends on BK-20.03. References VOL-22 (consent UX hooks) and VOL-25 (per-surface UX) without re-owning them. BLOCKED on D6 (Mobile BYOK timing) for the mobile-rollout chapter. Cross-refs: §24, §25, §57. Inputs: BYOK key stores per surface, consent UX hooks. Outputs: key-lifecycle model + consent-gate UX-flow spec. Review: Security Review (§57) MANDATORY.
- **Chapters:**
  - **CH-20.06.01 — BYOK key lifecycle model (references CH-20.03.02 as contract owner)** — depends-on: BK-20.03 · references: CH-20.03.02, §25, §57 · related features: BYOK key handling · est pages: 12 · difficulty: high · review checklist: references CH-20.03.02; does not re-own secret-handling contract; secrets never logged
  - **CH-20.06.02 — Per-surface BYOK key storage (Desktop / CLI / VSCode)** — depends-on: CH-20.06.01 · references: trust-mode-surface-matrix.md, CH-20.03.02 · related features: desktop/CLI/vscode BYOK · est pages: 14 · difficulty: high · review checklist: per-surface store locations grounded; subscription-gated surfaces cited from matrix; no invented keystore
  - **CH-20.06.03 — Mobile BYOK key handling (Target — BLOCKED on D6, no-BYOK today)** — depends-on: CH-20.06.01 · references: AGI-TRUST-0004, owner-decision-register D6, `v1FeatureFlags.byokKeys=false` · related features: mobile BYOK · est pages: 10 · difficulty: high · review checklist: marked Target; no-BYOK current state cited from AGI-TRUST-0004; BLOCKED on D6 named; no Current claim
  - **CH-20.06.04 — Key rotation, expiry & re-consent triggers** — depends-on: CH-20.06.01 · references: §25, §57 · related features: key rotation · est pages: 12 · difficulty: high · review checklist: rotation triggers grounded; re-consent ties to CH-20.03.01 not re-owned
  - **CH-20.06.05 — Key breach response & revocation** — depends-on: CH-20.06.01 · references: §57, VOL-32 (Operations, referenced) · related features: breach response · est pages: 10 · difficulty: high · review checklist: revocation path grounded; incident ownership referenced to VOL-32 not claimed
  - **CH-20.06.06 — Consent-gate UX flow (review / payload preview / secret-scan display / undo)** — depends-on: BK-20.03 · references: CH-20.03.01, AGI-TRUST-0002, glossary `Local→BYOK fork`, VOL-22 (UX hooks, referenced) · related features: handoff consent UX · est pages: 14 · difficulty: high · review checklist: references CH-20.03.01 as contract owner; owns only user-facing flow; payload preview + secret scan + undo surfaced; visible provider label cited
  - **CH-20.06.07 — Per-surface consent-gate presentation (defers UX placement to VOL-25)** — depends-on: CH-20.06.06 · references: VOL-25 (per-surface UX, referenced), trust-mode-surface-matrix.md · related features: per-surface consent UX · est pages: 10 · difficulty: med · review checklist: per-surface presentation referenced to VOL-25 not re-owned; only surfaces offering Local/BYOK gated

## VOL-21 — Observability Runtime (Telemetry, Logging & Cost)

- **Volume ID:** VOL-21 · **Generation Priority:** P2 · **Difficulty:** high
- **Purpose:** Define WHAT documents will exist that own the metric/event taxonomy, OTel GenAI conventions, logger-facade redaction patterns, durable usage/cost persistence, and the enablement contract for error/trace backends. This volume is the documentation home for the constitution's **Observability, Telemetry & Logging Specification** (deferred from §36, §37, §38).
- **Scope:** IN — metric/event taxonomy, OTel GenAI semantic conventions, logger-facade patterns and two-logger reconciliation (A12), durable usage/cost persistence (A14), error/trace backend enablement contract (A13). OUT — the privacy-boundary predicate and redaction _rules_ themselves (owned by VOL-20 — this volume references and applies them in logger patterns); the credit _ledger_ (Cloud Services Spec); UX surfacing of telemetry-derived states (VOL-22).
- **Owner:** Principal Observability Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002/0005/0007/0008
- **Dependencies:** VOL-20 (Security Runtime) · **Prerequisites:** §36/§37/§38 frozen; privacy predicate + redaction owned by VOL-20; current facade state acknowledged (Sentry no-op, OTel computed-not-exported)
- **Review Process:** Architecture Review (§58); Security Review (§57) for redaction-correctness and BYOK no-leak in telemetry
- **Audience:** observability/SRE engineers, backend engineers, AI agents
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / med / 3 / ~150 pages across 3 books
- **Inherits / References (no duplication):** references VOL-20 BK-20.03 redaction predicate, glossary `Managed Cloud`, AGI-PRIV-_/AGI-OPS-_ IDs, AGI-DOC-0003 §10 DX, ARCH gaps A12 (two loggers), A13 (observability facade), A14 (non-durable cost)

### Books

#### BK-21.01 — Metric & Event Taxonomy and OTel GenAI Conventions

- **Parent Volume:** VOL-21 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the taxonomy and OTel GenAI conventions. Cross-refs: §36, §38. Inputs: runtime events, OTel spec. Outputs: taxonomy, convention mapping. Review: Architecture.
- **Chapters:**
  - **CH-21.01.01 — Metric & Event Taxonomy** — depends-on: — · references: §36, §38 · related features: all runtimes · est pages: 14 · difficulty: med · review checklist: taxonomy complete; events grounded
  - **CH-21.01.02 — OTel GenAI Semantic Conventions** — depends-on: CH-21.01.01 · references: §38 · related features: model-call telemetry · est pages: 12 · difficulty: med · review checklist: GenAI conventions cited; attributes mapped
  - **CH-21.01.03 — Trace/Span Model Across Surfaces** — depends-on: CH-21.01.02 · references: §36, §10 · related features: cross-surface tracing · est pages: 12 · difficulty: med · review checklist: surface scope correct; developer-surface privacy honored

#### BK-21.02 — Logging Standards & Logger Reconciliation

- **Parent Volume:** VOL-21 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns logger-facade patterns, redaction application (predicate from VOL-20), and the two-logger reconciliation (A12). Cross-refs: §37. Inputs: VOL-20 redaction predicate, pino + facade. Outputs: logging standard, reconciliation plan. Review: Architecture + Security.
- **Chapters:**
  - **CH-21.02.01 — Logger-Facade Redaction Patterns (consumes VOL-20 predicate)** — depends-on: VOL-20 BK-20.03 · references: §37 · related features: structured logs · est pages: 12 · difficulty: high · review checklist: redaction predicate referenced not duplicated; BYOK never logged
  - **CH-21.02.02 — Two-Logger Reconciliation (ARCH gap A12)** — depends-on: CH-21.02.01 · references: register §9 A12, §37 · related features: web pino vs facade · est pages: 12 · difficulty: high · review checklist: drift honest; web object-logging scrub gap recorded
  - **CH-21.02.03 — Log Level, Sampling & Retention** — depends-on: CH-21.02.01 · references: §37, §38 · related features: log ops · est pages: 10 · difficulty: med · review checklist: retention honest; no invented sink

#### BK-21.03 — Durable Cost/Usage & Backend Enablement

- **Parent Volume:** VOL-21 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns durable usage/cost persistence (A14) and the error/trace backend enablement contract (A13). Cross-refs: §36, §38. Inputs: usage events, backend toggles. Outputs: durable-cost model (target), enablement contract. Review: Architecture + Security.
- **Chapters:**
  - **CH-21.03.01 — Durable Usage/Cost Persistence (ARCH gap A14)** — depends-on: VOL-19 BK-19.01 · references: register §9 A14, §31, §38 · related features: metering basis · est pages: 14 · difficulty: high · review checklist: current Map/LRU/cold-start-reset honest; target marked; cannot back charge yet
  - **CH-21.03.02 — Error/Trace Backend Enablement Contract (ARCH gap A13)** — depends-on: CH-21.01.02 · references: register §9 A13, §36, §38 · related features: Sentry/OTel export · est pages: 12 · difficulty: med · review checklist: facade state honest (no-op Sentry, unexported OTel); enablement explicit
  - **CH-21.03.03 — Cost/Usage to Billing Boundary (reference only)** — depends-on: CH-21.03.01 · references: §43, Cloud Services Spec · related features: managed credits · est pages: 10 · difficulty: med · review checklist: ledger referenced not owned; boundary clean

---

## VOL-22 — UX Runtime (Error, Reliability-UX, Performance & Caching)

- **Volume ID:** VOL-22 · **Generation Priority:** P2 · **Difficulty:** med
- **Purpose:** Define WHAT documents will exist that own the cross-surface runtime behavior the user _experiences_ — error-handling-to-UX mapping, reliability-UX surfacing (degraded mode, retry, offline indicators), perceived-latency/performance budgets, caching-driven UX, and capability-honest UX rendering. This volume composes the constitution's §35 (Error Handling), §39 (Performance), §40 (Caching) and the user-facing side of §34 (Reliability). NOTE: This is NOT one of the 14 named inheriting books — it is a runtime-layer volume that composes those sections and explicitly REFERENCES the **Surface, Experience & Capability Specification** (another cluster) for the canonical Experience/Surface/Capability contract; it does not invent a parallel Experience primitive.
- **Scope:** IN — error-envelope-to-UX mapping, reliability-UX (degraded/retry/offline/cancel affordances), perceived-latency and performance UX budgets, caching behavior as it affects UX freshness, capability-honest rendering derived from `RuntimeTier`/`evaluateModelEnvironment`. OUT — the canonical Experience/Surface/Capability _contract_ (owned by Surface/Experience/Capability Spec — referenced); the error _taxonomy_ and telemetry events (owned by VOL-21); the streaming/long-running _mechanics_ (owned by VOL-17); the API error envelope _shape_ (owned by API Spec — referenced).
- **Owner:** Principal UX Systems Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002/0005/0007/0008
- **Dependencies:** VOL-17 (Execution Runtime), VOL-21 (Observability Runtime) · **Prerequisites:** §35/§39/§40 frozen; Surface/Experience/Capability contract exists as reference; capability-honesty primitives (`command-capabilities.ts`, `model-catalog.ts evaluateModelEnvironment`)
- **Review Process:** Architecture Review (§58); UX-lock review for capability-honesty (no fake availability badges, no dead controls)
- **Audience:** frontend/surface engineers, UX engineers, AI agents
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** med / med / 3 / ~135 pages across 3 books
- **Inherits / References (no duplication):** references §12 Capability Architecture + Surface/Experience/Capability Spec (canonical Experience primitive), VOL-21 error taxonomy, VOL-17 streaming mechanics, API Spec error envelope, glossary `Experience`/`Surface`/`Capability`, AGI-UX-\* IDs, capability-honesty invariant

### Books

#### BK-22.01 — Error-to-UX & Reliability-UX

- **Parent Volume:** VOL-22 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns how errors and reliability events become user-facing states. Depends on VOL-21 (taxonomy), VOL-17 (cancel/degraded). Cross-refs: §35, §34. Inputs: error taxonomy, reliability events. Outputs: error-to-UX map, reliability-UX patterns. Review: Architecture + UX-lock.
- **Chapters:**
  - **CH-22.01.01 — Error-Envelope to User-Facing State Mapping** — depends-on: VOL-21 BK-21.01, API Spec · references: §35, §28 safe-to-expose codes · related features: error UI · est pages: 12 · difficulty: med · review checklist: safe-to-expose only; envelope referenced to API Spec
  - **CH-22.01.02 — Reliability-UX: Degraded, Retry, Cancel Affordances** — depends-on: VOL-17 BK-17.01/17.04 · references: §34, §35 · related features: degraded mode · est pages: 12 · difficulty: med · review checklist: honest degraded state; no fake success
  - **CH-22.01.03 — Offline & Reconnect UX Surfacing** — depends-on: VOL-17 BK-17.04 · references: §41 · related features: offline indicators · est pages: 10 · difficulty: med · review checklist: offline queue state shown; sync-boundary honored

#### BK-22.02 — Performance & Perceived-Latency UX

- **Parent Volume:** VOL-22 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns perceived-latency budgets and streaming-progress UX. Depends on VOL-17 (TTFT). Cross-refs: §39. Inputs: TTFT SLO (VOL-17). Outputs: perceived-latency budget, progress UX. Review: Architecture + Performance.
- **Chapters:**
  - **CH-22.02.01 — Perceived-Latency Budget & Streaming Progress UX** — depends-on: VOL-17 BK-17.01 · references: §39 · related features: streaming UI · est pages: 12 · difficulty: med · review checklist: budget references TTFT SLO owned by VOL-17
  - **CH-22.02.02 — Optimistic UI & Rollback** — depends-on: VOL-18 conflict matrix · references: §39, §21 · related features: optimistic edits · est pages: 12 · difficulty: high · review checklist: rollback aligns with VOL-18 conflict matrix; no divergent rule
  - **CH-22.02.03 — Skeleton/Loading State Standards** — depends-on: CH-22.02.01 · references: §39 · related features: loading states · est pages: 8 · difficulty: low · review checklist: no fake content; honest loading

#### BK-22.03 — Caching UX & Capability-Honest Rendering

- **Parent Volume:** VOL-22 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns caching-driven UX freshness and capability-honest rendering of pickers/badges. References Surface/Experience/Capability Spec for the contract. Cross-refs: §40, §12. Inputs: cache policy, RuntimeTier/evaluateModelEnvironment. Outputs: cache-UX rules, capability-honest rendering rules. Review: Architecture + UX-lock (mandatory).
- **Chapters:**
  - **CH-22.03.01 — Caching Philosophy as UX Freshness Contract** — depends-on: VOL-19 (store ref) · references: §40 · related features: cached views · est pages: 10 · difficulty: med · review checklist: stale-state honest; cache invalidation stated
  - **CH-22.03.02 — Capability-Honest Rendering (RuntimeTier / evaluateModelEnvironment)** — depends-on: Surface/Experience/Capability Spec · references: §12, `command-capabilities.ts`, `model-catalog.ts` L211–224 · related features: model/capability pickers · est pages: 14 · difficulty: high · review checklist: pickers derived from real backend; fail-closed; no fake availability badge; no dead control
  - **CH-22.03.03 — Provider/Model Label Freshness & No-Outrun Rule** — depends-on: CH-22.03.02 · references: §12, §50, A5 (11-advertised/4-served) · related features: provider labels · est pages: 10 · difficulty: med · review checklist: labels not stale; advertised availability not beyond backend; A5 referenced

---

## VOL-23 — Platform Runtime (Local Mode / Cloud Mode / Reliability)

- **Volume ID:** VOL-23 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Define WHAT documents will exist that own the two-product runtime plane — Local Mode (user-owned compute + storage, cloud inference never required) and Cloud Mode (AGI-hosted, one shared state, metered egress) as products that share one platform — and the reliability posture applied across that plane. This volume is the documentation home for the constitution's §42 (Local Mode Architecture), §43 (Cloud Mode Architecture), and the cross-plane application of §34 (Reliability). It is the top integrator of cluster C5: it composes Execution, Sync, Storage, Security, and Observability into the two named products.
- **Scope:** IN — Local Mode runtime product definition and invariants (no cloud inference required, never degraded to upsell, never silently crossed), Cloud Mode runtime product definition (one shared state across chats/artifacts/projects/memory/settings, metered-egress-only writer), GA gating posture (BLOCKED on D7/D8), cross-plane reliability/SLO ownership. OUT — the cloud control-plane _mechanics_ (gateway dispatch, credit ledgering, entitlement checks — owned by Cloud Services / Managed Control Plane Spec, another cluster — referenced); the sync state machine (owned by VOL-18); the stores (owned by VOL-19); the egress chokepoint (owned by VOL-20); durable cost (owned by VOL-21). This volume defines the _products_; the lower C5 volumes define the _mechanisms_.
- **Owner:** Principal Platform Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002/0005/0007/0008
- **Dependencies:** VOL-17, VOL-18, VOL-19, VOL-20, VOL-21 · **Prerequisites:** §34/§42/§43 frozen; all other C5 volumes' contracts exist as references; D7 (GA criteria) and D8 (Local/Cloud separation scope) decided; A14 durable-cost decision
- **Review Process:** Architecture Review (§58); Security Review (§57) for the Local/Cloud boundary invariants; founder decision gate for GA posture; ADR for any AGI-TRUST-_/AGI-PROD-_ change (§59)
- **Audience:** platform engineers, founders, AI agents, release owners
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 4 / ~235 pages across 6 books
- **Inherits / References (no duplication):** references platform-constitution Part III §23/§24 (Local/Cloud products), AGI-PROD-0002 (two-product one-platform), glossary `Cloud Mode vs Local Mode as products`, Cloud Services Spec (control plane), VOL-17/18/19/20/21 contracts, D7/D8 (owner-decision-register §3), ARCH-D14/A14 (durable cost), AGI-DOC-0003 §12 target architecture

### Books

#### BK-23.01 — Two-Product, One-Platform Runtime Model

- **Parent Volume:** VOL-23 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the runtime framing of Local Mode and Cloud Mode as products sharing the suite spine. References platform-constitution §23/§24 (does not restate product identity). Cross-refs: §42, §43, AGI-PROD-0002. Inputs: constitution product definitions. Outputs: runtime composition model. Review: Architecture + founder.
- **Chapters:**
  - **CH-23.01.01 — Two-Product Runtime Composition (references AGI-PROD-0002)** — depends-on: — · references: platform-constitution §23/§24, AGI-PROD-0002 · related features: Local/Cloud products · est pages: 12 · difficulty: med · review checklist: product identity referenced not restated; shared spine cited
  - **CH-23.01.02 — Shared Suite Spine & SSOT Reuse Across Both Products** — depends-on: CH-23.01.01 · references: §8, `packages/ui/unified-chat` · related features: suite spine · est pages: 12 · difficulty: med · review checklist: SSOT reuse; no per-product fork of contracts

#### BK-23.02 — Local Mode Runtime Plane

- **Parent Volume:** VOL-23 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the Local Mode runtime invariants. Depends on VOL-19 (local store), VOL-20 (egress). Cross-refs: §42. Inputs: local store, egress chokepoint. Outputs: Local Mode runtime contract. Review: Security mandatory.
- **Chapters:**
  - **CH-23.02.01 — Local Mode Invariants (compute+storage owned; cloud inference never required)** — depends-on: VOL-20 BK-20.01, VOL-19 BK-19.01 · references: §42, AGI-TRUST-0001, immutable values · related features: Local Mode · est pages: 14 · difficulty: high · review checklist: never-required cited; never degraded to upsell; egress referenced to VOL-20
  - **CH-23.02.02 — Local Mode Runtime Tiers & Capability Honesty** — depends-on: VOL-22 BK-22.03 · references: §12, §42 · related features: local capability gating · est pages: 12 · difficulty: med · review checklist: capability rendering referenced to VOL-22; fail-closed
  - **CH-23.02.03 — Local Desktop Chat Invoke Path (LOCAL-CHAT-NOINVOKE-01)** — depends-on: VOL-17 BK-17.01 · references: known-flaws LOCAL-CHAT-NOINVOKE-01, §12, §34 · related features: desktop local chat · est pages: 10 · difficulty: high · review checklist: broken invoke recorded honestly; silent-failure noted; target marked

#### BK-23.03 — Cloud Mode Runtime Plane

- **Parent Volume:** VOL-23 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the Cloud Mode runtime: one shared state, metered-egress-only writer. References Cloud Services Spec for control-plane mechanics. Depends on VOL-18 (sync), VOL-17 (metering execution). Cross-refs: §43, §44. Inputs: sync runtime, control plane (ref). Outputs: Cloud Mode runtime contract. Review: Architecture + Security.
- **Chapters:**
  - **CH-23.03.01 — Cloud Mode One-Shared-State Composition** — depends-on: VOL-18 BK-18.03 · references: §43, §44, glossary `shared cloud chat store` · related features: chats/artifacts/projects/memory/settings sync · est pages: 14 · difficulty: high · review checklist: shared state delivered by VOL-18; settings-last sequencing honored
  - **CH-23.03.02 — Metered Egress as Only Writer to Shared Cloud Store** — depends-on: VOL-20 BK-20.04, VOL-18 · references: §43, AGI-TRUST-0003 · related features: managed writes · est pages: 12 · difficulty: high · review checklist: Managed-only writer; metering referenced; no Local silent write
  - **CH-23.03.03 — Control-Plane Boundary (gateway/credit/entitlement — reference only)** — depends-on: Cloud Services Spec · references: §43 · related features: managed control plane · est pages: 10 · difficulty: med · review checklist: control-plane mechanics referenced not owned; boundary clean

#### BK-23.04 — Cross-Plane Reliability & SLO Ownership

- **Parent Volume:** VOL-23 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns reliability posture and SLO ownership across both products. Depends on VOL-17, VOL-21. Cross-refs: §34, §39. Inputs: execution reliability, telemetry. Outputs: cross-plane reliability contract, SLO ownership map. Review: Architecture.
- **Chapters:**
  - **CH-23.04.01 — Cross-Plane Reliability Posture** — depends-on: VOL-17 BK-17.04 · references: §34 · related features: resilience both products · est pages: 12 · difficulty: med · review checklist: degraded mode honest; fail-closed on trust
  - **CH-23.04.02 — SLO Ownership Map Across C5 Runtimes** — depends-on: VOL-21 BK-21.01 · references: §34, §39 · related features: SLOs · est pages: 12 · difficulty: med · review checklist: each SLO has one owning runtime; no overlap

#### BK-23.05 — GA Gating Posture (BLOCKED)

- **Parent Volume:** VOL-23 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the documentation of Cloud/Managed launch posture; BLOCKED on D8 (Local/Cloud separation scope) and A14 (durable cost); D7 (GA criteria) resolved 2026-06-27 — managed cloud is public alpha, open by default. Records the managed-cloud public-alpha posture honestly (env kill-switch only; controls keep pace, not gate access). Cross-refs: §43, commercial-and-launch. Review: founder gate.
- **Chapters:**
  - **CH-23.05.01 — Managed Cloud GA Criteria (BLOCKED D7)** — depends-on: VOL-21 BK-21.03 · references: register §3 D7, §43, commercial-and-launch · related features: GA gating · est pages: 12 · difficulty: high · review checklist: managed public-alpha posture honest (open by default since 2026-06-27; env kill-switch only; controls keep pace, not gate access); metering/fraud/refunds/retention/deletion named as keep-pace controls; founder decision named
  - **CH-23.05.02 — Local vs Cloud Product Separation Scope (BLOCKED D8)** — depends-on: CH-23.01.01 · references: register §3 D8, §42, §43 · related features: product separation · est pages: 12 · difficulty: high · review checklist: separation scope marked open; founder dependency named
  - **CH-23.05.03 — Durable-Metering Dependency for GA (BLOCKED A14)** — depends-on: VOL-21 BK-21.03 · references: register §9 A14, §38, §43 · related features: charge basis · est pages: 10 · difficulty: high · review checklist: non-durable cost gap blocks GA; founder/architecture dependency named

#### BK-23.06 — Surface × Trust-Mode Runtime Matrix (Enforceable)

- **Parent Volume:** VOL-23 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Owns the runtime-plane projection of the surface × trust-mode matrix as an enforceable runtime contract (which product/runtime each surface can enter). References the canonical matrix (trust-mode-surface-matrix.md / Surface-Experience-Capability Spec) rather than restating it. Cross-refs: §10, §45. Review: Architecture + Security.
- **Chapters:**
  - **CH-23.06.01 — Runtime Projection of the Surface × Trust-Mode Matrix** — depends-on: Surface/Experience/Capability Spec · references: trust-mode-surface-matrix.md, §10, AGI-SURF-0001 · related features: per-surface mode availability · est pages: 12 · difficulty: med · review checklist: matrix referenced not restated; Web cloud-only, Mobile no-BYOK, etc. honored
  - **CH-23.06.02 — Feature-Flag Governance for Mode/Product Rollout** — depends-on: CH-23.06.01 · references: §45 · related features: staged rollout · est pages: 10 · difficulty: med · review checklist: flags govern rollout; no fake availability; honest gating

#### BK-23.07 — Quota Plane: Strategic Quota vs Tactical Rate-Limit

- **Parent Volume:** VOL-23 · **Canonical Status:** planned · **Generation Order:** 7
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Closes gap #22 by owning the _product-plane_ separation of strategic quota (per-user/per-workspace entitlement budget over a billing period — a Managed-product concept) from tactical rate-limit (per-window request throttling — an execution-reliability mechanic). VOL-17 CH-17.04.03 retains and continues to own the tactical rate-limiting _policy/enforcement_ (referenced, not re-owned); this book owns how quota is defined, attributed, gated, and surfaced as part of the two-product runtime, and the clean boundary between the two so they are never conflated. Defers the entitlement _ledger_ and subscription tiers to VOL-24 BK-24.02 (referenced); defers durable usage counters to VOL-21 BK-21.03 (referenced); defers authz enforcement primitives to VOL-20 (referenced); defers capability-honest quota rendering to VOL-22 BK-22.03 (referenced). Depends on VOL-17 (tactical rate-limit), VOL-21 (durable usage). Cross-refs: §34, §43. Inputs: subscription/entitlement tiers, durable usage counters, tactical rate-limit policy. Outputs: quota-vs-rate-limit boundary contract, per-user/per-workspace quota model, quota-exhaustion fail-closed posture. Review: Architecture + Security (fail-closed) + founder (tier values referenced to source-of-truth). Traces to Architecture Constitution §34/§43, AGI-OPS-_ and AGI-PROD-_ domains. BLOCKED-shared on D1–D4 (commercial tier values) for concrete quota numbers and on A14 (durable usage) for accurate counting — names the dependency, does not decide it.
- **Chapters:**
  - **CH-23.07.01 — Quota vs Rate-Limit: Two Distinct Planes (boundary contract)** — depends-on: VOL-17 BK-17.04.03 · references: §34, §43, manifest §10 · related features: managed quotas, request throttling · est pages: 8 · difficulty: med · review checklist: strategic-vs-tactical boundary explicit; VOL-17 tactical rate-limit referenced not re-owned; no conflation
  - **CH-23.07.02 — Per-User / Per-Workspace Quota Model & Attribution** — depends-on: CH-23.07.01, VOL-21 BK-21.03 · references: §43, VOL-24 BK-24.02 (entitlements, referenced) · related features: per-user/workspace limits, subscription gating · est pages: 8 · difficulty: high · review checklist: attribution unit explicit; entitlement ledger referenced to VOL-24; durable counter referenced to VOL-21; BLOCKED-on-D1–D4 for values noted
  - **CH-23.07.03 — Quota-Exhaustion Posture & Fail-Closed Gating** — depends-on: CH-23.07.02, VOL-20 BK-20.02 · references: §34, §43 · related features: quota enforcement, upgrade gate · est pages: 7 · difficulty: high · review checklist: fail-closed on quota exceed; authz referenced to VOL-20; no silent overage; honest gating not fake availability
  - **CH-23.07.04 — Quota Surfacing & Capability-Honest Rendering (references VOL-22)** — depends-on: CH-23.07.02, VOL-22 BK-22.03 · references: §12, §43 · related features: usage meter UI, remaining-credit display · est pages: 6 · difficulty: med · review checklist: rendering derivation referenced to VOL-22; no fake remaining-quota badge; honest exhaustion state

#### BK-23.08 — Search & Semantic Indexing Plane

- **Parent Volume:** VOL-23 · **Canonical Status:** planned · **Generation Order:** 8
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Closes gap #12 by owning the platform-runtime plane for general search and semantic indexing over user content — conversation, artifact, project, and file indexes; query rewriting; ranking; and result assembly — distinct from memory retrieval. VOL-12 owns the memory-only scoring/ranking/semantic index (referenced — this book MUST NOT redefine memory retrieval); VOL-19 owns the stores being indexed (referenced); VOL-08 BK-08.09 owns the Search _capability_ definition (referenced — this book owns the _runtime plane_ that backs it, not the capability); embeddings/external-corpus RAG retrieval (gap #9) is a separate retrieval runtime (referenced, not owned here). The index honors trust boundaries: local content is indexed locally, Managed content is indexed in the Managed plane, and never silently crossed. Defers full-text store mechanics (Postgres FTS columns/migrations) to VOL-27 (referenced) and blob-content extraction to VOL-19 BK-19.04 (referenced). Depends on VOL-12 (memory index boundary), VOL-19 (indexed stores), VOL-20 (egress on source fetch). Cross-refs: §12, §22, §42, §43. Inputs: conversation/artifact/project/file corpora, query strings, ranking signals. Outputs: per-corpus index model, query-rewrite/ranking contract, trust-boundary-scoped index map, capability-honest search-result assembly. Review: Architecture + Security (trust-scoped index, source egress) + capability-honesty. Traces to Architecture Constitution §12/§42/§43, AGI-PROD-\* domain. References VOL-12 BK-12.01 (memory index, no dup), VOL-08 BK-08.09 (Search capability), existing `global-search-service.ts` as evidence.
- **Chapters:**
  - **CH-23.08.01 — Search Plane Overview & Boundary to Memory Retrieval (VOL-12)** — depends-on: VOL-12 BK-12.01 · references: §12, VOL-08 BK-08.09, `apps/web` global-search-service.ts · related features: global search · est pages: 10 · difficulty: high · review checklist: memory retrieval referenced not redefined; Search capability referenced; plane-vs-capability boundary clean
  - **CH-23.08.02 — Per-Corpus Index Model (conversations / artifacts / projects / files)** — depends-on: CH-23.08.01, VOL-19 BK-19.01 · references: §22, VOL-27 (FTS, referenced) · related features: full-text/conversation/artifact search · est pages: 12 · difficulty: high · review checklist: each corpus index single-owned; store mechanics referenced to VOL-19/27; no schema enumeration
  - **CH-23.08.03 — Trust-Boundary-Scoped Indexing (local-indexed-local; Managed-indexed-Managed)** — depends-on: CH-23.08.02, VOL-20 BK-20.01 · references: §42, §43, AGI-TRUST-0001 · related features: local vs cloud search · est pages: 10 · difficulty: high · review checklist: index never silently crosses boundary; local content never uploaded for indexing; egress referenced to VOL-20
  - **CH-23.08.04 — Query Rewriting, Ranking & Result Assembly** — depends-on: CH-23.08.02 · references: §12 · related features: ranked search results, Research backing · est pages: 10 · difficulty: high · review checklist: ranking signals grounded or UNKNOWN; no invented relevance model; deterministic where claimed
  - **CH-23.08.05 — Capability-Honest Search Availability & Empty-State Rendering (references VOL-22)** — depends-on: CH-23.08.01, VOL-22 BK-22.03 · references: §12, VOL-08 BK-08.09 · related features: search UX, full-text honesty · est pages: 8 · difficulty: med · review checklist: availability derived from real index backing; no fake full-text badge; rendering derivation referenced to VOL-22

## Part F — Engineering Planes (VOL-24…28)

## VOL-24 — Backend

- **Volume ID:** VOL-24 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Document the server-side planes of the platform — the managed control plane (`services/api-gateway`), signaling, the streaming/long-running task machinery, and background execution/offline/reliability mechanics — as the concrete behavioral elaboration of the constitution's _Cloud Services / Managed Control Plane Spec_, _Streaming & Long-Running Task Spec_, and _Background Execution, Offline & Reliability Spec_ books. This volume owns the documentation of what backend services do and how they enforce trust boundaries server-side; it does not own the HTTP contract (VOL-26) or schemas (VOL-27).
- **Scope:** IN: gateway dispatch and managed-compute proxy responsibilities, credit ledgering / entitlement / enterprise gating, stream gateway and TTFT mechanics, tool-loop step limits and resumption, cron/scheduling, durable-queue/event-bus boundary, offline-queue taxonomy and backoff/ordering, rate-limiting and idempotency discipline, WebRTC signaling. OUT: the HTTP/IPC wire contract (VOL-26), concrete DB schemas and migration runner (VOL-27), deploy/observability backends (VOL-28), the ProviderAdapter contract itself (owned by Architecture Constitution §13 / AI Runtime Spec — referenced), frontend (VOL-25).
- **Owner:** Principal Backend / Platform-Services Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits documentation-constitution (AGI-DOC-0002), requirement system (AGI-DOC-0005), cross-reference system (AGI-DOC-0007), compiler (AGI-DOC-0008).
- **Dependencies:** VOL-26 (API contract), VOL-27 (Database) · **Prerequisites:** API contract and DB schema documentation exist; constitution §30–§34, §39, §41, §43 stable.
- **Review Process:** Trust-boundary review (mandatory — touches Managed egress and AGI-TRUST-\*), security review (egress/credit/abuse), architecture review (no-invention + layering), evidence/grounding review.
- **Audience:** Backend engineers, platform-services engineers, AI agents implementing or auditing server behavior.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 4 / ~290 pages across 4 books
- **Inherits / References (no duplication):** Architecture Constitution §43 (control plane), §32/§33/§39 (streaming), §30/§31/§34/§41 (background/reliability); architecture-manifest.md §4 (execution model), §10 (infra), §11 (risks); ProviderAdapter (§13, AI Runtime Spec) referenced not restated; Managed/BYOK/Local trust modes (canonical-glossary.md); AGI-TRUST-0001..0004, AGI-SYNC-0001.

### Books

#### BK-24.01 — Managed Control Plane & Gateway Dispatch

- **Parent Volume:** VOL-24 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document the api-gateway as the single metered Managed egress and its dispatch responsibilities. Dependencies: VOL-26, VOL-27. Prerequisites: API contract stable. Cross-References: constitution §43, §13; architecture-manifest §4. Expected Inputs: services/api-gateway source. Expected Outputs: control-plane responsibility map. Review: trust-boundary + security mandatory.
- **Chapters:**
  - **CH-24.01.01 — Gateway as single metered Managed egress** — depends-on: VOL-26 · references: `services/api-gateway/src/index.ts`, constitution §43, AGI-TRUST-0003 · related features: Managed Cloud · est pages: 16 · difficulty: high · review checklist: evidence-cited; trust-boundary correct; no invented routes
  - **CH-24.01.02 — Dispatch flow and ProviderAdapter boundary** — depends-on: CH-24.01.01 · references: `services/api-gateway/src/routes`, constitution §13 (ProviderAdapter — referenced) · related features: provider routing · est pages: 18 · difficulty: high · review checklist: references ProviderAdapter not restated; no invented APIs
  - **CH-24.01.03 — Authenticated-user resolution & entitlement check** — depends-on: VOL-27 · references: `services/api-gateway/src/authenticated-user.ts`, Clerk (architecture-manifest §9) · related features: subscriptions/gating · est pages: 14 · difficulty: med · review checklist: evidence-cited; trust-boundary correct
  - **CH-24.01.04 — Asymmetry: cloud-advertised vs gateway-served providers (real state)** — depends-on: CH-24.01.02 · references: ARCH-D5, architecture-manifest §5 · related features: capability honesty · est pages: 12 · difficulty: high · review checklist: marks Target/UNKNOWN where undecided; capability-honesty correct
  - **CH-24.01.05 — Signaling service responsibilities (WebRTC pairing)** — depends-on: none · references: `services/signaling-server`, architecture-manifest §1 · related features: device pairing · est pages: 10 · difficulty: med · review checklist: evidence-cited; no invented behavior

#### BK-24.02 — Credit Ledgering, Entitlements & Enterprise Gating

- **Parent Volume:** VOL-24 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document the managed credit/entitlement plane gating Managed cloud. Dependencies: VOL-27. Prerequisites: billing schema documented. Cross-References: constitution §43; commercial-and-launch.md. Expected Inputs: control-plane + billing routes. Expected Outputs: ledger/entitlement model (Target-marked where pre-GA). Review: trust-boundary + security mandatory.
- **Chapters:**
  - **CH-24.02.01 — Credit ledger model and reserve/refund lifecycle** — depends-on: VOL-27 · references: `apps/web/db/neon/0004_token_credits.sql`, `0033`, constitution §39 · related features: managed credits · est pages: 16 · difficulty: high · review checklist: durable-vs-ephemeral state honest; cites ARCH-D14
  - **CH-24.02.02 — Entitlement and subscription gating** — depends-on: CH-24.02.01 · references: `apps/web/app/api/billing`, `0003_subscriptions.sql` · related features: plan tiers · est pages: 14 · difficulty: med · review checklist: pricing not restated (cite source-of-truth); no invented tiers
  - **CH-24.02.03 — Enterprise & compliance control-plane gating** — depends-on: CH-24.02.01 · references: `packages/contracts/compliance`, AGI-COMP-0001, `0015_organizations.sql` · related features: enterprise · est pages: 14 · difficulty: high · review checklist: Target-marked; evidence-cited
  - **CH-24.02.04 — Managed Cloud launch posture (D7 resolved record)** — depends-on: CH-24.02.01 · references: D7 (owner-decision-register §3), commercial-and-launch.md · related features: managed public alpha · est pages: 10 · difficulty: med · review checklist: records D7 resolution (public alpha, open by default since 2026-06-27; env kill-switch only); no aspiration as fact

#### BK-24.03 — Streaming & Long-Running Tasks (Backend)

- **Parent Volume:** VOL-24 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document the server-side stream gateway and long-running task mechanics. Dependencies: VOL-26. Prerequisites: StreamChunk variants (constitution §13) referenced. Cross-References: constitution §32, §33, §39. Expected Inputs: gateway streaming routes, provider-runtime. Expected Outputs: stream/resumption model. Review: architecture + security.
- **Chapters:**
  - **CH-24.03.01 — Stream gateway and TTFT SLO mechanics** — depends-on: VOL-26 · references: `services/api-gateway/src/routes`, `packages/ai/provider-runtime`, constitution §32 · related features: streaming chat · est pages: 16 · difficulty: high · review checklist: 8 StreamChunk variants referenced not restated
  - **CH-24.03.02 — Tool-loop step limits and watchdog** — depends-on: CH-24.03.01 · references: `packages/ai/provider-runtime` (90s watchdog, architecture-manifest §4), constitution §33 · related features: agent loop · est pages: 14 · difficulty: high · review checklist: evidence-cited; no invented limits
  - **CH-24.03.03 — Resumption protocol and credit reserve/refund reconciliation** — depends-on: CH-24.03.01, CH-24.02.01 · references: constitution §39, ARCH-D14 · related features: long-running tasks · est pages: 14 · difficulty: high · review checklist: durable-state honesty; cites blocker

#### BK-24.04 — Background Execution, Offline & Reliability

- **Parent Volume:** VOL-24 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document cron/scheduling, durable-queue boundary, offline-queue, rate-limiting, idempotency. Dependencies: VOL-26, VOL-27. Prerequisites: scheduling schema documented. Cross-References: constitution §30, §31, §34, §41. Expected Inputs: cron/schedule routes, scheduling migration. Expected Outputs: reliability contract. Review: architecture + reliability.
- **Chapters:**
  - **CH-24.04.01 — Cron and scheduling contract** — depends-on: VOL-27 · references: `apps/web/app/api/cron`, `apps/web/app/api/schedules`, `0009_scheduling.sql`, constitution §34 · related features: Dispatch/Scheduled · est pages: 14 · difficulty: med · review checklist: evidence-cited; no invented schedulers
  - **CH-24.04.02 — Durable queue / event-bus boundary (current vs target)** — depends-on: CH-24.04.01 · references: constitution §41, Upstash (architecture-manifest §10) · related features: background jobs · est pages: 12 · difficulty: high · review checklist: Current/Target separated; Target-marked
  - **CH-24.04.03 — Offline-queue operation taxonomy, backoff and ordering** — depends-on: none · references: constitution §31, AGI-SYNC-0001, ARCH-D10 (sync ordering skip) · related features: offline sync · est pages: 14 · difficulty: high · review checklist: cites ARCH-D10; ordering honesty
  - **CH-24.04.04 — Rate-limiting policy and idempotency-key discipline** — depends-on: CH-24.04.02 · references: constitution §30, §41 · related features: abuse controls · est pages: 12 · difficulty: med · review checklist: evidence-cited; no invented keys

---

#### BK-24.05 — Notification & Push Delivery Service

- **Parent Volume:** VOL-24 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Closes gap #11 by owning the backend notification/push _delivery service_ — a target layer not implemented by the current api-gateway push-token and owner-scoped approval endpoints. The former process-local approval router was cut because it had no delivery consumer or durable roster source. Documents channel adapters (FCM/APNs for mobile, web push, email), token registration/lifecycle, fan-out, per-channel retry/dead-letter, and trust-boundary handling of notification payloads. Per the Execution-mechanics Single-Owner Resolution, the _trigger_ behavior (when a background job emits a notification event) is owned by VOL-17 (referenced) and the queue/event-bus that carries delivery is owned at the boundary by VOL-17 BK-17.03.03 and realized as infra by VOL-28 BK-28.04 (referenced); this book owns the backend _service composition_ that consumes those events and delivers them. Clerk owns push-token identity association (referenced); the HTTP endpoint shape is owned by VOL-26 (referenced); device-token persistence schema is owned by VOL-27 (referenced). Depends on VOL-26 (token endpoints), VOL-27 (token store), VOL-17 (delivery events). Cross-refs: §30, §31, §43. Inputs: notification events from background execution, registered device tokens, channel provider configs. Outputs: notification-delivery service responsibility map, channel-adapter contract, delivery retry/DLQ posture, payload trust-boundary rules. Review: trust-boundary + security (payload redaction, BYOK no-leak in notifications) mandatory. Traces to Architecture Constitution §30/§31/§43, AGI-OPS-\* domain. Evidence: api-gateway push-token and owner-scoped approval endpoints, plus the gateway approval-routing cut in `docs/adr/wire-or-cut.md`. No `services/notification-service` exists today — current-vs-target marked.
- **Chapters:**
  - **CH-24.05.01 — Notification Delivery Service Boundary (current absence vs target)** — depends-on: VOL-17 BK-17.03 · references: §31, api-gateway push-token/owner-approval endpoints, gateway approval-routing cut ADR · related features: agent-complete alerts, approval routing · est pages: 8 · difficulty: med · review checklist: current absence honest; no `services/notification-service` claimed as existing; trigger behavior referenced to VOL-17
  - **CH-24.05.02 — Channel Adapters (FCM / APNs / Web Push / Email)** — depends-on: CH-24.05.01 · references: §43, Clerk push tokens (referenced) · related features: mobile/web/email delivery · est pages: 12 · difficulty: high · review checklist: per-channel adapter grounded or Target-marked; no invented provider behavior
  - **CH-24.05.03 — Device-Token Registration & Lifecycle (references VOL-26/VOL-27)** — depends-on: CH-24.05.01, VOL-26 BK-26.01, VOL-27 · references: §43, push-token endpoint · related features: token registration · est pages: 8 · difficulty: med · review checklist: endpoint shape referenced to VOL-26; token store referenced to VOL-27; stale-token reaping defined
  - **CH-24.05.04 — Fan-Out, Per-Channel Retry & Dead-Letter Handling** — depends-on: CH-24.05.02, VOL-17 BK-17.03.04 · references: §30, §31, VOL-28 BK-28.04 (event-bus plane, referenced) · related features: reliable delivery · est pages: 10 · difficulty: high · review checklist: at-least-once referenced to VOL-17/VOL-28; DLQ defined; no silent drop
  - **CH-24.05.05 — Notification Payload Trust-Boundary & Redaction (references VOL-20)** — depends-on: CH-24.05.02, VOL-20 BK-20.03 · references: §23, AGI-TRUST-0001 · related features: payload privacy · est pages: 8 · difficulty: high · review checklist: payload through privacy predicate; BYOK/local content never in cloud-push payload; redaction referenced to VOL-20

#### BK-24.06 — Realtime Transport, Presence & Signaling

- **Parent Volume:** VOL-24 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Closes gap #44 by owning the backend realtime-transport plane that the existing 10pp WebRTC-pairing stub (CH-24.01.05) only partially covers — WebSocket/transport contract, presence, cursor/collaboration channels, message ordering, backpressure, and reconnection — beyond device-pairing signaling alone. CH-24.01.05 retains ownership of the _signaling service for WebRTC pairing_ (referenced); this book owns the broader realtime transport/presence contract that collaboration depends on. The collaboration _sync_ state machine (delta/conflict) stays owned by VOL-18 (referenced — realtime transport carries deltas but does not re-own conflict resolution); realtime auth/identity gating is owned by VOL-20 (referenced); realtime reliability-UX is owned by VOL-22 (referenced); the WS transport _parity_ row is referenced to VOL-17 BK-17.01.05 (not re-owned). Depends on VOL-18 (sync deltas carried), VOL-20 (connection authz), VOL-22 (reconnection UX). Cross-refs: §43, §44. Inputs: signaling-server, WebSocket connections, presence/cursor events, sync delta feed. Outputs: realtime transport contract, presence/cursor model, ordering/backpressure rules, reconnection protocol. Review: Architecture + Security (connection authz, trust-scoped channels) mandatory. Traces to Architecture Constitution §43/§44, AGI-SYNC-\* domain. Evidence: `services/signaling-server`. BLOCKED-shared on the collaboration-presence product scope (founder-scoped) — names the dependency, does not decide it.
- **Chapters:**
  - **CH-24.06.01 — Realtime Transport Boundary & Relationship to Signaling (CH-24.01.05)** — depends-on: VOL-24 BK-24.01.05 · references: §43, §44, `services/signaling-server` · related features: device pairing, collaboration transport · est pages: 8 · difficulty: med · review checklist: WebRTC-pairing signaling referenced not re-owned; transport-vs-signaling boundary explicit
  - **CH-24.06.02 — WebSocket Connection Contract, Auth & Trust-Scoped Channels** — depends-on: CH-24.06.01, VOL-20 BK-20.02 · references: §43, AGI-TRUST-0003 · related features: realtime auth · est pages: 10 · difficulty: high · review checklist: connection authz referenced to VOL-20; channels trust-scoped (Managed-only); no cross-tenant channel leak
  - **CH-24.06.03 — Presence & Cursor/Collaboration Channels** — depends-on: CH-24.06.02 · references: §44, VOL-18 (sync, referenced) · related features: presence, live cursors · est pages: 10 · difficulty: high · review checklist: presence ephemeral; collaboration delta carried but conflict resolution referenced to VOL-18 not re-owned
  - **CH-24.06.04 — Message Ordering, Backpressure & Delivery Guarantees** — depends-on: CH-24.06.02 · references: §44, VOL-18 BK-18.03 (frontier ordering, referenced) · related features: ordered realtime · est pages: 10 · difficulty: high · review checklist: ordering guarantee explicit; backpressure fail-safe; frontier ordering referenced to VOL-18
  - **CH-24.06.05 — Reconnection, Session Resume & Realtime Reliability-UX (references VOL-22)** — depends-on: CH-24.06.02, VOL-22 BK-22.01 · references: §34, §44 · related features: reconnect, degraded realtime · est pages: 7 · difficulty: med · review checklist: reconnection idempotent; missed-message catch-up defined; reliability-UX referenced to VOL-22

#### BK-24.07 — Application HTTP Caching & Request Deduplication

- **Parent Volume:** VOL-24 · **Canonical Status:** planned · **Generation Order:** 7
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Closes gap #38 by owning the backend application-level HTTP caching plane — response caching, in-flight request deduplication, and cache invalidation — distinct from the LLM prompt-cache (owned by AI Runtime, referenced) and from the UX-perceived caching surface (owned by VOL-22 BK-22.03, referenced). The HTTP cache-header _contract_ itself (Cache-Control/ETag/Vary semantics on the response envelope) is owned by VOL-26 (referenced — this book documents the backend service that _applies and honors_ those headers, not the header contract); CDN/edge-cache topology is owned by VOL-28 (referenced). Trust-boundary correctness is paramount: per-user/Managed responses must never be cached cross-tenant or served to the wrong trust mode (egress predicate referenced to VOL-20). Depends on VOL-26 (cache-header contract), VOL-20 (cache-key trust scoping). Cross-refs: §28, §39. Inputs: route responses, cache-key derivation, invalidation events. Outputs: response-cache service contract, request-dedup model, invalidation/tagging strategy, trust-scoped cache-key rules. Review: Architecture + Security (no cross-tenant cache leak) mandatory. Traces to Architecture Constitution §28/§39, AGI-OPS-\* domain. Improves performance/cost; not a launch blocker (criticality medium). References VOL-26 BK-26.02/26.03 (envelope/headers), VOL-22 BK-22.03 (caching UX), VOL-28 (CDN) — no re-ownership.
- **Chapters:**
  - **CH-24.07.01 — Application Cache Plane Boundary (vs prompt-cache, vs CDN, vs UX cache)** — depends-on: VOL-26 BK-26.03 · references: §28, §39, VOL-22 BK-22.03, AI Runtime prompt-cache (referenced) · related features: response caching · est pages: 6 · difficulty: med · review checklist: four cache layers disambiguated; prompt-cache and CDN referenced not re-owned
  - **CH-24.07.02 — Response Cache & In-Flight Request Deduplication** — depends-on: CH-24.07.01 · references: §39 · related features: request dedup, response cache · est pages: 6 · difficulty: med · review checklist: dedup window precise; no stale-serve on mutation; grounded or Target-marked
  - **CH-24.07.03 — Trust-Scoped Cache Keys & Cross-Tenant Isolation (references VOL-20)** — depends-on: CH-24.07.02, VOL-20 BK-20.01 · references: §23, AGI-TRUST-0003 · related features: per-user cache safety · est pages: 5 · difficulty: high · review checklist: cache key includes trust/identity scope; no cross-tenant or cross-trust-mode cache leak; egress predicate referenced to VOL-20
  - **CH-24.07.04 — Cache Invalidation, Tagging & Cache-Header Application (references VOL-26)** — depends-on: CH-24.07.02, VOL-26 BK-26.02 · references: §28, VOL-28 (CDN headers, referenced) · related features: invalidation · est pages: 5 · difficulty: med · review checklist: invalidation converges; header contract referenced to VOL-26 not redefined; CDN topology referenced to VOL-28

## VOL-25 — Frontend

- **Volume ID:** VOL-25 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Document the client-rendering plane shared across Surfaces — per-surface UI shells, the shared UI package contracts (`packages/ui/ui`, `packages/platform/artifacts`, `packages/ui/design-tokens`), the shared chat-core reuse mandate (and its current RN-safe gap, A7), and how the view layer derives capability-honest pickers/badges from real backend capability. This volume is the _Surface / Shared UI Spec_ content named by constitution Appendix A7. It documents how Surfaces render and bind to runtimes; it does NOT own the Experience primitive (Surface/Experience/Capability Spec — referenced) nor the trust-mode matrix (Platform Constitution — referenced).
- **Scope:** IN: surface-shell rendering responsibilities, shared UI/state/token package contracts, RN-safe shared chat core target and current gap, view-layer capability-honesty rendering, data-fetching binding to the API contract, accessibility/render-state conventions. OUT: the Experience primitive and runtime-tier dispatch semantics (owned elsewhere — referenced), per-surface product behavior (Platforms cluster), the HTTP contract (VOL-26), backend (VOL-24), provider/model logic (Architecture Constitution §13/§14 — referenced).
- **Owner:** Principal Frontend / Shared-UI Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002, 0005, 0007, 0008.
- **Dependencies:** VOL-26 (API contract) · **Prerequisites:** API contract documented; constitution §9, §12, §48 stable; Experience primitive decision (ARCH-D6) noted as blocker.
- **Review Process:** Architecture review (layering, shared-packages reuse mandate), capability-honesty review (no fake badges/availability), accessibility review, evidence/grounding review.
- **Audience:** Frontend engineers across surfaces, shared-UI package maintainers, AI agents building UI.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / med / 3 / ~210 pages across 4 books
- **Inherits / References (no duplication):** Architecture Constitution §9 (surface composition), §12 (Capability Honesty — referenced), §48 (export surfaces); canonical-glossary.md (Surface, Capability); evaluateModelEnvironment (capability honesty pattern — referenced); ARCH-D6, ARCH-D7 (open gaps); architecture-manifest.md §1 (packages list).

### Books

#### BK-25.01 — Surface Shells & Rendering Topology

- **Parent Volume:** VOL-25 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document how each surface's UI shell is structured and what is shared vs surface-local. Dependencies: VOL-26. Prerequisites: surface set canonical (AGI-SURF-0001). Cross-References: constitution §9, §10. Expected Inputs: apps/\* UI entry points. Expected Outputs: shell topology map. Review: architecture + accessibility.
- **Chapters:**
  - **CH-25.01.01 — Surface shell responsibilities and the thin-surface rule** — depends-on: none · references: constitution §9 (AC layering), AGI-SURF-0001, `apps/web/src/ui` · related features: all experiences · est pages: 14 · difficulty: med · review checklist: thin-surface rule honored; no Experience primitive restatement
  - **CH-25.01.02 — Web shell (Next.js 16, proxy.ts)** — depends-on: CH-25.01.01 · references: `apps/web/proxy.ts`, `apps/web/app` · related features: web surface · est pages: 14 · difficulty: med · review checklist: proxy.ts not renamed; evidence-cited
  - **CH-25.01.03 — Desktop (Tauri) and mobile (Expo/RN) shell binding** — depends-on: CH-25.01.01 · references: `apps/desktop/src/App.tsx`, `apps/mobile` · related features: desktop/mobile · est pages: 14 · difficulty: high · review checklist: trust-mode per surface correct; no invented bridges
  - **CH-25.01.04 — Developer-surface shells (CLI/VSCode/Chrome) view scope** — depends-on: CH-25.01.01 · references: `apps/cli`, `apps/extension`, `apps/extension-vscode` · related features: dev surfaces · est pages: 12 · difficulty: med · review checklist: developer-session sync boundary correct

#### BK-25.02 — Shared UI, State & Design-Token Contracts

- **Parent Volume:** VOL-25 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document shared UI/state/token packages and the reuse-not-rewrite mandate. Dependencies: none. Prerequisites: package export surfaces (constitution §48). Cross-References: constitution §48; architecture-manifest §1. Expected Inputs: packages/ui/ui, packages/platform/artifacts, packages/ui/design-tokens. Expected Outputs: shared-package contract map. Review: architecture (export boundaries).
- **Chapters:**
  - **CH-25.02.01 — packages/ui/ui export-surface contract** — depends-on: none · references: `packages/ui/ui`, constitution §48, AGI-ARCH-0002 · related features: shared components · est pages: 14 · difficulty: med · review checklist: export contract evidence-cited; deep-import boundary noted (A17)
  - **CH-25.02.02 — packages/platform/artifacts state contracts** — depends-on: CH-25.02.01 · references: `packages/platform/artifacts` (the former `packages/stores` facade was deleted at M8, 2026-07-15) · related features: client state · est pages: 12 · difficulty: med · review checklist: no UI->app import; evidence-cited
  - **CH-25.02.03 — Design tokens and theming** — depends-on: none · references: `packages/ui/design-tokens` · related features: theming · est pages: 10 · difficulty: low · review checklist: tokens are SSOT; no hardcoded values restated
  - **CH-25.02.04 — Reuse-not-rewrite mandate across surfaces** — depends-on: CH-25.02.01 · references: architecture-manifest §1, constitution §9 · related features: cross-surface reuse · est pages: 12 · difficulty: med · review checklist: mandate stated; no duplication

#### BK-25.03 — Shared Chat Core & RN-Safe Reuse

- **Parent Volume:** VOL-25 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document the shared chat-core reuse target and the current React-DOM coupling gap (A7). Dependencies: VOL-26. Prerequisites: ARCH-D7 decision noted as blocker. Cross-References: constitution §9, §48, Appendix A7. Expected Inputs: packages/ui/unified-chat. Expected Outputs: current-vs-target chat-core contract. Review: architecture (blocked record).
- **Chapters:**
  - **CH-25.03.01 — unified-chat suite spine at the view layer** — depends-on: VOL-26 · references: `packages/ui/unified-chat` (suite spine — canonical-glossary), constitution §9 · related features: AGI Chat · est pages: 14 · difficulty: high · review checklist: suite spine referenced; no behavior invented
  - **CH-25.03.02 — RN-safe shared chat core: current coupling and target (blocked)** — depends-on: CH-25.03.01 · references: ARCH-D7, Appendix A7, `apps/mobile` (0 consumers) · related features: mobile chat · est pages: 14 · difficulty: high · review checklist: records blocker ARCH-D7; Current/Target separated
  - **CH-25.03.03 — Streaming render state and chunk consumption (view side)** — depends-on: CH-25.03.01 · references: constitution §13 (StreamChunk — referenced), VOL-24 BK-24.03 · related features: streaming UI · est pages: 12 · difficulty: med · review checklist: chunk variants referenced not restated

#### BK-25.04 — Capability-Honest Rendering & Data Binding

- **Parent Volume:** VOL-25 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document how pickers/badges/availability are derived from real backend capability and how the view binds to the API contract. Dependencies: VOL-26. Prerequisites: capability-honesty concept (§12) referenced. Cross-References: constitution §12, §28. Expected Inputs: model-environment evaluation, API client. Expected Outputs: rendering-derivation contract. Review: capability-honesty mandatory.
- **Chapters:**
  - **CH-25.04.01 — Pickers/allowlists/badges derived from real capability** — depends-on: none · references: constitution §12 (Capability Honesty — referenced), evaluateModelEnvironment · related features: model picker · est pages: 14 · difficulty: high · review checklist: no fake availability badges; capability-honesty correct
  - **CH-25.04.02 — Trust-mode-aware view gating (no fake controls)** — depends-on: CH-25.04.01 · references: trust-mode-surface-matrix.md, AGI-TRUST-0001 · related features: mode switching UI · est pages: 12 · difficulty: high · review checklist: trust-boundary correct; no dead controls
  - **CH-25.04.03 — Client data-fetching binding to the API contract** — depends-on: VOL-26 · references: VOL-26 BK-26.01, `apps/web/app/api` (consumed) · related features: data fetching · est pages: 12 · difficulty: med · review checklist: binds to API contract not redefining it
  - **CH-25.04.04 — Accessibility and render-state conventions** — depends-on: CH-25.04.01 · references: `apps/web/app/accessibility` · related features: a11y · est pages: 10 · difficulty: med · review checklist: evidence-cited; WCAG referenced

---

#### BK-25.05 — Mobile RN-Safe Shared-UI Tier (ARCH-D7 — blocked)

- **Parent Volume:** VOL-25 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: assign an owner to the mobile-safe shared-UI authorship tier beyond the chat core — the React-Native-renderable presentation primitives that `apps/mobile` must consume so reuse-not-rewrite extends to mobile. Closes the orphaned ownership named by VOL-06 BK-06.03 (RN-safe gap) and elaborated for chat by VOL-25 BK-25.03 (chat core only). Owns the broader mobile-safe primitive tier; references BK-25.03 for the chat-core slice and does not restate it. BLOCKED on ARCH-D7 (no RN-safe shared tier; `packages/ui/ui` is React-DOM-coupled with 0 mobile consumers); documented as Target per Doc-Constitution Article II until ARCH-D7 converges or is ADR-justified. Dependencies: VOL-25 BK-25.02 (shared-UI export contract), VOL-06 BK-06.03 (mobile surface). Prerequisites: ARCH-D7 decision noted as blocker. Cross-References: constitution §9, §11, §48, Appendix A7. Expected Inputs: `packages/ui/ui`, `apps/mobile`, ARCH-D7. Expected Outputs: current-vs-target mobile-safe UI ownership contract. Review: architecture (blocked record), reuse-mandate, capability-honesty.
- **Chapters:**
  - **CH-25.05.01 — Mobile-safe shared-UI authorship ownership boundary** — depends-on: BK-25.02 · references: constitution §11 (no re-implementation), `packages/ui/ui` export surface, BK-25.03 (chat-core slice — referenced) · related features: mobile reuse · est pages: 14 · difficulty: high · review checklist: assigns the orphaned RN-safe owner; references chat core not restating it; reuse-not-rewrite cited
  - **CH-25.05.02 — Current React-DOM coupling and 0-mobile-consumer state (honest)** — depends-on: CH-25.05.01 · references: ARCH-D7, Appendix A7, `apps/mobile` (0 `packages/ui/ui` consumers), VOL-06 BK-06.03 CH-06.03.04 · related features: mobile gap · est pages: 14 · difficulty: high · review checklist: Current state honest; React-DOM coupling cited as real; no fabricated mobile parity
  - **CH-25.05.03 — RN-safe primitive tier target shape (Target — ARCH-D7)** — depends-on: CH-25.05.01 · references: ARCH-D7, owner-decision-register ARCH-D7, constitution §9, §48 · related features: cross-platform primitives · est pages: 24 · difficulty: extreme · review checklist: marked Target/blocked on ARCH-D7; no Current claim; primitive tier framed not implemented
  - **CH-25.05.04 — Reuse-mandate enforcement and mobile parity traceability** — depends-on: CH-25.05.01, CH-25.05.03 · references: VOL-06 BK-06.08 (parity rules — referenced), shared-packages reuse principle, AGI-SURF-0001 · related features: mobile parity · est pages: 18 · difficulty: high · review checklist: enforcement references VOL-06 parity not duplicating; mobile-feature parity traced to ownership; capability-honesty

#### BK-25.06 — Onboarding, Settings, Auth & Session UX (Cross-Surface Enumeration)

- **Parent Volume:** VOL-25 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: enumerate the onboarding, settings, authentication, and session UX surfaces across the seven build targets — the view-layer flows the surface shells (VOL-06) and capability books leave un-enumerated. Documents what each surface's `features/{settings,auth,onboarding}` renders, where the flows are shared vs surface-local, and how each binds to identity (Clerk) and the trust-mode matrix without re-owning either. Owns the cross-surface UX enumeration; references VOL-20 BK-20.02 (identity/auth contract), VOL-06 per-surface shells, and the consent-gate UX (VOL-20 CH-20.03.01) rather than restating mechanics. Dependencies: VOL-25 BK-25.01 (surface shells), VOL-06 (per-surface presentation), VOL-26 (API binding). Prerequisites: surface set canonical (AGI-SURF-0001); identity contract drafted. Cross-References: constitution §9, §12; trust-mode-surface-matrix.md. Expected Inputs: `apps/*/src/features/{settings,auth,onboarding}`. Expected Outputs: cross-surface onboarding/settings/auth/session UX map. Review: architecture, capability-honesty (no fake auth controls), trust-boundary, accessibility.
- **Chapters:**
  - **CH-25.06.01 — Auth and session UX across seven surfaces (binding to identity)** — depends-on: BK-25.01 · references: VOL-20 BK-20.02 (identity/auth — referenced), `apps/web/src/features/auth`, `apps/desktop/src/features/auth`, `apps/extension-vscode/.../account-auth` · related features: auth · est pages: 18 · difficulty: high · review checklist: binds to identity contract not re-owning it; per-surface session UX honest; no dead auth controls
  - **CH-25.06.02 — Onboarding flow UX (web/desktop/mobile) and developer-surface entry** — depends-on: CH-25.06.01 · references: `apps/desktop/src/features/onboarding`, `apps/mobile/src/features/onboarding`, AGI-SURF-0001 · related features: onboarding · est pages: 14 · difficulty: med · review checklist: per-surface onboarding enumerated; developer-surface entry distinguished; evidence-cited
  - **CH-25.06.03 — Settings UX surface and shared-vs-surface-local partition** — depends-on: CH-25.06.01 · references: `apps/*/src/features/settings`, BK-25.02 (shared UI — referenced), AGI-SYNC-0001 (settings sync — referenced) · related features: settings · est pages: 18 · difficulty: med · review checklist: shared-vs-local partition cited; settings sync referenced not restated; reuse-not-rewrite
  - **CH-25.06.04 — Trust-mode-aware settings and consent-gate UX entry (referenced)** — depends-on: CH-25.06.03 · references: VOL-20 CH-20.03.01 (consent gate — referenced), trust-mode-surface-matrix.md, AGI-TRUST-0001..0004 · related features: trust settings · est pages: 16 · difficulty: high · review checklist: trust-boundary correct; consent flow referenced not duplicated; no silent cross-boundary
  - **CH-25.06.05 — Onboarding/settings/auth current-state divergences (honest)** — depends-on: AGI-DOC-0003 §11 · references: known-flaws.md, per-surface feature gaps (CLI/Chrome lacking enumerated settings UX) · related features: divergence ledger · est pages: 14 · difficulty: med · review checklist: real per-surface divergences cited; references ledger not duplicated; Current vs Target separated

#### BK-25.07 — Internationalization & Localization Strategy

- **Parent Volume:** VOL-25 · **Canonical Status:** planned · **Generation Order:** 7
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: own the i18n/localization content strategy across surfaces — message-catalog ownership, locale-detection and language-preference persistence, surface i18n binding, and RTL/format conventions. Documents the i18n CONTENT plane only; the i18n/a11y review STAGES that gate VOL-06/25 are owned by VOL-01 BK-01.03 (the patch agent) and are referenced, never added here. Records honest current state: nascent `apps/web/app/i18n` and `apps/desktop/src/i18n` exist with no shared catalog SSOT or mobile/CLI coverage. Language roster scope is a founder decision (left as a decision point), not decided here. Dependencies: VOL-25 BK-25.02 (shared UI), VOL-23 (settings/preference sync). Prerequisites: surface set canonical; language roster decision noted. Cross-References: constitution §9, §12; AGI-SYNC-0001 (preference persistence — referenced); VOL-01 BK-01.03 (i18n review stage — referenced). Expected Inputs: `apps/web/app/i18n`, `apps/desktop/src/i18n`. Expected Outputs: i18n content strategy + message-catalog ownership contract. Review: architecture, accessibility cross-ref, capability-honesty (no fake locale coverage).
  - **Chapters:**
  - **CH-25.07.01 — Message-catalog ownership and key-management SSOT** — depends-on: BK-25.02 · references: `apps/web/app/i18n`, `apps/desktop/src/i18n`, constitution §48 (export surfaces) · related features: i18n catalog · est pages: 14 · difficulty: high · review checklist: single catalog SSOT framed; no per-surface key fork; honest current fragmentation cited
  - **CH-25.07.02 — Locale detection and language-preference persistence** — depends-on: CH-25.07.01 · references: AGI-SYNC-0001 (preference sync — referenced), VOL-23 settings plane, trust-mode-surface-matrix.md · related features: locale preference · est pages: 12 · difficulty: med · review checklist: preference persistence references settings sync not re-owning; trust-boundary for synced preference
  - **CH-25.07.03 — Surface i18n binding (web/desktop/mobile + developer surfaces)** — depends-on: CH-25.07.01 · references: BK-25.01 (surface shells — referenced), `apps/*` i18n entry points, AGI-SURF-0001 · related features: per-surface i18n · est pages: 14 · difficulty: med · review checklist: per-surface binding cited; developer-surface scope distinguished; evidence-cited
  - **CH-25.07.04 — RTL, pluralization and locale-format conventions** — depends-on: CH-25.07.01 · references: ICU/CLDR conventions (referenced), CH-25.04.04 (a11y conventions — referenced) · related features: formatting · est pages: 12 · difficulty: med · review checklist: conventions referenced not reinvented; a11y cross-ref; no hardcoded format restatement
  - **CH-25.07.05 — i18n current-vs-target and review-stage reference (no stage added)** — depends-on: AGI-DOC-0003 §11 · references: VOL-01 BK-01.03 (i18n/a11y review STAGE — referenced/owner is patch agent), known-flaws.md, founder language-roster decision · related features: i18n rollout · est pages: 8 · difficulty: med · review checklist: review stage referenced not added; Current/Target separated; language roster left as founder decision

#### BK-25.08 — Design-System Governance Plane

- **Parent Volume:** VOL-25 · **Canonical Status:** planned · **Generation Order:** 8
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: own the design-system governance plane that no book currently owns — token governance and versioning, the Figma↔code source-of-truth direction, and accountability for the accessibility primitives. Closes the orphaned ownership where `packages/ui/design-tokens` is treated as a package with no governance owner. Owns governance (lifecycle, change-control, versioning, a11y-primitive accountability); references VOL-25 BK-25.02 (the design-token export _contract_) and VOL-25 BK-25.04 CH-25.04.04 (a11y render-state conventions) — does NOT restate the token contract or re-own a11y conventions. Dependencies: VOL-25 BK-25.02 (token contracts), VOL-31 (release/versioning for token version cadence). Prerequisites: token export surface stable (constitution §48). Cross-References: constitution §9, §11, §48; architecture-manifest §1. Expected Inputs: `packages/ui/design-tokens`, `packages/ui/ui`. Expected Outputs: design-system governance + token-versioning contract. Review: architecture (governance ownership), accessibility (primitive accountability), reuse-mandate.
- **Chapters:**
  - **CH-25.08.01 — Token governance ownership and the design-system change-control plane** — depends-on: BK-25.02 · references: `packages/ui/design-tokens`, BK-25.02 CH-25.02.03 (token contract — referenced), constitution §11 · related features: design tokens · est pages: 14 · difficulty: high · review checklist: assigns the orphaned governance owner; references token contract not restating it; SSOT framed
  - **CH-25.08.02 — Token versioning, change cadence and breaking-change policy** — depends-on: CH-25.08.01 · references: VOL-31 BK-31.01 (versioning/cadence — referenced), `packages/ui/design-tokens` · related features: token versioning · est pages: 12 · difficulty: med · review checklist: versioning references release engineering not re-owning; breaking-change policy framed; evidence-cited
  - **CH-25.08.03 — Figma↔code direction and token source-of-truth flow** — depends-on: CH-25.08.01 · references: `packages/ui/design-tokens` source flow, design-tooling pipeline · related features: design handoff · est pages: 12 · difficulty: med · review checklist: SSOT direction stated; no fabricated tooling; honest current state of any manual sync
  - **CH-25.08.04 — Accessibility-primitive accountability across the design system** — depends-on: CH-25.08.01 · references: VOL-25 CH-25.04.04 (a11y conventions — referenced), `packages/ui/ui` a11y primitives, VOL-01 BK-01.03 (a11y review stage — referenced) · related features: a11y primitives · est pages: 12 · difficulty: high · review checklist: a11y accountability assigned; references conventions and review stage not duplicating; no fake a11y claims

## VOL-26 — API

- **Volume ID:** VOL-26 · **Generation Priority:** P0 · **Difficulty:** high
- **Purpose:** Elaborate the constitution's _API Specification_ book into the concrete documentation of the platform's HTTP and IPC contract: route-handler conventions, the error-envelope and safe-to-expose code allowlist, request-id propagation, `/v1` versioning, and host-based rewrites. Principles live in the Architecture Constitution (§28 API Design Principles, §35); this volume owns the concrete contract that surfaces and backend services both conform to. It defines WHAT the API contract documents are and their dependencies — never inventing routes, payloads, or status codes beyond what the repo proves.
- **Scope:** IN: route-handler conventions, error-envelope schema and allowlist documentation, request-id propagation, versioning under `/v1`, host-based rewrites (proxy.ts), public-vs-internal API partition, IPC contract for desktop/CLI. OUT: API Design _principles_ (constitution §28 — referenced), the persisted schemas behind payloads (VOL-27), provider wire shapes (AI Runtime Spec — referenced), backend dispatch internals (VOL-24).
- **Owner:** Principal API / Contracts Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002, 0005, 0007, 0008.
- **Dependencies:** VOL-27 (Database — for persisted-entity payload references) · **Prerequisites:** constitution §28, §35 stable; DB schema documentation exists.
- **Review Process:** Architecture review (contract correctness, no-invention), security review (safe-to-expose allowlist, request-id, SSRF surface), trust-boundary review (which routes cross Managed egress), evidence/grounding review.
- **Audience:** API engineers, backend + frontend integrators, AI agents implementing or calling routes.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 4 / ~240 pages across 4 books
- **Inherits / References (no duplication):** Architecture Constitution §28 (API Design Principles — referenced), §35 (host rewrites); existing `docs/current` openapi doc (Needs Update — to be reconciled, referenced via inventory); architecture-manifest.md §4; canonical-glossary.md (trust modes). Next.js 16 proxy.ts naming lock honored.

### Books

#### BK-26.01 — HTTP Contract & Route-Handler Conventions

- **Parent Volume:** VOL-26 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document route-handler conventions and the public/internal partition. Dependencies: VOL-27. Prerequisites: constitution §28. Cross-References: §28, §35. Expected Inputs: apps/web/app/api tree, api-gateway routes. Expected Outputs: route-handler contract. Review: architecture + security.
- **Chapters:**
  - **CH-26.01.01 — Route-handler conventions and structure** — depends-on: none · references: `apps/web/app/api`, constitution §28 (referenced) · related features: all routes · est pages: 16 · difficulty: high · review checklist: no invented routes; conventions evidence-cited
  - **CH-26.01.02 — Public vs internal API partition** — depends-on: CH-26.01.01 · references: `apps/web/app/api`, `services/api-gateway/src/routes` · related features: API surface · est pages: 14 · difficulty: med · review checklist: trust-boundary correct; partition evidence-cited
  - **CH-26.01.03 — Persisted-entity payload references (to schema)** — depends-on: VOL-27 · references: VOL-27 BK-27.01, `packages/platform/data-layer/src/types.ts` · related features: CRUD routes · est pages: 12 · difficulty: med · review checklist: references schema not restating it
  - **CH-26.01.04 — IPC contract for desktop/CLI surfaces** — depends-on: CH-26.01.01 · references: `crates/agiworkforce-protocol`, `apps/desktop/src-tauri` · related features: desktop/CLI IPC · est pages: 14 · difficulty: high · review checklist: no invented commands; protocol referenced

#### BK-26.02 — Error Envelope & Safe-to-Expose Allowlist

- **Parent Volume:** VOL-26 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document the error-envelope schema and the safe-to-expose code allowlist. Dependencies: none. Prerequisites: constitution §28. Cross-References: §28; Security Spec (referenced). Expected Inputs: error-handling middleware. Expected Outputs: error contract + allowlist. Review: security mandatory.
- **Chapters:**
  - **CH-26.02.01 — Error-envelope schema** — depends-on: none · references: `services/api-gateway/src/middleware`, constitution §28 · related features: error handling · est pages: 12 · difficulty: med · review checklist: schema evidence-cited; no leaked internals
  - **CH-26.02.02 — Safe-to-expose code allowlist** — depends-on: CH-26.02.01 · references: error middleware, Security Spec (referenced) · related features: error codes · est pages: 12 · difficulty: high · review checklist: allowlist honest; no sensitive disclosure
  - **CH-26.02.03 — Redaction at the response boundary** — depends-on: CH-26.02.01 · references: A12 (logger redaction — referenced), privacy predicate (§23 — referenced) · related features: redaction · est pages: 10 · difficulty: high · review checklist: privacy predicate referenced; no per-call re-derivation

#### BK-26.03 — Request Identity, Propagation & Versioning

- **Parent Volume:** VOL-26 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document request-id propagation and `/v1` versioning. Dependencies: none. Prerequisites: constitution §28, §49. Cross-References: §28, §49 (versioning — referenced). Expected Inputs: middleware, route prefixes. Expected Outputs: id + versioning contract. Review: architecture.
- **Chapters:**
  - **CH-26.03.01 — Request-id propagation across surfaces and services** — depends-on: none · references: `services/api-gateway/src/middleware`, constitution §28 · related features: tracing · est pages: 12 · difficulty: med · review checklist: propagation evidence-cited; links to observability (VOL-28)
  - **CH-26.03.02 — Versioning under /v1 and compatibility** — depends-on: CH-26.03.01 · references: constitution §49 (referenced), route prefixes · related features: API versioning · est pages: 12 · difficulty: med · review checklist: versioning strategy referenced not restated
  - **CH-26.03.03 — Provider-availability asymmetry surfaced at API (blocked)** — depends-on: VOL-24 BK-24.01 · references: ARCH-D5, constitution §28, §50 · related features: capability honesty · est pages: 10 · difficulty: high · review checklist: records ARCH-D5 blocker; Target-marked

#### BK-26.04 — Host-Based Rewrites & Edge Routing

- **Parent Volume:** VOL-26 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document host-based rewrites and the Next.js 16 proxy. Dependencies: none. Prerequisites: constitution §35. Cross-References: §35. Expected Inputs: apps/web/proxy.ts. Expected Outputs: rewrite/routing contract. Review: architecture + security (SSRF surface).
- **Chapters:**
  - **CH-26.04.01 — Next.js 16 proxy.ts and the proxy function (naming lock)** — depends-on: none · references: `apps/web/proxy.ts`, constitution §35, Article IV (naming lock) · related features: edge routing · est pages: 14 · difficulty: high · review checklist: proxy.ts not renamed; naming lock honored
  - **CH-26.04.02 — Host-based rewrites and surface routing** — depends-on: CH-26.04.01 · references: `apps/web/proxy.ts` · related features: multi-surface routing · est pages: 12 · difficulty: med · review checklist: evidence-cited; no invented hosts
  - **CH-26.04.03 — Edge SSRF surface and hardening pointers** — depends-on: CH-26.04.01 · references: Security Spec (SSRF — referenced), `apps/web/lib/egress-policy.ts`, `packages/contracts/trust-boundaries/src/egress-policy.ts` · related features: SSRF defense · est pages: 12 · difficulty: high · review checklist: references Security Spec not restating; trust-boundary correct

---

#### BK-26.05 — Public API Platform & SDKs

- **Parent Volume:** VOL-26 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: own the public-developer API surface and SDK distribution layered ON TOP of the internal HTTP/IPC contract (BK-26.01..04) — the public-vs-internal egress partition, public authentication (API keys / OAuth scopes), the SDK generation/publish pipeline, and developer-facing reference packaging — WITHOUT re-owning route-handler conventions, the error envelope, request-id, or /v1 versioning (all referenced to BK-26.01..04). This is a Managed-Cloud surface and inherits the Managed trust boundary. Dependencies: BK-26.01 (route conventions, public/internal partition CH-26.01.02), BK-26.02 (error envelope), BK-26.03 (request-id, versioning), VOL-33 BK-33.04 (generated SDK/public reference consumes this contract). Prerequisites: internal /v1 contract Canonical (BK-26.01..04); public-API GA blocked on the Managed-Cloud abuse/fraud/ledger gate (D#) — Target-marked until proven. Cross-References: constitution §28 (API Design Principles — referenced), §50 (capability honesty at the public boundary), Security Spec (egress/SSRF — referenced), VOL-20 (egress/authz enforcement). Expected Inputs: `openapi.json`/`openapi.yaml` (referenced, reconciled per VOL-26 inventory), `services/api-gateway` public routes, Clerk auth context. Expected Outputs: public-API platform contract + SDK packaging contract (no invented routes/payloads). Review: architecture (no-invention, public/internal partition), security mandatory (public-auth, egress, abuse surface), trust-boundary review (Managed-only), evidence/grounding.
- **Chapters:**
  - **CH-26.05.01 — Public vs internal API surface partition (what is exposed to developers)** — depends-on: CH-26.01.02 · references: BK-26.01 (public/internal partition — owner, referenced), `services/api-gateway/src/routes`, constitution §28 · related features: public API surface · est pages: 16 · difficulty: high · review checklist: references internal partition owner not re-owning it; no internal-only route exposed; trust-boundary correct
  - **CH-26.05.02 — Public authentication: API keys and OAuth scopes (Managed-only)** — depends-on: CH-26.05.01 · references: VOL-20 (authz/identity enforcement — referenced), Clerk auth context, constitution §28 · related features: developer auth · est pages: 18 · difficulty: high · review checklist: auth mechanics referenced to VOL-20 not restated; Managed-only; key scoping honest; no secret leakage
  - **CH-26.05.03 — SDK generation and publish pipeline (source→package)** — depends-on: CH-26.05.01, VOL-33 BK-33.04 · references: `openapi.json`/`openapi.yaml` (referenced), VOL-33 BK-33.04 (generated reference owner), VOL-31 (release/publish — referenced) · related features: SDK distribution · est pages: 16 · difficulty: high · review checklist: SDK content traces to public contract; no SDK package invented as existing; generation referenced to VOL-33
  - **CH-26.05.04 — Developer documentation surface and onboarding contract** — depends-on: CH-26.05.01, CH-26.05.02 · references: VOL-33 BK-33.04 (reference layout — referenced), constitution §50 · related features: developer docs · est pages: 16 · difficulty: med · review checklist: capability honesty (§50); availability badges honest; references generated reference not duplicating it
  - **CH-26.05.05 — Managed-Cloud GA gate for the public API (blocked)** — depends-on: CH-26.05.02 · references: Managed-Cloud waitlist/abuse/fraud/ledger rule (D#), constitution §50, VOL-24 BK-24.02 (ledger — referenced) · related features: public API availability · est pages: 14 · difficulty: high · review checklist: records public-API GA blocker on Managed gate; Target-marked; no premature GA claim

#### BK-26.06 — Public API Versioning & Deprecation Policy

- **Parent Volume:** VOL-26 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: own the public-facing versioning lifecycle and deprecation policy that closes the under-scoped versioning chapter for the public surface — breaking-change classification, deprecation/sunset timelines, compatibility windows, and deprecation communication — WITHOUT re-owning the /v1 versioning-and-compatibility scheme (CH-26.03.02, referenced as owner) or the provider-availability asymmetry blocker (CH-26.03.03, referenced). Dependencies: CH-26.03.02 (/v1 versioning — owner), BK-26.05 (public API platform), CH-26.02.02 (safe-to-expose codes — referenced for deprecation signalling). Prerequisites: internal versioning scheme stable; public API platform book scoped (BK-26.05). Cross-References: constitution §28, §49 (versioning — referenced), §50 (capability honesty). Expected Inputs: `/v1` route prefixes (referenced), public contract from BK-26.05. Expected Outputs: public versioning + deprecation-policy contract. Review: architecture (compatibility correctness), trust-boundary (no covert behavior change across versions), evidence/grounding.
- **Chapters:**
  - **CH-26.06.01 — Breaking-change classification and compatibility window** — depends-on: CH-26.03.02 · references: CH-26.03.02 (/v1 versioning — owner, referenced), constitution §49 · related features: API compatibility · est pages: 12 · difficulty: med · review checklist: versioning scheme referenced not restated; breaking-vs-non-breaking criteria evidence-cited
  - **CH-26.06.02 — Deprecation and sunset timelines** — depends-on: CH-26.06.01 · references: constitution §49, §50 · related features: deprecation lifecycle · est pages: 12 · difficulty: med · review checklist: timelines explicit; no retroactive sunset; capability honesty honored
  - **CH-26.06.03 — Deprecation signalling at the response boundary** — depends-on: CH-26.06.01, CH-26.02.02 · references: CH-26.02.01/02 (error envelope + safe-to-expose — referenced), constitution §28 · related features: deprecation headers/codes · est pages: 12 · difficulty: med · review checklist: references error-envelope owner; no new code allowlisted here; no leaked internals
  - **CH-26.06.04 — Deprecation communication and developer-notice contract** — depends-on: CH-26.06.02, BK-26.05 · references: BK-26.05 CH-26.05.04 (developer docs — referenced), constitution §50 · related features: deprecation comms · est pages: 14 · difficulty: med · review checklist: notice obligations explicit; references developer-docs surface not duplicating it

#### BK-26.07 — Backend↔Frontend↔DB Consistency Model

- **Parent Volume:** VOL-26 · **Canonical Status:** planned · **Generation Order:** 7
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: own the client↔server consistency CONTRACT that every client+server feature conforms to — the eventual-consistency posture at the API boundary, optimistic-update and read-after-write expectations, and the offline-queue reconciliation contract — WITHOUT re-owning sync conflict mechanics. The per-entity LWW-vs-append-only conflict matrix, cursor-frontier semantics, and tombstone propagation are OWNED by VOL-18 BK-18.03 (referenced, never restated); persisted schemas are owned by VOL-27 (referenced); sync-state UI is owned by VOL-22 (referenced). Dependencies: BK-26.01 (HTTP contract), VOL-18 BK-18.03 (sync conflict/frontier/tombstone — owner), VOL-27 (persisted schema), VOL-22 (sync-state UX). Prerequisites: BK-26.01 Canonical; VOL-27 BK-27.01 schema-doc conventions exist; VOL-18 conflict matrix scoped. Cross-References: constitution §28, §21/§44 (sync — referenced via VOL-18), §22 (storage — referenced). Expected Inputs: offline-queue client tests (referenced), api-gateway write routes, data-layer types. Expected Outputs: consistency-model contract spanning API + Database + Synchronization inheriting books. Review: architecture (consistency posture correctness), trust-boundary (no covert Local→Managed reconciliation), evidence/grounding.
  - **Chapters:**
  - **CH-26.07.01 — Eventual-consistency posture at the API boundary** — depends-on: CH-26.01.01 · references: constitution §28, VOL-18 BK-18.03 (sync mechanics — referenced) · related features: client-server consistency · est pages: 14 · difficulty: high · review checklist: posture stated as contract; sync conflict mechanics referenced to VOL-18 not restated
  - **CH-26.07.02 — Optimistic updates and read-after-write expectations** — depends-on: CH-26.07.01 · references: VOL-22 (reliability-UX — referenced), VOL-27 BK-27.01 (persisted schema — referenced) · related features: optimistic UI, rollback boundary · est pages: 14 · difficulty: high · review checklist: rollback/error boundary defined; UI rendering deferred to VOL-22; no schema enumeration
  - **CH-26.07.03 — Offline-queue reconciliation contract** — depends-on: CH-26.07.01 · references: VOL-18 BK-18.03 (conflict matrix + frontier — owner, referenced), offline-queue tests (referenced) · related features: offline-first features · est pages: 14 · difficulty: high · review checklist: reconciliation contract references VOL-18 conflict matrix not re-owning it; trust-boundary correct
  - **CH-26.07.04 — Consistency-model spanning map (API ↔ Database ↔ Synchronization)** — depends-on: CH-26.07.01 · references: VOL-18 BK-18.03, VOL-27 BK-27.01/27.03, constitution §22/§44 · related features: cross-plane consistency · est pages: 12 · difficulty: high · review checklist: spans three inheriting books by reference; single-owner respected for each cited plane

#### BK-26.08 — Outbound Webhook Delivery, Retry & Signing

- **Parent Volume:** VOL-26 · **Canonical Status:** planned · **Generation Order:** 8
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: own the OUTBOUND webhook delivery contract that the public API platform emits to developer endpoints — payload signing, delivery retry/backoff, idempotent delivery/dedup, and dead-letter handling. Direction matters: INBOUND webhook-as-trigger (the trigger taxonomy and external-trigger authentication/untrusted-input validation) is OWNED by VOL-13 CH-13.01.02 and CH-13.02.02 (referenced, never restated). At-least-once/queue semantics, event taxonomy, and dead-letter as a plane are OWNED/under VOL-24 BK-24.04.02 (queue boundary — referenced); this book references that plane and owns only the public-webhook delivery contract layered on it. Dependencies: BK-26.05 (public API platform — emitter), BK-26.02 (error envelope), VOL-13 (inbound trigger owner — referenced for direction), VOL-24 BK-24.04.02 (queue/at-least-once — referenced), VOL-21 (delivery observability — referenced). Prerequisites: BK-26.01..04 Canonical; BK-26.05 scoped; VOL-13 trigger taxonomy scoped. Cross-References: constitution §28, Security Spec (signing/SSRF on outbound delivery — referenced). Expected Inputs: api-gateway push/webhook endpoints (referenced), signing key material context. Expected Outputs: outbound webhook delivery + signing + retry + dead-letter contract. Review: architecture, security mandatory (signing, SSRF on outbound targets, replay defense), trust-boundary, evidence/grounding.
  - **Chapters:**
  - **CH-26.08.01 — Outbound delivery contract and direction boundary vs inbound triggers** — depends-on: BK-26.05 CH-26.05.01 · references: VOL-13 CH-13.01.02 (inbound trigger taxonomy — owner, referenced), VOL-13 CH-13.02.02 (external-trigger auth — owner), constitution §28 · related features: webhook delivery · est pages: 12 · difficulty: med · review checklist: inbound-vs-outbound direction explicit; inbound owned by VOL-13 referenced not re-owned
  - **CH-26.08.02 — Payload signing and replay defense** — depends-on: CH-26.08.01 · references: Security Spec (signing/SSRF — referenced), constitution §28 · related features: webhook signing · est pages: 14 · difficulty: high · review checklist: signing mechanics security-reviewed; replay defense explicit; no secret leakage; outbound SSRF target validation referenced
  - **CH-26.08.03 — Delivery retry, backoff and idempotent dedup** — depends-on: CH-26.08.01 · references: VOL-24 BK-24.04.02 (queue/at-least-once — owner, referenced), VOL-21 (delivery observability — referenced) · related features: delivery reliability · est pages: 14 · difficulty: high · review checklist: at-least-once/queue semantics referenced to VOL-24 not re-owned; dedup contract explicit
  - **CH-26.08.04 — Dead-letter handling and delivery-failure observability** — depends-on: CH-26.08.03 · references: VOL-24 BK-24.04.02 (queue/dead-letter plane — referenced), VOL-21 (telemetry — referenced) · related features: dead-letter, delivery SLO · est pages: 12 · difficulty: med · review checklist: dead-letter plane referenced not re-owned; delivery-SLO observability deferred to VOL-21

## VOL-27 — Database

- **Volume ID:** VOL-27 · **Generation Priority:** P0 · **Difficulty:** extreme
- **Purpose:** Elaborate the constitution's _Database Specification_ book into the concrete documentation of the data layer: the schema documentation conventions, indexes, migration SQL conventions, the migration runner/ledger and branch-first apply workflow, and the local-PK-to-cloud-identity mapping. Principles live in the Architecture Constitution (§22 Storage, §29 Database Design); this volume owns the concrete data-layer contract. It references `apps/web/db/neon` (migrations `0001`–`0042`) and `@agiworkforce/data-layer`; it NEVER enumerates the schemas themselves — those are generated content. It documents the structure, conventions, ledger, and mapping around the schema, plus the honest dormant-RLS state.
- **Scope:** IN: schema documentation conventions, index conventions, migration SQL conventions and naming, migration runner/ledger and branch-first apply workflow, local-PK-to-cloud-identity mapping, vendor-neutral data-layer adapter contract, dormant-RLS real-state documentation, per-surface local-store mapping. OUT: enumerating concrete table schemas (generated content — referenced via `apps/web/db/neon`), Storage/DB _principles_ (constitution §22/§29 — referenced), sync conflict mechanics (Session & Synchronization Spec — referenced), the API payloads (VOL-26).
- **Owner:** Principal Data / Persistence Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002, 0005, 0007, 0008.
- **Dependencies:** none within cluster (most foundational of C6 engineering planes) · **Prerequisites:** constitution §22, §29 stable; migration ledger decision (ARCH-D11) noted as blocker; RLS activation (AGI-SEC-0001) noted as blocker.
- **Review Process:** Trust-boundary review (mandatory — three-store boundary, RLS, per-user isolation), security review (RLS, audit-log immutability), architecture review (data-layer SSOT, no-ORM convention), evidence/grounding review.
- **Audience:** Data/persistence engineers, backend engineers, AI agents writing migrations or queries.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** extreme / high / 5 / ~250 pages across 4 books
- **Inherits / References (no duplication):** Architecture Constitution §22 (Storage Architecture — three trust-boundary stores), §29 (Database Design Principles — referenced); `apps/web/db/neon` migrations `0001`–`0042` (referenced, never enumerated); `@agiworkforce/data-layer`; AGI-DATA-0001 (Neon canonical), AGI-SEC-0001 (RLS dormant); architecture-manifest.md §7 (storage). Three-trust-boundary-stores pattern referenced not restated.

### Books

#### BK-27.01 — Schema Documentation & Index Conventions

- **Parent Volume:** VOL-27 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document conventions for describing the Neon schema (never enumerating it) and index discipline. Dependencies: none. Prerequisites: constitution §29. Cross-References: §29; AGI-DATA-0001. Expected Inputs: apps/web/db/neon (referenced), data-layer types. Expected Outputs: schema-doc conventions. Review: architecture + trust-boundary.
- **Chapters:**
  - **CH-27.01.01 — Neon as canonical cloud store and no-ORM raw-SQL convention** — depends-on: none · references: AGI-DATA-0001, architecture-manifest §7, `apps/web/db/neon` (referenced) · related features: cloud persistence · est pages: 14 · difficulty: high · review checklist: schema not enumerated; AGI-DATA-0001 referenced
  - **CH-27.01.02 — Schema documentation conventions (how schemas are described, not listed)** — depends-on: CH-27.01.01 · references: `apps/web/db/neon` (referenced), constitution §29 · related features: data model docs · est pages: 14 · difficulty: high · review checklist: no schema enumeration; convention-only
  - **CH-27.01.03 — Index and query-shape conventions** — depends-on: CH-27.01.01 · references: `apps/web/db/neon` (referenced) · related features: query performance · est pages: 12 · difficulty: med · review checklist: conventions evidence-cited; no invented indexes
  - **CH-27.01.04 — Vendor-neutral data-layer adapter contract** — depends-on: CH-27.01.01 · references: `packages/platform/data-layer/src/factory.ts`, `adapters`, constitution §29 · related features: DB access boundary · est pages: 12 · difficulty: med · review checklist: single-adapter SSOT; no bypass paths

#### BK-27.02 — Migration Runner, Ledger & Branch-First Workflow

- **Parent Volume:** VOL-27 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document the migration runner/ledger and branch-first apply workflow, recording the current hand-rolled-TEMP-script gap. Dependencies: none. Prerequisites: ARCH-D11 noted as blocker. Cross-References: constitution §29, Appendix A11. Expected Inputs: migration tooling, neon migration files. Expected Outputs: migration workflow contract (current vs target). Review: architecture (blocked record) + security.
- **Chapters:**
  - **CH-27.02.01 — Migration SQL conventions and naming (0001..0042 scheme)** — depends-on: none · references: `apps/web/db/neon` (referenced), constitution §29 · related features: migrations · est pages: 12 · difficulty: med · review checklist: naming scheme evidence-cited; no schema enumeration
  - **CH-27.02.02 — Migration runner / ledger and branch-first apply (current gap, blocked)** — depends-on: CH-27.02.01 · references: ARCH-D11, Appendix A11 (`_prod_migrate.mjs`) · related features: schema deploy · est pages: 16 · difficulty: extreme · review checklist: records ARCH-D11 blocker; Current/Target separated; committed-vs-live drift honest
  - **CH-27.02.03 — Superseded migration handling (e.g. retired mappings)** — depends-on: CH-27.02.01 · references: `0019_identity_bridge_retired.sql`, `0031_drop_legacy_user_id_mapping.sql` (referenced) · related features: schema lifecycle · est pages: 10 · difficulty: med · review checklist: lifecycle honest; no auto-delete claim

#### BK-27.03 — Trust-Boundary Stores & Local-to-Cloud Identity Mapping

- **Parent Volume:** VOL-27 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document the three trust-boundary stores at the persistence level and the local-PK-to-cloud-identity mapping. Dependencies: none. Prerequisites: constitution §22 referenced. Cross-References: §22; canonical-glossary (local store). Expected Inputs: per-surface store impls, identity migrations. Expected Outputs: store + identity-mapping contract. Review: trust-boundary mandatory.
- **Chapters:**
  - **CH-27.03.01 — Three distinct trust-boundary stores at persistence layer** — depends-on: none · references: constitution §22 (three-store pattern — referenced), architecture-manifest §7 · related features: Local/BYOK/Managed storage · est pages: 14 · difficulty: high · review checklist: three-store pattern referenced; trust-boundary correct
  - **CH-27.03.02 — Per-surface local store formats (SQLCipher/JSON/MMKV) mapping** — depends-on: CH-27.03.01 · references: architecture-manifest §7, `packages/platform/local-llm` context (referenced) · related features: local persistence · est pages: 14 · difficulty: high · review checklist: per-surface formats evidence-cited
  - **CH-27.03.03 — Local-PK-to-cloud-identity mapping** — depends-on: CH-27.03.01 · references: constitution §29, `0029_device_authorization_contract.sql` (referenced), AGI-SYNC-0001 · related features: sync handoff · est pages: 14 · difficulty: extreme · review checklist: mapping honest; sync conflict mechanics referenced (Session Spec) not restated

#### BK-27.04 — Per-User Isolation & RLS (Dormant Real State)

- **Parent Volume:** VOL-27 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document per-user isolation as it actually is — application-layer `where user_id = $1` with RLS shipped but dormant on the live CRUD path. Dependencies: none. Prerequisites: AGI-SEC-0001 noted as blocker. Cross-References: constitution §27, §29; Security Spec (RLS mechanics — referenced). Expected Inputs: RLS migrations, sync routes. Expected Outputs: honest isolation-state record. Review: trust-boundary + security mandatory.
- **Chapters:**
  - **CH-27.04.01 — Application-layer tenant isolation (current live path)** — depends-on: none · references: architecture-manifest §7, AGI-SEC-0001 · related features: per-user isolation · est pages: 12 · difficulty: high · review checklist: real state (app-layer) documented; not aspirational
  - **CH-27.04.02 — RLS shipped but dormant on live path (blocked)** — depends-on: CH-27.04.01 · references: `0037_rls_user_isolation.sql`, `0039` (referenced), AGI-SEC-0001, ARCH Appendix A · related features: RLS · est pages: 14 · difficulty: extreme · review checklist: records AGI-SEC-0001 blocker; RLS mechanics referenced to Security Spec; dormant honestly stated
  - **CH-27.04.03 — Audit-log immutability gap (real state)** — depends-on: CH-27.04.01 · references: known-flaws.md AUDIT-IMMUT-01 (referenced), `0014_security.sql`, `0032` · related features: audit logs · est pages: 10 · difficulty: high · review checklist: references known-flaw; no fix claimed

---

## VOL-28 — Infrastructure

- **Volume ID:** VOL-28 · **Generation Priority:** P2 · **Difficulty:** high
- **Purpose:** Document the deployment, CI/CD, environment, and observability _infrastructure_ planes — Vercel/Fly/Neon/Upstash/Blob provisioning, the CI guardrail catalog and release/signing gates, environment configuration, and the observability/telemetry/logging backend enablement contract (the _Observability, Telemetry & Logging Spec_ content). It documents WHERE and HOW the platform runs and is observed, recording honest real state: api-gateway deploy target UNKNOWN, CI red, desktop release builds disabled, observability as a facade. It references backend service topology (VOL-24) and the migration ledger (VOL-27) rather than redefining them.
- **Scope:** IN: deploy targets and provisioning, environment/config conventions, CI/CD guardrail catalog and release/signing gates, observability/telemetry/logging backend enablement (metric/event taxonomy, OTel GenAI conventions, logger-facade redaction, durable usage/cost persistence), runbook/ops infrastructure pointers. OUT: backend service responsibilities (VOL-24), the migration runner logic (VOL-27), the test-tier taxonomy itself (Testing/CI/CD/Governance Spec — referenced), security enforcement mechanics (Security Spec — referenced).
- **Owner:** Principal Platform / DevOps & Observability Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002, 0005, 0007, 0008.
- **Dependencies:** VOL-24 (backend topology), VOL-27 (migration ledger) · **Prerequisites:** constitution §36–§38 stable; deploy decisions (AGI-OPS-0001) and observability enablement (ARCH-D13) noted as blockers.
- **Review Process:** Architecture review (infra topology, no-invention), security review (env/secrets, redaction, observability data flow), reliability review, evidence/grounding review (honest CI/deploy state).
- **Audience:** DevOps/platform engineers, SREs, AI agents managing deploys and observability.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / med / 3 / ~190 pages across 3 books
- **Inherits / References (no duplication):** Architecture Constitution §36–§38 (observability/telemetry/logging — book content), §57 (security-scan gating — referenced); architecture-manifest.md §10 (infra & DX), §11 (risks); AGI-OPS-0001; ARCH-D12/A12 (loggers), ARCH-D13/A13 (observability facade), ARCH-D14/A14 (non-durable cost telemetry); `docs/agent-context/*` guardrails; Testing/CI/CD/Governance Spec (test-tier taxonomy — referenced).

### Books

#### BK-28.01 — Deploy Targets & Environment Provisioning

- **Parent Volume:** VOL-28 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document where each surface/service deploys and how environments are provisioned, recording UNKNOWN/disabled real state. Dependencies: VOL-24, VOL-27. Prerequisites: AGI-OPS-0001 noted as blocker. Cross-References: architecture-manifest §10, §11. Expected Inputs: deploy configs, Dockerfiles. Expected Outputs: deploy-topology map. Review: architecture + security.
- **Chapters:**
  - **CH-28.01.01 — Deploy topology (Vercel/Fly/Neon/Upstash/Blob)** — depends-on: VOL-24 · references: architecture-manifest §10 · related features: deployment · est pages: 14 · difficulty: med · review checklist: evidence-cited; no invented infra
  - **CH-28.01.02 — api-gateway deploy target UNKNOWN and signaling on Fly (real state)** — depends-on: CH-28.01.01 · references: architecture-manifest §10 (Dockerfile only), AGI-OPS-0001 · related features: gateway deploy · est pages: 10 · difficulty: med · review checklist: marks UNKNOWN; records blocker
  - **CH-28.01.03 — Environment and config conventions** — depends-on: CH-28.01.01 · references: `services/api-gateway/src/env.ts`, model-env-gating context · related features: env config · est pages: 12 · difficulty: med · review checklist: no secrets restated; conventions evidence-cited
  - **CH-28.01.04 — Migration apply at deploy time (references ledger)** — depends-on: VOL-27 · references: VOL-27 BK-27.02, ARCH-D11 · related features: schema deploy · est pages: 10 · difficulty: high · review checklist: references migration ledger not redefining; records blocker

#### BK-28.02 — CI/CD Guardrails & Release Gates

- **Parent Volume:** VOL-28 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document the CI guardrail catalog and release/signing gates, recording CI-red and disabled-builds real state. Dependencies: none. Prerequisites: AGI-OPS-0001 noted as blocker; test-tier taxonomy referenced. Cross-References: constitution §57; Testing Spec (referenced). Expected Inputs: check:\* scripts, CI workflows. Expected Outputs: guardrail catalog. Review: architecture + reliability.
- **Chapters:**
  - **CH-28.02.01 — Guardrail catalog (check:\* commands, enforced vs advisory)** — depends-on: none · references: `docs/agent-context/commands.json`, 20+ check:\* guardrails (architecture-manifest §10) · related features: CI gates · est pages: 14 · difficulty: med · review checklist: enforced-vs-advisory honest; evidence-cited
  - **CH-28.02.02 — CI red state and Semgrep advisory (real state, blocked)** — depends-on: CH-28.02.01 · references: AGI-OPS-0001, Appendix A (Semgrep continue-on-error) · related features: CI status · est pages: 10 · difficulty: med · review checklist: records blocker; no green claim
  - **CH-28.02.03 — Release and signing gates; disabled desktop builds (real state)** — depends-on: CH-28.02.01 · references: architecture-manifest §11 (desktop builds disabled), constitution §57 · related features: release · est pages: 12 · difficulty: high · review checklist: disabled-builds honest; signing gates referenced

#### BK-28.03 — Observability, Telemetry & Logging (Backend Enablement)

- **Parent Volume:** VOL-28 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: document the metric/event taxonomy, OTel GenAI conventions, logger-facade redaction, durable usage/cost persistence, and backend enablement contract — recording the observability-facade real state. Dependencies: VOL-24. Prerequisites: ARCH-D13 noted as blocker. Cross-References: constitution §36, §37, §38. Expected Inputs: loggers, OTel attrs, usage telemetry. Expected Outputs: observability enablement contract. Review: security (redaction/data flow) mandatory.
- **Chapters:**
  - **CH-28.03.01 — Metric/event taxonomy and OTel GenAI conventions** — depends-on: VOL-24 · references: constitution §36, §38, request-id (VOL-26 BK-26.03) · related features: telemetry · est pages: 14 · difficulty: high · review checklist: taxonomy evidence-cited; no invented metrics
  - **CH-28.03.02 — Logger-facade redaction and the two-logger divergence (real state)** — depends-on: CH-28.03.01 · references: constitution §37, ARCH-D12/A12 (pino vs redacting facade), privacy predicate (§23 — referenced) · related features: logging · est pages: 14 · difficulty: high · review checklist: records A12; privacy predicate referenced; redaction honesty
  - **CH-28.03.03 — Observability facade: Sentry no-op, OTel never exported (blocked)** — depends-on: CH-28.03.01 · references: ARCH-D13/A13, constitution §36, §38 · related features: error/trace backends · est pages: 10 · difficulty: high · review checklist: records ARCH-D13 blocker; facade honestly stated
  - **CH-28.03.04 — Durable usage/cost persistence (non-durable real state, blocked)** — depends-on: CH-28.03.01, VOL-24 BK-24.02 · references: ARCH-D14/A14 (module-level Map, LRU), constitution §31, §38 · related features: usage/cost telemetry · est pages: 10 · difficulty: high · review checklist: records ARCH-D14 blocker; non-durable honestly stated; cannot back charges

#### BK-28.04 — Event-Bus & Queue Infrastructure Plane

- **Parent Volume:** VOL-28 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Closes gap #24 by owning the event-bus/queue as a first-class _infrastructure plane_ — the provisioned topology (Upstash and any durable queue), event taxonomy/routing, ordering guarantees, poison-pill/dead-letter handling, and at-least-once delivery semantics _as operated infrastructure_. Per the Deploy-targets Single-Owner Resolution, VOL-28 owns _what runs where_ (the provisioned bus/queue topology); the _execution behavior_ boundary (durable queue/event-bus boundary contract, idempotency discipline) stays owned by VOL-17 BK-17.03.03/17.03.04 (referenced — not re-owned), and the _backend route/service composition_ that produces/consumes events is owned by VOL-24 BK-24.04.02 (referenced). This book documents the infra-level realization those two depend on, recording honest current state (Upstash referenced in manifest §10; durable queue largely target). Depends on VOL-24 (producing/consuming services), VOL-17 (boundary contract). Cross-refs: manifest §10 (infra), §11 (risks); constitution §30, §31, §34, §41. Inputs: Upstash/queue provisioning, event-source inventory. Outputs: event-bus topology map, event taxonomy/routing model, ordering/DLQ/at-least-once infra contract (current-vs-target). Review: Architecture (topology, no-invention) + reliability + security (event-payload trust scope). Traces to Architecture Constitution §30/§31/§41, AGI-OPS-0001 (deploy blocker), AGI-OPS-\* domain. References VOL-17 BK-17.03.03 (boundary), VOL-24 BK-24.04.02 (routes) — no duplication.
- **Chapters:**
  - **CH-28.04.01 — Event-Bus / Queue Topology & Provisioning (current-vs-target)** — depends-on: VOL-24 BK-24.04.02 · references: manifest §10 (Upstash), §11, AGI-OPS-0001 · related features: background jobs, webhook delivery · est pages: 12 · difficulty: high · review checklist: Current/Target separated; Upstash evidence-cited; durable queue Target-marked not as fact; deploy blocker recorded
  - **CH-28.04.02 — Event Taxonomy & Routing Topology** — depends-on: CH-28.04.01 · references: §30, VOL-17 BK-17.03.03 (boundary, referenced) · related features: event routing · est pages: 10 · difficulty: high · review checklist: taxonomy grounded or Target; boundary contract referenced to VOL-17 not re-owned; routing deterministic
  - **CH-28.04.03 — Ordering Guarantees & Backpressure at the Plane** — depends-on: CH-28.04.02 · references: §31, §34, VOL-18 BK-18.03 (frontier ordering, referenced) · related features: ordered jobs · est pages: 10 · difficulty: high · review checklist: ordering guarantee explicit at infra level; sync ordering referenced to VOL-18; backpressure fail-safe
  - **CH-28.04.04 — Poison-Pill, Dead-Letter & At-Least-Once Semantics (infra realization)** — depends-on: CH-28.04.02, VOL-17 BK-17.03.04 · references: §31, §41 · related features: DLQ, retried jobs · est pages: 10 · difficulty: high · review checklist: DLQ defined; at-least-once realized; idempotency discipline referenced to VOL-17 not re-owned; no silent message loss
  - **CH-28.04.05 — Event-Payload Trust Scope & Redaction at the Bus (references VOL-20)** — depends-on: CH-28.04.01, VOL-20 BK-20.03 · references: §23, AGI-TRUST-0001 · related features: event privacy · est pages: 8 · difficulty: high · review checklist: event payload through privacy predicate; BYOK/local content never on cloud bus; redaction referenced to VOL-20

## Part G — Delivery & Reference (VOL-29…38)

## VOL-29 — DevOps

- **Volume ID:** VOL-29 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Define the documentation governing how AGI builds, validates, deploys, and promotes code across environments — the CI/CD pipeline stage graph, the enforced-vs-advisory guardrail wiring, the surface→deploy-target mapping, secret/env flow per environment, and the branch-first apply workflow for infrastructure. This volume owns the _pipeline orchestration_ concern only; it does not own test definitions (VOL-30), release/signing gates (VOL-31), or migration SQL mechanics (deferred to the Database inheriting book of AGI-DOC-0015).
- **Scope:** IN — CI stage graph; check:\* command wiring into stages; deploy targets (Vercel/Fly/Neon/Upstash) and environment promotion; env-var/secret flow; branch-first infra apply; pipeline failure triage. OUT — test-tier definitions (VOL-30), signing/notarization (VOL-31), runbooks/incident response (VOL-32), concrete migration SQL and ledger schema (Database spec).
- **Owner:** Principal Platform / DevOps Engineer
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015). Inherits documentation governance (AGI-DOC-0002), requirement system (AGI-DOC-0005), cross-reference system (AGI-DOC-0007), compiler (AGI-DOC-0008).
- **Dependencies:** VOL-30 (quality gates run in-pipeline), VOL-36 (infra change ADRs) · **Prerequisites:** Testing/CI/CD/Governance inheriting book scope split declared (see Cluster Note below); architecture-manifest §10 current deploy facts.
- **Review Process:** Documentation review (compiler 10-rule gate) + Architecture review (boundary/trust-mode correctness) + Security review for any chapter touching secret/env flow.
- **Audience:** engineers, AI agents, release/ops engineers
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / med / 3 / ~180 pages across 3 books
- **Inherits / References (no duplication):** Architecture Constitution §55–§58 and its Testing/CI/CD/Governance inheriting book (CI/CD slice only); architecture-manifest AGI-DOC-0003 §10 (deploy targets), §11 (CI-red risk); AGI-OPS-0001; documentation-compiler AGI-DOC-0008.

> **Cluster split declaration:** The Architecture Constitution names a single **Testing, CI/CD & Governance Specification** inheriting book. This cluster deliberately SPLITS that book's responsibilities across three volumes: VOL-29 (CI/CD pipeline + deploy), VOL-30 (test taxonomy + coverage gating), VOL-31 (release/signing gates + ADR/Status governance lifecycle). The split is recorded here so the synthesizer can verify the partition is non-overlapping.

### Books

#### BK-29.01 — CI/CD Pipeline Architecture

- **Parent Volume:** VOL-29 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Document the canonical CI stage graph and how every guardrail wires into it. Depends on VOL-30 (gate stages). Prereq: enumerate live check:\* commands. Cross-refs: AGI-DOC-0015 §55–§57, AGI-OPS-0001. Inputs: package.json scripts, CI workflow files. Outputs: an authoritative stage-graph reference. Review: doc + architecture review.
- **Chapters:**
  - **CH-29.01.01 — Pipeline stage graph and ordering** — depends-on: VOL-30 · references: `package.json`, CI workflow configs, AGI-DOC-0015 §55 · related features: CI guardrails · est pages: 14 · difficulty: high · review checklist: evidence-cited; no invented stages; matches live scripts
  - **CH-29.01.02 — Enforced vs advisory guardrail wiring** — depends-on: CH-29.01.01 · references: `scripts/check-*.mjs`, known-flaws CI-GUARD-01 · related features: check:llm-failures, check:boundaries · est pages: 12 · difficulty: high · review checklist: enforcement reality not intent; cites continue-on-error gaps
  - **CH-29.01.03 — Build orchestration across pnpm + Cargo workspaces** — depends-on: CH-29.01.01 · references: `pnpm-workspace.yaml`, root `Cargo.toml` · related features: polyglot build · est pages: 12 · difficulty: high · review checklist: dual-workspace topology correct; no invented members
  - **CH-29.01.04 — CI-green obligation and red-CI current state** — depends-on: CH-29.01.02 · references: AGI-OPS-0001, manifest §11 · related features: CI status · est pages: 8 · difficulty: med · review checklist: Current vs Target separated; cites CI-red honestly

#### BK-29.02 — Deployment Targets & Environments

- **Parent Volume:** VOL-29 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Map each surface to its deploy target, environment tiers, and promotion path. Depends on architecture-manifest §10. Prereq: confirm api-gateway target (UNKNOWN — blocked). Cross-refs: AGI-DOC-0003 §10. Inputs: deploy configs, manifest. Outputs: surface→target table. Review: doc + security (env/secret flow).
  - **CH-29.02.01 — Surface-to-deploy-target mapping** — depends-on: none · references: manifest §10 (Vercel/Fly/Neon/Upstash) · related features: web/sandbox/signaling deploy · est pages: 10 · difficulty: med · review checklist: cites real targets; api-gateway marked UNKNOWN
  - **CH-29.02.02 — Environment tiers and promotion flow** — depends-on: CH-29.02.01 · references: deploy configs · related features: preview/prod promotion · est pages: 10 · difficulty: med · review checklist: no invented environments
  - **CH-29.02.03 — Secret and env-var flow per trust boundary** — depends-on: CH-29.02.01 · references: AGI-DOC-0015 §24, privacy predicate · related features: BYOK/Managed credential flow · est pages: 12 · difficulty: high · review checklist: trust-boundary correct; secrets never cross Local boundary
  - **CH-29.02.04 — Branch-first apply workflow for infra and DB** — depends-on: CH-29.02.02 · references: ARCH-D11, Database inheriting book · related features: Neon branching · est pages: 10 · difficulty: high · review checklist: BLOCKED ARCH-D11; ledger marked Target

#### BK-29.03 — Pipeline Operations & Failure Triage

- **Parent Volume:** VOL-29 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** How agents and engineers diagnose and recover from pipeline failures. Depends on BK-29.01. Cross-refs VOL-32 (escalation to runbooks). Inputs: failure classes. Outputs: triage decision tree. Review: doc review.
  - **CH-29.03.01 — Failure taxonomy and triage decision tree** — depends-on: BK-29.01 · references: known-flaws.md, llm-failure-taxonomy.json · related features: CI failure classes · est pages: 12 · difficulty: med · review checklist: maps to real failure classes
  - **CH-29.03.02 — Reproducing CI failures locally** — depends-on: CH-29.03.01 · references: commands.json · related features: local guardrail run · est pages: 8 · difficulty: low · review checklist: commands resolve
  - **CH-29.03.03 — Rollback handoff to Operations** — depends-on: CH-29.03.01 · references: VOL-32 runbooks · related features: deploy rollback · est pages: 8 · difficulty: med · review checklist: clean ownership handoff to VOL-32

---

#### BK-29.04 — Cross-Environment & Staging Strategy

- **Parent Volume:** VOL-29 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: own the staging-environment strategy — staging DB/secrets isolation, per-surface availability in staging, staging data/sync seeding, and the staging-reset runbook. Closes gap #48. Routed to VOL-29 (DevOps environment infrastructure) per the gap table, scoped to staging-specific concerns; it references (does not own) the environment-tier and promotion-flow contract (VOL-29 CH-29.02.02) and the secret/env-var flow per trust boundary (VOL-29 CH-29.02.03) rather than restating them. Dependencies: VOL-29 BK-29.02 (env tiers/promotion), VOL-30 (test environments consume staging). Prerequisites: VOL-29 BK-29.01/29.02 environment model frozen. Cross-References: AGI-DOC-0015 §24 (secrets), manifest §10 deploy targets. Expected Inputs: deploy configs, env-tier definitions, surface availability matrix. Expected Outputs: staging-strategy map, staging-reset runbook. Review: documentation + architecture + security (staging secret isolation, trust-boundary).
  - **CH-29.04.01 — Staging environment composition (DB/secrets isolation, surface availability)** — depends-on: VOL-29 BK-29.02 · references: VOL-29 CH-29.02.02 (env tiers), CH-29.02.03 (secret flow), manifest §10 · related features: staging surfaces · est pages: 5 · difficulty: med · review checklist: env-tier owner referenced not restated; staging secrets isolated; no Local-boundary cross
  - **CH-29.04.02 — Staging data and sync seeding** — depends-on: CH-29.04.01 · references: VOL-18 (sync runtime), VOL-27 (stores) · related features: staging seed · est pages: 4 · difficulty: med · review checklist: seed references sync/store owners; no production data in staging without consent boundary
  - **CH-29.04.03 — Staging-reset runbook and handoff to Operations** — depends-on: CH-29.04.01 · references: VOL-32 BK-32.01 (runbook contract) · related features: staging reset · est pages: 3 · difficulty: med · review checklist: clean handoff to VOL-32 runbook authoring; commands resolve; no destructive default

## VOL-30 — Testing

- **Volume ID:** VOL-30 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Own the test-tier taxonomy (l1–l4), what each tier proves, coverage gating thresholds, the flake/quality-gate policy, and the drive-to-zero plan for the currently empty l2–l4 tiers. This is the testing slice of the Architecture Constitution's Testing/CI/CD/Governance book; it does not own pipeline wiring (VOL-29) or release gates (VOL-31).
- **Scope:** IN — test tiers, coverage gating, quality-gate pass/fail contract, flake policy, test-evidence ledger, drive-to-zero plan. OUT — CI stage wiring (VOL-29), signing/release gates (VOL-31), surface-specific test fixtures (live in surface platform volumes).
- **Owner:** Principal Quality / Test Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015). Inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** VOL-29 (gates run in pipeline) · **Prerequisites:** book split declared (VOL-29); known-flaws CI-TIER-SCRIPTS-01 status.
- **Review Process:** Documentation review + Architecture review (gate contract correctness). Governance sign-off required for enforced-vs-advisory transitions.
- **Audience:** engineers, AI agents, QA
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / med / 3 / ~170 pages across 3 books
- **Inherits / References (no duplication):** AGI-DOC-0015 §55 (test-tier taxonomy, coverage gating); known-flaws.md CI-TIER-SCRIPTS-01; llm-failure-taxonomy.json; documentation-compiler AGI-DOC-0008.

### Books

#### BK-30.01 — Test Strategy & Tier Taxonomy

- **Parent Volume:** VOL-30 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Define tiers l1–l4 and what each proves. Prereq: confirm which tiers are populated (l2–l4 empty per CI-TIER-SCRIPTS-01). Cross-refs AGI-DOC-0015 §55. Outputs: tier definition table. Review: doc + architecture.
  - **CH-30.01.01 — Test tier definitions (l1–l4)** — depends-on: none · references: AGI-DOC-0015 §55, CI-TIER-SCRIPTS-01 · related features: unit/integration/e2e/system tiers · est pages: 14 · difficulty: high · review checklist: Current vs Target; l2–l4 marked empty honestly
  - **CH-30.01.02 — Per-surface test responsibility map** — depends-on: CH-30.01.01 · references: surface AGENTS.md files · related features: 6-surface testing · est pages: 12 · difficulty: med · review checklist: no duplication of surface specs
  - **CH-30.01.03 — Trust-boundary and capability-honesty test obligations** — depends-on: CH-30.01.01 · references: AGI-TRUST-0001, egressGuard tests · related features: egress guard, model gating · est pages: 12 · difficulty: high · review checklist: trust-boundary correct; no fake tests

#### BK-30.02 — Coverage Gating & Quality Gates

- **Parent Volume:** VOL-30 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Define pass/fail thresholds and flake policy. Depends VOL-29 (where gates run). BLOCKED on CI-TIER-SCRIPTS-01 governance decision for enforced thresholds. Outputs: gate contract. Review: doc + governance.
  - **CH-30.02.01 — Quality-gate pass/fail contract** — depends-on: BK-30.01 · references: CI-TIER-SCRIPTS-01 · related features: coverage gate · est pages: 12 · difficulty: high · review checklist: BLOCKED; non-blocking gate documented as Current
  - **CH-30.02.02 — Drive-to-zero plan for empty tiers** — depends-on: CH-30.02.01 · references: known-flaws.md · related features: l2–l4 buildout · est pages: 10 · difficulty: med · review checklist: Target-marked; sequencing not invented
  - **CH-30.02.03 — Flake policy and test-evidence ledger** — depends-on: CH-30.02.01 · references: CI workflow retry config · related features: flaky-test quarantine · est pages: 10 · difficulty: med · review checklist: no swallowed-assertion patterns

#### BK-30.03 — Anti-Pattern Catalog & Test Authoring Discipline

- **Parent Volume:** VOL-30 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Codify forbidden test anti-patterns (fake tests, swallowed mock assertions, unvalidated inputs). References llm-failure-taxonomy. Outputs: authoring checklist. Review: doc review.
  - **CH-30.03.01 — Forbidden test anti-patterns** — depends-on: none · references: llm-failure-taxonomy.json, AGENTS.md LLM Failure Rules · related features: check:llm-failures · est pages: 12 · difficulty: med · review checklist: maps to real taxonomy entries
  - **CH-30.03.02 — Tool/LLM/API/IPC input validation testing** — depends-on: CH-30.03.01 · references: check:llm-failures:strict · related features: input validation · est pages: 10 · difficulty: med · review checklist: no invented APIs
  - **CH-30.03.03 — Test authoring checklist for agents** — depends-on: CH-30.03.01 · references: commands.json · related features: agent-native testing · est pages: 8 · difficulty: low · review checklist: agent-first readability

---

#### BK-30.04 — Performance & Load Testing

- **Parent Volume:** VOL-30 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: own the performance and load-testing strategy that populates the currently-empty l3–l4 test tiers — load-test methodology, latency/throughput measurement, and the production of performance baselines. Closes gap #27. This book owns the methodology that PRODUCES baselines feeding SLOs; it references (does not own) the SLO Ownership Map (VOL-23 CH-23.04.02) and the cost/usage-and-SLO operation (VOL-32 CH-32.03.03) — it must not redefine SLO ownership. Real baselines depend on observability backend (ARCH-D14 / observability-facade), so baseline chapters are Target-marked. Dependencies: VOL-30 BK-30.01 (tier taxonomy, l3–l4 empty), VOL-21 (telemetry for measurement). Prerequisites: l3–l4 tier definitions (CI-TIER-SCRIPTS-01); observability backend enabled (ARCH-D13/D14). Cross-References: AGI-DOC-0015 §34, §55; VOL-23 CH-23.04.02; manifest §11. Expected Inputs: test-tier taxonomy, telemetry attrs, target workloads. Expected Outputs: load-test methodology, baseline register (Target), perf-regression gate proposal. Review: documentation + architecture (no SLO re-ownership) + reliability.
  - **CH-30.04.01 — Load-test methodology and l3–l4 tier population** — depends-on: VOL-30 BK-30.01 · references: AGI-DOC-0015 §55, CI-TIER-SCRIPTS-01 · related features: load tiers · est pages: 8 · difficulty: high · review checklist: l3–l4-empty honest; methodology cited; no fabricated harness
  - **CH-30.04.02 — Latency/throughput baselines feeding SLO ownership (reference)** — depends-on: CH-30.04.01, VOL-21 BK-21.01 · references: VOL-23 CH-23.04.02 (SLO ownership map), ARCH-D14 · related features: perf baselines · est pages: 8 · difficulty: high · review checklist: baselines feed SLOs but do NOT define them; SLO ownership referenced to VOL-23; Target-marked pending observability backend
  - **CH-30.04.03 — Performance-regression gate proposal** — depends-on: CH-30.04.01 · references: VOL-30 BK-30.02 (quality-gate contract), CI-TIER-SCRIPTS-01 · related features: perf gate · est pages: 4 · difficulty: med · review checklist: gate references coverage-gate contract; non-blocking-until-baselines Target-marked

## VOL-31 — Release Engineering

- **Volume ID:** VOL-31 · **Generation Priority:** P2 · **Difficulty:** high
- **Purpose:** Own the release/signing/notarization process and the release-gate ladder: version/tag scheme, artifact signing, desktop-build re-enablement, store submission, and the documentation Status/ADR governance lifecycle slice of the Testing/CI/CD/Governance book. Does not own pipeline wiring (VOL-29), test gates (VOL-30), or runbooks (VOL-32).
- **Scope:** IN — versioning/tagging, signing/notarization, release gate ladder, desktop release-build re-enablement, store submission gating, Status-lifecycle/ADR governance integration. OUT — CI pipeline stages (VOL-29), coverage gates (VOL-30), incident response (VOL-32), commercial managed-cloud GA policy (referenced from D7, owned by platform/commercial docs).
- **Owner:** Principal Release Engineer
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015). Inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** VOL-29 (build/deploy pipeline), VOL-30 (quality gates), VOL-36 (release-policy ADRs) · **Prerequisites:** book split declared; manifest §11 (desktop builds disabled, CI red).
- **Review Process:** Documentation review + Architecture review + Security review (signing/secret material). Governance sign-off for gate ladder.
- **Audience:** release engineers, founders, AI agents
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / med / 3 / ~150 pages across 3 books
- **Inherits / References (no duplication):** AGI-DOC-0015 §57–§59 (release/signing gates, ADR lifecycle); manifest §11 (AGI-OPS-0001); owner-decision-register D7 (Managed Cloud GA).

### Books

#### BK-31.01 — Versioning, Tagging & Release Cadence

- **Parent Volume:** VOL-31 · **Canonical Status:** planned · **Generation Order:** 1
  - **CH-31.01.01 — Version and tag scheme across surfaces** — depends-on: none · references: package.json versions, Cargo.toml · related features: monorepo versioning · est pages: 10 · difficulty: med · review checklist: cites real versions; naming-lock honored
  - **CH-31.01.02 — Release cadence and changelog discipline** — depends-on: CH-31.01.01 · references: CHANGELOG.md · related features: changelog · est pages: 8 · difficulty: low · review checklist: no invented cadence
  - **CH-31.01.03 — Release notes and capability-honesty in announcements** — depends-on: CH-31.01.01 · references: platform-constitution §12 capability honesty · related features: release claims · est pages: 8 · difficulty: med · review checklist: no fake availability claims

#### BK-31.02 — Signing, Notarization & Artifact Integrity

- **Parent Volume:** VOL-31 · **Canonical Status:** planned · **Generation Order:** 2
  - **CH-31.02.01 — Desktop signing and notarization (macOS/Windows)** — depends-on: BK-31.01 · references: manifest §11 (builds disabled), Tauri config · related features: desktop release builds · est pages: 12 · difficulty: high · review checklist: BLOCKED on build re-enablement; Target-marked
  - **CH-31.02.02 — Mobile and extension store submission gating** — depends-on: BK-31.01 · references: Expo config, extension manifest · related features: store submission · est pages: 12 · difficulty: high · review checklist: verify store rules current; no invented policy
  - **CH-31.02.03 — Artifact integrity and supply-chain provenance** — depends-on: CH-31.02.01 · references: GHCR Docker, dependency pins · related features: provenance · est pages: 10 · difficulty: high · review checklist: security-reviewed; no vulnerable ranges

#### BK-31.03 — Release Gate Ladder & Governance Lifecycle

- **Parent Volume:** VOL-31 · **Canonical Status:** planned · **Generation Order:** 3
  - **CH-31.03.01 — Release gate ladder** — depends-on: VOL-30, BK-31.02 · references: AGI-DOC-0015 §57 · related features: release gates · est pages: 12 · difficulty: high · review checklist: gates trace to constitution sections
  - **CH-31.03.02 — ADR and Status-lifecycle integration in releases** — depends-on: CH-31.03.01 · references: AGI-DOC-0010, AGI-DOC-0002 Article VI · related features: doc Status lifecycle · est pages: 10 · difficulty: med · review checklist: references not redefines ADR scheme
  - **CH-31.03.03 — Managed Cloud release readiness (Target)** — depends-on: CH-31.03.01 · references: D7, AGI-BILL-0001 · related features: managed cloud GA · est pages: 10 · difficulty: high · review checklist: managed public-alpha posture honored (open by default since 2026-06-27; env kill-switch only; controls keep pace, not gate access)

---

## VOL-32 — Operations

- **Volume ID:** VOL-32 · **Generation Priority:** P2 · **Difficulty:** high
- **Purpose:** Own operational practice — runbooks, incident response, on-call, SLO operation, and rollback procedure. This volume REFERENCES (does not own) the Observability/Telemetry/Logging inheriting book and the Background-Execution/Offline/Reliability inheriting book of AGI-DOC-0015; those runtime specs are owned by the runtimes/backend cluster. VOL-32 owns how operators _use_ those signals, not the signal contracts themselves.
- **Scope:** IN — runbooks, incident-response playbooks, on-call, SLO operation, rollback, operational readiness checklists. OUT — metric/event taxonomy and OTel conventions (Observability spec), cron/queue/offline contracts (Background-Execution spec), CI pipeline (VOL-29), release gates (VOL-31).
- **Owner:** Principal SRE / Operations Lead
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015). Inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** VOL-29 (operates pipelines/environments) · **Prerequisites:** Observability and Background-Execution runtime specs exist or are stubbed for reference; manifest §11 risks.
- **Review Process:** Documentation review + Architecture review + Security review (incident handling of trust-boundary data).
- **Audience:** SRE/ops, on-call engineers, founders, AI agents
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 3 / ~190 pages across 3 books
- **Inherits / References (no duplication):** AGI-DOC-0015 §36–§38 + Observability inheriting book; §30–§34 + Background-Execution inheriting book; manifest §11 (RLS dormant, observability facade, non-durable cost telemetry); ARCH-D12/D13/D14.

### Books

#### BK-32.01 — Runbooks & On-Call

- **Parent Volume:** VOL-32 · **Canonical Status:** planned · **Generation Order:** 1
  - **CH-32.01.01 — Runbook structure and authoring contract** — depends-on: none · references: AGENTS.md, commands.json · related features: ops runbooks · est pages: 12 · difficulty: med · review checklist: agent-first readability; commands resolve
  - **CH-32.01.02 — Per-surface operational runbooks** — depends-on: CH-32.01.01 · references: manifest §10 deploy targets · related features: web/signaling/gateway ops · est pages: 14 · difficulty: high · review checklist: no invented infra; api-gateway target UNKNOWN noted
  - **CH-32.01.03 — On-call rotation and escalation** — depends-on: CH-32.01.01 · references: owner-decision-register escalation discipline · related features: escalation · est pages: 10 · difficulty: med · review checklist: clean handoff boundaries

#### BK-32.02 — Incident Response & Rollback

- **Parent Volume:** VOL-32 · **Canonical Status:** planned · **Generation Order:** 2
  - **CH-32.02.01 — Incident classification and response playbooks** — depends-on: BK-32.01 · references: known-flaws.md severities · related features: incident triage · est pages: 12 · difficulty: high · review checklist: maps to real flaw severities
  - **CH-32.02.02 — Trust-boundary incident handling** — depends-on: CH-32.02.01 · references: AGI-TRUST-0001, egress guard, RLS-dormant risk · related features: data-leak incidents · est pages: 12 · difficulty: extreme · review checklist: trust-boundary correct; honest enforcement state
  - **CH-32.02.03 — Rollback and recovery procedures** — depends-on: CH-32.02.01 · references: VOL-29 deploy, VOL-35 migration rollback · related features: rollback · est pages: 10 · difficulty: high · review checklist: clean dependency on VOL-29/VOL-35

#### BK-32.03 — Observability & Reliability Operation (References)

- **Parent Volume:** VOL-32 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** How operators consume observability and reliability signals. REFERENCES the Observability and Background-Execution runtime spec books; owns no signal contracts. BLOCKED on ARCH-D12/D13/D14. Outputs: operational signal-usage guide.
  - **CH-32.03.01 — Operating with the metric/event taxonomy (reference)** — depends-on: BK-32.01 · references: Observability inheriting book, ARCH-D13 · related features: dashboards · est pages: 12 · difficulty: high · review checklist: BLOCKED ARCH-D13; facade state honest; references not redefines
  - **CH-32.03.02 — Logging and redaction operations** — depends-on: CH-32.03.01 · references: ARCH-D12, logger facade · related features: log redaction · est pages: 10 · difficulty: high · review checklist: BLOCKED ARCH-D12; references not redefines
  - **CH-32.03.03 — Cost/usage and SLO operation** — depends-on: CH-32.03.01 · references: ARCH-D14 (non-durable telemetry), D7 · related features: cost dashboards, SLOs · est pages: 12 · difficulty: high · review checklist: BLOCKED ARCH-D14/D7; non-durable state honest

---

#### BK-32.04 — Business Continuity, Backup & Disaster Recovery

- **Parent Volume:** VOL-32 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: own the operational practice of backup cadence, retention, RTO/RPO objectives, restore-testing, and failover — the business-continuity discipline distinct from deploy rollback. Closes gap #25. References (does not own) deploy rollback (VOL-29 BK-29.03 / VOL-32 CH-32.02.03), migration rollback (VOL-35), and the migration ledger/branch-first apply (VOL-27 BK-27.02, ARCH-D11) rather than redefining them; data-loss incidents escalate into Incident Response (BK-32.02). Dependencies: VOL-27 (stores/ledger), VOL-19 (trust-boundary stores), VOL-32 BK-32.02 (incident class). Prerequisites: VOL-27 store inventory frozen; ARCH-D11 (no migration ledger) noted as blocker for restore-with-ledger proof. Cross-References: AGI-DOC-0015 §34 (reliability), constitution export/delete guarantee, manifest §11. Expected Inputs: store inventory, retention policy, Neon/Blob provider backup features. Expected Outputs: backup-and-restore runbook, RTO/RPO objective register, restore-test ledger. Review: architecture + security (trust-boundary data in backups) + reliability.
- **Chapters:**
  - **CH-32.04.01 — Backup cadence, retention windows and per-store coverage** — depends-on: VOL-27 BK-27.01 · references: VOL-19 BK-19.01 (trust-boundary stores), Neon/Blob backup features, constitution §34 · related features: backup ops · est pages: 6 · difficulty: med · review checklist: per-store coverage evidence-cited; no invented provider capabilities; Local-boundary data never backed up to Managed
  - **CH-32.04.02 — RTO/RPO objectives and restore-testing procedure** — depends-on: CH-32.04.01 · references: AGI-DOC-0015 §34, ARCH-D11 (ledger gap) · related features: restore testing · est pages: 6 · difficulty: high · review checklist: objectives Target-marked; BLOCKED ARCH-D11 for ledger-aware restore; no fabricated targets
  - **CH-32.04.03 — Failover and region/provider recovery procedure** — depends-on: CH-32.04.01 · references: manifest §10 deploy targets, §11 risks · related features: failover ops · est pages: 4 · difficulty: high · review checklist: no invented infra; api-gateway target UNKNOWN honored; degraded-mode honest
  - **CH-32.04.04 — Data-loss incident class and GDPR-deletion restore proof (escalation)** — depends-on: CH-32.04.01, VOL-32 BK-32.02 · references: VOL-32 CH-32.02.03 (rollback), VOL-35 (migration rollback), AGI-TRUST-0001, DSAR deletion (referenced) · related features: data-loss incidents · est pages: 4 · difficulty: extreme · review checklist: clean escalation into BK-32.02; rollback referenced not re-owned; deletion-proof honesty

#### BK-32.05 — Capacity Planning & FinOps

- **Parent Volume:** VOL-32 · **Canonical Status:** planned · **Generation Order:** 5
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: own capacity planning and FinOps as an operational planning discipline — cost drivers, forecasting, cost attribution, optimization levers, and budget alerting. Closes gap #26. References (does not own) durable cost/usage telemetry (VOL-21 BK-21.03, ARCH-D14), cost/SLO operation (VOL-32 CH-32.03.03), and provider pricing SSOT (`models.json` / pricing tables) rather than redefining the metric contract or the charge basis. BLOCKED on D7 (Managed Cloud GA cost basis) and ARCH-D14 (non-durable cost telemetry cannot yet back forecasts). Dependencies: VOL-21 (telemetry), VOL-32 BK-32.03 (cost/SLO operation). Prerequisites: durable cost persistence decided (ARCH-D14); GA cost basis decided (D7). Cross-References: AGI-DOC-0015 §38, register §3 D7, register §9 ARCH-D14, manifest §11 (cost-tracker non-durable Map). Expected Inputs: usage telemetry taxonomy, provider pricing SSOT, tier/quota definitions. Expected Outputs: capacity-forecast model, cost-attribution map, budget-alert policy. Review: architecture + reliability + evidence/grounding (non-durable state honest).
- **Chapters:**
  - **CH-32.05.01 — Cost drivers and capacity-forecasting model** — depends-on: VOL-21 BK-21.03 · references: provider pricing SSOT (`models.json`), AGI-DOC-0015 §38 · related features: capacity planning · est pages: 6 · difficulty: high · review checklist: drivers cited to telemetry taxonomy; no invented metrics; Target-marked where telemetry non-durable
  - **CH-32.05.02 — Cost attribution across surfaces, trust modes and tiers** — depends-on: CH-32.05.01 · references: VOL-32 CH-32.03.03 (cost operation), AGI-TRUST-0001 (trust-boundary cost separation) · related features: cost attribution · est pages: 6 · difficulty: high · review checklist: attribution references not re-owns telemetry; Local/BYOK/Managed cost never conflated
  - **CH-32.05.03 — Optimization levers and budget-alert policy** — depends-on: CH-32.05.01 · references: VOL-21 BK-21.03, manifest §11 · related features: budget alerts · est pages: 4 · difficulty: med · review checklist: levers evidence-grounded; alert thresholds Target-marked not invented
  - **CH-32.05.04 — GA cost basis dependency (BLOCKED D7 / ARCH-D14)** — depends-on: CH-32.05.01 · references: register §3 D7, register §9 ARCH-D14, AGI-DOC-0015 §38 · related features: GA cost basis · est pages: 4 · difficulty: high · review checklist: BLOCKED D7 + ARCH-D14; non-durable cost cannot back GA forecasts honestly stated; founder/architecture dependency named; no design-around

#### BK-32.06 — Feature-Flag Operations

- **Parent Volume:** VOL-32 · **Canonical Status:** planned · **Generation Order:** 6
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose: own the operational discipline of feature flags — naming conventions, flag lifecycle and stale-flag cleanup, default-state and fail-closed discipline, kill-switch incident operation, and flag change audit. Closes gap #49. This is the operations slice only; it references (does not own) the four existing flag-governance owners: platform-view governance (VOL-04 CH-04.05.04), composition-layer flags (VOL-05 BK-05.04 / CH-05.04.01), runtime-tier dispatch governance (VOL-07 CH-07.05.03), and mode/product rollout governance (VOL-23 CH-23.06.02). Dependencies: VOL-29 (flags wired in pipeline), VOL-32 BK-32.01 (runbooks), VOL-32 BK-32.02 (kill-switch as incident response). Prerequisites: flag-governance owners scoped. Cross-References: `apps/mobile` `v1FeatureFlags`, AGI-TRUST-0004, AGI-DOC-0015 §45. Expected Inputs: live flag inventory, capability-honesty rules. Expected Outputs: flag-operations runbook, naming/lifecycle convention, kill-switch playbook, flag audit ledger. Review: documentation + reliability (kill-switch) + evidence/grounding (no fake availability).
  - **CH-32.06.01 — Flag naming convention and lifecycle (creation to stale-flag cleanup)** — depends-on: VOL-32 BK-32.01 · references: VOL-05 BK-05.04, VOL-04 CH-04.05.04, `v1FeatureFlags` · related features: flag lifecycle · est pages: 6 · difficulty: med · review checklist: governance owners referenced not re-owned; stale-flag GC operational only; naming-lock honored
  - **CH-32.06.02 — Default-state and fail-closed discipline for flags** — depends-on: CH-32.06.01 · references: AGI-TRUST-0004, capability honesty §12, VOL-07 CH-07.05.03 · related features: flag defaults · est pages: 4 · difficulty: high · review checklist: fail-closed on trust; defaults derive from real capability; no fake availability
  - **CH-32.06.03 — Kill-switch operation and incident-response coupling** — depends-on: CH-32.06.01, VOL-32 BK-32.02 · references: VOL-23 CH-23.06.02 (rollout governance), known-flaws severities · related features: kill-switch · est pages: 4 · difficulty: high · review checklist: kill-switch escalation into BK-32.02; rollout governance referenced not re-owned
  - **CH-32.06.04 — Flag change audit and rollout observability** — depends-on: CH-32.06.01 · references: VOL-32 CH-32.03.01 (metric/event taxonomy operation), AGI-DOC-0015 §45 · related features: flag audit · est pages: 2 · difficulty: med · review checklist: audit references observability operation not redefines taxonomy

## VOL-33 — Reference (Auto-Generatable API/CLI/Config)

- **Volume ID:** VOL-33 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Own the _reference auto-generation pipeline and freshness contract_ — the extraction tooling plus staleness guard that keeps generated API, CLI, config, model-catalog, and migration reference in lockstep with the SSOTs it reads (`models.json`, `provider.ts`, OpenAPI, CLI defs, migration SQL). This volume owns the pipeline; it never owns the source content, which lives in its SSOT/inheriting book. This is the cluster's highest-automation surface.
- **Scope:** IN — generation pipeline architecture, source→reference extraction contracts, freshness/staleness guard, regeneration cadence, generated-doc Status handling. OUT — the API contract itself (API inheriting book), model catalog definitions (models.json SSOT), CLI behavior (AI Runtime spec), DB schema (Database inheriting book) — all referenced, never defined.
- **Owner:** Principal Documentation Systems Engineer
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015). Inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** none toward sibling volumes (leaf hub — other volumes MUST NOT depend on it) · **Prerequisites:** API/Module-Boundary/Database inheriting books or their SSOTs exist to generate from.
- **Review Process:** Documentation review (compiler 10-rule + freshness rule) + Architecture review (SSOT correspondence).
- **Audience:** AI agents, engineers, integrators
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / med / 2 / ~210 pages across 3 books
- **Inherits / References (no duplication):** AGI-DOC-0008 documentation-compiler (rule 8 implementation-grounded, freshness); AGI-DOC-0004 canonical-glossary (term links); models.json/provider.ts SSOT; API + Database + Module-Boundary inheriting books of AGI-DOC-0015.

### Books

#### BK-33.01 — Reference Generation Pipeline & Freshness Contract

- **Parent Volume:** VOL-33 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Define how generated reference is extracted from SSOTs and kept fresh. Cross-refs AGI-DOC-0008. Inputs: SSOT files. Outputs: pipeline + staleness-guard spec. Review: doc + architecture.
  - **CH-33.01.01 — Generation pipeline architecture** — depends-on: none · references: AGI-DOC-0008, scripts/check-generated-artifacts.mjs · related features: doc generation · est pages: 14 · difficulty: high · review checklist: pipeline cited to real scripts
  - **CH-33.01.02 — Source→reference extraction contracts** — depends-on: CH-33.01.01 · references: models.json, provider.ts, OpenAPI · related features: catalog/API extraction · est pages: 14 · difficulty: high · review checklist: SSOT single-owner respected; no content redefinition
  - **CH-33.01.03 — Freshness/staleness guard and regeneration cadence** — depends-on: CH-33.01.01 · references: cross-language mirror correspondence (ARCH-D1/D3) · related features: drift guard · est pages: 12 · difficulty: high · review checklist: references SSOT-drift findings; no invented guards

#### BK-33.02 — Generated API & CLI Reference

- **Parent Volume:** VOL-33 · **Canonical Status:** planned · **Generation Order:** 2
  - **CH-33.02.01 — Generated HTTP/IPC API reference layout** — depends-on: BK-33.01 · references: API inheriting book, openapi · related features: /v1 routes · est pages: 14 · difficulty: high · review checklist: references API spec; defines no routes
  - **CH-33.02.02 — Generated CLI command reference layout** — depends-on: BK-33.01 · references: AI Runtime spec, `agi` CLI defs · related features: CLI commands · est pages: 12 · difficulty: med · review checklist: naming-lock (agi primary); no invented commands
  - **CH-33.02.03 — Error-envelope and safe-to-expose code reference** — depends-on: CH-33.02.01 · references: API inheriting book error allowlist · related features: error codes · est pages: 10 · difficulty: med · review checklist: references allowlist; no leakage

#### BK-33.03 — Generated Config, Catalog & Schema Reference

- **Parent Volume:** VOL-33 · **Canonical Status:** planned · **Generation Order:** 3
  - **CH-33.03.01 — Generated model-catalog reference** — depends-on: BK-33.01 · references: models.json (57 models/15 providers), AGI-AI-0001 · related features: model catalog · est pages: 12 · difficulty: med · review checklist: SSOT-sourced; counts not hardcoded
  - **CH-33.03.02 — Generated config and env-var reference** — depends-on: BK-33.01 · references: env schemas · related features: config · est pages: 10 · difficulty: med · review checklist: no invented env vars
  - **CH-33.03.03 — Generated migration/schema reference** — depends-on: BK-33.01 · references: Database inheriting book, Neon migrations 0001–0042 · related features: DB schema · est pages: 12 · difficulty: high · review checklist: references Database spec; ARCH-D11 noted

---

#### BK-33.04 — Generated SDK & Public API Reference

- **Parent Volume:** VOL-33 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Define how the public API reference and SDK reference are EXTRACTED from their SSOTs and kept fresh — never owning the content. SDK/public-API reference content is OWNED by VOL-26 BK-26.05 (public API platform) and BK-26.06 (versioning/deprecation), referenced as owners; this book owns only the generation pipeline + freshness for that surface, consistent with VOL-33's defining constraint (pipeline, never content). Cross-refs AGI-DOC-0008 (freshness rule), `openapi.json`/`openapi.yaml` SSOT. Inputs: OpenAPI SSOT, VOL-26 BK-26.05/26.06 public contract. Outputs: generated SDK + public-reference layout + staleness guard. Review: doc (compiler 10-rule + freshness) + architecture (SSOT correspondence).
  - **CH-33.04.01 — Generated public API reference layout** — depends-on: BK-33.01 · references: VOL-26 BK-26.05 (public API platform — owner, referenced), `openapi.json`/`openapi.yaml` · related features: public /v1 reference · est pages: 12 · difficulty: med · review checklist: references public-API owner; defines no routes/payloads; SSOT-sourced
  - **CH-33.04.02 — Generated SDK reference and version-pinning** — depends-on: CH-33.04.01 · references: VOL-26 BK-26.05 CH-26.05.03 (SDK pipeline — owner), VOL-26 BK-26.06 (versioning — referenced) · related features: SDK reference · est pages: 12 · difficulty: med · review checklist: SDK content traces to BK-26.05; version pinning references BK-26.06 not restating it
  - **CH-33.04.03 — Freshness guard for public-API/SDK drift** — depends-on: CH-33.04.01, BK-33.01 CH-33.01.03 · references: AGI-DOC-0008 freshness rule, BK-33.01 (freshness contract — referenced) · related features: public-reference drift guard · est pages: 10 · difficulty: med · review checklist: references the BK-33.01 freshness contract; no invented guard; deprecation drift surfaced

## VOL-34 — Research

- **Volume ID:** VOL-34 · **Generation Priority:** P3 · **Difficulty:** med
- **Purpose:** Own the research/exploration corpus — the document class and lifecycle for RFCs, technical spikes, evaluations/benchmarks, and prior-art investigations that feed decisions into the ADR corpus. This is exploratory engineering research; it is explicitly NOT the AGI Research Experience (multi-source research with citations), which is owned by platform-constitution §25 and a features cluster.
- **Scope:** IN — RFC/spike/eval/prior-art document classes, research lifecycle, how research feeds ADRs and owner decisions. OUT — the AGI Research product Experience (§25), implemented features, accepted decisions (those become ADRs in VOL-36).
- **Owner:** Principal AI Systems Researcher
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015). Inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** VOL-36 (research feeds ADRs) · **Prerequisites:** owner-decision-register open findings to investigate.
- **Review Process:** Documentation review (Status lifecycle — research docs are often Target/exploratory, never written as Current fact).
- **Audience:** engineers, AI agents, founders
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** med / med / 2 / ~140 pages across 2 books
- **Inherits / References (no duplication):** AGI-DOC-0010 adr-index (decision sink); AGI-DOC-0014 owner-decision-register (ARCH-D/D findings); AGI-DOC-0013 §25 (AGI Research Experience boundary — referenced to disambiguate, not duplicated).

### Books

#### BK-34.01 — Research Corpus Structure & Lifecycle

- **Parent Volume:** VOL-34 · **Canonical Status:** planned · **Generation Order:** 1
  - **CH-34.01.01 — Research document classes (RFC/spike/eval/prior-art)** — depends-on: none · references: docs/decisions structure · related features: research process · est pages: 10 · difficulty: med · review checklist: NOT the AGI Research Experience; boundary stated
  - **CH-34.01.02 — Research lifecycle and Status handling** — depends-on: CH-34.01.01 · references: AGI-DOC-0006 status lifecycle · related features: doc Status · est pages: 8 · difficulty: low · review checklist: exploratory never written as Current
  - **CH-34.01.03 — From research to ADR and owner decision** — depends-on: CH-34.01.01 · references: AGI-DOC-0010, AGI-DOC-0014 · related features: decision pipeline · est pages: 10 · difficulty: med · review checklist: references decision scheme; no cycle to VOL-36 content

#### BK-34.02 — Evaluation & Prior-Art Method

- **Parent Volume:** VOL-34 · **Canonical Status:** planned · **Generation Order:** 2
  - **CH-34.02.01 — Model/provider evaluation method** — depends-on: BK-34.01 · references: models.json, provider-capability-matrix · related features: model eval · est pages: 12 · difficulty: med · review checklist: capability-honesty; no invented benchmarks
  - **CH-34.02.02 — Architecture spike method and recording** — depends-on: BK-34.01 · references: ARCH-D findings · related features: spikes · est pages: 10 · difficulty: med · review checklist: traces to open ARCH-D items
  - **CH-34.02.03 — Prior-art and competitive-landscape investigation** — depends-on: BK-34.01 · references: platform-constitution differentiators · related features: prior-art · est pages: 10 · difficulty: low · review checklist: no aspirations as fact

---

## VOL-35 — Migration

- **Volume ID:** VOL-35 · **Generation Priority:** P2 · **Difficulty:** high
- **Purpose:** Own the product/data/schema/surface migration playbook — migration sequencing, dual-write/backfill/cutover patterns, rollback strategy, and local-PK-to-cloud-identity mapping operations. This is explicitly NOT the documentation migration plan (AGI-DOC-0012, which owns docs migration), and it references (does not redefine) the migration runner/ledger/SQL mechanics owned by the Database inheriting book of AGI-DOC-0015.
- **Scope:** IN — product/data/schema/surface migration patterns and sequencing, cutover/rollback, identity mapping operation, the Supabase→Neon historical record (as completed migration). OUT — documentation migration (AGI-DOC-0012), concrete migration SQL/ledger schema (Database inheriting book), CI pipeline (VOL-29).
- **Owner:** Principal Data / Migration Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015). Inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** VOL-36 (each migration justified by an ADR), VOL-29 (apply pipeline) · **Prerequisites:** Database inheriting book for mechanics; ARCH-D11 status.
- **Review Process:** Documentation review + Architecture review + Security review (data crossing trust boundaries).
- **Audience:** data engineers, AI agents, founders
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 3 / ~160 pages across 3 books
- **Inherits / References (no duplication):** AGI-DOC-0015 §22/§29 + Database inheriting book; AGI-DOC-0012 (boundary); AGI-DATA-0001 (Neon canonical); CURRENT_DECISIONS #17 Superseded (Supabase→Neon); ARCH-D11.

### Books

#### BK-35.01 — Migration Strategy & Boundary

- **Parent Volume:** VOL-35 · **Canonical Status:** planned · **Generation Order:** 1
  - **CH-35.01.01 — Migration scope and boundary vs documentation migration** — depends-on: none · references: AGI-DOC-0012 · related features: migration governance · est pages: 10 · difficulty: med · review checklist: boundary stated; no overlap with 0012
  - **CH-35.01.02 — Migration sequencing and dependency analysis** — depends-on: CH-35.01.01 · references: VOL-36 ADRs · related features: cutover sequencing · est pages: 12 · difficulty: high · review checklist: each migration ADR-justified
  - **CH-35.01.03 — Supabase→Neon completed-migration record** — depends-on: CH-35.01.01 · references: CURRENT_DECISIONS #17 Superseded, AGI-DATA-0001 · related features: DB migration · est pages: 10 · difficulty: med · review checklist: Superseded pointer correct; no Supabase drift

#### BK-35.02 — Data & Schema Migration Patterns

- **Parent Volume:** VOL-35 · **Canonical Status:** planned · **Generation Order:** 2
  - **CH-35.02.01 — Dual-write, backfill, and cutover patterns** — depends-on: BK-35.01 · references: Database inheriting book · related features: zero-downtime migration · est pages: 12 · difficulty: high · review checklist: references mechanics; defines no SQL
  - **CH-35.02.02 — Local-PK-to-cloud-identity mapping operation** — depends-on: CH-35.02.01 · references: §22 storage, UUIDv7 · related features: identity mapping · est pages: 12 · difficulty: high · review checklist: trust-boundary correct; explicit-consent fork honored
  - **CH-35.02.03 — Migration ledger and verifiability (BLOCKED)** — depends-on: CH-35.02.01 · references: ARCH-D11 (\_prod_migrate.mjs no ledger) · related features: migration runner · est pages: 10 · difficulty: high · review checklist: BLOCKED ARCH-D11; drift state honest

#### BK-35.03 — Surface & Product Migration

- **Parent Volume:** VOL-35 · **Canonical Status:** planned · **Generation Order:** 3
  - **CH-35.03.01 — Surface store-format migration (SQLCipher/JSON/MMKV)** — depends-on: BK-35.02 · references: §22, manifest §8 storage · related features: local store migration · est pages: 12 · difficulty: high · review checklist: per-surface store correct
  - **CH-35.03.02 — User-facing rename/branding migration (Target)** — depends-on: BK-35.01 · references: AGI-NAME-0001, naming lock · related features: branding · est pages: 10 · difficulty: med · review checklist: no code rename instruction; flag-gated Target
  - **CH-35.03.03 — Local↔Cloud product-separation migration** — depends-on: BK-35.02 · references: AGI-PROD-0002, D8 · related features: two-product separation · est pages: 12 · difficulty: extreme · review checklist: trust-boundary preserved; BLOCKED D8 noted

---

## VOL-36 — Architecture Decisions (ADR Corpus)

- **Volume ID:** VOL-36 · **Generation Priority:** P0 · **Difficulty:** med
- **Purpose:** Own the organization and authoring guide for the architecture-decision-record corpus — how individual ADRs are structured, grouped by domain, and indexed against the adr-index. This volume REFERENCES adr-index (AGI-DOC-0010) as the single owner of the ADR scheme and registry; it never redefines the scheme. It is the cluster's foundation for traceability: most other volumes' decisions resolve here.
- **Scope:** IN — ADR authoring guide, domain grouping/navigation, the mapping from owner-decision-register D#/ARCH-D# items to minted ADRs, the locked-register relationship. OUT — the ADR scheme definition (AGI-DOC-0010), the requirement-ID scheme (AGI-DOC-0005), individual product decisions before they are decided (AGI-DOC-0014).
- **Owner:** Principal AI Systems Architect
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015). Inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** none toward sibling volumes (most-foundational in cluster) · **Prerequisites:** adr-index and owner-decision-register exist (they do).
- **Review Process:** Documentation review (compiler) + Architecture review. Any ADR touching AGI-TRUST-\* additionally requires mandatory human security review.
- **Audience:** architects, founders, AI agents
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** med / med / 2 / ~150 pages across 3 books
- **Inherits / References (no duplication):** AGI-DOC-0010 adr-index (single owner of ADR scheme); AGI-DOC-0014 owner-decision-register §3/§9 (D1–D9, ARCH-D1–D17); AGI-DOC-0005 requirement-id-system (load-bearing mirror).

### Books

#### BK-36.01 — ADR Authoring & Organization Guide

- **Parent Volume:** VOL-36 · **Canonical Status:** planned · **Generation Order:** 1
  - **CH-36.01.01 — ADR record structure (references AGI-DOC-0010)** — depends-on: none · references: AGI-DOC-0010 §2/§4 · related features: ADR scheme · est pages: 10 · difficulty: low · review checklist: references not redefines scheme
  - **CH-36.01.02 — Domain grouping and corpus navigation** — depends-on: CH-36.01.01 · references: adr-index registry · related features: ADR index · est pages: 10 · difficulty: med · review checklist: single-owner of index respected
  - **CH-36.01.03 — Superseding and retirement workflow** — depends-on: CH-36.01.01 · references: AGI-DOC-0010 forward process, requirement retirement · related features: ADR lifecycle · est pages: 10 · difficulty: med · review checklist: pointer discipline correct

#### BK-36.02 — Decision-Register to ADR Pipeline

- **Parent Volume:** VOL-36 · **Canonical Status:** planned · **Generation Order:** 2
  - **CH-36.02.01 — D#/ARCH-D# to minted-ADR mapping** — depends-on: BK-36.01 · references: AGI-DOC-0014 §3/§9 · related features: decision pipeline · est pages: 12 · difficulty: med · review checklist: references register; no premature decisions
  - **CH-36.02.02 — Locked-register relationship (CURRENT_DECISIONS)** — depends-on: CH-36.02.01 · references: docs/decisions/CURRENT_DECISIONS.md · related features: locked decisions · est pages: 10 · difficulty: med · review checklist: 21-decision register cited correctly
  - **CH-36.02.03 — AGI-TRUST-\* ADR requirement** — depends-on: CH-36.02.01 · references: AGI-DOC-0015 AC-98, §59 · related features: trust-boundary changes · est pages: 10 · difficulty: high · review checklist: mandatory-security-review rule stated

#### BK-36.03 — Cluster-Spanning ADR Domains (Index)

- **Parent Volume:** VOL-36 · **Canonical Status:** planned · **Generation Order:** 3
  - **CH-36.03.01 — Architecture ADR domain index** — depends-on: BK-36.01 · references: ARCH-D1–D17 · related features: architecture decisions · est pages: 12 · difficulty: med · review checklist: indexes only; no re-litigation
  - **CH-36.03.02 — Product/commercial ADR domain index** — depends-on: BK-36.01 · references: D1–D9 · related features: product decisions · est pages: 10 · difficulty: med · review checklist: references register; pricing not invented
  - **CH-36.03.03 — Delivery/ops ADR domain index** — depends-on: BK-36.01 · references: AGI-OPS-0001, D7 · related features: ops decisions · est pages: 10 · difficulty: med · review checklist: indexes only

---

## VOL-37 — Appendices

- **Volume ID:** VOL-37 · **Generation Priority:** P3 · **Difficulty:** low
- **Purpose:** Own the cross-cutting appendix corpus — abbreviations, master index tables, conversion/lookup charts, deprecated-term maps, and document-ID/requirement-ID registries surfaced as navigation. Defines nothing load-bearing; every entry references its single owner. Serves as the reference back-matter for the whole roadmap.
- **Scope:** IN — abbreviation lists, lookup/index tables, deprecated-term→canonical maps, registry snapshots (referencing owners). OUT — any concept definition (always references owner), the glossary itself (VOL-38), the ADR corpus (VOL-36).
- **Owner:** Documentation Systems Engineer
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015). Inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** none (leaf; references many) · **Prerequisites:** foundation indexes exist.
- **Review Process:** Documentation review (compiler 10-rule, especially no-duplication and link-resolution).
- **Audience:** all readers, AI agents
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** low / low / 1 / ~80 pages across 2 books
- **Inherits / References (no duplication):** AGI-DOC-0009 master-documentation-index; AGI-DOC-0005 requirement-id-system; AGI-DOC-0006 documentation-standards; AGI-DOC-0004 canonical-glossary.

### Books

#### BK-37.01 — Lookup & Index Appendices

- **Parent Volume:** VOL-37 · **Canonical Status:** planned · **Generation Order:** 1
  - **CH-37.01.01 — Abbreviations and acronyms** — depends-on: none · references: canonical-glossary · related features: navigation · est pages: 8 · difficulty: low · review checklist: references glossary; defines nothing
  - **CH-37.01.02 — Document-ID and requirement-ID registry snapshot** — depends-on: none · references: AGI-DOC-0009, AGI-DOC-0005 · related features: ID registries · est pages: 10 · difficulty: low · review checklist: snapshot links to owners; immutability noted
  - **CH-37.01.03 — Cross-cluster volume/book index** — depends-on: none · references: master-documentation-index · related features: roadmap navigation · est pages: 10 · difficulty: low · review checklist: links resolve

#### BK-37.02 — Deprecation & Conversion Appendices

- **Parent Volume:** VOL-37 · **Canonical Status:** planned · **Generation Order:** 2
  - **CH-37.02.01 — Deprecated-term → canonical map** — depends-on: none · references: canonical-glossary Avoid entries · related features: terminology · est pages: 8 · difficulty: low · review checklist: references glossary Avoid list
  - **CH-37.02.02 — Superseded-doc → successor map** — depends-on: none · references: documentation-status-inventory · related features: doc lifecycle · est pages: 8 · difficulty: low · review checklist: pointers resolve
  - **CH-37.02.03 — Conversion/lookup charts (env, surface, target)** — depends-on: none · references: manifest §10, trust-mode-surface-matrix · related features: quick reference · est pages: 8 · difficulty: low · review checklist: no contradiction with canonical matrix

---

## VOL-38 — Glossary

- **Volume ID:** VOL-38 · **Generation Priority:** P0 · **Difficulty:** low
- **Purpose:** Provide navigation and cross-surface term views OVER the canonical-glossary (AGI-DOC-0004), which remains the single owner of all terminology. This volume defines no terms; it surfaces indexes, per-category views, and usage maps that link back to the one authoritative definition, enforcing the single-owner principle for terminology across the 20k+-page corpus.
- **Scope:** IN — glossary navigation views, per-category and per-surface term indexes, term-usage maps, first-use linking guidance. OUT — any term definition (always owned by AGI-DOC-0004), requirement definitions (AGI-DOC-0005), the deprecated-term map (VOL-37).
- **Owner:** Documentation Systems Engineer
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015). Inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** none (leaf; references AGI-DOC-0004) · **Prerequisites:** canonical-glossary exists (it does).
- **Review Process:** Documentation review (compiler rule 4 term-resolution, rule 6 no-duplication).
- **Audience:** all readers, AI agents
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** low / low / 1 / ~60 pages across 2 books
- **Inherits / References (no duplication):** AGI-DOC-0004 canonical-glossary (single owner of terminology); AGI-DOC-0007 cross-reference-system (linking conventions); AGI-DOC-0008 documentation-compiler (term resolution).

### Books

#### BK-38.01 — Glossary Navigation & Category Views

- **Parent Volume:** VOL-38 · **Canonical Status:** planned · **Generation Order:** 1
  - **CH-38.01.01 — Category index over canonical-glossary** — depends-on: none · references: AGI-DOC-0004 (9 categories) · related features: terminology navigation · est pages: 10 · difficulty: low · review checklist: references owner; no redefinition
  - **CH-38.01.02 — Per-surface and per-trust-mode term views** — depends-on: CH-38.01.01 · references: canonical-glossary Surfaces/Trust-modes · related features: surface/trust terms · est pages: 10 · difficulty: low · review checklist: canonical terms exact (trust boundary, Local/BYOK/Managed, Experience, Surface, Capability, SSOT)
  - **CH-38.01.03 — Canonical vs Avoid usage guidance** — depends-on: CH-38.01.01 · references: canonical-glossary Canonical/Avoid · related features: usage discipline · est pages: 8 · difficulty: low · review checklist: defers deprecation map to VOL-37

#### BK-38.02 — Term Usage Map & Linking Guide

- **Parent Volume:** VOL-38 · **Canonical Status:** planned · **Generation Order:** 2
  - **CH-38.02.01 — First-use linking convention (references AGI-DOC-0007)** — depends-on: BK-38.01 · references: cross-reference-system §2 · related features: term linking · est pages: 8 · difficulty: low · review checklist: references linking conventions
  - **CH-38.02.02 — Term-to-document usage map** — depends-on: CH-38.02.01 · references: documentation-compiler term resolution · related features: traceability · est pages: 8 · difficulty: low · review checklist: links resolve; no orphan terms
  - **CH-38.02.03 — Glossary freshness and SSOT-source linkage** — depends-on: CH-38.02.01 · references: canonical-glossary implementation-source citations · related features: term grounding · est pages: 8 · difficulty: low · review checklist: every term traces to impl source via owner

---

## Part H — v1.0 Coverage Expansion Volumes (VOL-39…42)

New owning volumes added in v1.0 to close Phase-E coverage gaps (Band A non-text runtimes; Band B commercial/legal/compliance). Books added to existing volumes (VOL-02/04/06/09/10/11/16/17/19/20/23/24/25/26/28/29/30/32/33) are merged into those volumes' own sections above.

## VOL-39 — Generative Media Runtime (Image / Video / Audio Generation)

- **Volume ID:** VOL-39 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Author the Generative Media Runtime Specification — the request/response and progressive-generation behavior for non-text media generation (image generation, video generation, audio generation as TTS-to-file, and speech-to-text as batch transcription) that no existing volume owns (closes gap #2). VOL-16 owns provider transport/inference and VOL-17 owns stream delivery only; neither owns a generation wire shape or a progressive-generation stream. This volume specifies how a generation request is shaped and how a generation result (including progressive frames/partials) is delivered; it does NOT redefine the ProviderAdapter inference boundary (VOL-16, referenced) or the StreamChunk base (VOL-10/VOL-16, referenced).
- **Scope:** IN — generation request shape (image/video/audio-gen, STT-as-batch-transcription), generation response/artifact handoff, the progressive-generation stream variant, generation-as-tool exposure, generation capability honesty. The **batch request/response (and progressive-gen stream)** boundary is the discriminator: realtime bidirectional voice (turn-taking, interruption, live STT/TTS, voice-session state) is OUT and owned by VOL-40 Voice & Realtime Runtime (referenced). OUT — ProviderAdapter contract, credential flow, retry/fallback/watchdog, catalog fetch (VOL-16, referenced); StreamChunk base normalization (VOL-10/VOL-16, referenced); TTFT SLO/credit reserve (Streaming & Long-Running Task book); generated-file storage/TTL/manifest (VOL-08 BK-08.10 capability + Database Specification, referenced); realtime bidirectional voice (VOL-40).
- **Owner:** AI Runtime lead (Generative Media)
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015)
- **Dependencies:** VOL-16 (Provider Runtime — owns the transport/credential/catalog this runtime calls), VOL-10 (StreamChunk base) · **Prerequisites:** AGI-DOC-0015 §13/§14 ratified; VOL-16 BK-16.1 Canonical; `packages/contracts/types/src/models.json` imageGen/videoGen capability flags (verified present); audio-gen/STT framed Target pending a §14 SSOT addition
- **Review Process:** Architecture review (single inference boundary — generation flows through VOL-16 adapter, no ad-hoc vendor HTTP); capability-honesty gate (no generation modality advertised without a real catalog route); security review for trust-mode scoping of generation egress
- **Audience:** Generative-media runtime engineers, provider-adapter authors (image/video/audio routes), surface engineers exposing generation, security reviewers
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 3 / ~55 pages across 2 books
- **Inherits / References (no duplication):** inherits AGI-DOC-0002, AGI-DOC-0005, AGI-DOC-0007, AGI-DOC-0008; maps to AGI-DOC-0015 inheriting book **AI Runtime Specification** (§13/§14/§54). **Mapping note (no invented runtime name):** the constitution §1177 inheriting-book family contains no standalone 'Generative Media Runtime Specification'; per VOL-13 precedent this volume maps to the existing AI Runtime Specification inheriting book, and whether generative media warrants its own inheriting book is left as a founder/ARCH decision (decisionPoint). References — never restates — ProviderAdapter/credential/resilience/catalog (VOL-16), StreamChunk base (VOL-10 BK-10.01), generated-file capability + storage (VOL-08 BK-08.10 / Database Specification), TTFT SLO + credit reserve (Streaming & Long-Running Task book), realtime bidirectional voice (VOL-40). imageGen/videoGen are catalog-backed (Current); audio-gen and STT-as-transcription are Target pending §14/models.json SSOT addition (referenced, not redefined).

### Books

#### BK-39.01 — Generation Request/Response Wire Shape

- **Parent Volume:** VOL-39 · **Canonical Status:** planned · **Generation Order:** 1
- **Maps to:** AGI-DOC-0015 inheriting book **AI Runtime Specification** — media-generation request/response portion (§13/§14). Disjoint seam: VOL-16 BK-16.1 owns the ProviderAdapter and route object (referenced); this book owns only the generation-specific request/response shape that rides that adapter.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — define the generation request shape (image/video/audio-gen, STT-as-batch) and the generation response/artifact handoff, flowing through the VOL-16 ProviderAdapter. Dependencies — VOL-16 BK-16.1 (adapter/route). Prerequisites — VOL-16 BK-16.1 Canonical; catalog imageGen/videoGen flags. Cross-References — VOL-16 BK-16.1, §13, §14, VOL-08 BK-08.10 (generated-file capability). Expected Inputs — generation prompt + media route. Expected Outputs — generation request/response spec. Review Requirements — architecture review (single boundary); capability-honesty gate.
  - **Chapters:**
  - **CH-39.01.01 — Image-generation request/response (catalog-backed, Current)** — depends-on: VOL-16 BK-16.1 · references: §13, §14, models.json (imageGen flag, verified present, 7 models) · related features: image generation · est pages: 8 · difficulty: high · review checklist: imageGen flow flows through VOL-16 adapter not ad-hoc HTTP; imageGen capability cited from catalog (verified); route object referenced from VOL-16 not redefined
  - **CH-39.01.02 — Video-generation request/response (catalog-backed, Current)** — depends-on: CH-39.01.01 · references: §13, §14, models.json (videoGen flag, verified present) · related features: video generation · est pages: 8 · difficulty: high · review checklist: videoGen capability cited from catalog; long-running generation defers TTFT/credit to Streaming book (referenced)
  - **CH-39.01.03 — Audio-generation (TTS-to-file) & STT-as-batch (Target)** — depends-on: CH-39.01.01 · references: §13, §14, models.json (no audio-gen/STT flag — Target), AGI-AI-0001 · related features: audio generation, transcription · est pages: 7 · difficulty: high · review checklist: framed Target — no catalog flag; closure requires §14/models.json SSOT addition (referenced not redefined); realtime bidirectional voice deferred to VOL-40 (batch-vs-realtime seam guard)
  - **CH-39.01.04 — Generation-result artifact handoff (storage deferred)** — depends-on: CH-39.01.01 · references: VOL-08 BK-08.10 (generated-file capability), Database Specification (storage/TTL) · related features: generated files · est pages: 6 · difficulty: med · review checklist: artifact handoff owned here; generated-file storage/TTL/manifest deferred to VOL-08 BK-08.10 + Database Spec (seam guard); no storage schema invented

#### BK-39.02 — Progressive-Generation Stream & Generation-as-Tool

- **Parent Volume:** VOL-39 · **Canonical Status:** planned · **Generation Order:** 2
- **Maps to:** AGI-DOC-0015 inheriting book **AI Runtime Specification** — progressive-generation stream portion (§13/§54). Disjoint seam: VOL-10 BK-10.01 owns the StreamChunk base discriminated union (referenced); this book owns only the generation-specific progressive stream variant; tool-call protocol is owned by VOL-10 BK-10.06 / VOL-14 (referenced).
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — define the progressive-generation stream (partial frames/previews/percent-complete) and how generation is exposed as a callable tool, building on the StreamChunk base. Dependencies — BK-39.01, VOL-10 BK-10.01 (StreamChunk base), VOL-10 BK-10.06 (tool-call protocol). Prerequisites — BK-39.01 Canonical. Cross-References — VOL-10 BK-10.01/BK-10.06, Streaming & Long-Running Task book (TTFT SLO). Expected Inputs — a long-running generation job. Expected Outputs — progressive-stream + generation-as-tool spec. Review Requirements — architecture review; generation-as-tool inherits tool-call autonomy/approval (VOL-10 BK-10.06).
  - **Chapters:**
  - **CH-39.02.01 — Progressive-generation stream variant (extends StreamChunk base)** — depends-on: BK-39.01, VOL-10 BK-10.01 · references: VOL-10 BK-10.01 (StreamChunk union), §54 · related features: progressive generation · est pages: 7 · difficulty: high · review checklist: StreamChunk base referenced from VOL-10 BK-10.01 not redefined; generation-specific variant owned here; lossless partial delivery stated
  - **CH-39.02.02 — Generation-as-tool exposure (autonomy inherited)** — depends-on: CH-39.02.01, VOL-10 BK-10.06 · references: VOL-10 BK-10.06 (tool-call protocol + approval state machine), §15, §16 · related features: generation-as-tool · est pages: 7 · difficulty: high · review checklist: tool-call protocol + ask-before-acting inherited from VOL-10 BK-10.06 not redefined; generation tool runs in single trust mode
  - **CH-39.02.03 — Generation TTFT/credit reconciliation reference (defers to Streaming)** — depends-on: CH-39.02.01 · references: Streaming & Long-Running Task book (TTFT SLO, credit reserve/refund) · related features: generation cost · est pages: 4 · difficulty: med · review checklist: TTFT SLO + credit reserve deferred to Streaming book (no duplicate SLO/credit model)

## VOL-40 — Voice & Realtime Runtime (Bidirectional Speech)

- **Volume ID:** VOL-40 · **Generation Priority:** P1 · **Difficulty:** extreme
- **Purpose:** Author the Voice & Realtime Runtime Specification — the bidirectional realtime speech behavior (turn-taking, interruption, live STT/TTS, voice-session state, voice cost attribution) that no existing volume owns (closes gap #3). VOL-08 BK-08.08 owns the Voice _capability_ but explicitly marks its ownership boundary UNKNOWN and defers mechanics to a 'Streaming book'; VOL-17 stream-delivery does NOT cover bidirectional voice/turn-taking/interruption (verified). This volume proposes to own those mechanics and to close the VOL-08 BK-08.08 UNKNOWN — **but who owns the voice runtime is a founder/ARCH decision (decisionPoint), not decided here.** It specifies how a realtime voice session runs; it does NOT redefine provider transport/credential (VOL-16, referenced) or the long-running/stream base (VOL-17, referenced).
- **Scope:** IN — bidirectional realtime voice session lifecycle, turn-taking, barge-in/interruption, live (streaming) STT and TTS within a session, voice-session state, voice cost attribution. The **realtime bidirectional session** boundary is the discriminator: batch audio generation (TTS-to-file) and batch STT transcription are OUT and owned by VOL-39 Generative Media Runtime (referenced). OUT — ProviderAdapter/credential/resilience (VOL-16, referenced); generic stream delivery + TTFT SLO + long-running task base (VOL-17 / Streaming & Long-Running Task book, referenced); batch audio-gen / batch STT (VOL-39); WebRTC pairing/signaling transport (Backend realtime book, referenced); voice capability composition/availability (VOL-08 BK-08.08, referenced).
- **Owner:** UNKNOWN — proposed AI Runtime lead (Voice & Realtime); ownership is a founder/ARCH decision that closes the VOL-08 BK-08.08 UNKNOWN-owner gap (see decisionPoints)
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015)
- **Dependencies:** VOL-17 (Execution Runtime — long-running/stream base this runtime extends), VOL-16 (Provider Runtime — transport/credential) · **Prerequisites:** AGI-DOC-0015 §13/§32/§33 ratified; VOL-17 streaming Canonical; voice owner decided (BLOCKED — see decisionPoints); no voice/STT/TTS catalog flag (verified) → Target pending §14 SSOT addition
- **Review Process:** Architecture review (must extend VOL-17 stream base, not duplicate it); mandatory security review (voice session crosses a trust boundary — Local voice never silently streamed to cloud); capability-honesty gate (voice unavailable until a real route exists); ADR to ratify voice-runtime ownership
- **Audience:** Voice/realtime runtime engineers, surface engineers integrating voice, security reviewers, capability owners (VOL-08 BK-08.08)
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** extreme / high / 4 / ~50 pages across 2 books
- **Inherits / References (no duplication):** inherits AGI-DOC-0002, AGI-DOC-0005, AGI-DOC-0007, AGI-DOC-0008; maps to AGI-DOC-0015 inheriting book **AI Runtime Specification** (§13/§54) with the long-running/stream base deferred from §32/§33 (Streaming & Long-Running Task book). **Mapping note (no invented runtime name):** the constitution §1177 inheriting-book family contains no standalone 'Voice & Realtime Runtime Specification'; per VOL-13 precedent this volume maps to the existing AI Runtime Specification inheriting book, and whether voice/realtime warrants its own inheriting book — and who owns it — is a founder/ARCH decision (decisionPoint) that also closes the VOL-08 BK-08.08 UNKNOWN. References — never restates — ProviderAdapter/credential (VOL-16), stream/long-running base + TTFT SLO (VOL-17 / Streaming & Long-Running Task book), batch audio-gen/STT (VOL-39), WebRTC pairing/signaling (Backend realtime book), Voice capability composition (VOL-08 BK-08.08). No voice/STT/TTS catalog flag (verified) → all current claims framed Target/capability-honest, closure requires §14/models.json SSOT addition (referenced not redefined).

### Books

#### BK-40.01 — Realtime Voice Session Lifecycle

- **Parent Volume:** VOL-40 · **Canonical Status:** planned · **Generation Order:** 1
- **Maps to:** AGI-DOC-0015 inheriting book **AI Runtime Specification** — realtime voice-session portion (§13/§54), extending the §32/§33 stream base. Disjoint seam: VOL-17 / Streaming & Long-Running Task book owns the generic stream/long-running base (referenced); VOL-39 owns batch audio-gen/STT (referenced); this book owns only the bidirectional realtime session.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — define the bidirectional realtime voice session lifecycle (open/turn/interrupt/close), turn-taking, and barge-in/interruption, extending the VOL-17 stream base. Dependencies — VOL-17 (stream base), VOL-16 (transport). Prerequisites — VOL-17 streaming Canonical; voice owner decided (BLOCKED). Cross-References — VOL-17 / Streaming & Long-Running Task book, VOL-16, VOL-39 (batch boundary), VOL-08 BK-08.08. Expected Inputs — a realtime voice route (Target). Expected Outputs — voice-session lifecycle spec. Review Requirements — architecture review (extends not duplicates VOL-17); security review (voice trust-mode scoping).
  - **Chapters:**
  - **CH-40.01.01 — Realtime voice session lifecycle (extends VOL-17 stream base)** — depends-on: VOL-17 streaming · references: §32, §33, VOL-17 / Streaming & Long-Running Task book, AGI-DOC-0015 §13 · related features: realtime voice · est pages: 8 · difficulty: extreme · review checklist: generic stream/long-running base referenced from VOL-17 not redefined; bidirectional session owned here; framed Target (no voice catalog flag)
  - **CH-40.01.02 — Turn-taking & barge-in/interruption** — depends-on: CH-40.01.01 · references: §54, VOL-17 · related features: turn-taking, interruption · est pages: 7 · difficulty: extreme · review checklist: turn-taking/interruption is the realtime discriminator owned here; batch STT/TTS deferred to VOL-39 (batch-vs-realtime seam guard)
  - **CH-40.01.03 — Live (streaming) STT/TTS within a session** — depends-on: CH-40.01.01 · references: §54, models.json (no STT/TTS flag — Target), VOL-39 (batch STT/TTS) · related features: live transcription, live speech · est pages: 7 · difficulty: high · review checklist: LIVE in-session STT/TTS owned here; BATCH STT/TTS-to-file deferred to VOL-39 (seam guard); framed Target pending §14 SSOT addition
  - **CH-40.01.04 — Voice-session state & resumption (session book referenced)** — depends-on: CH-40.01.01 · references: §54, Session & Synchronization Specification (resume), VOL-08 BK-08.08 · related features: voice-session state · est pages: 6 · difficulty: high · review checklist: voice-session state owned here; session schema/resume deferred to Session & Synchronization Specification; capability composition deferred to VOL-08 BK-08.08 (seam guard)

#### BK-40.02 — Voice Trust Boundary, Cost & Transport Reference

- **Parent Volume:** VOL-40 · **Canonical Status:** planned · **Generation Order:** 2
- **Maps to:** AGI-DOC-0015 inheriting book **AI Runtime Specification** — voice trust-boundary + cost-attribution portion (§13/§24). Disjoint seam: VOL-16 owns credential/transport (referenced); the Backend realtime book owns WebRTC pairing/signaling (referenced); the Observability book owns the cost/usage taxonomy (referenced); this book owns only voice-specific trust scoping and cost attribution.
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Purpose — specify voice-session trust-boundary scoping (Local voice never silently streamed to cloud) and voice cost attribution, referencing transport/signaling/cost owners rather than re-owning them. Dependencies — BK-40.01, VOL-16 (credential). Prerequisites — voice owner decided (BLOCKED). Cross-References — AGI-TRUST-0001..0004, §24, VOL-16 BK-16.3, Backend realtime book (WebRTC/signaling), Observability book (cost taxonomy). Expected Inputs — active voice session + trust mode. Expected Outputs — voice trust-scoping + cost-attribution spec. Review Requirements — mandatory security review; cost attribution defers durable persistence to Observability book.
  - **Chapters:**
  - **CH-40.02.01 — Voice trust-boundary scoping (Local voice never silently streamed to cloud)** — depends-on: CH-40.01.01 · references: AGI-TRUST-0001, §24, VOL-16 BK-16.3 (credential per boundary) · related features: trust-boundary, voice · est pages: 7 · difficulty: extreme · review checklist: Local-origin voice never silently crosses to cloud; credential/egress referenced from VOL-16/Security book not restated; fail-closed
  - **CH-40.02.02 — Voice cost attribution (durable persistence deferred to Observability)** — depends-on: CH-40.01.01 · references: VOL-21 Observability book (usage/cost taxonomy), Streaming & Long-Running Task book (credit reserve) · related features: voice cost · est pages: 6 · difficulty: high · review checklist: per-session voice cost attribution owned here; durable cost persistence + credit reserve deferred to Observability/Streaming books (no duplicate cost model)
  - **CH-40.02.03 — Transport/signaling reference (WebRTC pairing deferred to Backend)** — depends-on: CH-40.01.01 · references: Backend realtime book (WebRTC pairing/signaling), VOL-16 BK-16.3 · related features: voice transport · est pages: 5 · difficulty: med · review checklist: WebRTC pairing/signaling deferred to Backend realtime book; provider transport deferred to VOL-16 (seam guard); no transport contract invented here

## VOL-41 — Legal & Compliance

- **Volume ID:** VOL-41 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Own the documentation home for the legal-and-compliance program that gates Managed Cloud GA and enterprise/regulated adoption: the customer-facing legal corpus (Terms of Service, Privacy Policy, Data Processing Addendum, Acceptable Use Policy, sub-processor list), the SOC 2 Type II controls inventory and audit-scope mapping, the GDPR/CCPA Data Subject Access Request (DSAR) intake-to-fulfillment workflow with SLA and evidence, and the security-assurance governance program (pen-test cadence, red-team, vulnerability disclosure / bug bounty). This volume owns legal/compliance POLICY, document classes, control inventories, and program governance; it REFERENCES (never re-owns) the runtime enforcement mechanics that satisfy controls — egress/RLS/secrets (VOL-20), data stores and tombstones (VOL-19), backend deletion/export plumbing (VOL-24), observability/audit signals (VOL-21/VOL-32), and the canonical Launch Lock (docs/current/\* via VOL-02). It elaborates no trust-boundary law and authors no enforcement code.
- **Scope:** IN — legal document classes and lifecycle (ToS/Privacy/DPA/AUP/sub-processors/cookie notice); the SOC 2 Type II Trust Services Criteria controls inventory, control-owner mapping, audit-scope/boundary definition, evidence catalog, and ISO 27001/27701 cross-walk; the DSAR/export/deletion workflow as a legal-obligation process (intake, identity verification, 30-day SLA, cross-store fulfillment orchestration, fulfillment evidence, user-initiated self-service export); the security-assurance governance program (recurring pen-test cadence, red-team engagement policy, vulnerability-disclosure policy, bug-bounty scope and safe-harbor). OUT — egress/RLS/secret/SSRF enforcement mechanics (VOL-20, referenced); DB schema/tombstone/blob shapes and the deletion-cascade SQL (VOL-19/VOL-27, referenced); backend export/delete service plumbing and queues (VOL-24, referenced); audit-log immutability and observability signal contracts (VOL-20/VOL-21, referenced); operational incident-response execution and pen-test remediation runbooks (VOL-32, referenced); content moderation / abuse / fraud Trust & Safety (VOL-42); pricing/tier specifics (VOL-02, BLOCKED on D1-D4/D7).
- **Owner:** General Counsel / Head of Legal & Compliance
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** VOL-19 (data stores/tombstones), VOL-20 (trust-plane enforcement, audit-log immutability), VOL-24 (backend export/delete plumbing), VOL-21/VOL-32 (audit/observability + ops execution), VOL-02 (commercial/launch posture) · **Prerequisites:** trust-boundary law frozen (§23-27); RLS-dormant + AUDIT-IMMUT-01 current state acknowledged; packages/contracts/compliance article50/jurisdiction stubs inventoried as current state; canonical Launch Lock present.
- **Review Process:** Compliance/Legal Review (GC sign-off MANDATORY for every book) + Documentation Review (AGI-DOC-0008 10 rules) + Security Review (§57) for any chapter touching controls evidence, DSAR fulfillment, or trust-boundary data; ADR required where a control commitment touches an AGI-TRUST-\* boundary (§59).
- **Audience:** General Counsel, compliance/security engineers, auditors, enterprise buyers, founders, AI agents.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** med / extreme / 5 / ~200 pages across 4 books
- **Inherits / References (no duplication):** AGI-DOC-0013 §12/§23-24 (capability honesty, Cloud Mode gating), docs/current/source-of-truth.md Launch Lock, VOL-20 (egress/RLS/secrets/audit immutability — referenced), VOL-19 (tombstones/stores — referenced), VOL-24 (backend deletion/export plumbing — referenced), VOL-21/VOL-32 (audit signals/ops — referenced), `packages/contracts/compliance` (article50-disclosure, provider-jurisdiction — current state), known-flaws.md (AUDIT-IMMUT-01, AGI-SEC-0001 RLS dormant). Restates no trust-boundary law and authors no enforcement.

### Books

#### BK-41.01 — Customer-Facing Legal Corpus (ToS / Privacy / DPA / AUP)

- **Parent Volume:** VOL-41 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Own the document classes, authoring contract, and lifecycle for the public legal corpus that any Cloud onboarding or enterprise sale requires (closes gap #4). Defines WHAT legal documents exist and how their claims trace to real platform behavior — it does not redefine trust-boundary law or invent capabilities. Depends on VOL-02 (commercial posture), VOL-20 (what is actually enforced). Prereq: trust-mode matrix frozen; Local/BYOK/Managed boundaries acknowledged. Cross-refs AGI-DOC-0013 §23-24, docs/legal (README-only current state). Inputs: trust-mode-surface-matrix.md, provider-jurisdiction registry. Outputs: legal-corpus document-class spec + claim-to-behavior traceability table. Review: GC sign-off + capability-honesty (no legal claim beyond real behavior). BLOCKED on D7 for Managed-GA legal posture.
- **Chapters:**
  - **CH-41.01.01 — Legal document classes and lifecycle (ToS/Privacy/DPA/AUP/cookie/sub-processor list)** — depends-on: VOL-02 · references: AGI-DOC-0013 §23-24, docs/legal · related features: cloud onboarding · est pages: 14 · difficulty: high · review checklist: GC sign-off; document classes enumerated; no claim beyond real behavior
  - **CH-41.01.02 — Privacy Policy claim-to-behavior traceability (Local/BYOK/Managed data flows)** — depends-on: CH-41.01.01 · references: VOL-20 egress enforcement, trust-mode-surface-matrix.md, AGI-TRUST-0001 · related features: capability honesty · est pages: 16 · difficulty: extreme · review checklist: every data-handling claim traces to enforced behavior; no silent-route claim contradicting egress reality
  - **CH-41.01.03 — Data Processing Addendum and sub-processor governance (provider jurisdiction)** — depends-on: CH-41.01.01 · references: `packages/contracts/compliance/provider-jurisdiction.ts`, VOL-04 BK-04.04 served-vs-advertised · related features: enterprise DPA · est pages: 14 · difficulty: high · review checklist: sub-processors grounded in real provider routing; jurisdiction registry referenced not re-owned
  - **CH-41.01.04 — Acceptable Use Policy and enforcement linkage (references T&S)** — depends-on: CH-41.01.01 · references: VOL-42 (T&S enforcement), AGI-DOC-0013 §12 · related features: AUP · est pages: 10 · difficulty: med · review checklist: AUP terms map to VOL-42 enforcement; no enforcement mechanics authored here

#### BK-41.02 — SOC 2 Type II Controls Inventory & Audit Scope

- **Parent Volume:** VOL-41 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Own the SOC 2 Type II Trust Services Criteria controls inventory, control-owner mapping, audit-scope/boundary definition, evidence catalog, and ISO 27001/27701 cross-walk that enterprise and regulated-industry sales require (closes gap #6). Owns the control FRAMEWORK and evidence mapping; references the runtime enforcement that satisfies each control (VOL-20 trust plane, VOL-21 observability, VOL-32 ops). Depends on VOL-20, VOL-21, VOL-32. Prereq: RLS-dormant (AGI-SEC-0001) and AUDIT-IMMUT-01 current state acknowledged — controls marked not-yet-met where enforcement is dormant. Cross-refs AGI-DOC-0013 §12. Inputs: VOL-20 enforcement chapters, `packages/contracts/compliance`. Outputs: controls inventory + audit-scope boundary + evidence catalog. Review: GC + Security (§57) sign-off; honest control-readiness state. BLOCKED on AGI-SEC-0001 (RLS activation) and AUDIT-IMMUT-01 for the controls they back.
  - **CH-41.02.01 — Trust Services Criteria controls inventory and control taxonomy** — depends-on: VOL-20 · references: VOL-20 BK-20.01-04, AGI-DOC-0013 §12 · related features: controls framework · est pages: 18 · difficulty: extreme · review checklist: controls enumerated; each maps to a real or honestly-dormant enforcement mechanism
  - **CH-41.02.02 — Control-owner mapping and audit-scope boundary definition** — depends-on: CH-41.02.01 · references: VOL-20/VOL-21/VOL-24/VOL-32 owners · related features: audit scope · est pages: 14 · difficulty: high · review checklist: every control has a named owner; scope boundary excludes Local-Mode user compute correctly
  - **CH-41.02.03 — Evidence catalog and audit-readiness gaps (RLS dormant, audit immutability)** — depends-on: CH-41.02.01 · references: AGI-SEC-0001, AUDIT-IMMUT-01, VOL-20 BK-20.04 · related features: evidence collection · est pages: 16 · difficulty: extreme · review checklist: BLOCKED on AGI-SEC-0001/AUDIT-IMMUT-01; dormant controls marked not-met, not papered over
  - **CH-41.02.04 — ISO 27001/27701 and regulatory cross-walk (reference)** — depends-on: CH-41.02.01 · references: TSC↔ISO mapping, GDPR/CCPA obligations · related features: regulated adoption · est pages: 12 · difficulty: high · review checklist: cross-walk references controls; no duplicate control re-authored

#### BK-41.03 — DSAR, Data Export & Deletion Workflow

- **Parent Volume:** VOL-41 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Own the GDPR/CCPA Data Subject Access Request and export/deletion workflow as a legal-obligation PROCESS (closes gap #10): request intake, identity verification, the 30-day SLA, cross-store fulfillment orchestration, fulfillment evidence, and user-initiated self-service export. Owns the obligation/process and evidence requirements; references the store tombstones (VOL-19 CH-19.03.03), backend export/delete plumbing (VOL-24), and the deletion-cascade SQL (VOL-27) — does not author them. Depends on VOL-19, VOL-24, VOL-27. Prereq: VOL-19 RLS/deletion tombstone chapter scoped. Cross-refs AGI-DOC-0013 §23-24 (export+delete promise). Inputs: VOL-19 tombstone model, VOL-24 backend. Outputs: DSAR intake-to-fulfillment process + SLA + evidence spec. Review: GC + Security sign-off; deletion verifiability honest. BLOCKED on VOL-19 deletion completeness beyond DB tombstones (blob/sync stores).
  - **CH-41.03.01 — DSAR request intake, identity verification and SLA contract** — depends-on: VOL-19 · references: AGI-DOC-0013 §23-24, GDPR Art.15/17 obligations · related features: DSAR portal · est pages: 12 · difficulty: high · review checklist: 30-day SLA stated; identity verification before fulfillment; no PII in request logs
  - **CH-41.03.02 — Cross-store deletion fulfillment orchestration (references stores)** — depends-on: CH-41.03.01 · references: VOL-19 CH-19.03.03 tombstones, VOL-24 backend delete, blob store · related features: right-to-erasure · est pages: 14 · difficulty: extreme · review checklist: every trust-boundary store enumerated; deletion-beyond-DB gap recorded honestly; no Local-Mode store reach
  - **CH-41.03.03 — User-initiated self-service data export (portability)** — depends-on: CH-41.03.01 · references: VOL-24 export plumbing, VOL-19 stores · related features: data portability · est pages: 10 · difficulty: med · review checklist: export scope per trust boundary correct; managed-only writer respected
  - **CH-41.03.04 — Fulfillment evidence, audit trail and deletion verifiability** — depends-on: CH-41.03.02 · references: VOL-20 BK-20.04 AUDIT-IMMUT-01, VOL-21 audit signals · related features: deletion proof · est pages: 10 · difficulty: high · review checklist: BLOCKED on AUDIT-IMMUT-01; verifiable-deletion evidence requirement stated; mutable-audit gap honest

#### BK-41.04 — Security Assurance Governance (Pen-Test, Red-Team, Vulnerability Disclosure)

- **Parent Volume:** VOL-41 · **Canonical Status:** planned · **Generation Order:** 4
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Own the security-assurance governance PROGRAM (closes gap #29): recurring penetration-test cadence and scope, red-team engagement policy, the public vulnerability-disclosure policy with safe-harbor, and bug-bounty scope/severity/payout governance. Owns the program, cadence, and policy; references the operational execution and remediation runbooks (VOL-32) and the trust-plane attack surface (VOL-20). Depends on VOL-20, VOL-32. Prereq: SECURITY-SUMMARY prior-audit record inventoried as current state. Cross-refs AGI-DOC-0015 §57 (security review). Inputs: prior audit record, VOL-20 attack surface. Outputs: assurance-program governance spec + disclosure policy. Review: GC + Security sign-off; recurring cadence committed, not one-off. BLOCKED on founder decision for bug-bounty funding scope (decisionPoint).
  - **CH-41.04.01 — Penetration-test cadence, scope and recurrence policy** — depends-on: VOL-20 · references: SECURITY-SUMMARY prior audit, VOL-20 attack surface, §57 · related features: recurring pentest · est pages: 12 · difficulty: med · review checklist: recurring cadence (not one-off) committed; scope covers all Managed surfaces
  - **CH-41.04.02 — Red-team engagement policy and trust-boundary attack scenarios** — depends-on: CH-41.04.01 · references: VOL-20 BK-20.01 egress, AGI-TRUST-0001 · related features: red-team · est pages: 10 · difficulty: high · review checklist: trust-boundary scenarios grounded; no Local-Mode user-data targeting
  - **CH-41.04.03 — Vulnerability-disclosure policy and safe-harbor (public)** — depends-on: CH-41.04.01 · references: §57, public disclosure norms · related features: responsible disclosure · est pages: 8 · difficulty: med · review checklist: safe-harbor stated; intake channel grounded; no legal-threat language
  - **CH-41.04.04 — Bug-bounty scope, severity model and remediation handoff (references ops)** — depends-on: CH-41.04.03 · references: VOL-32 incident response, known-flaws severities · related features: bug bounty · est pages: 10 · difficulty: med · review checklist: severity maps to real flaw model; remediation execution deferred to VOL-32; funding scope BLOCKED on founder decision
  - **CH-41.04.05 — Security-assurance governance and audit-evidence linkage (references SOC2)** — depends-on: CH-41.04.01 · references: BK-41.02 controls inventory, §57 · related features: assurance evidence · est pages: 8 · difficulty: med · review checklist: assurance outputs feed SOC2 evidence catalog; no control re-authored

## VOL-42 — Trust & Safety

- **Volume ID:** VOL-42 · **Generation Priority:** P1 · **Difficulty:** high
- **Purpose:** Own the documentation home for the Trust & Safety program that gates Managed Cloud public launch and protects the free-tier/credit economy: abusive-use and jailbreak-attempt detection policy, content-moderation policy and pipeline, fraud and free-tier/credit-abuse prevention, and the enforcement lifecycle (warnings, rate-throttle, suspension, ban, and appeals). This volume owns Trust & Safety POLICY, detection taxonomy, moderation pipeline shape, and the enforcement/appeals lifecycle as a distinct ownership domain; it REFERENCES (never re-owns) the trust-plane enforcement mechanics (VOL-20), the rate-limit-vs-quota mechanics (VOL-17/gap #22), the model-output safety/moderation RUNTIME (gap #23, owned in the AI/Security runtime cluster), the credit-ledger and metering (VOL-24 BK-24.02), and the legal AUP (VOL-41 BK-41.01). It authors no enforcement code and no trust-boundary law.
- **Scope:** IN — abusive-use/jailbreak-attempt detection policy and taxonomy; content-moderation policy, severity tiers, and pipeline shape (intake→classify→action→appeal); fraud and free-tier/credit-abuse prevention policy (account-multiplication, payment fraud, credit-grant abuse); the enforcement lifecycle (warn/throttle/suspend/ban) and the appeals/reinstatement process; T&S transparency reporting. OUT — model-output harm-scoring/refusal RUNTIME contract (gap #23, AI/Security runtime cluster — referenced); trust-plane egress/RLS/secret enforcement (VOL-20 — referenced); rate-limit/quota mechanics and the rate-vs-quota separation (VOL-17 / gap #22 — referenced); credit-ledger reconciliation and metering (VOL-24 BK-24.02 — referenced); the legal AUP document itself (VOL-41 BK-41.01 — referenced); pricing/tier specifics (VOL-02, BLOCKED on D1-D4/D7).
- **Owner:** Head of Trust & Safety
- **Required Constitutions:** Platform Constitution (AGI-DOC-0013), Architecture Constitution (AGI-DOC-0015); inherits AGI-DOC-0002/0005/0007/0008.
- **Dependencies:** VOL-20 (trust-plane + identity/authz), VOL-17 (rate-limit/quota), VOL-24 (credit-ledger/metering), VOL-41 (AUP legal terms), VOL-21 (abuse-signal telemetry) · **Prerequisites:** identity/authn model present (VOL-20 BK-20.02); rate-limit middleware acknowledged (`services/api-gateway` rateLimit.ts); credit-ledger surface scoped (VOL-04 BK-04.04 / VOL-24); the §24.04.04 'abuse controls' rate-limit-only current state inventoried.
- **Review Process:** Trust & Safety Review (Head of T&S sign-off MANDATORY for every book) + Documentation Review (AGI-DOC-0008) + Security Review (§57) for any chapter touching enforcement on trust-boundary data or fraud signals; capability-honesty review (no claimed detection beyond real backend).
- **Audience:** Trust & Safety, security/backend engineers, support, legal, founders, AI agents.
- **Engineering complexity / Documentation complexity / Estimated review cycles / Estimated size:** high / high / 4 / ~145 pages across 3 books
- **Inherits / References (no duplication):** AGI-DOC-0013 §12 (capability honesty), VOL-20 (trust plane / identity / authz — referenced), VOL-17 CH-17.04.03 + gap #22 (rate-limit vs quota — referenced), VOL-24 BK-24.02 + CH-24.04.04 (credit-ledger, abuse controls current state — referenced), gap #23 model-output safety runtime (referenced as distinct owner), VOL-41 BK-41.01 (AUP — referenced), VOL-21 (abuse-signal telemetry — referenced). Restates no enforcement mechanics.

### Books

#### BK-42.01 — Abusive-Use Detection & Content Moderation Policy

- **Parent Volume:** VOL-42 · **Canonical Status:** planned · **Generation Order:** 1
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Own the abusive-use and jailbreak-attempt detection policy/taxonomy and the content-moderation policy and pipeline shape (closes the detection/moderation half of gap #5). Owns the policy, severity tiers, and pipeline stages (intake→classify→action→appeal); references the model-output safety RUNTIME (gap #23) for harm-scoring mechanics and VOL-20 for any trust-boundary data handling — authors neither. Depends on VOL-20, gap #23 owner. Prereq: model-output safety runtime ownership declared (gap #23). Cross-refs AGI-DOC-0013 §12. Inputs: gap #23 runtime contract, suite-contracts safetyDirectives current state. Outputs: detection taxonomy + moderation pipeline policy. Review: T&S sign-off + capability-honesty; moderation only on Managed (never Local) data. BLOCKED on gap #23 runtime owner declaration.
  - **CH-42.01.01 — Abusive-use and jailbreak-attempt detection taxonomy** — depends-on: VOL-20 · references: AGI-DOC-0013 §12, gap #23 model-output safety runtime · related features: abuse detection · est pages: 12 · difficulty: high · review checklist: detection categories grounded; harm-scoring mechanics deferred to gap #23 owner
  - **CH-42.01.02 — Content-moderation policy, severity tiers and pipeline shape** — depends-on: CH-42.01.01 · references: gap #23 runtime, VOL-20 trust boundary · related features: moderation pipeline · est pages: 14 · difficulty: high · review checklist: pipeline stages enumerated; Managed-only scope; no Local-Mode content inspection
  - **CH-42.01.03 — Moderation action mapping and reviewer workflow (references admin console)** — depends-on: CH-42.01.02 · references: VOL-04 BK-04.06 admin/ops console, AUP (VOL-41) · related features: moderation queue · est pages: 10 · difficulty: med · review checklist: actions map to AUP terms; reviewer surface deferred to admin-console book
  - **CH-42.01.04 — Moderation capability-honesty (no claimed coverage beyond real backend)** — depends-on: CH-42.01.01 · references: AGI-DOC-0013 §12, gap #23 runtime reality · related features: capability honesty · est pages: 8 · difficulty: med · review checklist: no moderation badge beyond real detection; honest current coverage

#### BK-42.02 — Fraud & Abuse Prevention (Free-Tier / Credit Economy)

- **Parent Volume:** VOL-42 · **Canonical Status:** planned · **Generation Order:** 2
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Own the fraud and free-tier/credit-abuse prevention policy (closes the fraud half of gap #5): account-multiplication and sockpuppet detection, payment fraud and chargeback-abuse posture, and credit-grant/free-tier-bypass abuse. Owns the prevention policy and signal taxonomy; references the rate-limit/quota mechanics (VOL-17 / gap #22), the credit-ledger and metering (VOL-24 BK-24.02), and identity (VOL-20 BK-20.02) — authors none. Depends on VOL-17, VOL-24, VOL-20. Prereq: credit-ledger surface scoped; rate-vs-quota separation acknowledged. Cross-refs commercial-and-launch.md gating. Inputs: rateLimit.ts current state, billing-catalog tiers. Outputs: fraud-prevention policy + abuse-signal taxonomy. Review: T&S + Security sign-off; abuse signals never leak across trust boundary. BLOCKED on D4/D7 (credit/launch posture) for credit-abuse specifics.
  - **CH-42.02.01 — Account-multiplication, sockpuppet and identity-abuse policy** — depends-on: VOL-20 · references: VOL-20 BK-20.02 identity, Clerk · related features: account abuse · est pages: 12 · difficulty: high · review checklist: identity-abuse signals grounded; no PII over-collection
  - **CH-42.02.02 — Payment fraud and chargeback-abuse posture (references ledger)** — depends-on: VOL-24 · references: VOL-24 BK-24.02 credit-ledger, commercial-and-launch.md · related features: payment fraud · est pages: 12 · difficulty: high · review checklist: BLOCKED on D4/D7; managed-credits-gated honored; refund/chargeback mechanics deferred to VOL-24
  - **CH-42.02.03 — Free-tier-bypass and credit-grant abuse prevention** — depends-on: VOL-17 · references: VOL-17 CH-17.04.03 + gap #22 rate-vs-quota, billing-catalog tiers · related features: free-tier abuse · est pages: 10 · difficulty: med · review checklist: rate-vs-quota referenced not re-owned; free-tier gate grounded
  - **CH-42.02.04 — Abuse-signal taxonomy and telemetry linkage (references observability)** — depends-on: CH-42.02.01 · references: VOL-21 telemetry, single privacy-boundary predicate (VOL-20) · related features: abuse signals · est pages: 8 · difficulty: high · review checklist: signals respect privacy predicate; no cross-boundary leakage

#### BK-42.03 — Enforcement Lifecycle, Appeals & Transparency

- **Parent Volume:** VOL-42 · **Canonical Status:** planned · **Generation Order:** 3
- **Purpose / Dependencies / Prerequisites / Cross-References / Expected Inputs / Expected Outputs / Review Requirements:** Own the enforcement lifecycle and accountability layer (completes gap #5): the warn→throttle→suspend→ban state machine as a POLICY lifecycle, the appeals/reinstatement process, and Trust & Safety transparency reporting. Owns the lifecycle policy and appeals process; references the rate-throttle/quota mechanics (VOL-17), the admin/ops console where actions are taken (VOL-04 BK-04.06), and support intake (VOL-02 BK-02.07) — authors none. Depends on VOL-17, VOL-04 BK-04.06, VOL-02 BK-02.07. Prereq: admin-console feature spec scoped; support product scoped. Cross-refs AGI-DOC-0013 §12. Inputs: rate-limit middleware, admin-console actions. Outputs: enforcement lifecycle + appeals + transparency-report spec. Review: T&S + Legal sign-off; due-process and appeal path required; ban actions audit-logged.
  - **CH-42.03.01 — Enforcement lifecycle state machine (warn/throttle/suspend/ban) as policy** — depends-on: VOL-17 · references: VOL-17 rate-throttle, AUP (VOL-41 BK-41.01) · related features: enforcement ladder · est pages: 12 · difficulty: high · review checklist: lifecycle maps to AUP; throttle mechanics deferred to VOL-17; every action audit-logged
  - **CH-42.03.02 — Appeals and reinstatement process (due process)** — depends-on: CH-42.03.01 · references: VOL-02 BK-02.07 support, VOL-04 BK-04.06 admin · related features: appeals · est pages: 10 · difficulty: med · review checklist: appeal path required for every enforcement action; intake deferred to support product
  - **CH-42.03.03 — Trust & Safety transparency reporting and metrics** — depends-on: CH-42.03.01 · references: VOL-21 telemetry, AGI-DOC-0013 §12 · related features: transparency report · est pages: 8 · difficulty: med · review checklist: metrics grounded in real enforcement data; no inflated coverage claims
  - **CH-42.03.04 — Enforcement audit trail and accountability (references audit log)** — depends-on: CH-42.03.01 · references: VOL-20 BK-20.04 AUDIT-IMMUT-01, VOL-21 · related features: enforcement audit · est pages: 8 · difficulty: high · review checklist: BLOCKED on AUDIT-IMMUT-01; immutable enforcement-action log required; mutable-audit gap honest

## Roadmap Analysis

### Aggregate scope

38 volumes, 144 books, 718 chapters, ~8,170 baseline pages across 7 clusters. This is a documentation program, not a feature build: the dominant work is authoring against an already-ratified constitution set (AGI-DOC-0001..0016), not designing new systems.

### Generation sequence

Build in topological generations (above). The schedule is gated by foundation completeness, not by priority labels — priority (P0..P3) signals business urgency but the DAG signals feasibility, and where they conflict the DAG wins.

- **Gen 1 first, and within Gen 1 sequence the P0 base volumes that everything leans on:** VOL-20 (Security) before VOL-19; VOL-27 (Database) before VOL-26/VOL-24; VOL-16 (Provider) before VOL-10. VOL-01 (Governance) is the meta-root: it owns the compiler/registry that validates every other volume, so it must be authored and operational first even though it has no volume in-edges.
- **Gen 2..Gen 5** follow the edge order. The C4 runtime stack (16→10→15→14→13) is the pacing chain.

### Review sequence

Review bottom-up along the DAG: a volume is reviewed and frozen **before** its dependents are reviewed, because dependents reference (never restate) the owner volume. Concretely, VOL-08 (Capabilities) freezes before VOL-07 (Experiences) review; VOL-20/VOL-19 freeze before VOL-18/VOL-23; VOL-16/VOL-10 freeze before VOL-15/VOL-14/VOL-13. Cross-reference integrity (single-owner rule, AGI-DOC-0007) is checked by the VOL-01 compiler at each merge.

### Approval workflow

1. Author against the constitution; register requirement/cross-ref IDs through the VOL-01 compiler (10-rule validation, AGI-DOC-0008).
2. Books whose decisions are unresolved are approved **as Target** per documentation-constitution Article II (current-vs-target), not blocked from generation. They carry an explicit `blocked-on: D#/ARCH-D#` banner.
3. A Target book flips to **Current** only after its owning decision in the owner-decision-register (AGI-DOC-0014) is resolved and, where an AGI-TRUST-\* invariant changes, an ADR is minted into VOL-36 (per §59).
4. Final sign-off is topological: a volume cannot be marked Current while any volume it depends on is still Target on the referenced section.

### Estimated engineering vs documentation effort

Roughly **85% documentation / 15% engineering.** Engineering pockets:

- **VOL-01** — the documentation compiler, requirement registry, cross-reference validator, and the provider-identity CI cross-check guard implied by ARCH-D1. Real code.
- **VOL-33** — the auto-generation pipeline (API/CLI/config reference from typed contracts). Real code; high leverage.
- **Decision-resolution engineering** — the ARCH-D/D# items gating blocked volumes are not doc tasks; they are product/architecture changes (RLS activation, migration ledger, durable telemetry, provider-SSOT reconciliation, egress-parity convergence). These dominate the engineering budget and sit on the critical path of "Target → Current."

### Complexity analysis

- **Highest structural complexity:** C4 (depth 5, 7 volumes, 27 books, 118 chapters) and C5 (fan-in hub VOL-23 with 5 in-edges; trust-boundary correctness). These two clusters carry the runtime and trust semantics and the most cross-references.
- **Highest fan-in single volumes:** VOL-23 (5), VOL-09 (2), VOL-06 (2), VOL-14 (2), VOL-18 (2). VOL-23 is the integration sink for the whole state/trust cluster.
- **Highest fan-out (most-depended-on, schedule-critical):** VOL-20 (depended on by 19/18/17/21/23), VOL-27 (by 26/24/28), VOL-10 (by 15/14/13/11), VOL-16 (by 10/15), VOL-29 (by 30/31/32). Defects or churn in these ripple widest.
- **Lowest complexity:** C3 (depth 2), C7 reference/glossary tail (VOL-33/34/37/38 are foundation-only, near-leaf).

### Critical-path narrative

The runtime spine VOL-16 → VOL-10 → VOL-15 → VOL-14 → VOL-13 is the longest sequential chain and therefore sets the minimum calendar length regardless of parallel staffing. It is also the chain most exposed to unresolved architecture decisions: VOL-16's SSOT correspondence is blocked on ARCH-D1/D2/D3, and the VOL-16/VOL-10 runtime-convergence record is blocked on ARCH-D4 (three divergent AI runtimes) and ARCH-D5 (11-advertised/4-served asymmetry). So the critical path is doubly at risk — long _and_ gated at its root. Compressing the program means (a) resolving ARCH-D1..D5 early and (b) staffing the C4 chain with a dedicated runtime author so its links are not interleaved with other work.

### Parallelizable work

Because there are no inter-cluster volume edges, all seven cluster roots can be authored concurrently in Wave 0: **VOL-01, VOL-04, VOL-08, VOL-16, VOL-20, VOL-27, VOL-29, VOL-36**, plus the foundation-only near-leaves **VOL-33, VOL-34, VOL-37, VOL-38** and **VOL-12**. Within a cluster, sibling branches parallelize: e.g. in C5, VOL-21 (→20) runs parallel to VOL-19 (→20); in C6, VOL-25 (→26) runs parallel to VOL-24 (→26,27). The reference/glossary tail (VOL-33/34/37/38) can be staffed end-to-end independently.

### Blocked work (each tied to its register dependency)

Blocked books generate as **Target**, not deferred. Mapping (see `blocked[]` for the full transcription): VOL-02 commercial/product/surface books on D1–D9; VOL-03 boundary/cross-cutting books on ARCH-D15/16/17 and ARCH-D1/D4/D5/D6; VOL-04 cloud-services/SSOT on D7/D4/ARCH-D5/ARCH-D1; VOL-05 composition on ARCH-D6/D7; VOL-06 surfaces on LOCAL-CHAT-NOINVOKE-01, D8, D9; VOL-07/08 on ARCH-D6/D5, D5/D7/D8; VOL-16 SSOT on ARCH-D1/D2/D3, runtime-convergence on ARCH-D4/D5; VOL-12 memory reconciliation on ARCH-D9; VOL-14/13 on ARCH-D6; VOL-17/19/20/23/18 on A14/ARCH-D11/AGI-SEC-0001/AUDIT-IMMUT-01/BYOK-RUST-EGRESS-01/ARCH-D10/D7/D8/D14; VOL-24/25/27/28 on ARCH-D5/D14/D7/D6/D11/AGI-SEC-0001/ARCH-D13/AGI-OPS-0001; VOL-29/30/31/32/35 on ARCH-D11/CI-TIER-SCRIPTS-01/ARCH-D12/D13/D14/AGI-OPS-0001/D7.

### Suggested AI workflow strategy (per-volume subagent generation)

- **One generation subagent per volume**, briefed with: its constitution sections (the foundation edges), the owner volumes it must reference (the inter-volume edges), and its blocked-on decision IDs so it writes Target sections honestly rather than inventing Current state.
- **A supervisor/orchestrator** schedules subagents by generation wave and enforces the single-owner rule: a subagent for a dependent volume is dispatched only after its dependency volumes' referenced sections are frozen, and is forbidden from restating owned content (it links instead).
- **A compiler/validator pass (VOL-01 tooling)** runs after each volume merge: 10-rule validation, cross-reference resolution, requirement-ID existence, current-vs-target honesty, and the ARCH-D1 provider-SSOT cross-check.
- **Blocked-decision watcher:** a lightweight agent tracks owner-decision-register state; when a D#/ARCH-D# resolves, it re-dispatches the affected volume's subagent to flip Target → Current and mint the required ADR into VOL-36.

### Future automation opportunities (esp. VOL-33 Reference)

- **VOL-33 is the flagship auto-generation target.** Its only out-edges are foundation (AGI-DOC-0015 API/Module-Boundary specs, AGI-DOC-0004 glossary). API/CLI/config reference should be generated directly from typed sources (route handlers, /v1 contract, CLI command tables, config schemas) and linked to the canonical glossary as single owner — regenerated on every merge, freshness-gated by the compiler. This removes a 28-book cluster's worth of hand-maintenance and eliminates drift.
- **Generalize the VOL-33 pattern:** capability-availability matrices (VOL-08), the trust-mode-surface matrix references (VOL-06), and provider/model SSOT tables (VOL-16) should likewise be generated from `models.json` + provider metadata + the trust-mode matrix, never hand-typed — directly mitigating the ARCH-D1 drift class.
- **Continuous freshness:** wire the compiler's freshness check into CI so any source change that invalidates a generated reference fails the build, making the reference corpus self-maintaining.

---

## Appendix A — Coherence Review & Resolutions

The roadmap was checked by an independent coherence critic for duplicated ownership, dependency cycles, contradictions, and orphans. Findings and their resolutions:

### Duplicated ownership (resolved in [Single-Owner Boundary Resolutions](#single-owner-boundary-resolutions))

1. VOL-17 (Execution Runtime, C5) and VOL-24 (Backend, C6) co-own the same execution mechanics with no deference between them. VOL-17 owns stream gateway/TTFT SLO/resumption (defers §32/§33/§39), tool-loop step limits (§32), credit reserve/refund reconciliation (§33/§39), cron/scheduling + durable queue/event-bus (§30/§31/§34), and offline-queue taxonomy/backoff/rate-limiting/idempotency (§31/§34/§41). VOL-24's ledger entries 'Streaming & long-running task backend mechanics' and 'Background execution / offline / reliability backend mechanics' claim the IDENTICAL set deferring from the SAME §32/§33/§39 and §30/§31/§32/§34/§41. Both defer to the same constitution sections and neither references the other -> double ownership.
2. VOL-19 (Storage Runtime, C5) and VOL-27 (Database, C6) co-own concrete DB schemas, indexes, migration SQL, migration runner/ledger, branch-first apply workflow, and local-PK-to-cloud-identity mapping. VOL-19 entries defer from §29 and §22/§29; VOL-27 ledger entry 'Database data-layer documentation' claims the same schema/indexes/migration-SQL/migration-runner-ledger/branch-first/local-PK mapping deferring from the SAME §22/§29. Same concept, same constitution sections, no cross-deference -> double ownership.
3. VOL-22 (UX Runtime, C5) and VOL-25 (Frontend, C6) both own capability-honest rendering derived from evaluateModelEnvironment. VOL-22: 'Capability-honest UX rendering derived from RuntimeTier and evaluateModelEnvironment'. VOL-25: 'Frontend capability-honesty rendering contract (how pickers/allowlists/badges are derived from evaluateModelEnvironment at the view layer)'. Both reference the §12 Capability Honesty contract but neither defers to the other for the rendering concept itself.
4. VOL-06 (Surfaces, C2) and VOL-25 (Frontend, C6) both own per-surface UI shell / presentation architecture. VOL-06 owns 'Per-surface presentation architecture and host integration' for each surface (web/desktop/mobile/cli/chrome-ext/vscode-ext); VOL-25 ledger entry 'Frontend rendering and surface-shell mechanics documentation (per-surface UI shell, shared UI package contracts, RN-safe shared chat core...)' claims per-surface UI shell as well, with no deference resolving which volume owns the per-surface shell.
5. VOL-28 (Infrastructure, C6) vs VOL-29 (DevOps, C7): VOL-28's edge-implied scope (28->24 deploy targets/CI-CD/observability backends; 28->27 deploy-time provisioning of Neon/Upstash/Blob and branch-first migration apply CI integration) overlaps VOL-29's owned concepts (CI/CD pipeline topology, deploy-target & environment-promotion mapping Vercel/Fly/Neon/Upstash, branch-first apply workflow CI integration, guardrail/check wiring). Both lay claim to deploy targets and branch-first CI integration.

**Resolution:** all five overlaps are governed by the authoritative boundary table above; the named single owner prevails and the other volume references it.

### Dependency cycles

_None. The global dependency graph is acyclic._

### Contradictions (resolved)

1. Dangling/nonexistent edge target: VOL-16 ('from':'VOL-16','to':'VOL-02-architecture') and VOL-12 ('from':'VOL-12','to':'VOL-02-architecture') both point to 'VOL-02-architecture', which is not a node in the volume index. VOL-02 is 'Product' (not architecture); the Architecture volume is VOL-03 and the Architecture Constitution is AGI-DOC-0015. These are Runtime volumes failing to map to a real constitution inheriting-book -> the named 'Runtime volume not mapping to a constitution inheriting-book' contradiction.
2. Incomplete constitution traceability for the runtime clusters: VOL-01 owns the global volume->constitution traceability graph and its acyclicity guarantee, yet the C4/C5 runtime volumes assert 'deferred from §NN' in their ledger prose (e.g. VOL-10 §16/§54, VOL-11 §19, VOL-13 §17/§54, VOL-14 §16/§54, VOL-15 §15/§51/§52/§53, VOL-17 §32/§33/§39, VOL-18 §20/§21/§44, VOL-19 §22/§29, VOL-20 §23-§27/§57, VOL-21 §36/§37/§38, VOL-22 §35/§39/§40, VOL-23 §42/§43/§34) but carry NO dependency edge to AGI-DOC-0015 (only VOL-16/VOL-12 attempt it, and they point at the nonexistent 'VOL-02-architecture'). C2/C3/C7 volumes (VOL-04/05/06/07/08/29/30/31/35/36) correctly edge to AGI-DOC-0013/0015/0003. The asymmetry means the runtime volumes' constitution inheritance is unverifiable in the traceability graph VOL-01 must keep acyclic and complete.
3. VOL-28 (Infrastructure) is declared in the volume index with a cluster and genPriority and has dependency edges (28->24, 28->27), but owns ZERO concepts in the ledger -- the only volume with no owned-concept entries. A volume that inherits/depends but owns nothing contradicts the single-ownership-per-volume premise: its de-facto scope is entirely absorbed by VOL-29 (DevOps) and the Database spec, leaving VOL-28 either redundant or an unowned gap.

**Resolution:** the two dangling `VOL-02-architecture` edges are retargeted to `AGI-DOC-0015`, and all Runtime volumes (VOL-10…23) now carry an explicit inheritance edge to `AGI-DOC-0015` (see the Dependency-graph corrections above). VOL-28 Infrastructure is assigned single ownership of deploy-target topology + provisioned services (boundary table), resolving its empty-ownership finding.

### Orphans

1. No strict orphan exists: no volume has both in-degree 0 AND out-degree 0. Note the intentionally terminal Reference/Appendices/Glossary nodes -- VOL-33 (Reference, edges to AGI-DOC-0015/0004), VOL-37 (Appendices, edge to AGI-DOC-0009), VOL-38 (Glossary, edge to AGI-DOC-0004) -- these depend on foundation docs and are correctly leaf/terminal, not dead nodes. VOL-34 (Research) is also NOT an orphan: it depends on AGI-DOC-0010/0014 (fails the 'depends on nothing' half) and is a legitimate sink. VOL-28 (Infrastructure) is not an orphan (it has out-edges 28->24/28->27) -- its problem is owning no concepts, reported under contradictions, not here.

---

## Appendix B — Blocked-Work Register

These volumes/books cannot be generated honestly until a founder decision (`D#`, [owner-decision-register.md](owner-decision-register.md) §3) or an architecture decision (`ARCH-D#`, §9) is made. They are **not** designed around the undecided trade-off; they wait. Every other volume is unblocked and on the generation path.

- VOL-02 BK-02.04 (Commercial & Launch) — D1 (canonical pricing conflict), D2 (India/INR tier), D3 (hobby/pro_plus tiers), D4 (credit top-ups), D7 (Managed Cloud GA criteria)
- VOL-02 BK-02.02 (Two-Product Model) — D8 (Local vs Cloud product separation scope)
- VOL-02 BK-02.03 (Surface & Experience Map) — D5 (AGI Code mount/gate), D6 (Mobile BYOK timing), D9 (post-Mobile surface sequencing)
- VOL-03 BK-03.02 (Layered Architecture & Boundaries) — ARCH-D15 (inventory-honesty), ARCH-D16 (Rust crate boundary enforcement), ARCH-D17 (bare-string exports)
- VOL-03 BK-03.03 (Cross-Cutting & AI Substrate) — ARCH-D1 (provider-identity SSOT drift), ARCH-D4 (three divergent AI runtimes), ARCH-D5 (cloud 11 / gateway 4 asymmetry), ARCH-D6 (no unified Experience primitive)
- VOL-04 BK-04.04 (Cloud Services / Managed Control Plane) — D7 (Managed Cloud GA), ARCH-D5 (served-provider asymmetry), D4 (credit top-ups / ledger scope)
- VOL-04 BK-04.02 (Shared Infrastructure SSOT) — ARCH-D1 (provider.ts 28 / models.json 25 / desktop Rust 25 drift; no CI cross-check)
- VOL-05 BK-05.03 (Composition of Experiences) — ARCH-D6 / unified-Experience-primitive decision (ChatIntentKind/FocusMode/AgentMode/DeepResearchPanel diverge)
- VOL-06 BK-06.02 (Desktop surface) — LOCAL-CHAT-NOINVOKE-01 (Local desktop chat invoke broken) + disabled-desktop-builds risk
- VOL-06 BK-06.01 (Web) & BK-06.03 (Mobile) — D8 (Local vs Cloud separation) + launch-posture gating (Web invite/waitlist, Mobile Local+Cloud no-BYOK)
- VOL-06 surface sequencing (books after Mobile) — D9 (post-Mobile surface sequencing)
- VOL-07 BK-07.05 (Experience-primitive mapping) — ARCH-D6 (documented Target until converged/ADR-justified)
- VOL-07 BK-07.02 (AGI Code current-vs-target) — D5 (CodeModeHome.tsx unmounted stub: mount or gate)
- VOL-08 capability-availability — ARCH-D5 (no managed availability beyond 4 gateway providers, AC-11), D7 (resolved 2026-06-27 — managed cloud is public alpha, open by default; env kill-switch only), D8 (shared-engine product split)
- VOL-16 BK-16.02 (provider-identity SSOT correspondence) — ARCH-D1 (28/25/25 drift, no CI guard), ARCH-D2 (lmstudio adapter with no models.json entry), ARCH-D3 (misdirected cross-language mirror pointer)
- VOL-16 BK-16.03 & VOL-10 BK-10.01 (runtime convergence record) — ARCH-D4 (three divergent non-shared AI runtimes: TS vs CLI-Rust vs desktop-Rust), ARCH-D5 (11/4 asymmetry, no OpenAI-compat fallback at selection)
- VOL-12 BK-12.03 (local-to-cloud memory reconciliation) — ARCH-D9 (local two-layer decay/daily-log/TF-IDF vs cloud flat-fact projection boundary)
- VOL-14 BK-14.01 (capability-honesty derivation) & VOL-13 (trust-inheritance) — ARCH-D6 (unified Experience primitive, owned by sibling cluster)
- VOL-19 Storage Runtime — ARCH-D11/A11 (prod migrations via hand-rolled \_prod_migrate.mjs, no ledger; committed-vs-live drift unverifiable)
- VOL-20 Security Runtime — AGI-SEC-0001 / register §5 (RLS dormant on live CRUD path, only /sync RLS-bound) + AUDIT-IMMUT-01 (security_audit_logs mutable by app_rls); activation requires ADR per §59
- VOL-20 Security Runtime — BYOK-RUST-EGRESS-01 (egress chokepoint Desktop/Mobile-only; CLI/VSCode/Tauri Rust reqwest outside it); per-surface egress parity needs convergence-vs-divergence ADR
- VOL-23 Platform Runtime — D7 (Managed Cloud GA), D8 (Local vs Cloud separation), ARCH-D14/A14 (non-durable cost/usage telemetry, resets on cold start)
- VOL-17 Execution Runtime — ARCH gap A14 (non-durable cost telemetry) for credit reserve/refund reconciliation; references D4 (credit top-ups)
- VOL-18 Synchronization Runtime — ARCH-D10/A10 (cross-page sync ordering skips entity whose parent has not landed; buffer-vs-skip conflict-matrix open)
- VOL-24 Backend — ARCH-D5 (gateway provider coverage), ARCH-D14 (non-durable cost telemetry / credit ledgering), D7 (Managed Cloud GA)
- VOL-25 Frontend — ARCH-D7 (no RN-safe shared chat core; unified-chat React-DOM-coupled, 0 mobile consumers), ARCH-D6 (no unified Experience primitive for view-layer dispatch)
- VOL-27 Database — ARCH-D11 (hand-rolled migration script, no ledger), AGI-SEC-0001 (RLS dormant on live path; cannot claim enforcement until activation decided)
- VOL-28 Infrastructure — ARCH-D13 (observability facade: Sentry no-op stub, OTel never exported), AGI-OPS-0001 (CI red, desktop release builds disabled, api-gateway deploy target UNKNOWN)
- VOL-30 Testing — CI-TIER-SCRIPTS-01 (test tiers l2-l4 empty, coverage gate non-blocking; enforced-vs-advisory drive-to-zero plan open)
- VOL-29 DevOps & VOL-35 Migration — ARCH-D11 (branch-first apply workflow / migration-runner contract cannot be Current without ledger architecture)
- VOL-29 DevOps — AGI-OPS-0001 / manifest §10 (api-gateway deploy target UNKNOWN, Dockerfile only)
- VOL-31 Release Engineering — AGI-OPS-0001 / manifest §11 (CI red, macOS/Windows desktop release builds disabled), D7 (Managed Cloud GA release-readiness)
- VOL-32 Operations — ARCH-D13 (observability facade), ARCH-D14 (non-durable cost telemetry / SLO runbooks), ARCH-D12 (two divergent loggers: web pino vs shared redacting facade), D7 (Managed Cloud control-plane runbooks)

---

## v1.0 Release Assessment (Phase F)

**Version 1.0 — release candidate.** This expansion added 4 owning volumes and 50 books / 214 chapters of roadmap entries to close the Phase-E coverage gaps; every objectively-required engineering domain now has an owning volume/book (residual unowned domains: none).

Anchored to Phase-E priors (coverage 75, structural 88, dependency 82, KG 68, readiness 65 full / 85 tiered) and moved deliberately.

- **documentationCoverage 75 → 87:** Every Phase-E coverage gap domain (generative media, voice/realtime, embeddings, fine-tuning, RAG, model-output safety, eval/judge, job lifecycle, blob storage, quota, search, notifications, realtime transport, HTTP cache, event-bus, public API/SDK/webhooks, BC/DR, FinOps, flag-ops, perf/load, staging, per-surface threat models, BYOK lifecycle, native-messaging, onboarding/settings/auth UX, i18n, design-system governance, palette/project UX, legal/compliance, trust & safety, commercial product specs) now has an **owning book**. Not 90+ because much of that ownership is Target/blocked content, not yet written Canonical text.

- **architectureCoverage (structural) 88 → 91:** Single-owner-per-concern is preserved across the expansion (every new edge references rather than re-owns; bidirectional cross-refs like BK-06.09↔BK-20.05 keep transport-vs-threat split clean). The orphaned Voice capability (VOL-08 BK-08.08) is now structurally assigned to VOL-40. Held below 92 because two structural decisions remain genuinely open — runtime convergence (ARCH-D4) and the Experience primitive (ARCH-D6) — and the VOL-39/40 ID collision plus the constitution-inheriting-book question are unresolved structural choices.

- **knowledgeGraphCoverage 68 → 70 (deliberately moderate):** The KG **schema** was patched to admit the new owners/edges, but the kg-_ nodes are **not yet instantiated** — instantiation is future generation, not part of this structural expansion. Schema-patched ≠ populated, so this score is intentionally held near prior. It will rise only when kg-_ is actually populated against the new books.

- **engineeringCoverage (dependency) 82 → 85:** Dependency edges are now declared for the previously-unowned runtimes (VOL-39→16/10/08, VOL-40→17/16/39/08, the X3/X4 infra chains), tightening the dependency graph. Held to 85 because the cost/usage backbone several books depend on is non-durable (ARCH-D14) and multiple dependencies resolve only as Target.

- **freezeReadiness 89 (RC/tiered, not full-freeze):** The mechanics layer is internally consistent and ownership-complete, which supports a release-candidate / tiered freeze (compare prior tiered 85). It is **not** a full-freeze number because ARCH-D4 and ARCH-D6 can still change roadmap **structure**, and because freezing the plan is not the platform being ready (the platform is C-grade with live P0s — see implementation dependencies).

## Generation Waves (v1.0)

Volume count: **38 → 42** (the expansion adds **four** distinct new volumes; the digest's `newVolumes` array double-lists VOL-39/VOL-40 because X1 and X2 independently claimed the same IDs — integrator must dedup/renumber). Canonical renumbering assumed below: **VOL-39 Generative Media Runtime, VOL-40 Voice & Realtime Runtime, VOL-41 Legal & Compliance, VOL-42 Trust & Safety**.

**Wave 0 — Root mechanics (must precede everything; gated at root by ARCH-D1..D5)**

- VOL-16 Provider/Transport Adapter (transport/credential/resilience/catalog) — root of the critical path.
- VOL-08 Capability composition, VOL-19 Storage/trust-boundary stores, VOL-20 Security/egress predicate, VOL-27 DB schema, VOL-21 Observability contract — foundational contracts every new book references.

**Wave 1 — Owning-runtime/contract books appended to existing volumes (newly OWNED gap domains)**

- VOL-10: BK-10.01 (multimodal input + prompt-cache, +4ch), BK-10.09 Model-Output Safety/Moderation, BK-10.10 System-Prompt/Template Mgmt, BK-10.11 Eval/LLM-as-Judge.
- VOL-16: BK-16.1 codec negotiation (+1ch), BK-16.6 Embeddings + Vector-Store contract, BK-16.7 Fine-Tuning.
- VOL-11: BK-11.04 Retrieval & RAG Context Packing.
- VOL-17: BK-17.05 Job Lifecycle State Machine. VOL-19: BK-19.04 Blob/Artifact Stores. VOL-23: BK-23.07 Quota Plane, BK-23.08 Search/Semantic Index. VOL-24: BK-24.05 Notification/Push, BK-24.06 Realtime Transport/Presence, BK-24.07 HTTP Caching/Dedup. VOL-28: BK-28.04 Event-Bus/Queue Infra.
- VOL-26: BK-26.05 Public API Platform/SDKs, BK-26.06 Versioning/Deprecation, BK-26.07 BE↔FE↔DB Consistency, BK-26.08 Outbound Webhooks.
- VOL-20: BK-20.05 Per-Surface Threat Models + Native-Messaging bridge, BK-20.06 BYOK Key Lifecycle/Consent-Gate. VOL-06: BK-06.09 Desktop Command/Native-Messaging contracts.
- VOL-25: BK-25.06 Onboarding/Settings/Auth/Session UX, BK-25.07 i18n/L10n, BK-25.08 Design-System Governance. VOL-09: BK-09.04 Keyboard/Palette, BK-09.05 Per-Surface Project/Context UX.
- VOL-30: BK-30.04 Perf/Load Testing. VOL-29: BK-29.04 Cross-Env/Staging. VOL-32: BK-32.04 BC/DR, BK-32.05 Capacity/FinOps, BK-32.06 Feature-Flag Ops.

**Wave 2 — New runtime volumes (Target/blocked; generate structure now, content gated)**

- VOL-39 Generative Media Runtime (2 books / 7ch) — depends on VOL-16, VOL-10, VOL-08. **Target**: no §14/models.json capability flag for image/video/audio-gen, STT, TTS.
- VOL-40 Voice & Realtime Runtime (2 books / 7ch) — depends on VOL-17, VOL-16, VOL-39, VOL-08. **Target / structurally blocked**: voice-runtime owner is UNKNOWN (VOL-08 BK-08.08), needs a new (unregistered) ARCH-D.

**Wave 3 — New commercial/governance volumes (Target; GA-gated)**

- VOL-41 Legal & Compliance (4 books / 17ch) — depends on VOL-20, VOL-19, VOL-24, VOL-32, VOL-02. **Target/blocked** on D7, AGI-SEC-0001 (RLS), AUDIT-IMMUT-01.
- VOL-42 Trust & Safety (3 books / 12ch) — depends on VOL-20, VOL-17, VOL-24, VOL-41. **Target/blocked** on D4, D7, gap #23 (model-output safety runtime ownership), AUDIT-IMMUT-01.
- VOL-02 commercial books (BK-02.05 Team/Enterprise, BK-02.06 Billing, BK-02.07 Support/Status, BK-02.08 Analytics/Growth, BK-02.09 Marketplace) and VOL-04 BK-04.06 Admin/Ops Console — **Target/blocked** on D1–D4, D7, D8.

**Continuous (re-generated every wave)**

- VOL-33 Generated docs — BK-33.04 Generated SDK & Public API Reference added; freshness guard (BK-33.01) keeps VOL-33 auto-generated continuously off the live API/SDK surface as upstream books land.

**Generatable critical path (unchanged by the expansion):**
`VOL-16 → VOL-10 → VOL-15 → VOL-14 → VOL-13`, gated at root by ARCH-D1..D5.

The expansion does **not** lengthen the generatable critical path, because every new volume that would extend it is **Target/blocked** and therefore not on the generatable frontier:

- VOL-40 (Voice & Realtime) sits structurally deepest (`VOL-40 → VOL-39 → VOL-16`) but its owner is UNKNOWN (VOL-08 BK-08.08) and it is blocked pending a new, unregistered ARCH-D.
- VOL-39 (Generative Media) depends on VOL-16/VOL-10/VOL-08 but is Target until §14/models.json adds capability flags for image/video/audio-gen, STT, TTS.

**If those blocks clear**, the longest chain would extend to `VOL-40 → VOL-39 → VOL-16 → VOL-10 → VOL-15 → VOL-14 → VOL-13` (the new runtime volumes attach at the VOL-16 root end, deepening — not rerouting — the existing spine). The commercial volumes (VOL-41/VOL-42/VOL-02/VOL-04) form a parallel governance chain rooted at VOL-20/VOL-24 and do not intersect the runtime critical path.

Net: critical path **unchanged on the generatable frontier**; its _potential_ depth grows by two nodes once the runtime owner (new ARCH-D) and the §14 SSOT capability flags are decided.

After Wave 0 mechanics (VOL-16/08/19/20/27/21) land, the appended-book work is highly parallelizable because each cluster's books reference — never re-own — shared contracts:

**Parallel track A — AI runtime (X1):** VOL-10 BK-10.09/10.10/10.11, VOL-16 BK-16.6/16.7, VOL-11 BK-11.04 generate in parallel once BK-10.01 and BK-16.1 contract amendments are fixed. VOL-39 structure can be drafted in parallel as Target.

**Parallel track B — platform infra (X3):** VOL-17 BK-17.05, VOL-19 BK-19.04, VOL-23 BK-23.07/23.08, VOL-24 BK-24.05/24.06/24.07, VOL-28 BK-28.04 are independent of track A and of each other (cross-refs only).

**Parallel track C — public API / dev platform (X4):** VOL-26 BK-26.05→26.06→26.08 have an internal order (26.06/26.08 depend on 26.05), but the cluster runs in parallel with A/B. BK-33.04 follows BK-26.05/26.06.

**Parallel track D — security/surface (X6):** VOL-20 BK-20.05/20.06 and VOL-06 BK-06.09 (bidirectional cross-ref, single-owner-per-concern) run independent of A/B/C.

**Parallel track E — UX/i18n (X7):** VOL-25 BK-25.06/25.07/25.08 and VOL-09 BK-09.04/09.05 run independent of all runtime tracks; only VOL-25 BK-25.05 (Mobile RN-safe tier) is blocked on ARCH-D7.

**Parallel track F — ops/SRE (X5):** VOL-32 BK-32.04/32.05/32.06, VOL-30 BK-30.04, VOL-29 BK-29.04 run independent of all of the above.

**Serialized (cannot parallelize past their gates):** VOL-40 (after VOL-39 + voice-owner ARCH-D), and the commercial/governance volumes VOL-41/VOL-42/VOL-02/VOL-04 (after D1–D4/D7/D8 and AGI-SEC-0001/AUDIT-IMMUT-01). These generate as Target structure in parallel but cannot reach Canonical until their decisions clear.

VOL-33 regenerates continuously across all tracks.

**Recommendation: freeze v1.0 as a versioned milestone under a CONDITIONAL / TIERED freeze (release candidate). Do NOT declare an unconditional full freeze.**

**Tier 1 — FROZEN now (mechanics layer):** The single-owner-per-concern mechanics layer is internally consistent and ownership-complete across all seven clusters. Every Phase-E coverage gap now has an owning book; the expansion edges reference rather than re-own shared contracts; the previously-orphaned Voice capability is structurally assigned. This layer is stable enough to freeze as the v1.0 baseline and generate against.

**Tier 2 — RELEASE CANDIDATE, not frozen (volume structure):** Two open decisions are **structural** — they change the roadmap's shape, not merely blocked content:

- **ARCH-D4 (runtime convergence):** which volume OWNS the converged runtime is undecided. This can move ownership of the converged runtime between volumes — a structural reshape, so the volume layer cannot be unconditionally frozen.
- **ARCH-D6 (Experience primitive):** whether VOL-07's Experience primitive exists as drawn is unresolved. If it does not, VOL-07's structure changes.

Until ARCH-D4 and ARCH-D6 converge (or are ADR-justified), the volume structure stays RC. Secondary structural items also pin it to RC: the VOL-39/VOL-40 ID collision (4 new volumes needing renumber), the new-volume constitution-inheriting-book question, and the still-unregistered ARCH-D for voice-runtime ownership.

**Critical caveat — freezing the plan is NOT the platform being ready.** `freezeReadiness` (89) scores the _roadmap_, not the product. The platform is **C-grade with live P0s**: broken Local chat (LOCAL-CHAT-NOINVOKE-01), dormant RLS (AGI-SEC-0001), observability facade (ARCH-D13), non-durable cost telemetry / credit-loss path (ARCH-D14), missing audit immutability (AUDIT-IMMUT-01), ledger-less migrations (ARCH-D11), the desktop Share trust-boundary leak, and the extension computer-use allow-all default. These gate the PLATFORM and remain open regardless of the roadmap freeze. Locking v1.0 of the documentation roadmap must not be read as readiness to ship — managed cloud is now public alpha and open by default (founder decision, 2026-06-27; the private-beta/waitlist launch gate is removed, `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is a kill-switch only), but its ledger/abuse/fraud/refund/retention/deletion controls must keep pace with public usage rather than gate access, and they are not yet proven.
