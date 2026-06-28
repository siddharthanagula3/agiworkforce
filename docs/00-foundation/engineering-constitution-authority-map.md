# The AGI Engineering Constitution Authority Map

Status: Current
Owner: Founder + platform lead
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: Every engineer and AI agent authoring or generating a specification — the constitutional inheritance router
Layer: docs/00-foundation
Document ID: AGI-DOC-0017
Authority: This is a **routing and governance map, NOT a new constitutional authority**. The [Platform Constitution](platform-constitution.md) (`AGI-DOC-0013`) and [Architecture Constitution](architecture-constitution.md) (`AGI-DOC-0015`) remain the **only** constitutional authorities. This map defines no new engineering law. It routes every engineering domain, roadmap volume, book, and chapter to the governing sections and rules of those two constitutions, identifies the few genuinely-uncovered domains, and **proposes Architecture Constitution amendments (for founder approval)** where law is genuinely missing. It is overridden by the two constitutions, the implementation, and explicit ADRs.
Related: [platform-constitution.md](platform-constitution.md), [architecture-constitution.md](architecture-constitution.md), [master-documentation-roadmap.md](master-documentation-roadmap.md), [documentation-constitution.md](documentation-constitution.md), [owner-decision-register.md](owner-decision-register.md), [adr-index.md](adr-index.md), [requirement-id-system.md](requirement-id-system.md)

---

## Preamble — why a map, not a 56-document library

A literal "Engineering Constitution Library" of 56 per-domain constitutions was evaluated and **rejected as duplication**. Empirical finding: **every candidate domain already has a dedicated section in the Architecture Constitution** (`AGI-DOC-0015`, 60 sections + a 107-rule immutable canon `AC-01…AC-107` grouped by Boundaries & Layering, AI Substrate, State & Sync, Trust, Interfaces & Execution, Operability, Lifecycle & Extensibility, Governance), and **every roadmap volume already declares its governing constitutions** (45 `Required Constitutions:` declarations across 42 volumes + a Traceability Model in `AGI-DOC-0016`). Authoring 56 documents would restate that law into 56 surfaces requiring perpetual hand-sync — manufacturing the architectural drift and duplicated engineering philosophy the layer is meant to prevent, and violating the single-owner rule ([documentation-constitution.md](documentation-constitution.md), [cross-reference-system.md](cross-reference-system.md)).

**This map is the non-duplicative realization of that intent.** It establishes that an "engineering constitution for domain X" is a **projection** — a curated authority pointer to the AC sections/rules + roadmap owner that already govern X — never restated law. The two constitutions remain the sole authorities; every future Runtime, Platform, Surface, Experience, Capability, and Feature specification inherits from them **through this map**.

**Through-line (stated plainly):** a constitutional/documentation layer is governance, not product readiness. The platform is C-grade with live P0s (see §11). This map does not change that; the highest-leverage work remains the P0s and the `D1–D9` decisions in [owner-decision-register.md](owner-decision-register.md).

---

## 1. Engineering Constitution Library (as projections) · 4. Constitutional Ownership Matrix

The "library" is this matrix: each engineering domain → its **single owning constitutional authority** (AC section(s) + AC-rule group) and its roadmap spec owner. No domain owns its own law; all law is owned by `AGI-DOC-0015`/`AGI-DOC-0013`. `▲` marked a genuine-law gap; **all four are now CLOSED** by the v1.1 amendments (§61/§62/§63 + `AC-107` integrated into §34).

### Boundaries & Layering (owns AC-01…07)

| Engineering domain         | Governing AC §§ | AC-rules            | Roadmap owner |
| -------------------------- | --------------- | ------------------- | ------------- |
| Platform Engineering       | §3–8            | AC-01…07            | VOL-04        |
| Infrastructure Engineering | §8, §47         | AC-80, AC-81        | VOL-28        |
| Configuration Engineering  | §8, §45         | AC-69, AC-77, AC-78 | VOL-04/28     |
| Build System Engineering ▲ | §47             | AC-81, AC-85        | VOL-04/29     |
| Packaging Engineering      | §48             | AC-79, AC-82        | VOL-04        |

### AI Substrate (owns AC-08…18)

