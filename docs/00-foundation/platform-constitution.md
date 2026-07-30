# The AGI Platform Constitution

Status: Current
Owner: Founder + platform lead
Last updated: 2026-06-27
Last verified against implementation: 2026-06-25
Audience: Everyone who builds, designs, operates, governs, or reasons about AGI — human or AI agent
Layer: docs/00-foundation
Document ID: AGI-DOC-0013
Authority: Highest-level product authority. Every other document — architecture, runtimes, APIs, data, UX, features, engineering standards, QA, deployment, and future code generation — inherits from this constitution. Only the actual implementation and explicit Architecture Decision Records ([adr-index.md](adr-index.md)) may override it.
Related: [documentation-constitution.md](documentation-constitution.md), [architecture-manifest.md](architecture-manifest.md), [canonical-glossary.md](canonical-glossary.md), [requirement-id-system.md](requirement-id-system.md), `docs/current/source-of-truth.md`

---

## Preamble

This document defines what AGI **is**, before anything defines what AGI **does**. It is written to outlast any release, any provider, any model, any framework, and any individual contributor. Where a feature and this constitution disagree about identity, the feature is reconsidered. Where the running implementation and this constitution disagree about fact, the implementation wins and this document is corrected ([documentation-constitution.md](documentation-constitution.md) Article I); but where they disagree about **intent**, this constitution is the standard the implementation is held to.

It is deliberately a document of principles, not features. Features are mortal. Principles are how we decide which features deserve to exist.

The public brand is **AGI**. The formal platform and repository name is **AGI Workforce**. Internal identifiers remain `agiworkforce` (`AGI-NAME-0001`). This constitution governs the platform regardless of which name is spoken.

---

## Part I — Identity

### 1. Vision

A world where a person's relationship with artificial intelligence is **owned by the person, not by a model vendor** — where the same trusted workspace follows them across every device and context, runs privately when they want privacy, runs in the cloud when they want convenience, and is never a hostage to a single company's model, pricing, or politics.

### 2. Mission

To be the **application layer of personal and professional AI**: a model-neutral, privacy-first suite that gives people a Claude/ChatGPT/Codex-class experience while letting them choose the execution source — local models, their own provider keys, or AGI-managed cloud — without ever surrendering control of their data or their conversations.

### 3. Purpose

AGI exists because intelligence is becoming infrastructure, and infrastructure must not be monopolized. The frontier-model labs build extraordinary models; AGI builds the **durable, trustworthy product surface on top of all of them**. We make the models useful, portable, private, and continuous across a person's whole working life.

### 4. What AGI is

- An **application suite** spanning six first-class surfaces (Desktop, Mobile, Web, CLI, VS Code, Chrome) and a cross-origin artifact sandbox (`AGI-SURF-0001`).
- A **model-agnostic, provider-agnostic** platform: one experience, many possible engines, selected transparently (`AGI-AI-0001`, `AGI-AI-0002`).
- A **two-product platform**: **Local Mode** (user-sovereign) and **Cloud Mode** (AGI-managed), sharing one engine but serving different needs (`AGI-PROD-0002`).
- A **trust system**: Local, BYOK, and Managed are enforced boundaries, not marketing labels (`AGI-TRUST-0001`–`AGI-TRUST-0004`).
- An **agent-native system**: built so that humans and AI agents can extend it for a decade, with the repository itself treated as part of the product (`AGI-DX-0001`).

### 5. What AGI is not

