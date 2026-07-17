# The AGI Architecture Constitution

Version: 1.1 (adds §61 Accessibility & i18n, §62 AI Safety & Output Moderation, §63 Build/Release/Supply-Chain Integrity, and AC-101…AC-107; see [the v1.0→v1.1 diff in the Authority Map](engineering-constitution-authority-map.md))
Status: Current
Owner: Founder + platform lead
Last updated: 2026-06-27
Last verified against implementation: 2026-06-25
Audience: Everyone who architects, implements, reviews, or operates AGI — human or AI agent
Layer: docs/00-foundation
Document ID: AGI-DOC-0015
Authority: Highest engineering authority. Every architecture, runtime, API, database, frontend, backend, infrastructure, security, and feature specification, plus every coding standard and implementation decision, inherits from this document. It inherits in turn from [platform-constitution.md](platform-constitution.md) (product authority) and MUST NOT contradict it. Only the actual implementation and explicit Architecture Decision Records ([adr-index.md](adr-index.md)) may override it.
Related: [platform-constitution.md](platform-constitution.md), [architecture-manifest.md](architecture-manifest.md), [canonical-glossary.md](canonical-glossary.md), [requirement-id-system.md](requirement-id-system.md), [adr-index.md](adr-index.md), [documentation-constitution.md](documentation-constitution.md), [owner-decision-register.md](owner-decision-register.md)

---

## Preamble

This is the **engineering constitution** of the AGI platform. It answers one question — _how is AGI engineered?_ — and it is the highest engineering authority in the repository.

Three documents form the constitutional spine, and they must not be confused:

- The **[Platform Constitution](platform-constitution.md)** (`AGI-DOC-0013`) answers _why_ AGI exists and what it promises. It is the highest **product** authority; this document inherits from it and may never contradict it.
- The **[Architecture Manifest](architecture-manifest.md)** (`AGI-DOC-0003`) is the **current-state map** — the factual record of how the repository is structured today. Where this constitution needs a current-state structural fact, it **references the manifest rather than restating it**; the manifest is the single owner of those facts.
- This **Architecture Constitution** (`AGI-DOC-0015`) defines the **engineering philosophy and the architectural boundaries** — the law that every future runtime, API, database, security, and feature specification inherits from. It is overridden only by the running implementation it describes and by explicit ADRs ([adr-index.md](adr-index.md)).