| Engineering domain             | Governing AC §§ | AC-rules     | Roadmap owner |
| ------------------------------ | --------------- | ------------ | ------------- |
| AI Engineering                 | §13–17, §54     | AC-08…18     | VOL-10        |
| Runtime Engineering            | §54, §7         | AC-08, AC-13 | VOL-10        |
| Provider Engineering           | §13, §14        | AC-08…12     | VOL-16        |
| Agent Engineering              | §16             | AC-17        | VOL-14        |
| Workflow Engineering           | §17             | AC-17, AC-18 | VOL-13        |
| Automation Engineering         | §17             | AC-18        | VOL-13        |
| Tool Engineering               | §15             | AC-14, AC-15 | VOL-15        |
| MCP Engineering                | §53             | AC-55        | VOL-15        |
| Plugin & Extension Engineering | §51, §52        | AC-54, AC-56 | VOL-15/06     |
| AI Safety Engineering ▲        | §15, §16        | AC-15, AC-53 | VOL-10/42     |

### State & Sync (owns AC-19…33)

| Engineering domain          | Governing AC §§ | AC-rules            | Roadmap owner |
| --------------------------- | --------------- | ------------------- | ------------- |
| Context Engineering         | §19             | AC-19, AC-20        | VOL-11        |
| Memory Engineering          | §18             | AC-21, AC-22        | VOL-12        |
| Synchronization Engineering | §21, §44        | AC-23…31            | VOL-18        |
| Storage Engineering         | §22             | AC-32, AC-33        | VOL-19        |
| Database Engineering        | §29             | AC-49…51            | VOL-27        |
| Data Governance             | §22, §24, §29   | AC-32, AC-33, AC-49 | VOL-19/27     |

### Trust (owns AC-34…42)

| Engineering domain             | Governing AC §§ | AC-rules            | Roadmap owner |
| ------------------------------ | --------------- | ------------------- | ------------- |
| Security Engineering           | §23             | AC-34…42            | VOL-20        |
| Privacy Engineering            | §24             | AC-35, AC-38, AC-65 | VOL-20        |
| Identity Engineering           | §25             | AC-47, AC-48        | VOL-20        |
| Authentication & Authorization | §26, §27        | AC-44…46, AC-49     | VOL-20        |
| Local Mode Engineering         | §42             | AC-62               | VOL-23        |
| Cloud Mode Engineering         | §43             | AC-86               | VOL-23        |

### Interfaces & Execution (owns AC-43…59)

| Engineering domain                | Governing AC §§ | AC-rules            | Roadmap owner |
| --------------------------------- | --------------- | ------------------- | ------------- |
| API Engineering                   | §28             | AC-43…48, AC-63     | VOL-26        |
| Networking Engineering            | §13, §28        | AC-08, AC-63        | VOL-24/26     |
| Backend Engineering               | §4, §28–33      | AC-43…59            | VOL-24        |
| Event / Background / Long-Running | §30, §31, §32   | AC-69, AC-70, AC-71 | VOL-17        |
| Streaming Engineering             | §33             | AC-57…59            | VOL-17        |
| SDK Engineering                   | §28, §50        | AC-43, AC-85        | VOL-26/33     |

### Operability (owns AC-60…76)

| Engineering domain                | Governing AC §§ | AC-rules     | Roadmap owner |
| --------------------------------- | --------------- | ------------ | ------------- |
| Reliability Engineering           | §34             | AC-60…62     | VOL-23        |
| Error Handling Engineering        | §35             | AC-63, AC-64 | VOL-22        |
| Observability Engineering         | §36             | AC-65, AC-66 | VOL-21        |
| Logging Engineering               | §37             | AC-67        | VOL-21        |
| Telemetry & Analytics Engineering | §38             | AC-65, AC-68 | VOL-21/02     |
| Performance Engineering           | §39             | AC-72        | VOL-22        |
| Scalability Engineering ▲         | §34, §39        | AC-60, AC-72 | VOL-23        |
| Caching Engineering               | §40             | AC-73        | VOL-22        |
| Offline Engineering               | §41             | AC-74        | VOL-23        |
| Billing Engineering               | §43             | AC-76, AC-86 | VOL-02/24     |
| Commercial Platform Engineering   | §43             | AC-86        | VOL-02        |

### Lifecycle & Extensibility (owns AC-77…86)

