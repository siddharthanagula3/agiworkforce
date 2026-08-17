# ChatGPT/Claude-Class Cross-Platform Product Gap Audit

**Audit date:** 2026-08-15
**Commit audited:** `e15df56e3` (`compliance/dpdp`), working tree clean
**Scope:** Web · Mobile · Desktop (Tauri) · Desktop (Electron) · Chrome extension · VS Code extension · CLI · backend · shared packages

This is a **discovery** audit. No implementation was performed.

---

## Read this first

| If you want…                                   | Read                                                       |
| ---------------------------------------------- | ---------------------------------------------------------- |
| What to do, in order                           | **`PriorityExecutionPlan.md`**                             |
| Every gap, with evidence                       | **`GapMatrix.md`** (168 gaps, generated, not hand-written) |
| What this audit did **not** cover              | **`AuditCompleteness.md`**                                 |
| Why this audit exists alongside the older ones | `prior-art-reconciliation.md`                              |
| Two currently-red test suites found en route   | `gaps/red-test-suites.md`                                  |

## The twelve deliverables

| #   | Document                            | What it answers                                                      |
| --- | ----------------------------------- | -------------------------------------------------------------------- |
| 1   | `BenchmarkResearch.md`              | What ChatGPT and Claude actually ship today, per surface             |
| 2   | `CurrentProductInventory.md`        | Exactly what exists in this repo today                               |
| 3   | `ScreenInventory.md`                | Every screen that exists + every screen the benchmark implies        |
| 4   | `CapabilityMatrix.md`               | This product vs ChatGPT vs Claude, and whose design to study         |
| 5   | `SurfaceParityMatrix.md`            | Capability × surface, separating intentional divergence from drift   |
| 6   | `FrontendGapAudit.md`               | Layout, components, interaction, a11y, states, visual design         |
| 7   | `BackendGapAudit.md`                | Runtime, tools, agents, storage, sync, search, memory, security      |
| 8   | `GapMatrix.md`                      | The master inventory — every gap, severity, evidence, files          |
| 9   | `DeadAndDisconnectedCode.md`        | Mocked, unused, duplicated, unreachable — each with DELETE/WIRE/KEEP |
| 10  | `MissingScreensAndComponents.md`    | Absent screens, dialogs, menus, settings, components                 |
| 11  | `CrossPlatformArchitectureAudit.md` | Shared vs duplicated logic, wrong platform boundaries                |
| 12  | `PriorityExecutionPlan.md`          | The ordered plan                                                     |

Plus `AuditCompleteness.md` — a critique of this audit's own coverage.

## Evidence base

Everything above is synthesis. The primary evidence is:

| Directory    | Contents                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| `research/`  | 16 docs — 7 web-research on current competitor state, 9 teardowns of **288 real competitor UI screenshots** |
| `inventory/` | 12 docs — one per surface, plus live route sweeps and deployment/drift evidence                             |
| `gaps/`      | 16 domain analyses (`domain-*.md`) + their structured gaps (`domain-*.json`) + `done-claim-verification.md` |

`GapMatrix.md` is **generated deterministically** from `gaps/domain-*.json`. No model
rewrites it, so every filed gap appears verbatim. To change a row, change the
JSON and regenerate.

## Findings at a glance

**168 gaps** — 3 P0 · 45 P1 · 85 P2 · 35 P3.

The three P0s:

| ID                 | Surface         | Gap                                                                                       |
| ------------------ | --------------- | ----------------------------------------------------------------------------------------- |
| `AGENTIC-WORK-001` | Desktop (Tauri) | Background agents exist in Rust with 11 commands and 9 events, but no UI can control them |
| `VOICE-MEDIA-001`  | Desktop (Tauri) | Image and video generation absent from the composer                                       |
| `VOICE-MEDIA-002`  | Mobile          | Video generation delivery                                                                 |