**How to read this document.** Binding statements use RFC 2119 force (**MUST**, **MUST NOT**, **SHOULD**). Where the current implementation differs from the target architecture, the gap is marked inline with **Current state**, **Target state**, **Migration**, and **Tradeoffs** — present only where a real gap exists, never as boilerplate. Inline `> **Architectural rule —**` callouts state binding law in place; the complete, de-duplicated canon is enumerated and numbered (`AC-01 …`) in [Architectural Rules](#architectural-rules-immutable-engineering-law). Every architectural proposal is evaluated against the [Design Decision Framework](#design-decision-framework), and every inheriting specification is scoped in [Relationship to Future Documents](#relationship-to-future-documents).

**The disposition of this document.** Boundaries are enforced, not suggested: a rule that cannot be mechanically checked is recorded as a tracked defect, not asserted as satisfied. Every section serves the product invariants it inherits — trust boundaries are non-negotiable, Local Mode is defined by user-owned compute and user-owned storage (cloud inference is never required), and a capability is never advertised beyond what the running system can honestly deliver.

---

## Table of Contents

- **Part I — Foundations & the Architectural Spine**
  - [1. Engineering Philosophy](#1-engineering-philosophy)
  - [2. Architectural Principles](#2-architectural-principles)
  - [3. Layered Platform Architecture](#3-layered-platform-architecture)
  - [4. Separation of Concerns](#4-separation-of-concerns)
  - [5. Modularity Principles](#5-modularity-principles)
  - [6. Package Boundaries](#6-package-boundaries)
  - [7. Runtime Isolation](#7-runtime-isolation)
  - [8. Shared Infrastructure](#8-shared-infrastructure)
- **Part II — Surfaces, Composition & the AI Substrate**
  - [9. Cross-Platform Strategy](#9-cross-platform-strategy)
  - [10. Surface Architecture](#10-surface-architecture)
  - [11. Application Composition](#11-application-composition)
  - [12. Capability Architecture](#12-capability-architecture)
  - [13. Provider Abstraction](#13-provider-abstraction)
  - [14. Model Abstraction](#14-model-abstraction)
  - [15. Tool Abstraction](#15-tool-abstraction)
  - [16. Agent Architecture](#16-agent-architecture)
  - [17. Workflow Architecture](#17-workflow-architecture)
- **Part III — The State Plane**
  - [18. Memory Architecture](#18-memory-architecture)
  - [19. Context Architecture](#19-context-architecture)
  - [20. Session Architecture](#20-session-architecture)
  - [21. Synchronization Architecture](#21-synchronization-architecture)
  - [22. Storage Architecture](#22-storage-architecture)
- **Part IV — The Trust Plane**
  - [23. Security Architecture](#23-security-architecture)
  - [24. Privacy Architecture](#24-privacy-architecture)
  - [25. Identity Architecture](#25-identity-architecture)
  - [26. Authentication Strategy](#26-authentication-strategy)
  - [27. Authorization Strategy](#27-authorization-strategy)
- **Part V — Interfaces & Execution**
  - [28. API Design Principles](#28-api-design-principles)
  - [29. Database Design Principles](#29-database-design-principles)
  - [30. Event Architecture](#30-event-architecture)
  - [31. Background Execution](#31-background-execution)
  - [32. Long Running Tasks](#32-long-running-tasks)
  - [33. Streaming Architecture](#33-streaming-architecture)
- **Part VI — Operability, Execution Modes & Synchronization**
  - [34. Reliability Principles](#34-reliability-principles)
  - [35. Error Handling Philosophy](#35-error-handling-philosophy)
  - [36. Observability Philosophy](#36-observability-philosophy)
  - [37. Logging Standards](#37-logging-standards)
  - [38. Telemetry Principles](#38-telemetry-principles)
  - [39. Performance Philosophy](#39-performance-philosophy)
  - [40. Caching Philosophy](#40-caching-philosophy)
  - [41. Offline Strategy](#41-offline-strategy)
  - [42. Local Mode Architecture](#42-local-mode-architecture)
  - [43. Cloud Mode Architecture](#43-cloud-mode-architecture)
  - [44. Synchronization Principles](#44-synchronization-principles)
- **Part VII — Platform Lifecycle & Extensibility**
  - [45. Feature Flag Philosophy](#45-feature-flag-philosophy)
  - [46. Dependency Management](#46-dependency-management)
  - [47. Monorepo Strategy](#47-monorepo-strategy)
  - [48. Shared Package Strategy](#48-shared-package-strategy)
  - [49. Versioning Strategy](#49-versioning-strategy)
  - [50. Compatibility Strategy](#50-compatibility-strategy)
  - [51. Plugin Philosophy](#51-plugin-philosophy)
  - [52. Extension Philosophy](#52-extension-philosophy)
  - [53. MCP Philosophy](#53-mcp-philosophy)
  - [54. AI Runtime Philosophy](#54-ai-runtime-philosophy)
- **Part VIII — Engineering Governance**
  - [55. Testing Philosophy](#55-testing-philosophy)
  - [56. Documentation Philosophy](#56-documentation-philosophy)
  - [57. Security Review Process](#57-security-review-process)
  - [58. Architecture Review Process](#58-architecture-review-process)
  - [59. ADR Process](#59-adr-process)
  - [60. Evolution Strategy](#60-evolution-strategy)
- **[Architectural Rules (Immutable Engineering Law)](#architectural-rules-immutable-engineering-law)**
- **[Design Decision Framework](#design-decision-framework)**
- **[Relationship to Future Documents](#relationship-to-future-documents)**
- **[Appendix A — Known Current-vs-Target Gaps](#appendix-a--known-current-vs-target-gaps)**

---

## Part I — Foundations & the Architectural Spine

### 1. Engineering Philosophy

This document is the engineering law of the platform. It inherits from the Platform Constitution (AGI-DOC-0013), which answers _why_ AGI exists and what it promises; this Constitution answers _how_ AGI is engineered. Where the Platform Constitution states a product invariant, this document states the architectural discipline that makes the invariant true in code rather than in prose. It is overridden only by the implementation it describes and by explicit ADRs ([adr-index.md](adr-index.md)); it never supersedes the Platform Constitution.

The platform is engineered around one organizing decision that distinguishes it from a conventional layered or domain-driven application: **its primary axis is a trust-mode state machine, not a business-domain decomposition** (architecture-manifest.md §3). Local, BYOK, and Managed are not configuration flags over a shared code path — they are separate trust boundaries, and the question "which trust mode is this work in?" governs how state is stored, where computation runs, and whether a network egress is permitted. Every structural choice in this document serves that axis. A second decision shapes everything beneath it: **SDKs are adapters, not architecture** (`AGI-ARCH-0001`). Vendor SDKs, provider APIs, and framework conveniences are wrapped behind contracts the platform owns; no vendor shape is allowed to become structural, because a structural vendor dependency is a trust-boundary and capability-honesty risk, not merely a coupling problem.

The third decision is the disposition of this entire document: **boundaries are enforced, not suggested** (`AGI-ARCH-0002`). A boundary that exists only as documentation has already failed. Architectural rules in this Constitution are written to be machine-checkable — by the boundary, contract, and toolchain guards that the monorepo runs — and a rule that cannot be mechanically enforced is recorded as a tracked defect, not asserted as satisfied. This is the engineering expression of the platform's capability-honesty invariant: the architecture must not claim a guarantee the running system does not actually provide.

> **Architectural rule —** This Architecture Constitution (AGI-DOC-0015) MUST inherit from and MUST NOT contradict the Platform Constitution (AGI-DOC-0013); it is overridden only by the implementation and by explicit ADRs.

### 2. Architectural Principles

The enduring architectural principles of the platform are the fourteen enumerated in the Platform Constitution Part VIII (separation of concerns, layered architecture, platform-first, provider/model-agnostic, extensibility, modularity, reliability, security-by-construction, performance, maintainability, observability, accessibility, explicitness-over-magic, composition-over-coupling). They are owned there and are not re-enumerated here.

What this document adds is their architectural _force_ and their interaction. These principles are not a wish-list weighted by taste; they are ordered by a single tie-breaker — **a trust-boundary or capability-honesty principle outranks a convenience principle whenever they conflict.** Security-by-construction, fail-closed reliability, and provider-agnosticism are therefore not negotiable against performance or developer ergonomics; when a faster or simpler design would blur Local/BYOK/Managed separation, route Local state toward cloud, or present a capability the active runtime cannot deliver, the principle that protects the user wins and the convenience is redesigned. This is why "explicitness over magic" and "composition over coupling" carry architectural weight here rather than being style preferences: hidden behavior and entangled modules are the mechanisms by which trust boundaries silently erode.

The principles bind two distinct readers equally — the human engineer and the AI agent making structural changes. An agent cannot infer intent from culture, so the principles are made enforceable (Part VIII #8, #13) rather than aspirational. Where a proposed change would weaken a principle, the platform requires that the weakening be made explicit and recorded, never absorbed silently into a diff.

> **Architectural rule —** When an architectural principle protecting a trust boundary or capability honesty conflicts with a principle of convenience (performance, ergonomics, brevity), the protective principle MUST prevail and the convenience MUST be redesigned around it.

### 3. Layered Platform Architecture

The platform is layered into four tiers, and this is constitutional law, not a description of the current package set. From innermost to outermost:

1. **Contracts** — the typed and serialized agreements every other layer depends on: cross-surface contract types, the model and provider single sources of truth, and the cross-language protocol. Contracts depend on nothing above them.
2. **Mechanics** — reusable, product-meaning-free machinery: provider adapters, schema normalization, runtime resilience, routing, tool/MCP transport, and the Rust policy/sandbox/proxy layer. Mechanics depend on Contracts only.
3. **Orchestration** — where product meaning, authentication, ownership, policy, and trust-mode transitions are decided: the suite spine and the per-surface runtimes, routes, actions, and commands. Orchestration depends on Mechanics and Contracts.
4. **Surfaces** — the seven build targets that assemble orchestration into a user experience.

The current mapping of packages and crates onto these tiers is owned by architecture-manifest.md §2; it is referenced, not reproduced here.

The defining law of this layering is **the inward-pointing dependency rule**: dependencies point inward only. An outer layer may depend on an inner one; an inner layer MUST NOT depend on an outer one. Concretely, Contracts MUST NOT import Mechanics, Orchestration, or Surface code; Mechanics MUST NOT import Orchestration or Surfaces; and no layer may reach sideways into a Surface. This is the same law that `AGI-ARCH-0002` expresses at the package-graph level (apps↛apps, packages↛apps, services↛UI) and that §6 states as boundary rules; here it is the _reason_ those rules exist. The inward direction is what makes Contracts shareable across every surface and runtime without dragging surface-specific or trust-mode-specific behavior with them, and it is what lets a single contract change propagate outward without an inner layer needing to know which surface consumes it.

Two corollaries bind with special force. First, vendor specifics live in the Mechanics layer behind adapters and never leak inward into Contracts or outward into Surfaces (`AGI-ARCH-0001`). Second, product meaning, auth, ownership, and trust-mode transitions live in Orchestration and never sink down into Mechanics, because Mechanics is reused across trust modes and must remain ignorant of which mode it is serving. Surfaces (§10) and composition (§11) _apply_ this layering; they do not redefine it.

> **Architectural rule —** Platform dependencies MUST point inward only: Contracts → Mechanics → Orchestration → Surfaces; an inner layer MUST NOT import code from an outer layer, and vendor/SDK specifics MUST stay in the Mechanics adapter layer, never in Contracts or Surfaces.

### 4. Separation of Concerns

Separation of concerns at the platform level means each architectural role has exactly one kind of responsibility, and the platform's two-layer orchestration discipline draws the sharpest line: **orchestration owns product meaning, identity, ownership, policy, and trust-mode transitions; service mechanics own reusable, meaning-free machinery** (docs/engineering/service-layer-architecture.md). A route, action, or command decides _what is allowed for this user in this trust mode_; a service function decides _how to perform the mechanic_ once that decision is made. The two MUST NOT merge: a mechanic that embeds an authorization or trust-mode decision becomes unsafe to reuse, and an orchestration path that embeds vendor transport becomes unsafe to retarget.

The product taxonomy through which surfaces express this — Surfaces, Experiences, Capabilities, and Features (Platform Constitution Part VIII #1) — is _applied_ by the surface and composition authors (see §10, §11) and is not redefined here. What this section fixes is the architectural consequence: a concern that crosses surfaces MUST live in a shared layer (§6), and a concern specific to one trust boundary MUST NOT be implemented in a layer shared across boundaries. The first prevents per-surface reimplementation; the second prevents a Local-mode concern from being satisfied by a code path that also serves Managed mode, which is how trust boundaries leak.

> **Architectural rule —** Orchestration (routes, actions, commands) MUST own product meaning, authorization, ownership, policy, and trust-mode transitions; service mechanics MUST own only reusable, trust-mode-agnostic machinery, and the two MUST NOT be conflated in a single unit.

### 5. Modularity Principles

A module — TypeScript package or Rust crate — exists to give a concern an owned, boundaried home with an explicit public surface. The platform's discipline against module sprawl is concrete and load-bearing: **a shared package or crate MUST be justified by a second real consumer before it is added.** A would-be shared module with a single consumer is that consumer's internal detail and belongs inside it; promotion to the workspace is earned by a genuine second use, not anticipated by speculation. This is the modularity principle that prevents the common decay of a monorepo into a graveyard of one-consumer "shared" packages, and it mirrors the service-layer extraction rule (extract only after 2+ callers or a high-risk boundary; §4).

A module is well-formed only when its public surface is explicit. A package that exports its internals implicitly cannot be depended on safely, because consumers reach past the boundary the author intended; the encapsulation contract is therefore the export map, not convention (the deep-import rule is owned by §6). Modularity here is the precondition for the layering law of §3: layers can only point inward cleanly if each module within a layer presents a stable, declared face to the modules that depend on it.

> **Architectural rule —** A new shared TypeScript package or Rust crate MUST be justified by a second real consumer before being added to the workspace; a concern with a single consumer MUST live inside that consumer.

### 6. Package Boundaries

This section owns the package- and crate-level boundary rules. They are the package-graph expression of the inward-pointing dependency law (§3) and of `AGI-ARCH-0002`. The current package and crate inventory onto which these rules apply is owned by architecture-manifest.md §1 and is referenced, not listed. The _tooling_ that enforces these rules is owned by the monorepo and toolchain sections (§47/§48) and is not described here.

The boundary rules are:

- Code under `apps/` MUST NOT import code from another app, by relative path or by workspace alias; cross-surface logic MUST live in a shared package or crate.
- Code under `packages/` MUST NOT import from `apps/`; the dependency arrow points apps → packages, never the reverse.
- Code under `services/` MUST NOT import UI packages or any app code; backend services and product surfaces share contracts, not UI.
- A deep import into a workspace package MUST resolve to a subpath explicitly declared in that package's exports map; a package MUST declare its public surface rather than relying on consumers guessing at internal paths.

The deep-import rule deserves a constitutional note because it interacts with a current enforcement gap: most packages declare a single bare-string root export, which means the boundary tooling cannot positively validate subpath imports for them and the encapsulation guarantee rests on the _absence_ of deep-import specifiers rather than on a declared public contract (scripts/check-boundaries.mjs; packages/ui/ui/package.json). The rule above is therefore stated as the target: packages SHOULD migrate to explicit exports maps so encapsulation is a positive contract. A second gap is scope: the boundary law is constitutional across all four artifact kinds, but only the TypeScript roots (`apps`, `packages`, `services`) are mechanically scanned today, leaving Rust crate layering documented but unenforced (scripts/check-boundaries.mjs line 120; architecture-manifest.md §1). The law binds crates equally even where the guard does not yet reach them.

> **Architectural rule —** Code under `apps/` MUST NOT import another app; code under `packages/` MUST NOT import from `apps/`; code under `services/` MUST NOT import UI packages or app code. Cross-surface logic MUST live in a shared package or crate.

> **Architectural rule —** A deep import into a workspace package MUST resolve to a subpath declared in that package's exports map; packages MUST declare their public surface explicitly rather than relying on a single undifferentiated root export.

### 7. Runtime Isolation

Runtime isolation is the architectural enforcement of the platform's foundational trust-boundary promise. Local Mode is defined by **user-owned compute and user-owned storage**: cloud inference is never required, and a Local chat, file, tool result, or telemetry event MUST NEVER reach AGI managed cloud (`AGI-TRUST-0001`). This is not a property a single component provides — it is an isolation requirement on _every_ runtime that can reach the network. Runtimes operating at different trust levels MUST be isolated such that Local and BYOK execution cannot egress to our-cloud hosts, and that isolation MUST fail closed: an unreadable or indeterminate trust-mode state MUST be treated as the most private boundary, because blocking is safe and leaking is not.

The architectural subtlety is that a surface is rarely a single runtime. The desktop surface, for example, runs both a WebView/TypeScript runtime and a native Rust runtime, and an isolation guarantee that covers only one of them is not a guarantee. **Each runtime that can reach our cloud MUST independently honor the trust boundary**; a chokepoint is only a chokepoint if no egress path exists outside it. The concrete mechanism — the egress guard, its host denylist, fail-closed predicate, and per-surface enforcement — is owned by the security author and the Trust-Boundary Egress runtime book and is deferred here.

This section also binds a real Current-vs-Target gap whose full current-state narrative is owned by §42 (Local Mode Architecture): the trust-boundary egress chokepoint is enforced unevenly across surfaces today, and two surfaces granted Local mode (CLI, VS Code) have no egress guard at all. The isolation _law_ stated here is platform-wide and binds every surface offering Local or BYOK mode; the architecture's position is that the current unevenness is a defect to be closed by a shared, every-runtime isolation contract — not a per-surface convenience to be re-derived.

> **Architectural rule —** Local Mode MUST be isolated to user-owned compute and user-owned storage; every runtime on every surface that can reach AGI cloud — including native (Rust) runtimes outside any WebView fetch layer — MUST independently enforce the trust boundary and MUST fail closed when trust mode cannot be determined.

> **Architectural rule —** Local state MUST NOT cross a trust boundary except by an explicit, user-consented fork; it MUST NEVER cross implicitly through a shared runtime or an unguarded egress path.

### 8. Shared Infrastructure

Shared infrastructure is the inner spine every surface consumes and none forks. Its governing principle is **one home per single source of truth**: a fact that must be identical across surfaces — model IDs and capabilities, provider identity, cross-surface contract types, dependency versions, database access — has exactly one canonical owner, and surfaces _consume_ it rather than redeclaring it. Model IDs and model metadata live solely in the model catalog SSOT and are read through the contracts package; they MUST NOT be invented, guessed from training data, or hardcoded anywhere else (packages/contracts/types/src/models.json). Canonical cross-surface contract types live solely in the contracts package; redefining one elsewhere requires an explicit, reviewed migration exception (packages/contracts/types/src/). Database access flows through the one vendor-neutral adapter; feature code MUST NOT import a concrete driver. Cross-cutting dependency versions (the framework, the type system, the validation and security-sensitive transitive libraries) are pinned centrally, not per-package, so a security pin cannot be silently undermined by one surface (package.json overrides). The toolchain itself — the Node and package-manager versions — is pinned consistently across the monorepo.

The second principle is reachability: **a layer shared by surfaces that span runtime environments MUST be consumable by every surface that needs it.** A "shared" module that is technically importable by only some of its intended consumers is not shared; it is a web-coupled module masquerading as platform infrastructure. The platform's cross-environment safe layers (the contracts package, design tokens) satisfy this; whether a given UI spine is truly cross-surface-consumable — and the mobile-reuse gap that follows from it — is a surface-level concern owned by §10 and is deferred there. The architectural rule this section fixes is only the principle: shared infrastructure is consumed, not reimplemented, and its consumability boundary is part of its contract.

> **Architectural rule —** Every cross-surface single source of truth (model catalog, provider identity, contract types, database access, dependency versions, toolchain pins) MUST have exactly one canonical home; surfaces MUST consume it and MUST NOT fork, redeclare, or hardcode it.

> **Architectural rule —** Cross-cutting dependency versions and the Node/package-manager toolchain MUST be pinned centrally in the root workspace configuration, consistently across the monorepo, not per package.

## Part II — Surfaces, Composition & the AI Substrate

### 9. Cross-Platform Strategy

AGI is one platform realized across surfaces, not one product reimplemented per surface. The strategic question this section answers is not _which surfaces exist_ — that inventory is owned by architecture-manifest.md §1 — but _where shared meaning is allowed to live_ so that six surfaces stay continuous without collapsing into one codebase. The governing principle is layered reuse: cross-surface logic and contracts descend into shared packages, and only surface-specific composition stays in `apps/`. The dependency arrow is constitutional — apps never import apps (see §3; architecture-manifest.md §2, AGI-ARCH-0002) — so the only legitimate channel for continuity is a shared package or crate.

Cross-platform reuse is constrained by runtime fitness, not by intention. A package is genuinely cross-surface only if it carries no platform-coupled dependency: the React-Native surface cannot consume a package that pulls `react-dom`. Today the genuinely portable shared layer is `@agiworkforce/types` (suite-contracts, design-system, models) and `@agiworkforce/design-tokens`; the chat experience layer is not portable.

**Current state:** `@agiworkforce/unified-chat` — the suite spine that should carry chat state across all synced surfaces — declares `react-dom`, Radix, and framer-motion as peer dependencies, making it consumable only by web (27 importers) and desktop (20 importers) and structurally unusable on mobile (0 importers) (packages/ui/unified-chat/package.json). Mobile therefore reimplements chat state and UI independently, violating the reuse mandate that website UI be built in shared packages so desktop and mobile both consume it. **Target state:** an RN-safe shared chat core (state, contracts, reducers) separated from web-coupled presentation, so the platform-coupled layer is a thin rendering shell over portable logic. **Migration:** extract the framework-agnostic core out of `unified-chat` before adding new chat capability to any single surface; the web-coupled package MUST NOT remain the sole home for state mobile also needs.

> **Architectural rule —** Logic shared between web/desktop and mobile MUST live in a React-Native-safe shared package with no web-only (`react-dom`/DOM) dependency; a web-coupled UI package MUST NOT be the only home for chat or experience state that mobile also requires.

### 10. Surface Architecture

A surface is a composition target, not an architectural layer. Each surface assembles the four-layer stack defined in §3 — Contracts, Mechanics, Orchestration, Surfaces — and adds only the platform shell, environment detection, and host integration that cannot be shared. The canonical surface set is the typed six-value `SourceSurface` enum (`web | desktop | mobile | cli | vscode | chrome`); `sandbox` is infrastructure, not a product surface (packages/contracts/types/src/suite-contracts.ts). New surfaces extend this enum and its partitions rather than introducing untyped surface identifiers, because surface identity drives trust-mode eligibility and sync eligibility everywhere downstream.

Surfaces are not interchangeable: they are partitioned into two typed classes that govern data continuity. `SyncedAppSurface` (web, desktop, mobile) may participate in the shared cloud chat store; `DeveloperSessionSurface` (cli, vscode, chrome) keeps workspace- or task-scoped histories and MUST NOT enter the synced-app pipeline. This partition is enforced at runtime by `assertSurfaceCanSyncChats`, which fails fast if a developer surface attempts enrolment (packages/contracts/types/src/suite-contracts.ts L185–195). The per-surface trust-mode matrix (which surface offers Local / BYOK / Managed) is owned by architecture-manifest.md §3 and MUST be referenced, never reproduced — but its consequence is binding here: a surface advertises only the trust modes and sync class its typed identity grants it.

> **Architectural rule —** Surface identity MUST be expressed through the canonical `SourceSurface` enum and its synced-app / developer-session partition; only a `SyncedAppSurface` MAY enter the shared cloud chat store, and any `DeveloperSessionSurface` attempting enrolment MUST be rejected at the boundary.

### 11. Application Composition

Composition is the disciplined act of assembling a surface from the shared layers defined in §3 without inverting their dependency direction. An application is the top of the stack: it wires Orchestration (the suite spine and per-surface runtime) over Mechanics (provider adapters, tool normalization, routing) over Contracts (`@agiworkforce/types`), and contributes only the host-specific shell. Composition MUST NOT re-implement a lower layer to avoid importing it, and it MUST NOT reach sideways into another app. Where a surface needs behavior a shared package does not yet expose, the correct move is to widen the package's public surface — and a package's public surface MUST be a declared export, not an implicit deep import (see §3; architecture-manifest.md §2).

The single most important compositional invariant is that trust-boundary meaning is never re-authored at the composition layer. Surface UI sources Local / BYOK / Managed labels, descriptions, and mode semantics from the suite contracts' frozen display tables (`PRIVACY_MODE_DISPLAY`, `PROVIDER_MODE_DISPLAY`, `CHAT_EXECUTION_MODE_DISPLAY`); composing a surface MUST NOT introduce new hardcoded trust-mode wording (packages/contracts/types/src/suite-contracts.ts). This keeps capability honesty — the constitutional promise that AGI never claims a capability the chosen route cannot deliver — a property of the contracts layer rather than a per-surface convention.

> **Architectural rule —** A surface MUST compose from the shared layers (Contracts → Mechanics → Orchestration) without re-implementing or bypassing a lower layer, MUST consume a package only through its declared export surface, and MUST source all trust-boundary copy from the suite contracts rather than hardcoding it.

### 12. Capability Architecture

The platform hierarchy is Platform → Cloud Services → Surfaces → **Experiences** → **Capabilities** → Features. Experiences (Chat, Code, Agent, Research) are cross-surface modes a user enters; Capabilities are the discrete powers an Experience composes (tool use, connector access, computer use, generation); Features are concrete affordances. The architectural commitment of this section is that an Experience is a _shared primitive_ surfaces compose from — never a per-surface app — so that the trust and capability behavior of "Code" or "Research" is derivable from one contract regardless of where it runs.

Capability honesty is enforced structurally along two axes that already exist. Runtime fitness is modeled by `RuntimeTier` (`cloud | desktop-only | desktop-preferred`), which classifies each capability for runtime-aware dispatch and defaults unknown commands to `desktop-only` — fail-safe (packages/contracts/types/src/command-capabilities.ts; packages/client/client-runtime/src/registry.ts). Environment fitness is modeled by `evaluateModelEnvironment`, which is fail-closed: a capability requiring `e2b` or `local-runtime` is not selectable unless that environment is both configured and available, returning a distinct lock reason (packages/contracts/types/src/model-catalog.ts L211–224). A capability MUST NOT be presented as available unless the active surface and runtime can actually serve it.

**Current state:** there is no single Experience primitive. The same conceptual experiences are modeled by at least four divergent type systems — `ChatIntentKind` (`chat | code | research | …`, suite-contracts.ts L279–290), web's `FocusMode` (`web | academic | code | writing | research`, apps/web/features/chat/components/Composer/FocusModeButtons.tsx), design-system's `AgentMode` (`ask | auto | plan | bypass`, packages/contracts/types/src/design-system/agent-mode.ts), and a standalone desktop `DeepResearchPanel`. Surfaces compose experiences ad hoc. **Current state (capability dishonesty):** the same advertise-beyond-backend-capability failure appears here too — the 11-advertised / 4-served cloud-provider conflict is owned by §50 (see also §13). **Target state:** one shared Experience contract that reconciles intent, focus, agent mode, and research into a single primitive from which trust-mode and capability gating are derived, and from which no surface can advertise a capability its route cannot fulfil.

> **Architectural rule —** Chat, Code, Agent, and Research are cross-surface Experiences composed from a shared contract, never standalone apps; their trust and capability behavior MUST be derivable from one primitive.

> **Architectural rule —** A capability MUST NOT be advertised as selectable unless the active surface, runtime tier, and required environment can actually serve it; pickers, allowlists, and badges MUST be derived from real backend capability, and environment-gated capabilities MUST fail closed via `evaluateModelEnvironment`.

### 13. Provider Abstraction

The provider abstraction is the platform's single inference boundary. This section states its binding rule definitively: **all provider/inference traffic — every LLM model call and every provider catalog fetch — MUST flow through the canonical `ProviderAdapter` contract.** No surface may embed ad-hoc HTTP-to-vendor logic that bypasses the adapter, its credential resolution, or its `StreamChunk` normalization (packages/contracts/types/src/provider-adapter.ts L321–347). This is the abstraction other documents reference rather than restate (e.g. §28 API Design references this rule). It is scoped to inference: it does not subsume sync transport, identity, or the trust-boundary egress guard, which are owned elsewhere — but where inference and trust intersect, the adapter is the place credential resolution and provider mode are honored, and BYOK payloads MUST go directly to the user-owned provider and never transit AGI cloud (see Local/BYOK/Managed inheritance, §3).

The adapter contract is principled: four required surfaces (`id`, `label`, `auth`, `config`/`stream`) and four optional hooks (`catalog`, `buildReplayPolicy`, `normalizeToolSchemas`, `wrapStreamFn`), converting vendor SSE/NDJSON into a canonical `StreamChunk` discriminated union. The wire shapes and credential-resolution algorithm are deferred to the AI Runtime book (see §54). Adapters share cross-provider resilience through `@agiworkforce/provider-runtime` (gateway fingerprinting, retry, fallback, stream-idle watchdog) rather than each re-implementing it (packages/ai/provider-runtime/src/gateway.ts).

**Current state:** the abstraction is honored in only one runtime. The TS `ProviderAdapter` packages have exactly one non-test consumer — `services/api-gateway` — and that factory supports only 4 provider IDs (anthropic, openai, ollama, google). Two further provider runtimes exist in Rust and do not share the contract: the CLI `Provider` enum (apps/cli/src/models/mod.rs) collapses most providers into a generic `OpenAICompatible`/`Custom` variant, and the desktop `Provider` enum enumerates 25 providers explicitly (apps/desktop/src-tauri/src/core/llm/mod.rs:649). A capability fix in one runtime does not propagate to the others. **Target state:** all surfaces converge on one adapter contract, or an explicit, justified record of why the TS / CLI-Rust / desktop-Rust runtimes diverge.

> **Architectural rule —** Every provider/inference network call (model stream and provider catalog) MUST flow through the canonical `ProviderAdapter` contract, with its credential resolution and `StreamChunk` normalization; no surface MUST embed ad-hoc HTTP-to-vendor inference logic, and BYOK payloads MUST go directly to the user-owned provider and never transit AGI cloud.

### 14. Model Abstraction

Models are data, not code. The model catalog has exactly one source of truth — `packages/contracts/types/src/models.json` — and provider identity has exactly one source of truth — the `Provider` string-literal union in `packages/contracts/types/src/provider.ts`. Model IDs, capabilities, context windows, and pricing MUST be read from these files via `@agiworkforce/types`; they MUST NEVER be invented, guessed, or hardcoded from training data in any runtime. The catalog carries a dated, source-attributed `verificationLog`, making model facts auditable rather than assumed. Every Rust mirror of the provider set MUST stay in exact correspondence with the union and the catalog.

**Current state:** provider identity has drifted across three sources. The TS `Provider` union has **28** literals; `models.json` has **25** provider keys (≈15 populated); the desktop Rust enum has **25** variants. `lmstudio`, `ollama_cloud`, and `minimax` exist in the union but have no `models.json` entry — and `lmstudio` even ships a typed adapter package (`packages/ai/providers/lmstudio`) yet has no catalog entry, leaving its capability metadata undefined at the SSOT. The desktop enum additionally omits `minimax`/`runway`/`lmstudio`. **Current state (misdirected pointer):** the maintenance comment in provider.ts directs maintainers to update the `Provider` enum mirror at `core/llm/models_config.rs`, but that file (the model-catalog loader) does not define the enum — it only re-imports it (`use super::Provider;`); the enum actually lives at `core/llm/mod.rs:649` — so the cross-language mirror step is misdirected and untracked, enabling the drift. **Migration:** add a CI guard that fails the build when a provider exists in one source but not the others, require every typed adapter package to have a matching catalog entry, and correct the mirror pointer.

> **Architectural rule —** Provider identity and model metadata MUST be read only from `packages/contracts/types/src/provider.ts` and `packages/contracts/types/src/models.json`; the `Provider` union, the catalog provider keys, and every Rust `Provider` enum mirror MUST be kept in exact correspondence, verified by a CI guard, and every typed adapter package MUST have a matching catalog entry.

### 15. Tool Abstraction

A tool is a typed, vendor-neutral contract before it is a vendor payload. Tools are described by `ToolDef { name, description, inputSchema (JSON Schema Draft 2020-12), strict? }` with a `ToolChoice` of `auto | none | required | {type:'tool',name}` (packages/contracts/types/src/provider-adapter.ts L134–143). The architectural commitment is that no raw, per-surface tool schema is sent directly to a vendor API: every tool schema crosses into a provider only through the shared cross-vendor normalization in `@agiworkforce/provider-protocol`, applied via the adapter's `normalizeToolSchemas` hook. This keeps vendor quirks (OpenAI strict-mode, Anthropic payload compatibility) in one place rather than scattered across surfaces.

Tool _output_ is untrusted data, not trusted instruction — a boundary that binds the Agent and Workflow sections that consume it. Capability-bearing tools (MCP servers, connectors) are gated by consent and surface scope: `ConnectorRegistryEntry` carries `allowedSurfaces`, `permissionIds`, `adminApprovalRequired`, and `consentRequired`, and MCP stdio spawn requires a signed manifest in production (consent fallback only under developer mode, with argv pinning) (packages/contracts/types/src/suite-contracts.ts L1146–1167; packages/tools/mcp/src/types.ts). The tool-call wire protocol and execution semantics are deferred to the AI Runtime book (see §54).

> **Architectural rule —** Every tool schema exposed to a model MUST pass through the shared `provider-protocol` normalization for the target provider via the adapter's `normalizeToolSchemas` hook; raw per-surface tool schemas MUST NOT be sent directly to a vendor API, and tool output MUST be treated as untrusted data, never as trusted instruction.

### 16. Agent Architecture

This section defines the agent boundary, not the agent loop. An agent is a bounded, multi-step, tool-using actor whose configuration and lifecycle are typed contracts in the Contracts layer — `AgentConfig`, `Agent`, `AgentLifecycleStatus`, `ToolExecution`, `AgentApprovalRequest` (packages/contracts/types/src/agent.ts), with multi-agent coordination expressed by the model-Council contracts and the A2A handoff protocol (packages/contracts/types/src/council.ts, packages/contracts/types/src/a2a.ts). The agent-loop step semantics, the tool-call protocol, and the autonomy/approval state machine are deferred to the AI Runtime book; the execution-substrate philosophy is referenced at §54.

The constitutional boundaries an agent MUST respect are not deferred. An agent runs inside a single trust mode and MUST NOT silently cross from Local to BYOK or Managed: any such transition is an explicit `HandoffDraft` (the handoff model — context selection, secret-scan redaction, payload-preview hash, consent — is owned by §24; see §3). Autonomous computer-use / browser control MUST default to ask-before-acting (human-in-the-loop); allow-all autopilot is an explicit opt-out only, guarded by a CI regression test (apps/extension/src/background.ts; apps/extension/**tests**/computer-use-default-ask.test.ts). An agent's tool calls are subject to the same consent and capability gating as any other capability (§12, §15).

> **Architectural rule —** An agent MUST execute within a single trust mode and MUST NOT silently cross from Local to BYOK or Managed; any boundary crossing MUST be an explicit `HandoffDraft` with context selection, secret-scan redaction, payload preview hash, and recorded consent.

> **Architectural rule —** Autonomous computer-use, browser, or CDP control MUST default to ask-before-acting; allow-all autopilot MUST be an explicit opt-out only, and the default-deny invariant MUST be guarded by a CI regression test.

### 17. Workflow Architecture

A workflow is the declarative composition of agents, tools, and control flow into a repeatable graph — and this section defines only its boundary. A `WorkflowDefinition` is a typed node-graph (agent / decision / loop / parallel / wait / script / tool nodes) with manual, scheduled, event, and webhook triggers (packages/contracts/types/src/workflow.ts). The execution algorithm — how nodes are scheduled, how state advances, how failures and retries are reconciled, how triggers fire — is deferred to the AI Runtime book (see §54). This constitution states _what must hold_, not _how the engine runs_.

Two boundaries bind every workflow regardless of its execution model. First, a workflow inherits, and MUST NOT widen, the trust boundary of its actors: a node that performs inference or a boundary crossing is subject to the provider abstraction (§13), the consent-gated handoff rule (§16), and capability honesty (§12) exactly as a direct action would be. A scheduled or event-triggered workflow MUST NOT become a covert channel that routes Local-origin data to managed cloud. Second, workflow triggers that originate outside the user (webhook, event) are untrusted inputs and MUST be authenticated and validated before they can drive execution.

> **Architectural rule —** A workflow MUST NOT widen the trust boundary of the actors it composes; every inference, tool call, or boundary crossing within a workflow node is subject to the provider abstraction, consent-gated handoff, and capability-honesty rules, and externally originated triggers (webhook/event) MUST be authenticated and validated before driving execution.

## Part III — The State Plane

### 18. Memory Architecture

Memory is the platform's durable model of the user across time: what they have told the system to remember, what the system has learned worth keeping, and what a project carries with it. Memory is a **state plane**, not an agent capability — it outlives any one session, any one model, and any one surface, and the trust boundary that produced a memory is part of the memory itself. A memory's privacy mode is intrinsic and immutable: a `local`-origin memory is local data forever, and the existence of a cloud memory store does not make it the home of every memory.

**Current state:** Memory is a dual-stack reality, not one synced surface. The cloud store is a flat fact projection — `user_memories` carrying `{content, category, source, is_deleted}` with `server_version` for delta sync (architecture-manifest.md §6, §7; cited there as migrations `0010`/`0040`). The local desktop store is a richer two-layer model — long-term `user_memory` plus append-only `daily_logs` — with importance decay, access-boost, and a local semantic index (apps/desktop/src-tauri/src/core/agi/memory*manager.rs). These are divergent models. **Target state:** the relationship between the local memory graph and the cloud fact projection is a \_reconciliation contract* — what is promotable, what is projection-only, and what never leaves the device — owned by the Memory Runtime book, not an assumption that one is a lossy mirror of the other.

The constitutional commitment this section makes is **retrieval determinism and ownership**. Memory retrieval — given a fixed memory corpus and a fixed query, decide which memories are eligible and in what order they are returned — MUST be deterministic and reproducible: the same inputs MUST yield the same result, independent of wall-clock time except where decay is an explicit, declared input. This is what makes memory _auditable_ — a user (or an agent reviewing its own behavior) can ask "why did the model know that?" and get a stable answer. The retrieval _algorithm_ — scoring, ranking, the semantic index, decay curves, the summarization-to-memory promotion cadence — is deferred entirely to the Memory Runtime book. This section fixes only the boundary: retrieval is deterministic, and which trust boundary owns each memory is non-negotiable.

> **Architectural rule —** A memory's trust boundary is intrinsic and immutable; a `local`-origin memory MUST NEVER be silently promoted into the cloud memory store, and crossing it to cloud MUST be the explicit, consented Local→BYOK/Managed handoff, never an implicit sync.
> **Architectural rule —** Memory retrieval MUST be deterministic and reproducible: the same memory corpus and query MUST yield the same eligible set and order, with decay or recency admitted only as an explicit, declared input — never as ambient nondeterminism.
> **Architectural rule —** The reconciliation between the local two-layer memory model and the cloud flat-fact projection MUST be an explicit, owned contract (what is promotable, projection-only, or device-only); the cloud projection MUST NOT be treated as an authoritative mirror of the local memory graph.

### 19. Context Architecture

Context is the assembled input a model sees for one turn: the slice of conversation, memory, project knowledge, tool results, and instructions selected to fit a budget. Context assembly is the single most behavior-determining step in the platform — two assemblies of the same history produce two different agents — and so it is governed as constitutional state, not left to each surface. Context is **derived, never authoritative**: it is a deterministic function of the underlying session, memory, and storage planes, and it owns no durable state of its own.

The binding commitment is **assembly determinism**. Given a fixed conversation, a fixed memory corpus, a fixed project, a fixed token budget, and a fixed model context window, context assembly MUST produce the same assembled context every time. Determinism here is not an optimization — it is the precondition for capability honesty and for reproducing, explaining, and testing model behavior. A nondeterministic assembler makes every downstream claim ("the model considered your project notes") unverifiable. The token budget that triggers compaction MUST be read from model metadata, never guessed: the platform already drives compaction off a budget defaulting to a fraction of the model's declared context window (apps/web/lib/llm-providers/context-management.ts), and the window itself comes from the model catalog SSOT (`AGI-AI-0001`), never from a hardcoded constant.

**Current state:** server-side context management for Anthropic models supports distinct compaction modes (compact, clear-tool-uses, clear-thinking, none) keyed to a token trigger (apps/web/lib/llm-providers/context-management.ts), while the desktop separately promotes facts from old conversations into long-term memory on a periodic summarization cadence (apps/desktop/src-tauri/src/core/agi/conversation*summarizer.rs). These are two assembly/compaction paths, not one shared assembler. The compaction \_modes*, _trigger thresholds_, _summarization algorithm_, and the order in which sources are packed into the budget are **deferred to the Context Runtime book**; this section fixes only that assembly is deterministic, budget-bounded from real model metadata, and that context never reaches across a trust boundary it was not authorized to read.

> **Architectural rule —** Context assembly MUST be deterministic: a fixed conversation, memory corpus, project, token budget, and model context window MUST always produce the same assembled context.
> **Architectural rule —** The context budget that governs compaction MUST be derived from the model's declared context window in the catalog SSOT (`AGI-AI-0001`); a context window or budget MUST NEVER be hardcoded, invented, or guessed.
> **Architectural rule —** Context assembly MUST NOT pull state across a trust boundary the turn is not authorized for: a `managed` turn MUST NOT silently assemble `local`-origin content, and a `local`/`byok` turn MUST NOT pull from the shared cloud store.

### 20. Session Architecture

A session is the lifecycle envelope of one continuous unit of work — its identity, its trust boundary, its persistence, and its lineage of forks and resumes. The platform's product invariant is that a conversation is one unified thing whose file work, tool runs, and artifacts are _states of that conversation_ (`AGI-PROD-0001`), so the session is the spine the State Plane hangs on: memory promotes from it, context assembles from it, sync transports it, storage persists it.

The constitutional commitments are **identity, boundary-pinning, and explicit lineage**. A session's trust boundary is fixed at creation and is part of its identity: a `local` session is local for its whole life, and there is no in-place mutation that turns it `managed`. A transition to a different boundary is a **new session forked from the old one** — the explicit Local→BYOK/Managed handoff (the `HandoffDraft` model is owned by §24) — and the original session remains in its origin boundary unchanged (`AGI-TRUST-0002`; platform-constitution.md §23.5). Cross-device session identity MUST be a client-generatable, time-ordered UUIDv7 that fails closed when no cryptographic RNG is available (packages/platform/utils/src/uuidv7.ts), because an identity collision corrupts every plane that keys off the session.

**Current state:** persistence and lineage are surface-specific and honest about it. The desktop pins `app_mode` per conversation for strict Local/Cloud separation and assigns a cloud identity only on sync (architecture-manifest.md §6, §7); the CLI persists managed sessions as atomically written, versioned JSONL (apps/cli/src/platform/runtime/session.rs). The _concrete_ session schema, the fork/checkpoint/resume/replay state machine, and per-surface persistence formats are **deferred to the Session Runtime book**. This section fixes only that session identity is a fail-closed UUIDv7, that the trust boundary is immutable per session, and that boundary transitions are explicit forks, never edits.

> **Architectural rule —** A session's trust boundary is fixed at creation and immutable for the session's life; changing a session's boundary MUST be a new forked session via the explicit, consented handoff, never an in-place mutation of the original.
> **Architectural rule —** Cross-device session identity MUST be a client-generatable, time-ordered UUIDv7 that fails closed (throws) when no cryptographic RNG is available; it MUST NEVER fall back to a non-cryptographic source.
> **Architectural rule —** A `local`-origin session MUST carry no cloud identity and MUST NEVER be enqueued for cloud sync; a cloud identity is assigned only when a session is created in, or explicitly forked into, the `managed` boundary.

### 21. Synchronization Architecture

Synchronization is the mechanism by which the shared cloud state of the `managed` product reaches every authorized surface as one consistent view. This section defines that mechanism and its boundaries; **the cross-mode question of when, whether, and how state is permitted to cross from a user-private boundary into the cloud is owned by §44 (see §44)** and is not relitigated here. The mechanism described below operates _entirely within the `managed` boundary_ — it transports state that is already, by §44's principles, cloud-resident — and it MUST uphold the inheritance that Local state never silently leaves the local trust boundary (`AGI-TRUST-0001`; platform-constitution.md §23.5).

The mechanism is a **server-authoritative, monotonic-cursor delta sync over tombstones** (architecture-manifest.md §6). The server stamps every write — including soft-deletes and metadata edits — with a fresh monotonic version drawn from a single shared sequence; clients pull strictly forward of an opaque cursor and apply idempotent upserts. The server is the sole authority on ordering: clients MUST treat the version as an opaque monotonic value and MUST NOT mint, reorder, or numerically interpret it in a way that loses precision. Deletes propagate as tombstones, never as wire-level hard-deletes, so that a deletion is itself a replicable, ordered event. Conflict resolution is **per-entity and explicit**, not one global policy: append-only-immutable for messages, last-writer-wins for mutable records — never a silent merge that fabricates a state neither client wrote. An apply that cannot satisfy a referential dependency MUST be retained for retry, never silently dropped (architecture-manifest.md §6 cites this transport; the per-entity conflict matrix and cursor-frontier algorithm are deferred to the Synchronization Runtime book).

Sync is **gated twice and fails closed**. It runs only in the `managed` boundary, and the egress path that carries it MUST independently refuse to transmit when the privacy boundary is not `managed` — so a misconfigured sync engine cannot become an exfiltration channel. The server MUST derive the owning user identity from the verified session and MUST NEVER trust an owner identifier supplied in a sync payload.

> **Architectural rule —** Synchronization operates only within the `managed` trust boundary; the sync transport MUST be gated by an independent, fail-closed egress check that refuses transmission whenever the privacy boundary is not `managed`, so sync can never carry `local` or `byok` state off the user's control.
> **Architectural rule —** The server is the sole authority on sync ordering: every synced write MUST be stamped with a fresh server-assigned monotonic version on insert and update, and clients MUST treat that version as an opaque cursor compared without precision loss — never minting or reordering it.
> **Architectural rule —** Deletions MUST propagate as tombstones, never as wire-level hard-deletes; conflict resolution MUST be an explicit per-entity policy (append-only for messages, declared last-writer-wins for mutable records), never a silent merge that invents an unwritten state.
> **Architectural rule —** A sync apply that cannot satisfy a referential dependency MUST be retained for retry with a recovery path; silently discarding it is prohibited.
> **Architectural rule —** The owning user identity for any synced write MUST be derived server-side from the verified session and MUST NEVER be taken from the request payload.

### 22. Storage Architecture

Storage is where the State Plane comes to rest. The platform's defining constitutional structure is that the **three trust boundaries have three distinct stores**, and this section's first duty is to keep them distinct: `local` state lives in user-owned on-device storage; `byok` state lives with the user and routes only to the user's own provider; `managed` state lives in AGI-hosted storage. A single store that served all three would collapse the boundary primitive the whole platform rests on (platform-constitution.md §23.4, §24); the separation is therefore architectural, not configurable.

**The three stores (architecture-manifest.md §7):** the **local store** is encrypted on-device persistence — SQLCipher SQLite on desktop/mobile, JSON/JSONL on CLI, MMKV on mobile — and is the _complete and authoritative_ home of Local Mode state; it never requires the cloud and is never silently uploaded. The **BYOK store** is user-owned storage whose only egress is to the user's own provider; AGI hosts none of its inference state. The **managed store** is AGI-hosted Neon Postgres accessed exclusively through the vendor-neutral data-layer over parameterized SQL (no ORM), with Vercel Blob for media. The boundary between the local/BYOK stores and the managed store is the same fail-closed egress boundary that governs sync (§21) and is owned in principle by §44.

The managed store carries one additional constitutional obligation: **database-layer tenant isolation**. Per-user isolation MUST be enforced at the database boundary via row-level security — queries running as a non-bypass role with the verified session subject bound per request — and MUST NOT rely on an application-layer `where user_id` filter as its sole control. **Current state:** database-layer isolation is shipped-but-dormant on the live path (the full RLS-dormant current-state narrative is owned by §27; `AGI-SEC-0001`, partially realized). **Migration:** every user-data path, CRUD and sync alike, moves onto the verified-JWT RLS-bound adapter so the database is the backstop, not the prose. The migration ledger discipline, encryption-at-rest specifics, retention/deletion mechanics, and the local-PK-to-cloud-identity mapping are deferred to the Storage Runtime book.

> **Architectural rule —** The three trust boundaries MUST have three distinct stores; `local` state MUST live in user-owned on-device storage as its complete authoritative home, `byok` state MUST stay user-owned with egress only to the user's own provider, and only `managed` state MAY live in AGI-hosted storage — no single store may serve more than one boundary.
> **Architectural rule —** Local-origin stored state MUST function fully without any cloud dependency and MUST NEVER be uploaded silently; movement to the managed store MUST be an explicit, reviewable, consented act.
> **Architectural rule —** All managed-store access MUST flow through the vendor-neutral data-layer using parameterized SQL; feature code MUST NOT import a concrete database driver or concatenate SQL strings.
> **Architectural rule —** Per-user isolation in the managed store MUST be enforced at the database layer via row-level security under a non-bypass role with the per-request verified session subject bound; an application-layer `where user_id` filter MUST NOT be the sole isolation control on any live user-data path.

## Part IV — The Trust Plane

### 23. Security Architecture

Security in this platform is not a perimeter; it is a set of boundaries that the architecture itself encodes, enforces, and refuses to let a feature cross for convenience. The constitutional substrate is the three-tier trust model — Local, BYOK, and Managed — represented in code as three orthogonal typed dimensions (`PrivacyMode`, `ProviderMode`, `ChatExecutionMode`) in a single owner (packages/contracts/types/src/suite-contracts.ts). Every other security decision in the system is downstream of which boundary a session occupies. The structure of the security model — trust boundaries in suite-contracts, the egress guard, the policy crates, secret stores — is owned by architecture-manifest.md §8; this section defines the principles that govern it and registers the architectural invariant that binds it.

A security decision MUST be centralized, not re-derived at each call site. The platform learned this the hard way: a per-site `=== 'local'` privacy check drifted from the others and leaked telemetry in BYOK mode, which is why the privacy-boundary predicate now has exactly one implementation that egress, error-tracking, and analytics all delegate to (apps/desktop/src/stores/privacyBoundary.ts). Duplicated security logic is a latent breach; a single source of truth for "is this boundary private" is a structural guarantee. The same discipline applies to authorization (the verified session is the only authority on identity) and to capability advertisement (a surface MUST NOT offer what its boundary cannot honor).

The system MUST fail closed. Where a boundary cannot be determined — an unreadable privacy store, an unhydrated app-mode, an unverifiable token — the architecture MUST treat the session as the most restrictive boundary and deny the privileged action. Blocking is recoverable; leaking is not. This is asymmetric by design: availability is sacrificed to confidentiality at the trust boundary, and the few deliberate fail-open tradeoffs (see §26) are named, bounded, and never applied to the Local/BYOK/Managed boundary itself.

> **Architectural rule —** Local, BYOK, and Managed Cloud are separate trust boundaries; the boundary a session occupies MUST be derived from the single trust-mode contract in packages/contracts/types, never re-inferred ad hoc at a call site.

> **Architectural rule —** The privacy-boundary predicate (is-this-private) MUST have exactly one implementation per surface, shared by every consumer (egress, error-tracking, analytics, sync); a per-call-site re-derivation of trust state is forbidden because it has previously drifted and leaked BYOK telemetry.

> **Architectural rule —** Every trust-boundary and authorization decision MUST fail closed: an unreadable, unhydrated, or unexpected security-relevant state MUST resolve to the most restrictive outcome (deny / block / treat as private).

> **Architectural rule —** A security control that is incomplete or dormant MUST be documented as such with its real enforcement state; a control MUST NOT be described as enforced, global, or zero-leak while bypass paths exist outside it.

### 24. Privacy Architecture

Privacy here is a structural property of Local Mode, not a policy bolted onto a cloud product. Local Mode is defined by user-owned compute AND user-owned storage; cloud inference is never required to use it. The privacy architecture's first obligation is therefore negative: in Local and BYOK modes, the platform MUST NOT route the user's chats, files, tool results, or telemetry to AGI-managed cloud. This is enforced at a fail-closed egress chokepoint that throws before any network I/O when the session is in a private boundary and the target is an our-cloud host (apps/desktop/src/lib/egressGuard.ts; mirrored at apps/mobile/lib/egressGuard.ts). BYOK provider hosts are deliberately absent from the denylist so direct-to-provider streaming works — BYOK egress goes to the user's provider, never through AGI.

This section is the single owner of the telemetry trust-boundary rule, which §38 (Telemetry) inherits rather than restates. Observability is a consumer of the trust boundary, not an exception to it: error-tracking and analytics MUST consult the same privacy predicate as egress, and MUST emit nothing — not metrics, not error reports, not usage counters — that originates from a Local or BYOK session. Telemetry is permitted only in Managed mode, only for managed-mode events, and Local-origin content (chat text, file contents, tool I/O) MUST NEVER appear in any telemetry payload on any surface or in any mode. The consolidation of the privacy predicate (§23) exists precisely because telemetry once leaked across this line.

Crossing from Local to a cloud boundary is never implicit. A Local→BYOK or Local→Managed transition MUST be an explicit, user-consented fork carrying context selection, a secret-scan redaction report, a payload preview hash, and a visible provider label (the `HandoffDraft`/`RedactionReport` model in suite-contracts.ts). The generated-file trust-boundary validator extends this to artifacts: Local files stay on `file://`/local_device scope and are never uploaded; BYOK transfers require accepted-preview-with-hash plus approval evidence; Managed files require quota, owner, checksum, and retention/deletion metadata. **Current state:** the egress chokepoint exists only on Desktop and Mobile and only intercepts the WebView/TS fetch layer; CLI and VS Code (both offering Local mode) have no egress guard, and the Tauri Rust reqwest layer sits outside the Desktop chokepoint (apps/desktop/src/lib/egressGuard.ts scope note; grep of apps/cli + apps/extension-vscode, 2026-06-25). **Target state:** the trust-boundary egress check is honored by every surface offering Local/BYOK and by every code path capable of reaching our cloud. AGI-TRUST-0001 is therefore **Partially enforced** today; defer the wire-level enforcement design to the Trust Boundary and Egress Specification.

> **Architectural rule —** A Local-mode chat, file, tool result, or telemetry event MUST NEVER be routed to AGI-managed cloud; BYOK payloads MUST go directly to the user-owned provider and MUST NOT transit AGI cloud.

> **Architectural rule —** Telemetry, error reports, and analytics MUST be emitted only in Managed mode and MUST consult the same fail-closed privacy predicate as egress; Local- or BYOK-origin events MUST be suppressed, and Local-origin content MUST NEVER appear in any telemetry payload. (Owned by §24; inherited by §38.)

> **Architectural rule —** Every surface that offers Local or BYOK mode MUST enforce the boundary through a fail-closed egress chokepoint, and any code path capable of reaching our cloud that sits outside that chokepoint (native bridges, the Tauri Rust layer) MUST independently honor the boundary.

> **Architectural rule —** A Local→BYOK or Local→Managed transition MUST be an explicit, user-consented fork carrying context selection, a secret-scan redaction report, a payload preview hash, and a visible provider label; it MUST NEVER be silent.

> **Architectural rule —** Persisted generated files MUST satisfy the per-mode trust-boundary validator: Local stays on file://+local_device and is never uploaded; BYOK requires accepted-preview-with-hash plus approval evidence; Managed requires quota, owner, checksum, and retention/deletion metadata.

### 25. Identity Architecture

Identity is the spine that authorization hangs from, and the platform keeps it deliberately thin: one managed identity provider (Clerk) issues the verifiable subject claim, and every server-side authorization decision resolves to that subject. The identity architecture's central invariant is that the user identifier used for any access decision MUST originate from a signature-verified token and MUST be derived server-side — never read from a request body, a client-supplied field, or an unverified token parse. Structural identity facts (Clerk as managed identity, device-authorization handoff, the relevant migrations) are owned by architecture-manifest.md §9; this section governs how identity flows into authorization without becoming forgeable.

Identity is not the same as trust mode. A user has one identity across all six surfaces, but the trust boundary they operate in is a separate, orthogonal property of the session. Local and BYOK sessions are still owned by an identity for local bookkeeping, yet that identity MUST NOT be used to justify cloud egress — boundary precedes identity at the egress gate. Conversely, Managed-mode actions require both a verified identity and an active entitlement; a verified identity alone is not authorization to consume metered cloud.

A verified identity also carries account state. Suspension and ban are properties of the identity that authorization MUST consult, and the platform treats the identity store as the authority on whether an account may act at all. **Tradeoffs:** the current implementation reads account status but fails open on a store-lookup error (apps/web/lib/api-auth.ts:29-32), trading strict revocation for availability during a DB outage; a known suspended/banned status is always rejected, but a lookup failure admits the request. This is a named, bounded exception — it applies to account-status enforcement, never to the trust-boundary or tenant-isolation controls, which fail closed.

> **Architectural rule —** Any user identifier used for authorization or bound to a tenant-isolation control MUST originate from a signature-verified token and be derived server-side; a user_id (or equivalent) from a request body or an unverified token parse MUST NEVER be trusted.

> **Architectural rule —** Identity and trust mode are orthogonal: a verified identity MUST NOT by itself authorize cloud egress or metered consumption, and trust-boundary enforcement takes precedence over identity at the egress gate.

> **Architectural rule —** Account state (suspended/banned) MUST be enforced from the identity store on every authenticated request; a known revoked status MUST always be rejected.

### 26. Authentication Strategy

Authentication establishes who is making a request; this section fixes where that verification happens and what the system does when it cannot. Two authentication paths exist by necessity — a session path for browser surfaces and a bearer-token path for the native and developer surfaces (desktop, CLI, mobile) — and both MUST converge on the same signature verification before any privileged work proceeds (apps/web/lib/api-auth.ts:38-79). The number of entry paths may grow; the rule that every path ends in cryptographic verification of the subject MUST NOT. The platform defers the concrete auth flows, token formats, refresh/rotation, and device-authorization handoff to the Identity, Authentication and Session Specification — this constitution binds only the boundary: unverified credentials confer nothing.

Verification MUST precede privilege, structurally. The data layer can bind a subject for database isolation, but the adapter that does so does not itself verify the token signature — it parses the subject and binds it (packages/platform/data-layer/src/adapters/neon.ts). That is safe only because the live entry point verifies the Clerk token first and the unverified-parse path is default-deny (apps/web/lib/server/rls-db.ts). The architectural requirement is that this ordering is never reversible: the unverified-subject path MUST stay default-deny and MUST NOT be reachable on a request that has not already passed verification.

Public endpoints are the deliberate, enumerated exception. A small allowlist of routes (health, downloads, model catalog, waitlist) skips authentication because they expose no user data; everything else requires a session or a verified bearer token (apps/web/proxy.ts). The allowlist is a positive contract, not a default — adding a route to it is a security decision, and an unlisted route MUST require authentication.

> **Architectural rule —** Every authentication path (browser session, native/CLI/mobile bearer token, and any future path) MUST converge on cryptographic verification of the subject before any privileged work; an unverified credential MUST confer no access.

> **Architectural rule —** Subject verification MUST structurally precede any privileged operation that consumes the subject (RLS binding, ownership checks); the unverified-decode path MUST remain default-deny and MUST NOT be reachable post-verification-bypass.

> **Architectural rule —** Unauthenticated access MUST be confined to an explicit, enumerated allowlist of routes that expose no user data; any route not on the allowlist MUST require authentication.

### 27. Authorization Strategy

Authorization answers what a verified identity may do, and the platform's controlling principle is that this decision is enforced on the trusted side of a boundary — server-side, or in the privileged native/extension layer — never in the client that is being authorized. Ownership and tenant isolation are not advisory filters the client can opt into; they are constraints the trusted side imposes. This is the concrete form of the Platform Constitution's invariant that authorization, ownership, and tenant isolation are enforced at the boundary.

Tenant isolation MUST be enforced in depth, with the database as the backstop rather than the sole control. The architecture mandates two layers: an application-layer ownership filter and database Row-Level Security that binds the verified subject per request under a non-bypass role, with explicit `WITH CHECK` so a cross-tenant write is rejected at the storage layer even if the application filter is wrong. The server MUST always derive `user_id` from the verified session for any write; a client-supplied owner is never trusted. **Current state:** RLS is enabled and FORCEd on the user-scoped tables but is dormant on most of the live path — only the delta-sync routes run through the subject-binding adapter, while the broad CRUD surface still relies on the application-layer `where user_id = $1` filter alone (apps/web/db/neon/0037_rls_user_isolation.sql:26-33; apps/web/lib/server/rls-db.ts). AGI-SEC-0001 (server-side isolation) is therefore **partially realized**: app-layer isolation is live, DB-layer isolation is shipped-but-dormant. **Migration:** route the live data path through the subject-bound adapter so RLS bites everywhere; defer the RLS policy SQL, role model, and GUC-binding mechanics to the Security Specification / Data Isolation Specification.

Authorization also governs capability and consumption, not just data. Managed cloud is the only metered egress and the only path that may write the shared cloud chat store; access to it MUST be gated by subscription/entitlement. Managed cloud is in public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate has been removed, and the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident-response kill-switch. Ledgering, abuse, fraud, refund, and deletion controls must keep pace with public usage but no longer gate access. Autonomous capabilities carry their own authorization gate: computer-use / CDP browser control MUST default to ask-before-acting, with allow-all autopilot as an explicit opt-out only (apps/extension/src/background.ts). Untrusted inbound requests — user- or LLM-supplied URLs — MUST be authorized against SSRF rules (reject internal/loopback/link-local/metadata addresses and non-https) before any fetch, independently of any allowlist (apps/web/lib/egress-policy.ts). Authorization is thus a property of every privileged action, not only of data reads.

> **Architectural rule —** Authorization, ownership, and tenant-isolation decisions MUST be enforced server-side or in the privileged native/extension boundary; the client being authorized MUST NEVER be the authority on its own permissions.

> **Architectural rule —** Per-user data isolation MUST be enforced in depth: an application-layer ownership filter AND database RLS (subject bound per request under a non-bypass role, with explicit WITH CHECK); the `where user_id = $1` filter alone MUST NOT be the sole tenant-isolation control on the live path.

> **Architectural rule —** The server MUST derive the owner identifier from the verified session for every user-scoped write; a client-supplied owner MUST NEVER be trusted.

> **Architectural rule —** Managed cloud is the only metered egress and the only path that may write the shared cloud chat store; it MUST be gated by subscription/entitlement. Managed cloud is in public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate has been removed, and the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident-response kill-switch. Ledgering, abuse, fraud, refund, and deletion controls must keep pace with public usage but no longer gate access.

> **Architectural rule —** Autonomous computer-use / browser control MUST default to ask-before-acting; allow-all autopilot MUST be an explicit opt-out only, guarded by a regression test.

> **Architectural rule —** User- or LLM-supplied URLs MUST be authorized against SSRF rules — reject non-https and internal/loopback/link-local/private/cloud-metadata addresses and userinfo URLs — before any fetch, independently of any service allowlist.

## Part V — Interfaces & Execution

### 28. API Design Principles

An AGI API is a trust-boundary contract before it is a data contract. Every externally reachable handler MUST establish three facts before it does work: who the caller is (a signature-verified identity), which trust boundary the request belongs to (Local, BYOK, or Managed — see §13 and AGI-TRUST-0001), and whether the caller is entitled to the effect requested. Authentication and authorization are not middleware decoration; they are the first statements of the handler body. The web backend already concentrates LLM traffic behind a versioned, OpenAI-wire-compatible surface (`apps/web/app/api/llm/v1/chat/completions/route.ts`) and a public host rewrite (`apps/web/vercel.json`), which is the correct shape: a stable, versioned public contract decomposed into service modules (auth-gate, request-processor, response-builder) rather than monolithic handlers.

Networking to model providers MUST NOT be re-specified at the API layer; it flows through the provider abstraction (§13). The API layer's job is to resolve identity, enforce entitlement and trust mode, reserve any metered resource, and hand a normalized request to that abstraction — never to embed vendor HTTP. Two failure-mode rules from current evidence are constitutional. First, **capability honesty at the contract edge**: an API MUST NOT advertise (in an allowlist, picker, or 200-implying validation) a capability the executing runtime cannot fulfill (the live 11-advertised / 4-served violation is owned by §50). Second, **uniform error and correlation discipline**: every handler MUST return errors through the shared envelope (`apps/web/lib/error-handler.ts`), suppressing raw driver/provider text except via the explicit safe-to-expose allowlist, and MUST propagate a request id (the current uneven adoption of the shared envelope across the ~149 route handlers is owned by §35).

**Current state:** error-envelope and request-id discipline exist but are unevenly adopted; capability advertisement and backend capability have drifted on the cloud provider path. **Target state:** one handler skeleton — verify identity, classify trust boundary, check entitlement, reserve, delegate to the abstraction, return through the shared envelope — applied to every route, with advertised capability derived from real backend capability.

> **Architectural rule —** Every externally reachable API handler MUST verify a signature-verified caller identity, classify the request's trust boundary (Local/BYOK/Managed), and confirm entitlement before performing any effect.

> **Architectural rule —** An API MUST NOT advertise or validate-as-acceptable a provider, model, or capability that the runtime which will execute it cannot actually fulfill; advertised capability MUST be derived from real backend capability.

> **Architectural rule —** All API responses MUST be returned through the shared error envelope with a propagated request/correlation id; raw provider, driver, or SQL error text MUST NOT reach a client except via an explicit safe-to-expose code allowlist.

> **Architectural rule —** API handlers MUST delegate all model-provider networking to the provider abstraction (§13) and MUST NOT embed vendor HTTP, credential resolution, or stream parsing at the route layer.

### 29. Database Design Principles

This section governs ownership, boundaries, and migration discipline only. Concrete schemas, table designs, indexes, and migration SQL are deferred to the Database Specification; the canonical migrations live in `apps/web/db/neon` and MUST be referenced there, never enumerated here.

Two principles are constitutional. First, **the database is a trust-boundary store, not a shared bag of rows.** Local, BYOK, and Managed are separate stores under separate ownership: Managed user data lives in Neon Postgres, Local data lives in user-owned storage (desktop SQLCipher SQLite, CLI JSON/JSONL, mobile MMKV) and MUST NEVER be the same store. A Local-mode record MUST carry no cloud identity and MUST NOT be writable to the Managed store except through an explicit, consented Local→Managed transition (§13, AGI-TRUST-0001). Within the Managed store, per-user isolation MUST be enforced at the database layer — Row-Level Security with `USING` and explicit `WITH CHECK`, queries executing as a non-`BYPASSRLS` role with the verified JWT subject bound per request — and NOT solely by an application-layer `where user_id = $1` filter. **Current state:** database-layer RLS is shipped-but-dormant on the live CRUD path (full current-state owned by §27; AGI-SEC-0001). **Migration:** route every user-data path through the verified-subject, RLS-bound adapter so the database is the backstop, not the prose.

Second, **the schema is owned by an auditable, sequential, append-only migration history, applied through a runner that records what it applied.** Migrations are immutable once landed; corrections are new migrations, not edits. **Current state:** the migration files are sequential and immutable, but production was applied by a self-described temporary script with no ledger table (`apps/web/scripts/_prod_migrate.mjs`), so drift between the committed migrations and the live schema is unverifiable from the repo. **Target state:** a runner that records applied migrations in a ledger, applied branch-first, with an RLS-activation probe as a gate. Access MUST flow through the vendor-neutral data-layer adapter (`packages/platform/data-layer`); feature code MUST NOT import a concrete driver, and all SQL MUST be parameterized.

> **Architectural rule —** Local, BYOK, and Managed data stores are separate trust boundaries; a Local-origin record MUST carry no cloud identity and MUST NOT be written to the Managed store except through an explicit, consented, audited Local→Managed transition.

> **Architectural rule —** Every user-scoped read or write on the live request path MUST execute under the RLS-bound adapter (non-`BYPASSRLS` role with the verified JWT subject set per request); the application-layer `where user_id = $1` filter MUST NOT be the sole tenant-isolation control.

> **Architectural rule —** Schema changes MUST be sequentially numbered, immutable migrations applied through a runner that records applied migrations in a durable ledger; ad-hoc or temporary production-apply scripts MUST NOT be the system of record.

> **Architectural rule —** All database access MUST flow through the vendor-neutral data-layer adapter and all SQL MUST be parameterized; feature code MUST NOT import a concrete database driver or concatenate SQL strings.

### 30. Event Architecture

An event is a fact that has happened; a command is a request for something to happen. AGI's architecture MUST keep these distinct, because they have different trust and durability obligations: a command crosses a boundary and may be refused, while an event records a boundary that was already crossed and MUST be durable enough to drive downstream effects (billing reconciliation, telemetry, sync). The platform's existing cross-surface mechanisms are already event-shaped: the delta-sync transport (server-authoritative monotonic version, tombstone propagation; see §6/synchronization owner) is an event log under a different name, and the credit reserve-then-reconcile flow is an event-sourced settlement. The constitutional requirement is that any such mechanism treat its records as immutable, ordered facts, not mutable state.

**Current state:** there is no durable event bus or pub/sub in the web backend — no queue or broker library is present, and cross-component reaction is direct function calls plus the per-entity sync cursor. This is honest and acceptable for the current scale; it is NOT a target to be papered over with the vocabulary of an event system that does not exist (capability honesty, §12.5). **Target state:** where asynchronous, multi-consumer reaction is genuinely required, it is introduced as a durable, ordered, at-least-once log with explicit consumers — not as fire-and-forget side effects in a request handler.

Two boundaries are non-negotiable for any event mechanism, present or future. Events MUST respect trust boundaries: a Local-origin fact MUST NOT be emitted onto a Managed-cloud event channel, and an event payload MUST carry only what its consumers are entitled to under the originating trust mode. And events that drive user-affecting effects (credit settlement, deletion, retention) MUST be idempotently consumable, because at-least-once delivery and retries are the only delivery guarantee a distributed system can honestly offer.

> **Architectural rule —** Events (facts that happened) and commands (requests that may be refused) MUST be modeled as distinct concerns; an event record, once emitted, MUST be treated as an immutable, ordered fact.

> **Architectural rule —** A Local- or BYOK-origin event MUST NOT be emitted onto a Managed-cloud channel, and event payloads MUST carry only data the consumer is entitled to under the originating trust mode.

> **Architectural rule —** Any event or message consumer that produces user-affecting effects MUST be idempotent; the system MUST assume at-least-once delivery and MUST NOT depend on exactly-once delivery for correctness.

### 31. Background Execution

Background execution is execution that outlives the request that triggered it, and its defining constitutional obligation is **observability**: work that runs without a user watching MUST leave a durable, inspectable record of that it ran, what it did, whether it succeeded, and why it failed. Background work that cannot be observed cannot be trusted, reconciled, or held to capability honesty.

**Current state:** background execution is minimal and authenticated — exactly one scheduled job (the daily credit reset, `apps/web/vercel.json` + `apps/web/app/api/cron/reset-credits/route.ts`) and one post-response continuation (`waitUntil` in the GitHub webhook). The cron is idempotent (get-or-create allocation) and gated by `CRON_SECRET`, with a dev bypass that additionally requires an explicit co-flag and a loopback host so a misconfigured staging container cannot become an unauthenticated credit-reset endpoint. This is the correct safety posture; what it lacks is durable observability — usage/cost telemetry lives in a warm-instance module-level `Map` that resets on cold start (`apps/web/lib/cost-tracker.ts`), and the platform's Sentry/OTel surfaces are no-op facades (capability-honesty gap). **Migration:** persist the durable record of any background job's outcome to the database, and back the facade observability with a real backend or expose it as honestly disabled via an `isEnabled()` signal.

Three rules bind every background task. It MUST authenticate via a server-side secret and MUST be idempotent, because a scheduler will eventually fire it twice. It MUST persist its outcome durably; an in-process structure MUST NOT be the authoritative record of any user-affecting metric. And any background work that can reach AGI cloud MUST honor the trust boundary independently of the request-layer egress guard (§13), because it runs outside the WebView fetch chokepoint that protects interactive paths.

> **Architectural rule —** Background and scheduled work MUST authenticate via a server-side secret (e.g. `CRON_SECRET`), MUST be idempotent, and any environment-based auth bypass MUST require an explicit co-flag plus loopback and fail closed outside dev.

> **Architectural rule —** Every background job MUST emit a durable, inspectable record of its execution and outcome; a module-level in-process structure MUST NOT be the authoritative record of any user-affecting metric.

> **Architectural rule —** Background execution that can reach AGI cloud MUST independently enforce the Local/BYOK/Managed trust boundary, because it runs outside the request-layer egress chokepoint.

### 32. Long Running Tasks

A long-running task is any unit of work — an agent loop, a multi-step tool dispatch, a scheduled automation, a compute session — whose lifetime exceeds a single request and whose progress matters to the user. Such tasks MUST be **resumable and cancellable**. Resumable means the task's state is checkpointed durably so that a process restart, cold start, or reconnection does not lose committed progress. Cancellable means there is an explicit, honored stop signal that halts further effects and releases reserved resources — the platform already models this for autonomous control via the explicit `emergency_stop` action and the approval/cancel state machine in the remote-control contract (`packages/contracts/types/src/suite-contracts.ts`), and that pattern is the constitutional baseline: every long-running task MUST have an out-of-band kill path.

**Current state:** the agentic tool-loop driver bounds work by a maximum step count (`apps/web/app/api/llm/v1/chat/completions/route.ts`), which is a correct guard against unbounded runaway but is not by itself resumability — a mid-loop interruption is not durably checkpointed on the cloud path. The desktop offline-operations queue (typed operation kinds, retry/backoff, priority, scheduling) is the closest existing resumable-task substrate. **Target state:** a long-running task records durable checkpoints at safe boundaries, exposes its lifecycle status for inspection (the observability obligation of §31 applies in full), and can be resumed from its last checkpoint or cancelled at any point.

Resource reservation and long-running tasks are coupled: a task that reserves a metered resource (credits) MUST release it on cancellation or failure, mirroring the existing reserve-then-refund-on-failure discipline. Cancellation that leaves resources reserved, or a crash that loses committed progress, are both correctness failures, not merely degraded UX.

> **Architectural rule —** Every long-running task MUST be resumable from a durable checkpoint and cancellable via an explicit, honored stop signal; a process restart MUST NOT lose committed progress, and a cancel signal MUST halt further effects.

> **Architectural rule —** A long-running task that reserves a metered resource MUST release that reservation on cancellation or failure; reserved resources MUST NOT be orphaned by a stop or a crash.

> **Architectural rule —** Long-running task lifecycle state (running, checkpointed, succeeded, failed, cancelled) MUST be durably recorded and inspectable; an agent or tool loop MUST additionally be bounded by an explicit maximum-step or budget limit.

### 33. Streaming Architecture

Streaming is the platform's default response shape for model output, and its defining obligation is **resumability under interruption** — a stream is a long-running task (§32) whose medium is an open connection, and connections drop. The current pipeline (native `ReadableStream` through `buildStreamResponse`, `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts`) already embodies the right invariants: it normalizes vendor SSE/NDJSON into the canonical `StreamChunk` discriminated union before any surface sees it (§13), it tracks Time-To-First-Token against configurable SLO thresholds, it reconciles metered usage only after the stream completes, and a stream-idle watchdog terminates a hung provider connection. These are constitutional: every surface consumes one normalized chunk vocabulary, never raw vendor frames, and an idle stream MUST be bounded so a stalled provider cannot pin a connection indefinitely.

**Current state:** the stream is resilient (watchdog, TTFT SLOs, post-stream credit reconciliation with refund-on-failure) but not resumable — a dropped connection mid-stream cannot be re-attached and continued from its last delivered position; the client must restart. **Target state:** a stream carries enough durable position state that a reconnecting client can resume from the last acknowledged chunk rather than re-running the generation, and partial output is reconciled (and metered) correctly across the reconnection. Wire formats, the `StreamChunk` variant set, and the resumption protocol are deferred to the runtime books; this constitution fixes only the obligations.

Trust-boundary discipline applies to streams in full: a Local- or BYOK-mode stream MUST stream directly from user-owned compute or the user's provider and MUST NOT transit AGI cloud (§13), and metered streaming is exclusively the Managed path. Credit settlement MUST be reconciled against actual streamed usage, and a stream that fails before completion MUST refund any reservation.

> **Architectural rule —** Surfaces MUST consume streamed model output only as normalized canonical `StreamChunk` records; raw vendor SSE/NDJSON frames MUST NOT cross into surface or experience code.

> **Architectural rule —** A streaming response MUST be resumable: a dropped connection MUST be re-attachable from the last acknowledged position without re-running generation, and partial output MUST be reconciled and metered correctly across the reconnection.

> **Architectural rule —** Every model stream MUST be bounded by an idle/stall watchdog, and metered usage MUST be reconciled against actual streamed output after completion, with any reservation refunded on pre-completion failure.

> **Architectural rule —** A Local- or BYOK-mode stream MUST originate directly from user-owned compute or the user's provider and MUST NOT transit AGI managed cloud; metered streaming is exclusively the Managed path.

## Part VI — Operability, Execution Modes & Synchronization

### 34. Reliability Principles

Reliability in AGI is not measured by aggregate uptime; it is measured by whether a stated capability does what the user was told it does, on the surface the user is using, in the trust mode the user selected. A reliable system is one that either delivers the advertised result or fails in a way the user can see and act on — capability honesty (platform-constitution.md §12) is therefore the first reliability principle, not a separate concern. A path that silently degrades, silently substitutes a model, or silently presents an incomplete view of synced state is unreliable even at 100% availability.

Reliability is distributed across trust boundaries that fail differently. Local Mode reliability depends only on user-owned compute and storage and MUST NOT degrade when our cloud is unreachable (see §41, §42). BYOK reliability depends on a user-owned provider and MUST surface provider faults as the provider's, never as AGI's. Managed reliability depends on metered infrastructure and is the only tier that may legitimately be unavailable due to AGI-side outage. Because these tiers fail independently, a reliability claim MUST be scoped to a tier; "the product is up" is meaningless when Local works and Managed is degraded.

Determinism at the boundaries is the load-bearing reliability mechanism. Where the system cannot guarantee success — a provider stream stalling, a sync apply missing a referential parent, a rate-limit store being unreachable — the architecture MUST pre-commit to a single deterministic outcome: a stream idle watchdog terminates a stalled stream rather than hanging (architecture-manifest.md §4), an unsatisfiable sync apply is retained for retry rather than dropped (apps/desktop/src-tauri/src/data/cloud_sync.rs), and a security-sensitive endpoint fails closed when its limiter store is unavailable (apps/web/lib/rate-limit.ts). The default direction of failure is a constitutional choice, not an implementation detail.

> **Architectural rule —** A reliability or availability claim MUST be scoped to a specific trust tier (Local, BYOK, Managed) and surface; no path may assert a capability the chosen route cannot actually deliver in that tier.

> **Architectural rule —** Every path that can fail MUST pre-declare a single deterministic failure outcome at its boundary; silent degradation, silent model substitution, and silently incomplete results are prohibited.

> **Architectural rule —** Local Mode reliability MUST NOT depend on AGI cloud reachability; a Local-only workflow MUST remain fully functional with all AGI-cloud hosts unreachable.

> **Architectural rule (v1.1) —** Stateless execution is the default architectural model; a stateful component MUST explicitly declare its state ownership, persistence boundary, replication strategy, consistency guarantees, and recovery behavior — recovery is a designed property, not an emergent one. (`AC-107`; generalizes `AC-68`. Per the v1.1 amendment, scalability/statelessness law lives here in §34, not in a separate §64.)

**Current state:** Reliability primitives are real but partial — the stream idle watchdog (packages/ai/provider-runtime), credit reserve/refund idempotency (apps/web/app/api/llm/v1/chat/completions/route.ts), and fail-closed rate limiting exist, but production error/perf visibility is a no-op (see §36) and CI is currently red (architecture-manifest.md §11), so the reliability posture is asserted faster than it is observed. **Target state:** every deterministic failure outcome above is observable through enabled telemetry (§38) before the capability is advertised as reliable.

---

### 35. Error Handling Philosophy

An error is a typed, intentional outcome — not an exception to be swallowed and not raw provider text to be forwarded. AGI distinguishes three audiences for every failure and serves each separately: the user gets an actionable, trust-mode-aware message; the operator gets a redacted, correlated diagnostic; the caller (another surface or service) gets a stable machine code. The system MUST NOT collapse these audiences — leaking a database error string to a user is both a security failure and a reliability failure, and hiding an actionable cause behind a generic "something went wrong" is a capability-honesty failure.

Errors flow through one envelope, and only an explicit allowlist of safe-to-expose codes is rendered verbatim (apps/web/lib/error-handler.ts maps `AppError` to `{error:{code,message},requestId}` with a `SAFE_TO_EXPOSE_CODES` allowlist; raw DB/SQL text is suppressed). The allowlist is the contract: a code is exposed because it tells the user something they can act on (credit required, rate limited, invalid model), never because suppression was inconvenient. Every error carries a propagated correlation id so the three audiences see the same incident.

Errors are classified by who owns the fix, because ownership determines the boundary behavior. A user error (bad input, missing entitlement) is rendered and not retried. A provider error in BYOK is attributed to the user's provider and surfaced as such, never masked as an AGI fault. A trust-boundary violation (a Local payload attempting cloud egress) is not an error to recover from but an invariant to enforce: it MUST fail closed before any I/O (see §42, §44 and the egress contract owned by §21–§24). Recoverable transient faults follow the resilience runtime book (retry, fallback, Retry-After); non-recoverable faults terminate deterministically.

> **Architectural rule —** Every API and IPC error MUST be returned through the shared typed envelope (`{error:{code,message},requestId}`); raw provider, database, or SQL error text MUST NOT reach the client except via an explicit safe-to-expose code allowlist.

> **Architectural rule —** Every error response and log line MUST carry a propagated correlation id (x-request-id) so user-facing, operator-facing, and caller-facing views of one incident are joinable.

> **Architectural rule —** A BYOK provider fault MUST be attributed to the user-owned provider and MUST NOT be presented as an AGI managed-cloud failure; trust-mode attribution is part of the error contract.

**Current state:** envelope discipline is real but not uniform — high-traffic routes (e.g. the cron handler) hand-roll `try/catch` and raw `NextResponse.json`, so request-id propagation and leak-suppression are not guaranteed across all ~149 web routes (apps/web/app/api/cron/reset-credits/route.ts). **Migration:** route handlers are brought under `withErrorHandler` incrementally; the envelope is the target for every handler, with bespoke handlers tracked as defects.

---

### 36. Observability Philosophy

Observability is the system telling the truth about itself, and that truth is itself bound by the trust boundary: an observability signal MUST NEVER carry Local-origin or BYOK-origin user content out of its private boundary (this inherits the privacy rules of §24 and is enforced by the same fail-closed predicate as egress, see §42). Observability that requires exfiltrating private content is not observability — it is a trust-boundary violation wearing a metrics costume. The architecture therefore separates structural/operational signals (request rates, latencies, error codes, capability-availability) from content, and only the former may leave a private boundary, and only in Managed.

The deepest observability principle here is the prohibition on observability theater. A module MUST NOT present a functional monitoring API that is silently a no-op, because a dashboard that reports nothing is more dangerous than no dashboard: it manufactures false confidence. Where a backend is not wired, the capability MUST report disabled through an explicit `isEnabled()`-style signal surfaced in health/status, so operators know visibility is absent rather than assuming it is present.

Every signal MUST be attributable to a tier and an incident. The correlation id from §35 is the join key across logs, metrics, and (when enabled) traces; the trust tier is the partition key that decides whether a signal may be exported at all. Behavioral specification of metric names, trace spans, and sampling is deferred to the Observability Runtime Book; this constitution fixes only the boundaries: what may be observed, where it may go, and that absence must be honest.

> **Architectural rule —** Observability signals MUST NOT carry Local-origin or BYOK-origin user content across its private trust boundary; only structural/operational telemetry may be exported, and only in Managed mode (inherits §24).

> **Architectural rule —** A module MUST NOT present a functional observability API (error capture, tracing, metrics) that is silently a no-op; an unwired backend MUST report disabled via an explicit isEnabled-style signal surfaced in health/status.

**Current state:** observability is a facade — `apps/web/shared/lib/sentry.ts` implements the full Sentry surface as pure no-ops (`isSentryEnabled()` always false) with no `@sentry/*` dependency installed, and there is no OpenTelemetry exporter. Production error and performance visibility effectively does not exist beyond logs. **Target state:** observability backends are wired and gated by the trust-tier partition rule above; until then the honest `isEnabled()=false` signal is the required minimum.

---

### 37. Logging Standards

Logs are an egress surface and a secret-leak surface before they are a debugging convenience, so the single non-negotiable standard is that all log output on every surface MUST pass through one secret-redacting facade before reaching any sink — console, file, or remote collector. Redaction is not best-effort string scrubbing bolted onto each call site; it is a single, shared, ported-once pattern set (`packages/platform/utils/src/logger.ts` ports the Rust `log_redaction.rs` patterns so the same keys are scrubbed on both sides of the IPC boundary). A raw `console.*` in production code is forbidden precisely because it bypasses this chokepoint.

Logging follows the trust boundary like every other signal: log content derived from Local or BYOK sessions is private and MUST NOT be shipped to an AGI-side collector (§24, §38). Log level is environment-bound — info/debug are dropped in production while warn/error are retained and routed to the (enablement-gated) error sink — so that the production log stream is operational signal, not a content firehose. Every line carries the correlation id from §35.

The single-facade rule has teeth only if there is exactly one facade. Two divergent logger contracts with incompatible signatures undermine the redaction guarantee, because lines emitted through the un-redacting logger are not scrubbed. Convergence on one redacting facade is the standard; surfaces with their own logger MUST route through the shared redaction layer or be treated as a leak.

> **Architectural rule —** All log output on every surface MUST pass through the shared secret-redacting logger facade before reaching any sink; raw console.\* in production code is forbidden.

> **Architectural rule —** Logs derived from a Local or BYOK session MUST stay within that private boundary and MUST NOT be shipped to an AGI-side collector; production logs MUST drop info/debug and retain only redacted warn/error.

**Current state:** two divergent loggers coexist — a pino instance on web (apps/web/lib/logger.ts, object-first, no redaction) and the redacting varargs facade in packages/platform/utils (the web pino path does not pass through the redaction patterns), so secrets in web-side logged objects are not guaranteed scrubbed. **Migration:** the web logger is reconciled onto the shared redacting facade; until then the pino path is a tracked leak risk, not a sanctioned second standard.

---

### 38. Telemetry Principles

Telemetry inherits the privacy and trust-boundary rules defined in §24 in full; this section does not restate them. The single constitutional addition here is gating: telemetry MUST be BYOK/Local-gated per the Platform Constitution, meaning no telemetry event originating in a Local or BYOK session may be emitted to AGI managed cloud, and the same fail-closed privacy predicate that guards egress (§42) MUST gate telemetry emission. Telemetry is just another form of egress and is subject to the identical boundary; a separate, weaker check for "analytics" is forbidden because such a check has previously drifted and leaked (the consolidation of `isPrivateTrustBoundary()` exists to prevent exactly this).

Telemetry that affects the user — usage, cost, billing-relevant counters — has a second, orthogonal requirement: durability. A user-affecting metric MUST be persisted to the system of record (the database), not held in process. An in-process, warm-instance Map is a cache, never the authoritative record, because in serverless it resets on cold start and is lossy. The shape of usage attributes (GenAI semantic conventions) is computed correctly; the gap is that it is not exported and not durably stored, which means it cannot be the basis of any user-facing charge.

Behavioral specification — event taxonomy, metric names, aggregation, retention windows — is deferred to the Observability Runtime Book. This constitution fixes only that telemetry obeys the §24 boundary, is gated by the fail-closed privacy predicate, and that any metric which can affect a user's bill or quota is durable.

> **Architectural rule —** Telemetry emission MUST be gated by the same fail-closed privacy predicate that gates egress; no Local-origin or BYOK-origin telemetry event may reach AGI managed cloud (inherits §24).

> **Architectural rule —** Any telemetry counter that affects a user's billing, credits, or quota MUST be persisted to the durable system of record; an in-process Map MUST NOT be the authoritative record of any user-affecting metric.

**Current state:** cost/usage telemetry lives in a module-level Map (apps/web/lib/cost-tracker.ts) that is LRU-capped at 1000 sessions and resets on cold start; the file flags durable Neon persistence as out of scope, and `toOtelAttributes()` is never exported to any backend. **Target state:** user-affecting usage is persisted to Neon and exported only in Managed under the §24 boundary; the in-process Map is demoted to a warm-instance cache.

---

### 39. Performance Philosophy

Performance in AGI is governed by perceived responsiveness on the path the user is waiting on, not by aggregate throughput. The single dominant metric is time-to-first-token on a streamed response, because every primary interaction is a stream; the architecture treats TTFT as a service-level objective with explicit target and breach thresholds (apps/web/.../stream-transform.ts tracks TTFT against `LLM_TTFT_SLO_TARGET_MS`/`LLM_TTFT_SLO_BREACH_MS`). Streaming is the performance strategy: the system commits to emitting partial results as they are produced rather than buffering to completion, and an idle stream is terminated by watchdog rather than allowed to masquerade as slow progress (§34, architecture-manifest.md §4).

Performance budgets are tier-asymmetric and MUST NOT be averaged across tiers. Local Mode performance is bounded by user-owned compute and is the user's hardware budget, not AGI's; the architecture MUST NOT make a Local interaction wait on a network round-trip it does not need. Managed performance is bounded by gateway and provider latency and is the only tier where AGI owns the budget end-to-end. Conflating the two produces dishonest SLOs.

Work that is not on the user's wait-path MUST be moved off it. The constitution defers the concrete mechanism (background execution, deferred reconciliation) to the runtime books, but fixes the principle: credit reconciliation happens post-stream so it never delays first token, and any operation that can be deferred without changing the user-visible result MUST be deferred off the critical path.

> **Architectural rule —** Streamed interactions MUST be measured against an explicit time-to-first-token SLO with declared target and breach thresholds; the streaming path MUST emit partial results progressively and MUST NOT buffer to completion before first token.

> **Architectural rule —** Performance budgets MUST be scoped per trust tier; a Local interaction MUST NOT be made to wait on any AGI-cloud round-trip it does not require, and SLOs MUST NOT be averaged across Local, BYOK, and Managed.

---

### 40. Caching Philosophy

A cache is an optimization, never a source of truth, and it is also a trust-boundary object: a cache key or value derived from a Local or BYOK session MUST stay within that private boundary and MUST NOT be written to a shared AGI-side store. Caching therefore obeys the same partition as logging and telemetry — private-origin data may be cached only in private-owned storage. This makes the choice of cache location a trust decision, not merely a latency decision.

Cache correctness is bounded by explicit invalidation, and the system prefers small, clearly-scoped, in-process caches with short lifetimes over implicit framework caching whose invalidation is hard to reason about. A cache without a declared lifetime or invalidation contract is forbidden, because a stale capability badge, a stale model label, or a stale entitlement is a capability-honesty failure (platform-constitution.md §12), not a tolerable cache miss. Where data affects trust or capability presentation, freshness is a correctness requirement, not a performance tuning knob.

Authoritative state MUST NOT be reconstructed from a cache. The model catalog SSOT (packages/contracts/types/src/models.json) and the durable database are the sources of truth; a cache may accelerate reads of them but may never become the record that a write is committed against or that a billing decision is made from (§38).

> **Architectural rule —** Cache entries derived from Local-origin or BYOK-origin data MUST stay within that private trust boundary and MUST NOT be written to a shared AGI-side cache store.

> **Architectural rule —** Every cache MUST declare an explicit lifetime and invalidation contract; a cache MUST NOT be the source of truth for capability/model/entitlement state, and stale trust-or-capability data MUST be treated as a correctness defect.

**Current state:** there is no Next.js data-cache usage in the web app (no `use cache`, `unstable_cache`, or `revalidateTag`); caching is ad-hoc and in-process (MCP tool catalog cached ~60s; cost-tracker warm-instance Map), which satisfies the explicit-lifetime preference but leaves no shared, invalidatable cache layer where one is later warranted.

---

### 41. Offline Strategy

Offline is not a degraded mode for AGI — for Local Mode it is the baseline, because Local Mode is defined by user-owned compute and user-owned storage and therefore MUST function fully with no network at all (§42). The offline strategy is consequently asymmetric: Local-only work has no offline story because it has no online dependency; only work that targets the shared cloud store (Managed sync) needs an offline-then-reconcile path. The architecture MUST NOT make a Local interaction fail or block because the network is absent.

For the Managed/synced path, offline mutations are captured durably and replayed deterministically on reconnect. A persisted operation queue records each mutation with a bounded retry budget and a status (current shape evidenced at apps/desktop/src-tauri/src/data/db/migrations.rs `offline_operations_queue`). Replay MUST be idempotent — the same queued mutation applied twice MUST converge to the same state — which is why offline reconciliation rides on the same idempotent UPSERT and tombstone semantics as online sync (§44).

Offline reconciliation MUST preserve the trust boundary across the disconnect. A mutation queued in Local mode MUST NOT become eligible for cloud push merely because connectivity returned; only Managed-mode mutations carrying a cloud identity are replayed to the cloud store. The behavioral contract — backoff curve, ordering guarantees, conflict handling on replay — is deferred to the Offline Operations & Queue Specification.

> **Architectural rule —** A Local-only interaction MUST NOT block or fail due to absent network connectivity; offline support is required only for Managed/synced operations, never as a precondition for Local Mode.

> **Architectural rule —** Offline mutations MUST be captured in a durable queue with bounded retries and replayed idempotently on reconnect; a mutation queued under Local mode MUST NOT become cloud-eligible on reconnect.

---

### 42. Local Mode Architecture

Local Mode is defined by user-owned compute AND user-owned storage: inference runs on hardware the user controls and state persists in storage the user controls. Cloud inference is NEVER required for Local Mode, and BYOK is one execution strategy available within the user-private boundary — not the defining trait of Local Mode. The defining trait is ownership: nothing in a Local session is required to leave the user's machine, and the architecture MUST make that the literal, enforced behavior rather than a policy promise.

The boundary is enforced by a fail-closed egress chokepoint. On a surface in a private trust boundary (Local OR BYOK, derived from one shared `isPrivateTrustBoundary()` predicate), an attempt to reach an AGI-cloud host MUST throw before any network I/O, and the guard MUST fail closed when the privacy state cannot be read (apps/desktop/src/lib/egressGuard.ts; apps/desktop/src/stores/privacyBoundary.ts). Because the privacy predicate is shared by egress, logging, telemetry, and analytics, a Local payload cannot leak through a side channel that re-derives privacy with a weaker check. Local generated files stay on `file://`/local_device scope and are never uploaded (the generated-file trust-boundary validator, owned by §24).

Local storage is encrypted, user-owned, and the system of record for the session: desktop uses on-disk SQLite (SQLCipher), CLI uses atomic JSON/JSONL session files, and a Local conversation carries no cloud identity and is never enqueued for push (apps/desktop/src-tauri/src/data/cloud_sync.rs; §44). Crossing from Local outward is never implicit — it is an explicit, consented handoff (§44, mechanism owned by §21).

> **Architectural rule —** Local Mode MUST be fully functional with all AGI-cloud hosts unreachable; user-owned compute and user-owned storage are the defining traits, and cloud inference MUST NEVER be a requirement of Local Mode.

> **Architectural rule —** Every surface offering Local or BYOK mode MUST enforce a fail-closed egress chokepoint that blocks AGI-cloud hosts when privacy mode is not Managed, sharing one privacy predicate across egress, logging, telemetry, and analytics; the guard MUST fail closed on unreadable privacy state.

**Current state:** the egress chokepoint exists only on Desktop and Mobile and is fetch/WebView-scoped — it does NOT intercept the Tauri Rust `reqwest` layer, and CLI/VS Code have no egress guard despite the trust-mode matrix granting them Local mode (apps/desktop/src/lib/egressGuard.ts scope note; grep of apps/cli + apps/extension-vscode returns no guard). **Migration:** the chokepoint becomes a shared contract enforced on every Local-capable surface and on the Rust egress paths; until then AGI-TRUST-0001 is Partially enforced (architecture-manifest.md §8, §11) and "zero-leak" framing overstates coverage.

---

### 43. Cloud Mode Architecture

Cloud Mode is the only tier with metered egress and the only tier that may write to the shared cloud chat store; it is reached exclusively through the managed gateway (architecture-manifest.md §4), which is the single point where credentials are server-held, credits are reserved and reconciled, and per-user isolation is enforced. The architectural consequence is that Cloud Mode is not "Local with a remote model" — it is a distinct trust boundary with its own identity, its own metering, and its own data-isolation obligations that do not apply to Local or BYOK.

Managed cloud is in public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate has been removed, and the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident-response kill-switch. Ledgering, abuse, fraud, refund, retention, and deletion controls must keep pace with public usage but no longer gate access. What remains constitutionally fixed is the entitlement gate: the metered, money-touching, shared-storage tier MUST still be reached only through subscription/entitlement, and capability honesty MUST keep public messaging in step with what those controls can safely promise. Entitlement gating is therefore an architectural state, not a marketing decision.

Cloud Mode's isolation MUST be enforced at the database layer, not only by an application filter. Per-user isolation requires Row-Level Security with `USING` and `WITH CHECK` under a non-BYPASSRLS role, with the request subject bound from a signature-verified token and `user_id` derived server-side, never trusted from the request body (apps/web/db/neon/0037; apps/web/lib/server/rls-db.ts; packages/platform/data-layer/src/adapters/neon.ts). The behavioral surface — gateway dispatch, credit ledgering, entitlement checks — is deferred to the Cloud Services / Managed Control Plane Specification.

> **Architectural rule —** Managed cloud is in public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate has been removed, and the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident-response kill-switch. Ledgering, abuse, fraud, refund, retention, and deletion controls must keep pace with public usage but no longer gate access; metered egress and writes to the shared cloud store MUST remain entitlement-gated.

> **Architectural rule —** Every Cloud Mode per-user data path MUST enforce isolation at the database layer via RLS (USING + WITH CHECK, non-BYPASSRLS role, JWT-sub bound per request from a signature-verified token, user_id derived server-side), not by an application-layer filter alone.

**Current state:** Cloud Mode's database-layer isolation is shipped-but-dormant — the RLS-bound adapter is live only on the `/sync` routes while the broad CRUD path runs unscoped (full current-state owned by §27; AGI-SEC-0001). **Migration:** every user-scoped route is moved onto the RLS-bound adapter; until then DB-level isolation is split (sync paths enforced, CRUD paths dormant).

---

### 44. Synchronization Principles

Synchronization governs WHEN and WHETHER state crosses a trust boundary; the mechanism of sync (delta transport, cursors, conflict resolution) is owned by §21 and referenced here, not restated. The first principle is that synchronization is a trust event: state crosses a boundary only when it is permitted to, and Local/BYOK state never crosses silently (§42). Normal chat sync is permitted ONLY for the synced-app surfaces — Web, Mobile, Desktop — which share one server-side cloud chat store; CLI, VS Code, and Chrome are developer/workspace/task-scoped surfaces that stay local and MUST NOT enrol in the shared chat pipeline unless the user explicitly hands off a redacted preview. This partition is enforced at runtime by a fail-fast guard (`assertSurfaceCanSyncChats`, packages/contracts/types/src/suite-contracts.ts), not merely documented.

Synchronization is Managed-only and doubly gated: it requires the Managed trust mode AND the same fail-closed egress backstop, so a Local or BYOK conversation — which carries no cloud identity — is never pushed or pulled (apps/mobile/services/cloudSyncEngine.ts `isManagedSyncEnabled()`; §42). What may sync is further constrained by content: secret namespaces (BYOK/provider keys, local model paths, device config) MUST NEVER be projected onto the wire, and settings sync enforces a fail-closed cloud-safe allowlist (apps/web/db/neon/0042). Crossing from Local outward is an explicit, consented handoff carrying selected context, a secret-scan redaction report, a payload preview hash, and recorded consent (HandoffDraft, owned by §24) — never an ambient sync.

Synchronization MUST converge without losing or fabricating user state. Deletes propagate as tombstones, never as wire-level hard deletes; messages are append-only and content-immutable across sync; and a sync apply that cannot satisfy a referential dependency MUST be retained for retry rather than silently dropped, because a silently dropped row is a capability-honesty failure that presents an incomplete view of synced state. Convergence keys, cursor semantics, and the LWW-vs-append-only matrix are the province of §21 and the Cloud Sync & Delta-Transport Specification.

> **Architectural rule —** Only synced-app surfaces (Web, Mobile, Desktop) MAY participate in the shared cloud chat store; CLI, VS Code, and Chrome MUST stay local/workspace/task-scoped and MUST be rejected at the sync boundary unless the user explicitly hands off a redacted, consented preview.

> **Architectural rule —** Synchronization MUST be Managed-only and fail-closed: a Local or BYOK conversation carries no cloud identity and MUST NEVER be pushed or pulled, and secret namespaces MUST NEVER be projected onto the sync wire (allowlist enforced fail-closed).

> **Architectural rule —** Deletes MUST propagate as tombstones (never wire-level hard deletes), messages MUST remain append-only and content-immutable across sync, and a sync apply with an unsatisfied referential dependency MUST be retained for retry, never silently dropped.

**Current state:** the synced/developer partition and `assertSurfaceCanSyncChats` are live on web and mobile, and tombstone/append-only semantics are implemented, but a documented gap exists where a pulled artifact whose parent conversation has not yet landed is silently skipped rather than buffered (apps/desktop/src-tauri/src/data/cloud_sync.rs). **Migration:** unsatisfiable applies are buffered and retried so no synced state is transiently dropped without recovery.

## Part VII — Platform Lifecycle & Extensibility

### 45. Feature Flag Philosophy

A feature flag exists to make capability availability a deliberate, single-sourced runtime decision — never an emergent property of scattered conditionals. Flags express what a surface is _permitted_ to do at runtime; they are the lever by which a built-but-not-yet-released capability stays dark until its full dependency chain (entitlement, abuse controls, trust-boundary enforcement) is proven. A flag MUST be a declaration of permission, not a hiding place for unfinished or unsafe code.

**Current state:** Mobile encodes its cloud-only gating as a single hand-edited master-switch module, `FEATURES`, treated as the sole source of truth so that every guard derives from one record (apps/mobile/lib/v1FeatureFlags.ts L23-85). This is the correct shape: one authoritative table, not per-call-site booleans. A flag MUST NOT silently soften a trust boundary — `byokKeys: false` is the _only_ honest representation of the matrix invariant that BYOK is absent on Mobile (apps/mobile/lib/v1FeatureFlags.ts L53-54; trust-mode partition, see §6 and the Surface Composition book), and flipping it would constitute a capability lie regardless of whether a key-entry path exists.

The deadliest flag failure is a configuration that presents a capability as available while a second flag deterministically kills it — the user sees a live control over dead functionality, the precise violation of capability honesty inherited from the Platform Constitution. The Mobile module documents exactly such a hazard: `v1LocalOnly` and `cloudChat` both true forces `isCloudChatEnabled()` to return false, leaving Cloud mode visibly offered yet silently inert (apps/mobile/lib/v1FeatureFlags.ts L29-35).

> **Architectural rule —** Feature-flag state for a surface MUST be sourced from a single authoritative flag table; per-call-site re-derivation of availability is forbidden.

> **Architectural rule —** A feature flag MUST NOT relax a trust-boundary invariant; a capability forbidden on a surface by the trust-mode matrix MUST stay forbidden in code, copy, and egress policy even when its flag is toggled.

> **Architectural rule —** No flag combination may present a capability as available while another flag deterministically disables it; a control offered to the user MUST resolve to functioning behavior or not be offered at all.

### 46. Dependency Management

Cross-cutting dependency versions are a platform-wide property, not a per-package preference. The monorepo pins shared and security-sensitive versions centrally so that one decision propagates uniformly rather than drifting per workspace. Node is pinned to 22 (engines + .nvmrc) and pnpm to 9.15.3 (`packageManager`); `pnpm.overrides` force-upgrades ~40 transitive dependencies as security pins (e.g. `ws>=8.21.0`, `undici>=8.5.0`, `tar>=7.5.11`) and pins react/react-dom 19.2.6, typescript 5.9.3, zod, and immer monorepo-wide, with `expo` carried as a patched dependency (package.json lines 12-66). Toolchain and shared-library versions MUST be governed here, not scattered into individual `package.json` files.

A new dependency — whether a third-party package or a new internal crate/package — is a permanent liability until proven otherwise. The Rust workspace makes the cost explicit: a shared crate earns its place only once a real second consumer exists, and the workspace-wide clippy lint set (Cargo.toml [workspace.lints.clippy]) is inherited rather than re-declared per crate. **Tradeoffs:** the lint set deliberately omits `unwrap_used` and `expect_used` because the codebase carried 2,409 such sites at adoption time; this is an honest, documented deferral, not an oversight (Cargo.toml lines 16-23). A dependency policy that hid such a backlog behind a green check would be a capability lie.

**Current state vs documented intent:** the root Cargo.toml states that shipping binaries depend only on `agiworkforce-protocol` and `agiworkforce-sandbox-policy` via path (Cargo.toml lines 9-12), but `apps/cli/Cargo.toml` actually path-depends on five workspace crates — app-server, protocol, sandbox-policy, command-registry, and utils-image (apps/cli/Cargo.toml lines 39-43). The stated minimal dependency surface is stale. Separately, the `crates/*` member glob admits a stray non-crate file, `crates/node-version.txt`, into the crate root (Cargo.toml line 5). Both are inventory-honesty gaps the dependency governance book must close.

> **Architectural rule —** Versions of shared cross-cutting libraries (react, typescript, zod, and every security-sensitive transitive dependency) MUST be pinned centrally in root `package.json` overrides, never per-package.

> **Architectural rule —** The Node and pnpm toolchain versions MUST stay pinned and consistent across the monorepo via engines, `packageManager`, and `.nvmrc`.

> **Architectural rule —** A new third-party dependency or new internal package/crate MUST be justified by a real second consumer or a documented high-risk boundary before it enters the workspace.

> **Architectural rule —** The declared dependency surface of a shipping binary MUST match its actual manifest; a documented dependency claim that drifts from the build graph is a defect, not a comment.

### 47. Monorepo Strategy

The platform is a single polyglot monorepo because the trust boundaries, contracts, and capability invariants it must enforce span TypeScript and Rust and span every surface — splitting them into separate repositories would make those cross-cutting invariants unenforceable in one atomic change. It is a dual pnpm + cargo workspace (pnpm-workspace.yaml globs `apps/*`, `packages/*`, `packages/ai/providers/*`, `services/*`; Cargo.toml members `apps/desktop/src-tauri`, `apps/cli`, `crates/*`). The concrete surface, package, crate, and service inventory is owned by architecture-manifest.md §1 (AGI-DOC-0003) — reference it; this section governs _strategy_, not the census.

Build orchestration is deliberately minimal: there is **no `turbo.json` and no turbo dependency.** Builds run through pnpm recursive scripts (`build:all = pnpm -r --filter="!@agiworkforce/desktop" build`, with desktop built separately; typecheck topology likewise split between root and `typecheck:all`) over a `composite`/`incremental` TypeScript base (package.json scripts lines 107,120-127; tsconfig.base.json lines 46-54). The strategic position is that the workspace graph itself, plus pnpm's recursion, is the build graph; a task-graph cache layer is not adopted until its complexity is justified by measured pain, and the absence MUST be treated as an intentional decision rather than a missing tool.

**Current state — enforcement asymmetry:** module-boundary enforcement scans only `apps`, `packages`, and `services` (scripts/check-boundaries.mjs line 120); it does **not** scan `crates/`, and no cargo-level boundary check exists. Rust crate layering is therefore documented but tooling-unenforced — a gap the Module Boundary specification must close so the Rust half of the workspace earns the same machine-checked guarantees as the TypeScript half. The dependency-direction laws that boundary tooling enforces are defined in §6; this section references them and does not redefine which workspace member may depend on what.

> **Architectural rule —** The platform MUST remain a single dual pnpm + cargo workspace; cross-surface contracts and trust invariants MUST be changeable in one atomic commit and MUST NOT be fragmented across repositories.

> **Architectural rule —** Adoption of a build-orchestration cache layer (e.g. a task-graph cache) MUST be a recorded, justified decision; its current absence is intentional and MUST NOT be treated as an unimplemented gap.

> **Architectural rule —** Module-boundary enforcement MUST cover every workspace language; the Rust crate graph MUST be subject to a machine check equivalent to the TypeScript/services boundary check, not documentation alone.

### 48. Shared Package Strategy

The shared-packages mandate is constitutional: UI and logic that more than one surface needs MUST be built in a shared package so surfaces _reuse_ rather than _rewrite_. This is the mechanism by which six-surface continuity is achievable at all. A package's reach is determined by its dependency floor: the genuinely cross-surface, React-Native-safe layers are `@agiworkforce/types` and `@agiworkforce/design-tokens`, which carry no web-only runtime and are consumable by mobile alongside web and desktop; the web-coupled layers are `@agiworkforce/ui` and `@agiworkforce/unified-chat`. Which package may depend on which is the boundary law owned by §6 — referenced here, never redefined.

**Current state — the mandate is violated for chat:** `@agiworkforce/unified-chat` is React-DOM-coupled (react-dom, Radix, framer-motion, lucide as peer dependencies; packages/ui/unified-chat/package.json) and has zero mobile consumers, so mobile reimplements chat state and UI independently. The shared package that _should_ embody "website UI built once, reused by desktop and mobile" structurally excludes the surface that most needs the reuse. **Target state:** the chat experience's state and contracts MUST live in an RN-safe layer that mobile can consume, with web-only rendering concerns isolated above it; a web-coupled package MUST NOT be the sole home of logic a non-web surface also requires.

A package's public surface is a contract, not an accident of file layout. Most packages today declare a bare-string `exports` (a single root entry), and the deep-import boundary check cannot validate subpaths for them — its `exportedSubpaths()` returns an empty set for string exports, so the encapsulation guarantee rests on the _absence_ of `packageName/foo` specifiers rather than on a positive, declared export map (scripts/check-boundaries.mjs lines 71-85). The strategic target is that every shared package declares its public surface explicitly so deep-import validation is a positive contract.

> **Architectural rule —** Logic or UI needed by more than one surface MUST live in a shared package built for reuse; a surface MUST NOT reimplement a capability that a shared package already owns.

> **Architectural rule —** Cross-surface logic that mobile must consume MUST live in a React-Native-safe package free of web-only runtime peer dependencies; a web-coupled package MUST NOT be the only home of state or contracts a non-web surface needs.

> **Architectural rule —** Every shared package MUST declare its public surface explicitly via its `exports` map; deep imports MUST resolve to a declared subpath, and encapsulation MUST NOT rely on the mere absence of subpath specifiers.

### 49. Versioning Strategy

The monorepo follows a single-version-workspace policy: internal packages are not independently released and carry no meaningful semver. Every shared package is `private: true` at version `0.0.1` (e.g. packages/ui/unified-chat/package.json), and the workspace is versioned as one moving artifact whose coherence is guaranteed by the central toolchain and dependency pins (see §46), not by inter-package version negotiation. There is no release-train or per-package semver scheme, and none MUST be invented absent a real external-distribution requirement.

The one artifact that carries genuine, governed versioning is the model catalog. `packages/contracts/types/src/models.json` declares `version: 1` with a `lastUpdated` date and a structured, dated, source-attributed `verificationLog` (packages/contracts/types/src/models.json lines 1-5). This is the model by which versioning is taken seriously where it matters: not a vanity number, but a verifiable record of _when_ and _against what source_ fast-moving facts were last confirmed. Model IDs, capabilities, and pricing are read from this single file and MUST NOT be invented or hardcoded elsewhere (the SSOT law is owned by §6/§16).

> **Architectural rule —** Internal workspace packages MUST stay private and single-versioned; an independent per-package semver or release-train scheme MUST NOT be introduced without a concrete external-distribution requirement.

> **Architectural rule —** The model catalog MUST carry an explicit version and a dated, source-attributed verification log; fast-moving fact sets (model IDs, capabilities, pricing) MUST be governed by such a record rather than treated as static.

### 50. Compatibility Strategy

Where the same concept is realized across multiple runtimes or languages, those realizations MUST be kept in provable correspondence; divergence between mirrors of one source of truth is the platform's most reliable source of capability lies. The provider-identity drift that demonstrates this failure mode — the `Provider` union, the `models.json` catalog, and the desktop Rust enum having fallen out of correspondence — is documented with its counts and evidence at §14 (Model Abstraction); this section adds only the compatibility _law_ that every such mirror MUST be reconciled by a CI guard. The cross-language mirror step is itself misdirected today: `provider.ts` points maintainers at `models_config.rs` for the `Provider` enum, but that file only re-imports the enum (`use super::Provider;`) rather than defining it — the enum lives at `core/llm/mod.rs:649` (packages/contracts/types/src/provider.ts lines 12-14).

The second compatibility failure is advertising ahead of capability across surfaces. The web stream route validates 11 selectable provider IDs while the gateway can construct adapters for only four; the other seven pass validation, reserve credits, then hard-fail at the gateway with no OpenAI-compatible fallback (apps/web/app/api/v1/providers/[providerId]/stream/route.ts vs services/api-gateway/src/lib/providerAdapters.ts and routes/providerStream.ts). **Target state:** what a surface presents as selectable MUST be derivable from real backend capability, and every mirror of an SSOT MUST be reconciled by a CI guard that fails when an entry exists in one source but not the others.

> **Architectural rule —** Every cross-language or cross-runtime mirror of a single source of truth (provider identity, model catalog, capability metadata) MUST be kept in exact correspondence and verified by a CI guard that fails when an entry exists in one mirror but not the others.

> **Architectural rule —** A surface MUST NOT present a provider, model, or capability as selectable unless the runtime that will execute it can actually serve it; advertised availability MUST derive from real backend capability, never from a static allowlist that outruns it.

> **Architectural rule —** A maintainer-facing pointer to a mirror that must be updated in lockstep MUST name a path that exists; a stale cross-language update instruction is a defect that enables drift.

### 51. Plugin Philosophy

A plugin is third-party code and configuration brought into the trust envelope at the user's discretion; its manifest, its declared capabilities, and any output it produces are UNTRUSTED data, never instructions to the platform or to a model. Discovery MUST be deterministic, priority-ordered, and consent-gated. The CLI probes five manifest locations in fixed priority — `.agiworkforce-plugin/plugin.json` (own, preferred), `.claude-plugin/plugin.json` (Claude Code interop), `.codex-plugin/plugin.json` (Codex interop), then the legacy `.app.json` and `.mcp.json`, which emit a one-time deprecation notice — first match wins, with surplus keys absorbed via serde-flatten so foreign manifests load without executing (apps/cli/src/features/plugins/plugins.rs lines 10-77).

Trust is scoped by origin. Project-scoped definitions (e.g. project skills discovered before global ones) require an explicit consent gate before they are honored, because a repository a user merely opened MUST NOT be able to auto-install behavior; this is the same project-then-global, consent-first discipline the skills loader applies (apps/cli/src/skills.rs). Any risky, destructive, or externally-visible action a plugin would perform MUST route through the platform's approval path rather than executing on manifest presence alone — the behavioral approval contract itself is deferred to the Tool & Extension Integration runtime book.

> **Architectural rule —** Plugin manifests, their declared capabilities, and their output are untrusted data; the platform MUST treat them as input to validate, never as instructions to obey.

> **Architectural rule —** Plugin discovery MUST follow the documented priority-ordered, consent-gated loader; a project-scoped definition MUST NOT be honored without an explicit user-consent gate, and manifest presence alone MUST NOT auto-execute or auto-trust a plugin.

### 52. Extension Philosophy

A browser or editor extension operates inside a hostile execution context — page DOM and page-originated messages are fully untrusted — so the extension's architecture is defined by trust planes and default-deny gates, not by feature richness. Content captured from a page is untrusted data: the Chrome extension's threat model partitions six trust planes from the extension page down to the fully-untrusted page DOM, sends page text to the desktop LLM only for allowlisted origins after secret redaction and a size cap, rejects page-originated messages unless the tab origin is in the user-managed allowlist, and confines DOM writes to the sender's own tab (apps/extension/THREAT_MODEL.md lines 1-60). Provider credentials live in session storage and reach only the provider endpoint, never the local bridge.

Autonomous control of a user's machine — CDP-driven browser actions, computer use — is the highest-risk extension capability and MUST default to human-in-the-loop. The gate is structural: the extension reads the ask-before-acting setting and gates whenever the value is `!== false`, so both unset and explicit-true require approval and only a stored explicit `false` is the autopilot opt-out; a CI regression test statically asserts the `!== false` form and forbids the prior allow-all default (apps/extension/src/background.ts:1747-1759; apps/extension/**tests**/computer-use-default-ask.test.ts). Allow-all autonomy MUST be an explicit, reversible user choice, never a default and never an emergent one.

> **Architectural rule —** Page DOM content and page-originated messages are untrusted; an extension MUST gate cross-origin capture behind a user-managed origin allowlist, redact secrets, and confine writes to the originating tab.

> **Architectural rule —** Autonomous computer-use or browser-control actions MUST default to ask-before-acting; allow-all autopilot MUST be an explicit opt-out only, and the default-deny posture MUST be guarded by a CI regression test.

### 53. MCP Philosophy

An MCP server is an external capability provider whose configuration and tool output are untrusted data — tool results are content a model may reason over, never instructions the platform executes on their say-so. The MCP layer is a thin, security-gated wrapper over the standard SDK supporting three transports (stdio, sse, streamable-http), and its central concern is the spawn-trust decision for stdio servers (packages/tools/mcp/src/index.ts; packages/tools/mcp/src/types.ts).

Spawning a local process is the dangerous act, so it is gated default-deny: in production builds the only acceptable authorization is a verified signed manifest. An explicit user-consent record is permitted only as a fallback when `developerMode` is true, and even then the consent MUST argv-pin both `for_command` and `for_args` exactly — closing the string-equality bypass where consenting to one command would implicitly cover any future config sharing that prefix (packages/tools/mcp/src/types.ts lines 28-57). This is the spine all three of §51–§53 share: untrusted input, default-deny on risky action, consent that is narrow and explicit. The behavioral surface — request/response shapes, tool dispatch, gateway exposure of MCP to web and mobile — is deferred to the Tool Runtime & MCP specification.

> **Architectural rule —** MCP server configuration and tool output are untrusted; tool results MUST be treated as content a model reasons over, never as instructions the platform executes.

> **Architectural rule —** An MCP stdio server MUST NOT be spawned in a production build without a verified signed manifest; the user-consent fallback is permitted only when developerMode is true and MUST argv-pin both the command and its arguments exactly.

### 54. AI Runtime Philosophy

The AI runtime is the execution substrate beneath every intelligent capability, and its constitutional role is to be a uniform, honest boundary between the platform and any model provider — the substrate philosophy that §16/§17 build their behavior upon. Every LLM network call MUST flow through a provider-adapter contract that owns credential resolution and normalizes vendor streams into one canonical shape (the `ProviderAdapter` / `StreamChunk` contract, packages/contracts/types/src/provider-adapter.ts); no surface may embed ad-hoc HTTP-to-vendor logic that bypasses it. The runtime's first duty is capability honesty: a model requiring an execution environment MUST fail closed and be unselectable until that environment is configured and available, as `evaluateModelEnvironment` enforces (packages/contracts/types/src/model-catalog.ts lines 211-224). Local, BYOK, and Managed remain separate trust boundaries here by inheritance — a Local-mode call MUST NOT reach managed cloud — but the egress-chokepoint mechanism itself is owned elsewhere (see §6 and the Trust-Boundary book), not redefined in the runtime.

**Current state — three divergent runtimes:** the canonical TypeScript `ProviderAdapter` is consumed only by the api-gateway, while the CLI and desktop each reimplement provider transport in Rust with their own differently-shaped `Provider` enums (apps/cli/src/models/mod.rs:49; apps/desktop/src-tauri/src/core/llm/mod.rs:649); none share the adapter contract, so a capability or model-ID fix in one runtime does not propagate to the others. **Target state:** the surfaces MUST converge on one adapter contract, or carry an explicit, recorded justification for each divergence; "three independent provider runtimes by accident" is not an acceptable steady state. All behavioral specification — request/stream wire shapes, credential flow, retry/fallback/watchdog, routing, and the agent-loop and tool-call semantics that §16/§17 also defer — is deferred to the AI Runtime Specification.

> **Architectural rule —** Every LLM network call MUST flow through a provider-adapter contract that owns credential resolution and stream normalization; no surface may embed ad-hoc HTTP-to-vendor logic that bypasses it.

> **Architectural rule —** The AI runtime MUST fail closed on capability: a model requiring an execution environment MUST be unselectable until that environment is configured and available, and selectable models MUST be honestly runnable on the active surface and runtime tier.

> **Architectural rule —** Divergent per-surface AI runtimes MUST converge on one provider-adapter contract or carry an explicit recorded justification for each divergence; uncoordinated parallel provider runtimes are a defect, not an architecture.

## Part VIII — Engineering Governance

### 55. Testing Philosophy

Tests exist to prove that a boundary holds and that a behavior survives change — not to inflate a count or color CI green. A test that asserts nothing real is worse than no test, because it converts an unverified claim into a false guarantee. The platform therefore treats fake assertions and swallowed expectations as defects of the same class as the bugs they pretend to cover.

Every subsystem MUST be independently testable. A subsystem that can only be exercised through a full surface — that cannot be driven through its own contract with its dependencies substituted — has a design defect, not merely a testing gap; the remedy is to fix the seam, not to write an integration test that hides it. Test-runner ownership is local: each surface owns its runner configuration (vitest 4 for web/extension/extension-vscode, jest for mobile, cargo for CLI/desktop-Rust), and the tier scripts discover which surface owns a matching test and delegate to that surface's own `test` command so per-surface aliases, jsdom, and setup remain authoritative (scripts/run-priority-tier.mjs). An empty test tier MUST report loudly and never silently pass — a tier that runs nothing is a false green, which is the cardinal sin of this section.

Every fixed bug MUST acquire a regression test that fails against the unfixed code and passes against the fix. This is how the platform encodes hard-won knowledge of its own failure modes; a fix without a regression test invites the same defect to return under a different commit. The anti-theater rules are machine-enforced: `pnpm check:llm-failures` (scripts/check-llm-failure-guardrails.mjs, driven by docs/agent-context/llm-failure-taxonomy.json) scans for test theater (`expect(true).toBe(true)`, `assert!(true)`), production stubs, and mock-only "green" tests, and MUST stay in the CI gate.

**Current state:** Only `priority-level-1` tiers exist on disk (4 surfaces); l2–l4 are empty (docs/agent-context/known-flaws.md CI-TIER-SCRIPTS-01). Coverage is enforced at a 75% line threshold but run non-blocking in CI (`pnpm test:coverage || true`, .github/workflows/test-l1-l2.yml). **Target state:** the tier taxonomy is populated and coverage gating is blocking on the paths that warrant it. **Migration:** owned by the future Testing & Quality-Gate Specification — this constitution fixes only the invariants below.

> **Architectural rule —** Every subsystem MUST be independently testable through its own contract with dependencies substituted; an inability to test a subsystem in isolation is a design defect to be fixed at the seam, not papered over with an end-to-end test.

> **Architectural rule —** Tests MUST exercise real behavior; fake assertions (`expect(true).toBe(true)`, `assert!(true)`), production stubs, swallowed mock expectations, and mock-only green tests are forbidden, and `pnpm check:llm-failures` MUST enforce this in CI.

> **Architectural rule —** Every fixed bug MUST gain a regression test that fails against the unfixed code and passes against the fix; a fix landed without one is incomplete.

> **Architectural rule —** Failing tests MUST NOT be deleted, skipped, or disabled to make CI green; a skip requires an inline tracked reason and is treated as a defect, not a resolution.

> **Architectural rule —** Each surface MUST own its test-runner configuration; tier scripts MUST discover and delegate to the owning surface's own test command, and an empty test tier MUST fail loudly rather than silently pass.

### 56. Documentation Philosophy

Documentation in this platform is governed law, not commentary, and its law is owned elsewhere: the **Documentation Constitution (AGI-DOC-0002)** defines what documentation is, how it must cite implementation, the Status lifecycle, and the prohibition on automatic deletion (docs/00-foundation/documentation-constitution.md). The **cross-reference system (AGI-DOC-0007)** owns the single-owner principle by which each fact has exactly one home and every other mention is a reference (docs/00-foundation/cross-reference-system.md). This section states only the engineering-facing principle and defers the rest to those owners; it does not restate documentation law.

The engineering principle is narrow and absolute: implementation is the source of truth, and a behavior change and its documentation land in the same unit of work. An engineer who changes a behavior without changing the document that describes it has shipped a lie with a timestamp; an engineer who changes a document to describe a behavior that does not yet exist has shipped aspiration disguised as fact. Where enforcement is incomplete — dormant row-level security, an opt-in egress guard, an advisory security scan — the document MUST state the real enforcement state, never the intended one (documentation-constitution.md Article II §2). Capability honesty is sacred at the documentation layer exactly as it is at the product layer.

For the engineer, this collapses to three obligations enforced by tooling rather than goodwill: cite a repo path for every current-behavior claim or mark it UNKNOWN; carry the mandatory front-matter (Status / Owner / Last updated, checked by `pnpm check:doc-status`, scripts/check-doc-status.mjs); and never combine a file move with a behavior change in the same commit. Everything beyond this — the IA layers, the compiler, the migration plan — is owned by AGI-DOC-0002 and its companion foundation docs.

> **Architectural rule —** Implementation is the single source of truth: every documented current-behavior claim MUST cite a concrete repo path or be marked UNKNOWN, and when prose disagrees with code the code wins and the prose is marked Needs Update — never the reverse.

> **Architectural rule —** A behavior change and its documentation MUST land in the same unit of work; a file move MUST NOT be combined with a behavior change in the same commit.

> **Architectural rule —** Where boundary enforcement is incomplete, documentation MUST state the real enforcement state and track the gap as a defect; an advisory or dormant control MUST NOT be described as enforced.

### 57. Security Review Process

This section owns the PROCESS by which security claims are verified before merge; the security and privacy ARCHITECTURE itself — trust boundaries, egress chokepoints, RLS, SSRF hardening, consent gates — is owned by §23–27 and is referenced here, not restated. The process exists to answer one question for every change: does this change weaken a trust boundary, and if so, has a human with authority over that boundary consented in a durable record?

Security review is risk-triggered, not uniform. Any change touching an `AGI-TRUST-*` invariant, authentication, RLS, migrations, billing, secret or BYOK routing, or a Local→BYOK→Managed transition MUST pass a mandatory human High-Risk Merge Gate and MUST carry a recorded ADR (docs/engineering/agent-native-development.md; §59). These are the boundaries where a silent regression is catastrophic and where build-success proves nothing. Automated scanning is defense-in-depth beneath the human gate, not a substitute for it: Semgrep (`p/security-audit`, `p/typescript`, `p/owasp-top-ten`) and CodeQL run in CI, and the secret-redacting logger facade and SSRF validators (§23–27) are the runtime controls the review confirms are actually wired, not merely present.

The process is bound by capability honesty more strictly than any other, because security is the domain where a comforting label is most dangerous. A control MUST NOT be reviewed as "enforced" when it is dormant or advisory; the reviewer's job includes confirming the cited control actually bites on the live path.

**Current state:** Semgrep runs `continue-on-error: true` — advisory, not blocking — after a 2026-05-19 attempt to gate it surfaced a backlog of pre-existing findings (.github/workflows/ci.yml:111,141). RLS (migration 0037) is enabled but dormant on most live routes (§23–27), and the desktop egress guard is opt-in / fetch-scoped, not a global interceptor. **Target state:** security scans are blocking after a drive-to-zero pass; RLS is active on every user-scoped route. **Migration:** owned by the future Security & Architecture Review Specification.

> **Architectural rule —** Any change touching an AGI-TRUST-\* invariant, auth, RLS, migrations, billing, secret/BYOK routing, or a Local/BYOK/Managed transition MUST pass a mandatory human security review gate AND carry a recorded ADR before merge; build success alone MUST NOT be treated as security approval.

> **Architectural rule —** Security review MUST confirm that a cited control actually enforces on the live path; a dormant or advisory control (dormant RLS, opt-in egress guard, advisory Semgrep) MUST NOT be signed off as enforced.

> **Architectural rule —** Automated security scanning (Semgrep, CodeQL) is defense-in-depth beneath the human review gate, not a replacement for it; making a scan advisory MUST NOT remove the human gate for trust-boundary changes.

### 58. Architecture Review Process

Architecture review protects the boundaries the rest of this constitution defines. Its purpose is not taste enforcement but the preservation of the dependency-direction law (apps MUST NOT import apps; packages MUST NOT import apps; services MUST NOT import UI — AGI-ARCH-0002) and the SDK-as-adapter law (provider and vendor specifics stay behind adapters, never in Surfaces, Experiences, or Capabilities — AGI-ARCH-0001). As with §57, this section owns the PROCESS; the structural architecture being reviewed is owned by architecture-manifest.md §1–§13 and the principles by platform-constitution Part VIII — both referenced, neither restated.

The review is layered to match the cost of getting it wrong. Mechanical boundary violations are caught without human judgment by the guardrail suite — `pnpm check:boundaries`, `check:service-layer`, `check:module-reachability`, and the broader `check:llm-operability` chain — and these MUST stay machine-enforced so the boundary cannot silently regress (a prose-only rule is not a boundary). Human architecture review is reserved for the decisions tooling cannot adjudicate: introducing a new shared package or crate (justified only by a second real consumer), extracting a service layer (only after 2+ callers or a high-risk boundary, per docs/engineering/service-layer-architecture.md), or any structural change that touches a trust boundary. Every guardrail is itself guarded: `check:ci-guardrails` and `check:hooks` assert that the required gates remain present, so the review process cannot decay unnoticed.

The governing posture is conservative: an architecture is preserved unless there is clear evidence of improvement, and convenience is never sufficient reason to weaken a boundary (architecture-manifest.md §13). When a reviewer cannot decide, the constitutional Decision-Rules test (platform-constitution Part XI) is the tiebreaker, and a "no" on any guard requires redesign or a narrow overriding ADR.

> **Architectural rule —** The dependency-direction law (apps MUST NOT import apps; packages MUST NOT import apps; services MUST NOT import UI) and the SDK-as-adapter law MUST be machine-enforced by the boundary guardrail suite; a boundary expressed only in prose is not enforced and MUST NOT be relied upon.

> **Architectural rule —** A new shared package or crate, or a new extracted service layer, MUST be justified by a second real consumer (package/crate) or 2+ callers / a high-risk boundary (service) before human architecture review approves it.

> **Architectural rule —** Every required CI guardrail and hook MUST itself be verified by check:ci-guardrails / check:hooks so the architecture-review gate cannot silently regress; an architecture is preserved unless there is clear evidence of improvement, and convenience MUST NOT justify weakening a boundary.

### 59. ADR Process

The Architecture Decision Record is the second of exactly two things that may override this constitution. The first is the implementation itself, which overrides on present fact — where the running code and this document disagree about what is true, the code wins and the document is corrected. The ADR overrides on intentional decision — where a deliberate, recorded choice consciously and narrowly departs from a constitutional rule, the ADR governs that departure (platform-constitution Part XII; documentation-constitution AGI-DOC-0002 Article I). Nothing else has this power: not a build that passes, not a reviewer's preference, not a deadline, not a comment in code. An undocumented decision is not a decision against this constitution — it is a violation of it.

This override power is precisely why ADRs are immutable. An accepted ADR is superseded by a new ADR, never edited in place (docs/decisions/README.md), because an editable override is an override with no audit trail — and a constitution that can be silently overridden is not a constitution. Each ADR follows Nygard form (Status / Context / Decision / Consequences), and a load-bearing decision MUST be mirrored as a requirement ID (AGI-`DOMAIN`-`NNNN`) so the override is referenceable by identity, never re-argued from scratch. A new architectural invariant in the ARCH domain takes the next free ID, AGI-ARCH-0003.

The mandate is sharpest at the trust boundary: any change touching an `AGI-TRUST-*` invariant MUST have a recorded ADR before merge (docs/00-foundation/adr-index.md §4). This is the single point where §57, §58, and §59 converge — the same change that triggers mandatory security and architecture review also triggers the ADR requirement, so that the decision to move a trust boundary can never be made implicitly.

> **Architectural rule —** Explicit ADRs and the implementation itself are the ONLY two things that may override this constitution — the implementation on present fact, an ADR on intentional decision; no build result, reviewer preference, or deadline carries override authority, and an undocumented departure from a constitutional rule is a violation, not a decision.

> **Architectural rule —** An accepted ADR is immutable: it is superseded by a new ADR, never edited in place, and a load-bearing decision MUST be mirrored as an AGI-DOMAIN-NNNN requirement ID and referenced by that ID, never restated.

> **Architectural rule —** Any change touching an AGI-TRUST-\* invariant MUST have a recorded ADR before merge; the same trust-boundary change that mandates security and architecture review also mandates an ADR.

### 60. Evolution Strategy

This constitution is written to outlast any provider, model, framework, surface, or contributor, and so it is engineered for amendment rather than for permanence-by-rigidity. It changes the way the platform itself changes: deliberately, with evidence, and with the change to the rule and the change to the system landing together. The amendment mechanism is the ADR (§59) for intentional departures and the implementation (§59) for present fact; there is no third path, and "the code drifted" is never a lawful amendment — drift is a defect that either the code or a recorded ADR must resolve.

Evolution is asymmetric by design. The immutable values — trust boundaries are non-negotiable, Local Mode is defined by user-owned compute AND user-owned storage with cloud inference never required, capability honesty is sacred, Local / BYOK / Managed are separate trust boundaries, and Local state never silently crosses a boundary — carry the highest amendment bar and MUST NOT be weakened for convenience. Mechanics below them — which packages exist, which adapters are native, how tiers are organized — are expected to churn and should churn freely behind their boundaries. The discipline is that the boundary survives the refactor: a decade of implementation change is anticipated, and the test of a good amendment is whether the invariants below still hold after it.

Two anti-patterns are explicitly governed because both have occurred. First, stale governance: a decision or doc that references a removed dependency (the Supabase→Neon/Clerk migration left CURRENT_DECISIONS.md #13/#17 stale) MUST be reconciled by supersession, not left to mislead — audit and decision markdown is a triage queue, not proof of current fact. Second, aspirational drift: a rule MUST reflect enforcement reality, so an invariant that is only Partially enforced (AGI-TRUST-0001), dormant (AGI-SEC-0001 RLS), or still Target (AGI-PROD-0002) MUST be cited with that real status, never upgraded by wishful prose. Evolution that hides the gap between intent and enforcement is not evolution; it is the slow conversion of a constitution into marketing.

> **Architectural rule —** The constitution evolves only through the implementation (on present fact) or an explicit superseding ADR (on intentional decision); silent drift is a defect that MUST be resolved by changing the code or recording an ADR, and is never itself a lawful amendment.

> **Architectural rule —** The immutable values (trust-boundary separation; Local Mode as user-owned compute AND storage with cloud inference never required; capability honesty; Local state never silently crossing a boundary) carry the highest amendment bar and MUST NOT be weakened for convenience or velocity.

> **Architectural rule —** A cited invariant MUST reflect real enforcement status (enforced / partially enforced / dormant / target), and stale governance referencing a removed dependency or behavior MUST be reconciled by supersession, never left in place to mislead.

---

## Part IX — Engineering Amendments (v1.1)

Ratified 2026-06-25 by founder approval (ADR-class change per §59/AC-95). These sections add engineering law that the v1.0 canon genuinely omitted; they introduce no rule that restates an existing one. §64 was deliberately **not** created — its scalability/statelessness rule (`AC-107`) is integrated into §34 (Reliability Principles).

### 61. Accessibility & Internationalization

Accessibility and internationalization are engineering law, not optional polish. Every user-facing experience is operated by people with differing abilities, languages, and locales; a surface that is unusable with a screen reader, or that hardcodes English strings and US formatting, has failed a constitutional obligation as surely as one that leaks a trust boundary. This binds every surface (web, desktop, mobile, CLI, extensions) to its platform-appropriate accessibility norms, and binds all user-facing text to the localization layer so the platform is localizable without code change. It does not prescribe a specific framework — only the outcome (operable, perceivable, localizable) and the gate (verified before a surface book reaches Canonical).

> **Architectural rule —** All user-facing experiences MUST satisfy WCAG compliance requirements appropriate to their supported platforms. (`AC-101`)

> **Architectural rule —** User-visible strings MUST be externalized; no hardcoded locale-dependent text outside explicitly approved exceptions. (`AC-102`)

### 62. AI Safety & Output Moderation

Model-generated output is subject to a safety boundary distinct from the tool-output handling of §15 and the system-prompt directives that are merely inputs. The boundary's placement follows trust mode: a Cloud-Mode output may be moderated server-side, but a Local-Mode output MUST NOT be silently shipped to AGI cloud to be scored, and Local Mode MUST NOT be made to depend on Cloud Mode for enforcement unless that dependency is explicitly disclosed to the user. Abuse, fraud, moderation, and enforcement are safety-by-design obligations — fail-closed, observable, and recorded in the immutable audit trail — not features bolted on after launch. This section grounds the Trust & Safety volume (VOL-42) and the model-output-safety runtime (the Phase-E ownership gap) in law.

> **Architectural rule —** Every AI-generated output MUST pass through a deterministic safety boundary appropriate to its execution mode (Local Mode or Cloud Mode); safety behavior MUST be observable, configurable, auditable, and fail closed where applicable. (`AC-103`)

> **Architectural rule —** Abuse prevention, fraud detection, moderation decisions, and enforcement actions MUST be traceable through immutable audit records; Local Mode MUST NOT require Cloud Mode for enforcement unless explicitly disclosed. (`AC-104`)

### 63. Build, Release & Supply-Chain Integrity

The build and release pipeline is a trust boundary. An artifact a user installs or a server runs carries the platform's authority; if it cannot be reproduced from a known source revision, verified cryptographically, and traced to an attested dependency set, then the platform cannot honestly claim what it ships. Provenance is not paperwork — it is the mechanism by which a supply-chain compromise is caught before it reaches a user. This binds every production release to reproducibility, signing, provenance/SBOM, dependency verification, and a release gate that fails closed on any unverifiable input.

> **Architectural rule —** Every release artifact MUST be reproducible, cryptographically verifiable, and attributable to a known source revision. (`AC-105`)

> **Architectural rule —** Every production release MUST include provenance metadata, dependency verification, SBOM generation, integrity validation, and release-gate enforcement; untested or unverifiable artifacts MUST NEVER enter a production release pipeline. (`AC-106`)

## Architectural Rules (Immutable Engineering Law)

These rules consolidate and deduplicate the binding statements asserted across all sixty sections into one canonical, numbered set grouped by domain. Each rule is a single MUST / MUST NOT obligation, a short rationale, and the section(s) it derives from. A rule's force is constitutional: it is overridden only by the implementation (on present fact) and by an explicit ADR (on intentional decision), and a trust-boundary or capability-honesty rule outranks any rule of convenience whenever they conflict (§1, §2).

### Boundaries & Layering

> **AC-01 —** Platform dependencies MUST point inward only (Contracts → Mechanics → Orchestration → Surfaces); an inner layer MUST NOT import an outer layer. The inward direction is what makes Contracts shareable across every surface without dragging surface- or trust-mode-specific behavior with them. (§3, §6, §58)

> **AC-02 —** Vendor and SDK specifics MUST stay in the Mechanics adapter layer and MUST NOT leak inward into Contracts or outward into Surfaces, Experiences, or Capabilities, because a structural vendor dependency is a trust-boundary and capability-honesty risk, not merely coupling. (§1, §3, §58)

> **AC-03 —** Code under `apps/` MUST NOT import another app; code under `packages/` MUST NOT import from `apps/`; code under `services/` MUST NOT import UI packages or app code — cross-surface logic MUST live in a shared package or crate, so a boundary cannot be evaded by a sideways import. (§6, §9, §58)

> **AC-04 —** Orchestration (routes, actions, commands) MUST own product meaning, authorization, ownership, policy, and trust-mode transitions; service mechanics MUST own only reusable, trust-mode-agnostic machinery, and the two MUST NOT be conflated, because a mechanic carrying a trust decision is unsafe to reuse and an orchestration path carrying vendor transport is unsafe to retarget. (§4)

> **AC-05 —** A deep import into a workspace package MUST resolve to a subpath declared in that package's `exports` map; packages MUST declare their public surface explicitly rather than relying on the mere absence of subpath specifiers, so encapsulation is a positive contract. (§6, §48)

> **AC-06 —** Module-boundary enforcement MUST cover every workspace language; the Rust crate graph MUST be subject to a machine check equivalent to the TypeScript/services boundary check, because a boundary expressed only in prose is not enforced. (§6, §47, §58)

> **AC-07 —** The dependency-direction law and the SDK-as-adapter law MUST be machine-enforced by the boundary guardrail suite; a boundary relied upon only in prose MUST NOT be treated as enforced. (§58)

### AI Substrate

> **AC-08 —** Every provider/inference network call (model stream and provider catalog) MUST flow through the canonical `ProviderAdapter` contract, with its credential resolution and `StreamChunk` normalization; no surface may embed ad-hoc HTTP-to-vendor inference logic, and API handlers MUST delegate provider networking to it rather than embedding vendor HTTP at the route layer. (§13, §28, §54)

> **AC-09 —** Provider identity and model metadata MUST be read only from `packages/contracts/types/src/provider.ts` and `packages/contracts/types/src/models.json`; model IDs, capabilities, context windows, and pricing MUST NEVER be invented, guessed from training data, or hardcoded in any runtime. (§8, §14, §40, §49)

> **AC-10 —** The `Provider` union, the `models.json` provider keys, and every Rust `Provider` enum mirror MUST be kept in exact correspondence — verified by a CI guard that fails when an entry exists in one mirror but not the others — and every typed adapter package MUST have a matching catalog entry, because divergent mirrors of one SSOT are the platform's most reliable source of capability lies. (§14, §50)

> **AC-11 —** A capability, provider, or model MUST NOT be advertised as selectable unless the active surface, runtime tier, and required environment can actually serve it; pickers, allowlists, and badges MUST be derived from real backend capability, and environment-gated capabilities MUST fail closed via `evaluateModelEnvironment`. (§12, §28, §50, §54)

> **AC-12 —** Divergent per-surface AI runtimes MUST converge on one provider-adapter contract or carry an explicit, recorded justification for each divergence; uncoordinated parallel provider runtimes are a defect, because a capability fix in one runtime does not propagate to the others. (§13, §54)

> **AC-13 —** The AI runtime MUST fail closed on capability: a model requiring an execution environment MUST be unselectable until that environment is configured and available, so a selectable model is always honestly runnable on the active surface and tier. (§12, §54)

> **AC-14 —** Every tool schema exposed to a model MUST pass through the shared `provider-protocol` normalization for the target provider via the adapter's `normalizeToolSchemas` hook; raw per-surface tool schemas MUST NOT be sent directly to a vendor API, keeping vendor quirks in one place. (§15)

> **AC-15 —** Tool, MCP, plugin, and page output MUST be treated as untrusted data a model reasons over, never as instructions the platform executes on their say-so. (§15, §51, §52, §53)

> **AC-16 —** Chat, Code, Agent, and Research are cross-surface Experiences composed from a shared contract, never standalone apps; their trust and capability behavior MUST be derivable from one primitive. (§12)

> **AC-17 —** An agent MUST execute within a single trust mode and MUST NOT silently cross from Local to BYOK or Managed; a workflow MUST NOT widen the trust boundary of the actors it composes, and every inference, tool call, or boundary crossing inside a node is subject to the provider abstraction, consent-gated handoff, and capability-honesty rules. (§16, §17)

> **AC-18 —** Externally originated workflow triggers (webhook, event) MUST be authenticated and validated before they can drive execution, because an unauthenticated trigger is an unauthorized command. (§17)

### State & Sync

> **AC-19 —** Context assembly MUST be deterministic: a fixed conversation, memory corpus, project, token budget, and model context window MUST always produce the same assembled context, because a nondeterministic assembler makes every downstream capability claim unverifiable. (§19)

> **AC-20 —** The context budget that governs compaction MUST be derived from the model's declared context window in the catalog SSOT; a context window or budget MUST NEVER be hardcoded, invented, or guessed. (§19)

> **AC-21 —** Memory retrieval MUST be deterministic and reproducible: the same memory corpus and query MUST yield the same eligible set and order, with decay or recency admitted only as an explicit, declared input — never as ambient nondeterminism — so a user can be told why the model knew something. (§18)

> **AC-22 —** The reconciliation between the local two-layer memory model and the cloud flat-fact projection MUST be an explicit, owned contract (promotable / projection-only / device-only); the cloud projection MUST NOT be treated as an authoritative mirror of the local memory graph. (§18)

> **AC-23 —** A session's trust boundary is fixed at creation and immutable for the session's life; changing it MUST be a new forked session via the explicit, consented handoff, never an in-place mutation. (§20)

> **AC-24 —** Cross-device session and synced-record identity MUST be a client-generatable, time-ordered UUIDv7 that fails closed (throws) when no cryptographic RNG is available; it MUST NEVER fall back to a non-cryptographic source, because a weak RNG silently corrupts cross-device sync. (§20, §21)

> **AC-25 —** Synchronization operates only within the `managed` trust boundary and MUST be gated by an independent, fail-closed egress check that refuses transmission whenever the privacy boundary is not `managed`, so a misconfigured sync engine can never become an exfiltration channel. (§21, §44)

> **AC-26 —** Only synced-app surfaces (Web, Mobile, Desktop) MAY participate in the shared cloud chat store; any developer-session surface (CLI, VS Code, Chrome) attempting enrolment MUST be rejected at the boundary via `assertSurfaceCanSyncChats`, unless the user explicitly hands off a redacted, consented preview. (§10, §44)

> **AC-27 —** The server is the sole authority on sync ordering: every synced write MUST be stamped with a fresh server-assigned monotonic version on insert and update, and clients MUST treat that version as an opaque cursor compared without precision loss — never minting, reordering, or numerically interpreting it. (§21)

> **AC-28 —** Deletions MUST propagate as tombstones, never as wire-level hard-deletes; messages MUST remain append-only and content-immutable across sync; conflict resolution MUST be an explicit per-entity policy (append-only for messages, declared last-writer-wins for mutable records), never a silent merge that invents an unwritten state. (§21, §44)

> **AC-29 —** A sync apply that cannot satisfy a referential dependency MUST be retained for retry with a recovery path; silently discarding it is prohibited because a silently dropped row presents an incomplete view of synced state. (§21, §44)

> **AC-30 —** Settings sync MUST enforce a fail-closed cloud-safe namespace allowlist; secret namespaces (BYOK/provider keys, local model paths, device config) MUST NEVER be projected onto the sync wire. (§44)

> **AC-31 —** The owning user identity for any synced write MUST be derived server-side from the verified session and MUST NEVER be taken from the request payload. (§21, §27, §29)

> **AC-32 —** The three trust boundaries MUST have three distinct stores: `local` state in user-owned on-device storage as its complete authoritative home, `byok` state user-owned with egress only to the user's own provider, and only `managed` state in AGI-hosted storage; no single store may serve more than one boundary, and a Local-origin record MUST carry no cloud identity. (§22, §29)

> **AC-33 —** Local-origin stored state MUST function fully without any cloud dependency and MUST NEVER be uploaded silently; movement to the managed store MUST be an explicit, reviewable, consented act. (§22, §29, §42)

### Trust

> **AC-34 —** Local, BYOK, and Managed are separate trust boundaries; the boundary a session occupies MUST be derived from the single trust-mode contract in `packages/contracts/types`, never re-inferred ad hoc at a call site. (§23, §41)

> **AC-35 —** A Local-mode chat, file, tool result, telemetry, log, or cache entry MUST NEVER be routed to AGI-managed cloud; BYOK payloads MUST go directly to the user-owned provider and MUST NOT transit AGI cloud. (§7, §24, §42, §44)

> **AC-36 —** Local state MUST NOT cross a trust boundary except by an explicit, user-consented fork carrying context selection, a secret-scan redaction report, a payload preview hash, and a visible provider label; it MUST NEVER cross implicitly through a shared runtime, an unguarded egress path, or an ambient sync. (§7, §16, §20, §24)

> **AC-37 —** Every surface offering Local or BYOK mode MUST enforce a fail-closed egress chokepoint that blocks AGI-cloud hosts when privacy mode is not Managed, and any code path capable of reaching AGI cloud that sits outside that chokepoint (native bridges, the Tauri Rust layer, background jobs) MUST independently honor the boundary. A "chokepoint" claim is false if egress paths exist outside it. (§7, §24, §31, §42)

> **AC-38 —** The privacy-boundary predicate (is-this-private) MUST have exactly one implementation per surface, shared by egress, error-tracking, analytics, sync, logging, and caching; per-call-site re-derivation of trust state is forbidden because it has previously drifted and leaked BYOK telemetry. (§23, §42)

> **AC-39 —** Every trust-boundary and authorization decision MUST fail closed: an unreadable, unhydrated, or unexpected security-relevant state MUST resolve to the most restrictive outcome, because blocking is recoverable and leaking is not. (§23, §34, §42)

> **AC-40 —** Persisted generated files MUST satisfy the per-mode trust-boundary validator: Local stays on `file://`/local_device and is never uploaded; BYOK requires accepted-preview-with-hash plus approval evidence; Managed requires quota, owner, checksum, and retention/deletion metadata. (§24)

> **AC-41 —** BYOK MUST be present only on Desktop, CLI, and VS Code, and MUST be absent — in code, copy, and egress policy — on Mobile, Web, and Chrome, so trust-mode copy can never advertise a capability the surface does not have. (§10, §45)

> **AC-42 —** A security control that is incomplete or dormant MUST be documented with its real enforcement state; a control MUST NOT be described as enforced, global, or zero-leak while bypass paths exist outside it. (§23, §56, §57)

### Interfaces & Execution

> **AC-43 —** Every externally reachable API handler MUST verify a signature-verified caller identity, classify the request's trust boundary, and confirm entitlement before performing any effect; authentication and authorization are the first statements of the handler body, not middleware decoration. (§26, §28)

> **AC-44 —** Every authentication path (browser session, native/CLI/mobile bearer token, any future path) MUST converge on cryptographic verification of the subject before any privileged work; subject verification MUST structurally precede any privileged operation that consumes the subject (RLS binding, ownership checks), and the unverified-decode path MUST remain default-deny and unreachable post-verification-bypass. (§26)

> **AC-45 —** Unauthenticated access MUST be confined to an explicit, enumerated allowlist of routes that expose no user data; any route not on the allowlist MUST require authentication. (§26)

> **AC-46 —** Authorization, ownership, and tenant-isolation decisions MUST be enforced server-side or in the privileged native/extension boundary; the client being authorized MUST NEVER be the authority on its own permissions. (§27)

> **AC-47 —** Identity and trust mode are orthogonal: a verified identity MUST NOT by itself authorize cloud egress or metered consumption, and trust-boundary enforcement takes precedence over identity at the egress gate. (§25)

> **AC-48 —** Account state (suspended/banned) MUST be enforced from the identity store on every authenticated request, and a known revoked status MUST always be rejected. (§25)

> **AC-49 —** Per-user data isolation MUST be enforced in depth on every live request path: an application-layer ownership filter AND database RLS (subject bound per request under a non-`BYPASSRLS` role, with explicit `WITH CHECK`); the `where user_id = $1` filter alone MUST NOT be the sole tenant-isolation control. (§22, §27, §29, §43)

> **AC-50 —** All managed-store access MUST flow through the vendor-neutral data-layer adapter using parameterized SQL; feature code MUST NOT import a concrete database driver or concatenate SQL strings. (§22, §29)

> **AC-51 —** Schema changes MUST be sequentially numbered, immutable migrations applied through a runner that records applied migrations in a durable ledger; ad-hoc or temporary production-apply scripts MUST NOT be the system of record. (§29)

> **AC-52 —** User- or LLM-supplied URLs MUST be authorized against SSRF rules — reject non-https and internal/loopback/link-local/private/cloud-metadata addresses and userinfo URLs — before any fetch, independently of any service allowlist. (§27)

> **AC-53 —** Autonomous computer-use, browser, or CDP control MUST default to ask-before-acting; allow-all autopilot MUST be an explicit opt-out only, and the default-deny invariant MUST be guarded by a CI regression test. (§16, §27, §52)

> **AC-54 —** A browser/editor extension MUST treat page DOM content and page-originated messages as untrusted: gate cross-origin capture behind a user-managed origin allowlist, redact secrets, and confine writes to the originating tab. (§52)

> **AC-55 —** An MCP stdio server MUST NOT be spawned in a production build without a verified signed manifest; the user-consent fallback is permitted only when `developerMode` is true and MUST argv-pin both the command and its arguments exactly. (§53)

> **AC-56 —** Plugin discovery MUST follow the documented priority-ordered, consent-gated loader; a project-scoped definition MUST NOT be honored without an explicit user-consent gate, and manifest presence alone MUST NOT auto-execute or auto-trust a plugin. (§51)

> **AC-57 —** Surfaces MUST consume streamed model output only as normalized canonical `StreamChunk` records; raw vendor SSE/NDJSON frames MUST NOT cross into surface or experience code. (§33)

> **AC-58 —** A streaming response MUST be resumable from the last acknowledged position without re-running generation, MUST be bounded by an idle/stall watchdog, and MUST reconcile metered usage against actual streamed output after completion, refunding any reservation on pre-completion failure. (§32, §33)

> **AC-59 —** A Local- or BYOK-mode stream MUST originate directly from user-owned compute or the user's provider and MUST NOT transit AGI managed cloud; metered streaming is exclusively the Managed path. (§33)

### Operability

> **AC-60 —** A reliability or availability claim MUST be scoped to a specific trust tier and surface; no path may assert a capability the chosen route cannot deliver in that tier, and SLOs MUST NOT be averaged across Local, BYOK, and Managed. (§34, §39)

> **AC-61 —** Every path that can fail MUST pre-declare a single deterministic failure outcome at its boundary; silent degradation, silent model substitution, and silently incomplete results are prohibited. (§34)

> **AC-62 —** Local Mode reliability and performance MUST NOT depend on AGI cloud reachability; a Local-only workflow MUST remain fully functional with all AGI-cloud hosts unreachable, and a Local interaction MUST NOT be made to wait on an AGI-cloud round-trip it does not require. (§34, §39, §41, §42)

> **AC-63 —** Every API and IPC error MUST be returned through the shared typed envelope (`{error:{code,message},requestId}`) with a propagated correlation id; raw provider, database, or SQL error text MUST NOT reach the client except via an explicit safe-to-expose code allowlist. (§28, §35)

> **AC-64 —** A BYOK provider fault MUST be attributed to the user-owned provider and MUST NOT be presented as an AGI managed-cloud failure; trust-mode attribution is part of the error contract. (§35)

> **AC-65 —** Observability, telemetry, error reports, analytics, and logs MUST be emitted only in Managed mode, gated by the same fail-closed privacy predicate as egress; Local- or BYOK-origin signals MUST be suppressed, and Local-origin content MUST NEVER appear in any telemetry, log, or cache payload. (§24, §36, §37, §38, §40)

> **AC-66 —** A module MUST NOT present a functional observability API (error capture, tracing, metrics) that is silently a no-op; an unwired backend MUST report disabled via an explicit `isEnabled`-style signal surfaced in health/status. (§36)

> **AC-67 —** All log output on every surface MUST pass through the shared secret-redacting logger facade before reaching any sink; raw `console.*` in production code is forbidden, and production logs MUST drop info/debug and retain only redacted warn/error. (§37)

> **AC-68 —** Any telemetry counter that affects a user's billing, credits, or quota MUST be persisted to the durable system of record; a module-level in-process structure MUST NOT be the authoritative record of any user-affecting metric. (§31, §38)

> **AC-69 —** Background and scheduled work MUST authenticate via a server-side secret, MUST be idempotent, MUST emit a durable inspectable record of its execution and outcome, and any environment-based auth bypass MUST require an explicit co-flag plus loopback and fail closed outside dev. (§31)

> **AC-70 —** Every long-running task MUST be resumable from a durable checkpoint, cancellable via an explicit honored stop signal that halts further effects, bounded by an explicit maximum-step or budget limit, and MUST release any reserved metered resource on cancellation or failure. (§32)

> **AC-71 —** Events (facts that happened) and commands (requests that may be refused) MUST be modeled as distinct concerns; an emitted event is an immutable, ordered fact, a Local/BYOK-origin event MUST NOT be emitted onto a Managed channel, and any consumer producing user-affecting effects MUST be idempotent under at-least-once delivery. (§30)

> **AC-72 —** Streamed interactions MUST be measured against an explicit time-to-first-token SLO with declared target and breach thresholds, emitting partial results progressively rather than buffering to completion before first token. (§39)

> **AC-73 —** Every cache MUST declare an explicit lifetime and invalidation contract; a cache MUST NOT be the source of truth for capability/model/entitlement state, and stale trust-or-capability data MUST be treated as a correctness defect. (§40)

> **AC-74 —** Offline mutations MUST be captured in a durable queue with bounded retries and replayed idempotently on reconnect; a Local-only interaction MUST NOT block on absent connectivity, and a mutation queued under Local mode MUST NOT become cloud-eligible on reconnect. (§41)

> **AC-75 —** Distributed rate limiting MUST use the shared durable store in production; in-memory limiting is permitted only in dev/preview, and security-sensitive endpoints MUST fail closed when the store is unavailable. (§34)

> **AC-76 —** Mutating billing/credit operations MUST be idempotent via an explicit idempotency key, and reserved credits MUST be refunded on request or stream failure. (§32, §33)

### Lifecycle & Extensibility

> **AC-77 —** Feature-flag state for a surface MUST be sourced from a single authoritative flag table; per-call-site re-derivation of availability is forbidden. (§45)

> **AC-78 —** A feature flag MUST NOT relax a trust-boundary invariant, and no flag combination may present a capability as available while another flag deterministically disables it; a control offered to the user MUST resolve to functioning behavior or not be offered at all. (§45)

> **AC-79 —** A new shared TypeScript package, Rust crate, third-party dependency, or extracted service layer MUST be justified by a real second consumer (or 2+ callers / a high-risk boundary for a service) before it enters the workspace; a single-consumer concern lives inside that consumer. (§5, §46, §47, §58)

> **AC-80 —** Cross-cutting dependency versions (react, typescript, zod, security-sensitive transitive deps) and the Node/pnpm toolchain MUST be pinned centrally in the root workspace configuration (overrides, `engines`, `packageManager`, `.nvmrc`), consistently across the monorepo, not per package. (§8, §46)

> **AC-81 —** The platform MUST remain a single dual pnpm + cargo workspace so cross-surface contracts and trust invariants are changeable in one atomic commit; adoption of a build-orchestration cache layer MUST be a recorded, justified decision and its current absence treated as intentional, not as a gap. (§47)

> **AC-82 —** Logic or UI needed by more than one surface MUST live in a shared package built for reuse; cross-surface logic that mobile must consume MUST live in a React-Native-safe package free of web-only runtime peer dependencies, and a web-coupled package MUST NOT be the only home of state or contracts a non-web surface needs. (§9, §48)

> **AC-83 —** Internal workspace packages MUST stay private and single-versioned; an independent per-package semver or release-train scheme MUST NOT be introduced without a concrete external-distribution requirement. (§49)

> **AC-84 —** The model catalog MUST carry an explicit version and a dated, source-attributed verification log; fast-moving fact sets (model IDs, capabilities, pricing) MUST be governed by such a record rather than treated as static. (§49)

> **AC-85 —** The declared dependency surface of a shipping binary, and any maintainer-facing pointer to a cross-language mirror, MUST name paths that exist and match the build graph; a stale dependency claim or update instruction is a defect that enables drift, not a comment. (§46, §50)

> **AC-86 —** Managed cloud is the only metered egress and the only path that may write the shared cloud chat store; it MUST be gated by subscription/entitlement. Managed cloud is in public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate has been removed, and the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident-response kill-switch. Ledgering, abuse, fraud, refund, retention, and deletion controls must keep pace with public usage but no longer gate access. (§27, §43)

### Governance

> **AC-87 —** Every subsystem MUST be independently testable through its own contract with dependencies substituted; an inability to test a subsystem in isolation is a design defect to be fixed at the seam, not papered over with an end-to-end test. (§55)

> **AC-88 —** Tests MUST exercise real behavior; fake assertions, production stubs, swallowed mock expectations, and mock-only green tests are forbidden and MUST be enforced by `pnpm check:llm-failures` in CI; every fixed bug MUST gain a regression test that fails against the unfixed code; failing tests MUST NOT be deleted, skipped, or disabled to make CI green. (§55)

> **AC-89 —** Each surface MUST own its test-runner configuration; tier scripts MUST discover and delegate to the owning surface's own test command, and an empty test tier MUST fail loudly rather than silently pass. (§55)

> **AC-90 —** Implementation is the single source of truth: every documented current-behavior claim MUST cite a concrete repo path or be marked UNKNOWN, and when prose disagrees with code the code wins and the prose is marked Needs Update — never the reverse. (§56, §60)

> **AC-91 —** A behavior change and its documentation MUST land in the same unit of work; a file move MUST NOT be combined with a behavior change in the same commit. (§56)

> **AC-92 —** Any change touching an `AGI-TRUST-*` invariant, auth, RLS, migrations, billing, secret/BYOK routing, or a Local/BYOK/Managed transition MUST pass a mandatory human security review gate AND carry a recorded ADR before merge; build success alone MUST NOT be treated as security or architecture approval. (§57, §58, §59)

> **AC-93 —** Security review MUST confirm that a cited control actually enforces on the live path; automated scanning (Semgrep, CodeQL) is defense-in-depth beneath the human gate, not a replacement, and making a scan advisory MUST NOT remove the human gate for trust-boundary changes. (§57)

> **AC-94 —** Every required CI guardrail and hook MUST itself be verified by `check:ci-guardrails` / `check:hooks` so the review gate cannot silently regress; an architecture is preserved unless there is clear evidence of improvement, and convenience MUST NOT justify weakening a boundary. (§58)

> **AC-95 —** Explicit ADRs and the implementation itself are the ONLY two things that may override this constitution — the implementation on present fact, an ADR on intentional decision; no build result, reviewer preference, or deadline carries override authority, and an undocumented departure is a violation, not a decision. (§1, §59, §60)

> **AC-96 —** An accepted ADR is immutable: it is superseded by a new ADR, never edited in place, and a load-bearing decision MUST be mirrored as an `AGI-DOMAIN-NNNN` requirement ID and referenced by that ID, never restated. (§59)

> **AC-97 —** The constitution evolves only through the implementation or an explicit superseding ADR; silent drift is a defect to be resolved by changing the code or recording an ADR, never a lawful amendment. (§60)

> **AC-98 —** The immutable values — trust-boundary separation; Local Mode as user-owned compute AND storage with cloud inference never required; capability honesty; Local state never silently crossing a boundary — carry the highest amendment bar and MUST NOT be weakened for convenience or velocity. (§2, §60)

> **AC-99 —** A cited invariant MUST reflect its real enforcement status (enforced / partially enforced / dormant / target), and stale governance referencing a removed dependency or behavior MUST be reconciled by supersession, never left in place to mislead. (§42, §57, §60)

> **AC-100 —** This Architecture Constitution (AGI-DOC-0015) MUST inherit from and MUST NOT contradict the Platform Constitution (AGI-DOC-0013); architectural invariants it asserts MUST carry an `AGI-ARCH-NNNN` requirement ID (next free is AGI-ARCH-0003), and structural facts MUST be referenced from `architecture-manifest.md` rather than re-enumerated. (§1, §2)

### Amendments (v1.1 — Accessibility, AI Safety, Build Integrity, Statelessness)

> **AC-101 —** All user-facing experiences MUST satisfy WCAG compliance requirements appropriate to their supported platforms. (§61)

> **AC-102 —** User-visible strings MUST be externalized; no hardcoded locale-dependent text outside explicitly approved exceptions. (§61)

> **AC-103 —** Every AI-generated output MUST pass through a deterministic safety boundary appropriate to its execution mode (Local Mode or Cloud Mode); safety behavior MUST be observable, configurable, auditable, and fail closed where applicable. (§62)

> **AC-104 —** Abuse prevention, fraud detection, moderation decisions, and enforcement actions MUST be traceable through immutable audit records; Local Mode MUST NOT require Cloud Mode for enforcement unless explicitly disclosed. (§62)

> **AC-105 —** Every release artifact MUST be reproducible, cryptographically verifiable, and attributable to a known source revision. (§63)

> **AC-106 —** Every production release MUST include provenance metadata, dependency verification, SBOM generation, integrity validation, and release-gate enforcement; untested or unverifiable artifacts MUST NEVER enter a production release pipeline. (§63)

> **AC-107 —** Stateless execution SHALL be the default architectural model; stateful components MUST explicitly declare ownership, persistence boundaries, replication strategy, consistency guarantees, and recovery behavior. (§34; generalizes AC-68)

## Design Decision Framework

Every future engineering proposal — a new package, a refactor, a runtime, a route, a schema, a flag — is evaluated against this framework before it is built. The framework is not a scorecard whose points are traded off freely. It is partitioned into **gates** (a failure rejects the proposal outright) and **weights** (a tradeoff to be reasoned about and recorded). The distinction is the whole point: trust-boundary and Local-Mode questions are gates because the immutable values (§2, §60, AC-98) carry the highest amendment bar; everything else is a weight.

### The binding questions

A proposal is examined against the following, in this order:

1. Does it preserve the three trust boundaries — does Local/BYOK/Managed separation survive it, with no new path by which Local or BYOK state can reach AGI cloud? **(Gate.)**
2. Does it preserve Local Mode as user-owned compute AND user-owned storage, fully functional with all AGI-cloud hosts unreachable, never requiring cloud inference? **(Gate.)**
3. Does it preserve capability honesty — does it avoid advertising any capability, provider, or model the chosen route cannot actually deliver? **(Gate.)**
4. Does it preserve Cloud Mode's obligations — entitlement gating, server-derived ownership, in-depth tenant isolation — and keep metered cloud entitlement-gated? (Managed cloud is in public alpha and open by default since 2026-06-27; the private-beta/waitlist launch gate is removed and the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is only a kill-switch — controls keep pace but no longer gate access.) **(Gate.)**
5. Does it improve modularity and separation of concerns, and does it reduce coupling rather than add it? **(Weight.)**
6. Does it improve testability — can each affected subsystem still be exercised in isolation through its own contract? **(Weight.)**
7. Does it improve observability and reliability — is every new failure path given a single deterministic outcome and an enabled signal? **(Weight.)**
8. Does it increase platform consistency — does it move toward one shared primitive (one Experience contract, one provider adapter, one privacy predicate) rather than adding a parallel one? **(Weight.)**
9. Would it still be correct in five years — is it engineered around the trust-mode axis rather than around a current vendor, model, or framework that will churn? **(Weight, with veto power: a design that locks the platform to a vendor shape is rejected even if every other weight is positive.)**

### How to apply it

**Gates are absolute.** A proposal that fails any of questions 1–4 is rejected outright; it is not "scored low" and offset by strong modularity or performance. The convenience is redesigned around the boundary, never the reverse (AC-98). There is exactly one lawful way to pass a gate that the proposal would otherwise fail: a narrow, explicit, superseding ADR that consciously moves the boundary (AC-95), which itself triggers the mandatory human security review and the `AGI-TRUST-*` ADR mandate (AC-92). "Build success" or "it shipped and nothing broke" is never such an ADR.

**Weights are reasoned, not summed.** Questions 5–9 are a structured argument, not arithmetic. A proposal may legitimately trade some modularity for a measured reliability gain, but the trade MUST be made explicit in the proposal and, where it touches a shared boundary, recorded. A weakening that is absorbed silently into a diff is a violation (§2); a weakening that is named and justified is a decision.

**The escalation rule.** If a proposal introduces a new shared package or crate, extracts a service layer, or touches a trust boundary, the weight questions are insufficient on their own — it goes to human architecture review (AC-79, AC-92). Mechanical violations (dependency direction, canonical-contract redefinition, SSOT drift) are caught by the guardrail suite before any human review and MUST be fixed at the seam, not waived.

**The tie-breaker.** When two weights genuinely conflict and the reviewer cannot decide, the protective principle wins over the convenience principle (§2, AC-98), and a "no" on any gate requires either redesign or a narrow overriding ADR. The default posture is conservative: an existing architecture is preserved unless there is clear evidence of improvement (AC-94).

## Relationship to Future Documents

This constitution defines only engineering philosophy and architectural boundaries — _what_ must hold and _where_ responsibility sits. It deliberately does not specify behavior: request/response shapes, algorithms, state machines, concrete schemas, wire formats, and ranking/retrieval logic are all deferred to a family of inheriting runtime specifications. Each book below **inherits from this constitution** (and through it from the Platform Constitution, AGI-DOC-0013), MUST NOT contradict it, and owns the behavioral detail this document refuses to fix. Where a book is named in a section's deferral, that deferral is binding.

The following are the inheriting books and their **responsibilities** (not their contents):

- **AI Runtime Specification** — owns execution behavior: the `ProviderAdapter` / `ChatRequest` / `StreamChunk` wire shapes, credential-resolution flow, retry/fallback/watchdog, the agent-loop step semantics, the tool-call protocol, the autonomy/approval state machine, and the convergence-or-justified-divergence record for the TS / CLI-Rust / desktop-Rust runtimes. (Defers from §13, §15, §16, §17, §54.)
- **Context Runtime Specification** — owns context assembly: compaction modes and trigger thresholds, the order in which sources are packed into the budget, and the summarization-to-memory cadence, all bound by assembly determinism. (Defers from §19.)
- **Memory Runtime Specification** — owns persistence and retrieval: the scoring/ranking algorithm, the semantic index, decay curves, the promotion cadence, and the explicit reconciliation contract between the local two-layer memory graph and the cloud flat-fact projection. (Defers from §18.)
- **Session & Synchronization Specification** — owns session and sync mechanics: the session schema, fork/checkpoint/resume/replay state machine, per-surface persistence formats, cursor-frontier semantics, the per-entity LWW-vs-append-only conflict matrix, and tombstone propagation. (Defers from §20, §21, §44.)
- **Security Specification** — owns the implementation detail of the trust plane defined in §23–§27: egress-guard wire-level enforcement and per-surface parity, the RLS policy SQL / role model / GUC-binding mechanics and activation plan, SSRF hardening, consent-gate flows, secret handling and redaction, and the security-scan gating ladder. (Defers from §23, §24, §25, §26, §27, §57.)
- **API Specification** — owns the HTTP/IPC contract: route-handler conventions, the error-envelope and safe-to-expose code allowlist, request-id propagation, versioning under `/v1`, and host-based rewrites. (Defers from §28, §35.)
- **Database Specification** — owns the data layer: concrete schemas, indexes, migration SQL, the migration runner/ledger and branch-first apply workflow, and the local-PK-to-cloud-identity mapping. (Defers from §22, §29.)
- **Streaming & Long-Running Task Specification** — owns the stream gateway, TTFT SLO mechanics, tool-loop step limits, the resumption protocol, and credit reserve/refund reconciliation. (Defers from §32, §33, §39.)
- **Observability, Telemetry & Logging Specification** — owns the metric/event taxonomy, OTel GenAI conventions, the logger-facade redaction patterns, durable usage/cost persistence, and the enablement contract for error/trace backends. (Defers from §36, §37, §38.)
- **Background Execution, Offline & Reliability Specification** — owns the cron/scheduling contract, the future durable queue/event-bus boundary, the offline-queue operation taxonomy and backoff/ordering guarantees, rate-limiting policy, and idempotency-key discipline. (Defers from §30, §31, §32, §34, §41.)
- **Module Boundary, Monorepo & Dependency Governance Specification** — owns the dual-workspace topology, member globs, package/crate naming, export-surface contracts, the Rust-crate boundary check, central version pins, and patch policy. (Defers from §5, §6, §46, §47, §48, §49.)
- **Surface, Experience & Capability Specification** — owns the canonical 6-surface model and trust-mode matrix as enforceable contract, the unified Experience primitive that reconciles `ChatIntentKind` / `FocusMode` / `AgentMode` / research flows, runtime-tier dispatch, and feature-flag governance. (Defers from §9, §10, §11, §12, §45.)
- **Tool, MCP & Extension Integration Specification** — owns `ToolDef`/`ToolChoice` contracts, provider-protocol cross-vendor schema policy, MCP transports and signed-manifest/consent gating, plugin/skill manifest interop, and the autonomous-control safety contract. (Defers from §15, §51, §52, §53.)
- **Testing, CI/CD & Governance Specification** — owns the test-tier taxonomy and coverage gating, the enforced-vs-advisory guardrail catalog and drive-to-zero plan, release/signing gates, the ADR lifecycle, and the documentation Status lifecycle. (Defers from §55, §57, §58, §59, §60.)
- **Cloud Services / Managed Control Plane Specification** — owns gateway dispatch, credit ledgering, entitlement checks, and the compliance and enterprise control plane that gate Managed cloud. (Defers from §43.)

## Appendix A — Known Current-vs-Target Gaps

This appendix is a pointer table, not a re-litigation. The authoritative trackers for current-vs-target conflicts are **`docs/00-foundation/owner-decision-register.md` §5 (the conflict register)** and **`docs/agent-context/known-flaws.md`**. Items those trackers already own are referenced by ID and MUST NOT be re-described here. Only architecture-level gaps _newly surfaced during the authoring of this constitution_ — now recorded as a full structured decision backlog in [owner-decision-register.md](owner-decision-register.md) §9 (findings A1–A17 → ARCH-D1…ARCH-D17, each with recommendation, impact, and required owner decision; all Status: Open, nothing resolved) — are spelled out below, and each carries a pointer to the section that raised it and the future book responsible for closing it.

### Already-owned gaps (reference only — do not re-list)

| Gap                                                                                                   | Owning tracker                                    | Constitution sections that cite it |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| Trust-boundary egress chokepoint Desktop/Mobile-only; Tauri Rust `reqwest` and CLI/VS Code outside it | `known-flaws.md` BYOK-RUST-EGRESS-01; register §5 | §7, §24, §42                       |
| RLS shipped but dormant on the live CRUD path (only `/sync` routes RLS-bound)                         | register §5; manifest §7/§11 (AGI-SEC-0001)       | §22, §27, §29, §43                 |
| Local desktop chat invoke path broken end-to-end                                                      | `known-flaws.md` LOCAL-CHAT-NOINVOKE-01           | §12, §34                           |
| Test tiers l2–l4 empty; coverage gate non-blocking                                                    | `known-flaws.md` CI-TIER-SCRIPTS-01               | §55                                |
| `security_audit_logs` mutable/deletable by `app_rls`                                                  | `known-flaws.md` AUDIT-IMMUT-01                   | §27, §57                           |
| Stale Supabase-era references in CURRENT_DECISIONS #13/#17 and security docs                          | register §5; manifest §13                         | §59, §60                           |
| Semgrep advisory (`continue-on-error`); CI red; desktop release builds disabled                       | manifest §11 (AGI-OPS-0001)                       | §34, §57                           |

### NEW architecture-level gaps surfaced during authoring

| #   | Gap                                                                                                                                                                                                                                                                                                                    | Section            | Closing book                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------- |
| A1  | **Provider-identity SSOT drift:** the `Provider` union (28), `models.json` provider keys (25), and the desktop Rust enum (25) have diverged; `lmstudio`/`ollama_cloud`/`minimax` exist in the union with no catalog entry. No CI guard cross-checks the three mirrors.                                                 | §14, §50           | AI Runtime Spec / Module Boundary & Dependency Governance Spec |
| A2  | **`lmstudio` ships a typed adapter package with no `models.json` entry**, leaving its capability metadata undefined at the SSOT — a capability-honesty hole distinct from the general drift.                                                                                                                           | §14, §50           | AI Runtime Spec                                                |
| A3  | **Misdirected cross-language mirror pointer:** `provider.ts` directs maintainers to `core/llm/models_config.rs` for the `Provider` enum, but that file only re-imports the enum (`use super::Provider;`); the enum is defined at `core/llm/mod.rs:649`. The mirror-update step is therefore misdirected and untracked. | §14, §50           | AI Runtime Spec                                                |
| A4  | **Three divergent, non-shared AI runtimes:** the TS `ProviderAdapter` is consumed only by api-gateway; CLI and desktop reimplement provider transport in Rust with differently-shaped enums. No convergence record or justified-divergence ADR exists.                                                                 | §13, §54           | AI Runtime Spec                                                |
| A5  | **Cloud advertises 11 providers / gateway serves 4** with no OpenAI-compatible fallback; the long-tail OpenAI-compatible coverage exists only in the desktop/CLI Rust BYOK runtimes, so cloud vs developer-surface availability is asymmetric and not surfaced at selection time.                                      | §12, §13, §28, §50 | AI Runtime Spec / API Spec                                     |
| A6  | **No unified Experience primitive:** Chat/Code/Agent/Research are modeled by four divergent type systems (`ChatIntentKind`, `FocusMode`, `AgentMode`, ad-hoc `DeepResearchPanel`); trust/capability behavior is not derivable from one contract.                                                                       | §12                | Surface, Experience & Capability Spec                          |
| A7  | **No RN-safe shared chat core:** `@agiworkforce/unified-chat` is React-DOM-coupled with 0 mobile consumers, forcing mobile to reimplement chat state — violating the shared-packages reuse mandate.                                                                                                                    | §9, §48            | Surface / Shared UI Spec                                       |
| A8  | **Mobile egress-guard copy documents BYOK as part of "Local mode"**, contradicting the matrix invariant that BYOK is absent on Mobile (inherited desktop copy; `byokKeys:false`, no key path — a copy/trust-boundary honesty defect, not a live leak).                                                                 | §10, §45           | Trust-Boundary Egress Spec                                     |
| A9  | **Local/cloud memory models are divergent, not reconciled:** the local two-layer decay/daily-log/TF-IDF graph has no representation in the cloud flat-fact projection; "one shared state" holds only for the reduced projection.                                                                                       | §18                | Memory Runtime Spec                                            |
| A10 | **Cross-page sync ordering silently skips** a pulled artifact/message whose parent conversation has not yet landed, rather than buffering — a transient incomplete-view defect.                                                                                                                                        | §21, §44           | Session & Synchronization Spec                                 |
| A11 | **Production migrations applied by a hand-rolled TEMP script with no ledger** (`_prod_migrate.mjs`), so committed-vs-live schema drift is unverifiable from the repo.                                                                                                                                                  | §29                | Database Spec                                                  |
| A12 | **Two divergent loggers coexist** (web pino, object-first, no redaction vs the shared redacting varargs facade); web-side logged objects are not guaranteed scrubbed.                                                                                                                                                  | §37                | Observability, Telemetry & Logging Spec                        |
| A13 | **Observability is a facade:** Sentry is a pure no-op stub (`isSentryEnabled()` always false, no dep installed) and OTel attributes are computed but never exported.                                                                                                                                                   | §36, §38           | Observability, Telemetry & Logging Spec                        |
| A14 | **Cost/usage telemetry is non-durable** (module-level Map, LRU-capped, resets on cold start) and cannot be the basis of any user-facing charge.                                                                                                                                                                        | §31, §38           | Observability / Background & Reliability Spec                  |
| A15 | **Inventory-honesty gaps:** root `Cargo.toml` claims shipping binaries depend on only 2 crates while `apps/cli` path-depends on 5; the `crates/*` glob admits the stray `crates/node-version.txt`.                                                                                                                     | §46, §47           | Module Boundary & Dependency Governance Spec                   |
| A16 | **Rust crate boundaries are tooling-unenforced:** `check-boundaries.mjs` scans only `apps`/`packages`/`services`, so the Rust crate-layering law has no machine check.                                                                                                                                                 | §6, §47            | Module Boundary Spec                                           |
| A17 | **Most packages declare a bare-string `exports`**, so the deep-import boundary check cannot positively validate subpaths; encapsulation rests on the absence of specifiers rather than a declared contract.                                                                                                            | §6, §48            | Module Boundary Spec                                           |
| A18 | **Editorial: circular deferral between §16/§17 and §54** (the AI runtime section defers behavior back to the agent/workflow sections, which defer to it) — resolved by an editor fix, recorded here so the resolution is auditable.                                                                                    | §16, §17, §54      | (resolved in coherence review)                                 |