| Engineering domain               | Governing AC §§ | AC-rules     | Roadmap owner |
| -------------------------------- | --------------- | ------------ | ------------- |
| Feature-Flag Engineering         | §45             | AC-77, AC-78 | VOL-29        |
| Dependency Management            | §46             | AC-80        | VOL-04        |
| Monorepo Engineering             | §47             | AC-81        | VOL-04        |
| Shared-Package Engineering       | §48             | AC-79, AC-82 | VOL-04        |
| Versioning Engineering           | §49             | AC-83, AC-84 | VOL-31        |
| Compatibility Engineering        | §50             | AC-85        | VOL-31        |
| Migration Engineering            | §49, §29        | AC-51, AC-85 | VOL-35        |
| Deployment & Release Engineering | §47, §49, §50   | AC-83…85     | VOL-31/28     |
| DevOps Engineering               | §47, §58        | AC-94        | VOL-29        |

### Governance (owns AC-87…100)

| Engineering domain             | Governing AC §§ | AC-rules        | Roadmap owner                                                                                           |
| ------------------------------ | --------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| Testing Engineering            | §55             | AC-87…89        | VOL-30                                                                                                  |
| Quality Engineering            | §55, §58        | AC-87…89, AC-94 | VOL-30                                                                                                  |
| Documentation Engineering      | §56             | AC-90, AC-91    | VOL-01 + [documentation-constitution.md](documentation-constitution.md) (`AGI-DOC-0002`, primary owner) |
| Security & Architecture Review | §57, §58        | AC-92…94        | VOL-01/20                                                                                               |

### Surfaces & Cross-Platform UX (cross-cutting; law in §9–§11, §35, §39–§40)

| Engineering domain                                         | Governing AC §§         | AC-rules                   | Roadmap owner              |
| ---------------------------------------------------------- | ----------------------- | -------------------------- | -------------------------- |
| Frontend Engineering                                       | §10, §11, §35, §39, §40 | AC-57, AC-63, AC-73, AC-82 | VOL-25                     |
| UX Engineering                                             | §10, §35, §39           | AC-61                      | VOL-22/25                  |
| Mobile / Desktop / CLI / Browser-Ext / VS-Code Engineering | §9, §10                 | AC-03, AC-41, AC-82        | VOL-06 (per-surface books) |
| Accessibility Engineering ▲                                | §10                     | —                          | VOL-25                     |
| Internationalization Engineering ▲                         | —                       | —                          | VOL-25                     |
| Trust & Safety Engineering ▲                               | §15, §16, §23–27        | AC-15, AC-53               | VOL-42                     |

**Result: 56 candidate domains → 0 require a new constitution.** 52 are fully owned by existing AC sections + rules; **4 genuinely-thin-law gaps were CLOSED by Architecture Constitution v1.1** (ratified 2026-06-25): §61 Accessibility & i18n (`AC-101/102`), §62 AI Safety & Output Moderation (`AC-103/104`), §63 Build/Release/Supply-Chain Integrity (`AC-105/106`), and `AC-107` (statelessness, integrated into §34 — no §64 created). Per your rule (fewer than five genuinely-new constitutional domains ⇒ amend the AC, do not create constitutions), **the genuine gaps become Architecture Constitution amendments, not new constitutions.**

---

## 2. Constitutional Hierarchy

```
Platform Constitution (AGI-DOC-0013) ── highest PRODUCT authority (why)
        ↓ inherits
Architecture Constitution (AGI-DOC-0015) ── highest ENGINEERING authority (how); 60 §§ + AC-01…107
        ↓ routed by
Engineering Constitution Authority Map (AGI-DOC-0017) ── THIS MAP (router, no new law)
        ↓ governs
Master Documentation Roadmap v1.0 (AGI-DOC-0016) ── volume/book/chapter plan, each carrying Required Constitutions
        ↓ generates
Runtime → Platform → Surface → Experience → Capability → Feature Specifications
        ↓ realized by
Implementation (the running source — overrides on present fact; ADRs override on decision)
```

The map is a **router between AC and the specifications**, not a fourth authority tier. Only the two constitutions hold authority; the map resolves which of their sections/rules govern any given artifact.

---

## 3. Constitutional Dependency Graph

There are exactly **two constitutional nodes** and one router; the dependency graph is therefore trivially acyclic:

- `AGI-DOC-0013` (Platform Constitution) — root product authority; depends on nothing.
- `AGI-DOC-0015` (Architecture Constitution) — inherits from `AGI-DOC-0013`; MUST NOT contradict it; owns all engineering law (`AC-01…107`).
- `AGI-DOC-0017` (this map) — inherits from both; **introduces no authority edge of its own** (a router cannot create a cycle because it owns no law).
- `AGI-DOC-0002` (Documentation Constitution) — governs documentation-as-a-discipline; the Documentation Engineering domain is owned here, not by a new constitution.

No domain-level constitutions exist, so **no duplicated ownership, no conflicting authority, and no circular inheritance are possible by construction.**

---

## 5. Constitutional Inheritance Rules

1. **Every future specification MUST declare its governing constitutions by reference, never by restatement.** A spec's front matter names the AC sections/rules and Platform Constitution parts that govern it (resolved via §1 and §6 of this map); it copies none of their text.
2. **A domain has exactly one owning authority** — the AC section/rule-group in §1. A spec that needs a rule cites the rule ID (`AC-NN`); it does not paraphrase it.
3. **The two constitutions are the only sources of engineering law.** If a spec needs law that does not exist, it does not invent it locally — it raises a proposed AC amendment (§9 process) for founder approval.
4. **Implementation and explicit ADRs are the only overrides** of a constitution; a spec never overrides a constitution.
5. **Volume → governing constitutions** is owned by §6; **book → governing constitutions** is the volume's set ∩ the book's declared inheriting-book; **chapter → governing constitutions** is the book's set, refined by the specific `§NN` / `AC-NN` citations already present in the chapter's roadmap entry.

---

## 6. Volume → Governing Constitutions (output 11, volume level)

Every roadmap volume already declares `Required Constitutions` in `AGI-DOC-0016`; this is the consolidated lookup. **PC** = Platform Constitution; **AC** = Architecture Constitution (always required); the AC-inheriting-book column names the §§ that govern.

| Vol | Name                              | PC          | Governing AC §§ (inheriting book)               |
| --- | --------------------------------- | ----------- | ----------------------------------------------- |
| 01  | Governance & Documentation System | —           | §56–60 + `AGI-DOC-0002`                         |
| 02  | Product                           | Parts I–III | §43 (referenced; product not engineering law)   |
| 03  | Architecture                      | —           | §1–8 (elaborates the canon)                     |
| 04  | Platform                          | Part III    | §3–8, §46–48                                    |
| 05  | Applications                      | Part I      | §9–11                                           |
| 06  | Surfaces                          | Part I      | §9, §10                                         |
| 07  | Experiences                       | Part I      | §11, §12                                        |
| 08  | Capabilities                      | Part I      | §12                                             |
| 09  | Features                          | Part I      | §12                                             |
| 10  | AI Runtime                        | —           | §13–17, §54                                     |
| 11  | Context Runtime                   | —           | §19                                             |
| 12  | Memory Runtime                    | —           | §18                                             |
| 13  | Workflow Runtime                  | —           | §17                                             |
| 14  | Agent Runtime                     | —           | §16                                             |
| 15  | Tool Runtime                      | —           | §15, §51–53                                     |
| 16  | Provider Runtime                  | —           | §13, §14                                        |
| 17  | Execution Runtime                 | —           | §30–33                                          |
| 18  | Synchronization Runtime           | —           | §20, §21, §44                                   |
| 19  | Storage Runtime                   | —           | §22, §29                                        |
| 20  | Security Runtime                  | Part IV     | §23–27, §57                                     |
| 21  | Observability Runtime             | —           | §36–38                                          |
| 22  | UX Runtime                        | —           | §35, §39, §40                                   |
| 23  | Platform Runtime                  | Part III    | §34, §41–43                                     |
| 24  | Backend                           | —           | §28, §30–33                                     |
| 25  | Frontend                          | Part I      | §10, §11                                        |
| 26  | API                               | —           | §28                                             |
| 27  | Database                          | —           | §29                                             |
| 28  | Infrastructure                    | —           | §8, §47                                         |
| 29  | DevOps                            | —           | §45, §58                                        |
| 30  | Testing                           | —           | §55                                             |
| 31  | Release Engineering               | —           | §49, §50                                        |
| 32  | Operations                        | —           | §34–38                                          |
| 33  | Reference                         | —           | §28, §29 (generated from SSOTs)                 |
| 34  | Research                          | —           | §60                                             |
| 35  | Migration                         | —           | §49, §29                                        |
| 36  | Architecture Decisions            | —           | §59                                             |
| 37  | Appendices                        | —           | (inherits parent)                               |
| 38  | Glossary                          | —           | `AGI-DOC-0004` (canonical-glossary owner)       |
| 39  | Generative Media Runtime          | —           | §13, §54 (+ proposed §62 once approved)         |
| 40  | Voice & Realtime Runtime          | —           | §33, §54 (owner UNKNOWN — see §12)              |
| 41  | Legal & Compliance                | Part IV     | §24 (+ proposed §61 a11y/i18n adjacency)        |
| 42  | Trust & Safety                    | Part IV     | §15, §16, §23–27 (+ proposed §62 once approved) |