P0+P1 concentration by surface: Desktop-Tauri 12 · cross-surface 11 · Web 8 ·
backend 7 · Mobile 4 · extensions 4 · CLI 1 · shared 1.

### The central architecture finding

**There is not one chat implementation. There are four.**
`@agiworkforce/unified-chat` is genuinely adopted by Desktop and by web's
_secondary_ routes, but web's _primary_ chat renders its own `WebChatPage.tsx`
(4,407 lines) with its own `MessageBubble.tsx` (2,254 lines vs the shared 924)
and `ChatComposerNew.tsx` (3,621 vs 1,422). Mobile is independent for a sound
reason. The Chrome extension hand-mirrors the shared component in vanilla DOM.

This is already costing features, measurably: large-paste-to-attachment
conversion and Library reuse exist **only on mobile**; Desktop's composer has
**no image/video generation mode**; six composer controls are missing from the
Chrome extension.

### What is genuinely strong

An audit that only lists deficits misleads prioritisation. Verified strengths:

- **Chrome extension** — ~35,000 lines, CDP browser automation, **1,549/1,549
  tests passing**, no `TODO`/`FIXME` strings in `src/`, and a Managed-Cloud
  provenance boundary **enforced in code with fail-closed semantics**, not just
  documented.
- **Web chat-completions runtime** — real provider failover, fail-closed
  per-tool approval checkpoints, durable resume, context compaction, per-plan
  concurrency governance. No route was found returning fake data as real.
- **Desktop trust boundary** — one `derive_cloud_sync_enabled()` gate reused
  verbatim across chat, memory and projects, with regression tests.
- **Mobile memory** — local SQLite and cloud MMKV physically isolated, with
  UUIDv7 + compare-and-swap + tombstones and prompt-injection fencing.
- **Production security posture** — nonce-based CSP with no `unsafe-inline` on
  scripts, `frame-ancestors 'none'`, HSTS preload.

## Method, and its limits

Each gap was filed by an analyst that read the benchmark evidence, read the repo
inventory, and then **verified the claim in code** before filing. Inventory docs
were treated as secondary sources, not ground truth.

**This audit corrected itself twice, and both corrections are recorded rather
than quietly fixed:**

1. _"The product is not publicly reachable, there is no custom domain."_
   **Wrong** — `agiworkforce.com` is live and public. The error came from
   reading one Vercel project's `domains` array and treating absence as proof.
2. _"Three sign-in routes and three sign-up routes, none canonical."_
   **Wrong** — they are intentional `redirect()` aliases. `curl -L` reports the
   final status, and a Server Component `redirect()` does not always surface as
   an HTTP 3xx, so an alias and a real page look identical to a probe.

The generalisable lesson, now recorded in `inventory/web-route-sweep-findings.md`:
**an HTTP status code is a lead, never a finding.** The same probe also read
Vercel SSO interstitials as working pages.

Known coverage limits are in `AuditCompleteness.md`. The largest: **no
authenticated session was ever driven**, so every product route was observed
only redirecting to `/login`; dynamic routes were never exercised; and the CLI
received only a light pass.

## Relationship to prior audits

This repo was already audited. `audit/ui-gaps.csv` (341 rows),
`audit/capability-gaps.csv` (52), `docs/current/gap-audit-2026-08-08.md`, and
`docs/current/parity-implementation-matrix.md` all predate this.

This audit deliberately **does not re-derive** the 197 open screenshot-diff UI
rows. It targets that tracker's structural blind spots — backend runtime,
cross-surface parity, shared-architecture drift, and dead code, none of which
its UI-shaped gap vocabulary can express — and it **verified all 71 of its
`Done` claims**: 62 confirmed, 4 partial, 3 regressed, 2 not done, with 0 of 9
challenges refuted. See `gaps/done-claim-verification.md`.

25 of this audit's 168 gaps cross-reference an existing `GAP-xxx` id rather than
duplicating it.