AGI is **not a foundation-model company**. It does not train frontier models and does not compete on raw model quality. It is not a single-model experience, not a walled garden, not an advertising or surveillance business, and not a vendor lock-in. (Full enumeration: [Part X — Non-Goals](#part-x--non-goals).)

### 6. Problems AGI solves

- **Model lock-in.** Users are trapped in one lab's app, history, and pricing. AGI lets them route across providers and local models from one place.
- **Surface fragmentation.** AI lives in disconnected apps. AGI is one product across desktop, mobile, web, terminal, IDE, and browser, with a coherent trust and sync model.
- **Privacy surrender.** Using AI usually means shipping everything to a cloud. AGI makes **local-first** a real, first-class product, not a footnote.
- **Opacity.** Users rarely know which model ran, what it can do, or where their data went. AGI makes routing, capability, and retention **legible**.
- **Discontinuity.** Work is scattered across tools. AGI provides continuous conversations, projects, memory, and artifacts that follow the user.

### 7. Problems AGI intentionally does not solve

- It does not try to **build a better base model** than the labs.
- It does not try to **be the cheapest inference reseller**; it competes on trust and product, not on margin races (`AGI-BILL-0001`).
- It does not try to **own the user's identity graph** or monetize attention.
- It does not try to **replace human judgment** on irreversible, high-impact actions; it assists and requires consent.
- It does not try to be an **everything-app** beyond intelligence work (no social feed, no marketplace of attention).

### 8. Target users

In priority order of adoption, not importance:

1. **Privacy-conscious individuals** who want serious AI without surrendering their data — the first audience.
2. **Developers** — the deepest long-term audience — who want local/BYOK execution, IDE/CLI/desktop workflows, MCP, agents, and no silent cloud routing.
3. **Power users and small teams** who want projects, memory, artifacts, connectors, and shared work.
4. **Enterprises** who require policy, audit, identity, and managed-compute governance before adopting at scale.

### 9. Primary use cases

Conversational assistance; coding and software agents; document and artifact creation; research and search with citations; computer and browser automation under consent; cross-device continuity of conversations, projects, and memory; and provider-flexible inference for individuals, teams, and organizations.

### 10. Long-term evolution

AGI evolves from a multi-surface assistant into a **personal AI operating layer**: Local Mode deepens toward fully capable on-device and self-hosted intelligence; Cloud Mode matures into a governed, metered, enterprise-grade managed platform; and the platform increasingly **operates and improves itself** through reviewed AI-agent workflows, with humans owning judgment, safety, privacy, billing, and release.

### 11. Competitive positioning

AGI competes **beside** the model labs, not against them. Where ChatGPT, Claude, Codex, Gemini, and Perplexity each bind a user to one lab's models and cloud, AGI is the **neutral application layer** that runs any of them — and runs locally when asked. Its position is the "trust, portability, and continuity" layer of AI, not the "best benchmark" layer.

### 12. Core differentiators (immutable)

1. **Provider sovereignty** — the user chooses the execution source; AGI is loyal to the user, not to a model.
2. **Local-first independence** — Local Mode runs on user-owned compute and user-owned storage; it is fully usable without an AGI subscription, **never requires AGI cloud inference**, and is never degraded to upsell Cloud.
3. **Trust boundaries as rights** — Local, BYOK, and Managed are separated and never silently crossed.
4. **One conversation, every surface** — continuity and a single coherent experience across all clients.
5. **Capability honesty** — AGI never claims a capability the chosen route cannot actually deliver.

### 13. Immutable values

Sovereignty. Privacy. Honesty. Continuity. Neutrality. Consent. Durability. These are the values against which every decision is measured ([Part XI — Decision Rules](#part-xi--decision-rules)). They do not change to chase a quarter, a trend, or a competitor.

---

## Part II — Philosophies

### 14. Product philosophy

The product is a **trusted relationship**, not a feature list. Every feature must justify its existence against the immutable values. There is **one chat** — file work, references, tools, artifacts, and connectors are _states of a conversation_, not separate products (`AGI-PROD-0001`). Convenience never overrides sovereignty: **Cloud Mode provides convenience, not exclusivity.**

### 15. Engineering philosophy

**SDKs are adapters, not architecture** (`AGI-ARCH-0001`). AGI owns its runtime contracts, event streams, trust modes, routing, tool schemas, and usage accounting, so that no provider's API shape becomes AGI's architecture. One shared engine, not many drifting apps. Boundaries are enforced, not suggested (`AGI-ARCH-0002`). Claims are backed by evidence; behavior and its documentation change together.

### 16. UX philosophy

The interface earns trust by being **legible and calm**. The user always knows which mode they are in, which provider and model ran, and what will be sent before it is sent. Defaults are safe; power is available but never ambushing. The empty state invites work; the common path is short; deep workflows get room when they need it. The same conceptual model holds across every surface.

### 17. AI philosophy

Intelligence is **routed, explainable, and bounded**. Model selection is transparent and capability-aware; silent substitution is forbidden (`AGI-AI-0002`). Untrusted content (web, files, tools, retrieved data) is treated as data, never as instructions. The system reasons and acts under **human consent for anything irreversible, external, or expensive**. AGI augments judgment; it does not replace accountability.

### 18. Platform philosophy

AGI is **platform-first**: surfaces are clients of a shared platform, not silos. Capabilities are composed from runtimes with clear responsibilities, not bolted onto apps. The platform is provider-agnostic and model-agnostic by construction. The repository is part of the product and is built to be navigated and extended by humans and agents alike.

### 19. Design philosophy

Design is **intentional, not templated**. Surfaces feel native to their platform while sharing one conceptual language. Trust state is always visible. Modal-first for focused actions; full surfaces for deep work. Nothing fake: no placeholder data presented as real, no badge that overstates availability, no control that does nothing.

### 20. Privacy philosophy

Privacy is the **default, not the upgrade**. Local data stays local unless the user explicitly and reviewably moves it. Telemetry is consent-gated and never includes raw prompts, files, local paths, tool output, screenshots, or Local-origin content (`AGI-PRIV-0001`). The user can see, export, and delete their data. Privacy is a guarantee, not a setting we hope they don't find.

### 21. Security philosophy

Security is **enforced at the boundary, fail-closed by default**. Trust boundaries are encoded in the system, not left to convention. Secrets are protected by the platform's strongest available primitive on each surface. Privileged, external, and destructive actions require explicit approval. Where enforcement is incomplete, that gap is documented honestly and treated as a defect, never hidden ([architecture-manifest.md](architecture-manifest.md) §11).

### 22. Developer-experience philosophy

Developers — human and AI — are first-class users of the platform itself. The codebase is layered, typed, boundaried, and documented so that a new contributor (or agent) becomes productive in minutes by reading the foundation. Reproducibility, clear ownership, and small reviewable changes are valued over cleverness.

---

## Part III — The Two Products

AGI is delivered as **two products that share one platform**. This is a constitutional structure, not an implementation detail.

> **Reconciliation of modes and boundaries.** The platform has **three trust boundaries** (`PrivacyMode = local | byok | managed`, [canonical-glossary.md](canonical-glossary.md)) and **two products**. **Local Mode** (the product) is defined by **user-owned compute and user-owned storage** — not by any single inference technique. It spans the two user-private boundaries, where on-device (`local`) and BYOK (`byok`) are **two execution strategies within Local Mode**, not its defining characteristic; in both, data and keys stay with the user, never traverse AGI cloud, and **AGI cloud inference is never required**. **Cloud Mode** (the product) is the `managed` boundary. The three-boundary primitive is sacred and never collapses; the two-product framing is how users experience it.

### 23. Local Mode

#### 23.1 Purpose

To let a person use serious AI on **compute they own and storage they control**, **without an AGI subscription and without surrendering data**. Local Mode is defined by **user-owned compute and user-owned storage** — not by any one inference technique. On-device models and BYOK are execution strategies within Local Mode; **AGI cloud inference is never required for Local Mode**. Local Mode is the embodiment of sovereignty and the reason AGI is trustworthy.

#### 23.2 Target users

Privacy-conscious individuals, developers, regulated and offline-capable users, and anyone who refuses vendor lock-in.

#### 23.3 Capabilities

Conversation, files, references, artifacts, tools, and (where the surface supports it) computer/browser use and voice — all executed on user-owned compute (on-device models or the user's own provider account via BYOK) against user-owned storage.

#### 23.4 Storage model

**Local-first.** Conversations, projects, memory, settings, and generated files persist on the user's device. They are never uploaded silently. Movement to the cloud is an explicit, reviewable act.

#### 23.5 Synchronization model

By default, **none across the trust boundary.** Local data does not sync to AGI cloud. Local Mode may keep its own device-local continuity; it does not join the shared cloud chat store.

#### 23.6 Privacy guarantees

In Local Mode, AGI does not see the user's conversations, files, keys, or tool output. The `local` boundary never routes content or telemetry off the device; the `byok` boundary routes only to the **user's own provider**, with that provider labeled and that route's retention disclosed (or marked unknown).

#### 23.7 Execution model

Local Mode has two execution strategies, both on user-owned compute: **on-device inference** (`local`) and **direct-to-provider inference** (`byok` — the user's own provider account). Neither routes through AGI cloud. **Native tools are never used in `local` execution** to avoid leaking context; BYOK may use provider-native tools where supported, with labels and consent. AGI cloud inference is never a required step in Local Mode.

#### 23.8 Supported surfaces

Local Mode (on-device) is available where the platform can run models locally; **BYOK is available only on Desktop, CLI, and VS Code** (`AGI-TRUST-0004`). Mobile offers on-device Local but not BYOK in its initial product. Web and Chrome do not offer Local Mode.

#### 23.9 Supported providers

Local runtimes (e.g., on-device model runtimes) and any provider the user holds a key for, treated as a **route object** — `provider + endpoint class + model id + capability metadata + pricing + retention claim + health` (`AGI-AI-0001`). A model name alone is never sufficient.

#### 23.10 Local LLM philosophy

Local models are a **right, not a fallback**. AGI invests in making on-device intelligence genuinely capable and selects the best available local engine per device, with honest readiness and capability signals. If a local model cannot do a task, AGI says so and offers guidance — it never silently escalates to the cloud.

#### 23.11 BYOK philosophy

BYOK means "**bring any serious route you already pay for, and AGI gives you the application layer on top**." AGI never marks up the user's own keys, never proxies them through AGI cloud, and always labels the provider and route.

#### 23.12 Offline behavior

Local (on-device) execution works without network. The product degrades gracefully and **fails closed**: when a private route is unavailable, AGI offers an explicit fork or guidance, never a silent cloud call (`AGI-TRUST-0001`).

#### 23.13 Security expectations

Local data is encrypted at rest using each surface's strongest primitive; secrets live in the platform's secure store; egress to AGI cloud is blocked while not in Managed mode.

#### 23.14 Non-goals

Local Mode is not a teaser for Cloud. It is not crippled to drive upgrades. It does not require an account. It is not a silent data-collection channel.

### 24. Cloud Mode

#### 24.1 Purpose

To provide the **convenience of a fully managed AI workspace** — AGI-managed models, cloud sync, hosted storage, projects, memory, settings, conversations, usage, subscriptions, and collaboration — for users who want AGI to run and govern the infrastructure for them.

#### 24.2 Target users

Individuals who prefer managed convenience, teams that need shared continuity and collaboration, and enterprises that require governed, metered, audited compute.

#### 24.3 Managed infrastructure

AGI operates the inference gateway, identity, storage, sync, and billing. Cloud Mode is the **only** path that crosses into AGI cloud and the **only** writer to the shared cloud chat store (`AGI-TRUST-0003`).

#### 24.4 Managed storage

Conversations, projects, memory, settings, artifacts, and generated files are stored server-side under the user's account, with isolation, export, and deletion as guarantees.

#### 24.5 Projects, memory, synchronization

Projects (instructions, knowledge, sources, defaults), memory (saved/reference/project), and settings synchronize across **Web, Desktop, and Mobile** as one account (`AGI-SYNC-0001`). Developer surfaces (CLI, VS Code) and Chrome are not part of automatic chat sync.

#### 24.6 Authentication

Cloud Mode requires a managed identity and entitlement. Authentication is a platform service, not a per-surface invention.

#### 24.7 Subscriptions and billing

Cloud Mode is monetized through transparent subscriptions and metered usage. Managed compute and credits are in public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate is removed and `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is an incident-response kill-switch only. Metering, fraud, refund, chargeback, retention, deletion, and provider-term controls must keep pace with public usage but no longer gate access (`AGI-BILL-0001`); managed access stays subscription/entitlement-gated. Pricing is honest and singular; the platform never presents conflicting or fictional prices.

#### 24.8 Provider abstraction

Cloud Mode remains **provider-agnostic**: AGI selects and routes among providers behind a managed gateway, preserving the same capability-honest, explainable routing as Local Mode. Managed convenience never means single-model lock-in.

#### 24.9 Scaling and reliability

Cloud Mode is engineered for managed scale and graceful degradation. Reliability, quotas, and cost controls are platform responsibilities, not afterthoughts.

#### 24.10 Enterprise direction

Cloud Mode matures toward an enterprise control plane: organization policy, role-based administration, audit logs, SSO/SCIM, connector/provider policy, usage ledgers, and invoice-first commercial terms — earned before broad managed compute is offered.

#### 24.11 Future evolution

Cloud Mode evolves into a governed, multi-tenant managed-intelligence platform with collaboration, automation, and enterprise governance — always preserving the trust boundary that keeps Local Mode independent.

---

## Part IV — Platform Structure

The canonical hierarchy. Each layer has a distinct responsibility; nothing is defined twice ([cross-reference-system.md](cross-reference-system.md)).

### 25. The hierarchy

The canonical decomposition runs **Platform → Cloud Services → Surfaces → Experiences → Capabilities → Features**:

1. **Platform** — AGI / AGI Workforce: the whole system, its shared contracts, and the two Modes it delivers (Part III).
2. **Cloud Services** — the AGI-managed backbone that powers Cloud Mode: Identity, Billing & Entitlements, Synchronization, Provider Gateway, Signaling, Compliance, and the Enterprise Control Plane. Cloud Services are present only in Cloud Mode; **Local Mode runs without them** (§23).
3. **Surfaces** — the clients where users access AGI: Desktop, Mobile, Web, CLI, VS Code, Chrome; plus the **Sandbox** as an isolation primitive (Part V).
4. **Experiences** — the **cross-surface** product experiences composed over the platform, not standalone applications: **AGI Chat** (conversation), **AGI Code** (coding / developer agent), **AGI Agent** (autonomous, consent-bounded task execution), **AGI Research** (multi-source research with citations), and future experiences. An Experience manifests across whichever Surfaces support it; it is never a separate app.
5. **Capabilities** — the reusable building blocks Experiences are assembled from: Projects, Memory, Artifacts, Connectors/MCP, Skills, Plugins, Computer/Browser Use, Voice, Search, Generated Files, Dispatch/Scheduled/Cowork.
6. **Features** — the granular, individually ownable units within a Capability (for example, within Memory: saved memory, reference-chat memory, project memory, and memory import). Features are where requirements and tests attach.

This decomposition is **orthogonal to the two Modes** (Part III) and is powered by the **Core Runtimes** (Part VI) and **Platform Infrastructure** — the monorepo, shared contracts and libraries, the canonical model catalog, the data layer, and CI ([architecture-manifest.md](architecture-manifest.md)). The constitution governs their responsibilities, not their internals.

### 26. Structural rules

- Every Experience, Capability, and Feature has exactly one owner and is composed, not duplicated.
- **Experiences are cross-surface compositions, never standalone apps;** they are assembled from Capabilities and Features and manifest across whichever Surfaces support them.
- Surfaces are thin; intelligence lives in the Core Runtimes and Cloud Services.
- Provider and SDK specifics live behind adapters, never in Surfaces, Experiences, or Capabilities (`AGI-ARCH-0001`).

---

## Part V — Surface Strategy

Each surface is a client of the same platform with a distinct role. Trust modes and sync follow [architecture-manifest.md](architecture-manifest.md) §3 and `docs/current/trust-mode-surface-matrix.md`.

### 27. Desktop

- **Purpose:** the deepest surface and the local-private compute host; the native bridge for other surfaces.
- **Capabilities:** Local + BYOK + Cloud; local files, MCP/connectors, artifacts, computer/browser use, voice, generated files.
- **Limitations:** must never silently upload Local content.
- **Relationships:** native host/bridge for Chrome and device pairing; shares the cloud chat store with Web and Mobile.
- **Synchronization:** Managed chats sync with Web and Mobile; local content stays local.
- **Journeys:** local-first chat, BYOK setup and fork, project and artifact work, connector and computer-use approvals.

### 28. Mobile

- **Purpose:** the first public surface; on-device Local intelligence with managed Cloud available by entitlement.
- **Capabilities:** Local (on-device) and Cloud; continuity, capture, approvals, preview/share. **No BYOK in the initial product.**
- **Limitations:** not the first heavy local-compute generator; delegates heavy work to Desktop or Cloud.
- **Relationships:** shares the cloud chat store with Web and Desktop.
- **Synchronization:** Cloud chats sync; Local stays on device.
- **Journeys:** account-free local onboarding, on-device chat, Cloud waitlist/entitlement, preview/share.

### 29. Web

- **Purpose:** the managed account home: synced chat, projects, artifacts, billing, administration.
- **Capabilities:** Cloud only.
- **Limitations:** **no Local, no BYOK**; never implies in-browser local compute.
- **Relationships:** shares the cloud chat store with Desktop and Mobile; issues handoff tokens to developer surfaces.
- **Synchronization:** full managed app-chat sync.
- **Journeys:** sign-in, managed chat, projects/artifacts, subscription and account management.

### 30. CLI

- **Purpose:** the developer engine and the shared engine's proving ground.
- **Capabilities:** Local + BYOK + Cloud (subscription for managed); agentic and one-shot execution, tools, MCP, hooks, skills, sessions.
- **Limitations:** workspace/session scoped; coding sessions are separate from the chat store.
- **Relationships:** explicit, redacted handoff into managed app chats only.
- **Synchronization:** none by default.
- **Journeys:** local/BYOK developer sessions, agent runs under approval, session fork/resume.

### 31. VS Code

- **Purpose:** the IDE-native developer assistant; **same trust model as CLI**.
- **Capabilities:** Local + BYOK + Cloud; chat participant, model picker, agent mode, diff/patch review, editor and diagnostics context.
- **Limitations:** must not trust workspace config for security-sensitive settings; workspace content does not auto-sync to app chats.
- **Relationships:** bridges to Desktop; coding sessions separate from the chat store.
- **Synchronization:** workspace scoped; explicit handoff only.
- **Journeys:** in-editor chat/agent, reviewed edits, explicit handoff.

### 32. Browser Extension (Chrome)

- **Purpose:** the browser-side assistant: page context, page-action approvals, native bridge.
- **Capabilities:** Cloud only; page capture, ask/act under per-site permission, computer use under consent.
- **Limitations:** page data is task-scoped, not synced memory; its chats are an **isolated store**.
- **Relationships:** bridges to Desktop; not part of the shared chat store.
- **Synchronization:** none; isolated by design.
- **Journeys:** install/pair, per-site permission, page assistance and approved actions.

---

## Part VI — Platform Runtimes

The platform organizes intelligence into runtimes with clear **responsibilities**. This constitution establishes what each is for; it does **not** specify implementation (`AGI-PROD-0002` is served by these; specifications come later, after review).

- **AI Runtime** — orchestrates a request end-to-end: prompt assembly, model invocation, streaming, and result shaping under the active trust mode.
- **Intelligence Router** — selects model and route transparently and explainably by task, capability, cost, and trust mode; never substitutes silently (`AGI-AI-0002`).
- **Context Runtime** — assembles the right, minimal context (files, references, project knowledge) for a turn, respecting trust boundaries.
- **Memory Runtime** — owns saved/reference/project memory: capture, retrieval, and the rule that Local-origin memory never silently enters synced or global memory.
- **Session Runtime** — owns the lifecycle of conversations and sessions: creation, branching/forking, checkpoints, resume, and replay.
- **Agent Runtime** — runs multi-step, tool-using agents and subagents under plan, approval, and consent constraints.
- **Workflow Runtime** — coordinates scheduled tasks, dispatch, and multi-step automations across surfaces.
- **Tool Runtime** — exposes tools and MCP capabilities with schema validation, allowlisting, and per-capability gating; treats tool output as untrusted data.
- **Provider Runtime** — owns provider adapters and the canonical model catalog; normalizes provider differences behind one contract (`AGI-ARCH-0001`).
- **Execution Runtime** — runs code, computer use, and browser use inside bounded, policy-enforced environments under consent.
- **Synchronization Runtime** — owns delta sync of the shared cloud chat store across Web/Desktop/Mobile and enforces the sync boundary (`AGI-SYNC-0001`).
- **Storage Runtime** — owns local and cloud persistence with encryption, isolation, export, and deletion guarantees.
- **Security Runtime** — owns trust-boundary enforcement, egress control, secret protection, and approval gates; fail-closed by default.
- **Observability Runtime** — owns consent-gated telemetry, metrics, and audit, never capturing Local-origin content (`AGI-PRIV-0001`).
- **UX Runtime** — owns the shared conversation/composer/state model so every surface presents one coherent experience (`AGI-PROD-0001`).
- **Platform Runtime** — owns environment detection, capability gating, and the contracts that bind surfaces, services, and runtimes together.

Future runtime categories may be added by ADR when a responsibility genuinely lacks an owner — never to duplicate an existing one.

---

## Part VII — Canonical Terminology

These terms carry constitutional weight. Their **operational definitions and source citations** live in [canonical-glossary.md](canonical-glossary.md) (`AGI-DOC-0004`); here we fix their **enduring meaning**. The glossary inherits from this section.

- **Conversation** — the atomic unit of work and trust. Everything else (files, tools, artifacts) is a _state_ of a conversation.
- **Session** — a bounded run of activity over one or more conversations, with lifecycle (start, branch, checkpoint, resume, end).
- **Workspace** — the user's working context on a surface (its files, roots, and scope).
- **Project** — a durable grouping of instructions, knowledge, sources, memory, and provider defaults.
- **Memory** — durable, user-owned knowledge the system may recall; categorized and never silently crossing the trust boundary.
- **Context** — the minimal relevant information assembled for a turn.
- **Artifact** — a first-class generated output, versioned and rendered in isolation.
- **Experience** — a cross-surface product experience composed over the platform (e.g., AGI Chat, AGI Code, AGI Agent, AGI Research); never a standalone application (Part IV §25).
- **Capability** — a reusable building block from which Experiences are assembled, with exactly one owner (Part IV §25).
- **Feature** — the granular, individually ownable unit within a Capability, where requirements and tests attach (Part IV §25).
- **Cloud Services** — the AGI-managed backbone powering Cloud Mode (identity, billing, sync, gateway, signaling, compliance, control plane); absent in Local Mode (Part IV §25).
- **Workflow** — a coordinated, multi-step automation.
- **Execution** — the act of running inference, code, or actions under a trust mode and policy.
- **Checkpoint** — a restorable point in a session's history.
- **Snapshot** — an immutable capture of state at a moment.
- **Runtime** — an owner of a platform responsibility (Part VI).
- **Provider** — a source of model inference, treated as a route object, not a name.
- **Model** — a specific inference engine identified and described only via the canonical catalog (`AGI-AI-0001`).
- **Surface** — a client through which users access AGI (Part V).
- **Agent** — an AI actor that plans and uses tools under consent and approval.
- **Tool** — a bounded capability an agent or user can invoke; its output is untrusted data.
- **Task** — a unit of intended work.
- **Job** — a scheduled or background unit of execution.
- **Queue** — an ordered set of pending work.
- **Synchronization** — the governed propagation of state across the shared cloud chat store (`AGI-SYNC-0001`).
- **Local Mode** — the user-sovereign product, defined by **user-owned compute and user-owned storage**; on-device and BYOK are its execution strategies, not its definition; never requires AGI cloud inference or an AGI subscription (Part III §23).
- **Cloud Mode** — the AGI-managed product (Part III §24).
- **BYOK** — bringing the user's own provider key, routed directly to that provider, never through AGI cloud.

No load-bearing term may be used ambiguously. If a needed term is missing, it is added here (meaning) and to the glossary (operational definition) in the same change.

---

## Part VIII — Architectural Principles

1. **Separation of concerns** — Surfaces, Experiences, Capabilities, Features, Cloud Services, and Runtimes have distinct responsibilities.
2. **Layered architecture** — contracts beneath mechanics beneath orchestration beneath surfaces (`AGI-ARCH-0002`).
3. **Platform-first** — build shared platform capability, not per-surface silos.
4. **Provider-agnostic and model-agnostic** — no provider or model is structural (`AGI-AI-0001`).
5. **Extensibility and composability** — capabilities compose; the platform extends via open standards (e.g., MCP) and adapters.
6. **Modularity** — small, owned, boundaried modules over monoliths.
7. **Reliability and scalability** — graceful degradation, fail-closed safety, and managed scale as defaults.
8. **Security and privacy by construction** — boundaries enforced in code, not convention.
9. **Performance** — responsiveness and streaming are product features.
10. **Maintainability and testability** — clarity, evidence, and tests over cleverness.
11. **Observability** — consent-gated, content-safe instrumentation.
12. **Accessibility and consistency** — usable by everyone, coherent across surfaces.
13. **Explicitness over magic** — prefer clear contracts to hidden behavior.
14. **Composition over coupling** — prefer assembling capabilities to entangling them.

---

## Part IX — Product Principles (immutable)

1. **Never lock users into a single AI provider.**
2. **Always provide transparent, capability-aware model selection;** never substitute silently.
3. **Keep Local Mode independent;** it works fully without an AGI subscription and is never degraded to upsell Cloud.
4. **Cloud Mode provides convenience, not exclusivity.**
5. **Never silently cross a trust boundary;** Local→BYOK and Local→Cloud are explicit, reviewed forks (`AGI-TRUST-0002`).
6. **Privacy is the default;** local data stays local unless the user explicitly moves it.
7. **Tell the truth about capability, route, retention, and price.**
8. **One conversation, one coherent experience, every surface.**
9. **Every feature must justify its existence** against the immutable values.
10. **Every capability and runtime has exactly one clear owner.**
11. **Remove duplication;** prefer composition over coupling and explicitness over magic.
12. **Require human consent for irreversible, external, or expensive actions.**
13. **Documentation is canonical and implementation is its source of truth;** they change together.
14. **Earn monetization;** never sell managed capability that cannot be operated responsibly.

---

## Part X — Non-Goals

AGI will never intentionally become:

1. **A foundation-model company** — it does not train and sell frontier base models.
2. **An advertising platform** — it does not monetize attention or inject ads.
3. **A social network** — it has no feed, no follower graph, no engagement economy.
4. **A surveillance or data-broker platform** — it does not harvest, profile, or sell user data, and it does not capture Local-origin content.
5. **Vendor- or provider-locked** — it never makes one provider or model structurally required.
6. **A single-model experience** — it never reduces users to one lab's models.
7. **A walled garden for user data** — users can always export and delete; their data is theirs.
8. **A silent data-exfiltration channel** — no Local content leaves the device without explicit, reviewed consent.
9. **An unconsented autonomous actor** — it never takes irreversible, external, or high-impact actions without approval.
10. **A growth-at-all-costs or dark-pattern product** — it does not manipulate, trap, or deceive to drive metrics.
11. **A reckless cloud business** — it does not offer managed compute or credits before the controls to run them responsibly exist.
12. **A closed protocol** — it embraces open standards and interoperability rather than proprietary capture.
13. **An everything-app** — it stays focused on intelligence work, not unrelated consumer services.
14. **A benchmark-chasing lab** — it competes on trust, portability, and product, not leaderboard scores.

These non-goals are as binding as the goals. A proposal that moves AGI toward any of them is rejected regardless of short-term benefit.

---

## Part XI — Decision Rules

Every significant proposal — product, design, architecture, or code — must pass this constitutional test. A "no" on any guard requires either redesign or an explicit ADR that consciously and narrowly overrides it.

1. **Alignment** — Does this align with the vision, mission, and immutable values?
2. **Local Mode** — Does this preserve Local Mode's independence and privacy? Does it avoid degrading Local to upsell Cloud?
3. **Cloud Mode** — Does this keep Cloud Mode convenient without making it exclusive or provider-locked?
4. **Trust boundaries** — Does it avoid silently crossing any boundary? Are crossings explicit, consented, and labeled?
5. **Neutrality** — Does it keep AGI provider- and model-agnostic?
6. **Honesty** — Does it tell the truth about capability, route, retention, and price?
7. **Coupling** — Does it avoid introducing coupling; does it prefer composition?
8. **Extensibility & maintainability** — Does it keep the platform extensible and maintainable, with one clear owner?
9. **Developer experience** — Does it improve, or at least not harm, the experience of human and agent contributors?
10. **Durability** — Would this decision still make sense five — and ten — years from now?
11. **Non-goals** — Does it move AGI toward any non-goal in Part X? If so, it is rejected.

---

## Part XII — Authority and Amendment

### 33. Authority

This is the highest-level product authority in the repository. All current and future documents inherit from it ([master-documentation-index.md](master-documentation-index.md)). It is overridden only by:

1. **The actual implementation** on matters of present fact ([documentation-constitution.md](documentation-constitution.md) Article I); and
2. **Explicit ADRs** ([adr-index.md](adr-index.md)) on matters of intentional, recorded decision.

No feature, plan, README, or convenience may override it implicitly.

### 34. Amendment

This constitution is amended only by deliberate change: edit this document, bump `Last updated:`, and record the rationale and any new or retired requirement IDs in [adr-index.md](adr-index.md) and [requirement-id-system.md](requirement-id-system.md). The immutable values (§13), the core differentiators (§12), and the non-goals (Part X) carry the highest bar for amendment and are presumed permanent.

### 35. Relationship to the foundation

This constitution sits atop the documentation foundation: it supplies **identity and intent**; [architecture-manifest.md](architecture-manifest.md) supplies **structure**; [canonical-glossary.md](canonical-glossary.md) supplies **terms**; [requirement-id-system.md](requirement-id-system.md) supplies **requirements**; and [documentation-constitution.md](documentation-constitution.md) supplies the **rules for writing it all down**. Together they are the root every future document inherits from.

---

_This document defines what AGI is. Everything else defines how AGI keeps that promise._