**Book & chapter mapping (the deterministic rule, not 201/782 restated rows):** re-listing every book and chapter here would re-encode the roadmap's own per-book `Maps to:` declarations and per-chapter `§NN`/`AC-NN` citations — a duplication this map forbids. Instead: **a book's governing constitutions = its volume's set (above) ∩ the book's declared inheriting-book; a chapter's = its book's set, refined by the `§`/`AC-` anchors already in its roadmap entry.** This resolves all 201 books and 782 chapters deterministically with zero duplicated rows.

---

**v1.1 cross-cutting traceability (added 2026-06-25):** §61 (Accessibility & i18n, `AC-101/102`) additionally governs VOL-06/07/25/41; §62 (AI Safety & Output Moderation, `AC-103/104`) additionally governs VOL-10/39/42; §63 (Build/Release/Supply-Chain Integrity, `AC-105/106`) additionally governs VOL-28/29/31; `AC-107` (statelessness, §34) governs every Managed-tier runtime/backend volume (VOL-17/23/24).

## 7. Constitutional Review Process · 8. Versioning · 8b. Change Management · 9b. Quality Gates · 10. Approval Workflow

These govern the **constitutional layer itself**; they reference existing process owners and add only the amendment gate.

- **Review (output 6):** A change to a constitution follows AC §57 (Security Review, mandatory for any `AGI-TRUST-*` touch) and §58 (Architecture Review). This map changes only via the Documentation Constitution's review (`AGI-DOC-0002`) — it owns no law to review.
- **Versioning (output 7):** Constitutions are versioned per AC §49 and the document Status lifecycle (`documentation-standards.md`); an accepted change is a new immutable revision, never an in-place edit of a ratified rule (AC-96).
- **Change Management (output 8):** Every constitutional change MUST be a superseding ADR (AC-95, AC-97) recorded in [adr-index.md](adr-index.md) and mirrored as a requirement ID (AC-96). Silent drift is a defect, never an amendment (AC-97).
- **Quality Gates (output 9):** A proposed amendment passes only if it (a) introduces law genuinely absent from `AC-01…107` (no duplication), (b) is enforceable/checkable (AC-07, AC-99), (c) does not contradict the Platform Constitution, and (d) carries a founder-approved ADR before ratification.
- **Approval Workflow (output 10):** domain mapping & projections → **platform-lead approval** (no new law). New constitutional law → **founder approval via ADR** (AC-92, AC-95), with Security Review when trust-class. This map's amendments in §9 were **adopted in Architecture Constitution v1.1** (ratified 2026-06-25 by founder approval, ADR-class per §59/AC-95).

---

## 9. Genuine-gap analysis & Adopted Architecture Constitution Amendments (v1.1)

Rigorous pass over the four `▲` domains. Each was **genuinely-thin law**, not a spec gap. Per the founder directive (fewer than five genuine domains ⇒ amend, do not create constitutions), all four were **ADOPTED into Architecture Constitution v1.1** on 2026-06-25 — three as new sections (§61/§62/§63), one (statelessness) integrated into §34. Wording below is the **ratified** text.

### Adopted — §61 Accessibility & Internationalization (`AC-101`, `AC-102`)

- **Why genuine:** AC mentions accessibility once and i18n zero times; no rule states a11y/i18n as engineering law. Surfaces (VOL-06/07/25) currently have no constitutional a11y/i18n obligation; the Phase-F review-stage additions gate review but have no law to enforce.
- **Proposed §61 intent:** user-facing surfaces MUST meet a declared accessibility-conformance bar and externalize all user-facing strings; no hardcoded locale, direction, or formatting assumptions.
- **Proposed rules:** `AC-101 —` Every user-facing surface MUST meet the platform's declared WCAG conformance level, verified by an accessibility gate before a surface book reaches Canonical. `AC-102 —` All user-facing text MUST be externalized through the localization layer; locale, text direction, number/date formatting, and pluralization MUST NOT be hardcoded.

### Adopted — §62 AI Safety & Output Moderation (`AC-103`, `AC-104`)

- **Why genuine:** AC-15 (untrusted tool/RAG data) and AC-53 (ask-before-acting) are adjacent but do not state **model-output** safety as law; `safetyDirectives` is an input field, not output validation (Phase-E gap #23). VOL-42 (Trust & Safety) and VOL-10 BK-10.09 have a spec owner but no constitutional law.
- **Proposed §62 intent:** model-generated output is subject to a safety/moderation boundary distinct from tool-output handling; abuse, fraud, and harmful-use prevention are safety-by-design obligations, fail-closed and auditable, never bypassing trust boundaries.
- **Proposed rules:** `AC-103 —` Model-generated output that can reach a user or an effectful tool MUST pass an output-safety boundary (harm-scoring / policy-check / refusal) whose decision is auditable and fails closed; Local-origin output MUST NOT be silently scored by cloud. `AC-104 —` Abuse, fraud, and harmful-use controls MUST be designed in (rate/quota, content moderation, enforcement actions) and their enforcement decisions MUST be recorded in the immutable audit trail.

### Adopted — §63 Build, Release & Supply-Chain Integrity (`AC-105`, `AC-106`)

- **Why genuine:** AC-81 (single dual workspace), AC-85 (inventory honesty), and AC-88 (no vulnerable deps) are adjacent, but **build determinism, artifact provenance/signing, and supply-chain attestation** are not stated as law. Release builds and SBOM are spec-owned (VOL-28/29/31) with no constitutional anchor.
- **Proposed §63 intent:** shipped artifacts MUST be reproducible from a pinned, attested dependency set and signed; the build is a trust boundary.
- **Proposed rules:** `AC-105 —` Every shipped artifact MUST be built from a pinned, lock-verified dependency set and be reproducible; the release pipeline MUST produce a signed artifact and a recorded provenance/SBOM. `AC-106 —` A dependency or build input that cannot be attested (unsigned, unpinned, or unscanned) MUST NOT enter a shipped artifact; supply-chain provenance failures fail the release gate closed.

### Adopted (integrated, no §64) — Scalability & Statelessness → §34 (`AC-107`)

- **Why marginal:** §34 (Reliability) and §39 (Performance) cover most of this; the only genuinely-absent law is **statelessness/horizontal-scale** as an explicit obligation. May be **folded into §34** rather than a new section — your call.
- **Proposed rule:** `AC-107 —` Managed-tier request-handling components MUST be horizontally scalable and free of per-instance durable state (no in-process store of record — cf. the non-durable cost-telemetry defect AC-68/ARCH-D14); shared state lives in a declared durable store.

**Recommendation:** approve §62 and §63 (clear, enforceable, close real Phase-E gaps), approve §61 (a11y/i18n is genuinely unstated), and **fold §64 into §34** rather than add a section. None is applied without your `go`.

---

## 11. Validation summary

- **No duplicated constitutional ownership** — 0 new constitutions; each domain has exactly one AC owner (§1). ✔
- **No conflicting authority** — only two authorities; this map owns no law. ✔
- **No circular inheritance** — two-node acyclic graph (§3). ✔
- **No missing engineering domain** — all 56 candidates mapped; 4 thin-law gaps routed to proposed amendments. ✔
- **No orphaned runtime / platform / surface / capability / engineering concern** — every roadmap volume (incl. the Phase-F additions VOL-39…42) routes to a governing constitution (§6); residual-unowned-domains from the Phase-E/F audit = none. ✔ (One open ownership question: **VOL-40 Voice & Realtime** owner remains UNKNOWN pending a new ARCH-D — see §12.)

---

## 12. Remaining Founder Decisions

Constitutional-layer decisions only the founder can make (full product/architecture decision set lives in [owner-decision-register.md](owner-decision-register.md) §3/§9):

- ✓ **Done** — the ≤4 AC amendments were adopted in v1.1 (§61/§62/§63, `AC-101…107`); the constitutional layer is closed.
- **VOL-40 (Voice & Realtime) runtime ownership** — UNKNOWN; needs a new `ARCH-D` to assign an owner and inheriting-book.
- Whether **VOL-39/40 (Generative Media / Voice)** are their own AC inheriting-books or remain under the AI Runtime Specification (constitution-amendment-class).
- **`ARCH-D4`** (runtime convergence) and **`ARCH-D6`** (Experience primitive) — structural; gate the roadmap volume-layer freeze (carried from Phase F).
- `D1–D9` (pricing/tiers/GA/product-split) — gate the commercial/legal/cloud books' Current status.

## 13. Remaining Implementation Dependencies

Live platform P0s — these gate the **platform**, not the constitutional layer (full list in [owner-decision-register.md](owner-decision-register.md) §9 / `known-flaws.md`):

`LOCAL-CHAT-NOINVOKE-01` (Local chat broken) · `AGI-SEC-0001` (RLS dormant) · `ARCH-D13` (observability facade) · `ARCH-D14` (non-durable cost telemetry / credit-loss) · `AUDIT-IMMUT-01` (audit immutability) · `ARCH-D11` (ledger-less migrations) · `BYOK-RUST-EGRESS-01` (CLI/Rust egress gap) · desktop Share trust-boundary leak · extension computer-use allow-all default · unproven managed-cloud ledger · `AGI-OPS-0001` (deploy/CI).

---

## v1.0 → v1.1 Constitutional Diff (Architecture Constitution, AGI-DOC-0015)

Ratified 2026-06-25 by founder approval (ADR-class, §59/AC-95). **Additive only** — no v1.0 section or rule was changed or removed.

**Added narrative sections (Part IX):** §61 Accessibility & Internationalization · §62 AI Safety & Output Moderation · §63 Build, Release & Supply-Chain Integrity.

**Added immutable rules:** `AC-101` (WCAG conformance) · `AC-102` (string externalization) → §61; `AC-103` (mode-appropriate, fail-closed output-safety boundary) · `AC-104` (T&S enforcement immutable audit; Local not Cloud-dependent) → §62; `AC-105` (reproducible/verifiable/source-attributable artifacts) · `AC-106` (provenance/SBOM/dependency-verification/release-gate) → §63; `AC-107` (statelessness default; stateful components declare ownership/persistence/replication/consistency/recovery) → **integrated into §34**, generalizes `AC-68`.

**Structural decision honored:** **no §64 was created** (founder directive); scalability/statelessness law lives in §34.

**Net:** 60 → 63 sections; `AC-01…100` → `AC-01…107`; Version 1.0 → 1.1. No duplicated law — each new rule names a genuinely-uncovered domain; `AC-107` explicitly generalizes `AC-68`.

## Constitutional Readiness Assessment

**Is the platform ready to begin generating the runtime specification library?**

**The constitutional foundation is ready — conditionally.** The two constitutions plus this Authority Map provide complete, non-duplicative inheritance routing for all 42 volumes / 201 books / 782 chapters, with zero unowned engineering domains and an acyclic two-node authority graph. Runtime-spec generation can begin **for the unblocked, amendment-independent volumes** (the roadmap's Wave 1 intelligence core, etc.) **once the remaining structural gate clears** (the amendment gate is now cleared in v1.1):

1. ✓ **Cleared (v1.1):** the AC amendments are ratified, so specs that must cite AI-safety (`§62`/`AC-103-104`), build-integrity (`§63`/`AC-105-106`), or a11y/i18n (`§61`/`AC-101-102`) law now have law to cite.
2. **Make the two structural calls** `ARCH-D4` (runtime convergence) and `ARCH-D6` (Experience primitive), and assign **VOL-40 (Voice)** an owner — these change which volume owns which runtime, so generating the affected runtime specs first would mean regenerating them.

**The platform itself is NOT ready to ship** — it is C-grade with the live P0s in §13. Constitutional readiness is about being able to _generate specifications coherently_; it does not move broken Local chat, dormant RLS, the observability facade, or the credit-loss path. Those remain the highest-leverage work and gate any managed-cloud GA, independent of how complete the documentation system becomes.

**Recommendation:** approve/adjust the §9 amendments and decide `ARCH-D4`/`ARCH-D6`/`VOL-40 owner`; then runtime-spec generation may begin per the roadmap's generation waves. Do not begin runtime-spec generation ahead of those gates, and do not treat constitutional completeness as platform readiness.
