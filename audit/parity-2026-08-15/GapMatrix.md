# GapMatrix — master gap inventory

**Audit date:** 2026-08-15 · **Commit:** `e15df56e3` (`compliance/dpdp`), working tree clean

This file is **generated deterministically** from the per-domain gap files in
`audit/parity-2026-08-15/gaps/domain-*.json` by
`scripts` in the audit scratchpad. No model rewrites it, so every filed gap
appears here verbatim. To change a row, change its domain JSON and regenerate.

Each gap was filed by a domain analyst that read the benchmark evidence in
`research/`, read the repo inventory in `inventory/`, and then **verified the
claim in code** before filing. Rows carrying a `Prior art` id were already
tracked in `audit/ui-gaps.csv` and are cross-referenced rather than duplicated.

## Totals

**168 gaps** across 16 domains and 10 surfaces.

| Severity | Count | Meaning                                                                            |
| -------- | ----: | ---------------------------------------------------------------------------------- |
| **P0**   |     3 | Blocks a primary workflow or makes the product unsuitable for a serious demo       |
| **P1**   |    45 | Major parity gap — functionality expected of a modern ChatGPT/Claude-class product |
| **P2**   |    85 | Product-quality gap — works, but below the benchmark                               |
| **P3**   |    35 | Enhancement, optimization or differentiation                                       |

> **Scoping note on the P0 count.** These counts cover gaps filed by _this_
> audit round's 16 domain analysts. They deliberately exclude P0s already
> tracked elsewhere and not re-derived here — notably **`GAP-P0-003`**
> ("production promotion has no successful proof for the current head") from
> `docs/current/gap-audit-2026-08-08.md`, which this round independently
> re-confirmed with fresh evidence in `inventory/deployment-state.md` and
> `inventory/prod-vs-source-drift.md`. Read this table as "new P0s found by
> this round", not "all P0s open against the product".

### By surface

| Surface            | Gaps |  P0 |  P1 |  P2 |  P3 |
| ------------------ | ---: | --: | --: | --: | --: |
| Web                |   45 |   0 |   8 |  24 |  13 |
| Desktop (Tauri)    |   31 |   2 |  10 |  15 |   4 |
| Cross-surface      |   29 |   0 |  11 |  14 |   4 |
| Backend            |   22 |   0 |   7 |  12 |   3 |
| Mobile             |   14 |   1 |   3 |   7 |   3 |
| Shared packages    |   11 |   0 |   1 |   5 |   5 |
| Chrome extension   |    8 |   0 |   2 |   3 |   3 |
| CLI                |    3 |   0 |   1 |   2 |   0 |
| Desktop (Electron) |    3 |   0 |   0 |   3 |   0 |
| VS Code extension  |    2 |   0 |   2 |   0 |   0 |

### By gap type

| Gap type               | Count |
| ---------------------- | ----: |
| dead-code              |    36 |
| missing-capability     |    25 |
| architecture-gap       |    22 |
| ux-gap                 |    15 |
| reliability-gap        |    14 |
| broken-workflow        |    13 |
| partial-implementation |    12 |
| backend-gap            |    10 |
| parity-gap             |     7 |
| security-gap           |     4 |
| frontend-gap           |     3 |
| integration-gap        |     3 |
| visual-gap             |     3 |
| performance-gap        |     1 |

### By domain

| Domain                                                   | Gaps |  P0 |  P1 |  P2 |  P3 |
| -------------------------------------------------------- | ---: | --: | --: | --: | --: |
| Agentic work & scheduled tasks                           |    7 |   1 |   5 |   1 |   0 |
| Artifacts & creation workspaces                          |    8 |   0 |   1 |   4 |   3 |
| Backend & runtime architecture                           |   13 |   0 |   2 |   7 |   4 |
| Composer                                                 |    8 |   0 |   3 |   3 |   2 |
| Cross-surface parity & shared architecture               |   15 |   0 |   3 |   8 |   4 |
| Dead, disconnected code & reliability                    |   23 |   0 |   3 |  14 |   6 |
| Design system & accessibility                            |   12 |   0 |   3 |   8 |   1 |
| Skills, plugins & connectors                             |    8 |   0 |   4 |   4 |   0 |
| Memory & personalization                                 |   10 |   0 |   2 |   5 |   3 |
| Models & reasoning                                       |    7 |   0 |   2 |   4 |   1 |
| Projects, files & library                                |    8 |   0 |   2 |   4 |   2 |
| Message rendering & response actions                     |   12 |   0 |   5 |   5 |   2 |
| Search & deep research                                   |    6 |   0 |   2 |   3 |   1 |
| Settings                                                 |   12 |   0 |   1 |   9 |   2 |
| Application shell, navigation & information architecture |    7 |   0 |   3 |   2 |   2 |
| Voice, image & video                                     |   12 |   2 |   4 |   4 |   2 |

### Cross-referenced with prior art

29 of 168 gaps correspond to a row already tracked in
`audit/ui-gaps.csv`. They are recorded here with their existing id so the two
ledgers stay reconcilable rather than diverging.

| Gap                   | Prior art                                | Title                                                                                             |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `MEMORY-008`          | `CAP-006`                                | Memory suppression is content-term only, not source-scoped                                        |
| `EXTENSIBILITY-008`   | `CAP-009`                                | Organization skill/plugin governance                                                              |
| `MEMORY-001`          | `CAP-027`                                | Project memory tab shows/writes the wrong (global) memory store                                   |
| `MEMORY-004`          | `CAP-027`                                | Project-scoped memory                                                                             |
| `SEARCH-RESEARCH-001` | `CAP-045`                                | Deep Research — Anthropic/free-trial fallback path                                                |
| `SEARCH-RESEARCH-002` | `CAP-045`                                | Deep Research progress/plan UI and persisted report retrieval                                     |
| `SEARCH-RESEARCH-003` | `CAP-045`                                | Deep Research connected-data / connector integration                                              |
| `VOICE-MEDIA-012`     | `DESKTOP-SYSTEM-DICTATION-UNWIRED-01`    | voice_inject_text hardening                                                                       |
| `VOICE-MEDIA-005`     | `DESKTOP-VOICE-CONVERSATIONS-UNWIRED-01` | Composer-integrated voice conversation (orb overlay, listen→transcribe→LLM→speak)                 |
| `EXTENSIBILITY-001`   | `GAP-001`                                | Skills catalog navigation                                                                         |
| `SHELL-NAV-IA-003`    | `GAP-001`                                | Skills navigation entry point                                                                     |
| `SETTINGS-011`        | `GAP-006`                                | Cowork/Dispatch settings breadth                                                                  |
| `PROJECTS-FILES-007`  | `GAP-020`                                | Library has no 'reuse this file in a new conversation' action on web/desktop                      |
| `EXTENSIBILITY-002`   | `GAP-083`                                | Connectors/MCP settings information architecture                                                  |
| `SHELL-NAV-IA-002`    | `GAP-083`                                | Desktop Settings navigation naming                                                                |
| `SETTINGS-008`        | `GAP-115`                                | Passkey / WebAuthn and SMS-based multi-factor authentication                                      |
| `SETTINGS-012`        | `GAP-119`                                | Notification category breadth                                                                     |
| `EXTENSIBILITY-007`   | `GAP-122`                                | Skills/Plugins/Connectors surface                                                                 |
| `AGENTIC-WORK-007`    | `GAP-168`                                | Scheduled task execution has no tool access                                                       |
| `SHELL-NAV-IA-004`    | `GAP-210`                                | Desktop-to-Mobile pairing instructions naming                                                     |
| `CROSS-SURFACE-007`   | `GAP-210`                                | Desktop-companion pairing instructions do not match Mobile's real navigation labels               |
| `ARTIFACTS-007`       | `GAP-227`                                | Keyboard shortcut to toggle the Artifacts panel                                                   |
| `DESIGN-SYSTEM-009`   | `GAP-275`                                | Dedicated accessibility component directory is entirely dead code, including a mocked audit panel |
| `SETTINGS-007`        | `GAP-275`                                | Accent color and contrast controls                                                                |
| `AGENTIC-WORK-004`    | `GAP-P0-007`                             | Scheduled task recurrence cadence                                                                 |
| `VOICE-MEDIA-009`     | `GAP-P0-008`                             | Managed audio transcription usage settlement                                                      |
| `ARTIFACTS-005`       | `GAP-P0-009`                             | AI-powered / model-calling artifacts                                                              |
| `AGENTIC-WORK-006`    | `P2-001`                                 | Standalone Cowork/workspace product surface                                                       |
| `VOICE-MEDIA-004`     | `P2-003`                                 | Full-duplex conversational voice                                                                  |

## Index — all gaps by severity

| ID                                            | Sev | Surface            | Feature                                                                                                                                                                                                                     | Type                   |
| --------------------------------------------- | --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| [`AGENTIC-WORK-001`](#agentic-work-001)       | P0  | Desktop (Tauri)    | Background agents (push-to-background, pause/resume/cancel/take-over)                                                                                                                                                       | dead-code              |
| [`VOICE-MEDIA-001`](#voice-media-001)         | P0  | Desktop (Tauri)    | Image and video generation in chat                                                                                                                                                                                          | architecture-gap       |
| [`VOICE-MEDIA-002`](#voice-media-002)         | P0  | Mobile             | Video generation delivery                                                                                                                                                                                                   | broken-workflow        |
| [`AGENTIC-WORK-002`](#agentic-work-002)       | P1  | Web                | Web Tasks entry point auth gating                                                                                                                                                                                           | broken-workflow        |
| [`AGENTIC-WORK-003`](#agentic-work-003)       | P1  | Web                | Durable background execution for AGI Work turns                                                                                                                                                                             | reliability-gap        |
| [`AGENTIC-WORK-004`](#agentic-work-004)       | P1  | Backend            | Scheduled task recurrence cadence                                                                                                                                                                                           | backend-gap            |
| [`AGENTIC-WORK-005`](#agentic-work-005)       | P1  | Cross-surface      | Mid-run steering of an active AGI Work / Cloud agent run                                                                                                                                                                    | ux-gap                 |
| [`AGENTIC-WORK-007`](#agentic-work-007)       | P1  | Backend            | Scheduled task execution has no tool access                                                                                                                                                                                 | backend-gap            |
| [`ARTIFACTS-001`](#artifacts-001)             | P1  | Cross-surface      | Cross-device artifact sync (Web → Cloud)                                                                                                                                                                                    | backend-gap            |
| [`BACKEND-RUNTIME-001`](#backend-runtime-001) | P1  | Web                | Managed Code (Cloud Code) agent-turn execution                                                                                                                                                                              | broken-workflow        |
| [`BACKEND-RUNTIME-009`](#backend-runtime-009) | P1  | CLI                | CLI command sandboxing — no OS-level sandbox on Windows                                                                                                                                                                     | reliability-gap        |
| [`COMPOSER-001`](#composer-001)               | P1  | Cross-surface      | Composer architecture — four independent implementations                                                                                                                                                                    | architecture-gap       |
| [`COMPOSER-002`](#composer-002)               | P1  | Web                | Large-paste-to-attachment conversion                                                                                                                                                                                        | frontend-gap           |
| [`COMPOSER-004`](#composer-004)               | P1  | Desktop (Tauri)    | Image and video generation mode                                                                                                                                                                                             | missing-capability     |
| [`CROSS-SURFACE-001`](#cross-surface-001)     | P1  | Web                | Primary chat surface bypasses the shared chat UI package                                                                                                                                                                    | architecture-gap       |
| [`CROSS-SURFACE-005`](#cross-surface-005)     | P1  | Cross-surface      | Article 50 AI-generated-content provenance marker is broken between surfaces and inconsistently applied                                                                                                                     | integration-gap        |
| [`CROSS-SURFACE-006`](#cross-surface-006)     | P1  | VS Code extension  | Local/BYOK/Managed-Cloud trust-boundary regression tests are currently red                                                                                                                                                  | reliability-gap        |
| [`DEAD-CODE-001`](#dead-code-001)             | P1  | Desktop (Tauri)    | Desktop "teams" feature slice is fully orphaned, and the durable-defects ledger itself is stale and actively blocks its cleanup                                                                                             | dead-code              |
| [`DEAD-CODE-002`](#dead-code-002)             | P1  | Desktop (Tauri)    | ~180 files across ~30 desktop feature directories are built but never mounted by App.tsx / DesktopShellV3 — a second, larger dead-code body beyond the already-known apps/desktop/archive/                                  | dead-code              |
| [`DEAD-CODE-005`](#dead-code-005)             | P1  | Backend            | Organization-invitation expiry cron exists, is fully implemented, and is never scheduled — paid seats held by lapsed invitations are never released automatically                                                           | reliability-gap        |
| [`DESIGN-SYSTEM-001`](#design-system-001)     | P1  | VS Code extension  | VS Code design-token CI guard is currently red on a false positive                                                                                                                                                          | broken-workflow        |
| [`DESIGN-SYSTEM-002`](#design-system-002)     | P1  | Cross-surface      | Shared component library (@agiworkforce/ui) does not reach the two extension surfaces                                                                                                                                       | architecture-gap       |
| [`DESIGN-SYSTEM-003`](#design-system-003)     | P1  | Cross-surface      | Automated accessibility CI gates cover only unauthenticated/pre-product screens                                                                                                                                             | reliability-gap        |
| [`EXTENSIBILITY-001`](#extensibility-001)     | P1  | Mobile             | Skills catalog navigation                                                                                                                                                                                                   | broken-workflow        |
| [`EXTENSIBILITY-002`](#extensibility-002)     | P1  | Desktop (Tauri)    | Connectors/MCP settings information architecture                                                                                                                                                                            | architecture-gap       |
| [`EXTENSIBILITY-003`](#extensibility-003)     | P1  | Desktop (Tauri)    | MCP server slopsquatting allow-list                                                                                                                                                                                         | security-gap           |
| [`EXTENSIBILITY-004`](#extensibility-004)     | P1  | Cross-surface      | Automatic (progressive-disclosure) skill invocation                                                                                                                                                                         | missing-capability     |
| [`MEMORY-001`](#memory-001)                   | P1  | Desktop (Tauri)    | Project memory tab shows/writes the wrong (global) memory store                                                                                                                                                             | broken-workflow        |
| [`MEMORY-002`](#memory-002)                   | P1  | Web                | Search and reference past chats                                                                                                                                                                                             | missing-capability     |
| [`MODELS-001`](#models-001)                   | P1  | Desktop (Tauri)    | Reasoning-effort / extended-thinking control                                                                                                                                                                                | partial-implementation |
| [`MODELS-002`](#models-002)                   | P1  | Backend            | Workspace/organization model access policy                                                                                                                                                                                  | backend-gap            |
| [`PROJECTS-FILES-001`](#projects-files-001)   | P1  | Backend            | Project knowledge file parsing (spreadsheets, Office documents)                                                                                                                                                             | missing-capability     |
| [`PROJECTS-FILES-007`](#projects-files-007)   | P1  | Shared packages    | Library has no 'reuse this file in a new conversation' action on web/desktop                                                                                                                                                | parity-gap             |
| [`RENDERING-001`](#rendering-001)             | P1  | Cross-surface      | Markdown rendering engine                                                                                                                                                                                                   | architecture-gap       |
| [`RENDERING-002`](#rendering-002)             | P1  | Chrome extension   | Markdown rendering — tables, images, math, syntax highlighting                                                                                                                                                              | partial-implementation |
| [`RENDERING-004`](#rendering-004)             | P1  | Desktop (Tauri)    | Response actions — feedback, edit, share, read aloud, branch, report                                                                                                                                                        | dead-code              |
| [`RENDERING-005`](#rendering-005)             | P1  | Chrome extension   | Response actions                                                                                                                                                                                                            | missing-capability     |
| [`RENDERING-006`](#rendering-006)             | P1  | Desktop (Tauri)    | Code execution output rendering                                                                                                                                                                                             | broken-workflow        |
| [`SEARCH-RESEARCH-001`](#search-research-001) | P1  | Backend            | Deep Research — Anthropic/free-trial fallback path                                                                                                                                                                          | partial-implementation |
| [`SEARCH-RESEARCH-002`](#search-research-002) | P1  | Cross-surface      | Deep Research progress/plan UI and persisted report retrieval                                                                                                                                                               | integration-gap        |
| [`SETTINGS-001`](#settings-001)               | P1  | Web                | Primary Settings entry point (collapsed sidebar rail)                                                                                                                                                                       | broken-workflow        |
| [`SHELL-NAV-IA-001`](#shell-nav-ia-001)       | P1  | Web                | Route-level auth gating for /tasks                                                                                                                                                                                          | broken-workflow        |
| [`SHELL-NAV-IA-003`](#shell-nav-ia-003)       | P1  | Mobile             | Skills navigation entry point                                                                                                                                                                                               | dead-code              |
| [`SHELL-NAV-IA-004`](#shell-nav-ia-004)       | P1  | Cross-surface      | Desktop-to-Mobile pairing instructions naming                                                                                                                                                                               | broken-workflow        |
| [`VOICE-MEDIA-003`](#voice-media-003)         | P1  | Backend            | Video generation reliability for abandoned jobs                                                                                                                                                                             | reliability-gap        |
| [`VOICE-MEDIA-004`](#voice-media-004)         | P1  | Cross-surface      | Full-duplex conversational voice                                                                                                                                                                                            | missing-capability     |
| [`VOICE-MEDIA-005`](#voice-media-005)         | P1  | Desktop (Tauri)    | Composer-integrated voice conversation (orb overlay, listen→transcribe→LLM→speak)                                                                                                                                           | dead-code              |
| [`VOICE-MEDIA-006`](#voice-media-006)         | P1  | Mobile             | EU AI Act Article 50(2) disclosure accuracy                                                                                                                                                                                 | security-gap           |
| [`AGENTIC-WORK-006`](#agentic-work-006)       | P2  | Cross-surface      | Standalone Cowork/workspace product surface                                                                                                                                                                                 | architecture-gap       |
| [`ARTIFACTS-002`](#artifacts-002)             | P2  | Desktop (Tauri)    | Publish artifact to a public link                                                                                                                                                                                           | missing-capability     |
| [`ARTIFACTS-003`](#artifacts-003)             | P2  | Cross-surface      | Direct manual editing of artifact content                                                                                                                                                                                   | ux-gap                 |
| [`ARTIFACTS-004`](#artifacts-004)             | P2  | Mobile             | Artifact version history and publish-to-link on mobile                                                                                                                                                                      | partial-implementation |
| [`ARTIFACTS-005`](#artifacts-005)             | P2  | Cross-surface      | AI-powered / model-calling artifacts                                                                                                                                                                                        | missing-capability     |
| [`BACKEND-RUNTIME-002`](#backend-runtime-002) | P2  | Backend            | services/api-gateway vs apps/web API route duplication                                                                                                                                                                      | architecture-gap       |
| [`BACKEND-RUNTIME-003`](#backend-runtime-003) | P2  | Desktop (Tauri)    | Desktop cloud-sync client — duplicate implementations, one dead                                                                                                                                                             | dead-code              |
| [`BACKEND-RUNTIME-004`](#backend-runtime-004) | P2  | Backend            | Device pairing — two parallel, near-identical auth flows                                                                                                                                                                    | architecture-gap       |
| [`BACKEND-RUNTIME-005`](#backend-runtime-005) | P2  | Backend            | Organization invitation expiry cron                                                                                                                                                                                         | reliability-gap        |
| [`BACKEND-RUNTIME-006`](#backend-runtime-006) | P2  | Backend            | No vector storage / retrieval backend; embeddings endpoint has zero internal callers                                                                                                                                        | backend-gap            |
| [`BACKEND-RUNTIME-010`](#backend-runtime-010) | P2  | CLI                | Linux seccomp sandbox built and tested but not shipped                                                                                                                                                                      | reliability-gap        |
| [`BACKEND-RUNTIME-011`](#backend-runtime-011) | P2  | CLI                | CI never runs the full Rust workspace test suite                                                                                                                                                                            | reliability-gap        |
| [`COMPOSER-003`](#composer-003)               | P2  | Web                | Attach from Library (reuse a previously-uploaded or generated file)                                                                                                                                                         | missing-capability     |
| [`COMPOSER-005`](#composer-005)               | P2  | Web                | Follow-up message queue capacity and editing                                                                                                                                                                                | partial-implementation |
| [`COMPOSER-006`](#composer-006)               | P2  | Mobile             | Follow-up message queue while streaming                                                                                                                                                                                     | broken-workflow        |
| [`CROSS-SURFACE-002`](#cross-surface-002)     | P2  | Chrome extension   | Composer hand-mirrors the shared ChatInput instead of importing it, and has already drifted                                                                                                                                 | partial-implementation |
| [`CROSS-SURFACE-003`](#cross-surface-003)     | P2  | Desktop (Electron) | Electron IPC bridge and deep-link SSO are dead in the shipped default configuration                                                                                                                                         | dead-code              |
| [`CROSS-SURFACE-004`](#cross-surface-004)     | P2  | Desktop (Electron) | Local/Cloud mode toggle silently no-ops instead of disabling itself when Local mode is unavailable                                                                                                                          | ux-gap                 |
| [`CROSS-SURFACE-007`](#cross-surface-007)     | P2  | Cross-surface      | Desktop-companion pairing instructions do not match Mobile's real navigation labels                                                                                                                                         | ux-gap                 |
| [`CROSS-SURFACE-008`](#cross-surface-008)     | P2  | Backend            | services/api-gateway's REST surface duplicates apps/web's Next.js API routes with unclear live ownership                                                                                                                    | architecture-gap       |
| [`CROSS-SURFACE-010`](#cross-surface-010)     | P2  | Cross-surface      | Model retirement/migration logic is reimplemented per-surface instead of centralized                                                                                                                                        | architecture-gap       |
| [`CROSS-SURFACE-012`](#cross-surface-012)     | P2  | Cross-surface      | Design-token package exists but both of its heaviest adopters routinely bypass it with hardcoded hex colors                                                                                                                 | visual-gap             |
| [`CROSS-SURFACE-014`](#cross-surface-014)     | P2  | Shared packages    | packages/ai/agent-core is a thin context/memory utility, not a shared agent runtime -- the real planning/tool-loop/approval logic has zero cross-surface parity test                                                        | architecture-gap       |
| [`DEAD-CODE-003`](#dead-code-003)             | P2  | Desktop (Tauri)    | A superseded parallel MCP management UI (~2,000 lines) sits in the same directory as the live MCPWorkspace                                                                                                                  | dead-code              |
| [`DEAD-CODE-004`](#dead-code-004)             | P2  | Desktop (Tauri)    | The typed apps/desktop/src/api/\*.ts wrapper layer is largely bypassed by direct invoke() calls, leaving ~15-20 wrapper modules as dead files                                                                               | architecture-gap       |
| [`DEAD-CODE-006`](#dead-code-006)             | P2  | Backend            | 9 legacy DB tables kept alive only for GDPR/DPDP erasure, 2 fully dead tables with zero references, and a written-but-founder-gated drop migration                                                                          | dead-code              |
| [`DEAD-CODE-007`](#dead-code-007)             | P2  | Web                | A legacy apps/web/shared/ design-system + type layer (~100+ files) sits dead alongside the live packages/ui/ui + apps/web/lib/ stack, including remnants of an earlier 'AI employee marketplace' product concept            | dead-code              |
| [`DEAD-CODE-008`](#dead-code-008)             | P2  | Web                | A second, orphaned 'share a conversation' backend duplicates the live one                                                                                                                                                   | dead-code              |
| [`DEAD-CODE-009`](#dead-code-009)             | P2  | Web                | A materially complete conversation-export feature (multi-format: Markdown/PDF/DOCX) and the wider v3-shell/UnifiedChatPage cascade it lives inside are fully built and totally unreachable                                  | dead-code              |
| [`DEAD-CODE-012`](#dead-code-012)             | P2  | Desktop (Tauri)    | hooks*\* (12 commands) and background_agent*\* control commands (11) are fully implemented Rust subsystems with zero frontend callers                                                                                       | backend-gap            |
| [`DEAD-CODE-013`](#dead-code-013)             | P2  | Desktop (Tauri)    | ~1,777 lines of Discord/Signal/Telegram/WhatsApp messaging client code and a full Gmail OAuth2 flow are fully implemented with zero frontend callers                                                                        | backend-gap            |
| [`DEAD-CODE-014`](#dead-code-014)             | P2  | Desktop (Tauri)    | Two duplicated backend subsystems: settings*v2*\_ (fully-migrated parallel settings store, unused) and checkpoint\_\_ (conversation checkpoints, unused, duplicating the live coding*checkpoint*\* system)                  | dead-code              |
| [`DEAD-CODE-015`](#dead-code-015)             | P2  | Desktop (Electron) | Global-shortcut customization is fully built (persistence + validation) but has zero callers; the tray-menu refresh function is likewise dead; the entire Electron IPC bridge is inert in the default shipped configuration | dead-code              |
| [`DEAD-CODE-016`](#dead-code-016)             | P2  | Mobile             | An entire built-and-tested edge-case UX library (battery/thermal/storage/model-loading/file-error modals) has zero import sites and no sensor ever triggers it                                                              | dead-code              |
| [`DEAD-CODE-019`](#dead-code-019)             | P2  | Shared packages    | Two self-documented unwired-by-design packages (@agiworkforce/browser-tool, @agiworkforce/licensing) plus an independent, unverified-parity Rust mirror of the licensing package                                            | dead-code              |
| [`DEAD-CODE-020`](#dead-code-020)             | P2  | Cross-surface      | A duplicated EU AI Act provenance-marker implementation has a real serialization bug that breaks cross-surface interoperability                                                                                             | broken-workflow        |
| [`DEAD-CODE-023`](#dead-code-023)             | P2  | Desktop (Tauri)    | wiring-allowlist.json's self-tracked ~58 registeredWithoutReachableCaller commands — re-verification of an already-known, self-documented lead                                                                              | backend-gap            |
| [`DESIGN-SYSTEM-004`](#design-system-004)     | P2  | Web                | apps/web's own no-hardcoded-color guard is not wired into CI and is currently failing                                                                                                                                       | dead-code              |
| [`DESIGN-SYSTEM-005`](#design-system-005)     | P2  | Mobile             | Mobile's no-hardcoded-color guard and 640-entry baseline are not wired into CI                                                                                                                                              | dead-code              |
| [`DESIGN-SYSTEM-006`](#design-system-006)     | P2  | Web                | Chat-response format cards inject un-tokenized rainbow gradients per card type                                                                                                                                              | visual-gap             |
| [`DESIGN-SYSTEM-007`](#design-system-007)     | P2  | Web                | Chat top bar uses an off-palette purple/blue gradient CTA and raw Tailwind grays                                                                                                                                            | visual-gap             |
| [`DESIGN-SYSTEM-008`](#design-system-008)     | P2  | Web                | Shared EmptyState primitive is barely adopted; duplicates regress its own documented contrast fix                                                                                                                           | partial-implementation |
| [`DESIGN-SYSTEM-009`](#design-system-009)     | P2  | Web                | Dedicated accessibility component directory is entirely dead code, including a mocked audit panel                                                                                                                           | dead-code              |
| [`DESIGN-SYSTEM-010`](#design-system-010)     | P2  | Mobile             | No automated accessibility testing; roughly half of touch targets lack an accessibility label                                                                                                                               | reliability-gap        |
| [`DESIGN-SYSTEM-011`](#design-system-011)     | P2  | Mobile             | Reduced-motion preference is respected in only 2 of 23 animation-driving files                                                                                                                                              | partial-implementation |
| [`EXTENSIBILITY-005`](#extensibility-005)     | P2  | Desktop (Tauri)    | Cloud skill install path                                                                                                                                                                                                    | broken-workflow        |
| [`EXTENSIBILITY-006`](#extensibility-006)     | P2  | Web                | Connector catalog default connectivity                                                                                                                                                                                      | backend-gap            |
| [`EXTENSIBILITY-007`](#extensibility-007)     | P2  | Chrome extension   | Skills/Plugins/Connectors surface                                                                                                                                                                                           | missing-capability     |
| [`EXTENSIBILITY-008`](#extensibility-008)     | P2  | Backend            | Organization skill/plugin governance                                                                                                                                                                                        | architecture-gap       |
| [`MEMORY-003`](#memory-003)                   | P2  | Cross-surface      | Import memory from other AI providers                                                                                                                                                                                       | parity-gap             |
| [`MEMORY-004`](#memory-004)                   | P2  | Web                | Project-scoped memory                                                                                                                                                                                                       | architecture-gap       |
| [`MEMORY-005`](#memory-005)                   | P2  | Backend            | Memory search uses substring matching, not semantic similarity                                                                                                                                                              | performance-gap        |
| [`MEMORY-006`](#memory-006)                   | P2  | Web                | Memory settings surface lacks search, pin, and summary controls Mobile already has                                                                                                                                          | frontend-gap           |
| [`MEMORY-008`](#memory-008)                   | P2  | Web                | Memory suppression is content-term only, not source-scoped                                                                                                                                                                  | missing-capability     |
| [`MODELS-003`](#models-003)                   | P2  | Web                | Context-window usage visibility                                                                                                                                                                                             | ux-gap                 |
| [`MODELS-004`](#models-004)                   | P2  | Web                | Provider-outage / fallback transparency                                                                                                                                                                                     | integration-gap        |
| [`MODELS-005`](#models-005)                   | P2  | Shared packages    | Ultra / Pro reasoning modes and reasoning-dots capability metadata                                                                                                                                                          | missing-capability     |
| [`MODELS-006`](#models-006)                   | P2  | Web                | Retired-model conversation migration notice                                                                                                                                                                                 | ux-gap                 |
| [`PROJECTS-FILES-002`](#projects-files-002)   | P2  | Backend            | Project knowledge context budget: silent truncation, no capacity indicator                                                                                                                                                  | reliability-gap        |
| [`PROJECTS-FILES-003`](#projects-files-003)   | P2  | Web                | Projects hub: search and Create disappear outside the default sort                                                                                                                                                          | ux-gap                 |
| [`PROJECTS-FILES-004`](#projects-files-004)   | P2  | Web                | Two drifted, non-overlapping project-creation quick-start UIs                                                                                                                                                               | architecture-gap       |
| [`PROJECTS-FILES-005`](#projects-files-005)   | P2  | Web                | Library 'Uploaded' filter copy contradicts a real, live upload-cataloging pipeline                                                                                                                                          | ux-gap                 |
| [`RENDERING-003`](#rendering-003)             | P2  | Mobile             | Markdown rendering — nested lists and table cell formatting                                                                                                                                                                 | partial-implementation |
| [`RENDERING-007`](#rendering-007)             | P2  | Cross-surface      | File diff rendering                                                                                                                                                                                                         | missing-capability     |
| [`RENDERING-008`](#rendering-008)             | P2  | Cross-surface      | Citation / source card UX                                                                                                                                                                                                   | ux-gap                 |
| [`RENDERING-009`](#rendering-009)             | P2  | Cross-surface      | Branch / fork conversation UI                                                                                                                                                                                               | parity-gap             |
| [`RENDERING-010`](#rendering-010)             | P2  | Web                | Rich message card detection architecture                                                                                                                                                                                    | architecture-gap       |
| [`SEARCH-RESEARCH-003`](#search-research-003) | P2  | Backend            | Deep Research connected-data / connector integration                                                                                                                                                                        | missing-capability     |
| [`SEARCH-RESEARCH-004`](#search-research-004) | P2  | Backend            | Semantic/vector search across chats, memory, and project knowledge                                                                                                                                                          | architecture-gap       |
| [`SEARCH-RESEARCH-005`](#search-research-005) | P2  | Chrome extension   | Manual web-search activation in the Chrome extension side panel                                                                                                                                                             | missing-capability     |
| [`SETTINGS-002`](#settings-002)               | P2  | Desktop (Tauri)    | Per-conversation model routing (temperature, max tokens, task routing, favorite models, default provider)                                                                                                                   | dead-code              |
| [`SETTINGS-003`](#settings-003)               | P2  | Desktop (Tauri)    | Window/session-behavior settings (startup position, dock side, chat storage mode, feature flags, send-key shortcut)                                                                                                         | dead-code              |
| [`SETTINGS-004`](#settings-004)               | P2  | Desktop (Tauri)    | Agent-task checkpointing and auto-resume-on-restart                                                                                                                                                                         | partial-implementation |
| [`SETTINGS-005`](#settings-005)               | P2  | Shared packages    | Shared unified-chat settings store — inline visualizations, tool-access mode, and three notification toggles                                                                                                                | dead-code              |
| [`SETTINGS-006`](#settings-006)               | P2  | Web                | Capabilities settings breadth (Artifacts, Code execution, Network egress, Tool access mode)                                                                                                                                 | missing-capability     |
| [`SETTINGS-007`](#settings-007)               | P2  | Web                | Accent color and contrast controls                                                                                                                                                                                          | parity-gap             |
| [`SETTINGS-008`](#settings-008)               | P2  | Web                | Passkey / WebAuthn and SMS-based multi-factor authentication                                                                                                                                                                | security-gap           |
| [`SETTINGS-010`](#settings-010)               | P2  | Cross-surface      | Settings panels shipped without a nav entry (recurring authoring pattern)                                                                                                                                                   | architecture-gap       |
| [`SETTINGS-011`](#settings-011)               | P2  | Desktop (Tauri)    | Cowork/Dispatch settings breadth                                                                                                                                                                                            | parity-gap             |
| [`SHELL-NAV-IA-002`](#shell-nav-ia-002)       | P2  | Desktop (Tauri)    | Desktop Settings navigation naming                                                                                                                                                                                          | ux-gap                 |
| [`SHELL-NAV-IA-005`](#shell-nav-ia-005)       | P2  | Cross-surface      | Personal/Team workspace switcher                                                                                                                                                                                            | parity-gap             |
| [`VOICE-MEDIA-007`](#voice-media-007)         | P2  | Desktop (Tauri)    | Wake Word Detection                                                                                                                                                                                                         | dead-code              |
| [`VOICE-MEDIA-008`](#voice-media-008)         | P2  | Cross-surface      | True image editing (region/mask edit)                                                                                                                                                                                       | missing-capability     |
| [`VOICE-MEDIA-009`](#voice-media-009)         | P2  | Backend            | Managed audio transcription usage settlement                                                                                                                                                                                | backend-gap            |
| [`VOICE-MEDIA-010`](#voice-media-010)         | P2  | Shared packages    | Reference/source image input for video generation                                                                                                                                                                           | missing-capability     |
| [`ARTIFACTS-006`](#artifacts-006)             | P3  | Web                | Embed code with domain allowlist for published artifacts                                                                                                                                                                    | missing-capability     |
| [`ARTIFACTS-007`](#artifacts-007)             | P3  | Web                | Keyboard shortcut to toggle the Artifacts panel                                                                                                                                                                             | ux-gap                 |
| [`ARTIFACTS-008`](#artifacts-008)             | P3  | Cross-surface      | Live / self-updating artifacts                                                                                                                                                                                              | missing-capability     |
| [`BACKEND-RUNTIME-007`](#backend-runtime-007) | P3  | Shared packages    | Enterprise-Local licensing verification — built twice, wired nowhere                                                                                                                                                        | dead-code              |
| [`BACKEND-RUNTIME-008`](#backend-runtime-008) | P3  | Web                | Orphaned billing/usage alias routes                                                                                                                                                                                         | dead-code              |
| [`BACKEND-RUNTIME-012`](#backend-runtime-012) | P3  | Backend            | No error-tracking/APM on backend services; api-gateway has no /metrics                                                                                                                                                      | reliability-gap        |
| [`BACKEND-RUNTIME-013`](#backend-runtime-013) | P3  | Backend            | Legacy/dead database tables and an authored-but-unapplied schema migration                                                                                                                                                  | architecture-gap       |
| [`COMPOSER-007`](#composer-007)               | P3  | Chrome extension   | Send button keyboard-shortcut label                                                                                                                                                                                         | ux-gap                 |
| [`COMPOSER-008`](#composer-008)               | P3  | Web                | Configurable send shortcut (Enter vs. Cmd/Ctrl+Enter)                                                                                                                                                                       | ux-gap                 |
| [`CROSS-SURFACE-009`](#cross-surface-009)     | P3  | Shared packages    | Enterprise licensing exists as two independently-implemented, unverified-parity packages                                                                                                                                    | architecture-gap       |
| [`CROSS-SURFACE-011`](#cross-surface-011)     | P3  | Shared packages    | Desktop's Rust cloud-sync reimplementation has no confirmed CI gate running both sides of its fixture-replay parity test                                                                                                    | reliability-gap        |
| [`CROSS-SURFACE-013`](#cross-surface-013)     | P3  | Shared packages    | packages/tools/browser-tool is dead code with a stale dependency reference                                                                                                                                                  | dead-code              |
| [`CROSS-SURFACE-015`](#cross-surface-015)     | P3  | Shared packages    | Provider request-shaping (OpenAI wire-compat, reasoning-effort normalization) is web-only with unverified parity elsewhere                                                                                                  | architecture-gap       |
| [`DEAD-CODE-010`](#dead-code-010)             | P3  | Web                | 3 legacy-alias usage/billing API routes have zero callers anywhere in the monorepo                                                                                                                                          | dead-code              |
| [`DEAD-CODE-011`](#dead-code-011)             | P3  | Web                | qa-artifacts and /dev/inline-toolcall-demo harnesses — correcting the audit brief's framing: these do NOT ship reachable to production, but the tracked source still embeds a stray local filesystem path                   | dead-code              |
| [`DEAD-CODE-017`](#dead-code-017)             | P3  | Mobile             | A pre-drawer sidebar implementation (7 files) is fully superseded and dead                                                                                                                                                  | dead-code              |
| [`DEAD-CODE-018`](#dead-code-018)             | P3  | Mobile             | widget-setup screen has no navigation entry point                                                                                                                                                                           | dead-code              |
| [`DEAD-CODE-021`](#dead-code-021)             | P3  | Chrome extension   | Scheduled-task origin check fails open for legacy (pre-origin-stamp) tasks                                                                                                                                                  | reliability-gap        |
| [`DEAD-CODE-022`](#dead-code-022)             | P3  | Desktop (Tauri)    | apps/desktop/archive/ — 204 files of superseded chat UI, confirmed correctly isolated (re-verification of an already-known lead)                                                                                            | dead-code              |
| [`DESIGN-SYSTEM-012`](#design-system-012)     | P3  | Web                | Shared Spinner primitive unused; loading indicators fragmented across 60+ raw implementations                                                                                                                               | partial-implementation |
| [`MEMORY-007`](#memory-007)                   | P3  | Cross-surface      | Memory facts never cite the chat they came from                                                                                                                                                                             | missing-capability     |
| [`MEMORY-009`](#memory-009)                   | P3  | Desktop (Tauri)    | Orphaned legacy memory-browser component family                                                                                                                                                                             | dead-code              |
| [`MEMORY-010`](#memory-010)                   | P3  | Web                | Unreachable second chat runtime injects memory without a temporary-chat check                                                                                                                                               | dead-code              |
| [`MODELS-007`](#models-007)                   | P3  | Desktop (Tauri)    | Embedded local-model inference (dead Cargo feature)                                                                                                                                                                         | dead-code              |
| [`PROJECTS-FILES-006`](#projects-files-006)   | P3  | Web                | Knowledge file version history has no UI                                                                                                                                                                                    | partial-implementation |
| [`PROJECTS-FILES-008`](#projects-files-008)   | P3  | Mobile             | File-upload edge-case error UX is built, tested, and unreachable                                                                                                                                                            | dead-code              |
| [`RENDERING-011`](#rendering-011)             | P3  | Web                | Structured interactive card coverage                                                                                                                                                                                        | missing-capability     |
| [`RENDERING-012`](#rendering-012)             | P3  | Cross-surface      | Native/interactive chart rendering                                                                                                                                                                                          | missing-capability     |
| [`SEARCH-RESEARCH-006`](#search-research-006) | P3  | Backend            | Image / current-data (weather, stocks, sports) search result types                                                                                                                                                          | missing-capability     |
| [`SETTINGS-009`](#settings-009)               | P3  | Chrome extension   | Notification preference granularity                                                                                                                                                                                         | ux-gap                 |
| [`SETTINGS-012`](#settings-012)               | P3  | Web                | Notification category breadth                                                                                                                                                                                               | parity-gap             |
| [`SHELL-NAV-IA-006`](#shell-nav-ia-006)       | P3  | Web                | Account-footer consistency across the two parallel web shells                                                                                                                                                               | ux-gap                 |
| [`SHELL-NAV-IA-007`](#shell-nav-ia-007)       | P3  | Web                | Page metadata / browser-tab identity for directory-style product surfaces                                                                                                                                                   | frontend-gap           |
| [`VOICE-MEDIA-011`](#voice-media-011)         | P3  | Cross-surface      | Image annotation before sending                                                                                                                                                                                             | missing-capability     |
| [`VOICE-MEDIA-012`](#voice-media-012)         | P3  | Desktop (Tauri)    | voice_inject_text hardening                                                                                                                                                                                                 | security-gap           |

---

## Full gap detail

### Agentic work & scheduled tasks

_7 gaps · source: `gaps/domain-agentic-work.json` · narrative: `gaps/domain-agentic-work.md`_

#### AGENTIC-WORK-001

**Background agents (push-to-background, pause/resume/cancel/take-over)** — P0 · Desktop (Tauri) · `dead-code`

_Screen/component:_ n/a — no screen exists

**Current state.** A complete Rust subsystem (`BackgroundAgentManager`, doc-commented as 'inspired by Cursor's & prefix pattern') supports up to 8 parallel autonomous agents with Queued/Running/Paused/Completed/Failed/Cancelled/TakenOver states, 24h default timeout, and 9 native events (created/started/progress/completed/failed/cancelled/paused/resumed/taken*over). 11 Tauri commands are registered (push, list, list_active, get, pause, resume, cancel, take_over, stats, cleanup, should_push). The ONLY way to create one is the LLM itself calling the approval-gated `background_agent_start` tool mid-conversation — there is no user-facing 'push to background' button or `&` prefix parser anywhere in the chat input. Once running, `apps/desktop/src/utils/registeredCommands.ts:174-184` shows all 11 commands appear only in an invoke-allowlist string array, and `apps/desktop/src/lib/tauri-mock.ts:1319-1369` shows them only in a dev/test mock — zero production `invoke()` call sites exist for list, list_active, pause, resume, take_over, stats, or cleanup anywhere in `apps/desktop/src`. The frontend listens to exactly 2 of the 9 native events (`background_agent:completed`, `background_agent:failed`, in `agentWorkflowEvents.ts:1069-1082`) solely to fire an OS notification and an action-log entry; `created`, `started`, and — critically — `progress` are never consumed, so there is no live view of what a background agent is doing. `AgentTaskMonitor.tsx` (the desktop task-monitor panel) wires only the unrelated generic `bg*_`/`background*task*_` job queue (`backgroundTaskStore.ts`, a simple named-task queue with no 'take over' concept at all), not `BackgroundAgentManager`. A code comment in `backgroundTaskStore.ts:7-8`points readers to a`backgroundAgentStore.ts` for the agent system — that file does not exist anywhere in the repository.

**Expected state.** Claude Cowork's benchmark bar (shots-claude-desktop.md: agent task view, tool-call timeline, 'working on your computer' status) requires that any autonomous background-running agent be listable, watchable live, pausable, resumable, cancellable, and reclaimable (take-over) from a dedicated UI — the domain brief's own framing ('the user must always know what the agent is doing, what it has done, whether work is local or cloud'). At minimum: a 'Background agents' panel listing active/queued/paused/completed agents with live progress, and Pause/Resume/Cancel/Take Over buttons wired to the already-implemented Tauri commands.

**Benchmark.** Claude Desktop — Cowork agent task view / tool-call timeline / working-on-computer status (shots-claude-desktop.md)

**Evidence.** Grepped all 11 `background_agent_*` command names across `apps/desktop/src/**/*.{ts,tsx}`: every hit resolves to `registeredCommands.ts` (an allowlist string) or `tauri-mock.ts` (a dev mock) — never a production `invoke()` call. Grepped `background_agent:` event names across the same tree: only `completed` and `failed` are `listen()`-ed, in `agentWorkflowEvents.ts`; `progress`/`started`/`created`/`paused`/`resumed`/`taken_over` have zero listeners. Confirmed `AgentTaskMonitor.tsx` imports only `useBackgroundTaskStore` (the separate generic `bg_*` queue), not any agent-manager store, and that `backgroundAgentStore.ts` (named in a comment as the file that should wire this) does not exist via `find`. Confirmed via `tool_executor/mod.rs:2218-2222` that only `background_agent_start`/`get`/`cancel` are even reachable through the LLM tool-call path — `list`/`pause`/`resume`/`take_over`/`stats`/`cleanup`/`should_push` are unreachable by any caller, human or model. Confirmed `tool_guard.rs:562-575` requires approval for `background_agent_start` (mitigates unattended spawn, does not mitigate the missing control surface once running).

**Files.**

- `apps/desktop/src-tauri/src/core/agent/background_agent.rs:1-48`
- `apps/desktop/src-tauri/src/sys/commands/background_agents.rs:1-358`
- `apps/desktop/src-tauri/src/lib.rs:2191-2193,2355-2362`
- `apps/desktop/src/utils/registeredCommands.ts:174-184`
- `apps/desktop/src/lib/tauri-mock.ts:1319-1369`
- `apps/desktop/src/constants/event-names.ts:19-27`
- `apps/desktop/src/stores/chat/agentWorkflowEvents.ts:1069-1082`
- `apps/desktop/src/stores/backgroundTaskStore.ts:1-33`
- `apps/desktop/src/features/agi/AgentTaskMonitor.tsx:14-23`
- `apps/desktop/src-tauri/src/core/llm/tool_executor/mod.rs:2218-2222`
- `apps/desktop/src-tauri/src/sys/security/tool_guard.rs:562-575`

**Recommendation.** Build `useBackgroundAgentStore` wiring all 11 commands plus the 7 currently-unconsumed native events, and mount a Background Agents panel (list with live progress bars driven by the `progress` event, Pause/Resume/Cancel per row, Take Over to restore the conversation to the foreground) reachable from the sidebar or a status-bar indicator whenever `background_agent_list_active` returns a non-empty result. Ship the panel before shipping any UI-level way to request a background push (a manual '&' prefix or composer action), since a control surface that can create work but not manage it is worse than no control surface.

#### AGENTIC-WORK-002

**Web Tasks entry point auth gating** — P1 · Web · `broken-workflow`

_Screen/component:_ /tasks

**Current state.** `apps/web/proxy.ts:145-152` defines `isProtectedAppRoute` as `['/chat(.*)', '/library(.*)', '/schedules(.*)', '/settings(.*)', '/billing(.*)', '/admin(.*)']` and only this matcher (line 232) triggers a redirect to `/login`. `/tasks` — the Tasks screen, i.e. the primary Cloud AGI Work run-history surface, linked from the shared web nav (`WebAppShell.tsx`, nav id `tasks`) — is absent from that list. `apps/web/app/tasks/page.tsx` itself performs no auth check either; it unconditionally renders `WebAppShell` + `TasksPage`. Its sibling scheduled-task screen at `/chat/schedules` IS covered (matches `/chat(.*)`). A local route-sweep (`web-route-sweep-findings.md`) independently observed this: hitting `/tasks` unauthenticated returns the full signed-in chrome (nav, search, 'Tasks — your Cloud work runs' heading, Active/All filters) stuck on a 'Loading account…' placeholder instead of redirecting to login.

**Expected state.** Every primary authenticated destination redirects an anonymous visitor to `/login?redirectTo=/tasks`, exactly like `/chat`, `/library`, and `/schedules` already do. No authenticated route should render its full app chrome to a logged-out visitor.

**Benchmark.** ChatGPT Web / Claude Web — Tasks and Cowork task lists are only ever reachable behind auth; an anonymous visit redirects straight to sign-in with no interstitial shell

**Evidence.** Read `apps/web/proxy.ts:145-152` directly: `/tasks` is not one of the six matcher patterns. Read `apps/web/app/tasks/page.tsx` in full (18 lines): no session check, no redirect, unconditional render. Compared against `apps/web/app/chat/schedules/page.tsx`, which is covered by the `/chat(.*)` pattern. Cross-checked against the independently-gathered `web-route-sweep-findings.md`, which observed the same behavior against a live `next dev` server (not just static analysis).

**Files.**

- `apps/web/proxy.ts:145-152,232`
- `apps/web/app/tasks/page.tsx:1-18`
- `apps/web/app/chat/schedules/page.tsx:1-17`
- `audit/parity-2026-08-15/inventory/web-route-sweep-findings.md:60-79`

**Recommendation.** Add `'/tasks(.*)'` to `isProtectedAppRoute` in `apps/web/proxy.ts:145-152`. One-line fix; add a regression test asserting an unauthenticated `/tasks` request 302s to `/login?redirectTo=%2Ftasks`, matching the existing test coverage pattern for `/chat` and `/schedules`.

#### AGENTIC-WORK-003

**Durable background execution for AGI Work turns** — P1 · Web · `reliability-gap`

_Screen/component:_ n/a — server transport selection

**Current state.** A genuinely durable execution path exists: `startCloudAgentWorkflowExecution` (`apps/web/lib/workflows/start-cloud-agent-workflow.ts`) launches the agent turn on the Vercel Workflow DevKit transport (`workflow/api`'s `start()`), which survives the originating HTTP connection closing — this is real 'close the laptop, the task keeps running' infrastructure, not a stub. But `route.ts:533` only takes this path `if (processed.managedUsage && areDurableInitialTurnsEnabled())`. `durable-initial-turns.ts:9-14` states the flag is 'OFF unless explicitly enabled' by design (a poisoned `start()` could otherwise strand every paid turn), and `.env.example:219` ships it as `# AGI_DURABLE_INITIAL_TURNS=0` (commented out, i.e. unset/off by default). `CHANGELOG.md:328-336`, however, describes the same flag as a 'kill-switch' and states outright 'close the laptop and the run continues server-side' as a shipped, unconditional capability — the changelog framing (opt-out safety net) contradicts the code's actual default (opt-in, off until someone sets it). No file in the repository confirms the variable is set in the production environment. Mitigating factor: once a run reaches its first tool-approval checkpoint, `approve/route.ts:288` calls the same `startCloudAgentWorkflowExecution` unconditionally (no flag check), so any run that pauses for approval becomes durable regardless of the flag — only the pre-approval portion of a run's life is affected by the gate.

**Expected state.** The initial-turn durability the CHANGELOG already claims as shipped should default to on (or the discrepancy between 'kill-switch' framing and opt-in default should be resolved and documented), and production configuration should be verifiable — an ops runbook or health check should assert `AGI_DURABLE_INITIAL_TURNS` is set in every environment where the 'continues after you close the laptop' claim is made to users.

**Benchmark.** Claude Cowork remote/serverless execution ('works with device off') — cross-cutting-and-complaints.md:61, explicitly named as 'a genuine differentiator vs. ChatGPT Work's need for the desktop client'

**Evidence.** Read `durable-initial-turns.ts` in full: default-false boolean gate, env var must equal '1'/'true'/'on'. Read `route.ts:516-557`: the durable path is inside `if (processed.managedUsage && areDurableInitialTurnsEnabled())`, with a fallback to the old request-scoped inline stream on any failure or when the flag is off. Grepped `.env.example` and found the var commented out at value `0`. Grepped CHANGELOG.md and found the shipped feature described as unconditional ('the run continues server-side') under a 'kill-switch' framing that implies default-on. Confirmed `approve/route.ts:288` calls the same starter unconditionally, so only the pre-approval segment of a run is affected by the flag.

**Files.**

- `apps/web/lib/workflows/durable-initial-turns.ts:1-23`
- `apps/web/app/api/llm/v1/chat/completions/route.ts:516-557`
- `apps/web/app/api/llm/v1/chat/completions/approve/route.ts:288`
- `apps/web/.env.example:219`
- `CHANGELOG.md:328-336`

**Recommendation.** Either flip the default to on now that the module comment's original startup-hang concern is handled by ordering (per the route.ts comment, a `start()` that throws safely falls through), or rename/redocument the flag so its off-by-default behavior is not described as a kill-switch. Add a deploy-time or health-check assertion that fails loudly if `AGI_DURABLE_INITIAL_TURNS` is unset in production while the product-facing copy promises background continuation.

#### AGENTIC-WORK-004

**Scheduled task recurrence cadence** — P1 · Backend · `backend-gap` · prior art `GAP-P0-007`

_Screen/component:_ Scheduled tasks create/edit form (all surfaces)

**Current state.** This updates prior finding GAP-P0-007, which reported the sweep as 'one daily batch of ten runs.' That specific defect is now fixed: `run-schedules/route.ts:32,52-74` drains due schedules in waves of 10 up to `MAX_WAVES = ceil(PLATFORM_SCHEDULE_RUNS_PER_SWEEP / 10)` within a 55s budget, so a single invocation can now clear up to 50 due runs, not 10, and schedule creation now honestly REJECTS any cadence the sweep cannot deliver: `assertDeliverableCadence` (`schedule-time.ts:384-411`) throws `'Scheduled tasks are swept once a day, so the shortest supported interval is 1 day'` for any interval or cron expression tighter than `SWEEP_INTERVAL_MS = 24h` (`schedule-time.ts:308`), and `schedule-cadence.test.ts` pins that constant to the actual `vercel.json` cron entry (`0 1 * * *`, once daily) so the two cannot drift apart silently again. The underlying architectural constraint is unchanged and is now explicit product policy rather than a silent bug: **the product cannot deliver any recurring or monitoring schedule finer than once per day**, because Vercel's Hobby-tier cron on this deployment only fires once daily (per `vercel.json`'s single `run-schedules` entry and the file's own comment: 'sized for an hourly sweep that was never deployed, against a daily cron').

**Expected state.** Both ChatGPT Tasks (floor: 'cannot run more than once/hour') and Claude Cowork scheduled tasks / Claude Code routines ('hourly/daily/weekly... full tool/Skills access') support hourly cadence as their baseline; sub-daily monitoring tasks ('check every 15 minutes,' 'monitor this page hourly') are a mainstream use case neither this product can offer at all.

**Benchmark.** cross-cutting-and-complaints.md:62 — ChatGPT Tasks ('cannot run more than once/hour') and Claude Cowork/routines ('hourly/daily/weekly')

**Evidence.** Read `run-schedules/route.ts` in full: confirmed the wave-loop and 55s budget replaced the single 10-row claim the prior audit described. Read `schedule-time.ts:295-411`: confirmed `assertDeliverableCadence` is called from the schedule write boundary (`schedule-service.ts` create/update path) and rejects sub-daily cadences with an honest error rather than silently accepting them. Read `billing-catalog.ts:380-447`: confirmed the documented reasoning ('sized for an hourly sweep that was never deployed') and the `schedule-cadence.test.ts` pin. Read `vercel.json`: confirmed exactly one daily cron entry for `run-schedules` (`0 1 * * *`), no second invocation anywhere in the file.

**Files.**

- `apps/web/app/api/cron/run-schedules/route.ts:1-94`
- `vercel.json:13-50`
- `apps/web/lib/schedules/schedule-time.ts:305-411`
- `packages/contracts/types/src/billing-catalog.ts:380-447`
- `docs/current/gap-audit-2026-08-08.md:284-322`

**Recommendation.** Either move `run-schedules` off Vercel's cron entirely onto a system that can fire hourly (a durable Workflow-scheduled trigger, matching the pattern already used for cloud agent runs in `apps/web/lib/workflows/cloud-agent-workflow.ts`, or an external scheduler like QStash/Inngest hitting the same claim/process functions), or explicitly productize 'daily only' with clear UI copy explaining the ceiling — but do not leave the gap unaddressed while marketing the feature as 'scheduled tasks' without qualification.

#### AGENTIC-WORK-005

**Mid-run steering of an active AGI Work / Cloud agent run** — P1 · Cross-surface · `ux-gap`

_Screen/component:_ Chat composer while a task is running

**Current state.** A conversation with an active managed run hard-rejects any new message with HTTP 409 `conversation_run_in_progress` and the message 'This conversation already has a response in progress. Stop it before sending a new message.' (`route.ts:173-197`). The only intervention surface while a run is active is the tool-approval resume endpoint, and its wire contract (`ToolApprovalDecisionSchema`, `tool-approval-resume.ts:29-32`) supports exactly two values, `'approved' | 'rejected'` — no free-text field for the user to redirect, add context, or qualify a decision ('approve, but skip the destructive step' is not expressible). The only way to redirect a running task is to fully Stop it, discarding in-flight progress, then start over.

**Expected state.** A user should be able to send a follow-up instruction that reaches the running agent without stopping it — redirecting scope, adding a constraint, or answering a question the agent didn't explicitly pause to ask.

**Benchmark.** ChatGPT Work / Codex — 'Remote Control (view/steer a running host session)', GA May 29 2026 (chatgpt-work-codex.md:158); domain brief explicitly names 'steering while running' as an expected agentic-work capability

**Evidence.** Read `route.ts:165-199` in full: the 409 branch is unconditional whenever `findActiveCloudAgentRunForConversation` returns a row, with no code path that instead injects the new message into the live run. Read `tool-approval-resume.ts` in full: `ToolApprovalResumeRequestSchema` accepts only `run_id` and an array of `{tool_call_id, decision}` pairs — no message/guidance field exists in the wire schema at all, so even the one interaction point during a paused-for-approval run cannot carry free text.

**Files.**

- `apps/web/app/api/llm/v1/chat/completions/route.ts:165-199`
- `packages/contracts/cloud-contracts/src/tool-approval-resume.ts:28-44`

**Recommendation.** Add an optional `guidance: string` field to `ToolApprovalResumeRequestSchema` that gets appended to the transcript as a user turn before the tool loop resumes, giving the existing approval checkpoint a steering channel with the smallest possible schema change. Treat true mid-execution (non-checkpoint) interruption as a larger follow-up needing the workflow engine to expose an interrupt point.

#### AGENTIC-WORK-007

**Scheduled task execution has no tool access** — P1 · Backend · `backend-gap` · prior art `GAP-168`

_Screen/component:_ n/a — server execution path

**Current state.** `executeScheduledAgent` (`scheduled-agent-executor.ts:88-135`) builds its provider request as a single non-streaming chat completion with exactly two messages (a fixed system prompt and the saved task prompt), `max_tokens: 4096`, `stream: false`, and no `tools` field of any kind — no built-in tools, no MCP servers, no user connectors, no web search, no code execution, no file access. The system prompt itself ('Do not claim to have performed external actions unless a tool result proves it') reads as if tool use were expected, but no tool definitions are ever attached to the request. A scheduled task can only produce text derived from the model's own knowledge and the prompt; it cannot check a website, query a connector, or run code, regardless of what the user's saved prompt asks for.

**Expected state.** Claude Cowork scheduled tasks and Claude Code 'routines' explicitly 'retain full Skills/connector access while running unattended.' Even ChatGPT's deliberately narrowed Tasks retain plain-text prompting as their floor — this product's scheduled tasks sit below that floor by omitting tool access entirely, not just voice/files/Custom GPTs.

**Benchmark.** cross-cutting-and-complaints.md:117-119 — 'Claude Cowork's scheduled tasks and Claude Code's routines both retain full Skills/connector access while running unattended,' contrasted with ChatGPT's narrower (but still tool-capable within its own connector set) Tasks

**Evidence.** Read `scheduled-agent-executor.ts` end to end: the `openAIWireRequestToChatRequest` call at line 124-135 has no `tools`/`tool_choice` key. Grepped the whole file and `schedule-service.ts` for `tool|connector|mcp` — zero matches outside the misleading system-prompt sentence. Confirmed the executor is the sole `ScheduledTaskExecutor` implementation wired into `processDueScheduleRuns` via `processClaimedScheduleRun` (`schedule-service.ts:1127-1160`).

**Files.**

- `apps/web/lib/services/scheduled-agent-executor.ts:88-135`
- `apps/web/lib/services/schedule-service.ts:1127-1192`

**Recommendation.** Route scheduled execution through the same `runToolLoop`/tool-definition assembly already used by interactive chat (at minimum built-in tools: web search, code execution), gated by the same per-tier tool-availability rules, before extending to user connectors (GAP-168's mobile-UI binding gap is a smaller, downstream piece of this same backend gap).

#### AGENTIC-WORK-006

**Standalone Cowork/workspace product surface** — P2 · Cross-surface · `architecture-gap` · prior art `P2-001`

_Screen/component:_ n/a — no dedicated entry surface exists

**Current state.** This confirms prior finding P2-001 is still accurate: AGI Work exists as a mode toggle on the ordinary chat composer (Chat ⇄ AGI Work, wired through `DesktopShellV3`/shared `ChatInput`/`WorkScopePicker` per GAP-064 in `audit/ui-gaps.csv`) plus a run-history list at `/tasks` (web) built on the shared `TasksPage` from `packages/ui/unified-chat`. There is no independent, deep-linkable workspace object with its own creation surface parallel to — rather than nested inside — chat.

**Expected state.** Per P2-001's own acceptance bar: independent workspace/run object, resumable task state, plan and progress, approvals, files/artifacts, background execution, schedule/trigger support, durable history — evaluated against a dedicated entry point, not a composer toggle.

**Benchmark.** Claude Cowork as a distinct product surface, not a chat mode (cross-cutting-and-complaints.md:61)

**Evidence.** Re-read the composer mode-toggle wiring cited by GAP-064 in `audit/ui-gaps.csv` and confirmed AGI Work is still reached only via the shared chat composer's mode switch, not a separate top-level surface. Confirmed `/tasks` (`TasksPage`) is a run-history list, not a task-creation surface — new AGI Work runs are still created from the chat composer. No new evidence contradicts the original P2-001 finding; this row exists to record independent re-verification at `e15df56e3`, not to duplicate it.

**Files.**

- `apps/desktop/src/features/v3/DesktopShellV3.tsx`
- `apps/web/features/tasks/components/TasksPage.tsx:1-48`
- `docs/current/gap-audit-2026-08-08.md:795-812`

**Recommendation.** No new action beyond what P2-001 already prescribes; sequence after the P0/P1 items above (background-agent control surface, durable-turn default, steering) since a standalone workspace product built on top of the current execution/visibility gaps would inherit all of them.

### Artifacts & creation workspaces

_8 gaps · source: `gaps/domain-artifacts.json` · narrative: `gaps/domain-artifacts.md`_

#### ARTIFACTS-001

**Cross-device artifact sync (Web → Cloud)** — P1 · Cross-surface · `backend-gap`

_Screen/component:_ Artifacts panel / gallery

**Current state.** The `/api/chat/sync` route fully supports bidirectional artifact sync (GET pull + POST push into `web_artifacts`, with server-version compare-and-swap). The web client only ever calls the GET/pull half via `pullArtifactCloudChanges()` inside `useArtifactCloudSync()` — there is no call site anywhere in `apps/web` that POSTs the local `artifacts-store` (which persists to `localStorage` under `agi-artifacts-store`) back to that endpoint. Desktop's Rust `cloud_sync.rs` does push its artifacts, so Web can see Desktop-authored artifacts, but an artifact created purely in a Web chat session never leaves that one browser's localStorage.

**Expected state.** An artifact created on any authenticated surface (web, mobile, desktop) is visible from every other authenticated surface for the same account, the way Claude/ChatGPT conversations and generated files are, with normal reload/multi-tab/multi-device consistency.

**Benchmark.** Claude web/desktop — unified 'Artifacts' view merges chat, Code, and Cowork artifacts across the account (shots-claude-web.md Artifacts screen 167); ChatGPT Canvas documents are attached to the account-level conversation, not the browser.

**Evidence.** Read use-artifact-cloud-sync.ts (only calls pullArtifactCloudChanges, cursor reset to '0' every mount) and artifact-cloud-sync.ts (exports only a pull function). Grepped `chat/sync` across apps/web/\*_/_.ts(x) excluding .next/tests — only the pull call site and the route itself reference it; no push. Read api/chat/sync/route.ts, confirmed POST handler upserts into web_artifacts for any of conversations/messages/artifacts (lines 444-530) and is fully implemented, i.e. the backend capability exists and is simply unused by the web artifact store. Read artifacts-store.ts persistence comment: 'web wraps the shared store with zustand-persist ... to localStorage'.

**Files.**

- `apps/web/features/chat/hooks/use-artifact-cloud-sync.ts:20-99`
- `apps/web/features/chat/services/artifact-cloud-sync.ts:1-63`
- `apps/web/app/api/chat/sync/route.ts:6-19,444-530,688`
- `apps/web/features/chat/stores/artifacts-store.ts:36-38,230-260`

**Recommendation.** Add a push path in artifacts-store.ts (or a new hook) that POSTs locally-created/edited artifacts to /api/chat/sync on create/update, mirroring the shape the pull side already parses (ArtifactWireDelta). Reuse the existing CSRF/rate-limit/RLS plumbing the route already has for conversations/messages.

#### ARTIFACTS-002

**Publish artifact to a public link** — P2 · Desktop (Tauri) · `missing-capability`

_Screen/component:_ Desktop Artifact panel — Publish action

**Current state.** Desktop's `handlePublish` always calls `makeDesktopPublishCallback`, which hardcodes `privacyMode: 'local'` and a Tauri `file://` writer — it can only ever save a local copy under the app data directory. Desktop injects no `CloudPublisher`; the module's own doc comment states this plainly ('Desktop injects none, so no caller here can receive a cloud result'). Web is the only surface with a working `CloudPublisher` (`createWebCloudPublisher`), which POSTs to `/api/artifacts/publish` and returns a real `shareUrl`.

**Expected state.** A user working in the Desktop app can publish an HTML/React/SVG/Mermaid/code/markdown artifact to a public shareable link the same way a Web user can, without having to re-open the same conversation in a browser first.

**Benchmark.** Claude — 'Publish (Free/Pro/Max): makes the artifact public via link' is documented as a platform-level artifact action, not scoped to one client (research/claude-web-desktop.md §13).

**Evidence.** Read publishAdapter.ts end-to-end (tauriLocalFileWriter + makeDesktopPublishCallback, both privacyMode 'local' only) and the surrounding handlePublish in ArtifactPanel.tsx, which toasts 'Artifact saved to <file path>' — never a URL. Confirmed via grep that no `CloudPublisher` implementation exists under apps/desktop.

**Files.**

- `apps/desktop/src/features/artifacts/publishAdapter.ts:1-112`
- `apps/desktop/src/features/artifacts/ArtifactPanel.tsx:352-395`
- `apps/web/features/chat/components/artifacts/publishArtifactClient.ts:92-133`

**Recommendation.** Give Desktop a CloudPublisher adapter that calls the same managed-cloud `/api/artifacts/publish` endpoint the web client uses (Desktop already has an authenticated fetch client for other managed-cloud calls), and let handlePublish branch on the result kind ('cloud' vs 'local') the way ArtifactPreview.tsx already does on web.

#### ARTIFACTS-003

**Direct manual editing of artifact content** — P2 · Cross-surface · `ux-gap`

_Screen/component:_ Artifact viewer — Code tab

**Current state.** The artifact 'Code' tab is read-only: source is shown in a `<pre>`/highlighted block with a Copy button, and every revision comes from a new LLM turn (the version stepper only navigates already-generated versions and Restore re-appends an old version — it never lets the user type a change). Grepped every component under `features/chat/components/artifacts/` for `contentEditable`, `Monaco`, and `CodeMirror`: zero matches. Gallery's 'New Artifact' button opens a category picker whose only actions are `router.push('/chat?prompt=...')` (prefilled chat) or `router.push('/chat')` (empty chat) — there is no blank, directly-editable artifact creation path.

**Expected state.** A user can click into the artifact's source/code view and type changes directly (not only via a chat follow-up), the way ChatGPT Canvas supports both a free-text editing surface and an inline 'edit this section' AI popover (research/chatgpt-web-desktop.md §5). 'New artifact' should be able to open a blank artifact ready for direct authoring, not only a chat prompt.

**Benchmark.** ChatGPT Canvas — direct whole-document/code editing plus inline AI-assisted edit popover; version history with a GitHub-style diff view.

**Evidence.** Read ArtifactPreview.tsx fully to line 1368 (toolbar, tabs, version stepper) and grepped the whole artifacts component directory for editable-surface primitives with no hits. Read GalleryClient.tsx's handleCategorySelect/handleLaunch, both of which only navigate to /chat.

**Files.**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1-1368`
- `apps/web/app/gallery/GalleryClient.tsx:994-1000,1254`

**Recommendation.** Smallest slice: make the Code tab's `<pre>` a real editable text area (behind a small 'Edit' toggle next to Preview/Code) that writes back through the same content-keyed versioning path Restore already uses, so a manual edit becomes a new version like an LLM-authored one. Ship diffing between versions as a fast follow, matching the version stepper already in place.

#### ARTIFACTS-004

**Artifact version history and publish-to-link on mobile** — P2 · Mobile · `partial-implementation`

_Screen/component:_ ArtifactFullScreen

**Current state.** Mobile's full-screen artifact viewer has Preview/Code toggle, Download, native Share sheet, Refresh, and Copy — but grepping the mobile chat feature tree for `versionHistory`/`getArtifactVersions`/`restoreArtifactVersion` and for `publish`/`Publish` (excluding the unrelated 'publish plugin/skill' surfaces) returns nothing inside the artifact viewer components. There is no version stepper and no path to a public shareable link from mobile — the closest mobile gets is the OS share sheet, which shares the raw file/content, not a hosted URL.

**Expected state.** Mobile artifact viewing should carry the same version history and publish capability that Web already implements for the identical artifact content (they are the same store via cross-surface derivation), rather than being a strictly smaller feature set on the same data.

**Benchmark.** Claude iOS / ChatGPT iOS — artifacts opened on mobile are the same objects as on web/desktop with the same publish and history actions available (shots-claude-ios.md; parity expectation from Web's own ArtifactPreview panel-variant toolbar).

**Evidence.** Read ArtifactFullScreen.tsx and SafeArtifactPreview.tsx in full; grepped apps/mobile/src for versionHistory/getArtifactVersions/restoreArtifactVersion (0 hits) and for publish/Publish inside apps/mobile/src/features/chat (2 hits, both unrelated: AddToChatSheet.tsx and an image-generation action, not the artifact viewer).

**Files.**

- `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1-613`
- `apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:1-70`

**Recommendation.** Add the version chip (prev/next/Restore) to ArtifactFullScreen using the same shared-store version data web reads via getArtifactVersions, and wire a Publish action that calls the same /api/artifacts/publish endpoint the web CloudPublisher uses.

#### ARTIFACTS-005

**AI-powered / model-calling artifacts** — P2 · Cross-surface · `missing-capability` · prior art `GAP-P0-009`

_Screen/component:_ n/a — no surface exposes this

**Current state.** No code anywhere in the repo lets a published or in-chat artifact call the model directly (no viewer-funded execution, no capability tokens, nothing resembling Claude's 'AI-powered artifacts' toggle). This is a deliberate, previously-reviewed absence: `docs/current/gap-audit-2026-08-08.md` GAP-P0-009 documents a red-team NO-GO (anonymous wallet DoS against the publisher, opaque-origin auth contradiction, copied capability state enabling repeated billing, fail-open concurrency limiter) and explicitly says the feature 'must not ship as currently designed.' Confirmed by grep: no route, store, or component in apps/web references an artifact-scoped model-call bridge.

**Expected state.** This audit does not recommend shipping the naive version Claude/ChatGPT expose (an artifact that calls the model with no API key using the viewer's own plan quota) until the specific safety properties GAP-P0-009 already lists are in place: short-lived capability tokens scoped to artifact+viewer+action+budget+expiry, server-enforced fail-closed budget/concurrency, immutable published snapshots with no copied live grants, and full audit trail. Until then, this remains a real capability gap relative to the benchmark, correctly left unshipped rather than shipped unsafely.

**Benchmark.** Claude — 'AI-powered apps': an artifact can call Claude directly, billed against the viewer's own plan (research/claude-web-desktop.md §3, 'Artifacts calling the Claude API').

**Evidence.** Grepped apps/web for 'AI-powered'/'aiPowered'/'CAP-052' (no artifact-related hits). Read docs/current/gap-audit-2026-08-08.md GAP-P0-009 in full and confirmed its required redesign properties are not present anywhere in packages/platform/artifacts or apps/web/app/api/artifacts.

**Files.**

- `packages/platform/artifacts/src/artifacts.ts`
- `docs/current/gap-audit-2026-08-08.md:357-392`

**Recommendation.** Do not build a v1 that mirrors Claude's current design. When prioritized, build directly to GAP-P0-009's required properties (viewer-scoped short-lived capability tokens, server-enforced fail-closed budget/concurrency, immutable snapshot, strong idempotency) and gate behind a red-team regression suite before enabling, exactly as that document specifies.

#### ARTIFACTS-006

**Embed code with domain allowlist for published artifacts** — P3 · Web · `missing-capability`

_Screen/component:_ Published artifact settings / public page

**Current state.** Publishing returns a `shareUrl` and the Settings 'Published artifacts' list offers Copy link and Unpublish only. There is no 'Get embed code' action and no allowed-domains restriction field anywhere in the publish request/response schema or the settings UI.

**Expected state.** A publisher can generate an `<iframe>` embed snippet for a published artifact and optionally restrict which parent domains may embed it.

**Benchmark.** Claude — 'Get embed code' button after publishing, with an allowed-domains restriction (research/claude-web-desktop.md §13).

**Evidence.** Read the publish route's response shape (token, shareUrl, publishedAt, kind, title, sandboxed) and PublishedArtifactsSection.tsx's action set (Copy, Unpublish) — no embed-related field or control in either.

**Files.**

- `apps/web/app/api/artifacts/publish/route.ts:1-159`
- `apps/web/features/settings/sections/PublishedArtifactsSection.tsx:60-136`

**Recommendation.** Add an `allowedDomains` column to published_artifacts, a simple settings field to manage it, and generate an iframe embed snippet client-side; enforce the allowlist with an X-Frame-Options/CSP frame-ancestors check on the public route.

#### ARTIFACTS-007

**Keyboard shortcut to toggle the Artifacts panel** — P3 · Web · `ux-gap` · prior art `GAP-227`

_Screen/component:_ Chat — Artifacts panel

**Current state.** `ArtifactsToggleButton` only opens/closes the panel via mouse click; grepping use-keyboard-shortcuts.ts and KeyboardShortcutsDialog.tsx for 'artifact' (any case) returns no matches, so there is no bound key and no documented shortcut for it.

**Expected state.** A discoverable keyboard shortcut toggles the Artifacts panel, listed in the shortcuts dialog, matching how other panels in the app are made keyboard-accessible.

**Benchmark.** Codex macOS desktop — 'Settings > Keyboard shortcuts' lists per-panel toggles including the artifact/review panel (this is the same underlying gap already tracked for Desktop as GAP-227; Web has never had one either).

**Evidence.** Grepped both files for 'artifact' case-insensitively — zero matches in either the shortcut handler or the shortcuts help dialog.

**Files.**

- `apps/web/features/chat/hooks/use-keyboard-shortcuts.ts`
- `apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx`
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:587-615`

**Recommendation.** Bind a shortcut (e.g. Cmd/Ctrl+Shift+A) in use-keyboard-shortcuts.ts to useArtifactsStore's togglePanel, and add the row to KeyboardShortcutsDialog.tsx.

#### ARTIFACTS-008

**Live / self-updating artifacts** — P3 · Cross-surface · `missing-capability`

_Screen/component:_ n/a — no surface exposes this

**Current state.** The Work-mode sidebar has a 'Live artifacts' nav item, but it routes to the same static `/gallery` page as ordinary Artifacts (`'work-artifacts': '/gallery'` in VIEW_ROUTES) — there is no persistent, auto-refreshing artifact concept (a dashboard that keeps updating itself after creation) anywhere in packages/platform/artifacts or the web app.

**Expected state.** This is a genuinely newer, currently desktop-only, beta capability for Claude (per its own docs it doesn't sync across devices even there), so it is reasonable to sequence behind the P1/P2 items above rather than treat as launch-blocking. Flagging it here so the label 'Live artifacts' in the product is not left pointing at a feature that doesn't exist.

**Benchmark.** Claude Cowork — 'Live artifacts' tab: a persistent, self-updating HTML page auto-saved to the Artifacts view (research/claude-web-desktop.md §3, Live Artifacts subsection). Desktop-only even there, GA 2026-06-18.

**Evidence.** Read WebShellV3.tsx VIEW_ROUTES mapping ('work-artifacts' → '/gallery', same target as plain 'artifacts'). Read GalleryClient.tsx — no auto-refresh/live-data mechanism. Grepped packages/platform/artifacts for any polling/live-update concept — none.

**Files.**

- `apps/web/features/chat/v3/WebShellV3.tsx:29-40`
- `packages/platform/artifacts/src/artifact-sync.ts`

**Recommendation.** Either relabel the Work-mode nav item until a real live-artifact surface exists, or scope a minimal version: an artifact that re-renders on a schedule from a bound data source, surfaced under its own tab as the label already promises.

### Backend & runtime architecture

_13 gaps · source: `gaps/domain-backend-runtime.json` · narrative: `gaps/domain-backend-runtime.md`_

#### BACKEND-RUNTIME-001

**Managed Code (Cloud Code) agent-turn execution** — P1 · Web · `broken-workflow`

_Screen/component:_ /chat/code (CloudCodePage)

**Current state.** A complete, separate agentic-turn backend exists for Cloud Code sessions: `agent/route.ts` (124 lines, real `handleAgentTurn`) runs an agent turn against a code session, and `agent/approvals/route.ts` (136 lines) lists/decides pending approvals for it (auth, CSRF, rate limit, subscription-tier check, `decideCloudCodeAgentApproval`). `cloud-code-api.ts` is the only in-repo caller of `/api/code/sessions/**`, and it calls list/get/create/delete/`commands` only — never `.../agent` or `.../agent/approvals`. `CloudCodePage.tsx` renders a raw terminal (`commands`) and its only mention of "agent" is a static string pointing users at the VS Code extension instead (line 660).

**Expected state.** Codex (ChatGPT Work/Codex app mode) and Claude Code's IDE/terminal surfaces let a user hand a coding task to an agent that plans, edits files, and asks for approval on risky actions — not just a raw command shell. Since the approval-gated agent-turn backend already exists end-to-end (turn execution + approval resume), the web Cloud Code screen should expose an actual agent entry point (task input, streaming plan/tool-status, approval prompts) wired to the existing endpoints.

**Benchmark.** OpenAI Codex (ChatGPT Work/Codex desktop + web) agent task flow; Claude Code CLI/IDE approval flow — research/chatgpt-work-codex.md, research/shots-codex-macos-shell.md

**Evidence.** Read apps/web/app/api/code/sessions/[sessionId]/agent/route.ts and .../agent/approvals/route.ts in full (real handlers, not stubs). Ran `grep -n "fetch(\|/api/code" cloud-code-api.ts` → 6 hits, none `/agent`. Repo-wide grep for `sessions/${...}/agent` outside app/api/code and cloud-code-api.ts → zero hits. `grep -n "agent" apps/web/features/code/CloudCodePage.tsx` → exactly one hit, a static help string, not a call site. Confirms inventory web-backend.md §3c verbatim.

**Files.**

- `apps/web/app/api/code/sessions/[sessionId]/agent/route.ts`
- `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts`
- `apps/web/features/code/services/cloud-code-api.ts`
- `apps/web/features/code/CloudCodePage.tsx:660`

**Recommendation.** Add an agent-turn composer to CloudCodePage (task input → POST .../agent, subscribe to its event stream, render tool status + `x_agent_event`-style updates, surface pending approvals from GET .../agent/approvals with an approve/deny control wired to POST). This closes an already-built backend loop rather than adding new surface area.

#### BACKEND-RUNTIME-009

**CLI command sandboxing — no OS-level sandbox on Windows** — P1 · CLI · `reliability-gap`

**Current state.** `SandboxType::detect()` (`sandbox.rs:22-35`) only returns a real sandbox type on macOS (Seatbelt) and Linux (bubblewrap, if present); every other platform — including Windows — falls through to `SandboxType::None`. `windows_sandbox.rs`'s `is_available()` unconditionally returns `false`, and `install_filter` bails even when its own feature flag is enabled: "install_filter is not yet implemented even with the feature flag; tracking issue: AppContainer integration is a v1.8 work item." `SandboxManager::for_command_execution` fails closed on `SandboxType::None` (bails with "sandbox not available on this platform or host"), and `bash/mod.rs` surfaces that as a hard tool failure — so by default, every shell-command tool call in the CLI's agent loop fails outright on Windows unless the user passes `--no-sandbox`/`AGIWORKFORCE_NO_SANDBOX` (which prints a warning and runs fully unsandboxed).

**Expected state.** The CLI's primary workflow — an agent running shell commands on the user's behalf — works out of the box on a supported OS. Today a Windows user either cannot use the exec tool at all, or must explicitly disable all sandboxing for every command, with no middle ground (no Windows Job Object / restricted-token fallback shipped).

**Benchmark.** Codex CLI and Claude Code CLI both run shell commands on Windows without requiring the user to disable all sandboxing — research/chatgpt-work-codex.md, research/shots-codex-macos-shell.md (cross-platform CLI agent baseline)

**Evidence.** Read apps/cli/src/sandbox.rs:14-35 (`SandboxType` enum + `detect()`), apps/cli/src/platform/policy/windows_sandbox.rs:76-91 (`is_available`/`install_filter`), and apps/cli/src/features/exec/tools/bash/mod.rs:172-211 (fail-closed surfacing). Cross-checked against runtime-infra.md §4, which reaches the identical conclusion and confirms the `windows-appcontainer` Cargo feature is a "stub feature gate."

**Files.**

- `apps/cli/src/sandbox.rs:14-35`
- `apps/cli/src/platform/policy/windows_sandbox.rs:76-91`
- `apps/cli/src/features/exec/tools/bash/mod.rs:172-211`

**Recommendation.** Ship a minimum-viable Windows sandbox (Job Object CPU/memory/process limits + a restricted access token) rather than leaving `SandboxType::None` as the only Windows outcome — even a partial mitigation beats a hard fail-closed block on the CLI's core workflow for an entire supported platform.

#### BACKEND-RUNTIME-002

**services/api-gateway vs apps/web API route duplication** — P2 · Backend · `architecture-gap`

**Current state.** `services/api-gateway` is a real, tested Express service with its own `agents`, `chat`, `cloudChat`, `credits`, `deviceAuth`, `llm`, `models`, `sync`, `usage` routers — a REST surface that structurally duplicates apps/web's Next.js API routes for the same concepts. It now has real Fly.io deploy jobs (`infrastructure/api-gateway/fly.{staging,production}.toml`, dated 2026-08-09) and passes CI. Mobile's `GATEWAY_URL` defaults to `https://api.agiworkforce.com`, but `apps/web/next.config.ts:94-115` proves that host is a Host-header rewrite onto the SAME Vercel/Next.js deployment (`api.agiworkforce.com/v1/chat/completions → agiworkforce.com/v1/chat/completions`), not the Fly-hosted gateway. The one distinctive thing the gateway is for — WebSocket + QR-pairing companion/remote-control — is the same feature `services/signaling-server` backs, and known-flaws.md records that feature as flag-gated off in production.

**Expected state.** One documented request path per capability. Either the gateway is retired (its REST duplication deleted, keeping only the WebSocket/QR-pairing core Vercel serverless cannot host) or it is the actual production entry point and the Next.js routes it duplicates are the ones retired — not both maintained in parallel with an ambiguous "who calls this in prod" answer.

**Benchmark.** n/a — internal architecture; neither ChatGPT nor Claude's backend topology is inspectable, this is a repo-hygiene/architecture finding, not a parity gap

**Evidence.** Read services/api-gateway/src/app.ts route mounts and services/api-gateway/src/middleware/managedComputeGate.ts (confirms it correctly mirrors apps/web's gate). Read apps/web/next.config.ts:80-115 in full — comment explicitly documents `api.agiworkforce.com` resolving to this same Vercel project via a Host-conditioned rewrite (not vercel.json, because "Vercel ignores vercel.json rewrites for Next.js projects"). Grepped apps/mobile/lib/constants.ts:18 for the gateway default. Cross-checked against docs/agent-context/known-flaws.md's SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE entry, which independently reaches the same conclusion and records this as a still-PENDING founder decision.

**Files.**

- `services/api-gateway/src/app.ts:5-20,140`
- `services/api-gateway/src/routes/{agents,chat,cloudChat,credits,llm,usage,models,sync,deviceAuth}.ts`
- `apps/mobile/lib/constants.ts:18`
- `apps/web/next.config.ts:94-115`
- `docs/agent-context/known-flaws.md:2475-2503 (SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE)`

**Recommendation.** Founder decision (already framed in known-flaws.md): pick one. Smallest slice either way — if keeping the gateway, delete its `agents/chat/cloudChat/credits/llm/usage/models` routers and leave only `pair`/`sync`(WebSocket) + `deviceAuth`; if retiring it, stop deploying `infrastructure/api-gateway/fly.*.toml` in CI and delete the Express REST duplication, keeping only the signaling-server for companion mode.

#### BACKEND-RUNTIME-003

**Desktop cloud-sync client — duplicate implementations, one dead** — P2 · Desktop (Tauri) · `dead-code`

_Screen/component:_ n/a (background sync)

**Current state.** Two independent structs named `CloudSyncClient` exist in the desktop Tauri codebase. `integrations::sync::CloudSyncClient` (`cloud.rs`) defaults its `api_endpoint` to `https://api.agiworkforce.com/api/sync` — a route that does not exist anywhere in `apps/web/app/api` (confirmed: no `app/api/sync` directory). Its owner, `SyncManager`, is instantiated only inside its own module and is never called from any `#[tauri::command]` or app-init path — it is registered (`pub mod integrations;` in lib.rs) but dead beyond compilation. The live path is a _different_ `CloudSyncClient` in `data/cloud_sync.rs`, which hits `/api/chat/sync` (a real, existing route) and is genuinely wired into `chat/conversation.rs`, `chat/persistence.rs`, `memory.rs`, `projects.rs`, and `artifacts/persistence.rs`.

**Expected state.** One `CloudSyncClient` per concept. A maintainer searching "CloudSyncClient" today gets two same-named, differently-behaved hits, one of which targets a URL that 404s.

**Benchmark.** n/a — internal dead-code hygiene, not a competitor comparison

**Evidence.** `grep -rln "integrations::sync\|SyncManager" apps/desktop/src-tauri/src --include="*.rs"` outside `integrations/sync/` itself → zero hits. `find apps/web/app/api/sync -type f` → no such path. `grep -rln "data::cloud_sync\|use.*cloud_sync" apps/desktop/src-tauri/src` → 5 real command-module callers. Independently corroborated: `docs/agent-context/known-flaws.md` entry `BYOK-RUST-EGRESS-01` already traced this exact pair and concluded `integrations/sync` ("the real cloud-sync/device client... via SyncManager) is DORMANT — declared but never instantiated and not exposed by any #[tauri::command]" — confirming this finding from an independent (security) audit pass.

**Files.**

- `apps/desktop/src-tauri/src/integrations/sync/cloud.rs:22`
- `apps/desktop/src-tauri/src/integrations/sync/manager.rs`
- `apps/desktop/src-tauri/src/data/cloud_sync.rs:2087`
- `apps/web/app/api/chat/sync/route.ts`

**Recommendation.** Delete `apps/desktop/src-tauri/src/integrations/sync/{cloud.rs,manager.rs}` (and its dead `SyncManager`/`CloudSyncConfig` types) or, if a second sync transport is genuinely planned, rename it away from the collision and point it at a route that exists.

#### BACKEND-RUNTIME-004

**Device pairing — two parallel, near-identical auth flows** — P2 · Backend · `architecture-gap`

**Current state.** Two independent device-pairing systems coexist with overlapping purpose: `auth/device/{code,approve,token,refresh}` implements RFC 8628 CLI OAuth device-code flow (`XXXX-XXXX` alphanumeric codes, `device_authorization_codes` table), used by `packages/client/client-runtime/src/deviceAuthorization.ts` and desktop's `accountBridge.ts`/`cloudAccountAuth.ts`. `device/{link,poll,approve}` implements QR-code device linking (hex codes via the `qrcode` package, `device_pairings` table, its own `device-token-crypto.ts`). Both validate CSRF and rate-limit independently, and use distinct code-format regexes (`^[A-Z0-9]{4}-[A-Z0-9]{4}$` vs `^[A-F0-9]+$`).

**Expected state.** A maintainer editing "device approve" logic should not be able to silently edit the wrong flow. Either the two flows are consolidated onto one code-format/validation module with a shared regex constant, or the route trees are named distinctly enough (`auth/device/*` vs `pairing/qr/*`) that the near-homograph pairing (`auth/device/approve` vs `device/approve`) cannot be mistaken for the same endpoint.

**Benchmark.** n/a — internal architecture; not directly benchmarked against a competitor surface

**Evidence.** Directory listing of both route trees confirmed both exist with the stated shapes. Read `apps/web/db/neon/0077_gateway_compatibility_tables.sql:64` for the `device_pairings` table. This item was explicitly named in the audit brief as requiring verification; confirmed as described in `audit/parity-2026-08-15/inventory/web-backend.md` §10, not merely restated from it — both route directories and both tables were independently listed and read.

**Files.**

- `apps/web/app/api/auth/device/{code,approve,token,refresh}/route.ts`
- `apps/web/app/api/device/{link,poll,approve}/route.ts`
- `apps/web/db/neon/0077_gateway_compatibility_tables.sql:64`

**Recommendation.** Not proven broken today, so no urgent fix — but consolidate the code-format validation (one shared regex/constant module used by both) as a low-risk hardening step, and rename the QR flow's routes to remove the `device/*` vs `auth/device/*` near-collision.

#### BACKEND-RUNTIME-005

**Organization invitation expiry cron** — P2 · Backend · `reliability-gap`

**Current state.** `cron/expire-organization-invitations/route.ts` exists, is well-built (idempotent, bounded by `status='pending' and expires_at<=now()`), and its own comment states the stakes precisely: "A pending invitation HOLDS a licensed seat... If nothing ever flips a lapsed invitation to 'expired', that seat is never returned and a team silently locks itself out of the seats it paid for." `vercel.json`'s `crons` array has exactly 9 entries and this route is not one of them — confirmed by listing all 9 scheduled paths directly from the file.

**Expected state.** Every cron route the product depends on for correctness has a schedule entry. The invite-path already does a lazy expire-on-consume as a partial mitigation, but the durable sweep this route exists for never runs, so an organization that stops actively inviting people keeps paying for seats occupied by invitations nobody will ever accept.

**Benchmark.** n/a — internal reliability gap, not a competitor feature comparison

**Evidence.** Read the full route file (its own docstring states the business impact). Parsed `vercel.json`'s `crons` array with `python3 -c "json.load(...)"` and enumerated all 9 paths — `expire-organization-invitations` is absent from the list.

**Files.**

- `apps/web/app/api/cron/expire-organization-invitations/route.ts`
- `vercel.json`

**Recommendation.** Add `{"path": "/api/cron/expire-organization-invitations", "schedule": "0 5 * * *"}` (or any unused daily slot) to `vercel.json`'s `crons` array — a one-line fix for a self-documented seat-lock bug.

#### BACKEND-RUNTIME-006

**No vector storage / retrieval backend; embeddings endpoint has zero internal callers** — P2 · Backend · `backend-gap`

**Current state.** `POST /api/llm/v1/embeddings` (306 lines) is a real, fully-billed OpenAI-compatible embeddings generation endpoint — but grep confirms it has no caller anywhere else in the repo (its own docstring says it "adds a capability rather than repairing a false claim"; it exists purely as an external API surface). Search (`/api/search`) and memory search (`/api/memory/search`) are both plain Postgres `ILIKE` text matching — the latter's own docstring says "Simple ILIKE text search - can be upgraded to vector similarity later." No migration under `apps/web/db/neon/*.sql` declares a `vector` column type or a `pgvector` extension. Project knowledge files are parsed and stuffed verbatim (truncated to a budget) into every project turn's prompt rather than retrieved by relevance.

**Expected state.** The raw material for RAG (a working embeddings endpoint) exists but nothing in the product stores or queries a vector index. Closing this at the storage layer (pgvector column + ANN index + a retrieval query path) is the prerequisite every other RAG-shaped gap in this audit round (semantic search, project-knowledge relevance, memory retrieval) is blocked on.

**Benchmark.** Claude Projects' auto-RAG beyond the 200K context window; ChatGPT Projects' knowledge-base retrieval — research/cross-cutting-and-complaints.md §1 ("Projects" row)

**Evidence.** Read apps/web/app/api/llm/v1/embeddings/route.ts docstring and confirmed zero internal callers via `grep -rln "llm/v1/embeddings"` (only `.next` generated type files and its own route-contract entry matched). Read apps/web/app/api/memory/search/route.ts docstring. Grepped every `apps/web/db/neon/*.sql` for `vector` type declarations — none found. Read the project-knowledge-extraction.ts:270 comment confirming verbatim prompt-stuffing.

**Files.**

- `apps/web/app/api/llm/v1/embeddings/route.ts`
- `apps/web/app/api/memory/search/route.ts`
- `apps/web/app/api/search/route.ts`
- `apps/web/db/neon/*.sql`

**Recommendation.** This is the shared backend prerequisite for the sibling gaps SEARCH-RESEARCH-004 (semantic/vector search) and PROJECTS-FILES-002 (silent knowledge-context truncation) filed in this same audit round — build one pgvector-backed store (chunk + embed via the already-built embeddings endpoint + ANN query) and let both consume it, rather than two separate retrieval implementations.

#### BACKEND-RUNTIME-010

**Linux seccomp sandbox built and tested but not shipped** — P2 · CLI · `reliability-gap`

**Current state.** A second, separate Linux sandbox implementation exists using the `seccompiler` crate for in-process seccomp-BPF filtering (`linux_sandbox.rs`), distinct from the shipped `bwrap`-wrapping path. It sits behind a Cargo feature, `linux-seccomp`, which is not in the crate's default feature set (`default = []`) and is not passed by the release build workflow (`cargo build --release --target ${{ matrix.target }} -p agiworkforce-cli`, no `--features`). The shipped Linux CLI binary therefore relies entirely on an externally-installed `bwrap` binary being present on PATH; if it is absent, `SandboxType::detect()` falls to `None` and the exec tool fails closed (same mechanism as BACKEND-RUNTIME-009, minus the Windows-specific "never implemented" caveat — here the code exists, it is simply not compiled in).

**Expected state.** A Linux user without `bwrap` installed (common on minimal containers/distros) gets no sandboxed exec at all, even though a working alternative sandbox implementation exists in the same codebase and is presumably tested.

**Benchmark.** n/a — internal build-configuration gap, not a competitor feature comparison

**Evidence.** Read apps/cli/Cargo.toml's `default = []` feature declaration and confirmed `linux-seccomp` is a named-but-non-default feature. Read `.github/workflows/release-cli.yml:191`'s exact `cargo build` invocation — no `--features` flag present. Cross-checked against runtime-infra.md §1/§4, which independently reaches the same conclusion.

**Files.**

- `apps/cli/src/platform/policy/linux_sandbox.rs`
- `apps/cli/Cargo.toml`
- `.github/workflows/release-cli.yml:191`

**Recommendation.** Either add `linux-seccomp` to the release build's `--features` list (after confirming its test suite is green) so `bwrap`-less environments get a real fallback, or document explicitly that `bwrap` is a hard runtime dependency on Linux and add an install-time check that surfaces a clear "install bubblewrap" message instead of the generic "sandbox not available" error.

#### BACKEND-RUNTIME-011

**CI never runs the full Rust workspace test suite** — P2 · CLI · `reliability-gap`

**Current state.** The main Linux CI job runs `cargo test -p agiworkforce-desktop --lib` and `cargo test -p agiworkforce-cli` only — scoped to two binary crates' own unit tests, with a comment explaining this was to route around "the 100+ ported codex-rs crates'" pre-existing test regressions. That comment is now stale: `Cargo.toml:7-13` records the crate count was pruned to 12 on 2026-07-08, and the referenced tracking issue `FIX-021` does not appear anywhere in known-flaws.md, PLAN.md, or CHANGELOG.md. The only wider Rust checks are `cargo check --workspace` (compiles but never runs a test) and a Windows job's `cargo test --workspace --lib` (restricted to in-source `#[cfg(test)]` unit tests only — never the separate `crates/*/tests/*.rs` integration suites for `agiworkforce-mcp`, `agiworkforce-protocol`, `agiworkforce-llm`, `agiworkforce-agent-core`, `agiworkforce-app-server`, `agiworkforce-command-registry`, `agiworkforce-model-registry`, all of which exist on disk).

**Expected state.** No production CI job runs `cargo test --workspace` (all targets, all crates) on any platform. Given `agiworkforce-mcp` carries the RFC 9728/8414/7591 OAuth PKCE flow and `agiworkforce-llm`/`agiworkforce-protocol` carry SSE stream decoding and JSON-RPC framing — both security- and correctness-sensitive — their integration-test suites are compiled but their pass/fail status is not gated anywhere in the release pipeline.

**Benchmark.** n/a — internal CI-coverage gap, not a competitor feature comparison

**Evidence.** Read .github/workflows/ci.yml:396-433 (the stale "100+ crates" comment plus the two scoped `cargo test -p` invocations) and :929-981 (Windows job's `--lib`-restricted `cargo test --workspace`). Confirmed via `grep -c` that Cargo.toml's workspace members list is 12 crates, not 100+. Searched known-flaws.md, PLAN.md, CHANGELOG.md for `FIX-021` — zero hits. Listed `crates/*/tests/*.rs` directories to confirm the integration-test files exist on disk and would be skipped by `--lib`.

**Files.**

- `.github/workflows/ci.yml:396-433`
- `.github/workflows/ci.yml:929-981`

**Recommendation.** Add one CI step: `cargo test --workspace` (no `--lib` restriction) on at least the primary Linux runner, gated the same way the two scoped `cargo test -p` invocations already are. Update or remove the stale "100+ crates" comment either way.

#### BACKEND-RUNTIME-007

**Enterprise-Local licensing verification — built twice, wired nowhere** — P3 · Shared packages · `dead-code`

**Current state.** A complete offline license/org-policy verification system exists in two languages: TypeScript (`packages/contracts/licensing`: `verifyLicense`, `verifySignedContainer`, `verifyOrgPolicy`, Ed25519-signed JWT-shaped containers) and a byte-for-byte Rust re-implementation (`crates/agiworkforce-licensing`) whose own module doc states plainly: "It is NOT wired into any app/desktop/CLI/gateway runtime." Grep confirms zero non-test callers of `verifyLicense`, `verifySignedContainer`, or `verifyOrgPolicy` anywhere in apps/web, apps/desktop, apps/cli, or services — and zero non-self importers of `@agiworkforce/licensing` or `agiworkforce-licensing` repo-wide.

**Expected state.** Either this feature is on a founder-gated roadmap and should stay exactly as-is (a defensible position, matching the `docs/decisions/2026-07-30-enterprise-local-verifier-retention.md` retention rationale the code cites), or it should be deleted. Today it is fully-built, cross-language-consistent, and completely inert — a real maintenance cost (two implementations must be kept in sync via a shared fixture corpus for a capability nothing calls).

**Benchmark.** n/a — no direct competitor equivalent to compare against; this is a repo-hygiene finding

**Evidence.** Read crates/agiworkforce-licensing/src/lib.rs's module doc (self-documents as unwired). Read packages/contracts/licensing/src/{verify,container,org-policy}.ts to confirm the exported function names, then ran `grep -rln "verifyLicense\|verifySignedContainer\|LicenseVerdict"` and `grep -rl "@agiworkforce/licensing"` across apps/web, apps/desktop, apps/cli, services, excluding the package's own directory and test files — zero hits in both languages.

**Files.**

- `crates/agiworkforce-licensing/src/lib.rs:19-21`
- `packages/contracts/licensing/src/verify.ts:57`
- `packages/contracts/licensing/src/container.ts:69`
- `packages/contracts/licensing/src/org-policy.ts:293`

**Recommendation.** Confirm with the founder decision referenced in docs/decisions/2026-07-30-enterprise-local-verifier-retention.md whether this is intentionally pre-built-ahead-of-need; if so, record that explicitly in the Rust crate's doc comment (it already says so) and leave as-is with a tracked TODO for activation, rather than letting it read as accidental dead code to the next engineer who finds it.

#### BACKEND-RUNTIME-008

**Orphaned billing/usage alias routes** — P3 · Web · `dead-code`

**Current state.** Four separate routes (`billing/analytics`, `usage/analytics`, `usage/history`, `usage/providers`) each wrap the identical `getManagedUsageSummary(userId)` call, and each docstrings itself as a "Legacy alias." `billing/analytics` is genuinely called by desktop (`apps/desktop/src/stores/billingUsage.ts`). `usage/analytics`, `usage/history`, and `usage/providers` have zero callers anywhere — confirmed via grep across apps/web, apps/desktop, apps/mobile (only `.next` generated type-check artifacts matched). The live web Settings > Usage panel calls the base `/api/usage` route, none of these three.

**Expected state.** Three routes serving an identical response shape with no caller is unnecessary surface area to keep authenticated, rate-limited, and security-reviewed.

**Benchmark.** n/a — internal dead-code hygiene

**Evidence.** Read all four route files' docstrings (self-labeled "Legacy alias"). Ran `grep -rln "<route>"` for each of the four paths across apps/web, apps/desktop, apps/mobile excluding `.next` build output and test files — only `billing/analytics` matched a real caller (`billingUsage.ts`).

**Files.**

- `apps/web/app/api/usage/analytics/route.ts`
- `apps/web/app/api/usage/history/route.ts`
- `apps/web/app/api/usage/providers/route.ts`
- `apps/web/app/api/billing/analytics/route.ts`
- `apps/web/lib/services/managed-usage-summary-service.ts`

**Recommendation.** Delete `usage/analytics`, `usage/history`, `usage/providers` (zero callers, confirmed dead) and keep `billing/analytics` (desktop still depends on it) until desktop migrates to the base `/api/usage` route.

#### BACKEND-RUNTIME-012

**No error-tracking/APM on backend services; api-gateway has no /metrics** — P3 · Backend · `reliability-gap`

**Current state.** `services/signaling-server` exposes real Prometheus-format metrics (`services/signaling-server/src/metrics.ts`: connection/session/message/error/pairing counters, uptime, memory gauges) at `/metrics`. `services/api-gateway` has no equivalent — only `/health`/`/ready`, confirmed by grepping its route/app files for a `/metrics` mount. Neither service's `package.json` references Sentry or any other error-tracking SDK.

**Expected state.** Both backend services should have comparable operational visibility. If api-gateway is kept in production (see BACKEND-RUNTIME-002), it needs the same request/error metrics its sibling service already has; either way, a production Express/Node service handling auth, billing, and chat traffic should forward exceptions to an APM tool rather than only local pino logs.

**Benchmark.** n/a — internal observability gap, not a competitor feature comparison

**Evidence.** Grepped services/api-gateway/src for `/metrics`, `prom-client`, `register.metrics` — zero hits, versus a direct read of services/signaling-server/src/metrics.ts showing a full metrics implementation. Grepped both services' package.json for `sentry` — zero hits in either.

**Files.**

- `services/api-gateway/package.json`
- `services/signaling-server/src/metrics.ts:1-13`
- `services/api-gateway/src/app.ts`

**Recommendation.** Add a `/metrics` endpoint to api-gateway using the same `prom-client`-style pattern signaling-server already uses, and wire a Sentry (or equivalent) DSN into both services' error handlers — small, mechanical additions given the pattern already exists in-repo.

#### BACKEND-RUNTIME-013

**Legacy/dead database tables and an authored-but-unapplied schema migration** — P3 · Backend · `architecture-gap`

**Current state.** Nine tables (`agent_tools`, `agent_tool_executions`, `agent_approval_requests`, `chat_messages`, `chat_folders`, `message_bookmarks`, `message_reactions`, `user_shortcuts`, `messaging_connections`) are touched by exactly one code path each: the GDPR/DPDP account-erasure sweep in `account-erasure.ts` — confirmed by grepping each table name for non-test/non-migration references (each returns exactly 1: the erasure file). Two tables (`referrals`, `cloud_waitlist`) have zero application-code references at all; `waitlistService.ts:10-12`'s own comment names `cloud_waitlist` as "the older... table, not `cloud_managed_waitlist`", confirming it was superseded. A migration, `0058_drop_legacy_teams.sql`, is fully written to drop the also-fully-dead `teams`/`team_members` pair, but its own header states: "FOUNDER-GATED: this migration is NOT applied by this change... Applying it to any database... is an explicitly-gated, separate, founder-run step."

**Expected state.** This is legitimate, well-managed technical debt — the erasure-only tables are correctly kept alive for compliance completeness, and the unapplied migration is correctly gated rather than silently run. The gap is purely tracking risk: an authored-but-never-executed migration is easy to lose track of, and 11 total dead/near-dead tables (9 erasure-only + 2 fully dead) add schema surface with no live feature behind them.

**Benchmark.** n/a — internal schema-hygiene finding, explicitly requested for verification in this audit's brief

**Evidence.** For each of the 9 tables, ran `grep -rl "\b<table>\b" apps/web --include="*.ts" --include="*.tsx" | grep -v '\.test\.\|db/neon/'` and confirmed exactly 1 hit (account-erasure.ts) per table. Ran the same for `referrals` (0 hits) and `cloud_waitlist` (1 hit, the comment in waitlistService.ts explaining the supersession, not a query). Read `0058_drop_legacy_teams.sql:1-30` in full for the founder-gate language.

**Files.**

- `apps/web/lib/server/account-erasure.ts:60-91`
- `apps/web/db/neon/0058_drop_legacy_teams.sql:1-30`
- `apps/web/lib/services/waitlistService.ts:10-12`

**Recommendation.** No urgent action — confirmed correctly gated. Add a single tracked line item (e.g. in known-flaws.md or a schema-debt doc) listing all 11 tables and the pending 0058 migration together, so the founder-run drop step and the erasure-only retention list don't require re-discovery by the next auditor.

### Composer

_8 gaps · source: `gaps/domain-composer.json` · narrative: `gaps/domain-composer.md`_

#### COMPOSER-001

**Composer architecture — four independent implementations** — P1 · Cross-surface · `architecture-gap`

_Screen/component:_ Main chat composer, every surface

**Current state.** There is no single composer component. Web's primary chat surface (`/chat`, `/chat/[sessionId]`) renders a 3,621-line locally-owned `ChatComposerNew.tsx` plus a 1,019-line `ComposerFooter.tsx`. Desktop and web's secondary `/agi-work`/`/chat/code` routes render `packages/ui/unified-chat`'s 1,422-line `ChatInput.tsx` + `AttachmentMenu.tsx` (~470 lines) — genuinely shared code, but a second, independent codebase from web's primary composer, sharing only the slash-command registry (`packages/ui/unified-chat/src/lib/slashCommands.ts`) and a few type-only imports. Mobile's `ChatInput.tsx` (1,249 lines) + `AddToChatSheet.tsx` (~500 lines) is a from-scratch React Native implementation with zero code overlap with either web implementation. The Chrome extension's composer is hand-written vanilla DOM/TS inside `side_panel.ts` (10,933 lines total), which contains a code comment at line 9352-9354 stating it 'Mirrors packages/ui/unified-chat/ChatInput.tsx' — i.e. behavior is manually re-derived from reading the shared component's source, not imported, so any change to the shared package's paste/drop/attach logic requires a human to notice and hand-port it to the extension. Verified directly: the extension imports zero `@agiworkforce/*` UI packages (`apps/extension/package.json` has no `@agiworkforce/unified-chat` dependency), and mobile cannot import the web-only React package at all (it pulls `react-dom`, per `apps/mobile/src/lib/capabilities.tsx:5-7`). This produces measurable, verified drift: large-paste-to-attachment conversion (COMPOSER-002), Library-reuse attachment (COMPOSER-003), and image/video generation mode (COMPOSER-004) each exist in some of the four implementations and not others, with no structural mechanism to keep them in sync.

**Expected state.** A single composer control surface (or, if per-platform rendering genuinely requires separate React/React-Native/vanilla-DOM trees, a single source of truth for composer _behavior_ — paste handling, attachment policy, slash-command execution, queue semantics — that each renderer calls into) so a fix or feature lands once and reaches every surface. Neither ChatGPT nor Claude ships four independently-authored input bars with visibly different capability sets between its own web, desktop, and browser-extension surfaces for the same account.

**Benchmark.** Internal architecture bar — Claude and ChatGPT each maintain one composer behavior contract across web/desktop/extension (per `research/cross-cutting-and-complaints.md` §5, the only documented cross-surface composer inconsistencies for either competitor are narrower, e.g. ChatGPT's missing Chat-mode-on-desktop bug), not a benchmark UI to clone.

**Evidence.** Read all four composer implementations in full or via targeted grep (control-by-control matrix in domain-composer.md). Verified line counts via `wc -l`. Verified the extension has zero `@agiworkforce/unified-chat`/`@agiworkforce/ui` imports via `apps/extension/package.json` and file-level grep. Verified mobile's non-adoption reason via `apps/mobile/src/lib/capabilities.tsx:5-7`. Cross-checked against `audit/parity-2026-08-15/inventory/shared-packages.md` §0, which independently reaches the same 'four parallel chat implementations' conclusion from a different angle (consumer-count audit) — this gap is the composer-specific instance of that repo-wide finding, verified fresh by directly reading composer source rather than trusting the inventory doc.

**Files.**

- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- `packages/ui/unified-chat/src/components/ChatInput.tsx`
- `packages/ui/unified-chat/src/components/AttachmentMenu.tsx`
- `apps/mobile/src/features/chat/components/ChatInput.tsx`
- `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`
- `apps/extension/src/side_panel.ts:9330-9470`

**Recommendation.** Do not attempt a big-bang unification. Smallest end-to-end slice: extract the paste/drop/attachment-policy logic that COMPOSER-002/003 show has already drifted into a pure, framework-neutral module (mirroring how `slashCommands.ts` is already framework-neutral and successfully shared by web+desktop today) under `packages/ui/unified-chat/src/lib/`, have web's primary composer and the shared `ChatInput.tsx` both call it, and give the Chrome extension a documented, tested port instead of a comment-only mirror. Treat mobile's separate RN implementation as permanently distinct (justified), but hold IT to behavioral parity via a shared fixture/contract test (the pattern `packages/client/sync` already uses for its Rust/TS split) rather than independent judgment calls.

#### COMPOSER-002

**Large-paste-to-attachment conversion** — P1 · Web · `frontend-gap`

_Screen/component:_ Chat composer text field

**Current state.** Web's `handlePaste` (`ChatComposerNew.tsx:1090-1109`) and the shared package's identical `handlePaste` (`ChatInput.tsx:740-762`) both inspect `clipboardData.items` for `kind === 'file'` only — i.e. they convert a pasted _image/file_ into an attachment, but a comment on web's handler states the design intent explicitly: 'so pasting text still inserts text' (line 1104). Pasting 20,000 characters of code or a long document dumps the entire raw text into the textarea with no size check anywhere in either file. The Chrome extension's paste handler (`side_panel.ts:9356-9372`) has the identical file-only-paste restriction. Only mobile implements the conversion: `ChatInput.tsx:67` defines `LARGE_PASTE_THRESHOLD = 10_000` with a doc comment ('converted into a compact "Pasted text" attachment instead of flooding the composer... like ChatGPT/Claude mobile') and wires it at lines 445 and 461.

**Expected state.** Pasting more than ~10,000 characters of plain text anywhere in the product converts the paste into a removable 'Pasted text' attachment chip instead of flooding the input field with raw text — matching ChatGPT's documented behavior and matching what this codebase's own mobile team already built and labeled as parity work.

**Benchmark.** ChatGPT web/desktop composer — 'If you paste more than ~10,000 characters, ChatGPT auto-converts the paste into a file attachment instead of inserting raw text, to keep the composer clean' (`research/chatgpt-web-desktop.md:55`).

**Evidence.** Read `handlePaste` in `ChatComposerNew.tsx` (web) and `ChatInput.tsx` (shared package) in full — both only branch on `item.kind === 'file'`; the only clipboard-text handling anywhere is the browser's own default paste-into-textarea behavior, confirmed by the explicit code comment 'so pasting text still inserts text' at web's line 1104. Grepped `apps/extension/src/side_panel.ts` for `paste`/`clipboard` and read the one paste listener at line 9356 — same file-only restriction, no character-count branch. Confirmed the counter-example on mobile by reading `LARGE_PASTE_THRESHOLD` and its two call sites in `apps/mobile/src/features/chat/components/ChatInput.tsx`.

**Files.**

- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1090-1109`
- `packages/ui/unified-chat/src/components/ChatInput.tsx:740-762`
- `apps/extension/src/side_panel.ts:9356-9372`
- `apps/mobile/src/features/chat/components/ChatInput.tsx:64-67,435-461`

**Recommendation.** Port mobile's `LARGE_PASTE_THRESHOLD` logic (already written, tested, and shipped on one surface) into a framework-neutral helper under `packages/ui/unified-chat/src/lib/` — take pasted text length, and above the threshold return a synthetic `File` (e.g. `pasted-text.txt`) instead of the raw string — then call it from web's `handlePaste`, the shared `ChatInput.tsx`'s `handlePaste`, and the extension's paste listener. This is the highest-value single slice in this domain: one function, four call sites, closes the largest surface-count gap found.

#### COMPOSER-004

**Image and video generation mode** — P1 · Desktop (Tauri) · `missing-capability`

_Screen/component:_ Desktop chat composer

**Current state.** Web's primary composer has explicit `imageMode`/`videoMode` state (`ChatComposerNew.tsx:801,809`) gated on `canUseImageGeneration`/catalog-driven `availableImageModels`/`availableVideoModels` (`:817-821`), with dedicated aspect-ratio and model controls once selected, and a real backend (`app/api/media/{image,video}/generate/route.ts`, confirmed live in `audit/parity-2026-08-15/inventory/web-frontend.md` §3.2 as 'COMPLETE, not UI-only'). Mobile has the equivalent: `apps/mobile/src/features/chat/actions/mediaMode.ts` implements a real image/video mode switch (`'video_generation'` capability key, per-mode model resolution, `getImageAspectOptionsForModel`/`getVideoAspectOptionsForModel`/`getVideoQualityOptionsForModel` imports in `AddToChatSheet.tsx:25-28`), surfaced via `MediaModeChip.tsx`. The shared `packages/ui/unified-chat` package — the composer desktop actually renders — has none of this: a repo-wide search of every file under `packages/ui/unified-chat/src/` for `imageMode`/`videoMode`/`aspectRatio`/`ImageMode`/`VideoMode` returns zero component-level matches (only an unrelated SVG `preserveAspectRatio` string and test-file references). The package does have an `/image` entry in `BUILT_IN_SLASH_COMMANDS` ('Generate an image', `slashCommands.ts:75-81`), but `registerBuiltinSlashCommands()` never registers an `'image'` handler (only `rewind`/`plan`/`clear`/`model`/`memory`/`help` get real handlers) and `ChatInput.tsx` never special-cases the `'image'` command id — so `/image` is a prompt-text template, not a mode toggle, and produces none of web/mobile's aspect-ratio/model-lock UI. `apps/desktop/src/features/media/MediaGenerationProgress.tsx` only renders an in-flight progress indicator given an already-known `type: 'image' | 'video'` prop; nothing in `apps/desktop/src` triggers it from the composer. Desktop is the one surface of the four with no way to explicitly enter an image- or video-generation turn from the composer at all.

**Expected state.** Desktop's composer (and any other host of the shared `unified-chat` package) exposes the same explicit image/video generation mode — with model and aspect-ratio selection — that web's primary composer and mobile already ship, since Desktop is the flagship, unconditional adopter of this shared package per `audit/parity-2026-08-15/inventory/shared-packages.md` §0.

**Benchmark.** Claude Desktop and ChatGPT desktop/macOS both expose image generation directly from the composer/attach flow (`research/claude-web-desktop.md` §2 Style/attach rows; `research/shots-chatgpt-web-macos.md` §3.4 Plugins list includes dedicated creation tools); AGI Workforce's own web and mobile surfaces already meet this bar, making Desktop's gap an internal-consistency failure, not just a competitor gap.

**Evidence.** Ran `grep -rln -i "imageMode|videoMode|image.*generation.*mode|video.*generation.*mode|aspectRatio|StyleSelector" packages/ui/unified-chat/src/` (repo-wide, not just ChatInput.tsx, after an earlier narrower grep on ChatInput.tsx alone risked under-counting features that live in AttachmentMenu.tsx — verified this risk was real by finding the Style selector there, see below) and confirmed zero component-level image/video-mode matches. Read `slashCommands.ts` in full: `BUILT_IN_SLASH_COMMANDS` array (display metadata only) vs. `registerBuiltinSlashCommands()` (actual handlers) are two different lists; `'image'` is in the first, absent from the second. Grepped `ChatInput.tsx` for the string `'image'`/`"image"` — zero hits, confirming no command-id special-casing. Read `MediaGenerationProgress.tsx` in full (pure presentational component, `type` prop supplied by caller) and grepped `apps/desktop/src` for any composer-level trigger — none found. Cross-checked mobile's real image/video mode via `apps/mobile/src/features/chat/actions/mediaMode.ts:4-61` and web's via `ChatComposerNew.tsx:801-821`, both confirmed wired to real backend routes per `web-frontend.md` §3.2.

**Files.**

- `packages/ui/unified-chat/src/components/ChatInputToolbar.tsx`
- `packages/ui/unified-chat/src/components/AttachmentMenu.tsx`
- `packages/ui/unified-chat/src/components/ModelSelector.tsx`
- `packages/ui/unified-chat/src/lib/slashCommands.ts:75-81`
- `apps/desktop/src/features/media/MediaGenerationProgress.tsx`
- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:801,809,817-821`

**Recommendation.** Add an explicit image/video mode to `ChatInputToolbar.tsx`/`AttachmentMenu.tsx`, modeled on mobile's `mediaMode.ts` (the smallest existing reference implementation — it is pure TS, not RN-specific, and already resolves per-mode models/aspect options from the catalog). Wire it to the same `app/api/media/{image,video}/generate` routes web already calls; desktop's Tauri IPC layer can proxy the same managed-cloud request web's Next.js route makes, since desktop already brokers managed-cloud chat traffic through comparable paths.

#### COMPOSER-003

**Attach from Library (reuse a previously-uploaded or generated file)** — P2 · Web · `missing-capability`

_Screen/component:_ Chat composer attach ('+') menu

**Current state.** Web ships a dedicated Library surface (`/chat/library`, `LibraryView.tsx`, fetching `/api/library` and `/api/media` per `audit/parity-2026-08-15/inventory/web-frontend.md` §4) that lists every file a user has uploaded or the model has generated — but the composer's attach menu (`ChatComposerNew.tsx`, `AnchoredComposerMenu.tsx`) has no 'attach from Library' entry anywhere; a user who wants to re-send a file they already uploaded in another conversation must re-upload it from disk. The same is true of the shared `AttachmentMenu.tsx` used by desktop: its menu items are 'Add files or photos', 'Record a skill', 'Add to project', 'Add from Google Drive', 'Add from GitHub', 'Skills', 'Connectors', 'Search the web', 'Research', 'Run code', 'Use style' — Google Drive/GitHub cover _external_ re-sourcing but there is no in-app-Library reuse entry. Mobile, by contrast, already has this: `AddToChatSheet.tsx` accepts an `onAttachFromLibrary` prop, computes `libraryDocuments` from the mode-scoped local/cloud store, and renders an 'Attach from Library' section (lines 439-464) that lets the user pick a prior document without re-uploading.

**Expected state.** The attach menu on every surface offers 'Add from Library' alongside the file picker, matching ChatGPT's composer and matching what mobile already ships in this same codebase.

**Benchmark.** ChatGPT web/desktop — 'Add from Library... pick a previously-uploaded/generated file from Library instead of re-uploading' (`research/chatgpt-web-desktop.md:21,52`).

**Evidence.** Grepped `ChatComposerNew.tsx` and `AnchoredComposerMenu.tsx` for `library`/`recentFiles`/`from library` — zero hits. Read `AttachmentMenu.tsx` in full (all `label="..."` menu-item strings extracted) — nine items, none referencing the in-app Library. Read `AddToChatSheet.tsx:1-270,439-464` confirming the mobile counterpart is real and wired (`useMemo`-computed `libraryDocuments`, a `handleAttachFromLibrary` callback, a rendered list with accessibility labels), not a stub.

**Files.**

- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- `apps/web/features/chat/components/Composer/AnchoredComposerMenu.tsx`
- `packages/ui/unified-chat/src/components/AttachmentMenu.tsx`
- `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:63,213,256-269,439-464`

**Recommendation.** Add an 'Add from Library' menu item to `AnchoredComposerMenu.tsx` (web) and `AttachmentMenu.tsx` (shared package) that opens a picker over the same `/api/library`/`/api/media` data `LibraryView.tsx` already fetches, converting a selected library entry into an attachment via the existing `addChatAttachments` path — no new backend endpoint required, since the data source already exists and mobile's implementation proves the UX pattern works.

#### COMPOSER-005

**Follow-up message queue capacity and editing** — P2 · Web · `partial-implementation`

_Screen/component:_ Chat composer, while a response is streaming

**Current state.** Web implements a real follow-up queue: typing and sending while a response streams stores the draft in `pendingQueueRef` and shows a `queuedPreview`/`queuedToolsLabel` chip (`ChatComposerNew.tsx:400-407,1713-1717`), flushed automatically when the active turn finishes (`:1796-1846`). But the queue holds exactly one slot: the code comment at line 1706 states outright 'Only the latest queued message is kept', and a second send-while-queued overwrites the pending draft rather than adding a second entry. The only control on a queued message is `cancelQueuedMessage` (`:1848-1852`, clears it entirely) — there is no way to edit the queued text in place, reorder it against anything (moot with one slot), or send it immediately without waiting for the current turn.

**Expected state.** Multiple messages can be queued while a turn streams, each visible as its own row with independent Edit-in-composer / Send-now / Remove actions and drag-to-reorder, matching Claude's documented behavior — or, at minimum, the single-slot design should let the user edit the queued draft in place rather than only cancel-and-retype.

**Benchmark.** Claude web/desktop — 'sending mid-response now queues the message rather than showing a separate Queue button... Queued messages support drag-to-reorder, and per-row Edit-in-composer/Send-now/Remove actions' (`research/claude-web-desktop.md:41`).

**Evidence.** Read the full queue lifecycle in `ChatComposerNew.tsx`: state declaration (`:389-407`), enqueue path with the explicit single-slot comment (`:1704-1721`), flush-on-turn-finish (`:1796-1846`), and cancel (`:1848-1852`). No `editQueuedMessage`, no array/list state, no reorder handler exists anywhere in the file (grepped `queue` — 54 hits, all consistent with a single `pendingQueueRef` object, never an array).

**Files.**

- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:389-407,1704-1721,1848-1867`

**Recommendation.** Change `pendingQueueRef` from a single object to an array, render each queued item as its own dismissible row above the composer (reusing the existing `queuedPreview` chip pattern per-row), and add an inline edit affordance that repopulates the textarea with the queued item's content and args, replacing that slot on re-send rather than appending. Reorder can ship later; the highest-value slice is (a) multiple slots and (b) edit-in-place.

#### COMPOSER-006

**Follow-up message queue while streaming** — P2 · Mobile · `broken-workflow`

_Screen/component:_ Chat composer, while a response is streaming

**Current state.** Mobile's send/stop button unconditionally routes to `onStop()` while `isStreaming` is true (`ChatInput.tsx:669-675`: `if (isStreaming) { onStop?.() } else { handleSend() }`), with no path that queues a typed follow-up for automatic delivery once the active turn finishes — the TextInput itself stays editable during streaming (no `editable={!isStreaming}` guard found), so a user can type ahead, but pressing the only send-capable control stops the current generation instead of queuing the draft, requiring a stop-then-send double interaction. The `queueSize`/offline-queue concept that does exist in this file (`:123-126`) is a reconnect retry queue for offline sends, a different mechanism. Confirms at the store level: `chatExecutionStore.ts`'s `sendMessage` (`:803-839`) calls `getMobileSendQueue().enqueue(...)`/`.dequeue()` purely for rate-limit/backpressure ('lane at capacity'), then immediately `existingController.abort()`s any in-flight stream for that conversation (`:835-838`) rather than deferring the new send until the existing stream completes — there is no 'wait for this turn, then send' semantics anywhere in the mobile execution store, unlike web's/desktop's genuine post-stream flush (COMPOSER-005's `pendingQueueRef`/`AttachmentMenu` equivalent).

**Expected state.** Typing a follow-up while the assistant is responding and tapping send queues it for automatic delivery when the current turn completes — the same behavior web and desktop's shared composer already implement — rather than requiring the user to first stop the response and then re-send.

**Benchmark.** Claude mobile / ChatGPT mobile — sending mid-response queues rather than interrupts (`research/claude-web-desktop.md:41`, describing the same cross-platform Claude behavior mobile inherits); AGI Workforce's own web surface already meets this bar (COMPOSER-005), making this an internal-consistency gap as well as a competitor gap.

**Evidence.** Read `handleSendButtonPress` (`ChatInput.tsx:669-675`) confirming the unconditional stop-branch. Grepped the file for `editable=` — no match tying the TextInput's editability to `isStreaming`, confirming the draft is typeable but not submittable via the normal send path during streaming. Read `sendMessage` in `chatExecutionStore.ts:803-839` in full, confirming `getMobileSendQueue()` is a `QueueFullError`-throwing backpressure lane (message wording 'lane at capacity... please wait for prior sends to drain') rather than a post-turn scheduler, and that the very next lines abort any existing stream controller for the conversation instead of deferring.

**Files.**

- `apps/mobile/src/features/chat/components/ChatInput.tsx:663-675`
- `apps/mobile/stores/chat/chatExecutionStore.ts:803-839`

**Recommendation.** Add a queued-follow-up state to mobile's chat store mirroring web's `pendingQueueRef` (COMPOSER-005): when `sendMessage` is invoked for a conversation that already has an active `abortControllers` entry, store the draft instead of aborting, surface it as a dismissible chip above `ChatInput`, and flush it when the active stream's completion handler fires. This also removes the currently-latent 'stop and replace' behavior in the store, which is a correctness risk for any future caller that reaches `sendMessage` while streaming without going through the composer's stop-gated button.

#### COMPOSER-007

**Send button keyboard-shortcut label** — P3 · Chrome extension · `ux-gap`

_Screen/component:_ Side panel composer

**Current state.** The composer's send button is created with `title: 'Send (Cmd+Enter)'` (`side_panel.ts:9376`), but the only keyboard handler on the input (`:9340-9349`) sends on plain `Enter` without a modifier (`e.key === 'Enter' && !e.shiftKey`). A repo-wide grep for `Cmd+Enter`/`metaKey`/`ctrlKey.*Enter` inside `apps/extension/src/side_panel.ts` returns exactly one hit — the tooltip string itself. There is no Cmd/Ctrl+Enter handling anywhere in the file; the tooltip describes a shortcut that does not exist and omits the one that does (plain Enter, with Shift+Enter presumably left as the browser's default textarea newline behavior).

**Expected state.** The send button's tooltip/aria-label matches the actual bound shortcut (e.g. 'Send (Enter)' or 'Send (Enter) · Shift+Enter for new line'), consistent with web's composer which genuinely supports both plain Enter and Cmd/Ctrl+Enter and labels accordingly.

**Benchmark.** Internal consistency — this is a factual UI-copy bug, not a competitor comparison.

**Evidence.** Read the keydown listener at `side_panel.ts:9340-9349` (Enter-without-Shift only) and the send button construction at `:9374-9391` (title string). Ran `grep -n "Cmd+Enter|metaKey|ctrlKey.*Enter|Enter.*ctrlKey" apps/extension/src/side_panel.ts` — one match, the tooltip itself.

**Files.**

- `apps/extension/src/side_panel.ts:9340-9349,9374-9391`

**Recommendation.** Either implement Cmd/Ctrl+Enter as an additional send trigger (matching web's actual behavior, so the copy becomes true) or correct the tooltip to describe the real Enter-to-send binding. The former is preferable for cross-surface muscle-memory consistency.

#### COMPOSER-008

**Configurable send shortcut (Enter vs. Cmd/Ctrl+Enter)** — P3 · Web · `ux-gap`

_Screen/component:_ Chat composer

**Current state.** The shared `unified-chat` package (desktop's composer) exposes a real, host-controlled `sendShortcut` prop (`'mod-enter' | 'enter'`, `ChatInput.tsx:924,1266`) that renders a matching hint label ('Cmd/Ctrl+Enter' vs 'Enter') — this is the mechanism behind the already-Done desktop gap 'Desktop send behavior is configurable and persisted'. Web's primary composer has no equivalent: it hardcodes plain Enter as the send trigger with Cmd/Ctrl+Enter as an always-on secondary trigger (comment at `ChatComposerNew.tsx:1910`, 'Cmd/Ctrl+Enter also sends'), and a repo-wide grep for `sendShortcut`/`enterToSend` inside `apps/web/features` and `apps/web/shared` returns zero hits — there is no user-facing setting to invert Enter/Shift+Enter behavior on web, unlike desktop.

**Expected state.** Web offers the same send-shortcut preference desktop already has (or, at minimum, the composer's keyboard contract is explicitly documented as fixed by design), so power users who prefer Cmd+Enter-to-send/Enter-for-newline — a common preference among long-form writers — have a working path on the surface most users actually use.

**Benchmark.** ChatGPT web Settings > Keyboard exposes a rebindable 'Send message or stop answering' shortcut (`research/shots-chatgpt-web-macos.md` §2.17); this codebase's own desktop surface already ships an equivalent (GAP-086, Done).

**Evidence.** Read `ChatInput.tsx:900-930,1260-1270` confirming the real `sendShortcut` prop and label wiring in the shared package. Grepped `apps/web/features` and `apps/web/shared` for `sendShortcut`/`send.*shortcut`/`enterToSend` — zero hits, confirming web has no equivalent setting.

**Files.**

- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1910`
- `packages/ui/unified-chat/src/components/ChatInput.tsx:924,1266`

**Recommendation.** Thread a `sendShortcut` preference through web's settings store (the same shape desktop already uses) into `ChatComposerNew.tsx`'s keydown handler, defaulting to today's Enter-sends behavior so no existing user's muscle memory changes unless they opt in.

### Cross-surface parity & shared architecture

_15 gaps · source: `gaps/domain-cross-surface.json` · narrative: `gaps/domain-cross-surface.md`_

#### CROSS-SURFACE-001

**Primary chat surface bypasses the shared chat UI package** — P1 · Web · `architecture-gap`

_Screen/component:_ /, /chat, /chat/[sessionId] (WebChatPage)

**Current state.** There are four independent chat-rendering implementations in the repo: (1) apps/web's primary route (WebChatPage.tsx, 4,407 lines) with its own MessageBubble (2,254 lines, 2.4x the shared component), ChatComposerNew (3,621 lines, 2.5x the shared ChatInput), and ChatMessageList (1,593 lines) -- all confirmed by wc -l; (2) apps/desktop, which genuinely imports ChatInterface/ChatMessage/ChatRuntime from @agiworkforce/unified-chat unconditionally at App.tsx:1976 (verified); (3) apps/web's own secondary /agi-work, /chat/code, /chat/schedules routes via WebShellV3, which also use the shared package; (4) apps/mobile's fully independent React Native components (MessageBubble.tsx 1,124 lines, ChatInput.tsx 1,249 lines) with zero code sharing beyond a comment in capabilities.tsx explaining RN cannot import unified-chat because it pulls react-dom (confirmed by grep). WebChatPage.tsx's only real imports from unified-chat are UsageWarningBanner, LocalByokHandoffDialog, and the ChatMessage type (confirmed at WebChatPage.tsx:17,168) -- none of the message-rendering or composing logic is shared.

**Expected state.** One chat rendering/composing implementation per client runtime family (web+desktop can share a React implementation; mobile RN is legitimately separate), so a bug fix or feature addition lands once and reaches every surface built on that runtime. ChatGPT and Claude each ship one web chat surface that desktop/browser variants wrap, not a legacy 4,400-line parallel implementation living alongside an adopted shared package.

**Benchmark.** Claude Desktop + Claude Web share one Artifacts/chat rendering system per Anthropic's cross-surface product design (research/cross-cutting-and-complaints.md); ChatGPT's own cross-surface consistency failures (missing Chat mode on the new unified desktop app, research/cross-cutting-and-complaints.md section 5) are cited there as an anti-pattern to avoid, not a bar to match.

**Evidence.** Ran wc -l on all four file pairs and confirmed exact line counts match the inventory (WebChatPage.tsx 4407, web MessageBubble.tsx 2254, ChatComposerNew.tsx 3621, ChatMessageList.tsx 1593, unified-chat MessageBubble.tsx 924, ChatInput.tsx 1422). Grepped WebChatPage.tsx and ChatComposerNew.tsx for 'unified-chat' imports and confirmed only 3-4 named type/component imports, no shared message-rendering or composer logic. Confirmed apps/desktop/src/features/v3/DesktopShellV3.tsx imports ChatInterface from the shared package and App.tsx:1976 mounts it unconditionally. Confirmed apps/mobile/src/lib/capabilities.tsx:6 comment explaining the RN/react-dom incompatibility.

**Files.**

- `apps/web/features/chat/pages/WebChatPage.tsx`
- `apps/web/features/chat/components/messages/MessageBubble.tsx:1-2254`
- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1-3621`
- `apps/web/features/chat/components/messages/ChatMessageList.tsx:1-1593`
- `packages/ui/unified-chat/src/components/MessageBubble.tsx:1-924`
- `packages/ui/unified-chat/src/components/ChatInput.tsx:1-1422`
- `apps/web/features/chat/v3/WebShellV3.tsx:5-9`
- `apps/desktop/src/features/v3/DesktopShellV3.tsx:7-13`

**Recommendation.** Migrate WebChatPage.tsx's message list and composer to render via @agiworkforce/unified-chat's MessageList/ChatInput, moving web-primary-only behavior (if any exists that the shared package genuinely lacks) into the shared package as an optional prop/slot rather than a fork. Track this as a single tracked migration item in PLAN.md with a shrink-only allowlist (similar in spirit to wiring-allowlist.json) so the legacy web components cannot silently regrow features the shared package already has.

#### CROSS-SURFACE-005

**Article 50 AI-generated-content provenance marker is broken between surfaces and inconsistently applied** — P1 · Cross-surface · `integration-gap`

_Screen/component:_ n/a (compliance metadata attached to generated content)

**Current state.** packages/contracts/compliance is the canonical EU AI Act Article 50 disclosure/provenance-marker package; mobile genuinely imports and uses it (11 files, including a dedicated /legal/article-50 screen). apps/web/lib/compliance/ai-act.ts is a hand-restated duplicate of the marker shape, self-documented as existing because @agiworkforce/compliance is not a declared dependency of @agiworkforce/web (ai-act.ts:35-38). The shared package's own serialiseClaim function (article50-marker.ts:138) does JSON.stringify(claim, Object.keys(claim).sort()) -- an array replacer used as a global key allowlist applied at every nesting depth, not just the top level -- so nested assertions[].label/.action keys get silently stripped and mobile's real emitted sidecar serializes assertions as [{}]. Web's own hasAiGeneratedProvenance() would therefore reject mobile's own output if the two were ever compared, despite ai-act.ts's comment claiming wire-compatibility. Web's file additionally self-documents: streamed chat text is not marked on any surface, there is no web audio-generation route, and the Article 50(1) explicit-disclosure sentence was removed from web's composer on 2026-08-14 based on an unreviewed legal carve-out, while mobile keeps its explicit disclosure screen.

**Expected state.** One canonical, correctly-serializing provenance-marker implementation that every surface imports (or, at minimum, that every surface's independent implementation is contract-tested against), so a compliance claim generated on one surface validates correctly when read by another, and the explicit-disclosure requirement is applied consistently (or its removal is a reviewed, product-wide decision, not a single surface's unreviewed change).

**Benchmark.** n/a -- this is a regulatory-compliance correctness gap, not a competitor feature-parity gap; the standard is the EU AI Act Article 50 text itself.

**Evidence.** Read packages/contracts/compliance/src/article50-marker.ts around line 138 (via shared-packages.md's direct citation, cross-checked against the file's own header) confirming the JSON.stringify(claim, Object.keys(claim).sort()) call and its top-level-only key list. Read apps/web/lib/compliance/ai-act.ts's self-documented rationale (lines 16-38, 192-201) for why it duplicates rather than imports the package, and its explicit statement that streamed text and audio-gen are unmarked and the Article 50(1) sentence was removed 2026-08-14.

**Files.**

- `packages/contracts/compliance/src/article50-marker.ts:137-138`
- `apps/web/lib/compliance/ai-act.ts:16-38,192-201`
- `apps/mobile (11 consumers of @agiworkforce/compliance, per package.json import count)`

**Recommendation.** Fix serialiseClaim to apply the key allowlist only at the top level (or recursively include nested-object keys), add a cross-surface fixture-replay contract test (mirroring packages/client/sync's pattern) asserting a marker generated on mobile validates on web and vice versa, and route web's compliance logic through the shared package once it becomes a declared dependency -- the manifest/lockfile change ai-act.ts says is blocking this should be scheduled explicitly rather than left open-ended.

#### CROSS-SURFACE-006

**Local/BYOK/Managed-Cloud trust-boundary regression tests are currently red** — P1 · VS Code extension · `reliability-gap`

_Screen/component:_ n/a (chat participant model resolution + usage-meter trust-boundary pill)

**Current state.** A real, well-reasoned security hardening change (commit 1e858a7f1, 2026-08-13) switched Config.model() from reading VS Code's merged/workspace config to getUserScoped() (globalValue only via .inspect()), specifically to stop a checked-out repo's .vscode/settings.json from silently moving a user's Local/BYOK/Managed-Cloud trust boundary. The two test files that exercise exactly this trust-boundary logic (chatParticipant.test.ts's local-model authority resolution and usageMeterTrustBoundary.test.ts's Local/BYOK/Managed-Cloud usage-meter pill) mock only .get(), not the new .inspect() code path, so under the new implementation Config.model() silently falls back to 'auto' inside the tests. Running `npx vitest run` at apps/extension-vscode reproduces 17 failing / 862 passing tests, with 6+6 of the failures specifically in the two trust-boundary-relevant files.

**Expected state.** The regression-test safety net for trust-boundary labeling (which surface a request's cost/privacy characteristics are attributed to) should be green, since this is precisely the class of defect (Local session data or cost silently mislabeled as a different trust tier) the repo's own AGENTS.md rules treat as critical.

**Benchmark.** n/a -- internal reliability finding on the repo's own trust-boundary invariant, which the domain brief explicitly asks to verify is enforced at runtime and not just documented.

**Evidence.** Ran the failure trace as documented in inventory/extension-vscode.md section 0 (git show 1e858a7f1 confirms the production change; the test mocks at chatParticipant.test.ts:64-73 and usageMeterTrustBoundary.test.ts:96-105 only stub .get(), not .inspect()). I did not independently re-run `npx vitest run` in this pass (relying on the inventory's documented reproduction), but the root-cause trace (production code change + unmigrated test mock) is internally consistent and specific enough to be verifiable by any engineer running the two named commands.

**Files.**

- `apps/extension-vscode/src/platform/config.ts:191-196`
- `apps/extension-vscode/src/__tests__/chatParticipant.test.ts:64-73`
- `apps/extension-vscode/src/__tests__/usageMeterTrustBoundary.test.ts:96-105`

**Recommendation.** Update mockConfiguredModel() and configuredModel() in the two test files to also stub .inspect() returning the intended globalValue, restoring the 12 failing assertions to green before treating VS Code's trust-boundary labeling as verified. This is a self-contained, low-risk fix (test-only change) that should ship ahead of any further work in this area.

#### CROSS-SURFACE-002

**Composer hand-mirrors the shared ChatInput instead of importing it, and has already drifted** — P2 · Chrome extension · `partial-implementation`

_Screen/component:_ Side panel composer

**Current state.** side_panel.ts (10,933 lines, zero React imports, vanilla DOM) contains a comment at line 9352-9354 stating its paste-image handler 'Mirrors packages/ui/unified-chat/ChatInput.tsx and the VS Code webview composer wire' -- confirmed present verbatim by direct read. There is no import of @agiworkforce/unified-chat anywhere in the file (confirmed by import-block inspection). Feature-by-feature comparison against the shared ChatInput.tsx + ChatInputToolbar.tsx shows side_panel.ts is missing: the Ask/Auto/Plan/Bypass agent-mode control row, the Skill @mention picker, the explicit Research toggle, the explicit one-shot web-search toggle, the code-execution ('Run code') toggle, and the writing-style picker -- all confirmed absent by grep (zero matches for AgentControl/PlanMode/SkillMention/etc.). The attachment menu offers only 2 items (screenshot, file upload) vs the shared AttachmentMenu's ~7.

**Expected state.** Either the extension imports the shared composer primitives directly (accepting some UI adaptation for the DOM/vanilla-TS host), or a single typed composer-capability manifest is shared so a control added to unified-chat surfaces automatically as a tracked gap in the extension rather than requiring a human to notice and hand-port it.

**Benchmark.** Claude in Chrome's side panel (research/claude-code-chrome-ide.md) exposes the same skill/connector surface as claude.ai proper; a browser extension composer missing controls the desktop/web composer has (that are not desktop-specific, e.g. Skills, Research) reads as an inconsistent product.

**Evidence.** Read side_panel.ts:9340-9365 directly and confirmed the exact mirror comment. Grepped side_panel.ts for AgentControl, PlanMode, SkillMention, workMode, research toggle strings -- zero matches for each, matching inventory/extension-chrome.md section 11's table. Confirmed apps/extension/package.json has no react dependency (grep for '"react"' returned no hits).

**Files.**

- `apps/extension/src/side_panel.ts:9352-9354`
- `apps/extension/src/side_panel.ts:9412-9477`
- `packages/ui/unified-chat/src/components/ChatInput.tsx`
- `packages/ui/unified-chat/src/components/ChatInputToolbar.tsx`

**Recommendation.** Port the missing composer controls (Skill @mentions, Research toggle, explicit web-search toggle, code-execution toggle, writing-style picker) into side_panel.ts as the smallest slice, and add a CI check that fails when unified-chat's exported composer-feature list grows without a corresponding side_panel.ts acknowledgment (an allowlist-diff check, mirroring the desktop wiring-allowlist.json pattern) so future drift is caught mechanically instead of by manual comparison.

#### CROSS-SURFACE-003

**Electron IPC bridge and deep-link SSO are dead in the shipped default configuration** — P2 · Desktop (Electron) · `dead-code`

_Screen/component:_ n/a (main process / preload wiring)

**Current state.** The Electron shell's default renderer is the hosted web app loaded top-level (confirmed by reading main.ts:1-40's own header comment: 'the renderer is the HOSTED cloud web app at agiworkforce.com'). The 9-channel IPC bridge (window-control, dialog, notify, relaunch, check-update, open-update-installer, deep-link, invoke-bridge, open-external) is only attached via preload.ts when AGI_CLOUD_RENDERER=bundled; the default (remote) BrowserWindow and the quick-ask panel both use webPreferences with no preload key at all, so window.agiHost is undefined in the shipped default build. deliverDeepLink() is still called unconditionally from app.on('open-url'/'second-instance') and pushes over an IPC channel nothing can receive in remote mode (no contextBridge ever runs), so agiworkforce-cloud:// deep links are silently dropped whenever the app runs in its default configuration. CHANGELOG.md additionally lists 'allowlist agiworkforce-cloud://sso-callback as a Clerk redirect URL' as an un-actioned ops TODO, meaning even the bundled-mode escape hatch's native SSO return may not resolve in production Clerk config.

**Expected state.** Either the IPC bridge/deep-link receiver is genuinely reachable in whichever mode ships by default, or the dead paths are removed/documented as intentionally inert so a future engineer does not assume agiworkforce-cloud:// deep links work in production. If the bundled fallback renderer is the intended escape hatch for auth failures, its SSO return path should be operationally complete (Clerk redirect URL allowlisted) before being relied upon during an incident.

**Benchmark.** n/a -- this is an internal architecture/reliability finding, not a feature-parity gap against ChatGPT/Claude.

**Evidence.** Read apps/desktop/electron/main.ts:1-40 confirming the hosted-web-app-by-default header comment. Cross-checked against inventory/desktop-electron.md sections 1-2, which independently traced main.ts:477-483 (no preload key on the default BrowserWindow) and quickAsk.ts:39-45 (same for the quick-ask panel), and confirmed deliverDeepLink() fires unconditionally from main.ts:336-346 with no listener in remote mode.

**Files.**

- `apps/desktop/electron/main.ts:14,336-346,477-483`
- `apps/desktop/electron/preload.ts:26-83`
- `apps/desktop/electron/quickAsk.ts:39-45`
- `apps/desktop/src/services/desktopSocialSignIn.ts:50-52`

**Recommendation.** Land the CHANGELOG-tracked ops TODO (allowlist agiworkforce-cloud://sso-callback with Clerk) so the documented escape hatch actually works, and add a startup log line (not user-visible) when deliverDeepLink() fires with no registered receiver so an incident responder relying on the bundled fallback discovers the gap before a live outage, not during one.

#### CROSS-SURFACE-004

**Local/Cloud mode toggle silently no-ops instead of disabling itself when Local mode is unavailable** — P2 · Desktop (Electron) · `ux-gap`

_Screen/component:_ Sidebar — Local/Cloud toggle

**Current state.** LocalCloudToggle.tsx renders unconditionally in the shared sidebar (used by both the Tauri app and the Electron-bundled renderer) and calls appModeStore.setMode('local'|'cloud'). Inside the Electron-bundled renderer, appModeStore.ts:52,65,72 force-coerces mode back to 'cloud' whenever supportsLocalAppMode is false (always true for Electron, since isTauri is false). The toggle itself has no visible affordance change when this happens -- it does not disable, hide, or grey out the Local segment; a user tapping 'Local' inside the Electron-bundled renderer sees the control silently revert with no toast or explanation.

**Expected state.** A control that cannot honor a selection in the current shell should either not render that option at all, or render it disabled with an explanatory tooltip -- never accept a tap and silently discard it. This is the same class of anti-pattern cross-cutting-and-complaints.md flags against both ChatGPT and Claude ('don't bury a control behind a UX that discovers its own limits only by hitting a wall').

**Benchmark.** General UX-honesty bar established in research/cross-cutting-and-complaints.md section 8 ('don't make usage limits/mode restrictions a black box') -- applied here to a mode toggle rather than a usage meter.

**Evidence.** Confirmed via inventory/desktop-electron.md section 5's Local/Cloud toggle row, which traced appModeStore.ts:52,65,72's coercion logic and noted LocalCloudToggle.tsx has no visible affordance change; flagged there as NEEDS_VALIDATION pending a live-build check, which I did not additionally re-run in this pass (static-code finding only).

**Files.**

- `apps/desktop/src/features/shell/LocalCloudToggle.tsx`
- `apps/desktop/src/stores/appModeStore.ts:52,65,72`

**Recommendation.** In the Electron-bundled renderer build, either hide the Local segment of LocalCloudToggle.tsx entirely (supportsLocalAppMode already exists as the gating signal) or render it disabled with a one-line explanation ('Local mode requires the native app'), and add a toast/inline message on the coerced setMode('local') attempt if the segment remains visible for any reason.

#### CROSS-SURFACE-007

**Desktop-companion pairing instructions do not match Mobile's real navigation labels** — P2 · Cross-surface · `ux-gap` · prior art `GAP-210`

_Screen/component:_ Desktop remote-pairing modal / Mobile Remote screen

**Current state.** Desktop's pairing card instructs the user to navigate to 'AGI Workforce -> Desktop Companion' on their phone. Mobile has no destination by that name: the drawer entry is labelled 'Remote' (route /(app)/companion), and the settings entry point is labelled 'Desktop control'. Two of the three copy claims in the original GAP-210 fix check out (the QR-scan step and the manual-code-entry step), but the top-level navigation label a user is told to look for does not exist on the device they are holding, so a user following the printed instructions literally cannot find the screen.

**Expected state.** Desktop's printed instructions should name the exact, current label a user will see in Mobile's drawer/settings, verified by a cross-surface copy-consistency test (the repo already has one such test for the deep-link URL contract -- app-intents-deeplink.test.ts -- this needs the equivalent for pairing-instruction copy).

**Benchmark.** n/a -- internal cross-surface consistency defect.

**Evidence.** This was independently found and adversarially re-verified in audit/parity-2026-08-15/gaps/done-claim-verification.md ('GAP-210 -- pairing instructions: cross-surface copy drift breaks the flow'), which traced QRPairingCard.tsx:113-117 against DrawerContent.tsx:94-99 and confirmed the label mismatch survives despite ui-gaps.csv marking the row Done. I did not re-open the two files independently in this pass; citing the already-verified finding per the audit's prior-art-reconciliation instructions.

**Files.**

- `apps/desktop/src/features/mobile-companion/QRPairingCard.tsx:113-117`
- `apps/mobile/src/features/drawer/components/DrawerContent.tsx:94-99`

**Recommendation.** Change QRPairingCard.tsx's instruction copy to say 'AGI Workforce -> Remote' (matching the live drawer label) or, better, rename both surfaces to the same term and add a test asserting the string Desktop prints for the mobile destination matches a value mobile's own navigation exports, so this class of drift cannot silently reoccur if either label changes again.

#### CROSS-SURFACE-008

**services/api-gateway's REST surface duplicates apps/web's Next.js API routes with unclear live ownership** — P2 · Backend · `architecture-gap`

_Screen/component:_ n/a (backend topology)

**Current state.** services/api-gateway is a real, tested, now-deployed (as of 2026-08-09, per its Fly.io CI/CD jobs) Express service exposing agents/auth/chat/cloudChat/credits/desktop/deviceAuth/enterprise/llm/mobile/models/pair/providerStream/sync/usage routes -- the same route families apps/web's Next.js API already serves. apps/mobile's EXPO_PUBLIC_GATEWAY_URL defaults to api.agiworkforce.com, which per a still-open known-flaws entry is a DNS alias for the same Vercel/Next.js deployment (host-rewritten in next.config.ts), not the Fly-hosted Express gateway -- i.e. mobile's primary named consumer likely never talks to this service for ordinary chat/sync traffic. A separate, genuinely-distinct host (gateway.agiworkforce.com) is used by the desktop/extension companion-pairing feature, which is itself currently disabled behind a feature flag. The known-flaws entry records this as a 'PENDING founder decision: retire the whole api-gateway... vs. keep only its WebSocket + QR-pairing core' -- an open architectural decision, not newly discovered here.

**Expected state.** Either the general REST surface (chat/sync/credits/llm/usage/models) is retired since apps/web's Next.js routes are the ones actually serving production traffic, or a clear routing decision moves real traffic onto the gateway and the Next.js duplicate routes are retired instead -- not both maintained indefinitely with no verified live consumer for one of them.

**Benchmark.** n/a -- internal backend-topology finding.

**Evidence.** Read inventory/runtime-infra.md section 2 in full, which cross-references the known-flaws.md entry SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE (dated 2026-07-19) and traces apps/mobile/lib/constants.ts:18's default gateway URL against next.config.ts's host-rewrite behavior, plus confirms the companion-only distinct host (gateway.agiworkforce.com) used by apps/extension/src/background/policy.ts:642-649. Did not independently re-run the DNS/rewrite trace in this pass; relying on the already-cited file:line evidence.

**Files.**

- `services/api-gateway/src/app.ts:5-20,140`
- `apps/mobile/lib/constants.ts:18`
- `apps/extension/src/background/policy.ts:642-649`
- `docs/agent-context/known-flaws.md (entry SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE, 2026-07-19)`

**Recommendation.** Resolve the pending founder decision cited in known-flaws.md: instrument api.agiworkforce.com and gateway.agiworkforce.com traffic in production logs for one release cycle to determine which routes are actually hit, then retire the unused half (either the Express gateway's general REST duplication, or the Next.js routes it duplicates) rather than carrying both indefinitely.

#### CROSS-SURFACE-010

**Model retirement/migration logic is reimplemented per-surface instead of centralized** — P2 · Cross-surface · `architecture-gap`

_Screen/component:_ n/a (stored conversation model-ID migration on retirement)

**Current state.** retired-models.json lists ~30 explicitly retired model IDs plus a guardedNonCanonicalModelIds allowlist, enforced only as a CI/authoring-time guard (scripts/check-model-catalog-integrity.mjs, scripts/check-no-hardcoded-model-ids.mjs) -- there is no packages-level runtime function that migrates a persisted conversation's stored modelId when its model retires. That logic is implemented ad hoc inside apps/web/shared/stores/model-store.ts (confirmed present: deprecated/status==='deprecated'/deprecation_date checks at lines 88-105), with desktop and mobile each carrying their own equivalent (evidenced by dedicated test files -- cloudChatPersistence.test.ts, model-display-name.test.ts) rather than sharing one migration function from @agiworkforce/model-registry or @agiworkforce/types.

**Expected state.** A single, shared 'is this stored model ID still current, and what should the UI show/do if not' function in @agiworkforce/model-registry or @agiworkforce/types, imported by every surface, so a change to retirement-handling behavior (e.g. what UI copy to show for a conversation pinned to a retired model) lands once.

**Benchmark.** n/a -- internal architecture-consistency finding.

**Evidence.** Read apps/web/shared/stores/model-store.ts's deprecated/deprecation_date checks directly (lines 88-105 per the comment block copied into shared-packages.md, cross-checked structurally against the file). Confirmed apps/desktop/src/**tests**/lib/cloudChatPersistence.test.ts and apps/mobile/**tests**/model-display-name.test.ts both exist via `ls` (present, not fabricated citations).

**Files.**

- `apps/web/shared/stores/model-store.ts:85-105`
- `apps/desktop/src/__tests__/lib/cloudChatPersistence.test.ts`
- `apps/mobile/__tests__/model-display-name.test.ts`
- `packages/ai/model-registry/catalog/retired-models.json`

**Recommendation.** Extract model-store.ts's retirement-check logic into a pure function in @agiworkforce/model-registry (e.g. resolveModelForConversation(storedModelId, catalog) -> { current: boolean, replacement?, uiCopy }), have web adopt it first, then port desktop's and mobile's equivalents to call the same function, retiring the per-surface duplicates.

#### CROSS-SURFACE-012

**Design-token package exists but both of its heaviest adopters routinely bypass it with hardcoded hex colors** — P2 · Cross-surface · `visual-gap`

_Screen/component:_ n/a (visual design-system coherence)

**Current state.** @agiworkforce/design-tokens is real (437-line index.ts of CSS variable definitions) and genuinely consumed by web (114 files via @agiworkforce/ui), desktop (55 files), and the Chrome extension (real, non-decorative usage via tokens.ts's cssVarsToString). Despite this, a repo-wide grep for #rrggbb hex literals found 252 occurrences in apps/desktop/src and 95 in apps/web/features + apps/web/shared (my own spot-check grep, same order of magnitude as shared-packages.md's independently-run 294/119 count) -- i.e. both of the two surfaces that most heavily adopt the design-token system also routinely bypass it with inline hex colors rather than referencing a token.

**Expected state.** A lint rule (or a periodic CI count-and-fail-on-increase gate) that flags new hardcoded hex-color literals in files that already import @agiworkforce/design-tokens or @agiworkforce/ui, so the two systems stop drifting apart and dark/light theme changes do not require hunting down hundreds of untracked literals.

**Benchmark.** n/a -- internal design-system-coherence finding; loosely related to prior-art-reconciliation.md's observation that 'design-system coherence is 8 rows' in the existing tracker, i.e. largely unaudited.

**Evidence.** Ran `grep -rEo "#[0-9a-fA-F]{6}\b" apps/desktop/src --include="*.tsx" --include="*.ts"` (252 hits) and the equivalent for apps/web/features + apps/web/shared (95 hits) myself; both confirm the same order of magnitude as shared-packages.md's independently-run count (294/119), with the small difference explained by grep scope/pattern variance, not a contradiction.

**Files.**

- `packages/ui/design-tokens/src/index.ts`
- `apps/desktop/src (252+ hardcoded #rrggbb literals, spot-check grep)`
- `apps/web/features + apps/web/shared (95+ hardcoded #rrggbb literals, spot-check grep)`

**Recommendation.** Add an eslint rule (e.g. a custom no-restricted-syntax pattern matching hex-literal color strings) scoped to apps/desktop/src and apps/web/features+shared, allowlisted at today's count and shrink-only from there -- mirroring the wiring-allowlist.json 'may only shrink' pattern already used elsewhere in this repo for exactly this kind of tracked-debt problem.

#### CROSS-SURFACE-014

**packages/ai/agent-core is a thin context/memory utility, not a shared agent runtime -- the real planning/tool-loop/approval logic has zero cross-surface parity test** — P2 · Shared packages · `architecture-gap`

_Screen/component:_ n/a (agentic execution loop)

**Current state.** Despite its name, packages/ai/agent-core contains only two substantive files (context.ts for context-window budgeting/compaction, memory.ts for memory-relevance scoring) -- confirmed no planning loop, tool-call loop, subagent orchestration, checkpoint/resume, or approval-gate code exists anywhere in packages/ai/\*. The AGENTS.md for packages/ai/provider-runtime describes it as owning 'AGI-owned tool-loop scaffolding,' but that package's actual contents are streaming/retry/failover/fallback/gateway/watchdog modules, not loop control flow. The real agent loop, approvals, and checkpoint/resume logic live inside each app's native layer independently -- Desktop's Rust core/agi/ and CLI's Rust src/agent/ -- with no shared TS package and, unlike packages/client/sync's cross-language cursor/settings merge logic, no fixture-replay contract test verifying that Desktop's agentic loop behaves the same way (same approval gates, same checkpoint semantics, same tool-call retry policy) as any other surface's equivalent.

**Expected state.** Either the package is renamed to reflect what it actually is (context/memory utilities) so a reader does not assume a shared agent runtime exists, or the genuinely-shared pieces of agentic behavior (approval-gate semantics, checkpoint/resume state machine shape) are extracted into a real shared contract with a cross-language parity test, following the packages/client/sync precedent.

**Benchmark.** Both ChatGPT Work and Claude Cowork present one consistent agentic execution model across their surfaces (research/cross-cutting-and-complaints.md section 1, 'Agentic work modes' row) -- a repo where each surface's agent loop is an independent, unverified reimplementation risks exactly the kind of surface-specific behavioral inconsistency that undermines that consistency.

**Evidence.** Read packages/ai/agent-core's file listing (confirmed only context.ts/memory.ts/index.ts + tests per shared-packages.md's direct grep for tool.?loop|subagent|checkpoint.*resume|approval.*gate across packages/ai/\*, which found only incidental string matches, not an implementation). Cross-referenced against inventory/desktop-tauri.md's confirmation that Desktop's real agent/checkpoint/approval logic lives in Rust (core/agi/, sys/commands/checkpoints.rs) with its own independent command surface. Did not independently re-run the tool-loop/subagent grep myself in this pass.

**Files.**

- `packages/ai/agent-core/src/{index,context,memory}.ts`
- `apps/desktop/src-tauri/src/core/agi/`
- `packages/ai/provider-runtime/src/`

**Recommendation.** Rename packages/ai/agent-core to something accurate (e.g. @agiworkforce/context-memory) to stop it reading as a shared runtime that doesn't exist, and scope a follow-up to identify which specific agentic-loop invariants (approval-gate trigger conditions, checkpoint data shape) are load-bearing enough to warrant extraction into a real cross-language contract test.

#### CROSS-SURFACE-009

**Enterprise licensing exists as two independently-implemented, unverified-parity packages** — P3 · Shared packages · `architecture-gap`

_Screen/component:_ n/a (licensing verification primitives)

**Current state.** packages/contracts/licensing provides EditionSchema/LicenseClaimsSchema, verifySignedContainer, verifyLicense, and org-policy tightening checks, self-documented in its own index.ts as 'NOT wired into any app runtime, UI, or enforcement path.' Zero consumers across every app surface (web/desktop/mobile/extension/extension-vscode/cli all show 0 imports). A separate Rust crate, crates/agiworkforce-licensing, independently implements the same signed-container/claims-verification concept (its own doc comment says it 'mirrors' the TS package's design), but unlike packages/client/sync -- which keeps its TS and Rust implementations honest via a shared golden-fixture replay test suite -- there is no fixture-replay contract test between the TS licensing package and the Rust licensing crate. Neither implementation is wired into any runtime enforcement path.

**Expected state.** If enterprise licensing is a near-term roadmap item, the two implementations should share a fixture-replay contract test now (before either is wired into a real enforcement path) so parity is provable from day one, following the pattern packages/client/sync already established for a structurally identical two-language problem.

**Benchmark.** n/a -- internal architecture-risk finding; this is preemptive given neither implementation ships to users yet.

**Evidence.** Read packages/contracts/licensing/src/index.ts's self-documented unwired status and crates/agiworkforce-licensing/src/lib.rs:6's mirroring doc comment, per shared-packages.md sections 1 and 4. Confirmed packages/client/sync/src/ contains **fixtures** (cursor-compare.json, pull-apply.json, push-body.json per shared-packages.md) as the comparison case of what a fixture-replay contract test looks like in this repo; did not locate an equivalent fixtures directory under packages/contracts/licensing (not independently re-verified by direct grep in this pass).

**Files.**

- `packages/contracts/licensing/src/index.ts:9-11`
- `crates/agiworkforce-licensing/src/lib.rs:6`
- `packages/client/sync/src/__fixtures__/cursor-compare.json`

**Recommendation.** Before wiring either licensing implementation into a runtime enforcement path, add a shared fixture set (signed license containers + expected verify results) and a replay test on both the TS and Rust sides, mirroring packages/client/sync/src/**fixtures**'s pattern, so a future divergence is caught by CI rather than discovered in production.

#### CROSS-SURFACE-011

**Desktop's Rust cloud-sync reimplementation has no confirmed CI gate running both sides of its fixture-replay parity test** — P3 · Shared packages · `reliability-gap`

_Screen/component:_ n/a (packages/client/sync vs desktop's cloud_sync.rs)

**Current state.** packages/client/sync is the canonical TS delta-sync apply-logic package (cursor comparison, merge-by-id message/conversation application, three-way settings JSON merge). Rust cannot import a TS module, so desktop's cloud_sync.rs independently reimplements the same rules, with parity kept honest 'by replaying shared golden fixtures... against both the TS tests and cloud_sync.rs's #[cfg(test)] fixture-replay module' (per the package's own index.ts comment). Whether the CI pipeline actually runs both the TS vitest suite and the Rust cfg(test) suite on every change that touches either side (as opposed to only one being wired into the default CI gate) was flagged in shared-packages.md as 'not verified in this pass, out of scope' and I did not independently confirm it in this pass either.

**Expected state.** A CI job that fails if packages/client/sync's fixtures change without cloud_sync.rs's tests also running against the updated fixtures (and vice versa), so this cross-language contract cannot silently drift the way the egress-policy allowlist previously did before being reconciled into trust-boundaries.

**Benchmark.** n/a -- internal CI-completeness question.

**Evidence.** Read packages/client/sync/src/index.ts's header comment describing the fixture-replay parity mechanism. Ran `wc -l` on the package's source files confirming it is real (717 lines across cursor/conversations/messages/memory/projects/settings). Did not locate or inspect the specific CI workflow file that would confirm both suites run together (out of scope for this pass's tool budget) -- this finding is explicitly flagged NEEDS_VALIDATION in the underlying inventory and I am carrying that status forward rather than asserting a confirmed gap.

**Files.**

- `packages/client/sync/src/index.ts:1-14`
- `packages/client/sync/src/cursor.ts`
- `apps/desktop/src-tauri/src/data/cloud_sync.rs`

**Recommendation.** Locate the CI workflow(s) that run apps/desktop's Rust test suite and packages/client/sync's vitest suite; confirm both execute whenever either packages/client/sync/src/**fixtures**/\*.json or apps/desktop/src-tauri/src/data/cloud_sync.rs changes. If they run independently rather than as a single gated pair, add a path-based CI trigger requiring both to pass together.

#### CROSS-SURFACE-013

**packages/tools/browser-tool is dead code with a stale dependency reference** — P3 · Shared packages · `dead-code`

**Current state.** packages/tools/browser-tool provides real, tested Playwright-core-backed browser automation primitives (snapshot.ts, profile.ts), but its own README states outright that it has zero consumers repo-wide: its only prior importer in apps/extension was deleted with its bridge in commit bfce749b3 (2026-08-09) because the bridge had no caller. apps/extension/package.json:41 still lists "@agiworkforce/browser-tool": "workspace:\*" as a dependency despite nothing importing it.

**Expected state.** A package with zero consumers should either be removed from the workspace (if genuinely superseded by desktop's separate Rust/CDP automation stack and the extension's own CDP driver) or have a concrete adoption plan; the stale package.json entry should be removed regardless, since CLAUDE.md flags lockfile/manifest cleanliness as something to fix opportunistically.

**Benchmark.** n/a -- internal dead-code finding.

**Evidence.** Read packages/tools/browser-tool/README.md's own 'Consumers: None today' statement (per shared-packages.md's direct citation) and confirmed apps/extension/package.json:41 still lists the workspace dependency -- did not independently re-open package.json myself in this pass, relying on the inventory's specific line citation which is consistent with the package's own README claim.

**Files.**

- `packages/tools/browser-tool/README.md`
- `apps/extension/package.json:41`

**Recommendation.** Remove @agiworkforce/browser-tool from apps/extension/package.json in the next lockfile-touching change (per CLAUDE.md's lockfile-edit hook constraints, this cannot be a standalone Edit -- it needs to go through the package manager), and either archive the package or file a concrete adoption ticket if it is intended for a near-term use case.

#### CROSS-SURFACE-015

**Provider request-shaping (OpenAI wire-compat, reasoning-effort normalization) is web-only with unverified parity elsewhere** — P3 · Shared packages · `architecture-gap`

_Screen/component:_ n/a (LLM request construction)

**Current state.** packages/ai/provider-protocol provides pure request-shaping functions -- OpenAI Responses-API policy, reasoning-effort resolution, system-prompt cache-boundary splitting, byte-identical openai-wire-compat.ts -- consumed by 13 files in apps/web and zero files in desktop/mobile/extension/cli. Whether desktop (which talks to providers from Rust), mobile (TS, same runtime family as web), and the extension (also TS) have independently-built equivalents that produce the same wire format and reasoning-effort resolution as web's, or instead diverge silently, was not established in this pass -- this is flagged as an open question in shared-packages.md rather than a confirmed duplication.

**Expected state.** If mobile/extension send requests to the same providers with the same reasoning-effort concept, they should either import this package (both are TS, so unlike desktop's Rust boundary there is no language barrier) or have their equivalent logic identified and contract-tested against web's for parity.

**Benchmark.** n/a -- internal architecture-completeness question, explicitly flagged as unverified rather than a confirmed gap.

**Evidence.** Confirmed via shared-packages.md section 1's provider-protocol entry (13 web consumers, 0 elsewhere) and section 3's explicit framing as an open question ('unless they each have independent equivalents not covered in this scope'). Did not independently grep mobile/extension for reasoning-effort or OpenAI wire-format logic in this pass to confirm whether an equivalent exists -- this finding is intentionally conservative and flagged NEEDS_VALIDATION in spirit.

**Files.**

- `packages/ai/provider-protocol/AGENTS.md`
- `packages/ai/provider-protocol (13 web consumers, 0 desktop/mobile/extension)`

**Recommendation.** Grep apps/mobile and apps/extension for reasoning-effort/cache-boundary/OpenAI-wire-format logic to determine whether an independent equivalent exists. If it does, add a parity check; if it does not (i.e. those surfaces simply don't need this normalization, or silently send un-normalized requests), document which case applies so this stops being an open question.

### Dead, disconnected code & reliability

_23 gaps · source: `gaps/domain-dead-code.json` · narrative: `gaps/domain-dead-code.md`_

#### DEAD-CODE-001

**Desktop "teams" feature slice is fully orphaned, and the durable-defects ledger itself is stale and actively blocks its cleanup** — P1 · Desktop (Tauri) · `dead-code`

_Screen/component:_ n/a (no reachable screen — that is the finding)

**Current state.** known-flaws.md:533-535 (dated 2026-08-05) states these 4 components are 'NOT orphans... consumed by the quarantined experimental/TeamDashboard.tsx — kept.' `git log --diff-filter=D` shows `apps/desktop/src/features/experimental/TeamDashboard.tsx` was deleted in commit 4354d3d8b on 2026-08-07, two days after that ledger entry was written, and is an ancestor of HEAD (e15df56e3). At current HEAD the file does not exist anywhere in the repo (`find` and `git log --all` both confirm), and repo-wide grep for every one of the 4 component names outside their own definition files returns zero hits. `TeamAccountSettings.tsx` is likewise never imported by `SettingsPanel.tsx` (only referenced inside a test's own `vi.mock`). `teamStore.ts`/`teamsApi.ts` have no importers outside this dead set. `desktop-electron.md` independently confirmed `tsconfig.json` still excludes the now-nonexistent `src/features/experimental` path.

**Expected state.** The known-flaws.md ledger should reflect current code, not a two-day-old snapshot; a maintainer or agent trusting it (per CLAUDE.md's mandated read order) is actively misled into preserving dead code. Given the backend's own `teams`/`team_members` tables are already superseded by `organizations` and sit behind a written-but-founder-gated drop migration (`0058_drop_legacy_teams.sql`), the desktop UI for the same retired concept should be deleted in the same pass, not preserved by a stale note.

**Benchmark.** n/a — internal ledger-integrity defect, not a competitor parity gap

**Evidence.** Read known-flaws.md:527-535; `find . -iname TeamDashboard*` (no hits at HEAD); `git log --diff-filter=D --summary` located three historical TeamDashboard.tsx paths, confirmed the `experimental/` one was deleted in 4354d3d8b (2026-08-07 02:09:42 -0500, ancestor of HEAD); `grep -rn TeamActivityLog . --include=*.tsx --include=*.ts` repo-wide returns only the definition file; confirmed `SettingsPanel.tsx` has zero reference to `TeamAccountSettings`; cross-checked against web-backend.md's independent finding of the same `teams`/`team_members` retirement on the backend side (0058_drop_legacy_teams.sql, founder-gated, not yet applied).

**Files.**

- `apps/desktop/src/features/teams/TeamActivityLog.tsx`
- `apps/desktop/src/features/teams/TeamInvitation.tsx`
- `apps/desktop/src/features/teams/TeamMemberList.tsx`
- `apps/desktop/src/features/teams/TeamSettings.tsx`
- `apps/desktop/src/features/settings/TeamAccountSettings.tsx`
- `apps/desktop/src/stores/teamStore.ts`
- `apps/desktop/src/api/teamsApi.ts`
- `docs/agent-context/known-flaws.md:533-535`

**Recommendation.** Delete the 8 files listed (components, store, API client) together with the stale known-flaws.md entry, in the same PR that eventually applies 0058_drop_legacy_teams.sql — or, if a real team-management surface is wanted, wire TeamAccountSettings into SettingsPanel and route the 4 team components through it, updating the ledger to say so either way.

#### DEAD-CODE-002

**~180 files across ~30 desktop feature directories are built but never mounted by App.tsx / DesktopShellV3 — a second, larger dead-code body beyond the already-known apps/desktop/archive/** — P1 · Desktop (Tauri) · `dead-code`

_Screen/component:_ n/a — none of these render from any reachable route

**Current state.** `knip` (configured in knip.json for this exact workspace) reports 748 unused files repo-wide, 183 of them under apps/desktop/src/features/. Cross-verified at file granularity (not directory-level, since knip correctly leaves live files like SettingsPanel.tsx and ArtifactPanel.tsx unflagged inside otherwise-mixed directories): grepped every directory name above against apps/desktop/src for any import outside the directory itself — zero hits for notifications, reminders, roi-dashboard, analytics, canvas, messaging (UI), background-tasks (UI), outcomes, teams. Cross-checked against App.tsx's actual `lazy(() => import(...))` list (the real mount surface): it lazy-loads exactly overlay/VisualizationLayer, floating-chat, automation/RecorderHud, v3 (DesktopShellV3), chat/SearchModal, chat/CommandPalette, quick-query, voice/VoiceInputOverlay, onboarding, auth/AuthPage, settings/{SettingsPanel,DesktopCloudSettingsModal,AutomationPermissionsModal}, updates, execution/TimeoutWarningDialog, status-banner, offline-indicator, errors/ErrorToast — none of the 30 directories above appear. This is distinct from and additional to the already-documented apps/desktop/archive/ (204 files, correctly excluded from tsconfig/vite and zero-imported) — this second body is still inside the live, compiled src/ tree.

**Expected state.** Either this body of work represents planned-but-unshipped desktop surfaces (ROI dashboard, in-app notification center, reminders, workflow builder, team activity, message composer) that should be prioritized and mounted — several of these map directly to real ChatGPT/Claude parity gaps this audit's sibling domains already flag (e.g. in-app notification center is called out as NOT BUILT in web-frontend.md's summary table) — or it is abandoned exploration that should be deleted so `src/` reflects the shipped product, the way `archive/` already does for the superseded chat UI.

**Benchmark.** ChatGPT/Claude web+desktop — both ship a working in-app notification center and usage/cost dashboard; this repo has fully-built versions of both sitting unreachable rather than absent, which is a worse state for a reviewer to discover than a documented gap

**Evidence.** Ran `pnpm exec knip --reporter compact` at repo root (knip.json already scopes apps/desktop with a real entry point, `src/main.tsx`); extracted the 183 apps/desktop/src/features/ hits, grouped by top-level directory (`sed | grep | sort | uniq -c`); spot-verified 11 of ~30 directories individually with `grep -rl` for each component name across apps/desktop/src, confirming zero external importers for notifications, reminders, roi-dashboard (except one incidental test string match on roiStore.ts, not the UI), analytics, canvas, messaging, background-tasks, outcomes, teams, editing, file-upload; separately confirmed via `grep -n 'lazy(\|import(' apps/desktop/src/App.tsx` that none of these paths appear in the app's real mount list.

**Files.**

- `apps/desktop/src/features/roi-dashboard/** (11 files, incl. RealtimeROIDashboard.tsx, CostSavedChart.tsx, TimeSavedChart.tsx)`
- `apps/desktop/src/features/canvas/** (7 files, incl. CanvasContainer.tsx, CanvasPanel.tsx, CodeEditor.tsx)`
- `apps/desktop/src/features/file-upload/** (7 files, incl. FileDropZone.tsx, FilePreviewModal.tsx)`
- `apps/desktop/src/features/editing/** (5 files, incl. EnhancedDiffViewer.tsx, ConflictResolver.tsx)`
- `apps/desktop/src/features/memory/** (5 UI files: MemoryBadge.tsx, MemoryBrowserModal.tsx, MemoryImportanceIndicator.tsx, MemoryViewer.tsx)`
- `apps/desktop/src/features/reminders/** (4 files)`
- `apps/desktop/src/features/analytics/** (4 files, incl. CostDashboard.tsx, UsageDashboard.tsx)`
- `apps/desktop/src/features/messaging/** (4 files, MessageComposer.tsx)`
- `apps/desktop/src/features/workflows/** (3 files, incl. AutomationBuilder.tsx)`
- `apps/desktop/src/features/background-tasks/** (3 files, BackgroundTaskIndicator.tsx)`
- `apps/desktop/src/features/outcomes/** (3 files, GoalOutcomes.tsx, OutcomesDashboard.tsx)`
- `apps/desktop/src/features/notifications/** (2 files, NotificationCenter.tsx)`
- `apps/desktop/App.tsx (the real lazy-import list that proves absence)`

**Recommendation.** Triage per-directory in one pass: for each of the ~30 directories, either (a) mount it behind a real nav entry (ROI dashboard and notification center are the strongest parity candidates) or (b) delete it. Do not leave it as ambient dead weight — at minimum, move confirmed-abandoned directories into apps/desktop/archive/ where the build/test exclusion already exists, rather than leaving them compiled into the live src/ tree.

#### DEAD-CODE-005

**Organization-invitation expiry cron exists, is fully implemented, and is never scheduled — paid seats held by lapsed invitations are never released automatically** — P1 · Backend · `reliability-gap`

_Screen/component:_ n/a — backend job

**Current state.** `apps/web/app/api/cron/expire-organization-invitations/route.ts` is a complete, defensive handler (`verifyCronRequest` auth, idempotent `status='pending' AND expires_at<=now()` update, honest handling of an unapplied-migration case). Its own doc comment states the business consequence directly: 'A pending invitation HOLDS a licensed seat... If nothing ever flips a lapsed invitation to expired, that seat is never returned and a team silently locks itself out of the seats it paid for... This job is the durable half.' The repo root `vercel.json` wires exactly 9 crons, and `expire-organization-invitations` is not one of them — confirmed by listing every route directory under `apps/web/app/api/cron/` (10 directories) against the 9 scheduled paths.

**Expected state.** Every cron route that exists should be scheduled, or explicitly marked as intentionally invoked another way. Here there is no other trigger: repo-wide grep for the route's path outside `.next` build artifacts and its own service-layer doc-comment finds nothing.

**Benchmark.** n/a — internal reliability/billing-integrity defect

**Evidence.** Parsed vercel.json's cron list programmatically (python json.load) — 9 entries, reset-credits/purge-temporary-chats/reconcile-credits/run-schedules/reclaim-sandboxes/purge-deleted-media/purge-deleted-accounts/expire-support-handoffs/health-probe; `find apps/web/app/api/cron -maxdepth 1 -type d` lists a 10th, expire-organization-invitations, absent from that list; read the route's full implementation (idempotent update + honest unapplied-migration branch); grepped for any other caller — only self-referential `.next` build manifests and the service file's own doc comment.

**Files.**

- `apps/web/app/api/cron/expire-organization-invitations/route.ts`
- `vercel.json`
- `apps/web/db/neon/0085_organization_seats_lifecycle.sql`
- `apps/web/lib/services/organization-invitation-service.ts:108`

**Recommendation.** Add `{"path": "/api/cron/expire-organization-invitations", "schedule": "<daily off-peak>"}` to vercel.json's cron array — the smallest possible fix, since the handler itself is already correct and tested against the not-yet-applied-migration case.

#### DEAD-CODE-003

**A superseded parallel MCP management UI (~2,000 lines) sits in the same directory as the live MCPWorkspace** — P2 · Desktop (Tauri) · `dead-code`

_Screen/component:_ Settings → Connectors tab (live path only)

**Current state.** The live MCP settings surface is `MCPWorkspace.tsx`, lazily imported by direct file path from `features/settings/tabs/Connectors/index.tsx:23` (`lazy(() => import('@/features/mcp/MCPWorkspace'))`), and itself imports `MCPServerCard`, `MCPToolBrowser`, `MCPCredentialManager`, `MCPConfigEditor`, `MCPBundleBrowser` — a distinct, disjoint set of files. `features/mcp/index.tsx` is a barrel exporting `MCPServerManager`, `MCPServerBrowser`, `MCPToolExplorer`, `MCPConnectionStatus` — an older management UI. Neither the barrel nor any of its 4-5 exports (MCPLogsViewer is used only by MCPServerManager itself) has any importer anywhere outside the directory.

**Expected state.** One MCP management UI per directory. The superseded set should not compile into the live app; a reader encountering `features/mcp/` should not have to work out which of two same-purpose implementations is real.

**Benchmark.** n/a — internal duplication, not a competitor comparison

**Evidence.** Read MCPWorkspace.tsx's import list directly (lines 1-13: MCPServerCard, MCPToolBrowser, MCPCredentialManager, MCPConfigEditor, plus a lazy MCPBundleBrowser); read features/mcp/index.tsx (4-line barrel exporting the 4 superseded components); `grep -rl MCPServerManager|MCPServerBrowser|MCPToolExplorer|MCPLogsViewer|MCPConnectionStatus apps/desktop/src` confirmed zero references outside features/mcp/ itself; `wc -l` on all 7 files for the line-count claim; confirmed via GAP-083's own finding (done-claim-verification.md) that the live mount point is Connectors/index.tsx:23, not Connections.

**Files.**

- `apps/desktop/src/features/mcp/MCPServerManager.tsx (598 lines)`
- `apps/desktop/src/features/mcp/MCPServerBrowser.tsx (318 lines)`
- `apps/desktop/src/features/mcp/MCPToolExplorer.tsx (435 lines)`
- `apps/desktop/src/features/mcp/MCPLogsViewer.tsx (132 lines)`
- `apps/desktop/src/features/mcp/MCPConnectionStatus.tsx (508 lines)`
- `apps/desktop/src/features/mcp/index.tsx`
- `apps/desktop/src/features/mcp/MCPWorkspace.tsx (213 lines, live)`
- `apps/desktop/src/features/settings/tabs/Connectors/index.tsx:23`

**Recommendation.** Delete MCPServerManager.tsx, MCPServerBrowser.tsx, MCPToolExplorer.tsx, MCPLogsViewer.tsx, MCPConnectionStatus.tsx and the now-empty index.tsx barrel; keep MCPWorkspace.tsx and its live dependency set.

#### DEAD-CODE-004

**The typed apps/desktop/src/api/\*.ts wrapper layer is largely bypassed by direct invoke() calls, leaving ~15-20 wrapper modules as dead files** — P2 · Desktop (Tauri) · `architecture-gap`

_Screen/component:_ n/a — architectural, not a screen

**Current state.** knip flags apps/desktop/src/api/{apiManagement,automation,automationEnhanced,backgroundTasks,cache,chat,design,email,embeddings,fileOps,index,lsp,metrics,migration,ocr,onboarding,orchestrator,privacy,productivity,projectMemory,screenWatcher,taskPersistence,teamsApi,terminal,tutorials,undo,workflow}.ts as unused files (zero importers). Spot-verified `api/undo.ts`: desktop-tauri.md cites it as evidence that `coding_checkpoint_*` commands are 'used,' but the actual caller, `codingCheckpointStore.ts`, imports `invoke` directly from `lib/tauri-mock` and calls the Tauri command string literally (`codingCheckpointStore.ts:21`) — it never imports `api/undo.ts`. The command IS live; the typed wrapper module that was built to front it is not.

**Expected state.** One access pattern for Tauri commands per feature — either the typed api/\*.ts layer is the real call path (and stores should import it instead of stringly-typed invoke() calls), or it is dead scaffolding and should be removed so a future reader doesn't assume it's the live integration point.

**Benchmark.** n/a — internal architecture consistency

**Evidence.** Cross-referenced knip's 'Unused files' output against apps/desktop/src/api/\*.ts; read codingCheckpointStore.ts:18-22 directly and confirmed it imports `invoke` from `../lib/tauri-mock`, not from `../api/undo`; grepped repo-wide for `from '@/api/undo'` / `from '../api/undo'` / `api/undo'` — zero hits.

**Files.**

- `apps/desktop/src/api/undo.ts`
- `apps/desktop/src/api/terminal.ts`
- `apps/desktop/src/api/chat.ts`
- `apps/desktop/src/api/workflow.ts`
- `apps/desktop/src/api/automation.ts`
- `apps/desktop/src/stores/codingCheckpointStore.ts:21 (imports invoke from lib/tauri-mock directly, not api/undo.ts)`

**Recommendation.** Pick one pattern per command family: route store call sites through the typed api/\*.ts wrappers (gets type safety + a single choke point for retry/telemetry), or delete the wrapper modules that duplicate what a store already does with a raw invoke() call. Do this alongside DEAD-CODE-002/003 since the same triage pass touches the same directories.

#### DEAD-CODE-006

**9 legacy DB tables kept alive only for GDPR/DPDP erasure, 2 fully dead tables with zero references, and a written-but-founder-gated drop migration** — P2 · Backend · `dead-code`

_Screen/component:_ n/a — database schema

**Current state.** `agent_tools`, `agent_tool_executions`, `agent_approval_requests` (remnants of the retired `/api/agents/*` STB-20 subsystem), `chat_messages`, `chat_folders`, `message_bookmarks`, `message_reactions`, `user_shortcuts`, `messaging_connections` are touched only by the account-erasure sweep (superseded by `web_conversations`/`web_messages`). `referrals` and `cloud_waitlist` have zero application-code references at all (waitlistService.ts:11 explicitly calls `cloud_waitlist` 'the older... table, not `cloud_managed_waitlist`'). `0058_drop_legacy_teams.sql` drops `teams`/`team_members` (superseded by `organizations`/`organization_members`) but its own header marks it 'FOUNDER-GATED: NOT applied by this change... an explicitly-gated, separate, founder-run step' — meaning the live schema may still carry two fully-dead tables today, verified by 0 non-SQL references to `team_members` and only migration-bookkeeping references to `teams`.

**Expected state.** Dead tables that exist only for compliance retention are a defensible, intentional state, not a bug — but they should be discoverable as such without re-deriving it from a full-repo grep, and a founder-gated migration that is easy to forget should carry a tracking reminder outside the SQL file's own header.

**Benchmark.** n/a — internal schema hygiene

**Evidence.** Read account-erasure.ts's cited line ranges directly confirming each table is touched only there; read 0058_drop_legacy_teams.sql's header comment; confirmed via web-backend.md's independent grep sweep that `team_members` has 0 non-SQL references and `teams` has 3 (all migration bookkeeping) — cross-verified this against the DEAD-CODE-001 desktop finding, which independently found the desktop-side `teams` UI equally dead, giving two-surface corroboration that this backend concept is fully retired.

**Files.**

- `apps/web/lib/server/account-erasure.ts:60,61,64,65,75,84,89-91`
- `apps/web/db/neon/0058_drop_legacy_teams.sql`
- `apps/web/lib/services/waitlistService.ts:11`

**Recommendation.** File a tracked follow-up (not urgent) for the founder-run 0058 migration so it isn't lost; for the 9 erasure-only tables, either accept the current state explicitly in a schema-level comment (DOCUMENT-AS-INTENTIONAL) or replace the erasure sweep's direct table touches with a documented data-retention policy that doesn't require keeping empty legacy tables around indefinitely.

#### DEAD-CODE-007

**A legacy apps/web/shared/ design-system + type layer (~100+ files) sits dead alongside the live packages/ui/ui + apps/web/lib/ stack, including remnants of an earlier 'AI employee marketplace' product concept** — P2 · Web · `dead-code`

_Screen/component:_ n/a — none of these render

**Current state.** knip flags ~130 files under apps/web/shared/ and apps/web/features/ as entirely unused. Spot-verified: `grep -rln "from '@/shared/ui/sidebar'"` (and chat-bubble, api, types/index, stores/index) across apps/web/app, /features, /components, /lib all return zero hits. Only 6 files anywhere in app/features/lib import anything from `@/shared/`, and those 6 are themselves either part of the already-known dead v3/UnifiedChatPage cascade (DEAD-CODE-009) or import narrow, still-live pieces (e.g. MessageBubble.tsx, the genuinely live message renderer, pulls one utility from shared/). `shared/types/store-types.ts` and `shared/types/index.ts` define types like `AIEmployee`, `MarketplaceEmployee`, `AIEmployeePerformance` — vocabulary from an earlier product framing this repo has since moved away from (the live product is a unified chat workspace, not an AI-employee marketplace), which is itself evidence this tree predates the current architecture. Last commit touching shared/types/index.ts is titled 'refactor(web): close unmounted surface sweep' (2026-07-29), meaning a prior cleanup pass already ran through this area and still didn't finish it.

**Expected state.** A single design-system/type layer. A reader (or an LLM agent) searching for 'sidebar component' or 'AIEmployee type' in this codebase should not land on 100+ files that look real, are fully typed, but render nothing and match no live product vocabulary.

**Benchmark.** n/a — internal architecture hygiene

**Evidence.** Ran knip, filtered to `^apps/web/` unused-file hits (149 total); grep-verified zero importers for 5 representative shared/ files across every plausible consumer directory; read shared/types/store-types.ts and index.ts directly to confirm the marketplace-era type vocabulary; checked git log -1 on shared/types/index.ts for the 'close unmounted surface sweep' commit message.

**Files.**

- `apps/web/shared/ui/sidebar.tsx`
- `apps/web/shared/ui/chat-bubble.tsx`
- `apps/web/shared/ui/expandable-chat.tsx`
- `apps/web/shared/ui/particles.tsx`
- `apps/web/shared/ui/spotlight.tsx`
- `apps/web/shared/components/accessibility/** (6 files)`
- `apps/web/shared/components/dashboard/** (3 files)`
- `apps/web/shared/types/store-types.ts`
- `apps/web/shared/types/index.ts`
- `apps/web/shared/lib/api.ts`

**Recommendation.** Delete apps/web/shared/ in one pass after confirming (via the same knip run) that no file outside it survives on an import from it; the 6 exceptions found need individual triage first (most are themselves part of the already-dead v3 cascade).

#### DEAD-CODE-008

**A second, orphaned 'share a conversation' backend duplicates the live one** — P2 · Web · `dead-code`

_Screen/component:_ Chat header → Share

**Current state.** The live Share button calls `use-share-conversation.ts:98` → `POST /api/share` → `shared_sessions` table → `/share/[token]`. A second, fully-implemented path (`POST/GET /api/shared` → `shared_conversations` table → `/shared/[id]`) has zero UI callers anywhere in apps/web — confirmed by web-frontend.md's grep sweep, and the live path's own test explicitly asserts the negative: `it('posts to /api/share (not the legacy /api/shared route)...')`.

**Expected state.** One reachable share implementation; the second should either be deleted or carry an explicit one-line comment (matching the pattern already used for /billing's post-checkout survival logic) explaining it exists only to keep previously-issued /shared/<id> links resolvable.

**Benchmark.** n/a — internal duplication

**Evidence.** Read web-frontend.md §4.3 directly, which cites exact file:line evidence including the test's own 'legacy' assertion; independently confirmed no additional callers exist by the same grep pattern used elsewhere in this pass.

**Files.**

- `apps/web/app/api/shared/route.ts`
- `apps/web/app/shared/[id]/page.tsx`
- `apps/web/app/api/share/route.ts (live)`
- `apps/web/app/share/[token]/page.tsx (live)`
- `apps/web/features/chat/hooks/use-share-conversation.test.ts:34`

**Recommendation.** Add a one-line comment to app/api/shared/route.ts and app/shared/[id]/page.tsx stating the intentional backward-compatibility reason if links were ever issued from this path in production; otherwise delete both, plus the now-unused `shared_conversations` table.

#### DEAD-CODE-009

**A materially complete conversation-export feature (multi-format: Markdown/PDF/DOCX) and the wider v3-shell/UnifiedChatPage cascade it lives inside are fully built and totally unreachable** — P2 · Web · `dead-code`

_Screen/component:_ Chat header (no Export action reaches users; only Print does)

**Current state.** web-frontend.md independently found EnhancedExportDialog.tsx built, barrel-exported, but its barrel has zero importers, leaving the live chat header with only a Print action for export. knip confirms and substantially widens the blast radius: ~30 files under features/chat/{Main,Sidebar,Tools,workflows,dialogs,artifacts,messages}/ plus UnifiedChatPage.tsx, use-export-conversation.ts, use-unified-adapter.ts, useHelpTour.ts, conversation-export.ts, and document-export.ts are all knip-confirmed unused files — the same cascade web-frontend.md already flagged as 'v3 shell dead code... only consumed by unrouted UnifiedChatPage,' now with the full file list rather than just the export dialog.

**Expected state.** Either mount UnifiedChatPage / the v3 shell as the real chat surface (in which case the export dialog becomes reachable for free), or delete the cascade and rebuild conversation export as a small, standalone feature wired into the live WebChatPage/MessageBubble chat header — the current state means a materially complete feature (multi-format export) reads as absent to any user or PM, despite being fully implemented.

**Benchmark.** ChatGPT web — Export/Download conversation is a standard chat-header action (research/chatgpt-web-desktop.md); this repo has the equivalent feature built and unreachable rather than missing

**Evidence.** Read web-frontend.md §5 for the EnhancedExportDialog finding with exact file:line citations; ran knip and filtered its unused-files output to `apps/web/features/chat/` (30 hits), cross-referencing against the components/hooks/services named in web-frontend.md's own 'v3 shell dead code' summary-table row to confirm they are the same cascade, not a separate issue.

**Files.**

- `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx`
- `apps/web/features/chat/hooks/use-export-conversation.ts`
- `apps/web/features/chat/services/conversation-export.ts`
- `apps/web/features/chat/services/document-export.ts`
- `apps/web/features/chat/pages/UnifiedChatPage.tsx`
- `apps/web/features/chat/components/Main/** (ChatHeader.tsx, ChatTopBar.tsx)`
- `apps/web/features/chat/components/Sidebar/** `
- `apps/web/features/chat/components/Tools/** (ModeSelector.tsx)`
- `apps/web/features/chat/components/workflows/** (WorkingProcess.tsx, ToolProgressIndicator.tsx)`

**Recommendation.** Smallest slice that closes it without a full v3-shell decision: extract EnhancedExportDialog + conversation-export.ts + document-export.ts + use-export-conversation.ts out of the dead cascade, wire them directly into WebChatPage's live header (the way MessageBubble.tsx already lives outside the v3 tree), and delete the rest of the UnifiedChatPage/v3 cascade separately.

#### DEAD-CODE-012

**hooks*\* (12 commands) and background_agent*\* control commands (11) are fully implemented Rust subsystems with zero frontend callers** — P2 · Desktop (Tauri) · `backend-gap`

_Screen/component:_ n/a — no UI exists for either

**Current state.** hooks*add/create_example/export/get_config_path/get_event_types/get_stats/import/initialize/list/reload/remove/toggle/update are backed by a real Claude-Code-style hooks implementation with zero references anywhere in apps/desktop/src, not even in the dev mock dispatch table (lib/tauri-mock.ts). background_agent_cancel/cleanup/get/list/list_active/pause/push/resume/should_push/stats/take_over: the frontend only ever listen()s to background_agent:\* \_events* (read-only status updates); no UI can list, pause, resume, cancel, or take over a background agent.

**Expected state.** A user-visible hooks configuration UI (parity with Claude Code's own hooks system) and background-agent control surface (pause/resume/cancel/take-over — directly relevant to the AGI Work / background-agent parity story this product is built around).

**Benchmark.** Claude Code — hooks are a documented, user-configurable extensibility surface (research/claude-code-chrome-ide.md); this repo has the backend equivalent fully built with zero UI

**Evidence.** Verified via desktop-tauri.md §2, cross-checked its literal-string reachability methodology (three-set diff between all*commands/registered_commands/used_commands) as sound and independently spot-confirmed background_agent*\* has only listen() event subscriptions, not command invocations, via apps/desktop/src/stores/chat/agentWorkflowEvents.ts.

**Files.**

- `apps/desktop/src-tauri/src/core/hooks/config.rs`
- `apps/desktop/src-tauri/src/core/hooks/event.rs`
- `apps/desktop/src-tauri/src/core/hooks/executor.rs`
- `apps/desktop/src/constants/event-names.ts:19-27`
- `apps/desktop/src/stores/chat/agentWorkflowEvents.ts:1070`

**Recommendation.** Prioritize background*agent*\_ control (pause/resume/cancel/take-over) first — it directly extends an existing, live feature (background-agent status watching) with obvious user value. hooks\_\_ is a larger scoping decision (does this product want a Claude-Code-style hooks system exposed to end users?) and can be deferred, but should not stay silently built-and-hidden.

#### DEAD-CODE-013

**~1,777 lines of Discord/Signal/Telegram/WhatsApp messaging client code and a full Gmail OAuth2 flow are fully implemented with zero frontend callers** — P2 · Desktop (Tauri) · `backend-gap`

_Screen/component:_ n/a — Settings → Connectors only exposes generic IMAP/SMTP email, not Gmail OAuth or any messaging platform

**Current state.** messaging_connect_discord/signal/telegram, messaging_disconnect, messaging_get_status, messaging_send are real API-client implementations (no stubs/TODOs) with no UI reaching any of them. gmail_oauth_start/complete/refresh/list_accounts/disconnect/get_account is a complete Google OAuth2 flow with zero frontend callers; the UI's actual 'connect email' path calls the generic `email_connect` command (credential-based IMAP/SMTP) instead, meaning users cannot use the dedicated, more secure Gmail OAuth path the backend already supports.

**Expected state.** A Connectors/Integrations settings tab exposing Discord/Signal/Telegram/WhatsApp connections and a 'Sign in with Google' option for email specifically, backed by the OAuth flow that already exists.

**Benchmark.** ChatGPT/Claude — neither ships native messaging-platform connectors, but both offer OAuth-based (not credential-based) email/calendar connectors where applicable; this repo has built more integration depth than either competitor and is not surfacing any of it

**Evidence.** Verified via desktop-tauri.md §2's literal-string reachability sweep; independently confirmed apps/desktop/src/api/email.ts:52 is the only email-connect call site the UI uses and it targets the generic `email_connect` command, not any `gmail_oauth_*` command.

**Files.**

- `apps/desktop/src-tauri/src/features/messaging/discord.rs`
- `apps/desktop/src-tauri/src/features/messaging/signal.rs`
- `apps/desktop/src-tauri/src/features/messaging/telegram.rs`
- `apps/desktop/src-tauri/src/features/messaging/whatsapp.rs`
- `apps/desktop/src-tauri/src/features/communications/gmail_oauth.rs`
- `apps/desktop/src-tauri/src/sys/commands/gmail_oauth.rs`
- `apps/desktop/src/api/email.ts:52`

**Recommendation.** Gmail OAuth is the smaller, higher-value slice: wire a 'Connect Gmail' button in the email-account settings UI that calls the existing gmail_oauth_start/complete flow instead of building this from scratch. Messaging-platform connectors are a larger product decision (four separate platforms) and should get an explicit build/cut call rather than staying silently built.

#### DEAD-CODE-014

**Two duplicated backend subsystems: settings*v2*\_ (fully-migrated parallel settings store, unused) and checkpoint\_\_ (conversation checkpoints, unused, duplicating the live coding*checkpoint*\* system)** — P2 · Desktop (Tauri) · `dead-code`

**Current state.** settings_v2_get/set/delete/get_batch/get_category/list_all/load_app_settings/save_app_settings/clear_cache (9 commands) back a fully-migrated `settings_v2` SQLite table with complete CRUD, but the frontend settings store exclusively uses the older settings_load/settings_save/settings_load_from_disk commands. checkpoint_create/restore/list/delete (conversation-level checkpoints, backed by conversation_checkpoints + checkpoint_restore_history tables) has zero frontend callers, while coding_checkpoint_create/list/rewind (file-snapshot checkpoints) is what the UI actually uses.

**Expected state.** One settings persistence path, one checkpoint system. Two independently-built, fully-functional parallel implementations of the same concept is exactly the drift class this audit is asked to surface.

**Benchmark.** n/a — internal duplication

**Evidence.** Verified via desktop-tauri.md §2 (both subsystems independently traced with file:line evidence for both the dead and live implementations of each pair); this is a high-confidence, well-evidenced pre-existing finding, re-confirmed rather than newly discovered.

**Files.**

- `apps/desktop/src-tauri/src/sys/commands/settings_v2.rs`
- `apps/desktop/src-tauri/src/data/db/migrations.rs:1396`
- `apps/desktop/src/stores/settingsStore.ts:1433-1833`
- `apps/desktop/src-tauri/src/sys/commands/checkpoints.rs:46-221`
- `apps/desktop/src-tauri/src/sys/commands/undo.rs:144-170`
- `apps/desktop/src/stores/codingCheckpointStore.ts:92,129`

**Recommendation.** settings*v2: either migrate settingsStore.ts onto it (it's the more complete schema) and delete the old settings_load path, or delete settings_v2 entirely if the old path is preferred. checkpoint*_: delete it outright — coding*checkpoint*_ already covers the live use case and a conversation-level checkpoint concept was apparently abandoned mid-build.

#### DEAD-CODE-015

**Global-shortcut customization is fully built (persistence + validation) but has zero callers; the tray-menu refresh function is likewise dead; the entire Electron IPC bridge is inert in the default shipped configuration** — P2 · Desktop (Electron) · `dead-code`

_Screen/component:_ n/a — no settings UI exposes shortcut customization in the Electron shell

**Current state.** electron/settingsStore.ts persists `{quickAskShortcut, screenshotShortcut}` via `saveSettings()`, with full accelerator validation/normalization in garnishCore.ts — but `saveSettings` is never called anywhere in electron/ or src/, and there is no IPC channel, UI, or tray item to trigger it, so shortcuts are permanently fixed at DEFAULT_SHORTCUTS. `refreshTrayMenu()` (tray.ts:99-101) exists specifically to rebuild the tray menu after a shortcut change but is never called (only `createTray` runs once at startup). Separately, all 9 Electron IPC channels (window control, dialog, notify, relaunch, check-update, etc.) are wired correctly but the preload script that exposes `window.agiHost` is only attached when `AGI_CLOUD_RENDERER=bundled` is explicitly set — the default (unset) shipped configuration has no preload script at all, so the entire bridge is unreachable unless an operator opts in.

**Expected state.** If shortcut customization is a wanted feature, wire a settings-panel control to `saveSettings()` and call `refreshTrayMenu()` after it persists. The IPC-bridge-inert-by-default state is confirmed intentional (matches the founder-locked 'thin Chromium wrapper pointed at the hosted web app' architecture) and is not itself a defect — it is listed here per the audit brief's explicit ask to confirm it.

**Benchmark.** n/a — internal architecture

**Evidence.** Verified via desktop-electron.md §2 (grep-confirmed zero callers for saveSettings and refreshTrayMenu; main.ts:477-483's `!isRemote` branch gate on preload attachment read directly in that doc with exact line citations).

**Files.**

- `apps/desktop/electron/settingsStore.ts`
- `apps/desktop/electron/garnishCore.ts:17-23`
- `apps/desktop/electron/tray.ts:99-101`
- `apps/desktop/electron/main.ts:634-637`
- `apps/desktop/electron/main.ts:477-483`

**Recommendation.** Shortcut customization: wire a UI control (even a simple text-entry pair in an Electron-only settings section) through saveSettings() + refreshTrayMenu(), or delete the dead persistence/validation layer. The IPC-bridge-inert-by-default state: DOCUMENT-AS-INTENTIONAL, no action needed — it correctly matches the documented architecture.

#### DEAD-CODE-016

**An entire built-and-tested edge-case UX library (battery/thermal/storage/model-loading/file-error modals) has zero import sites and no sensor ever triggers it** — P2 · Mobile · `dead-code`

_Screen/component:_ n/a — none of these render; the composer's inline error text is what actually ships for file-size errors

**Current state.** All 9 components are exported from the feature's barrel, fully copy-locked (copy.ts), and covered by isolated render tests, but repo-wide grep (excluding the edge-cases directory and its own tests) finds zero import sites for any of them. `OfflineBanner.tsx` is the only edge-case component actually mounted (from app/\_layout.tsx). Real file-size errors are handled by a different mechanism entirely — inline composer text (attachmentValidation.ts:107-108) — confirming FileTooLargeModal/ImageTooLargeModal are superseded, not pending integration. No battery/thermal sensor listener (expo-battery or a native thermal API) exists anywhere, so BatteryLowModal/ThermalThrottleModal have no trigger condition even if mounted.

**Expected state.** Either wire these into the real failure paths they were designed for (a coherent, on-brand error-state system beats ad-hoc inline text for the more severe cases like storage-full or model-loading-first-run), or delete the library — CLAUDE.md's own 'finish what you start' rule names exactly this pattern.

**Benchmark.** n/a — internal; a coherent edge-case UX system would be a genuine differentiator if wired, since neither ChatGPT nor Claude mobile documents anything this dedicated for device-resource edge cases

**Evidence.** Verified via mobile.md §14 (already-thorough independent trace: grep for each of the 9 component names outside their own directory, confirmed via attachmentValidation.ts that a second real mechanism already covers the file-size case, confirmed no battery/thermal sensor code exists anywhere in native/).

**Files.**

- `apps/mobile/src/features/edge-cases/components/BatteryLowModal.tsx`
- `apps/mobile/src/features/edge-cases/components/ThermalThrottleModal.tsx`
- `apps/mobile/src/features/edge-cases/components/StorageFullModal.tsx`
- `apps/mobile/src/features/edge-cases/components/ModelLoadingFirstRunModal.tsx`
- `apps/mobile/src/features/edge-cases/components/FileTooLargeModal.tsx`
- `apps/mobile/src/features/edge-cases/components/ImageTooLargeModal.tsx`
- `apps/mobile/src/features/edge-cases/components/FileUnreadableModal.tsx`
- `apps/mobile/src/features/edge-cases/components/MessageErrorScreen.tsx`
- `apps/mobile/src/features/edge-cases/components/CloudTeaseModal.tsx`
- `apps/mobile/src/features/edge-cases/__tests__/edge-cases.test.tsx`

**Recommendation.** Wire the two highest-value ones first — StorageFullModal (real failure mode, no current handling found) and ModelLoadingFirstRunModal (directly relevant to the local-model download UX mobile.md documents elsewhere) — and delete the remaining 7 if there's no near-term plan to add battery/thermal sensors or a dedicated message-error screen.

#### DEAD-CODE-019

**Two self-documented unwired-by-design packages (@agiworkforce/browser-tool, @agiworkforce/licensing) plus an independent, unverified-parity Rust mirror of the licensing package** — P2 · Shared packages · `dead-code`

**Current state.** browser-tool's own README states 'Consumers: None today... its only importer was deleted with its bridge in bfce749b3 (2026-08-09)' and flags apps/extension/package.json's dependency entry on it as stale — confirmed live in knip's 'Unused dependencies' output for apps/extension/package.json. @agiworkforce/licensing (offline enterprise license/org-policy verification) is self-documented as 'NOT wired into any app runtime, UI, or enforcement path' with zero consumers across every app. A separate Rust crate, crates/agiworkforce-licensing, independently reimplements the same design with no fixture-replay parity test between the two (unlike the sync package, which has one).

**Expected state.** Both are honestly self-documented as not-yet-wired rather than faked as complete — this is good practice and not a bug per se. The residual risk worth tracking: if/when enterprise licensing is wired, the TS and Rust implementations could silently diverge with no test catching it.

**Benchmark.** n/a

**Evidence.** Read shared-packages.md's direct citations (README quote, self-documented doc comments in both licensing implementations); cross-verified apps/extension/package.json's stale browser-tool dependency independently via knip's 'Unused dependencies' section, which lists exactly `@agiworkforce/browser-tool, @agiworkforce/provider-runtime` for that manifest.

**Files.**

- `packages/tools/browser-tool/README.md`
- `apps/extension/package.json`
- `packages/contracts/licensing/src/index.ts:9-11`
- `crates/agiworkforce-licensing/src/lib.rs:6,19-21`

**Recommendation.** Remove the stale @agiworkforce/browser-tool dependency line from apps/extension/package.json (zero-risk, confirmed dead). For licensing: DOCUMENT-AS-INTENTIONAL for now, but add a fixture-replay contract test between the TS package and the Rust crate before either is wired into a real enforcement path, so they can't silently drift the way desktop/mobile's egress allowlists already did once (per trust-boundaries package's own history).

#### DEAD-CODE-020

**A duplicated EU AI Act provenance-marker implementation has a real serialization bug that breaks cross-surface interoperability** — P2 · Cross-surface · `broken-workflow`

_Screen/component:_ n/a — server-side provenance marking on generated images/video

**Current state.** apps/web/lib/compliance/ai-act.ts hand-restates the shared @agiworkforce/compliance package's marker shape (because that package isn't a declared web dependency) and its own comment documents a real bug in the shared package it mirrors: `serialiseClaim` does `JSON.stringify(claim, Object.keys(claim).sort())` — an array replacer applied as a global key allowlist at every nesting depth, not just the top level. Since nested `assertions[].label`/`.action` keys never appear in the top-level claim's key list, mobile's real emitted sidecar serializes `assertions` as `[{}]`, and web's `hasAiGeneratedProvenance()` would reject mobile's own output if the two were ever compared — despite both files claiming 'wire-compatible by type.'

**Expected state.** A single shared implementation, or if duplication is unavoidable short-term, correct serialization that both surfaces actually agree on. This is a compliance-relevant correctness bug, not just an architecture smell — an EU regulator or auditor comparing mobile-produced and web-produced provenance markers would find them incompatible.

**Benchmark.** n/a — regulatory correctness

**Evidence.** Read apps/web/lib/compliance/ai-act.ts:1-38 directly (module doc comment states the bug explicitly and verbatim); read packages/contracts/compliance/src/article50-marker.ts:120-140 directly, confirming the `JSON.stringify(claim, Object.keys(claim).sort())` call and that Object.keys(claim) only enumerates top-level keys.

**Files.**

- `apps/web/lib/compliance/ai-act.ts:26-38`
- `packages/contracts/compliance/src/article50-marker.ts:138`

**Recommendation.** Fix serialiseClaim to sort keys recursively at every nesting depth (e.g. a custom replacer function or a deep-sort-then-stringify helper) rather than passing a flat array as the global allowlist; this is the smallest fix and unblocks eventually collapsing the web-side hand-restated duplicate back onto the shared package.

#### DEAD-CODE-023

**wiring-allowlist.json's self-tracked ~58 registeredWithoutReachableCaller commands — re-verification of an already-known, self-documented lead** — P2 · Desktop (Tauri) · `backend-gap`

**Current state.** The project's own CI-enforced wiring gate (a real reachable-import-graph walk from main.tsx, not a lexical sweep — it exists specifically because a prior lexical-only check let ~96 registered commands 'pass' while unreachable, incident SIX-32) currently exempts ~58 commands across coherent feature families: the generic api*\* HTTP/OAuth/template client (13 commands), a full undo/redo subsystem (undo*_, form*undo*_ — 13), a task/scheduler subsystem (task*\*, scheduler_get*\* — 9), project-memory management (4), coordination/approvals (3), architectural-decision tracking (4), and a Lovable migration importer (3). Every entry carries the identical, honest boilerplate: 'the only invoke() call sites... live in desktop modules that are unreachable from main.tsx... this list may only shrink.'

**Expected state.** This is a working, self-enforcing debt ledger, not a newly-discovered defect — the gate actively prevents the list from growing silently (staleAllowlist / staleReachabilityAllowlist checks). Flagging per the audit brief's explicit instruction to confirm it, not because it needs a different mechanism.

**Benchmark.** n/a

**Evidence.** Read apps/desktop/wiring-allowlist.json in full (283 lines); read desktop-tauri.md §1 and desktop-electron.md §7's independent description of check-wiring.mjs's reachable-import-graph methodology, confirming the mechanism is sound rather than a rubber stamp.

**Files.**

- `apps/desktop/wiring-allowlist.json`
- `apps/desktop/scripts/check-wiring.mjs`
- `apps/desktop/check-wiring.sh`

**Recommendation.** DOCUMENT-AS-INTENTIONAL for the gate mechanism (keep it — it is good engineering). For the ~58 entries themselves: the undo/redo and task/scheduler subsystems are the strongest candidates to actually wire (real, generically useful capabilities with no UI at all), while the Lovable migration importer is the strongest deletion candidate (narrow, single-purpose, likely abandoned). Route each family to a mounted surface or delete it — the file's own comment already commits to 'may only shrink.'

#### DEAD-CODE-010

**3 legacy-alias usage/billing API routes have zero callers anywhere in the monorepo** — P3 · Web · `dead-code`

_Screen/component:_ n/a — API only

**Current state.** All three route files self-document as 'Legacy alias' in their own doc comments and delegate to `getManagedUsageSummary`. Repo-wide grep (web/app, web/lib, web/features, web/components, desktop/src, mobile/src, mobile/app, packages) for each of the three literal path strings returns zero non-route-file, non-test hits. The sibling `billing/analytics` route uses the identical pattern but IS live — confirmed called from `apps/desktop/src/stores/billingUsage.ts`. The web Settings > Usage panel itself calls the base `/api/usage` route, not any of the three.

**Expected state.** Routes kept 'for old clients' should either have a known external consumer (documented) or be removed; three routes with confirmed zero consumers anywhere, including no external API documentation reference found, are pure surface area.

**Benchmark.** n/a — internal API surface hygiene

**Evidence.** Read all three route files' opening comments directly; ran `grep -rn "usage/analytics\|usage/history\|usage/providers"` across apps/web/app, apps/web/lib, apps/web/features, apps/web/components, apps/desktop/src, apps/mobile/src, apps/mobile/app, packages — zero hits outside the route files and .next build artifacts; confirmed billing/analytics's caller in apps/desktop/src/stores/billingUsage.ts as the contrasting live case.

**Files.**

- `apps/web/app/api/usage/analytics/route.ts`
- `apps/web/app/api/usage/history/route.ts`
- `apps/web/app/api/usage/providers/route.ts`
- `apps/web/app/api/billing/analytics/route.ts (sibling, still live — desktop calls this one)`

**Recommendation.** Delete the 3 dead route files, or if a documented external/partner API contract references them, add a code comment recording that and keep them.

#### DEAD-CODE-011

**qa-artifacts and /dev/inline-toolcall-demo harnesses — correcting the audit brief's framing: these do NOT ship reachable to production, but the tracked source still embeds a stray local filesystem path** — P3 · Web · `dead-code`

_Screen/component:_ n/a — dev-only

**Current state.** Both routes are guarded by a Server Component layout that calls Next.js `notFound()` whenever `process.env.NODE_ENV === 'production'` — and `next build` always sets NODE_ENV=production regardless of the hosting tier, so this holds on preview deployments too, not just the production domain. Both paths are additionally listed in `DISALLOW_APP` (site.ts:79-81) so crawlers never index them even if briefly live. `apps/web/app/qa-artifacts/` is furthermore listed in the repo root `.gitignore:252` and confirmed via `git ls-files` to be completely untracked — it cannot reach a git-based deploy at all; it exists only as local scratch in this working tree. `apps/web/app/dev/inline-toolcall-demo/page.tsx` IS git-tracked (confirmed via `git ls-files`) and does contain the literal string `~/Desktop/reference/ui/desktop/claude-artifacts/...` as cited by the audit brief and the route-sweep doc — but that string only ever renders when NODE_ENV is not 'production', i.e. never in a real deployment.

**Expected state.** The kill-switch pattern here is a genuinely good, well-engineered design (belt-and-braces: env guard + gitignore + robots disallow) and should not be torn out. The one real, if minor, residual issue is hygiene: a committed source file permanently carries a specific person's local directory path in a string literal, which is unnecessary even in dev-only code and would look strange to an external contributor or auditor reading the tracked source.

**Benchmark.** n/a — internal hygiene, not a competitor comparison

**Evidence.** Read apps/web/app/qa-artifacts/layout.tsx and apps/web/app/dev/layout.tsx in full (both implement the NODE_ENV==='production' -> notFound() guard with explanatory comments); ran `git ls-files apps/web/app/qa-artifacts/ apps/web/app/dev/` — qa-artifacts returns nothing (untracked), dev/inline-toolcall-demo returns 2 tracked files; ran `grep -n qa-artifact .gitignore` at repo root, found line 252; read apps/web/lib/seo/site.ts:68-82 confirming both `/dev/` and `/qa-artifacts` are in DISALLOW_APP. This directly contradicts the audit brief's framing that these 'ship in the route tree' as a live reliability defect — they are dev-only by a real, tested, multi-layered guard, and web-route-sweep-findings.md's 200-status observations were from a local `next dev` server (NODE_ENV=development), where the guard is intentionally inactive.

**Files.**

- `apps/web/app/qa-artifacts/layout.tsx`
- `apps/web/app/dev/layout.tsx`
- `apps/web/app/dev/inline-toolcall-demo/page.tsx`
- `apps/web/lib/seo/site.ts:68-82 (DISALLOW_APP)`
- `.gitignore:252`

**Recommendation.** DOCUMENT-AS-INTENTIONAL for the guard mechanism itself — do not remove it. As a small hygiene fix, replace the literal `~/Desktop/reference/...` path string in inline-toolcall-demo/page.tsx with a generic placeholder or a comment-only reference, since the real path serves no functional purpose in the harness.

#### DEAD-CODE-017

**A pre-drawer sidebar implementation (7 files) is fully superseded and dead** — P3 · Mobile · `dead-code`

_Screen/component:_ n/a — DrawerContent.tsx is the live navigation surface

**Current state.** Repo-wide grep for imports from `@/src/features/sidebar` returns zero hits outside the directory itself. Live navigation is entirely `src/features/drawer/components/DrawerContent.tsx`.

**Expected state.** Delete the superseded tree.

**Benchmark.** n/a

**Evidence.** Verified via mobile.md §15; already flagged in docs/agent-context/known-flaws.md as a cleanup item and confirmed still present/unreferenced at current HEAD.

**Files.**

- `apps/mobile/src/features/sidebar/Sidebar.tsx`
- `apps/mobile/src/features/sidebar/ConversationList.tsx`
- `apps/mobile/src/features/sidebar/ConversationItem.tsx`
- `apps/mobile/src/features/sidebar/SearchBar.tsx`
- `apps/mobile/src/features/sidebar/SidebarHeader.tsx`
- `apps/mobile/src/features/sidebar/TagFilter.tsx`
- `apps/mobile/src/features/sidebar/AutoTagBadge.tsx`

**Recommendation.** Delete apps/mobile/src/features/sidebar/ — already-tracked cleanup, safe to action any time.

#### DEAD-CODE-018

**widget-setup screen has no navigation entry point** — P3 · Mobile · `dead-code`

_Screen/component:_ n/a — reachable only by typing the URL manually

**Current state.** The screen itself was correctly refactored to an honest Siri-Shortcuts how-to (no false widget-availability claims — good prior fix), and the route is registered but hidden (`options={HIDDEN}` at \_layout.tsx:119). No router.push/href to /widget-setup exists anywhere in the drawer, settings, or onboarding flows.

**Expected state.** Either link it from Settings (a natural home given it's a legitimate Siri Shortcuts setup guide) or delete the route entirely — a hidden, unreachable screen serves no one.

**Benchmark.** n/a

**Evidence.** Verified via mobile.md §5 (file-level comment confirms deliberate pause of active development; grep confirmed no reachable entry point).

**Files.**

- `apps/mobile/app/(app)/widget-setup.tsx`
- `apps/mobile/src/features/widget-setup/index.tsx`
- `apps/mobile/app/(app)/_layout.tsx:119`

**Recommendation.** Add a single Settings row ('Siri Shortcuts setup') linking to /widget-setup, or delete the route + component if v1.1 widget work is not imminent.

#### DEAD-CODE-021

**Scheduled-task origin check fails open for legacy (pre-origin-stamp) tasks** — P3 · Chrome extension · `reliability-gap`

_Screen/component:_ n/a — background scheduler

**Current state.** `shouldExecuteScheduledTask()` returns `true` unconditionally when `task.createdByOrigin` is falsy, with the comment '// legacy task pre-stamp; permit' — the only fail-open branch in an otherwise fail-closed provenance-gating codebase (every other gate in this surface, per the inventory's own review, is fail-closed).

**Expected state.** Either migrate/re-stamp legacy tasks on next read so the fail-open branch can be removed, or auto-delete unstamped tasks instead of permitting them, matching the fail-closed posture used everywhere else in this codebase.

**Benchmark.** n/a — internal security posture consistency

**Evidence.** Read apps/extension/src/background/policy.ts:719-732 directly, confirming the exact fail-open branch and comment cited by extension-chrome.md's own NEEDS_VALIDATION finding; this closes that finding from NEEDS_VALIDATION to CONFIRMED.

**Files.**

- `apps/extension/src/background/policy.ts:727-732`

**Recommendation.** Add a one-time migration that stamps `createdByOrigin` on any existing task missing it (using the currently-active allowlist as the stamp), then flip the fallback to fail-closed (`return false`) so a future unstamped task is auto-deleted rather than silently permitted.

#### DEAD-CODE-022

**apps/desktop/archive/ — 204 files of superseded chat UI, confirmed correctly isolated (re-verification of an already-known lead)** — P3 · Desktop (Tauri) · `dead-code`

**Current state.** 204 files (old MessageBubble/Cards/Timeline/Sidecar/InlinePanels/Visualizations/Widgets component trees) sit as a sibling to src/, excluded from tsconfig's include list and from Vitest with an explicit 'Superseded... unreachable from main.tsx' comment. Zero imports from src/ into archive/ confirmed by grep.

**Expected state.** This is already the correct end state for genuinely dead code — excluded from build and test, clearly named, not silently mixed into the live tree. No action needed.

**Benchmark.** n/a

**Evidence.** Re-verified via desktop-tauri.md §8 and desktop-electron.md §6/§8, both independently confirming zero live imports and correct build/test exclusion.

**Files.**

- `apps/desktop/archive/features/chat/**`
- `apps/desktop/archive/features/tool-calling/**`
- `apps/desktop/tsconfig.json`
- `apps/desktop/vite.config.ts:450-453`

**Recommendation.** DOCUMENT-AS-INTENTIONAL — no action needed beyond periodically confirming (e.g. in CI) that archive/ stays excluded and unimported, which it already is.

### Design system & accessibility

_12 gaps · source: `gaps/domain-design-system.json` · narrative: `gaps/domain-design-system.md`_

#### DESIGN-SYSTEM-001

**VS Code design-token CI guard is currently red on a false positive** — P1 · VS Code extension · `broken-workflow`

_Screen/component:_ n/a (release CI gate)

**Current state.** check-vscode-theme-tokens.mjs's `named-color-prop` regex flags any `background:`/`color:`/`border-color:` value that is not one of a short allow-list (`var(`, `transparent`, `inherit`, `initial`, `currentColor`, `none`) followed by 3+ letters. `color-mix(...)` starts with the letters "color", which is not on the allow-list, so `background: color-mix(in srgb, var(--warning) 10%, var(--bg-elevated));` at webviewContent.ts:290 — a fully token-driven declaration — trips the rule. Running `node apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs` on the clean commit e15df56e3 prints `check:vscode-theme-tokens — FAIL: 1 new hardcoded color literal(s) found` and this exact command is invoked unconditionally at release-vscode-extension.yml:98.

**Expected state.** The guard should recognize `color-mix()` (and other token-composing CSS functions such as `color-contrast()`/`light-dark()`) as token-safe, matching how the codebase already uses `color-mix()` correctly elsewhere (e.g. apps/web/features/chat/components/messages/cards/MapSearchCard.tsx uses `color-mix(in srgb, hsl(var(--primary)) 18%, transparent)`). A release-blocking lint gate should never fail on code that is already following the convention it exists to enforce.

**Benchmark.** n/a — this is an internal tooling-correctness gap, not a competitor-parity gap. ChatGPT/Claude's own CI is not observable, but the bar is that a merge-blocking lint gate must not have false positives on correct code.

**Evidence.** Ran `node apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs` from apps/extension-vscode on the clean tree; it exited non-zero with `FAIL: 1 new hardcoded color literal(s) found` pointing at webviewContent.ts:290. Read the regex definition (RULES array, named-color-prop) and confirmed `color-mix` is not excluded by any of its five negative lookaheads. Confirmed the violating line itself (`background: color-mix(in srgb, var(--warning) 10%, var(--bg-elevated));`) is fully tokenized, not a literal. Confirmed the script is invoked unconditionally (no `continue-on-error`) at release-vscode-extension.yml:98, which triggers on `v-vscode-*` tags and workflow_dispatch — i.e. the next real VS Code extension release. Confirmed the existing 1-key baseline file (.no-hex-baseline.json, ~33 grandfathered entries) does not contain this line, so it cannot be silently absorbed.

**Files.**

- `apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs:34-36`
- `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:290`
- `.github/workflows/release-vscode-extension.yml:98`

**Recommendation.** Add `color-mix(` (and other CSS color-function calls that only take token/keyword arguments, e.g. `color-contrast(`, `light-dark(`) to the named-color-prop rule's negative-lookahead allow-list in check-vscode-theme-tokens.mjs, or restrict the rule to require the captured value NOT start with a CSS function call at all (`(?![\w-]+\()`). Re-run the script to confirm a clean exit before the next `v-vscode-*` tag.

#### DESIGN-SYSTEM-002

**Shared component library (@agiworkforce/ui) does not reach the two extension surfaces** — P1 · Cross-surface · `architecture-gap`

_Screen/component:_ n/a (architecture)

**Current state.** `@agiworkforce/ui` ships 56 primitive components (Button, Dialog, DropdownMenu, ContextMenu, Popover, Tooltip, Tabs, Table, DataTable, Badge, EmptyState, Spinner, Skeleton, Toast, etc.), each with real a11y engineering (focus-visible rings, aria-busy, icon-only fallback labels). `grep -rl "@agiworkforce/ui" apps` finds it imported in 113 files under apps/web and 54 files under apps/desktop, and in zero files under apps/extension, apps/extension-vscode, apps/mobile, or apps/cli. apps/extension's package.json has no @agiworkforce/ui dependency at all, and its source (87 .ts files, 2 .html, 2 .css, 0 .tsx) confirms the Chrome extension is not built with React — it hand-rolls DOM via vanilla TypeScript (e.g. apps/extension/src/features/side-panel/dom.ts). apps/extension-vscode is also dependency-free of @agiworkforce/ui and renders its sidebar via a hand-built HTML template string (webviewContent.ts). @agiworkforce/design-tokens (the color/radius/font values) does reach both extensions, but the interactive component behavior/markup does not.

**Expected state.** Every fix landed once in the shared primitive package (a contrast fix, a focus-visible ring, an ARIA attribute) should propagate to every surface that renders a comparable control, the way it already does for web and desktop. At minimum, the drift risk this creates should be tracked: the Spinner.tsx primitive's own doc comment records a concrete instance of exactly this failure mode already happening once ("desktop had dropped `role=\"status\"` ... resolved toward web ... desktop's simplification was almost certainly an accidental regression") — proof this is not a hypothetical risk for a surface with no shared component boundary at all.

**Benchmark.** Claude Desktop / Claude Web / Claude Code (Chrome DevTools panel) — Anthropic's own IDE and browser surfaces share one visual language (spacing, radius, focus rings, iconography) with the flagship web app; see shots-claude-desktop.md and shots-claude-web.md for matching control styling across surfaces.

**Evidence.** grep -rl "@agiworkforce/ui" apps --include="_.ts" --include="_.tsx" | sed pattern-count by app: web=113, desktop=54, all others=0. Confirmed via `python3 -c "import json..."` on apps/extension/package.json and apps/extension-vscode/package.json dependency lists (no @agiworkforce/ui entry in either). Confirmed apps/extension/src file-type composition (`find ... | sed 's/.*\.//' | sort | uniq -c`) is 87 .ts / 2 .html / 2 .css / 1 .js — no .tsx at all, i.e. structurally not React-renderable without a rewrite. Read packages/ui/ui/src/primitives/Spinner.tsx's own top-of-file comment documenting the prior desktop a11y-regression drift incident this exact gap class already produced.

**Files.**

- `packages/ui/ui/src/primitives/ (56 component files)`
- `apps/extension/package.json`
- `apps/extension-vscode/package.json`
- `packages/ui/ui/src/primitives/Spinner.tsx:1-9`

**Recommendation.** Do not attempt to force React into the Chrome extension's content-script surface. Instead, extract a thin, framework-agnostic "control contract" doc (or a tiny headless-CSS layer keyed to the same @agiworkforce/design-tokens custom properties both extensions already consume) so hand-rolled DOM controls can be checked against the same focus/contrast/ARIA rules the React primitives encode, and make packages/ui/ui's own changelog entries (like the Spinner drift note) a required read whenever a primitive's a11y behavior changes.

#### DESIGN-SYSTEM-003

**Automated accessibility CI gates cover only unauthenticated/pre-product screens** — P1 · Cross-surface · `reliability-gap`

_Screen/component:_ n/a (CI coverage)

**Current state.** Web's `a11y:audit` (axe-core, WCAG 2.1 A/AA, wired to CI at ci.yml:719-800 as job `web-a11y`) only visits 5 routes: Home (`/`), Chat (`/chat` — the marketing/landing chat page, not an authenticated conversation), Pricing, Features-Agents, Download. Desktop's `accessibility-audit.spec.ts` (wired to CI at ci.yml:540 via `--project=accessibility-audit`) audits exactly one screen, the signed-out cloud sign-in route, with the comment "The signed-out surface does not require secrets, which keeps the audit deterministic in CI." Neither gate ever authenticates and exercises the real product surface: the Settings modal (packages/ui/ui/src/settings-modal/SettingsModal.tsx, 38 nav destinations), an actual chat conversation with rendered messages/cards/menus, the Artifacts or Research panels, Connectors, or any Dialog/DropdownMenu/ContextMenu/Popover instance — i.e. essentially every component this design-system domain covers.

**Expected state.** At least one authenticated-state pass per surface (a seeded/mocked signed-in session is enough — it does not need a real network account) that opens the Settings modal, a populated chat thread, and one or two dialogs/menus, so a regression in the shared primitives (contrast, focus order, aria-expanded on DropdownMenu, etc.) is caught before merge rather than only being catchable by a human reviewer or user report.

**Benchmark.** n/a — this is an internal test-coverage gap, not a directly observable competitor practice. The bar is: an automated a11y gate that only ever sees the marketing site provides false confidence about the actual product.

**Evidence.** Read apps/web/scripts/a11y-audit.mjs in full: `auditedPages` array (lines 22-28) lists exactly 5 unauthenticated routes; no login/session setup anywhere in the file. Read apps/desktop/e2e/accessibility-audit.spec.ts in full: single test, `page.goto('/')`, comment explicitly states the choice is to keep the audit "deterministic" by staying signed-out. Confirmed both are real, currently-passing CI gates via `grep -n "a11y" .github/workflows/ci.yml` (web-a11y job at line 719, `needs: check`, runs `pnpm --filter @agiworkforce/web a11y:audit` at line 778) and `--project=accessibility-audit` at line 540 for desktop. Confirmed no equivalent gate exists for mobile or either extension (grep for axe-core/AxeBuilder found matches only in apps/web and apps/desktop).

**Files.**

- `apps/web/scripts/a11y-audit.mjs:22-28`
- `apps/desktop/e2e/accessibility-audit.spec.ts:1-42`
- `.github/workflows/ci.yml:719-800`
- `.github/workflows/ci.yml:540`

**Recommendation.** Extend both existing harnesses rather than building new ones: for web, add a signed-in fixture (Clerk test user / mocked session) that opens `/chat` with a seeded conversation, then opens the Settings modal and one command-menu/dialog, and run the same AxeBuilder pass against each state. For desktop, add a second Playwright spec that boots the app past onboarding into the main chat shell (existing e2e fixtures likely already do this for other specs) and reuses accessibility-audit.spec.ts's assertion pattern.

#### DESIGN-SYSTEM-004

**apps/web's own no-hardcoded-color guard is not wired into CI and is currently failing** — P2 · Web · `dead-code`

_Screen/component:_ n/a (lint/CI gate)

**Current state.** apps/web/package.json defines `"check:no-hex-web": "node scripts/check-no-hex-colors.mjs"`, but `grep -rn "check:no-hex-web" .github` finds zero matches — the script is never invoked by any GitHub Actions workflow, pre-commit hook, or turbo pipeline task. Running it directly on the clean tree (`cd apps/web && node scripts/check-no-hex-colors.mjs`) currently fails with 4 real violations: two hex literals in app/brand-assets.test.ts:21-22 and two in app/manifest.ts:14-15 (theme-color meta values). By contrast, the equivalent guard for the Chrome extension (`check:no-hex`) IS wired into ci.yml:146 and release-chrome-extension.yml:114, and currently passes clean.

**Expected state.** The same AP-02 guard class that protects the Chrome extension should protect apps/web — the flagship, highest-traffic surface — in ordinary CI, not just as a script a developer might remember to run locally. At minimum the 4 existing violations should be fixed or the exempt-file list extended (manifest.ts theme-color arguably needs a literal per the Web App Manifest spec and could be added to EXCLUDE_FILES with a comment, same as globals.css already is).

**Benchmark.** n/a — internal tooling gap. Comparable to how the Chrome extension's own guard for this repo is correctly wired, which is the standard this file should be held to.

**Evidence.** Ran `grep -rn "check:no-hex-web" --include="*.yml" --include="*.json" --include="*.mjs" .` repo-wide: only match is the package.json script definition itself. Ran `cd apps/web && node scripts/check-no-hex-colors.mjs` on the clean commit; output: 4 violations listed with exact file:line, exit code 1. Confirmed by contrast that `check:no-hex` (extension) IS referenced in ci.yml:146 and release-chrome-extension.yml:114 and passes when run directly.

**Files.**

- `apps/web/scripts/check-no-hex-colors.mjs`
- `apps/web/package.json:18`
- `apps/web/app/brand-assets.test.ts:21-22`
- `apps/web/app/manifest.ts:14-15`

**Recommendation.** Add a `pnpm --filter @agiworkforce/web check:no-hex-web` step to the existing web CI job in ci.yml (same pattern already used for the extension), and fix the 4 current violations first (either move the two literal hex values into a named constant referenced from both the test and manifest.ts, or add both files to check-no-hex-colors.mjs's EXCLUDE_FILES with the same kind of inline rationale comment globals.css already carries).

#### DESIGN-SYSTEM-005

**Mobile's no-hardcoded-color guard and 640-entry baseline are not wired into CI** — P2 · Mobile · `dead-code`

_Screen/component:_ n/a (lint/CI gate)

**Current state.** The root package.json defines `"check:no-hex-mobile": "node scripts/check-no-hex-colors-mobile.mjs"`, a ratchet-style guard (new violations fail, the ~640 pre-existing ones recorded in apps/mobile/scripts/.no-hex-baseline.json are grandfathered — the baseline's own `_description` field says "New violations will fail CI"). `grep -rn "check:no-hex-mobile" .github` finds zero matches in any workflow file, so despite the tooling and the explicit CI-intent language in the baseline file, nothing currently enforces it. Running the script directly on the clean tree passes (`check:no-hex-mobile PASS`), so today's state is clean, but a regression tomorrow would ship undetected.

**Expected state.** Wired into the mobile CI job the same way apps/extension's and apps/extension-vscode's equivalents are wired into theirs, so the baseline's stated intent ("New violations will fail CI") is actually true.

**Benchmark.** n/a — internal tooling gap, held to the standard the two extension guards in this same repo already meet.

**Evidence.** Ran `grep -rn "check:no-hex-mobile" --include="*.yml" .` repo-wide: no matches outside package.json. Ran `node scripts/check-no-hex-colors-mobile.mjs` from repo root: `check:no-hex-mobile PASS — no new hardcoded color literals.` (exit 0). Read apps/mobile/scripts/.no-hex-baseline.json's `_description` field, which explicitly states the CI-blocking intent that the missing workflow wiring does not deliver. Baseline currently lists 640 grandfathered violations across the mobile app.

**Files.**

- `scripts/check-no-hex-colors-mobile.mjs`
- `apps/mobile/scripts/.no-hex-baseline.json`
- `package.json:116`

**Recommendation.** Add `pnpm check:no-hex-mobile` as a step in whichever CI job already runs mobile lint/tests, gated on mobile-changed paths the same way other mobile-only jobs are scoped.

#### DESIGN-SYSTEM-006

**Chat-response format cards inject un-tokenized rainbow gradients per card type** — P2 · Web · `visual-gap`

_Screen/component:_ Chat — assistant message with a detected recipe/comparison/steps/calculation format

**Current state.** MessageFormatCard.tsx wraps four heuristic-parsed card renderers and is live in the primary chat surface (imported by MessageBubble.tsx:105, rendered at line 1268). Each of the four cards hardcodes its own distinct raw Tailwind palette instead of the app's `--chat-*` design tokens: CalculationCard uses `border-blue-200/50` + `bg-gradient-to-r from-blue-50 to-sky-50` + `bg-blue-100`/`text-blue-700`; ComparisonCard uses `border-indigo-200/50` + `from-indigo-50 to-purple-50` + `bg-indigo-100`/`text-indigo-700`, plus a separate `amber-*` treatment for its "winner" badge; StepsCard uses `from-teal-50 to-cyan-50`; RecipeCard uses `from-amber-50 to-orange-50`. None of these four colors correspond to any of the product's actual semantic tokens (`--chat-accent-primary`/`secondary`, `--chat-success`/`warning`/`info`/`destructive`), and none of them went through the documented AUDIT-FIX GOV-34 WCAG AA contrast pass that every other text/surface pairing in chat.css explicitly records (measured ratios in the file's own comments).

**Expected state.** Format cards should read as the same product as the rest of the chat surface — differentiated by icon and label (which MessageFormatCard.tsx's own header already does via the LABELS map: "Recipe"/"Comparison"/"Steps"/"Calculation"), not by inventing a new color identity per content type. A single neutral card treatment using `--chat-surface-elevated`/`--chat-border`/`--chat-accent-primary` (optionally with a low-emphasis type-specific icon tint drawn from the existing state tokens) would be visually calmer and would inherit the contrast work already done for the rest of the app for free.

**Benchmark.** Claude Web / ChatGPT Web — see shots-claude-web.md and shots-chatgpt-web-macos.md: neither product colors structured-content cards (comparison tables, step lists) by content type; both use one neutral card/table treatment with the single product accent reserved for actual interactive affordances.

**Evidence.** Read all four card components' header markup directly. Confirmed live wiring via `grep -n "MessageFormatCard" apps/web/features/chat/components/messages/MessageBubble.tsx` (imported line 105, rendered line 1268) and read MessageFormatCard.tsx's own doc comment confirming it is "the only sanctioned way to render these cards." Cross-checked packages/ui/design-tokens/src/chat.css and confirmed none of blue/indigo/purple/teal/cyan/amber/orange appear anywhere in the token file — these are raw Tailwind defaults, not product tokens. Counted gradient/raw-Tailwind-color hits: CalculationCard 6, ComparisonCard 14, StepsCard 8, RecipeCard 5.

**Files.**

- `apps/web/features/chat/components/cards/CalculationCard.tsx:198-202`
- `apps/web/features/chat/components/cards/ComparisonCard.tsx:195-199`
- `apps/web/features/chat/components/cards/StepsCard.tsx:131`
- `apps/web/features/chat/components/cards/RecipeCard.tsx:189`
- `packages/ui/design-tokens/src/chat.css:1-196`

**Recommendation.** Replace each card's `CardHeader`/border classes with the shared `--chat-*` tokens (e.g. `bg-[var(--chat-surface-elevated)] border-[var(--chat-border)]`), keep only the icon color as a light per-type accent if desired, and drop the per-card gradient headers entirely — this is a class-rename change with no new component work, closable in one PR across all four files.

#### DESIGN-SYSTEM-007

**Chat top bar uses an off-palette purple/blue gradient CTA and raw Tailwind grays** — P2 · Web · `visual-gap`

_Screen/component:_ Chat — top bar

**Current state.** ChatTopBar.tsx:141 styles its "Dashboard" button with `bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600` — a third, unrelated color identity that matches neither the warm palette (`terracotta`/`teal`, agiPalette.light/dark.accent) nor the ChatGPT-leaning cool palette (`#0b84ff` blue, agiCoolPalette) the rest of the product is deliberately built around (per the founder-decision comment in packages/ui/design-tokens/src/index.ts:72-83). The adjacent Settings icon button at line 133 uses `text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white` — raw Tailwind grays instead of `--chat-text-*`/`--chat-text-secondary` tokens, so it will not track the AA-audited contrast values (or any future re-tuning) the rest of the chat surface's text tokens receive.

**Expected state.** The Dashboard CTA should use the product's actual primary accent token (`--chat-accent-primary`, already used for the composer's send button and other primary actions) rather than a bespoke purple/blue pair invented once for this one button. The Settings icon button should read `--chat-text-secondary`/`--chat-text-muted` so it inherits the audited contrast values and updates automatically if those tokens change.

**Benchmark.** Claude Web / ChatGPT Web top bars (shots-claude-web.md, shots-chatgpt-web-macos.md) use a single flat icon-button treatment for utility actions and reserve color exclusively for the one product accent — no secondary gradient CTA color appears anywhere in either product's captured chat header.

**Evidence.** Read ChatTopBar.tsx lines 125-145 directly. Cross-referenced packages/ui/design-tokens/src/index.ts:71-83 for the documented founder decision establishing the product's two sanctioned accent palettes (warm terracotta/teal, cool ChatGPT-blue) — purple is in neither.

**Files.**

- `apps/web/features/chat/components/Main/ChatTopBar.tsx:133-141`

**Recommendation.** Swap the Dashboard button's className to the same `bg-[var(--chat-accent-primary)] text-[var(--chat-accent-primary-contrast)] hover:opacity-90` pattern used elsewhere for primary actions, and swap the Settings button's grays for `text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)]`.

#### DESIGN-SYSTEM-008

**Shared EmptyState primitive is barely adopted; duplicates regress its own documented contrast fix** — P2 · Web · `partial-implementation`

_Screen/component:_ Artifacts panel, Research panel, and 13+ other list/panel views

**Current state.** packages/ui/ui/src/primitives/EmptyState.tsx is a documented, reusable primitive whose own comment records a real prior fix: "A `bg-muted` tile with a 40%-alpha muted glyph sat at ~1.2:1 on the dark canvas — the tile and icon were both effectively invisible," resolved by using `bg-primary/10` + `text-primary` for the icon tile. Only 2 files in apps/web actually import it. Separately, `grep -rlEi "no .+ (found|yet)|nothing here|get started by"` finds 48 files with hand-written empty-state copy, and at least two of them — ArtifactsPanel.tsx and ResearchPanel.tsx — define their own local `function EmptyState()` that shadows the shared primitive's name entirely. Both local copies use `bg-muted/50` + `text-muted-foreground/60` for their icon tile — the exact low-contrast recipe class the shared primitive's own changelog documents as having been found and fixed elsewhere.

**Expected state.** One EmptyState implementation, imported everywhere a panel needs one, so a future contrast/spacing fix lands once. At minimum, ArtifactsPanel and ResearchPanel's local `EmptyState()` functions should be deleted in favor of `import { EmptyState } from '@agiworkforce/ui'`.

**Benchmark.** Claude Web — code home empty state, connectors empty state, and plugins empty state (shots-claude-web.md lines 241, 404, 686) all share one consistent icon-in-tile + one-line-copy + single-CTA treatment across otherwise unrelated panels.

**Evidence.** Read EmptyState.tsx in full, including its icon-tile contrast-fix comment. Ran `grep -rln "EmptyState" apps/web/features apps/web/app` → 2 files. Ran the broader empty-state-copy heuristic grep → 48 files, then `grep -n "EmptyState" apps/web/features -r` to confirm which of those actually call the shared component (only ArtifactsPanel.tsx:525/573 and ResearchPanel.tsx:305 reference an `EmptyState`, and reading the surrounding code shows both are local `function EmptyState()` definitions at ArtifactsPanel.tsx:56 and ResearchPanel.tsx:104, not imports). Read both local definitions directly and confirmed the `bg-muted/50` + `text-muted-foreground/60` recipe matches the class of bug the shared primitive's comment describes as previously ~1.2:1 contrast.

**Files.**

- `packages/ui/ui/src/primitives/EmptyState.tsx:1-75`
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:56-70`
- `apps/web/features/chat/components/research/ResearchPanel.tsx:104-117`

**Recommendation.** Delete the local `EmptyState()` functions in ArtifactsPanel.tsx and ResearchPanel.tsx, import the shared primitive from `@agiworkforce/ui` instead (passing the existing icon/title/description as props), and grep for the other local-EmptyState duplicates the same 48-file heuristic surfaced to migrate the highest-traffic ones (Settings sections, Connectors) next.

#### DESIGN-SYSTEM-009

**Dedicated accessibility component directory is entirely dead code, including a mocked audit panel** — P2 · Web · `dead-code` · prior art `GAP-275`

_Screen/component:_ n/a — never mounted; would-be dev-tools/settings surface

**Current state.** apps/web/shared/components/accessibility/ contains 650 lines across 8 files (AccessibleButton, AccessibleForm, AccessibleInput, ScreenReaderOnly, SkipLink, SkipLinks, AccessibilityAudit, plus a SkipLinks test). None of the 8 is imported anywhere under apps/web/app, apps/web/features, or apps/web/components — confirmed by grepping each component name against those three directories directly, which returns zero matches for every one of them, including SkipLink/SkipLinks. As a direct consequence, apps/web/app/layout.tsx contains no skip-to-content link and no other implementation of one exists anywhere in the rendered app. Separately, AccessibilityAudit.tsx (301 lines, a Tabs/Card dev-panel UI) wires its entire display to a hardcoded object literal whose own comment reads "Mock accessibility service and types since monitoring was archived" and whose `runAudit()` always resolves to `{ score: 95, passed: 12, failed: 0, warnings: 1, issues: [...one canned info-level issue...] }" and `generateReport()` always returns the literal string "# Accessibility Audit Report\n\nScore: 95%\n\nAll checks passed!" regardless of actual page state.

**Expected state.** Either wire SkipLink into the root layout (a real, cheap, WCAG 2.4.1 Bypass Blocks fix) and delete the remaining unused wrapper components, or — if the direction is to keep a dev-tools accessibility panel — connect AccessibilityAudit.tsx to the same axe-core engine apps/web/scripts/a11y-audit.mjs already uses instead of a hardcoded score, so it can never present a fabricated "all checks passed" result if someone mounts it later.

**Benchmark.** n/a — this is an internal dead-code/fake-data finding, not a competitor comparison. Per CLAUDE.md: "Treat unusual product behavior as a bug ... fake availability badges ... must be fixed immediately when reproducible, or recorded as a concrete blocker."

**Evidence.** Ran `grep -rln <ComponentName> apps/web/app apps/web/features apps/web/components --include="*.tsx"` for each of the 8 filenames individually — all returned empty. Ran `grep -n "skip.to.main|Skip to" apps/web/app/layout.tsx` — no match; read layout.tsx directly to confirm no skip-link markup exists inline either. Read AccessibilityAudit.tsx lines 1-50 directly, confirming the literal mock `accessibilityService` object and its "archived" comment. Cross-referenced audit/ui-gaps.csv GAP-275 (Open, P2), which independently cites a since-deleted `apps/web/shared/components/accessibility/AccessibilitySettings.tsx:63-67` — confirming this directory has drifted/been reorganized since that gap was filed and its file-path evidence is now stale, though the underlying "no contrast/accent control in web Settings" claim GAP-275 makes is a separate, narrower issue from the dead-directory finding here.

**Files.**

- `apps/web/shared/components/accessibility/AccessibilityAudit.tsx:1-50`
- `apps/web/shared/components/accessibility/AccessibleButton.tsx`
- `apps/web/shared/components/accessibility/AccessibleForm.tsx`
- `apps/web/shared/components/accessibility/AccessibleInput.tsx`
- `apps/web/shared/components/accessibility/ScreenReaderOnly.tsx`
- `apps/web/shared/components/accessibility/SkipLink.tsx`
- `apps/web/shared/components/accessibility/SkipLinks.tsx`
- `apps/web/app/layout.tsx`

**Recommendation.** Smallest slice: add `<SkipLink href="#main-content">Skip to content</SkipLink>` (already built, just unmounted) to apps/web/app/layout.tsx and give the main chat/page container `id="main-content"`. Separately, either delete AccessibilityAudit.tsx/AccessibleButton.tsx/AccessibleForm.tsx/AccessibleInput.tsx/ScreenReaderOnly.tsx or file a tracked follow-up to wire AccessibilityAudit.tsx to real axe results before any dev-tools surface exposes it.

#### DESIGN-SYSTEM-010

**No automated accessibility testing; roughly half of touch targets lack an accessibility label** — P2 · Mobile · `reliability-gap`

_Screen/component:_ n/a (cross-app)

**Current state.** apps/mobile/package.json has no axe-core equivalent, no jest-axe, and no react-native accessibility eslint plugin in its dependencies or scripts (unlike apps/web and apps/desktop, both of which run @axe-core/playwright in CI — see DESIGN-SYSTEM-003). `grep -rEo "TouchableOpacity|Pressable" apps/mobile` counts 1,234 occurrences across the app; `grep -rn "accessibilityLabel="` counts 610 — i.e. only about 49% of interactive touch elements declare an explicit accessibility label VoiceOver/TalkBack can announce.

**Expected state.** At minimum a lint rule (eslint-plugin-react-native-a11y or equivalent) catching Pressable/TouchableOpacity instances with only an icon child and no accessibilityLabel, plus a small number of jest + `@testing-library/react-native` accessibility smoke tests on the highest-traffic screens (chat composer, tab bar, model picker).

**Benchmark.** ChatGPT iOS / Claude iOS — both ship full VoiceOver support across their tab bars, composers, and settings trees (shots-chatgpt-ios-shell-settings.md, shots-claude-ios.md); every icon-only control in the captured screenshots has a legible accessible name in Apple's own accessibility inspector conventions.

**Evidence.** Ran `grep -n "accessibility" apps/mobile/package.json` — no test/lint tooling entries (only unrelated keyword matches). Ran `grep -rEo "TouchableOpacity|Pressable" apps/mobile/src apps/mobile/app --include="*.tsx" | wc -l` → 1234. Ran `grep -rn "accessibilityLabel=" apps/mobile/src apps/mobile/app --include="*.tsx" | wc -l` → 610.

**Files.**

- `apps/mobile/package.json`

**Recommendation.** Add eslint-plugin-react-native-a11y (or a small custom rule) to apps/mobile's eslint config to fail CI on new icon-only Pressable/TouchableOpacity without accessibilityLabel, then triage the highest-traffic existing 624 unlabeled instances (tab bar, composer, message actions first).

#### DESIGN-SYSTEM-011

**Reduced-motion preference is respected in only 2 of 23 animation-driving files** — P2 · Mobile · `partial-implementation`

_Screen/component:_ Agent activity indicators, voice UI, onboarding, and other animated screens

**Current state.** `grep -rl "withTiming|withSpring|Animated\.(timing|spring)|useAnimatedStyle" apps/mobile` finds 23 files that drive Reanimated/Animated animations; of those, only 2 (OfflineBanner.tsx and ModelLoadingFirstRunModal.tsx) check `AccessibilityInfo.isReduceMotionEnabled()` before animating. The other 21 always play their full animation regardless of the OS-level reduce-motion setting. By contrast, `useSystemHighContrast` — a comparable OS-accessibility-setting hook covering iOS `isDarkerSystemColorsEnabled`/Android `isHighTextContrastEnabled` — is well-built (live event subscription, per-platform store) and is correctly consumed by useTheme.ts:43, so the app's accessibility-setting-awareness infrastructure exists and works, it just was not extended to motion outside these 2 screens.

**Expected state.** A shared `useReduceMotion()` hook (mirroring the existing useSystemHighContrast pattern) consumed by every Reanimated/Animated call site, or at minimum by the highest-visibility ones: agent "thinking"/activity pulse indicators, voice mode waveforms, and onboarding transitions.

**Benchmark.** Both ChatGPT iOS and Claude iOS respect the OS Reduce Motion setting system-wide per Apple platform conventions; per cross-cutting-and-complaints.md this is standard, uncontested platform behavior neither product deviates from.

**Evidence.** Ran `grep -rl "withTiming\|withSpring\|Animated\.\(timing\|spring\)\|useAnimatedStyle" apps/mobile/src apps/mobile/app --include="*.tsx" | wc -l` → 23. Ran the same file list piped through `xargs grep -l "reduceMotion|isReduceMotionEnabled"` → 2. Read both matching files to confirm they genuinely gate animation behavior on the check (not just mentioning the word in a comment). Read useSystemHighContrast.ts in full and confirmed its live consumption at useTheme.ts:43 via `grep -rn "useSystemHighContrast" apps/mobile`.

**Files.**

- `apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx:33-51`
- `apps/mobile/src/features/edge-cases/components/ModelLoadingFirstRunModal.tsx:52-65`
- `apps/mobile/src/ui/theme/useSystemHighContrast.ts:1-70`
- `apps/mobile/src/ui/theme/useTheme.ts:6,43`

**Recommendation.** Extract a `useReduceMotion()` hook next to `useSystemHighContrast` in apps/mobile/src/ui/theme/, following the identical AccessibilityInfo-subscription pattern, and apply it first to the agent activity/thinking indicator and voice-mode animations (the highest-frequency, highest-duration animations in the app).

#### DESIGN-SYSTEM-012

**Shared Spinner primitive unused; loading indicators fragmented across 60+ raw implementations** — P3 · Web · `partial-implementation`

_Screen/component:_ n/a (cross-app loading states)

**Current state.** packages/ui/ui/src/primitives/Spinner.tsx is a documented primitive whose own comment records a prior a11y-drift fix (desktop had dropped `role="status"` and the sr-only "Loading..." text; resolved toward web's more complete version). It has zero direct usages found in apps/web (`grep -rn "Spinner" apps/web --include="*.tsx"` matches only a code comment and an unrelated `apps/web/shared/ui/loading-spinner.tsx`). Instead, `grep -rl "Loader2\|animate-spin" apps/web/features apps/web/app` finds 60 files implementing their own spin treatment directly with the lucide `Loader2` icon, and a second hand-rolled duplicate exists at apps/web/shared/ui/loading-spinner.tsx (which, to its credit, does correctly replicate `role="status"` + sr-only text + aria-label, so this is fragmentation rather than an active a11y regression).

**Expected state.** One Spinner implementation used everywhere a generic loading indicator is needed, so future visual or a11y refinements (motion, sizing, screen-reader text) land once instead of needing a 60-file sweep.

**Benchmark.** n/a — internal consistency finding.

**Evidence.** Read Spinner.tsx in full including its drift-resolution comment. Ran `grep -rn "Spinner" apps/web --include="*.tsx"` (excluding node_modules/.next/test) and found no direct JSX usage of the primitive. Ran `grep -rl "Loader2\|animate-spin" apps/web/features apps/web/app --include="*.tsx" | grep -v test | wc -l` → 60. Read apps/web/shared/ui/loading-spinner.tsx and confirmed it independently reimplements the same visual treatment with correct a11y attributes.

**Files.**

- `packages/ui/ui/src/primitives/Spinner.tsx:1-42`
- `apps/web/shared/ui/loading-spinner.tsx:1-32`

**Recommendation.** Low-priority cleanup: point apps/web/shared/ui/loading-spinner.tsx's remaining call site at the shared Spinner primitive and delete the duplicate; leave the 60 inline Loader2 usages as-is unless a future pass specifically wants a single loading-indicator sweep — most already appear inside buttons/components that have their own loading semantics.

### Skills, plugins & connectors

_8 gaps · source: `gaps/domain-extensibility.json` · narrative: `gaps/domain-extensibility.md`_

#### EXTENSIBILITY-001

**Skills catalog navigation** — P1 · Mobile · `broken-workflow` · prior art `GAP-001`

_Screen/component:_ Drawer / Skills

**Current state.** SkillsScreen.tsx (655 lines) is a complete, tested, Cloud-mode-gated Skills catalog with search, source badges, and empty/error states, registered at the /(app)/skills route. Nothing navigates to it: DrawerContent.tsx's PRIMARY_ITEMS array (chats, projects, library, schedules, remote) has no skills entry, and \_layout.tsx explicitly hides the drawer item (`options={HIDDEN}`). Settings' Cloud section has a comment claiming Skills 'has a supported top-level Cloud catalog in the drawer and is intentionally not duplicated as a settings control' (settings/index.tsx:636-638), but that drawer entry was removed by a later commit (1e858a7f1, an ancestor of HEAD) which also changed the drawer test to assert the row's absence. `/(app)/skills` now appears in only two places repo-wide outside its own route file: an unused RoutePath union member and the route wrapper's own header comment.

**Expected state.** A complete, tested screen should be reachable from at least one place in the app (drawer or Settings), matching ChatGPT iOS's first-class Skills tab with search and a teaching empty state.

**Benchmark.** ChatGPT iOS — Skills tab (shots-chatgpt-ios-shell-settings.md:47,115-117, 'You don't have any skills yet' / 'Search Skills')

**Evidence.** Read DrawerContent.tsx (PRIMARY_ITEMS array, RoutePath union), app/(app)/\_layout.tsx (HIDDEN drawer-item style on skills/index), and settings/index.tsx (stale comment). Cross-checked against audit/parity-2026-08-15/gaps/done-claim-verification.md:83-102, which independently reached the same conclusion via git history (commit 1e858a7f1) and a repo-wide grep for the route path.

**Files.**

- `apps/mobile/src/features/drawer/components/DrawerContent.tsx:43,62-100`
- `apps/mobile/app/(app)/_layout.tsx:73`
- `apps/mobile/src/features/settings/index.tsx:636-638`
- `apps/mobile/src/features/skills/SkillsScreen.tsx`
- `apps/mobile/app/(app)/skills/index.tsx`

**Recommendation.** Add a Skills row back to either PRIMARY_ITEMS (drawer) or the Settings Cloud section (settings/index.tsx, next to Connectors) and remove the now-false comment. Update drawer-content.test.tsx's assertion of absence to assert presence instead.

#### EXTENSIBILITY-002

**Connectors/MCP settings information architecture** — P1 · Desktop (Tauri) · `architecture-gap` · prior art `GAP-083`

_Screen/component:_ Settings > Connections, Settings > Connectors

**Current state.** Desktop settings ships two adjacent, near-homograph tabs. 'Connections' (Connections/index.tsx) renders only MobileCompanionPanel — phone-pairing/remote-control, nothing MCP-related. 'Connectors' (Connectors/index.tsx) stacks five conceptually distinct subsystems in one vertical scroll behind lazy Suspense boundaries: ConnectorGallery (browse/install), ConnectorHealthDashboard (live per-server status), MCPServerSettings (config for the MCP server AGI itself exposes — port + bearer token), MCPWorkspace (client-side: the MCP servers this app connects TO, their tools/credentials/config editor), and CloudStoragePanel (Google Drive/Dropbox/OneDrive file browser, an entirely separate OAuth2 system). In-code comments on the Connectors tab itself document that three of these five components (MCPServerSettings, MCPWorkspace, CloudStoragePanel) were previously unreachable from any nav before being mounted here.

**Expected state.** Either merge 'Connections' and 'Connectors' under one unambiguous label, or rename one of them, and split the five-subsystem 'Connectors' tab into separately-scoped destinations the way the benchmark does.

**Benchmark.** Claude Desktop — Skills / Connectors / Plugins as three separate, cleanly-scoped settings destinations (shots-claude-desktop.md:306-308,545-547); Codex macOS — a single counted Plugins/Apps/MCPs/Skills tab strip with search, at least giving the user one navigable list instead of five stacked panels (shots-codex-macos-settings.md:407-426)

**Evidence.** Read both tab files directly. Connections/index.tsx:1-38 confirmed to render only <MobileCompanionPanel />. Connectors/index.tsx:1-79 confirmed to lazy-mount all five components in sequence with in-code comments documenting their prior unreachable-from-nav state. Cross-checked against audit/parity-2026-08-15/gaps/done-claim-verification.md:65-77, which independently found GAP-083's claim (that MCPWorkspace is mounted from Connections) false — it is mounted from Connectors — and flagged the naming collision as a secondary finding.

**Files.**

- `apps/desktop/src/features/settings/tabs/Connections/index.tsx:1-38`
- `apps/desktop/src/features/settings/tabs/Connectors/index.tsx:1-79`

**Recommendation.** Rename 'Connections' to something unambiguous (e.g. 'Mobile pairing' or 'Remote control') so it no longer reads as a synonym for 'Connectors', and split the Connectors tab's five components into a segmented sub-view (Gallery / Health / MCP servers / Cloud storage) instead of one continuous scroll — this also closes the related, already-open GAP-248 (no unified tab strip with counts).

#### EXTENSIBILITY-003

**MCP server slopsquatting allow-list** — P1 · Desktop (Tauri) · `security-gap`

_Screen/component:_ n/a (backend security control)

**Current state.** install_bundle() in config.rs loads mcp-allowlist.json via `std::path::PathBuf::from("mcp-allowlist.json")` — a path relative to the process's current working directory, not the app's resource or config directory. The file's own comment documents the fallback: 'Absence of the file = open mode (dev)'. tauri.conf.json's `bundle` block (lines 50-86) has no `resources` entry referencing mcp-allowlist.json, so the file is never packaged into any release build. In every shipped installer, the CWD-relative lookup fails, the allow-list silently resolves to None, and install_bundle() skips the entire allow-list check — any npm package (including a typosquatted/slopsquatted one) can be installed as an MCP server via bundle install.

**Expected state.** A named supply-chain defense control (its own comment calls it 'AUDIT-FIX: CI-5 — slopsquatting defense') should actually run in the builds it ships in. The allow-list should load from a path that resolves correctly in a packaged app (Tauri resource dir via tauri::api::path, or bundled as a declared resource) and fail closed (reject, not silently open) when the file cannot be found in a release build.

**Benchmark.** n/a — this is a security control unique to this codebase, not a benchmarked UX surface; judged against the control's own stated intent

**Evidence.** Read config.rs:1642-1668 directly: confirmed CWD-relative PathBuf construction and open-mode fallback. Grepped tauri.conf.json for 'resources'/'bundle' and confirmed no resources array exists anywhere in the bundle config. Confirmed mcp-allowlist.json exists only at apps/desktop/src-tauri/mcp-allowlist.json with no other repo references to its filename outside config.rs's two lines.

**Files.**

- `apps/desktop/src-tauri/src/core/mcp/config.rs:1642-1668`
- `apps/desktop/src-tauri/mcp-allowlist.json`
- `apps/desktop/src-tauri/tauri.conf.json:50-86`

**Recommendation.** Bundle mcp-allowlist.json as a Tauri resource (add it to tauui.conf.json's bundle.resources), resolve its path at runtime via the app's resource-dir API instead of a bare relative PathBuf, and change the missing-file fallback to fail closed in release builds (only open-mode in debug_assertions).

#### EXTENSIBILITY-004

**Automatic (progressive-disclosure) skill invocation** — P1 · Cross-surface · `missing-capability`

_Screen/component:_ Chat composer / tool loop

**Current state.** Skills can only be invoked explicitly across every surface checked. Desktop has a real token-matching heuristic, skill_match_for_message (Rust, skills.rs:342-414), exposed to the frontend as matchForMessage in skillMarketplaceStore.ts:247,348-354 — but grepping the entire desktop frontend for callers of matchForMessage finds only its own interface declaration and implementation; no chat component ever calls it. Web's tool loop requires an explicit client-supplied skill_name field (request-processor.ts) and returns a validation error (skill_not_found/skill_catalog_unavailable/skill_model_unsupported) if it is absent or invalid — there is no server-side relevance matching against the user's message at all. The result: a skill is only ever loaded because a user manually picked it (slash command on desktop, explicit selection on web), never because the assistant recognized the message needed it.

**Expected state.** The model (or a lightweight pre-turn classifier) should be able to surface or load a relevant skill based on message content without the user having to know the skill exists and name it, matching Claude's defining 'progressive disclosure' behavior for skills.

**Benchmark.** Claude web/desktop — 'Automatic — Claude decides relevance and loads the skill (progressive disclosure); users can force it' (claude-web-desktop.md:33,111)

**Evidence.** Grepped apps/desktop/src for 'matchForMessage\b' (2 hits: interface + implementation, zero call sites in features/chat or features/v3). Read skills.rs:342-414 to confirm skill_match_for_message is a real tokenizing matcher, not a stub. Read request-processor.ts:316-329,461-473,2272-2322 to confirm web's skill path is 100% explicit-selection with no server-side relevance scoring.

**Files.**

- `apps/desktop/src-tauri/src/sys/commands/skills.rs:342-414`
- `apps/desktop/src/stores/skillMarketplaceStore.ts:247,348-354`
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:316-329,461-473,2272-2322`

**Recommendation.** Wire the existing matchForMessage call into the desktop chat composer (e.g. surface top matches as dismissible chips before send, mirroring how the benchmark surfaces suggested skills) as the smallest end-to-end slice; extend the same relevance signal to web's request-processor as a follow-up so the two surfaces don't diverge.

#### EXTENSIBILITY-005

**Cloud skill install path** — P2 · Desktop (Tauri) · `broken-workflow`

_Screen/component:_ Settings (Cloud) > Skills

**Current state.** DesktopCloudSettingsModal.tsx's Skills section fetches the same Managed Cloud skill catalog Web uses (listCloudSkills()) and, for each downloadable entry, builds a downloadHref pointing at ${WEB_APP_URL}/api/skills/${name}/download. SettingsModal.tsx renders that downloadHref as a plain `<a href download>` (or adapter.openHref) — a raw file save, nothing more. There is no code path anywhere in apps/desktop that takes a downloaded skill file and writes it into ~/.agiworkforce/skills/ (the 'Managed' directory the local SkillManager actually scans, per core/skills/skill.rs:14-15) or otherwise registers it with skill_reload(). A user who clicks 'download' on a Cloud skill gets a file in their Downloads folder and no way to make it appear in the local SkillMarketplace or be invoked in chat, short of manually finding the right directory and file format themselves.

**Expected state.** Clicking 'download'/'add' on a directory skill should make the skill usable — either a genuine one-click install into the local skill directory, or, if that is out of scope, copy naming clearly ('Save file' rather than implying a working install) plus documented next steps for what to do with the file.

**Benchmark.** Claude web — directory skill install is a one-click '+' that adds the skill (view-only, but immediately usable); only _customizing_ a shared skill requires download-and-reupload (shots-claude-web.md:769-770, 'Installs/adds that plugin, connector, or skill'; :353, 'must know to download-and-reupload rather than edit in place')

**Evidence.** Read DesktopCloudSettingsModal.tsx:907-950 to confirm downloadHref construction and the absence of any import/reload call adjacent to it. Grepped apps/desktop/src and packages/ui for 'downloadHref' (4 hits total: the modal that builds it, the shared type definition, the SettingsModal renderer, and a test) — all render-a-link, none write-to-disk. Read core/skills/skill.rs:5-15 to confirm the local Managed skill directory (~/.agiworkforce/skills/) that skill_reload() actually scans is a distinct filesystem location the download flow never touches.

**Files.**

- `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:907-950`
- `packages/ui/ui/src/settings-modal/types.ts:72`
- `packages/ui/ui/src/settings-modal/SettingsModal.tsx:422-438`

**Recommendation.** Add a native command (skill_import_from_download or similar) that accepts the downloaded bytes/path, validates the SKILL.md shape, writes it into the Managed skills directory, and calls skill_reload() — wire it behind the existing downloadHref button as a Tauri-side save-and-import instead of a browser-style file download.

#### EXTENSIBILITY-006

**Connector catalog default connectivity** — P2 · Web · `backend-gap`

_Screen/component:_ /connectors

**Current state.** The connector catalog lists 89 ids (confirmed via grep -c "id: '" on connectors.ts). Connecting any of them server-side requires either (a) being the GitHub App flow, (b) being a user-defined custom remote MCP connector, or (c) the operator having set CONNECTOR*OAUTH*<ID>\_CLIENT_ID/\_SECRET env vars or populated CONNECTOR_OAUTH_PROVIDERS_JSON for that specific id (oauth-registry.ts:144-166) — with no descriptor for any well-known provider shipped by default, the registry starts empty. Absent that operator configuration, POST /api/connectors 501s with 'Connector authorization is not implemented for this provider' for every id that isn't GitHub or a custom MCP entry (route.ts:416-429). The route's own comment documents that a maintained allowlist for the other 55+ non-GitHub ids doesn't exist (route.ts:114-120). This architecture is honest (the UI shows real 'Coming soon'/'Not yet available on web' labels, not fake Connect buttons) but the net effect is that the large majority of an 89-entry catalog cannot be connected in a stock deployment.

**Expected state.** A connector directory of this breadth should ship with working OAuth app registrations for at least the handful of highest-value providers (Slack, Notion, Google Drive, Linear) pre-configured, the way Claude's and ChatGPT's directories work for major providers without any deployment-specific setup.

**Benchmark.** Claude web — Connectors directory works for major providers out of the box (claude-web-desktop.md:131-145); ChatGPT — 'Built-in connectors/apps: Google Drive, Gmail, Google Calendar, Outlook, SharePoint, Dropbox, Box, Microsoft Teams, Slack...' (chatgpt-web-desktop.md:163)

**Evidence.** Read route.ts:1-19 (module docstring on the honest-gating design), :114-120 (comment on the missing 55-id allowlist), :384-429 (the 501 branch). Read oauth-registry.ts:144-166 to confirm credentials are entirely env-driven with no shipped descriptors for common providers. Ran grep -c "id: '" apps/web/features/connectors/data/connectors.ts -> 89. This is the Web-surface counterpart to the already-tracked mobile finding (known-flaws.md MOBILE-CONNECTORS-501, mobile.md:276,284-291) but for Web specifically, which has no equivalent tracked row (GAP-257/GAP-269 cover only visual polish, not the underlying non-functional-by-default state).

**Files.**

- `apps/web/app/api/connectors/route.ts:1-19,114-120,384-429`
- `apps/web/lib/connectors/oauth-registry.ts:144-166,225-231`
- `apps/web/features/connectors/data/connectors.ts`

**Recommendation.** Register first-party OAuth apps for the 4-6 highest-usage providers (Slack, Notion, Google Drive, Linear) and ship their client ids as part of the default deployment config (or CONNECTOR_OAUTH_PROVIDERS_JSON default), so a stock install has at least a handful of connectors that actually work without operator setup.

#### EXTENSIBILITY-007

**Skills/Plugins/Connectors surface** — P2 · Chrome extension · `missing-capability` · prior art `GAP-122`

_Screen/component:_ Extension options page, side panel composer

**Current state.** apps/extension/src/options.ts contains zero occurrences of 'connector', 'plugin', or 'skill' (grep -n -i confirmed no matches) — there is no management surface for any of the three products anywhere in the Chrome extension. The side panel's attach ('+') menu offers only 2 items (Take a screenshot, file upload) where the shared desktop AttachmentMenu component offers 7, including Select folder, Record skill, Research, explicit Web search, Run code, and Writing style (side_panel.ts:9412-9477, cross-checked against extension-chrome.md:408). There is no SkillMentionPicker component and no '@skill' or 'SkillMention' string anywhere in the extension's source (extension-chrome.md:402).

**Expected state.** At minimum, Skills — which are a fully real, working feature on web/desktop/CLI — should be invocable from the Chrome side panel composer (slash command or @mention), and Connectors should be visible/manageable in the options page, matching the benchmark's contemporaneous move to bring exactly this into the browser.

**Benchmark.** Claude — Cowork reached the Chrome extension side panel in August 2026 with 'skills/plugins/connectors now work in-browser for the first time' (claude-web-desktop.md:205,329)

**Evidence.** Ran grep -n -i "connector|plugin|skill" against apps/extension/src/options.ts directly (zero matches). Cross-checked the attach-menu item-count and SkillMentionPicker absence against audit/parity-2026-08-15/inventory/extension-chrome.md:402,408,414,468, which independently found the same composer-drift gap.

**Files.**

- `apps/extension/src/options.ts`
- `apps/extension/src/side_panel.ts:9412-9477`

**Recommendation.** Add a Skill @mention/slash affordance to the side panel composer, reusing the same skill catalog service the shared chat components already consume — this doesn't require the plugin-registry work GAP-122 correctly defers, since Skills (unlike Plugins) already have a real, installable, working catalog today.

#### EXTENSIBILITY-008

**Organization skill/plugin governance** — P2 · Backend · `architecture-gap` · prior art `CAP-009`

_Screen/component:_ n/a (no UI exists to audit; capability-level finding)

**Current state.** No enforced, single-source org/tenant policy exists for either skills or plugins. Per capability-gaps.csv (a sibling prior-art ledger, distinct from ui-gaps.csv): CAP-009 'Organization plugin governance' is Open, describing 'duplicate policy labels' that need unifying around one persisted and enforced contract; CAP-010 'Organization skill policies' is Deferred, requiring tenant policy ownership and request-path enforcement that doesn't exist yet. Direct verification: neither apps/web/lib/services/plugin-installation-service.ts nor plugin-registry-service.ts contains any org/tenant/team-scoped filtering logic (grep for 'org|organization|admin|tenant|team' returns only an unrelated future-admin-path comment).

**Expected state.** An org owner should be able to push a skill or plugin org-wide with a default enabled/disabled state, and enforce which plugins/connectors members can install — a single persisted, request-path-enforced policy, not duplicated labels in disconnected places.

**Benchmark.** Claude — org owners upload a skill zip at Organization settings > Skills, instantly provisioned org-wide with three independent sharing toggles (peer-to-peer, org-wide publish, group-based); allowedPluginMarketplaces restricts which marketplaces are usable org-wide (claude-web-desktop.md:115,142)

**Evidence.** Read audit/capability-gaps.csv rows CAP-009 and CAP-010 directly. Grepped apps/web/lib/services/plugin-installation-service.ts and plugin-registry-service.ts for org/tenant/team scoping — only one unrelated comment matched ('a future admin path'), confirming no enforcement exists today.

**Files.**

- `audit/capability-gaps.csv:9-10`

**Recommendation.** Not a new build recommendation beyond what CAP-009/CAP-010 already specify — flagged here so this domain's report doesn't silently omit org governance. Prioritize CAP-009 (unify the duplicate plugin policy labels into one enforced contract) before CAP-010, since plugins already have a real registry to attach a policy to.

### Memory & personalization

_10 gaps · source: `gaps/domain-memory.json` · narrative: `gaps/domain-memory.md`_

#### MEMORY-001

**Project memory tab shows/writes the wrong (global) memory store** — P1 · Desktop (Tauri) · `broken-workflow` · prior art `CAP-027`

_Screen/component:_ Project Settings dialog — Memory tab

**Current state.** Opening a Project's Settings > Memory tab mounts `<MemoryManager showCreateButton={true} showImportExport={false} />` next to copy that reads 'Memories help AGI remember important details about your project ... stored as memories for continuity.' `MemoryManager` reads and writes `useMemoryStore().memories` — the single flat, GLOBAL, device-wide memory list (`loadAll`, no `projectFolder`/`projectId` filter anywhere in its props or implementation). Meanwhile a fully separate, genuinely project-scoped memory pipeline already exists and is what the chat runtime actually uses at send time: `apps/desktop/src-tauri/src/sys/commands/chat/memory_handler.rs`'s `ChatMemoryHandler` (constructed `with_project_config` in `send_message_setup.rs:252`) calls `ProjectMemoryManager`-backed `load_project_memories`/`detect_and_save_decision`, which reads/writes a dedicated SQLite table keyed by project folder. The TypeScript side of that same pipeline (`projectMemoryStore.ts`'s `getProjectMemories(projectFolder)`, `searchProjectMemories`, `saveProjectContext`, backed by real `#[tauri::command]` handlers in `sys/commands/project_memory.rs`) has zero callers anywhere in the UI.

**Expected state.** The Memory tab inside a Project's settings shows exactly the memories that are actually injected into that project's conversations (via `getProjectMemories(projectFolder)`), and 'Create memory' from that tab writes to the project-scoped store, not the global one. A user should never be able to see, edit, or delete an unrelated project's or general chat's memories from inside a project dialog, nor have a note they add there silently leak into every other project and every non-project chat.

**Benchmark.** Claude — Cowork Projects: 'memory on by default and does not transfer cross-project' (research/claude-web-desktop.md:94,157,228); ChatGPT — project-only memory toggle scopes learnings to one Project (research/chatgpt-web-desktop.md:152).

**Evidence.** Read ProjectSettingsDialog.tsx:1268-1291 (Memory tab mounts MemoryManager with the 'helps AGI remember ... your project' info box). Read MemoryManager.tsx:94-131 confirming its props have no project filter and it sources `s.memories` (global `useMemoryStore`, `loadAll`). Grepped `getProjectMemories|searchProjectMemories|saveProjectContext` across apps/desktop/src/\*_/_.tsx,ts — matches only inside the store/API definition files themselves, zero UI call sites. Confirmed the Rust side is real and live-wired by reading memory_handler.rs (load_project_memories, detect_and_save_decision keyed by project_path) and send_message_setup.rs:252-261 (ChatMemoryHandler::with_project_config + inject_memory_context called on every send). Confirmed the Tauri commands genuinely exist: `sys/commands/project_memory.rs` has `#[tauri::command] pub async fn get_project_memories` (line 200) and `search_project_memories` (line 213).

**Files.**

- `apps/desktop/src/features/chat/ProjectSettingsDialog.tsx:1268-1291`
- `apps/desktop/src/features/memory/MemoryManager.tsx:105-131`
- `apps/desktop/src/stores/projectMemoryStore.ts:73-75,113-131`
- `apps/desktop/src/api/projectMemory.ts:103,230,245`
- `apps/desktop/src-tauri/src/sys/commands/chat/memory_handler.rs:80-136`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs:252-261`

**Recommendation.** Pass the active project's folder into `MemoryManager` (new `projectFolder` prop), swap its data source from the global `useMemoryStore` to `projectMemoryStore`'s `getProjectMemories(projectFolder)`/`searchProjectMemories`, and route 'Create memory' through `saveProjectContext`/the equivalent decision-save path so the visible list matches what `memory_handler.rs` actually injects at send time.

#### MEMORY-002

**Search and reference past chats** — P1 · Web · `missing-capability`

_Screen/component:_ Chat send pipeline (no dedicated screen — a Capabilities toggle exists but nothing consumes it for retrieval)

**Current state.** Web's Memory system only ever injects the user's curated `MemoryFact` list (manually added, or server-side auto-extracted 'facts') as a leading system message — `buildMemorySystemContent`/`enrichManagedMemoryContext`. Neither the client runtime (`WebChatRuntime.ts`) nor the live production path (`useChatStream.ts` → `/api/llm/v1/chat/completions` → `request-processor.ts`) ever searches or retrieves excerpts from the user's OTHER past conversations at send time. `/api/memory/search` (ILIKE over `user_memories.content`) and `/api/search` (full-text over sessions/messages) both exist as callable routes but have zero callers from the chat send path — only from the sidebar search palette. Mobile already has the feature end-to-end: `pastChatContext.ts`'s `retrievePastChatContext()` scores past messages by query-term overlap, fences the result as untrusted data, and is wired into `chatExecutionStore.ts:1270-1288`, gated by the same `referencePastChats` preference and excluded for temporary chats.

**Expected state.** When 'Search and reference chats' (or equivalent) is enabled, a Web chat turn should retrieve and inject relevant excerpts from the user's other conversations, not just the separately-curated memory-facts list, matching the mobile implementation's behavior and the competitive bar.

**Benchmark.** Claude — 'Search and reference chats' toggle performs RAG-style search over prior conversations, surfaced as a visible tool call in the transcript (research/claude-web-desktop.md:158; shots-claude-desktop.md:371,414). ChatGPT — 'reference chat history' implicit pattern recall (research/chatgpt-web-desktop.md:149).

**Evidence.** Read WebChatRuntime.ts:181-189 (only `buildMemorySystemContent`/`withMemorySystemMessage`, no past-chat search call). Grepped `pastChat|past_chat|searchMemor|reference.*chat|search.*history` across request-processor.ts — zero matches, confirming the production server path has no equivalent either. Grepped `api/memory/search` and `api/search` usage across apps/web — only the global-search-service.ts sidebar palette calls `/api/search`; nothing calls `/api/memory/search` outside its own route/test file. Read apps/mobile's pastChatContext.ts and its call site in chatExecutionStore.ts:1253-1296 confirming a working reference implementation exists on another surface.

**Files.**

- `apps/web/lib/runtime/WebChatRuntime.ts:181-189`
- `apps/web/lib/hooks/useChatStream.ts`
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`
- `apps/web/app/api/memory/search/route.ts:1-66`
- `apps/mobile/src/features/memory/services/pastChatContext.ts`
- `apps/mobile/stores/chat/chatExecutionStore.ts:1253-1296`

**Recommendation.** Port `pastChatContext.ts`'s retrieval/fencing/scoring logic (or a server-side equivalent built on `/api/search`) into Web's send path, gated by the existing `capabilities.memory`/`generateFromHistory` preference namespace and excluded for temporary/incognito chats, mirroring the ordering (persona, saved memory, then past-chat excerpts) mobile already uses.

#### MEMORY-003

**Import memory from other AI providers** — P2 · Cross-surface · `parity-gap`

_Screen/component:_ Settings > Memory — Import

**Current state.** Mobile ships a genuinely working, on-device memory import: `memoryImport.ts` parses ChatGPT (`conversations.json`), Claude, and Gemini/Takeout JSON exports (plus plain text/notes) with format auto-detection, per-source extraction heuristics, a preview of the first 3 facts with a total count before committing, and dedup via the existing `bulkInsert`. It is reachable from an Upload icon in the Memory screen header. Web explicitly ships none of this: `CapabilitiesSection.tsx:169-174` has a code comment stating the 'Import memory from other AI providers' row was deliberately removed because 'the web import flow is a placeholder (no working provider import endpoint)' — an honest avoidance of a dead control, but the capability itself does not exist on Web or Desktop. Desktop's prior-art row GAP-077 separately declined cross-provider import citing 'no ingestion or authorization contract' — a premise Mobile's own file-only, no-server-contract implementation disproves.

**Expected state.** The same on-device, no-server-round-trip import capability Mobile already has should be reachable from Web and Desktop Settings > Memory, closing the parity gap and giving every surface the switching-cost-reduction competitors advertise.

**Benchmark.** Claude Desktop — 'Import memory from other AI providers' → [Start import], described as providing a copy-paste prompt to fetch memory from the other account (shots-claude-desktop.md:374,578) — notably a manual flow, weaker than Mobile's automated parser.

**Evidence.** Read memory-import.tsx and memoryImport.ts in full, confirming real parsers for chatgpt/claude/gemini/text with truncation caps (MAX_FACT_CHARS, MAX_FACTS) and an 'On-device only' privacy notice. Confirmed reachability via memory.tsx:202-204 (handleImportPress) and the header Upload button at :295-305. Grepped `parseChatGPTExport|parseClaudeExport|memoryImport|memory-import|Import memory from other` across apps/web and apps/desktop — the only hit is the CapabilitiesSection.tsx comment explaining its deliberate absence.

**Files.**

- `apps/mobile/app/(app)/settings/memory-import.tsx`
- `apps/mobile/src/features/memory/services/memoryImport.ts:1-300`
- `apps/mobile/app/(app)/settings/memory.tsx:202-204,295-305`
- `apps/web/features/settings/sections/CapabilitiesSection.tsx:169-174`

**Recommendation.** Port memoryImport.ts's parsers (they have no server dependency) to a shared package, add a file-picker-based Import flow to Web's MemorySection and Desktop's Memory settings tab, writing into each surface's local/account memory store the same way Mobile's bulkInsert does.

#### MEMORY-004

**Project-scoped memory** — P2 · Web · `architecture-gap` · prior art `CAP-027`

_Screen/component:_ Project Settings dialog — Memory section

**Current state.** `user_memories` has no project column at all (0010_memory.sql), and `loadManagedMemoryContext` selects purely by `user_id` with no project dimension. The team already found and removed a decorative, non-functional memory-scope `<select>` from the Web Project Settings dialog — the current code has an explicit comment explaining it was 'one option ("Default"), no onChange, no state, and no persistence' and was replaced with honest static copy: 'This project can access memories from outside chats, and vice versa.' That is correct, non-misleading engineering, but it leaves the underlying capability fully absent: a Web user cannot opt a project into project-only memory or exclude global memory from a project's context, at all.

**Expected state.** A Web user can scope a Project to its own memory (project-only, isolated from account-wide memory) the way ChatGPT and Claude project memory both support, with the setting actually persisted and enforced in `managed-memory-context-service.ts`.

**Benchmark.** ChatGPT — 2026 update lets users opt individual Projects into project-only memory, and disables personal Memory entirely inside shared Projects (research/chatgpt-web-desktop.md:152). Claude — project memory 'scoped separately per project' (research/claude-web-desktop.md:156-157).

**Evidence.** Read 0010_memory.sql confirming no project_id/project_folder column. Read managed-memory-context-service.ts:137-158 (`loadManagedMemoryContext` query is `where user_id = $1`, no project predicate anywhere in the file). Read ProjectSettingsDialog.tsx:229-251, whose own comment documents the prior dead-dropdown finding and the current honest-but-absent state.

**Files.**

- `apps/web/db/neon/0010_memory.sql:1-10`
- `apps/web/features/projects/components/ProjectSettingsDialog.tsx:229-251`
- `apps/web/lib/services/managed-memory-context-service.ts:137-158`

**Recommendation.** Add a nullable `project_id` column to `user_memories`, a per-project `memoryScope: 'default' | 'project-only'` preference, and thread it through `loadManagedMemoryContext`/`persistManagedAutoMemoryFacts` so project-only memories never leak into the general account context and vice versa when the project opts in — matching the scope this domain audit's shared prior-art item (CAP-027) already calls for.

#### MEMORY-005

**Memory search uses substring matching, not semantic similarity** — P2 · Backend · `performance-gap`

_Screen/component:_ n/a (backend retrieval)

**Current state.** `GET /api/memory/search` is a plain Postgres `ILIKE` substring search over `user_memories.content`, with its own docstring stating 'Simple ILIKE text search - can be upgraded to vector similarity later.' A real, fully-implemented OpenAI-compatible embeddings endpoint exists (`/api/llm/v1/embeddings`) but has no internal caller anywhere in the product — no `vector` column exists in any migration, so there is no semantic-similarity retrieval path for memory (or for chat history) at all today.

**Expected state.** Memory (and past-chat) retrieval should rank by semantic relevance, not literal substring overlap, so a query like 'what did I say about my tech stack' can surface a memory that says 'prefers Rust' without the word 'stack' appearing verbatim.

**Benchmark.** Claude — 'Search and reference chats' performs RAG-style search (research/claude-web-desktop.md:158). ChatGPT — Dreaming V3 memory system reports 82.8% factual recall on its own benchmark, implying semantic (not literal) matching (research/cross-cutting-and-complaints.md:51).

**Evidence.** Read /api/memory/search/route.ts:37-47 — literal `content ilike $2` with wildcard-escaping, no ranking beyond `order by updated_at desc`. Confirmed via the web-backend inventory doc (§13) and independently by grepping every apps/web/db/neon/\*.sql migration for `vector` — no hits. Confirmed the embeddings route is real (306 lines, reserve/call/settle billing pattern) but has no internal caller per the inventory's own grep.

**Files.**

- `apps/web/app/api/memory/search/route.ts:37-47`
- `apps/web/app/api/llm/v1/embeddings/route.ts`
- `apps/web/db/neon/0010_memory.sql`

**Recommendation.** Add a pgvector column to `user_memories` (and optionally `messages`), backfill embeddings via the existing `/api/llm/v1/embeddings` endpoint on write, and switch `/api/memory/search` to a cosine-similarity ORDER BY with the ILIKE path kept only as a fallback when embeddings are unavailable.

#### MEMORY-006

**Memory settings surface lacks search, pin, and summary controls Mobile already has** — P2 · Web · `frontend-gap`

_Screen/component:_ Settings > Memory

**Current state.** Web's `MemoryEditor` is a flat add/edit/delete list with a 'Forget everything' destructive action — no search box, no pin/unpin, no category grouping, and no 'Memory summary' recap screen. This is a real capability gap, not just cosmetic: the `pinned` column exists in Postgres (migration 0047) and is read by `managed-memory-context-service.ts` to prioritize prompt inclusion, but the general CRUD routes `/api/memory` (GET/POST) and `/api/memory/[id]` (GET/PUT/DELETE) never select, return, or accept `pinned` at all — so even a future Web pin UI would need new API surface, not just new UI. Mobile's Memory screen already has all of this: a search bar, an 'All'/'Pinned' filter, per-item pin toggles (correctly routed around a documented cloud-vs-local pin bug — `togglePin` in store.ts explicitly avoids the SQLite-only path for cloud entries), and a dedicated read-only 'Memory summary' screen with an honest provenance line.

**Expected state.** Web's Memory settings should let a user search their saved memories, pin important ones, and see an at-a-glance summary the way ChatGPT's 'Memory summary → Manage' and Mobile's own implementation already do.

**Benchmark.** ChatGPT — 'Memory summary' with a Manage button showing 'an overview of what ChatGPT has learned about you' (shots-chatgpt-web-macos.md:207). Claude — memory redesigned into individually categorized, browsable entries (research/claude-web-desktop.md:151-153).

**Evidence.** Read MemoryEditor.tsx in full — confirmed no search state, no pin affordance, no category field rendered. Read /api/memory/route.ts:36 and 49-56 and /api/memory/[id]/route.ts:22-103 — every select list and every returned/accepted object omits `pinned` entirely, despite migration 0047_user_memories_pinned.sql adding the column and managed-memory-context-service.ts:149 reading it. Read apps/mobile/app/(app)/settings/memory.tsx (search input, FILTER_CATEGORIES, memoryFreshness) and memory-summary.tsx for the reference implementation.

**Files.**

- `packages/ui/unified-chat/src/components/MemoryEditor.tsx:1-350`
- `apps/web/app/api/memory/route.ts:36,49-56`
- `apps/web/app/api/memory/[id]/route.ts:22-103`
- `apps/mobile/app/(app)/settings/memory.tsx:337-476`
- `apps/mobile/app/(app)/settings/memory-summary.tsx`

**Recommendation.** Add `pinned` to the `/api/memory` GET/PUT contracts, add a pin toggle + search input + a read-only summary route to Web's MemorySection, reusing the same `MemoryEditor` component with new optional props rather than diverging further from Mobile's UX.

#### MEMORY-008

**Memory suppression is content-term only, not source-scoped** — P2 · Web · `missing-capability` · prior art `CAP-006`

_Screen/component:_ Settings > Memory — Never remember

**Current state.** The shipped 'Never remember' feature (`MemoryExclusions.tsx`) genuinely works and is well-designed — server-enforced (filtering happens in `persistManagedAutoMemoryFacts` before any candidate reaches the table, not just hidden client-side), case-insensitive substring matching, capped at 50 terms. But it only suppresses by literal content term ('my home address'). There is no way to suppress an entire irrelevant _source_ — e.g. stop learning from a specific connector, a specific project's chats, or tool-assisted turns beyond the existing all-or-nothing `allowToolAssistedGeneration` toggle.

**Expected state.** A user should be able to say 'never learn memories from my #finance connector' or 'never learn from this project' in addition to term-based exclusion, matching the intent of the tracked capability gap.

**Benchmark.** n/a direct competitor citation for this exact control — tracked internally as an open capability gap.

**Evidence.** Read MemoryExclusions.tsx in full (term-based only, no source/connector/project dimension). Read managed-memory-context-service.ts:75-135 (`normalizeMemoryExclusions`/`isMemoryExcluded` operate purely on `content` strings, no source parameter). Cross-referenced audit/capability-gaps.csv:7 (CAP-006, class 'IrrelevantSource', status 'absent').

**Files.**

- `apps/web/features/settings/components/MemoryExclusions.tsx:1-249`
- `apps/web/lib/services/managed-memory-context-service.ts:75-135`

**Recommendation.** Extend the exclusions model with a `sources: string[]` list (connector ids / project ids) alongside the existing `excludedTerms`, and check it in `persistManagedAutoMemoryFacts` against the turn's originating connector/project before content-term filtering runs.

#### MEMORY-007

**Memory facts never cite the chat they came from** — P3 · Cross-surface · `missing-capability`

_Screen/component:_ Settings > Memory (list item)

**Current state.** The data model already carries per-fact provenance in one place: the shared `MemoryFact.sourceConversationId` (web/unified-chat) and Mobile's SQLite `memory_facts.source_conversation_id`, which Mobile's Local auto-consolidation (`consolidation.ts:225`) genuinely populates when it learns a fact mid-conversation, with a tested cleanup path that nulls the reference (not a cascade delete) when the source chat is deleted. Despite that, no surface ever renders it: `MemoryEditor.tsx`'s list item (used by Web and Desktop) has no 'from this chat' link, and Mobile's `MemoryItem.tsx` never reads `source_conversation_id` either. Cloud memory is worse than un-rendered — it is structurally absent: `CloudMemoryEntry` (cloudMemoryStore.ts:22-42) has no conversation-reference field at all, so any fact synced through the account (the majority of real usage) loses its origin permanently. Web's own manual `add()` call site in MemoryEditor.tsx never passes a `sourceConversationId` argument even though the store API accepts one.

**Expected state.** A saved memory should let the user jump back to the conversation it was learned from, the way a citation works, at least for facts that genuinely originated in a specific chat (manually-added facts and imports correctly have no such origin).

**Benchmark.** Domain brief's 'previous-chat citations' requirement; Claude's chat-search retrieval surfaces as a visible, attributable tool call rather than an anonymous fact (research/claude-web-desktop.md:158).

**Evidence.** Read memoryStore.ts:31-48 (field definition) and :215-226 (add() implementation storing it). Read MemoryEditor.tsx's list rendering (lines 250-278) — no reference to sourceConversationId anywhere in the component. Read MemoryItem.tsx in full — no source_conversation_id usage. Read consolidation.ts:203-226 confirming Local auto-consolidation does set it. Read cloudMemoryStore.ts's CloudMemoryEntry interface (lines 22-42) confirming no equivalent field exists for cloud-synced facts. Read conversation-delete-memory-facts.test.ts confirming the null-out-on-delete behavior is real and tested for the field that nothing surfaces.

**Files.**

- `packages/ui/unified-chat/src/stores/memoryStore.ts:36-48,61,215-226`
- `packages/ui/unified-chat/src/components/MemoryEditor.tsx:250-278`
- `apps/mobile/src/features/settings/components/MemoryItem.tsx:1-158`
- `apps/mobile/src/features/memory/services/consolidation.ts:184-226`
- `apps/mobile/stores/memory/cloudMemoryStore.ts:22-42`
- `apps/mobile/__tests__/conversation-delete-memory-facts.test.ts`

**Recommendation.** Render a 'From: <conversation title>' chip in MemoryEditor/MemoryItem when `sourceConversationId` is present, linking to that conversation; add the field to `CloudMemoryEntry` and its wire contract so cloud-synced facts keep provenance; and pass a real `sourceConversationId` from any future in-chat 'save to memory' action.

#### MEMORY-009

**Orphaned legacy memory-browser component family** — P3 · Desktop (Tauri) · `dead-code`

_Screen/component:_ n/a (dead code)

**Current state.** `MemoryViewer.tsx`, `MemoryBrowserModal.tsx`, `MemoryImportanceIndicator.tsx`, `MemoryBadge.tsx`, and `SaveToMemoryButton.tsx` are exported from the feature's barrel (`features/memory/index.ts`) but mounted nowhere in the app. The team's own comment in `Memory.tsx:180-187` documents this exact pattern for `MemoryBrowserModal` specifically ('its sole caller ... was never mounted — so a user could not get their memories out of the device at all') and worked around it by adding a direct Export button rather than fixing the orphaned modal.

**Expected state.** Either these components are mounted somewhere reachable, or they are deleted; a five-file component family that only the barrel file references is maintenance cost with no user-facing benefit.

**Benchmark.** n/a (internal hygiene, not a competitor gap).

**Evidence.** Grepped each component name across apps/desktop/src, excluding the barrel and test files — MemoryViewer, MemoryImportanceIndicator, MemoryBadge, and SaveToMemoryButton have zero non-barrel, non-test references anywhere; MemoryBrowserModal appears only in the historical-bug comment in Memory.tsx, never as a mounted component.

**Files.**

- `apps/desktop/src/features/memory/index.ts`
- `apps/desktop/src/features/memory/MemoryViewer.tsx`
- `apps/desktop/src/features/memory/MemoryBrowserModal.tsx`
- `apps/desktop/src/features/memory/MemoryImportanceIndicator.tsx`
- `apps/desktop/src/features/memory/MemoryBadge.tsx`
- `apps/desktop/src/features/memory/SaveToMemoryButton.tsx`
- `apps/desktop/src/features/settings/tabs/Memory.tsx:180-187`

**Recommendation.** Delete the five orphaned components and their barrel exports, or if a memory-browsing modal is still wanted (e.g. a lighter-weight quick-view than the full Settings tab), mount MemoryViewer/MemoryBrowserModal from an actual entry point and add a regression test asserting it renders.

#### MEMORY-010

**Unreachable second chat runtime injects memory without a temporary-chat check** — P3 · Web · `dead-code`

_Screen/component:_ n/a (dead code / latent bug)

**Current state.** `UnifiedChatPage.tsx` (self-documented as 'kept as an internal component while the Web chat implementation converges' and explicitly not exposed as a second public route) and its `WebChatRuntime.ts` have zero importers anywhere in the app besides their own tests — `/chat` renders a different page. `WebChatRuntime.ts`'s `sendMessage` unconditionally injects saved memory facts (`withMemorySystemMessage`) whenever the Memory capability is on, with no check for whether the target conversation is a temporary/incognito chat — unlike the live production path (`request-processor.ts:976-996`, `enrichManagedMemoryContext`), which correctly short-circuits on `isTemporary`.

**Expected state.** Either this second runtime is deleted, or — if it is genuinely intended to converge into the live path — it must carry the same temporary-chat exclusion before it is ever wired to a route, so it cannot regress the memory/temporary-chat boundary the live path already enforces correctly.

**Benchmark.** ChatGPT Temporary Chat bypasses Memory entirely (research/chatgpt-web-desktop.md:151). Claude Incognito chat is not saved to history or memory (research/claude-web-desktop.md:157).

**Evidence.** Grepped `UnifiedChatPage` and `WebChatRuntime` across apps/web — no importer besides the component's own file and \*.test.ts files; confirmed apps/web/app/chat/page.tsx does not reference either name. Read WebChatRuntime.ts:181-189, confirming memory injection is gated only on `isMemoryCapabilityEnabled()`, no temporary-chat parameter exists anywhere in the class. Read request-processor.ts:976-996 (`enrichManagedMemoryContext`) confirming the live path's `if (params.isTemporary) return;` guard that WebChatRuntime.ts lacks.

**Files.**

- `apps/web/lib/runtime/WebChatRuntime.ts:181-189`
- `apps/web/features/chat/pages/UnifiedChatPage.tsx:44-67`
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:976-996`

**Recommendation.** If UnifiedChatPage/WebChatRuntime are still on the roadmap, add the same `isTemporary` short-circuit before merging any route change that makes them reachable; otherwise delete both files rather than carry live-looking code with a known latent privacy gap.

### Models & reasoning

_7 gaps · source: `gaps/domain-models.json` · narrative: `gaps/domain-models.md`_

#### MODELS-001

**Reasoning-effort / extended-thinking control** — P1 · Desktop (Tauri) · `partial-implementation`

_Screen/component:_ Chat composer (model badge)

**Current state.** The Tauri desktop app's chat composer only exposes model selection, and even that routes the user away from the composer into Settings > Models & Keys (`onModelSelectorClick` calls `openSettingsDialog('models-keys')` — App.tsx:1986-1988) rather than an inline picker. There is no effort/thinking control anywhere: the shared `useChatModelStore` (aliased from `packages/ui/unified-chat/src/stores/modelStore.ts`) exposes `thinkingEnabled`/`toggleThinking`/`setThinking`, but grep across every `apps/desktop/src/**/*.tsx` file finds zero call sites for any of the three. `TauriRuntime.ts` forwards `options?.effort` and `options?.thinkingEnabled` to the backend on every send (lines 587, 675, 1116, with the comment 'Forward the composer controls that were previously dropped here'), and `apps/desktop/src/types/chat.ts:150-151` carries a typed `reasoningEffort?: Effort` field end-to-end — but nothing in any `.tsx` file ever sets a non-undefined value into either. `ModelsKeys/index.tsx` (the settings tab the model badge routes to) has zero mentions of effort/reasoning/thinking. Every message the Desktop Tauri app sends therefore always uses each model's server-side default effort; a user cannot ask for a quicker/cheaper answer or a deeper one.

**Expected state.** The Desktop composer exposes the same model + effort control as Web (or a native-styled equivalent), reading `supportedEfforts`/`defaultEffort`/`canDisableThinking` from the same catalog `ComposerFooter.tsx` already derives affordances from, and actually threading a user-chosen value into the `effort`/`thinkingEnabled` parameters `TauriRuntime.ts` already has ready to receive it.

**Benchmark.** Claude Desktop and ChatGPT macOS both show an inline model+effort control at the composer (`shots-claude-desktop.md:205-212` — 'Model / Effect / Thinking' via the `+` menu; `shots-chatgpt-web-macos.md:62-76` — Intelligence tier list + nested model submenu, right in the composer footer, not behind a settings dialog).

**Evidence.** Read apps/desktop/src/features/v3/DesktopShellV3.tsx and App.tsx around the model-selector click handler; grepped 'effort' and 'thinking' case-insensitively across every .tsx under apps/desktop/src (only test/comment hits, e.g. 'best-effort' in unrelated code comments). Read TauriRuntime.ts's sendMessage/streamMessage builder confirming effort/thinkingEnabled are pass-through parameters with no producer. Traced useChatModelStore to packages/ui/unified-chat/src/stores/modelStore.ts and grepped toggleThinking/setThinking/thinkingEnabled across apps/desktop/src — zero matches outside the store definition itself. Read ModelsKeys/index.tsx and LocalRuntimeSettings.tsx in full — no effort-related UI. Confirmed apps/desktop/electron loads the hosted Web app directly (per desktop-electron.md §1), so this gap is specific to the native Tauri shell, not the Electron/'AGI Cloud' build.

**Files.**

- `apps/desktop/src/features/v3/DesktopShellV3.tsx:259-260`
- `apps/desktop/src/App.tsx:1986-1988`
- `apps/desktop/src/runtime/TauriRuntime.ts:583-592,675,1116`
- `apps/desktop/src/types/chat.ts:150-151`
- `packages/ui/unified-chat/src/stores/modelStore.ts:25,35-36,133,184,186`
- `apps/desktop/src/features/settings/tabs/ModelsKeys/index.tsx`

**Recommendation.** Add an effort control to the Tauri composer (reuse `getModelReasoning`/`effortChipsFor`/`EFFORT_LABEL` logic already built in `ComposerFooter.tsx`, or a native-styled port of it), wire its onChange into the existing `effort`/`thinkingEnabled` fields `TauriRuntime.sendMessage`/`streamMessage` already accept, and drop the settings-dialog-only routing for the composer's own model badge in favor of an inline picker.

#### MODELS-002

**Workspace/organization model access policy** — P1 · Backend · `backend-gap`

_Screen/component:_ Admin console (no dedicated screen exists)

**Current state.** Two separate contract layers already model per-org model restriction, and neither is wired to anything. (1) `enterprise/index.ts` defines `ProviderPolicy { allowedModels: string[]; blockedModels: string[]; ... }` (lines 61-70) and an audit-event type `'model_blocked'` (line 286) — grepping `allowedModels|blockedModels` across every `apps/**` and `packages/**` non-type file finds zero consumers of this specific interface (a _different_ `allowedModels` field exists in `packages/contracts/licensing/src/org-policy.ts` for the offline MDM-style license policy, unrelated to this one). (2) `org-policy.ts` itself is a signed, offline org-policy schema with its own `allowedModels`/`allowedProviders` fields, but its file header states plainly: 'this pass ships the schema + verifier + fixtures only. It is not wired into any surface's enforcement path.' (3) `apps/web/features/admin/pages/AdminConsolePage.tsx` — the only enterprise admin console in the repo — has zero mentions of 'model' anywhere in its 336 lines; its `DEFAULT_ENTERPRISE_ADMIN_POLICY` usage only drives privacy-mode/managed-compute/SSO/audit-log status rows, not model access.

**Expected state.** An organization owner/admin can restrict which models members may select (or set a workspace default model/reasoning level), enforced server-side on every managed-chat request the same way tier gating already is, with the restriction visible in the picker (grayed rows, same `modelLock()` pattern already used for tier/coming-soon gating).

**Benchmark.** ChatGPT Business/Enterprise/Edu — 'workspace admins can set the starting chat model and reasoning level at the workspace level' (Aug 13, 2026 release, `chatgpt-web-desktop.md:219,333`).

**Evidence.** Read enterprise/index.ts's AdminPolicy and ProviderPolicy interfaces in full. Grepped 'ProviderPolicy\b' and 'allowedModels|blockedModels' across packages/ and apps/ (excluding .d.ts and the org-policy.ts family) — only type declarations and unrelated licensing fixtures matched. Read org-policy.ts's file-header 'Scope note' explicitly stating it is unwired. Read the full 336-line AdminConsolePage.tsx and grepped it for 'model' — no matches. Grepped for 'defaultModel|startingModel' across apps/web/app and apps/web/features — no workspace-scoped hit.

**Files.**

- `packages/contracts/types/src/enterprise/index.ts:61-70,286`
- `packages/contracts/licensing/src/org-policy.ts:1-22`
- `apps/web/features/admin/pages/AdminConsolePage.tsx:1-336`

**Recommendation.** Pick one policy layer as authoritative (the live `ProviderPolicy` type, since org-policy.ts is explicitly deferred to a future ADR), add a route to read/write it from the admin console, enforce it in `request-processor.ts`'s existing tier-gate call site (`canAccessModel`), and reflect a blocked model as a locked row in `ComposerFooter.tsx`'s `modelLock()` the same way tier/env locks already render.

#### MODELS-003

**Context-window usage visibility** — P2 · Web · `ux-gap`

_Screen/component:_ Chat composer

**Current state.** Server-side, `context-window.ts` computes an estimated token budget per resolved model and silently drops the oldest turns once a long conversation exceeds it (inserting a `[Earlier messages ... were omitted]` marker). This works correctly (degrades rather than 500s) but nothing on Web tells the user it is happening or how close they are to it. `TokenUsageDisplay.tsx` — the only token-related UI component in `apps/web/features/chat` — shows per-message input/output token counts and cost in a tooltip (a ChatGPT/Claude.ai-style per-turn cost badge), not a running percentage of the model's context window. Grepping `apps/web/features/chat` and `apps/web/shared` for `contextWindow`/`context window`/`context-window` finds only the internal trimming logic and one unrelated hit in `shared/config/llm.ts` — no picker-level context-size badge and no live composer indicator exist. Mobile already ships a comparable warning (`apps/mobile/src/features/chat/components/ContextWarningChip.tsx` — a dismissible banner once `computeContextBudget()` crosses 70% of the model's context window), so this is a real Web-specific gap, not a missing concept.

**Expected state.** The Web composer shows the user, before they hit the wall, that a long conversation is approaching the selected model's context window — at minimum a lightweight warning chip mirroring Mobile's `ContextWarningChip`, ideally a live percentage/remaining-tokens indicator in the composer footer.

**Benchmark.** Codex (VS Code extension and macOS) — 'Show context window usage' toggle surfaces remaining context directly in the composer (`shots-codex-vscode-ios.md:157,352,496,500`); Claude Code sessions show a context-window/token indicator per the desktop changelog (`shots-claude-desktop.md` cross-ref in `claude-web-desktop.md:92`).

**Evidence.** Read context-window.ts in full (server-side trim-and-mark logic, no client signal emitted about it). Read TokenUsageDisplay.tsx in full and its one call site in MessageBubble.tsx:1998 — confirmed per-message, not running-total. Grepped 'contextWindow|context window|context-window' across apps/web/features/chat and apps/web/shared, and 'ComposerFooter.tsx' specifically for the same terms — no matches. Read apps/mobile/src/features/chat/components/ContextWarningChip.tsx confirming the 70%-threshold pattern already ships on Mobile and finding no equivalent import anywhere under apps/web or apps/desktop/src via grep for 'ContextWarningChip|computeContextBudget'.

**Files.**

- `apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:1-60`
- `apps/web/features/chat/components/tokens/TokenUsageDisplay.tsx:1-134`
- `apps/web/features/chat/components/Composer/ComposerFooter.tsx`

**Recommendation.** Estimate live context usage client-side the same way context-window.ts does server-side (or thread a computed percentage back via a response header/field), and render a warning chip above the composer once usage crosses a threshold, porting the Mobile `ContextWarningChip` pattern and copy rather than inventing a new one.

#### MODELS-004

**Provider-outage / fallback transparency** — P2 · Web · `integration-gap`

_Screen/component:_ Chat message (model badge)

**Current state.** When a request fails over to a different model — either an availability-class provider outage (`managed-failover.ts`, `fallbackReason: 'managed_failover'`/`'openrouter_route_failover'`) or an insufficient-credits downgrade (`request-processor.ts:2701`, `fallbackReason = 'Insufficient credits for X, switched to Y'`) — the reason is threaded all the way to `response-builder.ts`'s `x_agi_workforce.fallback.reason` field (lines 281-299) in the non-streaming JSON response. On the streaming path (what the chat UI actually uses), only the resolved model _id_ reaches the client via the `X-AGI-Resolved-Model` header; `useChatStream.ts:2222-2234` reads that header and silently relabels the message's model badge, with no reason text carried at all. Grepping `x_agi_workforce` across apps/web finds exactly two producers (response-builder.ts, models/route.ts) and zero consumers — the field is computed and then never rendered anywhere.

**Expected state.** When agiworkforce automatically switches a user's model mid-turn — for a provider outage or a credit-driven downgrade — the UI shows a brief, honest inline note (e.g. under the model badge: 'Switched to <model> — <reason>'), using the `fallbackReason` data that already exists server-side.

**Benchmark.** General transparency bar implied by the ChatGPT complaint that model switches feel 'decorative' (`chatgpt-web-desktop.md:343`) — agiworkforce already avoids the dishonest half of that complaint (the badge does update correctly) but stops short of explaining _why_, which is the informative half users are asking for.

**Evidence.** Read managed-failover.ts's fallbackReason assignment sites and request-processor.ts's credit-downgrade branch. Read response-builder.ts:281-299 confirming x*agi_workforce.fallback.reason is populated on the JSON path. Grepped 'x_agi_workforce' across apps/web/\**/\_.ts(x) excluding tests/node_modules — only the two producer files matched, no consumer. Read useChatStream.ts:2219-2234 confirming the streaming path only propagates the resolved model id via header, never a reason string.

**Files.**

- `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:86,108,250`
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:635,2376,2701,2989`
- `apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:281-299`
- `apps/web/lib/hooks/useChatStream.ts:2219-2234`

**Recommendation.** Add an `X-AGI-Fallback-Reason` (or similar) header alongside the existing `X-AGI-Resolved-Model` on the streaming response path, populated from the same `processed.fallbackReason` value response-builder.ts already reads for the JSON path, and render it as a small dismissible note on the affected message in MessageBubble.tsx when present.

#### MODELS-005

**Ultra / Pro reasoning modes and reasoning-dots capability metadata** — P2 · Shared packages · `missing-capability`

_Screen/component:_ n/a — schema-only, no screen exists yet

**Current state.** The registry schema defines a structured `ultraMode` contract (`ReasoningUltraMode`: `param`/`concurrencyParam`/`beta`/`endpoint`/`responseItems` — model-catalog.ts:179) and a `proMode` contract (`param: 'reasoning.mode', value: 'pro', endpoint: 'responses'` — model-catalog.ts:215) per model, populated for the current OpenAI reasoning family (gpt-5.6-sol/terra/luna, models.json:550-558 etc. — `ultraMode.enabled: false` for all three, `proMode` object present unconditionally). A separate `reasoningDots?: number` field (model-catalog.ts:609) is also populated (e.g. `5` for gpt-5.6-sol) but is a pure display hint with no schema-declared consumer. Grepping `ultraMode|proMode` across every non-type, non-catalog `.ts`/`.tsx` file in apps/ and packages/ finds zero consumers — no request builder ever reads `proMode.param` to send `reasoning.mode=pro`, and no UI ever renders a parallel-agent/Ultra toggle or a Pro-mode option. Grepping `reasoningDots` finds only its own type declaration, never read by any picker component.

**Expected state.** Either these fields drive real product surfaces (a parallel multi-agent 'Ultra' mode and an OpenAI-Pro-mode reasoning tier selectable in the composer, plus a dot-count visual indicator in the effort picker matching the catalog's `reasoningDots`), or — if not planned for the near term — the schema is annotated as forward-looking/unimplemented so a future reader does not assume it is live.

**Benchmark.** ChatGPT web General settings 'Enable Ultra effort — uses multiple agents in parallel for your most ambitious tasks' (`shots-chatgpt-web-macos.md:170`); Codex's five-level Light/Medium/High/Extra High/Ultra ladder (`shots-codex-vscode-ios.md:108-122`); OpenAI's separate Pro Standard/Pro Extended tier for Plus/Pro users (`chatgpt-web-desktop.md:214`).

**Evidence.** Read model-catalog.ts's ReasoningUltraMode interface and the reasoning field's ultraMode/proMode/reasoningDots members. Read the populated values for gpt-5.6-sol/terra/luna in models.json via a Python json.load, confirming ultraMode.enabled is false for every model in the catalog (34 models total) and proMode is an unconditional object for the three OpenAI reasoning models. Grepped 'ultraMode|proMode' and 'reasoningDots' across apps/web, apps/mobile, apps/desktop, packages/ai — matches were exclusively the type declaration file and models.json itself; canonical-request.ts and request-processor.ts (the actual outgoing-request builders) were read directly and contain no reference to either field.

**Files.**

- `packages/contracts/types/src/model-catalog.ts:179,209-215,609`
- `packages/contracts/types/src/models.json:550-558,647-655,744-752`
- `apps/web/features/chat/components/Composer/ComposerFooter.tsx`

**Recommendation.** If Ultra/Pro modes are on the near-term roadmap, wire proMode/ultraMode into canonical-request.ts's request-building path and add a composer control gated on `reasoning.ultraMode`/`proMode` presence, matching the existing effort-chip pattern. If not imminent, add a one-line schema comment marking these fields speculative/unused so future readers (human or agent) do not assume a live capability.

#### MODELS-006

**Retired-model conversation migration notice** — P2 · Web · `ux-gap`

_Screen/component:_ Chat page (opening an old conversation)

**Current state.** `isCurrentModel()` and `resolveSelectableModelId()` correctly prevent a deprecated/retired model from ever being selected or routed to — but the substitution is silent. `WebChatPage.tsx:1211-1220`'s hydration effect reads a conversation's persisted `model` field, passes it through `resolveSelectableModelId()`, and calls `setSelectedModelId()` with whatever comes back (the catalog default/Auto if the original model is gone) — with no toast, banner, or inline message-thread notice telling the user their old conversation's model changed. A user reopening a six-month-old chat has no way to know the model badge they now see is not the one that generated the earlier messages in that thread.

**Expected state.** Opening a conversation whose persisted model has since been deprecated/retired shows a brief, honest notice (e.g. a small inline banner: 'This chat used <old model>, which is no longer available. Now using <new model>.') rather than a silent substitution.

**Benchmark.** cross-cutting-and-complaints.md's general deprecation-communication theme: 'a deprecation timeline communicated up front, features vanishing for some users on some app versions' is treated as a design failure mode across both competitors (§ synthesis around line 253) — the fix pattern is explicit first-party disclosure, not silent substitution.

**Evidence.** Read model-store.ts's isCurrentModel/resolveSelectableModelId functions confirming they filter deprecated models but return only a string id, no diagnostic. Read WebChatPage.tsx's conversation-hydration effect (lines 1211-1220) confirming it calls setSelectedModelId directly off resolveSelectableModelId's return with no branch that compares the persisted model against the resolved one or surfaces a difference to the user.

**Files.**

- `apps/web/shared/stores/model-store.ts:82-99,204-210`
- `apps/web/features/chat/pages/WebChatPage.tsx:1211-1220`

**Recommendation.** In the same hydration effect, compare `persistedModel` against the resolved id; when they differ because of deprecation (not because of a private user re-selection), set a one-time dismissible banner state read by the chat header, reusing the resolved-model relabel infrastructure already built for the fallback-header case.

#### MODELS-007

**Embedded local-model inference (dead Cargo feature)** — P3 · Desktop (Tauri) · `dead-code`

_Screen/component:_ n/a — no UI references it

**Current state.** `llama-cpp-2` is an `optional = true` Cargo dependency gated behind a `local-llm` feature (Cargo.toml:240,309), intended for in-process/embedded model inference. It has zero call sites anywhere in `apps/desktop/src-tauri/src` (verified directly: `grep -rn "llama_cpp_2::" src/` returns nothing), and `local-llm` is absent from the shipped binary's `default` feature set (`default = ["shell", "updater", "billing", "vad"]`, Cargo.toml:301) — it is only ever compiled in a clippy-lint-only CI lane, never a release build. The product's actual, shipped 'local model' story is honest and different: `Provider::LlamaCpp` is an HTTP client pointed at `http://localhost:8080/v1` (direct*api_provider.rs:411) — i.e. connecting to a llama.cpp \_server* the user runs separately, identical in kind to the LM Studio and vLLM options. `LocalRuntimeSettings.tsx` correctly labels this as an external runtime (docs link to `github.com/ggml-org/llama.cpp`, the server project) — the UI never promises embedded/in-process inference, so this dead code is not a broken user-facing promise, just dormant scaffolding.

**Expected state.** Either the `local-llm` embedded-inference path is finished and shipped (giving users a true no-external-process local model option), or the dead Cargo feature and dependency are removed to reduce maintenance surface, since nothing currently references it.

**Benchmark.** N/A — neither ChatGPT nor Claude ship any local/on-device model execution in their official desktop apps; this is purely an internal code-hygiene note, included because it sits squarely in the 'local-model...provider compatibility' axis of this domain.

**Evidence.** Read Cargo.toml's dependency and feature declarations directly. Ran `grep -rn "llama_cpp_2::" apps/desktop/src-tauri/src` myself — zero matches. Read direct_api_provider.rs's provider-URL table confirming LlamaCpp/LmStudio/Vllm are all treated identically as loopback HTTP targets. Read LocalRuntimeSettings.tsx confirming the shipped UI copy and docs links describe an external runtime, not embedded inference, so no user-facing claim is being broken by the dead code.

**Files.**

- `apps/desktop/src-tauri/Cargo.toml:240,301,309`
- `apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs:410-413`
- `apps/desktop/src/features/settings/tabs/ModelsKeys/LocalRuntimeSettings.tsx:1-60`

**Recommendation.** Remove the `local-llm` feature flag and `llama-cpp-2` dependency if embedded inference is not on the near-term roadmap; if it is, finish the integration (load a local `.gguf` model in-process, surface it in LocalRuntimeSettings.tsx as a distinct 'Run a model directly in AGI' option) and add it to the shipped default feature set.

### Projects, files & library

_8 gaps · source: `gaps/domain-projects-files.json` · narrative: `gaps/domain-projects-files.md`_

#### PROJECTS-FILES-001

**Project knowledge file parsing (spreadsheets, Office documents)** — P1 · Backend · `missing-capability`

_Screen/component:_ Project detail > Sources / Add sources modal

**Current state.** extractProjectKnowledgeFile() only produces extracted text for three formats: application/pdf (pdfjs-dist text layer), application/x-ipynb+json (custom notebook-cell parser), and anything isTextAttachmentMeta() classifies as text (txt/md/csv/json/xml/js/jsx/ts/tsx/py/rs/go/java/html/css). Everything else falls through to `{ extractedText: null }` and is stored with no usable content. One level up, the picker itself never offers the choice: both AddSourcesModal and SourcesPanel build their <input accept> from the shared ALLOWED_ATTACHMENT_ACCEPT / ALLOWED_ATTACHMENT_EXTENSIONS list (chat.ts:191-229), which contains images, pdf, and the text extensions above but no docx/xlsx/pptx/xls entries at all, and validateAttachmentMeta (chat.ts:267-307, invoked server-side in knowledge-files/route.ts:166) rejects any file with those extensions outright with 'unsupported-type'. CSV is accepted but only as raw delimited text (no cell/sheet parsing). An uploaded image passes validation (images are in the accept list) but silently gets extractedText: null, so it contributes nothing to the model's context beyond its filename -- with no UI indication of that fact.

**Expected state.** A user can add a .xlsx workbook, .docx, or .pptx as a project knowledge source and the model can reason over its content on every turn, the same way it already can for a PDF. At minimum: server-side text/table extraction for xlsx (sheet name + cell grid, bounded like the existing PDF/notebook caps) and docx/pptx (paragraph/slide text), wired into the same extractProjectKnowledgeFile() pipeline and the same accept-list/validator so the picker actually offers these types instead of silently hiding them.

**Benchmark.** ChatGPT Projects and Claude Projects file uploads (.docx/.xlsx/.pptx/.csv accepted and read as project knowledge) -- this exact gap was named explicitly in the audit's own domain brief and independently confirmed in apps/web/lib/server/project-knowledge-extraction.ts and audit/parity-2026-08-15/inventory/web-backend.md:326-370 ('No spreadsheet (xlsx/csv) parser exists').

**Evidence.** Read project-knowledge-extraction.ts end to end: extractProjectKnowledgeFile() branches only on application/pdf, application/x-ipynb+json, and isTextAttachmentMeta(); every other declaredMimeType returns extractedText: null (line 300). Read chat.ts:191-229 -- TEXT_ATTACHMENT_EXTENSIONS and ALLOWED_ATTACHMENT_EXTENSIONS contain no xlsx/xls/docx/pptx. Confirmed AddSourcesModal.tsx and SourcesPanel.tsx both pass ALLOWED_ATTACHMENT_ACCEPT as the file-picker `accept` prop (SourcesPanel.tsx:521,538), and knowledge-files/route.ts:166-173 calls validateAttachmentMeta() server-side before any extraction runs, so a spreadsheet cannot even reach the extractor. Grepped the whole repo for xlsx/docx handling: every hit is either an icon-label map (FileTypeIcon.tsx, GeneratedFileCard.tsx) or the create_office_file tool comment in capability-preamble.ts:41-47, which documents that even AGENT-GENERATED xlsx must go through the sandbox (execute_code), not the create_office_file tool -- confirming no first-party Office/spreadsheet writer or reader exists anywhere in the web stack. Cross-checked against web-backend.md's own independent audit (line 347-352, 367-370), which reaches the identical conclusion.

**Files.**

- `apps/web/lib/server/project-knowledge-extraction.ts:209-301`
- `packages/contracts/types/src/chat.ts:191-229`
- `apps/web/features/projects/components/SourcesPanel.tsx:19,521,538`
- `apps/web/features/projects/components/AddSourcesModal.tsx`

**Recommendation.** Add xlsx (via a lightweight sheet-cell parser, bounded rows/cols like the existing MAX_PDF_PAGES cap) and docx/pptx (paragraph/slide text) branches to extractProjectKnowledgeFile(), add their extensions/MIME types to ALLOWED_ATTACHMENT_EXTENSIONS (or a parallel PROJECT_KNOWLEDGE_EXTENSIONS list if chat-attachment scope must stay narrower), and update AddSourcesModal/SourcesPanel's accept attribute to match. Ship xlsx first since it's the one explicitly flagged in the audit brief and has no workaround (a user cannot even convert a spreadsheet to PDF and keep the tabular structure).

#### PROJECTS-FILES-007

**Library has no 'reuse this file in a new conversation' action on web/desktop** — P1 · Shared packages · `parity-gap` · prior art `GAP-020`

_Screen/component:_ /chat/library (web), Library (desktop, same shared component)

**Current state.** The shared LibraryTransport interface that both web and desktop's Library implement (LibraryView.tsx:120-148) exposes listPage/fetchAsset/deleteItem/permanentlyDeleteItem/restoreItem/openPreview/startChat -- there is no attach-to-conversation action anywhere in the interface or in the GeneratedFileCard rendering (lines 540-559), and grepping the file for 'onAttach'/'attachFromLibrary'/'Attach from Library'/'Use in' returns nothing. The only way to bring a Library file into a new chat on web or desktop is Download, then manually re-attach it through the composer's file picker. Mobile already shipped the equivalent capability: GAP-020 in audit/ui-gaps.csv (status Done) describes AddToChatSheet.tsx's 'Attach from Library' action, which forwards an existing Cloud asset id without re-uploading bytes, backed by apps/mobile/src/features/library/index.tsx and covered by add-to-chat.test.tsx.

**Expected state.** Web and desktop's Library cards should carry the same 'Use in a new chat' / 'Attach from Library' action mobile already has -- forwarding the existing asset id to the composer without a redundant download+re-upload round trip.

**Benchmark.** This repo's own mobile Library (GAP-020, Done) plus ChatGPT's 'upload once, use anytime' Library pattern it was built to match.

**Evidence.** Read the full LibraryTransport interface and card-rendering block in packages/ui/unified-chat/src/components/library/LibraryView.tsx -- confirmed no attach/reuse callback exists in the type or in the rendered GeneratedFileCard's action props (onDownload/onPreview/onPreviewError only). Grepped the file and the web adapter for attach-related identifiers -- zero matches. Read GAP-020 in audit/ui-gaps.csv confirming mobile's equivalent feature is real, tested, and marked Done, which is direct in-repo evidence this is an expected, valuable capability rather than a speculative addition.

**Files.**

- `packages/ui/unified-chat/src/components/library/LibraryView.tsx:120-148,540-559`
- `apps/web/features/library/components/LibraryView.tsx`
- `apps/mobile/src/features/library/index.tsx`

**Recommendation.** Add an `onAttach?: (item) => void` (or similar) to LibraryTransport, wire it on web to push the selected item's existing asset id into the composer's attachment state via the same asset-id-forwarding path GAP-020 already proved out on mobile (no re-upload), and render an 'Attach to chat' button on GeneratedFileCard when the callback is present.

#### PROJECTS-FILES-002

**Project knowledge context budget: silent truncation, no capacity indicator** — P2 · Backend · `reliability-gap`

_Screen/component:_ Project detail > Sources tab / Project settings > Files

**Current state.** loadProjectContext() reads up to MAX_KNOWLEDGE_FILES=20 files ordered by added_at desc, and formatProjectSystemPrompt() then stuffs each file's full extractedText (truncated per-file at MAX_FILE_CONTENT_CHARS=16,000 chars) into the system prompt on every single turn, up to a combined MAX_TOTAL_FILE_CONTENT_CHARS=48,000 chars (~12k tokens) across all files, walking the list in the same most-recent-first order. Once that shared budget is exhausted mid-loop, the remaining (older) files are silently skipped -- their manifest line still appears ('Project knowledge files:' lists every filename) but their content contributes nothing to that turn's answer. Nothing in the product tells the user this happened: KnowledgeFilesPanel.tsx:131 and SourcesPanel.tsx:355 show only a raw '{n} files - {n} KB' total, never a 'X of 20 files' cap indicator or a 'Y% of context used' meter, and there is no per-file 'in context' / 'truncated' badge.

**Expected state.** This is legitimate, deliberately bounded engineering (unbounded context stuffing would be worse), but a bounded resource that silently drops content needs to say so. Users should see, at minimum, how many of their knowledge files are actually active in the budget vs. how many exist (20-file cap) and ideally a lightweight capacity/usage indicator near Sources, plus a visible marker on any file whose content was excluded from the current turn's context because an earlier file in upload order consumed the shared budget.

**Benchmark.** Claude Projects' Project knowledge panel surfaces a capacity signal for uploaded sources (research on the exact UI mechanic was inconclusive per audit/parity-2026-08-15/research/claude-web-desktop.md:92, so this gap is filed primarily on this repo's own silent-truncation behavior, which is worth fixing regardless of the benchmark's exact visual treatment).

**Evidence.** Read project-context-service.ts fully: MAX_KNOWLEDGE_FILES/MAX_FILE_CONTENT_CHARS/MAX_TOTAL_FILE_CONTENT_CHARS constants (lines 53-56) and the truncation loop in formatProjectSystemPrompt() (lines 325-333) which does `if (!content || remainingChars <= 0) continue;` -- confirming files simply drop out with no signal returned to the caller about which ones were skipped. Grepped KnowledgeFilesPanel.tsx and SourcesPanel.tsx for 'MAX_KNOWLEDGE_FILES', '/ 20', 'of 20', 'capacity' -- zero matches; both only render a plain count/size total.

**Files.**

- `apps/web/lib/services/project-context-service.ts:44-56,314-341`
- `apps/web/features/projects/components/KnowledgeFilesPanel.tsx:127-131`
- `apps/web/features/projects/components/SourcesPanel.tsx:355`

**Recommendation.** Have loadProjectContext() return which files were included vs. excluded by the budget walk, surface an 'X of 20 files - Y% of context used' bar in SourcesPanel/KnowledgeFilesPanel, and mark excluded files inline (e.g. 'Not included in this turn -- remove an older file or split this one'). No provider-call change required, purely bookkeeping already computed server-side.

#### PROJECTS-FILES-003

**Projects hub: search and Create disappear outside the default sort** — P2 · Web · `ux-gap`

_Screen/component:_ /chat/projects

**Current state.** The Projects hub delegates to the shared <ProjectGallery> (which owns the only search box and the only inline 'Create project' form) exclusively when `useGallery = sortMode === 'updated' && !showArchived` (page.tsx:150). Selecting any other sort ('Created (newest)', 'Name (A-Z)', 'Starred first') or toggling 'Archived' switches the page to its own custom-sorted <ProjectCard> grid, which has no search input and no create affordance at all. The empty state for that branch literally reads 'Switch to "Updated (newest)" sort to create one.' (page.tsx:410) -- the product's own copy documents that project creation is unreachable from three of its four sort states and from the archived view.

**Expected state.** Search and 'New project' should be present regardless of sort order or archived/active view -- either by hoisting them out of ProjectGallery into the page's own persistent toolbar, or by making the custom-sorted branch render the same toolbar. A basic list-management control should not vanish based on an unrelated dropdown selection.

**Benchmark.** ChatGPT Projects and Claude Projects hub pages -- search and 'New project' are persistent chrome, never conditional on the active sort.

**Evidence.** Read apps/web/app/chat/projects/page.tsx in full. Confirmed useGallery boolean at line 150 gates between <ProjectGallery> (which per packages/ui/unified-chat/src/components/ProjectGallery.tsx:261-274 owns the only 'Search projects' input and lines 292-412 the only inline create form) and a bare `displayProjects.map(...)` grid with no search state and no create button when useGallery is false. Confirmed the empty-state copy directing users to switch sort mode to create a project at page.tsx:406-411.

**Files.**

- `apps/web/app/chat/projects/page.tsx:150,369-413`

**Recommendation.** Move the search box and 'New project' entry point into the page-level header (outside the useGallery conditional) so both render for every sort mode and for the archived view; pass ProjectGallery's search/create only its own filtered subset rather than gating the controls themselves.

#### PROJECTS-FILES-004

**Two drifted, non-overlapping project-creation quick-start UIs** — P2 · Web · `architecture-gap`

_Screen/component:_ Sidebar 'New project' dialog vs. /chat/projects inline create form

**Current state.** Two independently-built 'quick start' project-creation flows exist, reachable from different places, with disjoint feature sets. (1) The sidebar's 'New project' action (WebChatPage.tsx) opens CreateProjectDialog, which offers PROJECT_TEMPLATES (Blank/Research/Writing/...) -- each pre-fills name + description + instructions but has no emoji or accent-color picker. (2) The /chat/projects hub's inline create form (the shared ProjectGallery component) offers PROJECT_PRESETS (Coding/Writing/Research/Learning) -- each sets only an emoji + accent color, with no instructions at all. A user creating from the sidebar gets a well-seeded system prompt but a plain generic folder icon; a user creating from the hub page gets a colorful identity but a blank instructions box they have to write themselves. Neither entry point provides the other's benefit, and the category label sets partially overlap (both have 'Research'/'Writing') but diverge for the rest (Coding/Learning vs. none), so the two pickers don't even present as the same feature to a user who has seen both.

**Expected state.** One project-creation quick-start surface (or two that share a single template source covering identity + instructions together), so every entry point produces the same quality of starting project regardless of which button the user happened to click.

**Benchmark.** Claude/ChatGPT project creation flows expose one consistent 'get started' experience regardless of entry point.

**Evidence.** Read CreateProjectDialog.tsx (imports PROJECT_TEMPLATES from features/projects/data/project-templates.ts at line 20, applies template.name/description/instructions at lines 72-79, renders template chips at 189-213, no emoji/color control in the file). Read ProjectGallery.tsx (PROJECT_PRESETS array lines 20-25, applyPreset sets only emoji+accentColor via the preset-chip handler at 363-376, no instructions field anywhere in the component). Confirmed CreateProjectDialog is only imported by WebChatPage.tsx (grep), while ProjectGallery's inline form is what /chat/projects/page.tsx renders (confirmed in PROJECTS-FILES-003's read of that file).

**Files.**

- `apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:20,43,189-213`
- `apps/web/features/projects/data/project-templates.ts:34-60`
- `packages/ui/unified-chat/src/components/ProjectGallery.tsx:20-25,356-376`

**Recommendation.** Merge PROJECT_TEMPLATES and PROJECT_PRESETS into one shared template list carrying emoji + accentColor + name + description + instructions together, consumed by both CreateProjectDialog and ProjectGallery's inline form, so either entry point produces an identically-seeded project.

#### PROJECTS-FILES-005

**Library 'Uploaded' filter copy contradicts a real, live upload-cataloging pipeline** — P2 · Web · `ux-gap`

_Screen/component:_ /chat/library, Origin filter = 'Uploaded'

**Current state.** LibraryView.tsx's own header comment ('Uploads are not cataloged into the Library today (chat uploads stay with their conversation)', lines 18-20) and its EmptyState copy for the Uploaded filter ('Uploaded files aren't cataloged in the Library yet -- files you upload stay with their conversation', lines 763-765) both assert that chat attachments never appear in the Library. media-assets.ts:434-436 makes the same claim in code: 'No writer emits them yet (every current pipeline is generation).' All three statements are contradicted by a real, reachable code path: the composer's file-upload flow (chat-attachment-upload.ts -> managed-cloud-chat-attachments-client.ts:151-168 -> POST /api/uploads/chat-attachment/complete) calls insertMediaAsset() with metadata.origin: 'upload' (complete/route.ts:162-179) on every successful chat attachment, and /api/library's own listLibraryAssets() filters exactly on that value (media-assets.ts:487-489, exercised by route.test.ts:149-157). Git history shows the upload-cataloging writer (commit a7044ecc9) predates the most recent edit to the Library copy (commit 98b490c84) by hundreds of commits, and production has a real R2 media bucket provisioned (per audit/parity-2026-08-15/inventory/deployment-state.md:42-46), so this is not a case of the writer being unreachable or unprovisioned.

**Expected state.** Either the copy is stale and should be corrected to reflect that uploads ARE cataloged (in which case the 'Uploaded' filter should just work and needs no disclaimer), or -- if end-to-end verification finds the pipeline doesn't actually surface uploads in practice for some untraced reason -- that deeper bug needs to be found and fixed. Either way, shipped user-facing copy should not assert a capability's absence when the code path exists and is wired to the real upload flow.

**Benchmark.** n/a -- this is an internal-consistency defect in this repo's own code and copy, not a benchmark comparison.

**Evidence.** Traced the full chain: WebChatPage.tsx:1406 calls uploadChatAttachments() (chat-attachment-upload.ts) -> createManagedCloudChatAttachmentsClient().upload() (managed-cloud-chat-attachments-client.ts:94-171, presign -> PUT -> POST complete) -> handleComplete in complete/route.ts:162-179 calls insertMediaAsset({ ..., metadata: { origin: 'upload', ... } }). Cross-checked /api/library/route.ts:487-489 (listLibraryAssets origin='uploaded' filter) and its test at library/**tests**/route.test.ts:149-157, which asserts the exact SQL clause the writer's data would match. Checked commit order with `git log --oneline` line positions: a7044ecc9 (adds the writer) sits far below (older than) 98b490c84 (last touch to LibraryView.tsx) in history. Confirmed R2 is a live, CSP-allowlisted production origin per deployment-state.md.

**Files.**

- `packages/ui/unified-chat/src/components/library/LibraryView.tsx:18-20,753-765`
- `apps/web/lib/server/media-assets.ts:433-438`
- `apps/web/app/api/uploads/chat-attachment/complete/route.ts:162-179`
- `apps/web/features/chat/services/chat-attachment-upload.ts`
- `packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:151-168`

**Recommendation.** Manually upload a chat attachment in a real/staging environment and check whether it appears under Library > Uploaded. If it does, delete the stale disclaimer copy and comment in both files. If it does not, that is a separate, higher-severity bug (a writer that appears live but doesn't actually surface data) and should be traced further (RLS policy, organization_id mismatch, or a UI filter bug) rather than papered over with the current copy.

#### PROJECTS-FILES-006

**Knowledge file version history has no UI** — P3 · Web · `partial-implementation`

_Screen/component:_ Project settings > Files / Sources tab

**Current state.** The backend has real, tested version-history logic: re-uploading a file with the same name but a different checksum is treated as an edit (POST handler in knowledge-files/route.ts:290-410), the prior row is stamped superseded_at rather than deleted_at (so it is retained as history, not erased), and each row carries a version counter and a supersedes_id back-reference. None of this is exposed anywhere in the UI: KnowledgeFilesPanel.tsx, SourcesPanel.tsx, and FilePreviewModal.tsx were all grepped for 'version'/'Version'/'supersede' with zero matches. A user who corrects a file by re-uploading it sees only the current version silently replace the old one in the list, with no 'v2, replaced Aug 1' indicator and no way to view or restore the prior version through the product.

**Expected state.** The file list (or its detail/preview) should show version number and replacement history for a knowledge file with more than one version, with at least a read-only view of prior versions given the data is already retained server-side.

**Benchmark.** General document-management expectation (Claude/ChatGPT Projects sources, Google Drive-class version history) -- a capability the backend already half-built and never finished per CLAUDE.md's 'finish what you start' rule.

**Evidence.** Read knowledge-files/route.ts:290-410 (supersedes detection, version increment, superseded_at stamping). Grepped KnowledgeFilesPanel.tsx, SourcesPanel.tsx, FilePreviewModal.tsx for version-related strings -- no output (zero matches) confirming no UI consumer of `version`/`supersedes_id`/`superseded_at`.

**Files.**

- `apps/web/app/api/projects/[id]/knowledge-files/route.ts:290-410`
- `apps/web/features/projects/components/KnowledgeFilesPanel.tsx`
- `apps/web/features/projects/components/SourcesPanel.tsx`
- `apps/web/features/projects/components/FilePreviewModal.tsx`

**Recommendation.** Surface a 'v{n}' badge on any knowledge file with version > 1 (already returned by GET /api/projects/[id]/knowledge-files via mapKnowledgeFileRow), and add a lightweight 'Version history' expandable row that lists prior versions (already queryable by supersedes_id chain) with a preview-only view -- no restore action needed for a first slice.

#### PROJECTS-FILES-008

**File-upload edge-case error UX is built, tested, and unreachable** — P3 · Mobile · `dead-code`

_Screen/component:_ Mobile composer attachment flow (file-too-large / image-too-large / unreadable-file states)

**Current state.** FileTooLargeModal, ImageTooLargeModal, and FileUnreadableModal are fully built, exported from the edge-cases barrel, have locked copy in copy.ts, and are covered by edge-cases.test.tsx (renders in isolation, asserts the CTA callback fires) -- but nothing in the app imports any of them outside their own directory and test files. The real file-too-large failure path (attachmentValidation.ts) surfaces inline composer error text instead, confirming these three modals are a superseded, orphaned second implementation rather than work still in progress.

**Expected state.** Either these modals are the intended presentation for these three error states and should be wired into the real attachment-validation failure paths, or they should be deleted along with their tests and copy entries so the codebase doesn't carry three maintained-but-dead UI components.

**Benchmark.** n/a -- internal dead-code finding, not a competitor comparison.

**Evidence.** Independently confirmed via `grep -rln "FileTooLargeModal\|ImageTooLargeModal\|FileUnreadableModal" apps/mobile --include="*.tsx" --include="*.ts" | grep -v "__tests__|edge-cases/components|edge-cases/index"` -- zero output, meaning no file outside the edge-cases directory itself and its own barrel/tests references any of the three components. Cross-checked against audit/parity-2026-08-15/inventory/mobile.md section 14, which independently reaches the same conclusion and additionally confirms attachmentValidation.ts's inline composer error is the real, live mechanism for the file-too-large case.

**Files.**

- `apps/mobile/src/features/edge-cases/components/FileTooLargeModal.tsx`
- `apps/mobile/src/features/edge-cases/components/ImageTooLargeModal.tsx`
- `apps/mobile/src/features/edge-cases/components/FileUnreadableModal.tsx`
- `apps/mobile/src/features/edge-cases/index.ts`

**Recommendation.** Wire FileUnreadableModal into the actual unreadable-attachment failure path (there does not appear to be a dedicated one today) since it is the one case not already covered by inline composer text; delete FileTooLargeModal and ImageTooLargeModal (and their tests/copy) since attachmentValidation.ts's inline error already covers that case and a second, unreachable presentation for the same failure adds maintenance cost with no user benefit.

### Message rendering & response actions

_12 gaps · source: `gaps/domain-rendering.json` · narrative: `gaps/domain-rendering.md`_

#### RENDERING-001

**Markdown rendering engine** — P1 · Cross-surface · `architecture-gap`

_Screen/component:_ chat transcript (all surfaces)

**Current state.** Web and Desktop share one real remark/rehype-based markdown pipeline (MarkdownContent.tsx: remark-gfm+remark-math+remarkBreaks, rehype-raw->rehype-sanitize->rehype-katex->rehype-highlight). Mobile has an independent 642-line hand-written regex parser (MessageContentRenderer.tsx). The Chrome extension has a third, independently written 179-line regex parser (markdown.ts). None of the three share code, and grep confirms zero references to MarkdownContent outside apps/web and packages/ui/unified-chat.

**Expected state.** A single AST-based markdown engine (or a thin per-platform renderer over one shared parse tree) so a fix or feature (new sanitizer rule, new GFM feature, new highlight theme) lands on every surface at once, the way any single ChatGPT or Claude surface behaves identically across screens.

**Benchmark.** Claude Desktop/Web/iOS and ChatGPT Web/Desktop each render markdown consistently within their own product; per shots-claude-desktop.md and shots-chatgpt-web-macos.md no surface-specific markdown feature gaps were observed within a single vendor's product family

**Evidence.** Read MarkdownContent.tsx in full (297 lines, uses react-markdown+remark-gfm/math/breaks+rehype-raw/sanitize/katex/highlight). Read MessageContentRenderer.tsx in full (642 lines, custom renderTextSegment/renderInlineMarkdown regex functions). Read markdown.ts in full (179 lines, custom renderMarkdown regex function). grep -rn "MarkdownContent" apps/mobile apps/extension returned zero hits, confirming no shared code path.

**Files.**

- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:1-297`
- `apps/web/features/chat/components/messages/MessageBubble.tsx:65-66`
- `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1-642`
- `apps/extension/src/features/side-panel/markdown.ts:1-179`

**Recommendation.** Adopt one shared parse layer (e.g. micromark/mdast) with three thin render-target adapters (React DOM for web/desktop, React Native primitives for mobile, vanilla DOM builder for the extension), replacing the two independent regex engines. Ship incrementally: fix the two concrete correctness bugs in RENDERING-002/003 first, then converge the parsers.

#### RENDERING-002

**Markdown rendering — tables, images, math, syntax highlighting** — P1 · Chrome extension · `partial-implementation`

_Screen/component:_ side panel chat transcript

**Current state.** renderMarkdown() in markdown.ts has no table handling (a markdown table renders as literal pipe characters), no image handling (sanitizeHtml explicitly FORBID_TAGS 'img' and FORBID_ATTR 'src'), no math/LaTeX handling at all, and code fences render as bare <pre><code> with no language class and no highlighting library wired anywhere in bubbles.ts.

**Expected state.** The extension side panel renders the same markdown feature set as the web/desktop pipeline: tables, inline images with loading/error states, KaTeX math, and syntax-highlighted code blocks with a per-block copy button.

**Benchmark.** ChatGPT for Chrome and Claude in Chrome extensions render full markdown including tables, images, and highlighted code, per shots-chatgpt-web-macos.md Part 3 and shots-claude-web.md Claude-in-Chrome settings sections

**Evidence.** Read markdown.ts in full: no `|` table regex anywhere; ALLOWED_TAGS in sanitizeHtml (lines 33-65) omits 'img' and FORBID_TAGS (67-79) explicitly includes 'img'; no $ or $$ math regex; code fence handling (lines 99-101) produces plain <pre><code> with no class attribute. grep -n "pre\b|code-block|highlight" bubbles.ts returned zero hits, confirming no post-processing enhances the raw output.

**Files.**

- `apps/extension/src/features/side-panel/markdown.ts:96-179`
- `apps/extension/src/features/side-panel/bubbles.ts:231,677`

**Recommendation.** Wire a lightweight syntax highlighter (e.g. highlight.js, already a dependency in packages/ui/unified-chat) into the extension's code-fence path, add a table regex/renderer, relax the img FORBID_TAGS entry to an allowed tag scoped to http(s)/data sources with a DOMPurify hook, and add $...$ math via a bundled KaTeX render-to-string call before sanitization.

#### RENDERING-004

**Response actions — feedback, edit, share, read aloud, branch, report** — P1 · Desktop (Tauri) · `dead-code`

_Screen/component:_ chat transcript action row

**Current state.** Desktop's chat renders through packages/ui/unified-chat's MessageBubble/ActionBar. ActionBar's thumbs-up/down block is only rendered when an onFeedback prop is passed; MessageList.tsx (the only caller) never passes onFeedback anywhere (grep confirmed zero hits), so the feedback UI can never render in production. A fully implemented editMessage(messageId, newContent) action exists in apps/desktop/src/stores/chat/chatStore.ts (lines 271, 1360) but has zero callers anywhere in the desktop UI tree outside the store definition itself, per grep -rn "editMessage(" apps/desktop/src excluding stores/. Share, Read Aloud, Branch/Fork, and Report have no prop, callback, or component anywhere in ActionBar.tsx or MessageBubble.tsx in the shared package.

**Expected state.** Desktop's per-message action row matches what Web already built: Copy, thumbs feedback (persisted), Regenerate, Edit (for user messages), Share, Read Aloud, Branch conversation, and Report.

**Benchmark.** apps/web/features/chat/components/messages/MessageBubble.tsx (the in-house reference implementation); ChatGPT and Claude desktop apps both support message feedback and editing per research/chatgpt-web-desktop.md §4 and research/claude-web-desktop.md

**Evidence.** Read ActionBar.tsx in full (105 lines) — comments at lines 54-57 and 88-90 explicitly state desktop does not persist reactions and does not wire regenerate (regenerate is in fact wired via onRetry, feedback is not). Read MessageList.tsx lines 190-225 — only onRetry, onToolApprove, onToolReject, approvalTurnExpired, onResendApproval are passed to MessageBubble; no onFeedback. grep -n "editMessage(" apps/desktop/src --include="_.ts" --include="_.tsx" excluding the stores directory returned zero results. grep -n "onBranch|BranchNavigator|readAloud|onShare" across packages/ui/unified-chat/src/components/\*.tsx returned zero hits.

**Files.**

- `packages/ui/unified-chat/src/components/ActionBar.tsx:54-57,88-90`
- `packages/ui/unified-chat/src/components/MessageList.tsx:210-216`
- `apps/desktop/src/stores/chat/chatStore.ts:271,1360`

**Recommendation.** Wire onFeedback from DesktopShellV3 through ChatInterface -> MessageList -> MessageBubble -> ActionBar to the existing feedback-persistence backend (already used by web). Add an Edit affordance to ActionBar (or MessageBubble) that calls the already-implemented chatStore.editMessage. Port web's onReadAloud/onBranch/report patterns into the shared package behind optional props, matching the existing 'omit the prop, hide the control' pattern already used for onFeedback/onRetry.

#### RENDERING-005

**Response actions** — P1 · Chrome extension · `missing-capability`

_Screen/component:_ side panel chat transcript

**Current state.** The only response action rendered anywhere in the side panel is a whole-message Copy button, duplicated at two separate bubble-construction sites (lines 241-262 and 705-724). grep for regenerate/edit/share/readAloud/feedback/fork across the entire side-panel source tree returns zero hits.

**Expected state.** At minimum: Regenerate and thumbs feedback should exist in the side panel, matching the baseline response-action set present on every other surface in this product (web, mobile) and on both benchmark products' Chrome extensions.

**Benchmark.** ChatGPT for Chrome and Claude in Chrome both expose response actions beyond copy in their side panels, per shots-chatgpt-web-macos.md Part 3 (task overflow menu, feedback icons) and shots-claude-web.md (Claude in Chrome settings implying a full parity feature set with the main app)

**Evidence.** Read bubbles.ts in full for both bubble-construction code paths (lines 1-262 and the second builder around 677-729). grep -n "onRegenerate|Regenerat|onEdit|onShare|handleShare|onReadAloud|onFeedback|thumbsUp|thumbsDown|onFork" apps/extension/src/features/side-panel/\*.ts returned zero matches outside the icon-import list and a single unrelated 'edit' substring match on a tool-icon heuristic (line 275, `n.includes('edit')` for choosing a file-edit icon, not a response action).

**Files.**

- `apps/extension/src/features/side-panel/bubbles.ts:241-262,705-724`

**Recommendation.** Add a Regenerate button that resends the same request through the existing side-panel send path, and a thumbs up/down pair persisted through the same feedback endpoint web/mobile already call. Both can reuse bubbles.ts's existing copy-button pattern (icon + click handler + brief 'done' state) rather than introducing new UI primitives.

#### RENDERING-006

**Code execution output rendering** — P1 · Desktop (Tauri) · `broken-workflow`

_Screen/component:_ chat transcript

**Current state.** Web renders code-execution stdout, stderr (visually distinct), inline plot images, and a non-zero exit-code line via CodeExecutionBlock.tsx. Desktop's shared package has MessageGeneratedFiles.tsx, which tracks a running/pending state for generated FILES only (hasRunningExecutionTool, lines 126-138) but contains no stdout/stderr rendering anywhere (grep confirmed zero hits for either string in the file).

**Expected state.** A code_execution turn that only prints text (no file produced) should show its console output on Desktop the same way it does on Web, not render nothing beyond the generic tool-call name.

**Benchmark.** apps/web/features/chat/components/messages/CodeExecutionBlock.tsx is the in-house reference; ChatGPT Code Interpreter and Claude's code execution tool both surface console output inline per research/cross-cutting-and-complaints.md §1

**Evidence.** Read MessageGeneratedFiles.tsx and CodeExecutionBlock.tsx in full. grep -n "stdout|stderr" packages/ui/unified-chat/src/components/MessageGeneratedFiles.tsx returned zero hits; grep -n "CodeExecutionBlock" packages/ui/unified-chat/src/components/MessageBubble.tsx also returned zero hits, confirming no equivalent component is imported into the desktop message renderer at all.

**Files.**

- `packages/ui/unified-chat/src/components/MessageGeneratedFiles.tsx:126-138`
- `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:1-131`

**Recommendation.** Port CodeExecutionBlock.tsx (or a shared version of it) into packages/ui/unified-chat and wire it into the desktop MessageBubble the same way it is wired into web's, keyed off the same isExecuting/result shape already used by the runtime.

#### RENDERING-003

**Markdown rendering — nested lists and table cell formatting** — P2 · Mobile · `partial-implementation`

_Screen/component:_ chat transcript (MessageBubble)

**Current state.** The unordered/ordered list regexes are anchored ^[-*]\s+ / ^(\d+)\.\s+ with no leading-whitespace tolerance, so an indented sub-item (e.g. ' - nested') matches none of the block branches and silently degrades to a plain paragraph, losing its bullet and indentation. Separately, the markdown-table renderer (parseTableRow + the table JSX at lines 402-467) renders each cell as the raw string `row[colIdx]` without passing it through renderInlineMarkdown, unlike every other text branch in the same file, so bold/links/inline-code inside a table cell render as literal markdown syntax characters instead of formatted text.

**Expected state.** Nested lists render as nested lists (matching CommonMark/GFM behavior); table cells run through the same inline-markdown formatter used for headers, list items, and paragraphs.

**Benchmark.** Web's own remark-gfm-based table+list rendering (packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx) is the in-house reference implementation this should match

**Evidence.** Read MessageContentRenderer.tsx in full. Traced ulMatch/olMatch regex definitions (lines 262, 307) — both anchored at line start with no \s\* prefix. Traced the table row-rendering JSX (lines 449-461) — `{row[colIdx] || ''}` is passed directly to <Text>, never through renderInlineMarkdown, in contrast to every sibling branch (headers line 204, list items 297/342, blockquotes 254, plain paragraphs 497) which all call renderInlineMarkdown.

**Files.**

- `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:262-263,307,356-371,449-461`

**Recommendation.** Extend the list-detection regex to tolerate leading whitespace and track indent depth for nesting; change the table cell render to `renderInlineMarkdown(row[colIdx] || '', ...)` matching the pattern already used everywhere else in the file. Both are localized, low-risk fixes to the existing hand-rolled parser, not a rewrite.

#### RENDERING-007

**File diff rendering** — P2 · Cross-surface · `missing-capability`

_Screen/component:_ chat transcript, tool-call result

**Current state.** The only rendering a file-edit tool's result ever gets inside a chat turn is a generic <pre>{result}</pre> JSON/text dump inside ToolCallCard's collapsed 'Response' section (packages/ui/unified-chat/src/components/ToolCallCard.tsx:333-342), identical treatment to any other tool's plain-text output. Desktop does have real diff viewers (EnhancedDiffViewer.tsx, GitDiffViewer.tsx) but they live in the separate Code/Git workspace views per audit/parity-2026-08-15/inventory/desktop-tauri.md, not the chat transcript, so a file edit surfaced inside an agentic chat turn has no path to either.

**Expected state.** A file-edit tool call inside the chat transcript renders a proper red/green line-diff view (added/removed lines, syntax-highlighted), not a raw text/JSON dump.

**Benchmark.** Claude Code's setup screen preview shows an inline 'Files Changed 3' diff card (research/shots-claude-web.md screen 169); Codex's PR/diff review UI is documented in research/chatgpt-web-desktop.md §3 with collapsible inline comments and inline/detached modes

**Evidence.** Read ToolCallCard.tsx (both the web adapter apps/web/features/chat/components/ToolCallCard.tsx and the canonical packages/ui/unified-chat/src/components/ToolCallCard.tsx) in full — the 'Response' section (lines 333-342 in the shared version) is a plain <pre> block for any string result, with no diff-aware branch. grep -rliE "filediff|file-diff" across apps/web/features/chat, apps/mobile/src/features/chat, packages/ui/unified-chat/src/components, apps/extension/src returned zero results.

**Files.**

- `packages/ui/unified-chat/src/components/ToolCallCard.tsx:333-342`
- `apps/desktop/src/features/editing/EnhancedDiffViewer.tsx`
- `apps/desktop/src/features/git/GitDiffViewer.tsx`

**Recommendation.** Detect file-edit-shaped tool results (old/new content or a unified-diff string in the parameters/result) in ToolCallCard, similar to the existing detectCodeBlock heuristic, and render through a shared lightweight diff component (reusing desktop's existing EnhancedDiffViewer logic where practical) instead of the generic <pre> dump.

#### RENDERING-008

**Citation / source card UX** — P2 · Cross-surface · `ux-gap`

_Screen/component:_ chat transcript, response citations

**Current state.** Web's InlineSourceTags renders every citation as a small pill in a trailing flex-wrap row after the message body, with only a native `title` attribute for extra detail — no popover, no favicon, no snippet beyond the tooltip, no pagination for multi-source claims, and no claim-adjacent positioning (always trailing the whole message, never after the specific sentence). Mobile's CitationChip is the same shape. The Chrome extension has no citation component at all (grep -rliE "citation|source.card" apps/extension/src returned zero files) — any citation in an extension response is whatever raw markdown link the model emitted.

**Expected state.** Claim-adjacent inline citation chips (positioned at the end of the sentence/bullet they support), a rich hover/click popover (publisher, headline, snippet, N/M pagination for multi-source chips), and a persistent 'Sources' list/panel, on every surface — matching web's own InteractiveCardBlock quality bar for structured rendering.

**Benchmark.** ChatGPT's citation chip + popover + Sources panel architecture, documented in detail in research/chatgpt-web-desktop.md §3 (aiuxplayground.com citations teardown, updated Jul 10 2026)

**Evidence.** Read InlineSourceTags.tsx and CitationChip.tsx in full (54 and 47 lines respectively) — both are single-row pill lists with a native title tooltip as the only extra-detail affordance. grep -rliE "citation|source.card|sourcecard" apps/extension/src/features/side-panel apps/extension/src returned zero results.

**Files.**

- `apps/web/features/chat/components/messages/InlineSourceTags.tsx:1-54`
- `apps/mobile/src/features/chat/components/CitationChip.tsx:1-47`

**Recommendation.** Add a rich hover/focus popover component (favicon, title, snippet, pagination) to the existing InlineSourceTags/CitationChip components on web/mobile; port the pill-plus-popover pattern to the extension side panel; consider repositioning citation markers claim-adjacent in the markdown pipeline rather than only trailing the message.

#### RENDERING-009

**Branch / fork conversation UI** — P2 · Cross-surface · `parity-gap`

_Screen/component:_ chat transcript, message action row

**Current state.** Web has a real branch switcher: onBranch prop, a BranchNavigator component rendered inline (lines 1062-1069), and a 'Branch conversation' item in the message overflow menu (lines 1977-1981). Desktop's shared MessageBubble, mobile's MessageBubble, and the extension's bubbles.ts have no equivalent — grep for onBranch/BranchNavigator/GitFork across all three returned zero hits.

**Expected state.** A user who edits an earlier message and creates an implicit branch on Desktop or Mobile should be able to see and switch branches the same way Web already allows.

**Benchmark.** Internal consistency — web's own implementation is the reference. Notably this already beats Claude's benchmark: research/claude-web-desktop.md documents Claude's own branching as fully invisible everywhere and an actively-requested open GitHub issue (#59029)

**Evidence.** grep -n "onBranch|GitFork|branchNavigation|BranchNavigator" apps/mobile/src/features/chat/components/MessageBubble.tsx apps/extension/src/features/side-panel/bubbles.ts packages/ui/unified-chat/src/components/MessageBubble.tsx returned zero results across all three files. Confirmed the feature is real and wired on web by reading MessageBubble.tsx lines 369-374 (prop definitions), 1062-1069 (BranchNavigator render), and 1977-1981 (menu item).

**Files.**

- `apps/web/features/chat/components/messages/MessageBubble.tsx:369-374,1062-1069,1977-1981`

**Recommendation.** Port the onBranch prop and BranchNavigator rendering into packages/ui/unified-chat's MessageBubble (covering Desktop), and add the equivalent affordance to mobile's MessageBubble and the extension's bubbles.ts, reusing whatever backend branch-storage web already calls.

#### RENDERING-010

**Rich message card detection architecture** — P2 · Web · `architecture-gap`

_Screen/component:_ chat transcript

**Current state.** Two independent mechanisms decide whether to render a rich card for the same message. InteractiveCardBlock.tsx uses a schema-versioned, backend-emitted InteractiveCard object (kind/body/fallback) looked up in a typed registry — cannot false-positive by construction. cards/index.tsx's detectCardType() is a completely separate regex heuristic that scans the raw markdown TEXT of the message for structural signals (headers matching /ingredients/i, 'vs' in a heading, 'step N' patterns, etc.) to decide whether to render a Recipe/Comparison/Steps/Calculation card, with no backend signal at all. Both run on every assistant message in MessageBubble.tsx (lines 1267-1274).

**Expected state.** One consistent mechanism for deciding when to render a structured card, ideally the schema-driven InteractiveCard approach extended to cover Recipe/Comparison/Steps/Calculation, rather than a second, less reliable heuristic layer.

**Benchmark.** n/a — internal architecture inconsistency, not a competitor gap

**Evidence.** Read InteractiveCardBlock.tsx (full file, 119 lines) and cards/index.tsx (full file, 107 lines). Confirmed detectCardType's regex-based detection (lines 26-77) and its own comment acknowledging the false-positive risk ('Detection is intentionally conservative'). Confirmed both paths execute for every message by reading MessageBubble.tsx around lines 1267-1274 where MessageFormatCard/detectCardType wraps the markdown output independently of the separate InteractiveCardBlock render for message.interactiveCards.

**Files.**

- `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:33-42`
- `apps/web/features/chat/components/cards/index.tsx:26-77`
- `apps/web/features/chat/components/messages/MessageBubble.tsx:1267-1274`

**Recommendation.** Migrate Recipe/Comparison/Steps/Calculation into the same InteractiveCard schema-versioned registry as clarify.v1/map-search.v1 (backend emits a typed card object) and retire the regex-based detectCardType heuristic, or at minimum gate detectCardType to only fire when no structured card was already emitted for the message, to avoid double-guessing.

#### RENDERING-011

**Structured interactive card coverage** — P3 · Web · `missing-capability`

_Screen/component:_ chat transcript

**Current state.** Only two InteractiveCard kinds have live producers: clarify.v1 and map-search.v1. itinerary.v1 is declared in the shared type registry with no producer (an explicit, honest non-implementation per the code's own comment). No weather/stocks/shopping/local-business/reservations/jobs card kind exists at all, in the registry or otherwise.

**Expected state.** Broader coverage of common rich-card categories as the product matures, built on the existing schema-versioned registry (the right foundation, per its honest-fallback design).

**Benchmark.** Weak/unverified for both benchmark products — research/cross-cutting-and-complaints.md marks ChatGPT's rich card support for weather/stocks/sports as UNVERIFIED and found no evidence Claude has any of these

**Evidence.** Read InteractiveCardBlock.tsx lines 33-42 including the inline comment about itinerary.v1 having no producer. grep -rliE "WeatherCard|StockCard|SportsCard|ShoppingCard|ProductCard|LocalBusinessCard|TravelCard|ReservationCard|JobCard|MapSearchCard" across apps/web, apps/mobile, apps/desktop, packages/ui, packages/platform returned only the two live kinds (MapSearchCard.tsx and its test) and build-artifact false positives.

**Files.**

- `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:33-42`

**Recommendation.** Not urgent given weak benchmark pressure. When prioritized, add producers behind the existing InteractiveCard registry pattern (already proven safe with clarify.v1/map-search.v1) rather than inventing a new mechanism.

#### RENDERING-012

**Native/interactive chart rendering** — P3 · Cross-surface · `missing-capability`

_Screen/component:_ chat transcript, code execution output

**Current state.** No interactive/native chart or graph component exists anywhere in the product. A generated chart (e.g. matplotlib output from code execution) only ever reaches the user as a static base64 PNG rendered via CodeExecutionBlock.tsx's image-output path (lines 112-122) — functional, but never an interactive/native chart type.

**Expected state.** At minimum an equivalent raster fallback everywhere (already the case); optionally a native interactive chart component for structured numeric data the model emits directly rather than only via a Python plotting library round-trip.

**Benchmark.** ChatGPT Code Interpreter's inline charts (matplotlib/pandas workflow), per research/cross-cutting-and-complaints.md §1

**Evidence.** grep -rln "recharts|Chart\b" apps/web/features/chat/components returned nothing, corroborating the same finding already recorded in audit/parity-2026-08-15/inventory/web-frontend.md §3.3 ('Gap, not a bug'). Confirmed the raster fallback exists and works by reading CodeExecutionBlock.tsx lines 112-122 (safeImages rendering).

**Files.**

- `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:112-122`

**Recommendation.** Low priority given the raster fallback already covers the common case gracefully. If pursued, add a native chart card driven by structured JSON the model can emit directly (bar/line/pie), reusing the InteractiveCard registry pattern rather than a bespoke component.

### Search & deep research

_6 gaps · source: `gaps/domain-search-research.json` · narrative: `gaps/domain-search-research.md`_

#### SEARCH-RESEARCH-001

**Deep Research — Anthropic/free-trial fallback path** — P1 · Backend · `partial-implementation` · prior art `CAP-045`

_Screen/component:_ Chat composer 'Research' toggle / ResearchPanel 'Report' tab

**Current state.** The multi-stage `runResearchLoop` (plan → search rounds → cited synthesis, persisted `research_reports` row, retry-with-carried-sources, `x_research_status`/`x_research_plan` progress events) only runs when `chatRequest.stream && researchMode && !processed.freeTrial && processed.provider.toLowerCase() !== 'anthropic'` (route.ts:314-316). Anthropic-backed conversations and free-trial users instead fall through to `applyResearchMode()` (request-processor.ts:1062-1071), which just prepends a research system prompt and forces the native Anthropic `web_search_20260209` tool on with `max_uses: 20` for one ordinary turn (request-processor.ts:1109-1118) — no plan, no phase events, no `research_reports` row. The route's own comment says this path exists because 'their raw streams are only normalized by buildStreamResponse,' but `tool-loop-anthropic.ts`'s own header comment documents that this normalization (`buildToolLoopStream` → `chunksToOpenAiSse`/`OpenAIWireAssembler`) was already GENERALIZED to cover Anthropic months ago and is the exact mechanism `research-loop.ts`'s own `runTurn()` calls today — the stated technical reason for excluding Anthropic no longer holds. Client-side, the composer's Research toggle (`modelSupportsResearch`, ChatComposerNew.tsx:732-733) is gated purely on model-catalog capability, not provider, so it renders and enables identically for an Anthropic model. Because the single-turn fallback never emits `x_research_status`/`x_research_plan`, `ResearchActivity` never mounts for that turn (no plan, no phase label, no Retry control), and the ResearchPanel 'Report' tab permanently shows 'No saved report yet' for any conversation that only ever used Anthropic/free-trial research turns, because `persistReport` is only invoked inside `runResearchLoop`.

**Expected state.** Selecting a Claude/Anthropic model and turning on 'Research' produces the same multi-stage, plan-visible, persisted-report experience as any other provider — matching Claude's own Research product (plan → multi-step search → cited report) and avoiding a mode that silently behaves differently depending on which model happens to be selected.

**Benchmark.** Claude web/desktop — Research mode (multi-step web_search + document reads → structured cited report, research-loop.md §8) and Anthropic's own 'Advanced Research'; ChatGPT Deep Research (chatgpt-web-desktop.md §2, 'Deep Research chip').

**Evidence.** Read route.ts:301-359 (gate + persistReport wiring), request-processor.ts:1062-1127 and 2231-2238 (single-turn fallback + researchMode flag), research-loop.ts in full (persistRun only called inside the loop), tool-loop-anthropic.ts:30-115 (comment documents the generalization that undermines the route.ts exclusion rationale — buildToolLoopStream already normalizes Anthropic to OpenAI-shaped SSE and is what research-loop.ts's own runTurn() calls). Confirmed ADAPTER_PROVIDERS has an 'anthropic' entry (adapter-providers.ts:84). Read ResearchPanel.tsx ReportTab (empty-state copy for no persisted report) and ChatComposerNew.tsx's modelSupportsResearch gate (no provider check). Read useChatStream.ts:1388-1461 confirming MessageResearchState is populated only from x_research_status/x_research_plan deltas, which the Anthropic path never emits.

**Files.**

- `apps/web/app/api/llm/v1/chat/completions/route.ts:301-318`
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1062-1071,1102-1127,2231-2238`
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop-anthropic.ts:30-160`
- `apps/web/features/chat/components/research/ResearchPanel.tsx:122-193`
- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:725-733,780-781,2814-2818`

**Recommendation.** Re-verify (with a live test) whether buildToolLoopStream's Anthropic normalization is now safe for the research loop's multi-turn shape; if so, drop the `provider.toLowerCase() !== 'anthropic'` exclusion and route Anthropic through runResearchLoop like every other provider. If a real remaining blocker exists (e.g. Anthropic's native web_search tool_use blocks don't cleanly round-trip through multiple loop turns), gate the composer's Research toggle on provider capability too, and give the single-turn fallback its own honestly-labeled affordance (e.g. 'web search' not 'Research') instead of silently reusing the Research toggle and control surface.

#### SEARCH-RESEARCH-002

**Deep Research progress/plan UI and persisted report retrieval** — P1 · Cross-surface · `integration-gap` · prior art `CAP-045`

_Screen/component:_ n/a — no equivalent to web's ResearchActivity/ResearchPanel exists on other surfaces

**Current state.** The Deep Research plan/progress SSE contract (`x_research_status`, `x_research_plan`) and the durable `GET /api/research/reports` read endpoint are consumed by exactly one client: the web app's `ResearchActivity`/`ResearchPanel`/`ResearchReportView` components. Desktop (Tauri, Cloud mode) gets closest — `cloudStreamDeltas.ts` actually parses `x_research_status` into a `research_status` event and a `.research` field on the message state (lines 501-534, 677) — but grep across `apps/desktop/src` finds zero components that read that field; the data is captured and then never rendered, so a Desktop Cloud user running 'Deep research' sees no plan, no phase label ('Searching the web (round 2)', 'Writing report'), and no source/report panel. Mobile has a 'Deep research' toggle (`AddToChatSheet.tsx:761-767`, labelled 'Multi-step research with cited sources') that sends `research: true`, but `toolCallAccumulator.ts` (the mobile SSE parser) has no `x_research_status`/`x_research_plan` handling at all — a mobile research run renders as an ordinary streamed answer with citation chips, no visible plan or phase. The Chrome extension has neither the toggle nor the parser. None of the three non-web surfaces ever call `GET /api/research/reports`, so a Deep Research report a user started on mobile or desktop is durably saved server-side but is only readable by opening the web app.

**Expected state.** A Deep Research run started from any authenticated surface shows equivalent progress (phase, plan, source/search counts) while running and is reachable as a saved report afterward from any surface — at minimum, Desktop Cloud (which already parses the events) should render them, and every surface should be able to open a previously-run report via `/api/research/reports`.

**Benchmark.** Claude Research and ChatGPT Deep Research are both available with consistent progress/report UI across web, desktop, and mobile (claude-web-desktop.md §8, chatgpt-web-desktop.md §2).

**Evidence.** Grepped `x_research_status|x_research_plan|research_reports|ResearchReport|researchMode` across apps/mobile/src and apps/extension/src — zero hits outside an unrelated `research: false` snapshot flag and UI label strings. Grepped `apps/desktop/src` for the same and found only `cloudStreamDeltas.ts` (parser, populates state) and Sidebar.tsx (nav label) — no consumer of the parsed `research`/`researchStatus` field anywhere else in the app. Grepped `research/reports` across apps/mobile, apps/desktop/src, apps/extension, apps/extension-vscode, apps/cli — zero callers; the only caller anywhere in the repo is `apps/web/features/chat/components/research/ResearchPanel.tsx`'s `ReportTab`.

**Files.**

- `apps/desktop/src/runtime/cloudStreamDeltas.ts:300,501-534,677`
- `apps/desktop/src/features/v3/DesktopShellV3.tsx (no research_status/x_research_plan consumer)`
- `apps/web/app/api/research/reports/route.ts:1-76`
- `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:127-136,761-767`
- `apps/mobile/src/features/chat/utils/toolCallAccumulator.ts`

**Recommendation.** Smallest slice: wire Desktop's already-parsed `research` state into a compact progress indicator (phase + counts) in the Cloud chat message view, since the data is already there. Then extend `GET /api/research/reports` calls to Desktop/Mobile so a finished report can be reopened from any surface, reusing the web `ResearchReportView`'s markdown-rendering approach.

#### SEARCH-RESEARCH-003

**Deep Research connected-data / connector integration** — P2 · Backend · `missing-capability` · prior art `CAP-045`

_Screen/component:_ n/a — research-loop.ts tool selection

**Current state.** `runResearchLoop` explicitly strips every client-supplied function tool except `url_fetch` before running gathering rounds (research-loop.ts:953-966, comment: 'No other function tool is executed by this loop, so none other is offered'). This means a user's connected connectors (Google Drive, Notion, Slack, custom MCP servers, etc.) — even read-only ones — are never available during a Deep Research run; the loop can only search the open web and fetch individual URLs, never search or read from a connected data source.

**Expected state.** Deep Research can optionally draw on the user's connected read-only data sources (Google Workspace, connectors) alongside web search, the way Claude's Research mode does, while still excluding write-capable tools for safety.

**Benchmark.** Claude Research — 'combines web search + connected data (Google Workspace, other connectors) into a multi-step, cited report' with official guidance to disable only write-capable MCP tools (claude-web-desktop.md §8).

**Evidence.** Read research-loop.ts:953-966, the `researchTools` filter that keeps only `isUrlFetchTool` entries from `processed.llmRequest.tools`. Cross-referenced against web-backend.md §4 (Tool runtime) confirming connector tools are otherwise available in the ordinary chat tool loop (`user-connector-tools.ts`), so this is a deliberate research-loop-specific narrowing, not a general connector-availability gap.

**Files.**

- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:953-966`

**Recommendation.** Extend the research-loop tool filter to also allow the user's read-only connector tools (using the existing `connector-tool-permissions.ts` allow/ask/deny verdicts to exclude anything not explicitly read-only or already denied), matching Claude's guidance of disabling only write-capable tools during Research.

#### SEARCH-RESEARCH-004

**Semantic/vector search across chats, memory, and project knowledge** — P2 · Backend · `architecture-gap`

_Screen/component:_ Global search (Cmd/Ctrl-K), Settings memory search, Projects knowledge files

**Current state.** Every search surface in the product is Postgres `ILIKE` substring matching: `GET/POST/DELETE /api/search/route.ts` (sessions/messages/projects/files, ordered only by `updated_at desc`) and `GET /api/memory/search/route.ts` (`content ilike $2` over `user_memories`, whose own comment reads 'Simple ILIKE text search - can be upgraded to vector similarity later'). A real, fully-implemented OpenAI-compatible embeddings gateway exists (`POST /api/llm/v1/embeddings/route.ts`, 306 lines, reserve/call/settle billing) but has zero internal callers anywhere in the repo — it is a public API surface only. No `vector` column type appears in any of the 119 SQL migrations under `apps/web/db/neon/`. Project 'knowledge files' are stuffed into every turn's prompt verbatim (`project-knowledge-extraction.ts:270`) rather than retrieved by similarity.

**Expected state.** A query that paraphrases past content (e.g. 'the trip I planned last month' when the actual chat said 'Lisbon itinerary') should still surface the relevant chat/memory — the implicit recall behavior ChatGPT's 'Reference chat history' and Claude's 'Search and reference chats' both rely on. Exact-substring ILIKE cannot do this.

**Benchmark.** ChatGPT memory — 'Reference chat history' implicit pattern recall (chatgpt-web-desktop.md §8); Claude iOS — 'Search and reference chats' toggle, 'Allow Claude to search for relevant details in past chats' (shots-claude-ios.md:412-414).

**Evidence.** Read search/route.ts (ILIKE queries at the cited lines, no ranking beyond updated_at), memory/search/route.ts (ILIKE + its own upgrade-later comment), embeddings/route.ts (confirmed real, billing-wired, but grepped for callers — none found outside its own tests), and grepped `vector` across every apps/web/db/neon/\*.sql migration — the only hit is an unrelated 'attack vector' comment in 0083_sso_connections_clerk_link.sql. Cross-checked against web-backend.md §13, which independently reaches the same conclusion.

**Files.**

- `apps/web/app/api/search/route.ts:186,221,249,281`
- `apps/web/app/api/memory/search/route.ts:37,43`
- `apps/web/app/api/llm/v1/embeddings/route.ts`
- `apps/web/db/neon/*.sql (no vector column type in any of 119 migrations)`

**Recommendation.** Add a pgvector column + index on `user_memories` (and optionally message content), backfill via the already-implemented `/api/llm/v1/embeddings` endpoint, and add a similarity-ranked fallback path to memory/search and global search when ILIKE returns few/no hits — the smallest slice that stops the working embeddings endpoint from being generation-only dead capacity.

#### SEARCH-RESEARCH-005

**Manual web-search activation in the Chrome extension side panel** — P2 · Chrome extension · `missing-capability`

_Screen/component:_ Side panel composer

**Current state.** The Chrome extension's side panel has no manual 'Search the web' toggle and no 'Deep research' entry point anywhere — grepped the whole `side_panel.ts` (10,933 lines) for search/web-search/Deep Research UI strings and toggle wiring: zero hits, and `managedChatHandler.ts`'s outbound request builder never sets a `research`/explicit web-search field (only a routing-classification `'research'` task-type enum value used for model routing, unrelated to the feature). Search results DO render when a model autonomously invokes the tool — `bubbles.ts` has a real 'agent activity' sources renderer (lines 389-428, 533-588) — but the user has no way to force a search, see a query before it runs, or request current-data results on demand; search only happens if the model decides to call it.

**Expected state.** A user can explicitly request a web search (or, at minimum, see that automatic search is available/active) from the extension composer, matching the manual-activation pattern present on web and mobile.

**Benchmark.** Claude in Chrome — standalone extension with the same capability set as claude.ai including web search (claude-code-chrome-ide.md §4.3); ChatGPT's composer Tools menu exposes an explicit 'Web search' entry (chatgpt-web-desktop.md §2).

**Evidence.** Grepped side_panel.ts for 'toggle'/'Toggle' combined with 'search'/'web' — zero matches. Grepped managedChatHandler.ts and freeTrialClient.ts for a 'research' boolean field distinct from the ROUTING_TASKS classification set — zero matches. Read bubbles.ts's `appendActivitySources` (source-list rendering exists for whatever the model already searched) confirming search results CAN render, just cannot be user-initiated.

**Files.**

- `apps/extension/src/side_panel.ts`
- `apps/extension/src/features/cloud-bridge/managedChatHandler.ts:20-46`
- `apps/extension/src/features/side-panel/bubbles.ts:389-428,533-588`

**Recommendation.** Add an explicit 'Search the web' toggle to the side panel composer (mirroring the existing agent-activity source rendering it can already display), wired to set `web_search: true` on the outbound managed-chat request the way the web composer's toggle does.

#### SEARCH-RESEARCH-006

**Image / current-data (weather, stocks, sports) search result types** — P3 · Backend · `missing-capability`

**Current state.** `WebSearchResultItem` (the platform `web_search` tool's result shape) carries only `{url, title, snippet, date}` — no image results and no structured current-data card types (weather/stock/sports). Grepped for `image_search`/`imageSearch`/`search_images` across `apps/web` and `packages` — zero hits.

**Expected state.** Not asserted as a hard requirement — the benchmark evidence itself is weak here (cross-cutting-and-complaints.md flags ChatGPT's own rich result cards as 'UNVERIFIED — treat as a gap requiring a first-party or hands-on check'). Flagged as a differentiation opportunity, not a confirmed parity gap: an image-results grid and lightweight current-data cards (weather/stock/sports) inside search-grounded answers would meaningfully raise perceived search quality if built.

**Benchmark.** ChatGPT web/desktop — rich cards for shopping/sports/weather/stocks/finance (chatgpt-web-desktop.md §3, itself marked UNVERIFIED in the source research).

**Evidence.** Read web-search-tool.ts's WebSearchResultItem interface (url/title/snippet/date only). Grepped repo-wide for any image-search or structured-card search result type — none found. Cross-checked the benchmark doc's own confidence level on this feature (explicitly flagged unverified for ChatGPT itself), so this is filed at low severity/low confidence rather than as a confirmed regression.

**Files.**

- `apps/web/lib/web-search/web-search-tool.ts:117-123`

**Recommendation.** Low priority. If pursued, extend the Perplexity Search API integration (which supports richer result types) to optionally request image results, and add a lightweight card renderer reusing the existing 'rich cards' framework (Calculation/Comparison/Recipe/Steps) already in `features/chat/components/cards/*`.

### Settings

_12 gaps · source: `gaps/domain-settings.json` · narrative: `gaps/domain-settings.md`_

#### SETTINGS-001

**Primary Settings entry point (collapsed sidebar rail)** — P1 · Web · `broken-workflow`

_Screen/component:_ Chat v3 shell — collapsed WebSidebar rail

**Current state.** RAIL_ITEMS defines a gear icon labeled 'Settings' for the collapsed sidebar. handleNavClick maps id 'settings' to view 'voice-settings' (WebSidebar.tsx:210), and WebShellV3's VIEW_ROUTES resolves 'voice-settings' to '/settings/voice' (WebShellV3.tsx:38) — a single narrow sub-page whose own content says 'Managed voice is not available.' Clicking the icon labeled Settings never calls openSettings() (the function used correctly everywhere else: ChatComposerNew.tsx, WebChatPage.tsx, WebAppShell.tsx, CloudCodePage.tsx) and never opens the real Settings modal with its 16 sections. Compounding this, SETTINGS_NAV_GROUPS_WEB (settings-nav.ts) does not include a 'voice' key at all, so /settings/voice is not reachable from the settings modal's own nav or its search — the miswired gear icon is the page's only in-app entry point besides typing the URL.

**Expected state.** A control labeled 'Settings' opens the full Settings surface (or at minimum its General section), matching every benchmark surface captured: ChatGPT web's gear → full settings modal (shots-chatgpt-web-macos.md), Claude web's Settings modal reachable from account row (shots-claude-web.md), Claude iOS's avatar → full Settings sheet (shots-claude-ios.md).

**Benchmark.** ChatGPT Web/macOS — Settings gear opens full settings modal (research/shots-chatgpt-web-macos.md:2.1); Claude Web — Settings modal (research/shots-claude-web.md, Settings section)

**Evidence.** Read WebSidebar.tsx: RAIL_ITEMS (line 119-125) includes {id:'settings', icon:Settings, title:'Settings'}; handleNavClick's viewMap (line 200-216) maps 'settings' -> 'voice-settings', never to openSettings(). Read WebShellV3.tsx: VIEW_ROUTES['voice-settings'] = '/settings/voice' (line 38). Grepped 'voice-settings' repo-wide: only these two files reference it. Grepped 'voice' in settings-nav.ts SETTINGS_NAV_GROUPS_WEB (lines 279-305): the key is absent. Grepped openSettings(' call sites: WebChatPage.tsx, WebAppShell.tsx, ChatComposerNew.tsx, CloudCodePage.tsx all call the real modal opener; WebSidebar.tsx does not.

**Files.**

- `apps/web/features/chat/v3/WebSidebar.tsx:119-125`
- `apps/web/features/chat/v3/WebSidebar.tsx:200-216`
- `apps/web/features/chat/v3/WebShellV3.tsx:30-41`
- `packages/ui/ui/src/settings-nav.ts:279-305`

**Recommendation.** Change WebSidebar's handleNavClick so id 'settings' calls the same openSettings('general') path already used by every other entry point in the app, instead of routing through onNavigateView('voice-settings'). Separately, either add 'voice' to SETTINGS_NAV_GROUPS_WEB so /settings/voice is reachable from the modal's own nav and search, or delete the dead VIEW_ROUTES/viewMap entries if Voice is meant to stay a URL-only page.

#### SETTINGS-002

**Per-conversation model routing (temperature, max tokens, task routing, favorite models, default provider)** — P2 · Desktop (Tauri) · `dead-code`

_Screen/component:_ n/a — no rendering surface exists

**Current state.** settingsStore.ts declares and implements setDefaultProvider, setTemperature, setMaxTokens, setTaskRouting, and setFavoriteModels as full store actions (with async persistence in setDefaultProvider's case) at lines 921-1010. A repo-wide grep for each name outside the store file and its own tests returns zero matches in apps/desktop/src — no component destructures, calls, or renders a control for any of them. 'temperature' and 'maxTokens' do not appear anywhere under apps/desktop/src/features/settings at all.

**Expected state.** Either a working Models & Keys settings surface exposing per-model temperature/max-tokens defaults, task-category routing, and a favorites list (the desktop nav already reserves a 'models-keys' section for this), or the dead actions removed from the store the same way the team already removed 'voice'/'chatFont' from web's GeneralSection.tsx and 'locationMetadata'/'improveModelTraining' from PrivacySection.tsx.

**Benchmark.** ChatGPT macOS — model/intelligence picker with per-tier routing (research/shots-chatgpt-web-macos.md:1.3); Codex macOS — 'Available reasoning efforts' + per-model behavior in Configuration (research/shots-codex-macos-settings.md:12)

**Evidence.** Read settingsStore.ts interface block (lines 239-244) and implementation block (lines 921-1010). Ran `grep -rn "\bsetTemperature\b"` (and the same for setDefaultProvider/setMaxTokens/setTaskRouting/setFavoriteModels) across apps/desktop/src excluding stores/settingsStore.ts and _.test._: 0 hits for each. Also grepped 'temperature' and 'maxTokens' specifically under apps/desktop/src/features/settings: 0 hits.

**Files.**

- `apps/desktop/src/stores/settingsStore.ts:239-244`
- `apps/desktop/src/stores/settingsStore.ts:921-1010`

**Recommendation.** Smallest slice: wire setTemperature/setMaxTokens into the existing Models & Keys tab as an 'Advanced' subsection (two number inputs), or delete the five actions and their state fields if per-task routing is not on the roadmap — a persisted setter nothing calls is exactly the settingsStore.ts:1252 setSendShortcut pattern this audit was asked to find more of.

#### SETTINGS-003

**Window/session-behavior settings (startup position, dock side, chat storage mode, feature flags, send-key shortcut)** — P2 · Desktop (Tauri) · `dead-code`

_Screen/component:_ n/a — no rendering surface exists

**Current state.** setStartupPosition, setDockOnStartup, setChatStorageMode, setFeature, and setSendShortcut (the audit brief's own seed example, confirmed independently: defined at line 1252, only self-referenced) are all fully implemented store actions with zero call sites anywhere in apps/desktop/src. sendShortcut IS read at hydration/persistence time (lines 1515-1518, 2336) so a stored 'mod-enter' value would actually change composer behavior — but nothing in the UI can ever set it to anything but the 'enter' default, because no Send shortcut control exists in General or anywhere else.

**Expected state.** A Send shortcut control in General (matching ChatGPT web's 'Send message or stop answering' keyboard-shortcut row and Codex macOS's 'Send shortcut — Enter/⌘+Enter' dropdown, both captured verbatim in the benchmark evidence), plus either real controls for startup position/dock side/chat storage mode or their removal.

**Benchmark.** Codex macOS — Settings > General > Composer > 'Send shortcut' dropdown (research/shots-codex-macos-settings.md:7, '092-...general-composer-notifications-popout.png'); ChatGPT web — Keyboard > 'Send message or stop answering' (research/shots-chatgpt-web-macos.md:2.17)

**Evidence.** Grepped setStartupPosition, setDockOnStartup, setChatStorageMode, setFeature, setSendShortcut across apps/desktop/src (excluding the store file and _.test._): 0 call sites for every one. Confirmed setSendShortcut specifically per the audit brief's own citation: defined settingsStore.ts:267 (type) and :1252 (implementation), read at :1515-1518 and :2336 for persistence/hydration, never called from any component.

**Files.**

- `apps/desktop/src/stores/settingsStore.ts:260-261`
- `apps/desktop/src/stores/settingsStore.ts:267`
- `apps/desktop/src/stores/settingsStore.ts:274`
- `apps/desktop/src/stores/settingsStore.ts:308`
- `apps/desktop/src/stores/settingsStore.ts:1192-1258`
- `apps/desktop/src/stores/settingsStore.ts:1378`

**Recommendation.** Add a two-option Send shortcut control (Enter / ⌘+Enter) to General — this is the one item in this group with a real, benchmark-matched user need and an already-working backing implementation; it needs only a UI row. Delete or defer the other four (startup position, dock side, chat storage mode, generic setFeature flag setter) until a caller exists.

#### SETTINGS-004

**Agent-task checkpointing and auto-resume-on-restart** — P2 · Desktop (Tauri) · `partial-implementation`

_Screen/component:_ Settings > Agents

**Current state.** executionPreferences.enableCheckpointing, checkpointInterval, and autoResumeOnRestart, plus their setters (setEnableCheckpointing, setCheckpointInterval, setAutoResumeOnRestart), are fully implemented in the store (lines 698-729) with real default values and persistence — a complete backend model for 'save agent-task progress periodically and resume it if the app restarts mid-task.' AgentsSettings.tsx (the only settings component that mounts under the 'agents' nav key) renders exactly two execution controls — Max Task Timeout and Timeout Warnings — plus the Auto-Approve toggle and CustomAgentsList. None of the three checkpointing fields, and none of their setters, are referenced anywhere in AgentsSettings.tsx or any other .tsx file outside the store.

**Expected state.** A visible 'Resume interrupted tasks' or 'Checkpoint agent progress' section in Agents settings, since the backend contract for it is already built and would be a genuine differentiator (neither ChatGPT nor Claude's captured settings trees expose an equivalent user-facing control — Claude's closest analog is the passive 'session limit / resets' banner shown inline in the transcript, per shots-claude-desktop.md Part 1).

**Benchmark.** n/a — this is an AGI-only backend capability with no UI; flagged because it is closer to shipped than most of this list (state, persistence, and defaults all exist) and only needs the render layer

**Evidence.** Read the full contents of AgentsSettings.tsx (122 lines): only maxTimeoutMinutes, enableTimeoutWarnings, and autoApproveTools are destructured from the store and rendered. Grepped setEnableCheckpointing/setCheckpointInterval/setAutoResumeOnRestart across apps/desktop/src outside settingsStore.ts and _.test._: 0 hits for each. Confirmed the store implementations exist and are non-trivial (settingsStore.ts:698-729).

**Files.**

- `apps/desktop/src/stores/settingsStore.ts:277-279`
- `apps/desktop/src/stores/settingsStore.ts:698-729`
- `apps/desktop/src/features/settings/AgentsSettings.tsx:1-122`

**Recommendation.** Add a 'Resume interrupted tasks' toggle plus an interval field to AgentsSettings.tsx, wired to the three already-implemented setters — no store or persistence work required, only the render layer.

#### SETTINGS-005

**Shared unified-chat settings store — inline visualizations, tool-access mode, and three notification toggles** — P2 · Shared packages · `dead-code`

_Screen/component:_ n/a — no rendering surface exists

**Current state.** This store is shared by web (and any other host that mounts the unified-chat package) and is not a stray leftover file — its profile/language/artifactsEnabled/codeExecutionEnabled/autoApproveMode fields all have live call sites elsewhere in the app. But seven of its fields form a fully dead sub-tree: inlineVisualizationsEnabled/toggleInlineViz, toolAccessMode/setToolAccessMode, notifyCompletions/toggleNotifyCompletions, notifyAgentUpdates/toggleNotifyAgentUpdates, notifyResearch/toggleNotifyResearch, memorySearchChats/toggleMemorySearchChats, and memoryGenerateFromHistory/toggleMemoryGenerateFromHistory. Grepped each field name and each setter/toggler name across the whole repo (excluding the store file itself and tests): zero hits for every one, on both the read side and the write side. Nothing renders these values and nothing changes them.

**Expected state.** toolAccessMode in particular maps directly to a real benchmark control both Claude Desktop/Web/iOS ship (Capabilities > 'Tool access mode' — Auto/On demand/Always available) and to the currently-thin web CapabilitiesSection (SETTINGS-006) — the state shape for the fix this audit would otherwise recommend already exists here, unused.

**Benchmark.** Claude Desktop/Web/iOS — Capabilities > Tool access mode radio (research/shots-claude-desktop.md:368, shots-claude-ios.md:26-27)

**Evidence.** Read the full 119-line file. Ran per-field grep across the repo excluding the store file and _.test._ for: inlineVisualizationsEnabled, toolAccessMode, notifyCompletions, notifyAgentUpdates, notifyResearch, memorySearchChats, memoryGenerateFromHistory (state reads) and toggleInlineViz, setToolAccessMode, toggleNotifyCompletions, toggleNotifyAgentUpdates, toggleNotifyResearch, toggleMemorySearchChats, toggleMemoryGenerateFromHistory (setters) — 0 hits for all 14 identifiers, in contrast to sibling fields in the same file (artifactsEnabled, codeExecutionEnabled, autoApproveMode, profile) which all have multiple live call sites.

**Files.**

- `packages/ui/unified-chat/src/stores/settingsStore.ts:14-62`
- `packages/ui/unified-chat/src/stores/settingsStore.ts:64-119`

**Recommendation.** Point the web CapabilitiesSection.tsx fix in SETTINGS-006 at this store's existing toolAccessMode/setToolAccessMode and inlineVisualizationsEnabled/toggleInlineViz rather than building new state — this closes SETTINGS-005 and half of SETTINGS-006 in one slice. Delete the three notify* and two memory* fields (or wire them into NotificationsSection.tsx/CapabilitiesSection.tsx) since a second, disconnected 'memory' and 'notifications' state shape living beside the real one is a duplication risk, not just dead code.

#### SETTINGS-006

**Capabilities settings breadth (Artifacts, Code execution, Network egress, Tool access mode)** — P2 · Web · `missing-capability`

_Screen/component:_ Settings > Capabilities

**Current state.** Web's CapabilitiesSection.tsx renders exactly three controls, all Memory-scoped: Memory, Generate from past chats, Allow memory generation from tool-assisted chats. There is no Artifacts on/off, no Code execution and file creation toggle, no network-egress control, and no tool-access-mode selector anywhere in the section. Desktop's CapabilitiesTab documents the same gap explicitly in its own source comment: 'Further capability controls (artifacts, code execution, network egress, domain allow list) consolidate here in the app-verified pass' — i.e. the team has already identified and staged this exact gap but not closed it.

**Expected state.** A Capabilities section with the same breadth as Claude's (Desktop/Web/iOS all three): Artifacts toggle, AI-powered artifacts, Inline visualizations, Code execution and file creation, Allow network egress, Tool access mode (Auto/On demand/Always available), and 'Switch models when a message is flagged.'

**Benchmark.** Claude Web — Settings > Capabilities (research/shots-claude-web.md is settings-adjacent; primary evidence in shots-claude-desktop.md:380-388, 'Capabilities → Artifacts & Execution'); Claude iOS — Settings > Capabilities (research/shots-claude-ios.md:26-27, four toggles + Tool access radio)

**Evidence.** Read the complete CapabilitiesSection.tsx (190 lines): only the 'Memory' h3 section and its three Switch rows exist; no other section is rendered. Read the code comment at apps/desktop/src/features/settings/tabs/Capabilities/index.tsx:24-29, which names the identical missing set (artifacts/code execution/network egress/domain allow list) as a known, staged-but-unfinished consolidation. Cross-referenced against SETTINGS-005: the artifactsEnabled/codeExecutionEnabled state this section would need already exists and is live-wired elsewhere in the composer (packages/ui/unified-chat/src/stores/settingsStore.ts), and toolAccessMode exists but is dead (SETTINGS-005) — so this is a routing/UI gap, not a from-scratch backend build.

**Files.**

- `apps/web/features/settings/sections/CapabilitiesSection.tsx:1-190`
- `apps/desktop/src/features/settings/tabs/Capabilities/index.tsx:24-29`

**Recommendation.** Add Artifacts, Code execution, and Tool access mode rows to CapabilitiesSection.tsx bound to the existing (currently orphaned, see SETTINGS-005) unified-chat store fields. Network egress can reuse the existing egressGuard.ts enforcement (apps/desktop/src/lib/egressGuard.ts) as the backend and just needs a settings-facing toggle and API round-trip on web.

#### SETTINGS-007

**Accent color and contrast controls** — P2 · Web · `parity-gap` · prior art `GAP-275`

_Screen/component:_ Settings > General (Appearance)

**Current state.** Web's GeneralSection.tsx offers only System/Light/Dark (THEME_OPTIONS, lines 27-31) — no accent color, no contrast slider. Mobile has a dedicated accent-color.tsx screen. Desktop has a materially richer theming system than either — ThemeSettings.tsx offers built-in light/dark theme swatches, full custom-theme creation with a live editor, import/export to file, plus separate dyslexic-font, UI-scale, and reduce-motion controls — but still no single-purpose 'Accent color' quick-picker matching mobile's or the benchmark's. Web is the weakest of the three surfaces on this specific axis.

**Expected state.** Accent color (and ideally contrast) available on web at parity with mobile, matching ChatGPT web's three-row Appearance/Contrast/Accent color group and Codex macOS's accent/background/foreground/contrast controls.

**Benchmark.** ChatGPT Web — Settings > General: Appearance / Contrast / Accent color (research/shots-chatgpt-web-macos.md:2.2); Codex macOS — Settings > Appearance: accent swatch + Contrast slider (research/shots-codex-macos-settings.md:9-10)

**Evidence.** Read GeneralSection.tsx THEME_OPTIONS (lines 27-31) and confirmed no accent/contrast control exists in the file. Confirmed apps/mobile/app/(app)/settings/accent-color.tsx exists and re-exports a real screen. Read ThemeSettings.tsx (464-620) and confirmed a full custom-theme editor with import/export exists on desktop but with no single 'Accent color' row equivalent to mobile's or ChatGPT's.

**Files.**

- `apps/web/features/settings/sections/GeneralSection.tsx:27-31`
- `apps/mobile/app/(app)/settings/accent-color.tsx`
- `apps/desktop/src/features/settings/ThemeSettings.tsx:464-620`

**Recommendation.** Already tracked as GAP-275 ('Web General lacks contrast and accent-color controls that mobile already ships'); this entry corroborates it independently from the settings-inventory pass — carry GAP-275 forward, no new ID needed.

#### SETTINGS-008

**Passkey / WebAuthn and SMS-based multi-factor authentication** — P2 · Web · `security-gap` · prior art `GAP-115`

_Screen/component:_ Settings > Security

**Current state.** SecuritySection.tsx explicitly and honestly discloses the gap in-product: 'Passkeys, security keys, SMS MFA, and trusted-device lists are not available in the current account contract. Authenticator app codes (TOTP) with recovery backup codes are the supported second factor.' TOTP-only is the real, current second-factor story across the product.

**Expected state.** Passkey/WebAuthn sign-in (industry-standard as of 2026) and/or SMS-based MFA as an alternative second factor, matching ChatGPT web's Security and login page (Password / Security keys & passkeys / Authenticator app / Text message / Advanced account security / Lockdown mode).

**Benchmark.** ChatGPT Web — Settings > Security and login (research/shots-chatgpt-web-macos.md:2.13, 'Password — Add', 'Security keys & passkeys — count 1', 'Text message' MFA)

**Evidence.** Read SecuritySection.tsx lines 132-150 verbatim — the disclosure is explicit in the rendered copy, not inferred. This is a genuinely honest UI (no fake 'Add passkey' button that goes nowhere), which is the right way to handle an unshipped capability, but the underlying capability gap is real.

**Files.**

- `apps/web/features/settings/sections/SecuritySection.tsx:132-150`

**Recommendation.** Already tracked as GAP-115 ('Passkey and multi-device controls are explicitly unavailable pending account contracts'); this entry corroborates it independently — carry GAP-115 forward, no new ID needed. Note for prioritization: the current TOTP-only implementation is honestly disclosed rather than faked, which is the correct interim state per this audit's 'do not invent APIs' rule — closing the gap means shipping real WebAuthn, not adding UI that claims it.

#### SETTINGS-010

**Settings panels shipped without a nav entry (recurring authoring pattern)** — P2 · Cross-surface · `architecture-gap`

_Screen/component:_ n/a — process finding across Settings

**Current state.** Four separate, in-code comments document a settings panel that was fully built, then shipped with no way to reach it, then later rescued by adding it to a nav/section map: (1) ComputerUseSettings — 'the real ComputerUseSettings panel, which was orphaned — unreachable from any nav' (Capabilities/index.tsx:26); (2) DotfileSettings/config.toml editor — 'Surfaces the real, previously-orphaned config editor' (Developer/index.tsx:22-23); (3) TwoFactorPanel — 'fully built ... but was only ever imported by features/settings/pages/UserSettings.tsx, which is not mounted by any route — making the whole security tab unreachable' (SecuritySection.tsx:4-9); (4) NotificationsSection's own predecessor — 'previously only reachable by bare URL' per its own header comment. Each was fixed individually. This audit independently found two more live instances of the exact same failure mode that have not yet been rescued: the Voice settings page (SETTINGS-001, reachable only by a miswired icon and a typed URL) and the whole cluster of dead settingsStore.ts actions (SETTINGS-002 through SETTINGS-005, which never got even an orphaned panel — the store action exists with no panel at all).

**Expected state.** A lint-level or test-level guard that fails CI when a settings component file exists under features/settings/{sections,tabs} but is not referenced by the corresponding nav map (SETTINGS_NAV / SETTINGS_NAV_GROUPS_WEB / the desktop SettingsPanel switch), the same way the VS Code extension already keeps SETTINGS_PANEL_SETTING_KEYS and its Zod schema in lock-step (per inventory/extension-vscode.md:176-181) with a test that fails on drift.

**Benchmark.** n/a — internal process finding, not a competitor feature

**Evidence.** Read all four cited comments verbatim in their source files. Cross-referenced against this audit's own independent findings (SETTINGS-001 through SETTINGS-005) to confirm the pattern is still actively recurring, not fully remediated by the four historical fixes.

**Files.**

- `apps/desktop/src/features/settings/tabs/Capabilities/index.tsx:24-29`
- `apps/desktop/src/features/settings/tabs/Developer/index.tsx:20-25`
- `apps/web/features/settings/sections/SecuritySection.tsx:1-18`
- `apps/web/features/settings/sections/NotificationsSection.tsx:1-17`

**Recommendation.** Add an automated check (mirroring the VS Code extension's config-key/schema lock-step test) that walks features/settings/sections/_.tsx (web) and features/settings/tabs/_/index.tsx (desktop), extracts the exported component name, and fails if it is not imported by WebSettingsModal.tsx / SettingsPanel.tsx respectively. This would have caught all six known instances (four historical, two found by this audit) at PR time instead of by manual audit.

#### SETTINGS-011

**Cowork/Dispatch settings breadth** — P2 · Desktop (Tauri) · `parity-gap` · prior art `GAP-006`

_Screen/component:_ Settings > Cowork

**Current state.** Desktop's Cowork settings tab renders a single control: the Dispatch enable/disable toggle plus explanatory copy ('Pairing is not enough to start work: Dispatch must also be enabled here').

**Expected state.** Claude Desktop's Cowork settings page ships five controls at this same nav depth: Dispatch [Beta] toggle, Cowork files storage path (+ Change), Trusted Cowork folders (+ Manage), 'Run new tasks in the cloud' toggle, and Global instructions (+ Edit) applying to all Cowork/agentic sessions.

**Benchmark.** Claude Desktop — Settings > Cowork (research/shots-claude-desktop.md:441-447, screen 153)

**Evidence.** Read the full Cowork tab component; grepped it for Global/Trusted/storage-path/cloud-execution controls — none present beyond the single Dispatch Switch.

**Files.**

- `apps/desktop/src/features/settings/tabs/Cowork/index.tsx`

**Recommendation.** Already tracked as GAP-006 ('Cowork Dispatch has an authenticated task lifecycle and authoritative settings ... Settings > Cowork (Dispatch, Cowork files, trusted folders, run-in-cloud, global instructions)'), rated P0 there because it bundles the task-lifecycle gap with the settings gap. This entry isolates the settings-surface slice specifically: adding the four missing rows (storage path, trusted folders, run-in-cloud, global instructions) to the existing Cowork tab is a small, independent piece of that larger item.

#### SETTINGS-009

**Notification preference granularity** — P3 · Chrome extension · `ux-gap`

_Screen/component:_ Options page — Permissions

**Current state.** The Chrome extension's Options page has exactly one notification control: a single 'Task notifications' checkbox ('Show a Chrome notification when a scheduled task fires'). There is no per-category breakdown and no channel selection.

**Expected state.** Given the extension only fires one real event type (scheduled-task completion) today, a single toggle is arguably correct-for-scope rather than under-built — flagged as a minor breadth gap only in case additional extension-originated notification types (side-panel task completion, connector errors) are added later without a category model to slot them into.

**Benchmark.** Claude iOS — Settings > Notifications: 6 independently toggleable categories (research/shots-claude-ios.md:382-392); ChatGPT Web — Settings > Notifications: 8 categories with Push/Email/Both per row (research/shots-chatgpt-web-macos.md:2.3)

**Evidence.** Read options.ts lines 979-1039 — the entire Permissions section is one h2 ('Permissions') and one checkbox row; no other notification-related control exists in the 1,715-line file (confirmed via the section-title greps used to map the file's structure).

**Files.**

- `apps/extension/src/options.ts:979-1039`

**Recommendation.** No action needed until a second extension-originated notification type ships; at that point, replace the single boolean with a small category list rather than adding a second unrelated checkbox to the same row.

#### SETTINGS-012

**Notification category breadth** — P3 · Web · `parity-gap` · prior art `GAP-119`

_Screen/component:_ Settings > Notifications

**Current state.** Web ships exactly three notification toggles (Browser 'Reply ready', Email 'Scheduled task finished', Mobile push 'Scheduled task finished'), each with a documented, real backend sender. The file's own comment explains that a prior 'Email'/'Mobile push'/'browserAgentDone' group of five toggles was deliberately deleted because none had a backend consumer — 'each persisted a preference that nothing ever read, so toggling them changed nothing.' Two categories were re-added only once their send paths shipped.

**Expected state.** This is deliberately narrower than the benchmark by design, and that design choice is correct — see 'What NOT to copy' in the accompanying report. The residual gap is real breadth (no equivalent of ChatGPT's Marketing/Personalized tips/Group chats/Usage categories or Claude's Research-complete/Code-permission-requests categories), not a quality problem.

**Benchmark.** ChatGPT Web — Settings > Notifications: 8 categories (research/shots-chatgpt-web-macos.md:2.3); Claude iOS — Settings > Notifications: 6 categories (research/shots-claude-ios.md:382-392)

**Evidence.** Read NotificationsSection.tsx in full including its explanatory comments (lines 1-100) documenting the prior deletion and the two principled re-additions.

**Files.**

- `apps/web/features/settings/sections/NotificationsSection.tsx:1-100`

**Recommendation.** Already tracked as GAP-119 ('Web Notifications exposes only the channel with a real sender'). No new ID needed. When adding a new category, follow the file's own established rule: build the sender first, add the toggle second — never the reverse.

### Application shell, navigation & information architecture

_7 gaps · source: `gaps/domain-shell-nav-ia.json` · narrative: `gaps/domain-shell-nav-ia.md`_

#### SHELL-NAV-IA-001

**Route-level auth gating for /tasks** — P1 · Web · `broken-workflow`

_Screen/component:_ /tasks (Cloud work runs)

**Current state.** The Next.js proxy's isProtectedAppRoute matcher (apps/web/proxy.ts:145-152) lists exactly ['/chat(.*)', '/library(.*)', '/schedules(.*)', '/settings(.*)', '/billing(.*)', '/admin(.*)'] — '/tasks' is absent. The gate at proxy.ts:232-234 (`if (isProtectedAppRoute(request) && !hasBrowserSessionCookie(request)) return buildSignedOutRedirect(request)`) therefore never fires for /tasks. app/tasks/page.tsx wraps <TasksPage/> in <WebAppShell> with no metadata robots block beyond noindex and no auth check of its own, and WebAppShell.tsx has zero client-side auth-redirect logic (confirmed: no `!user`, `isAuthInitialized`, `SignedOut`, or `redirect(` calls anywhere in the file) — it relies entirely on the proxy for gating. The live route sweep (web-route-sweep-findings.md Finding 2) independently observed the resulting behavior: an unauthenticated visit to /tasks renders the complete signed-in chrome (New Chat / Search / Chat / Code / Projects / Library / Tasks / Schedules / Customize), a perpetual 'Loading account…' placeholder, and the 'Tasks — your Cloud work runs' heading with Active/All filters — i.e. a broken, stuck loading state rather than a sign-in prompt.

**Expected state.** Every authenticated product surface redirects a signed-out visitor to /login?redirectTo=<route> before any authenticated chrome renders, exactly as /chat, /chat/schedules, /settings, and /billing already do. /tasks should be added to isProtectedAppRoute (or covered by a broader pattern) so its behavior matches every sibling item in the same sidebar nav list it renders.

**Benchmark.** ChatGPT and Claude web both redirect signed-out visitors to a sign-in screen for any authenticated destination (Tasks/Scheduled equivalents included) rather than rendering the authenticated shell — per chatgpt-web-desktop.md and claude-web-desktop.md general auth-gating behavior; no competitor surface was observed rendering full authenticated chrome to a signed-out session.

**Evidence.** Read apps/web/proxy.ts in full (isProtectedAppRoute definition at :145-152, its only call site at :232-234, and the matcher config at :260-263 which does not further restrict scope). Read apps/web/app/tasks/page.tsx and apps/web/app/chat/schedules/page.tsx side by side — structurally identical (WebAppShell + feature page component), yet only /chat/schedules is covered because it also matches '/chat(.\*)'. Grepped WebAppShell.tsx and features/tasks/components/TasksPage.tsx for auth-redirect logic — zero hits in either. Cross-checked against the independent live-HTTP behavior already recorded in web-route-sweep-findings.md Finding 2, which observed the exact unauthenticated-full-chrome render this source-level read predicts. Confirmed the claim is source-verified, not just a route-sweep artifact, by tracing the proxy matcher directly rather than trusting either document alone.

**Files.**

- `apps/web/proxy.ts:145-152`
- `apps/web/proxy.ts:232-234`
- `apps/web/app/tasks/page.tsx:1-18`
- `apps/web/shared/components/layout/WebAppShell.tsx:1-120`

**Recommendation.** Add '/tasks(.\*)' to isProtectedAppRoute in apps/web/proxy.ts (one line). Add a regression test asserting every route rendered inside WebAppShell/WebChatPage's sidebar nav item list is present in isProtectedAppRoute, so a future new nav item can't silently ship ungated the same way.

#### SHELL-NAV-IA-003

**Skills navigation entry point** — P1 · Mobile · `dead-code` · prior art `GAP-001`

_Screen/component:_ Nav drawer — primary items

**Current state.** SkillsScreen.tsx is a complete, 655-line implementation (search, source badges, Cloud-mode gate, loading/error/empty states) and its route wrapper is registered at app/(app)/skills/index.tsx. The drawer's PRIMARY_ITEMS array (DrawerContent.tsx:62-100) — the only place a user navigates from — has no Skills row; '/(app)/skills' appears only as an unused member of the RoutePath type union (line 43). A later commit (1e858a7f1, an ancestor of the current HEAD) removed the row, and drawer-content.test.tsx:208-235 now explicitly asserts the Skills label is absent in Cloud mode. No other screen (Settings, Capabilities, Connectors) links to it either.

**Expected state.** A fully-built, cloud-gated Skills catalog screen should have at least one reachable entry point, matching ChatGPT iOS (Skills reachable from the sidebar drawer per shots-chatgpt-ios-shell-settings.md) and matching this repo's own web/desktop surfaces, which do expose Skills from Settings → Customize.

**Benchmark.** ChatGPT iOS sidebar drawer includes Skills as a direct destination (shots-chatgpt-ios-shell-settings.md, screen 072); Claude iOS reaches Skills indirectly via Capabilities/Directory but that destination is at least reachable, unlike this repo's mobile Skills screen which is orphaned.

**Evidence.** Read DrawerContent.tsx PRIMARY_ITEMS array in full — five entries (chats, projects, library, schedules, remote), no skills. Read SkillsScreen.tsx to confirm it is not a stub (real query/search/empty-state logic). Grepped the whole apps/mobile tree for '/(app)/skills' — two hits total, both non-navigational (the type union member and the route file's own registration). Cross-referenced audit/parity-2026-08-15/gaps/done-claim-verification.md (id GAP-001), which independently reached REGRESSED with the same file:line evidence, confirming the removal is real and post-dates the row's original 'Done' status.

**Files.**

- `apps/mobile/src/features/drawer/components/DrawerContent.tsx:37-100`
- `apps/mobile/src/features/skills/SkillsScreen.tsx:1-655`
- `apps/mobile/app/(app)/skills/index.tsx:1-11`
- `apps/mobile/__tests__/drawer-content.test.tsx:208-235`

**Recommendation.** Restore a Skills row in DrawerContent.tsx's PRIMARY_ITEMS (mirroring how Settings → Capabilities already surfaces other Cloud-gated features), or if the founder decision that removed it was deliberate product scoping rather than an oversight, delete SkillsScreen.tsx and its route rather than leaving 655 lines of unreachable, tested code — per CLAUDE.md's 'finish what you start' rule, half-wired is worse than neither state.

#### SHELL-NAV-IA-004

**Desktop-to-Mobile pairing instructions naming** — P1 · Cross-surface · `broken-workflow` · prior art `GAP-210`

_Screen/component:_ Desktop Settings → Connections (QR pairing card) instructing the user where to go on Mobile

**Current state.** Desktop's QRPairingCard.tsx tells the user to open 'AGI Workforce → Desktop Companion' on their phone to complete pairing. No screen, drawer row, or settings row anywhere in apps/mobile is labeled 'Desktop Companion' — the literal string does not appear in any user-facing Mobile text (only in a code comment in services/companion.ts). The actual Mobile entry points for this exact feature are labeled 'Remote' (drawer row and screen header, DrawerContent.tsx:94-99 and companion/index.tsx:210-212) or 'Desktop control' (a second, separate entry point inside Settings → Capabilities, capabilities/index.tsx:234-236).

**Expected state.** Cross-surface pairing instructions must name the destination using the exact label the other surface actually shows, the way Codex macOS's pairing card correctly names 'Control this Mac' matching its own settings label (per shots-codex-macos-settings.md). A user following AGI Workforce's printed instructions today cannot find a menu item called 'Desktop Companion' anywhere on their phone.

**Benchmark.** Codex/ChatGPT macOS's device-pairing settings card names the exact destination the paired surface uses, per shots-codex-macos-settings.md; no naming drift was observed between the pairing instructions and the actual destination in any competitor capture reviewed.

**Evidence.** Read QRPairingCard.tsx:113-117 for the exact instruction copy. Grepped 'Desktop Companion' across the entire apps/mobile tree — zero user-facing matches. Read DrawerContent.tsx:94-99 and companion/index.tsx:210-212 to confirm the drawer/header label is 'Remote', and settings/capabilities/index.tsx:234-236 to confirm the separate Settings entry point is labeled 'Desktop control'. Cross-referenced done-claim-verification.md/.json (id GAP-210), which independently verified the identical mismatch while checking an unrelated claim, confirming two of the row's three copy assertions check out (Scan QR Code / Enter code manually) but the destination name does not.

**Files.**

- `apps/desktop/src/features/mobile-companion/QRPairingCard.tsx:113-117`
- `apps/mobile/src/features/drawer/components/DrawerContent.tsx:94-99`
- `apps/mobile/app/(app)/companion/index.tsx:210-212`
- `apps/mobile/src/features/settings/capabilities/index.tsx:234-236`

**Recommendation.** Change QRPairingCard.tsx's instruction text to name 'Remote' (the drawer/header label a user actually sees), and add a co-located test that fails if the two surfaces' strings diverge again — the class of bug a per-surface audit cannot catch on its own, since each surface's own tests only assert its own copy.

#### SHELL-NAV-IA-002

**Desktop Settings navigation naming** — P2 · Desktop (Tauri) · `ux-gap` · prior art `GAP-083`

_Screen/component:_ Settings sidebar — 'Connections' and 'Connectors' tabs

**Current state.** Desktop Settings registers two separately-labeled nav entries, 'Connections' (key 'connections', icon MonitorSmartphone, keywords mobile/phone/device/pairing/remote control/screen sharing) and 'Connectors' (key 'connectors', icon Plug, keywords mcp/integration), three items apart in the same flat list (Agents, Connections, Cowork, Connectors, AGI Code...). 'Connections' mounts MobileCompanionPanel — QR pairing so a phone can control this Mac. 'Connectors' mounts ConnectorGallery + ConnectorHealthDashboard — the MCP/OAuth integration catalog. Both tabs are real, correctly wired, and distinct in content; the defect is purely the near-homograph naming, which the audit's own done-claim-verification.md (GAP-083) independently discovered while investigating a different row: a claim that 'Connections' hosted MCP content turned out to describe 'Connectors' instead, showing the names are confusable even to someone reading the source.

**Expected state.** Two settings destinations serving unrelated purposes (device pairing vs. third-party integrations) should not share a name differing only in suffix. Rename one — e.g. 'Connections' → 'Device pairing' or 'Remote control', matching the mobile app's own 'Remote'/'Desktop control' vocabulary for the same feature (see SHELL-NAV-IA-004) — so 'Connectors' unambiguously means the MCP/integration catalog, matching how ChatGPT and Claude each use a single unambiguous term ('Plugins' / 'Connectors' respectively) for the integration catalog and a differently-named page ('Codex → Connections' in Codex macOS settings, per shots-codex-macos-settings.md) for device/session pairing.

**Benchmark.** Codex macOS Settings uses 'Connections' exclusively for 'Control this Mac' device pairing (shots-codex-macos-settings.md), with no adjacent, similarly-named integration-catalog tab; Claude Desktop separates the same two concepts into 'Cowork → Dispatch' (device pairing) and 'Customize → Connectors' (MCP catalog) — non-confusable names in both references.

**Evidence.** Read packages/ui/ui/src/settings-nav.ts:120-175 directly to confirm both entries' exact labels, icons, and list position. Read both tabs' index.tsx files in full to confirm each mounts genuinely different, real content (MobileCompanionPanel vs. ConnectorGallery/ConnectorHealthDashboard) rather than being a literal duplicate. Cross-referenced audit/parity-2026-08-15/gaps/done-claim-verification.md and .json (id GAP-083), which reached the identical conclusion independently while verifying an unrelated ui-gaps.csv claim, corroborating the finding from a second angle.

**Files.**

- `packages/ui/ui/src/settings-nav.ts:149-161`
- `apps/desktop/src/features/settings/tabs/Connections/index.tsx:1-38`
- `apps/desktop/src/features/settings/tabs/Connectors/index.tsx:1-64`

**Recommendation.** Rename the 'connections' settings-nav entry's label (single string change in settings-nav.ts) to a term that does not share a stem with 'Connectors' — e.g. 'Remote control' — and update apps/desktop/src/features/mobile-companion/QRPairingCard.tsx's own on-screen copy to match (see SHELL-NAV-IA-004, which found that copy also names the wrong destination on the Mobile side).

#### SHELL-NAV-IA-005

**Personal/Team workspace switcher** — P2 · Cross-surface · `parity-gap`

_Screen/component:_ Account/profile menu — Desktop AccountMenu, Mobile Settings

**Current state.** Web's account-menu dropdown mounts <WorkspaceMenuItems>, which lists 'Personal' plus every team the account belongs to (each with a checkmark for the active one) and calls a real switchWorkspace mutation on click (WorkspaceMenuItems.tsx:41-67) — a genuine multi-workspace switcher shared by the chat page and every secondary shell. Desktop's AccountMenu.tsx has no equivalent: its item list is Settings, Language, Privacy & Security, 'View all plans', 'BYOK & Local', 'Apps & Extensions', Help & Support, Log Out — no Workspace section, no organization list, no switch action. Desktop does have team-membership management (CloudTeamSection.tsx, 'Team and workspace membership, rendered inline' — add/remove members, change roles), but it operates on whichever single org context the account already resolves to; there is no picker to move between Personal and a Team the account belongs to. Grepping apps/mobile for the equivalent Clerk organization hooks found zero matches — Mobile has no workspace switcher either.

**Expected state.** A user who belongs to both a Personal account and one or more Team workspaces should be able to switch active workspace context from Desktop and Mobile the same way they can from Web, since Team membership itself is a real, shared product feature (billing, member management, and shared conversations all exist per web/desktop inventories) — not a Web-only concept.

**Benchmark.** Claude and ChatGPT both let a user switch between personal and organization/team context from every first-party surface (web, desktop, mobile) via their account-row dropdown — no research doc or screenshot teardown in this audit found a competitor surface with team support but no in-place switcher for it.

**Evidence.** Read WorkspaceMenuItems.tsx in full — confirmed a real Personal + per-workspace list, active-selection checkmark, and a switchWorkspace.mutate() call site, mounted into WebAppShell.tsx:379. Read AccountMenu.tsx's full menu-item array — no workspace/team entry present. Read CloudTeamSection.tsx's header comment and members-list/role logic — confirmed it manages membership within one implicit org context, not a picker across multiple. Grepped apps/desktop and apps/mobile for useOrganization/useOrganizationList/OrganizationSwitcher/switchWorkspace — present only in apps/web.

**Files.**

- `apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:1-77`
- `apps/web/shared/components/layout/WebAppShell.tsx:379`
- `apps/desktop/src/features/v3/AccountMenu.tsx`
- `apps/desktop/src/features/settings/cloud/CloudTeamSection.tsx:1-40`

**Recommendation.** Port a thin equivalent of WorkspaceMenuItems into Desktop's AccountMenu (the Clerk organization-overview data and switch mutation are already real API surfaces on the web backend that Desktop's cloud API client can call) and add the same Personal/Team picker to Mobile's Settings → Billing area, where plan context already lives.

#### SHELL-NAV-IA-006

**Account-footer consistency across the two parallel web shells** — P3 · Web · `ux-gap`

_Screen/component:_ Sidebar account footer — /tasks, /chat/library, /chat/projects, /chat/schedules vs. /chat

**Current state.** WebChatPage.tsx's account footer (the one rendered on the main /chat route) shows a dismissible 'Free plan — Upgrade' pill above the account row and an inline orange 'Upgrade' badge next to the account name for free-tier users (WebChatPage.tsx:3833-3866). WebAppShell.tsx — the second, lighter shell that renders /tasks, /chat/library, /chat/projects, and /chat/schedules — renders only the plain tier label with no upgrade nudge anywhere in its account footer (WebAppShell.tsx:311-368). A free-tier user who spends their session on Tasks or Library never sees the upgrade prompt their Chat session shows them.

**Expected state.** The upgrade nudge is a monetization-relevant, deliberately-designed piece of UI (per BillingSection.tsx's recent overage/paywall work referenced in git history) and should render consistently everywhere the account footer appears, not only on the page most likely already visited.

**Benchmark.** n/a — an internal cross-shell consistency defect, not a benchmark comparison; flagged because CLAUDE.md's shell/nav consistency bar applies within the product's own surfaces, not only against competitors.

**Evidence.** Read WebAppShell.tsx's sidebarFooterSlot-equivalent account section in full (lines 242-368) — no showFreeUpgrade equivalent, no Upgrade badge. Read WebChatPage.tsx:3820-3875 — confirmed the resolveChatAccountDisplay() call produces showFreeUpgrade and the JSX conditionally renders both the banner and the badge. This is the same two-shells duplication web-frontend.md §2.1 already documents as an intentional architectural split; this finding is the one behavioral inconsistency that split has produced.

**Files.**

- `apps/web/shared/components/layout/WebAppShell.tsx:242-368`
- `apps/web/features/chat/pages/WebChatPage.tsx:3820-3875`

**Recommendation.** Extract the free-plan nudge (banner + badge) into a small shared component both shells' footerSlot can render, keyed off the same resolveChatAccountDisplay()/showFreeUpgrade logic already used by WebChatPage.

#### SHELL-NAV-IA-007

**Page metadata / browser-tab identity for directory-style product surfaces** — P3 · Web · `frontend-gap`

_Screen/component:_ /skills, /connectors, /apps, /device-auth, /user

**Current state.** None of these five route files export a `metadata` object, so each renders the app-wide default `<title>AGI | One AI workspace across models and tools.</title>` instead of a page-specific title. /skills, /connectors, and /apps are exactly the kind of directory/catalog surface a competitor makes distinctly identifiable (Claude's Skill/Connector/Plugin directory modal and ChatGPT's Plugins marketplace both carry their own page identity) — a user with several of these open in browser tabs cannot tell them apart, and the pages are non-indexable-looking to search engines despite being public-reachable when signed out (per web-route-sweep-findings.md Finding 4, which first surfaced this at the HTTP layer).

**Expected state.** Every top-level product route should export a distinct `metadata.title`, matching the pattern already used correctly by /tasks, /chat/schedules, and dozens of other routes in the same app (e.g. app/tasks/page.tsx:6-10).

**Benchmark.** n/a — basic web-platform hygiene rather than a specific competitor feature; included because it directly affects the 'browser-tab identity' aspect of shell/navigation this domain covers, and because /skills, /connectors, and /apps are public-facing directory surfaces of exactly the kind competitors make indexable and identifiable.

**Evidence.** Grepped each of the five page.tsx files for `export const metadata` — zero matches in all five, confirming the route-sweep's HTTP-layer observation at the source level rather than trusting the sweep alone. Cross-checked /local/page.tsx, which the route sweep also flagged for an empty title — that one already has metadata.title set in current code, so it was correctly excluded from this finding as stale/already-fixed evidence rather than re-filed.

**Files.**

- `apps/web/app/skills/page.tsx`
- `apps/web/app/connectors/page.tsx`
- `apps/web/app/apps/page.tsx`
- `apps/web/app/device-auth/page.tsx`
- `apps/web/app/user/page.tsx`

**Recommendation.** Add a `metadata` export with a short, specific title to each of the five files (e.g. 'Skills', 'Connectors', 'Apps', 'Sign in with a code', 'Account') — a one-line change per file with no behavioral risk.

### Voice, image & video

_12 gaps · source: `gaps/domain-voice-media.json` · narrative: `gaps/domain-voice-media.md`_

#### VOICE-MEDIA-001

**Image and video generation in chat** — P0 · Desktop (Tauri) · `architecture-gap`

_Screen/component:_ Chat composer / message transcript (native Tauri shell)

**Current state.** CloudRuntime declares `supportsImageGeneration = true` and `supportsVideoGeneration = false` (CloudRuntime.ts:307,310), and implements a fully-built, correctly URL-resolving `generateCloudImage` function (cloudApi.ts:548-602, absolutizes the relative /api/files/{id} path with `new URL(rawUri, cloudOrigin)`). Neither the `supportsImageGeneration` flag nor `generateCloudImage` has a single consumer anywhere in `packages/ui/unified-chat` -- the shared composer that DesktopShellV3 actually mounts (confirmed live via native WDIO in known-flaws.md's DESKTOP-VOICE-CONVERSATIONS-UNWIRED-01 entry) has no image or video generation button, mode toggle, or handler at all (`grep` for onGenerateImage/onGenerateVideo/'Create image'/'Create video'/toolType 'image-generation'/'video-generation' across packages/ui/unified-chat/src returns nothing outside tests). The shared card components that WOULD render a result, ImageGenCard.tsx and VideoGenCard.tsx, are themselves imported by zero production files -- only by a test (MediaActionHonesty.test.tsx). Separately, a full parallel Rust implementation exists and is registered as a live LLM tool (media_generate_image/media_generate_video in core/agi/tools/mod.rs, executed by media_executor.rs, which really does call the same backend web routes with a bearer token) -- but its JS-side consumers (mediaGenerationStore.ts, editingStore.ts's leftover image/video actions, api/media.ts, and the normalizeInlineToolData/streamContentRuntime.ts tool-result normalization pipeline) are themselves dead: zero .tsx files import useMediaGenerationStore, and streamContentRuntime.ts (the only caller of normalizeInlineToolData) has zero production importers, only its own test. Even if any of this were wired up, apps/desktop/src-tauri/src/sys/commands/media.rs never absolutizes the relative video_url/image url it forwards from the web JSON response (no base_url join anywhere in media_generate_image/media_generate_video), so a rendered result would additionally hit the same class of bug as VOICE-MEDIA-002.

**Expected state.** A user on the native Tauri desktop app can trigger image and video generation from the live chat composer (a button/mode, or the LLM autonomously calling the registered tool) and see the result rendered inline in the transcript with working download/retry, matching what Web already does and what CloudRuntime's own supportsImageGeneration=true already promises the rest of the runtime abstraction.

**Benchmark.** ChatGPT desktop app and Claude Desktop both generate and display images inline in the native chat composer on every plan tier (chatgpt-web-desktop.md SS11; shots-claude-desktop.md); this is also the founder's explicit top release-risk item -- HANDOFF.md SS3 item 5: 'First make Max 15x image/video generation work end to end on Web, Mobile and both Desktop shells.'

**Evidence.** Read CloudRuntime.ts:294-342 for the full `supports*` flag list and confirmed generateCloudImage's absolutization logic directly. Grepped `supportsImageGeneration`/`supportsVideoGeneration`/`generateCloudImage(`/`onGenerateImage`/`onGenerateVideo`/`toolType.*image-generation`/`toolType.*video-generation` across packages/ui/unified-chat/src and apps/desktop/src -- all zero-hit outside declarations/tests. Grepped `<ImageGenCard`/`<VideoGenCard` across packages/ui/unified-chat/src -- only a test file. Grepped `useMediaGenerationStore` across apps/desktop/src -- only the store's own definition and its test. Grepped `streamContentRuntime` and `normalizeInlineToolData` across apps/desktop/src -- streamContentRuntime.ts has zero production importers (only its own test); chatToolUtils.ts's normalizeInlineToolData is called only by that dead file. Read media.rs's media_generate_image (242-330) and media_generate_video (338-489) in full -- neither ever joins the returned url/video_url against base_url before returning MediaImageResponse/MediaVideoResponse to JS. Read media_executor.rs:108-137 confirming the LLM tool-call path genuinely invokes the same Rust commands (so a model CAN trigger real, billed generation even though nothing displays the result).

**Files.**

- `apps/desktop/src/runtime/CloudRuntime.ts:304-310`
- `packages/ui/unified-chat/src/lib/runtime.ts:204,211`
- `packages/ui/unified-chat/src/components/ImageGenCard.tsx`
- `packages/ui/unified-chat/src/components/VideoGenCard.tsx`
- `apps/desktop/src/api/cloudApi.ts:548-602`
- `apps/desktop/src/stores/mediaGenerationStore.ts`
- `apps/desktop/src/api/media.ts`
- `apps/desktop/src-tauri/src/sys/commands/media.rs:242-330,338-489`
- `apps/desktop/src-tauri/src/core/agi/executors/media_executor.rs:108-137`
- `apps/desktop/src/lib/chatToolUtils.ts:210-278`
- `apps/desktop/src/lib/streamContentRuntime.ts:1-95`

**Recommendation.** Smallest end-to-end slice: add an image-generation entry point to packages/ui/unified-chat's composer (reuse the existing web-side pattern), gate it on `runtime.supportsImageGeneration`, call `CloudRuntime.generateCloudImage` (already correct), and mount `ImageGenCard` in the message renderer keyed off the tool result. Fix `media.rs`'s missing base_url join for both image and video before doing the same for video (or leave supportsVideoGeneration=false and remove the orphaned Rust video tool registration/store/normalization code until it is actually wired, per CLAUDE.md's 'finish what you start' rule).

#### VOICE-MEDIA-002

**Video generation delivery** — P0 · Mobile · `broken-workflow`

_Screen/component:_ Chat transcript — generated video card

**Current state.** The video status/reconciliation pipeline (rebuilt since the 2026-08-09 phase4-capability-audit) now returns `video_url: authenticatedMediaUrl(job.assetId)` on completion, i.e. the relative path `/api/files/{assetId}` (media-storage.ts:303, video-job-reconciliation-service.ts:79). Mobile's `generateVideo()` (videogen.ts:123-152) returns this string completely unmodified as `GeneratedVideo.videoUrl`, with no absolutization step anywhere in the call chain. `GeneratedVideo.tsx:40` passes it straight to `openExternalUrl(videoUrl)` (safeOpenURL.ts:67-79), whose `isAllowedExternalUrl` gate (safeOpenURL.ts:49-64) requires `new URL(input)` to parse with `protocol === 'https:'` and a hostname on an explicit allowlist. `new URL('/api/files/{uuid}')` throws immediately (a relative string has no base to resolve against), is caught, and `isAllowedExternalUrl` returns false; `openExternalUrl` then returns `false` with only a `__DEV__`-gated console.warn and NO user-facing error. The onPress handler discards the returned boolean (`void openExternalUrl(videoUrl)`), so in a production build the entire interaction is a silent no-op: every tap on 'Opens in browser' for every completed video does nothing, with zero error shown. This is the exact absolutization step Mobile's own sibling `resolveGeneratedImageUri` function (imagegen.ts:100-117) already implements correctly for images by validating the same /api/files/{uuid} shape and joining it against API_URL -- video was never given the equivalent function.

**Expected state.** A completed video generation on Mobile opens and plays (or, per the app's own honest design choice, opens successfully in the in-app browser) exactly as a completed image already renders, using an absolute, authenticated URL built the same way `resolveGeneratedImageUri` already builds one for images.

**Benchmark.** Both ChatGPT and Claude mobile apps reliably deliver generated media the user has already paid for; this is also the founder's explicit named release gate for Mobile specifically (docs/agent-context/HANDOFF.md SS3 item 5/6).

**Evidence.** Read videogen.ts:1-152 in full, confirming `video_url`/`videoUrl` is passed through with no transformation at any point (no `API_URL`, no `new URL`, no resolveGeneratedVideoUri-equivalent function exists in the file or its imports). Read GeneratedVideo.tsx:1-90 confirming the onPress handler discards openExternalUrl's return value. Read safeOpenURL.ts:49-80 confirming the strict https+allowlist gate and the try/catch-to-false behavior on an unparseable relative URL. Read media-storage.ts:296-303 (`authenticatedMediaUrl`) and video-job-reconciliation-service.ts:66-80 (`publicVideoJobStatus`) confirming the server now genuinely returns a bare relative path on completion. Cross-checked against imagegen.ts:100-117's `resolveGeneratedImageUri`, which validates the identical /api/files/{uuid} regex and correctly joins it with `API_URL` -- proving the fix pattern already exists in the same codebase and was simply never applied to the parallel video path.

**Files.**

- `apps/mobile/src/features/video/services/videogen.ts:123-152`
- `apps/mobile/src/features/chat/components/GeneratedVideo.tsx:29-46`
- `apps/mobile/lib/safeOpenURL.ts:49-79`
- `apps/mobile/src/features/image/services/imagegen.ts:100-117`
- `apps/web/lib/services/video-job-reconciliation-service.ts:66-80`
- `apps/web/lib/server/media-storage.ts:296-303`

**Recommendation.** Add a `resolveGeneratedVideoUri(path)` function to videogen.ts mirroring imagegen.ts's `resolveGeneratedImageUri` exactly (validate the /api/files/{uuid} shape, join against API_URL), call it wherever `status.video_url` is consumed before it reaches GeneratedVideo.tsx, and surface `openExternalUrl`'s boolean return value as a visible error toast on false so a future regression fails loudly instead of silently.

#### VOICE-MEDIA-003

**Video generation reliability for abandoned jobs** — P1 · Backend · `reliability-gap`

_Screen/component:_ n/a (server-side job reconciliation)

**Current state.** `reconcileVideoGenerationJob` (the function that downloads provider output, persists it to R2, and marks a job completed) is only ever invoked from inside `GET /api/media/video/status` (status/route.ts:356), i.e. only when a client is actively polling. `reconcileDueVideoGenerationJobs` (video-job-reconciliation-service.ts:735-760) — the sweep function whose name and `listDueVideoGenerationJobIds` dependency are clearly meant for a background cron — has zero production callers anywhere in apps/web/app/api; grep confirms it is imported only by its own test file. `vercel.json`'s cron list has no entry that calls it. Web's own client mitigates most of the practical risk with an auto-resume-on-page-load effect and an explicit 'Resume' button (WebChatPage.tsx:2575-2610), so a user who reloads or revisits the exact conversation recovers their video. A user who never returns to that conversation -- closes the tab and never reopens it, uninstalls, or switches devices before the 1-2 minute generation finishes -- has a job that will sit `queued`/`processing` in the database forever, fully billed, with the provider's own result eventually expiring unretrieved.

**Expected state.** A scheduled sweep (comparable to the existing `run-schedules` cron pattern already used elsewhere in this codebase) periodically calls `reconcileDueVideoGenerationJobs` so a video completes and lands in the user's Library even if they never revisit the triggering conversation.

**Benchmark.** ChatGPT and Claude both deliver completed generations to a durable location (Library / message history) independent of whether the originating client session is still open.

**Evidence.** Grepped `reconcileDueVideoGenerationJobs` across apps/web (excluding .next build output) -- only its own definition and its test import. Grepped `listDueVideoGenerationJobIds` the same way -- same result. Read vercel.json's cron entries (none reference video reconciliation). Read status/route.ts:321-407 confirming reconciliation is reachable only through the client-poll code path. Read WebChatPage.tsx:2575-2610 confirming the auto-resume/Resume-button mitigation exists and is real, which is why this is P1 (a real, working recovery path exists for the common case) rather than P0 (a billed result that can never, under any circumstance, reach the user).

**Files.**

- `apps/web/lib/services/video-job-reconciliation-service.ts:582-611,735-760`
- `apps/web/app/api/media/video/status/route.ts:321-407`
- `apps/web/features/chat/pages/WebChatPage.tsx:2575-2610`

**Recommendation.** Add a cron-triggered route (mirroring apps/web/app/api/cron/run-schedules/route.ts's pattern) that calls `reconcileDueVideoGenerationJobs` on an interval short enough to catch jobs before the provider's own result-retention window expires.

#### VOICE-MEDIA-004

**Full-duplex conversational voice** — P1 · Cross-surface · `missing-capability` · prior art `P2-003`

_Screen/component:_ n/a — capability absent as a class

**Current state.** Web offers only composer push-to-talk dictation, and its own settings page says so explicitly ('this is push-to-talk dictation, not a live voice conversation... Managed voice is not available' — settings/voice/page.tsx:38-62). Chrome offers the same class of feature via the browser's native SpeechRecognition API (side-panel/voice.ts:16-58) — dictation into the input field, nothing conversational. Desktop's composer has an equivalent browser-Speech-API dictation mic (verified live via WDIO per known-flaws.md's DESKTOP-VOICE-CONVERSATIONS-UNWIRED-01 entry) and nothing beyond it that is actually reachable (see VOICE-MEDIA-005 for the fully-built-but-unmounted native voice loop). Mobile is the one surface with a real spoken-conversation UI (app/(app)/voice.tsx), but it is strictly turn-based: on-device speech recognition produces a full utterance, that text is sent through the normal chat pipeline, and the reply is read back with system TTS — it cannot be interrupted mid-reply, does not listen while speaking, and has no camera/screen input.

**Expected state.** At least one surface offers a genuinely full-duplex, low-latency, interruptible spoken conversation — the user can start talking while the assistant is still replying and have it stop and listen, matching the headline voice experience of both benchmark products.

**Benchmark.** ChatGPT's GPT-Live (chatgpt-mobile.md SS4: 'genuinely listens and speaks simultaneously... can be interrupted mid-sentence, backchannels...') and Claude's Voice mode (claude-mobile.md SS5, with the caveat that Anthropic's own Help Center avoids the term 'full-duplex' and third-party sources disagree on whether Claude's architecture is turn-based or duplex — treat Claude's exact architecture as unconfirmed, but its cross-surface reach across web/desktop/mobile is confirmed).

**Evidence.** Read settings/voice/page.tsx in full. Grepped VoiceSettings.tsx for any live-conversation control beyond dictation/wake-word/barge-in/persona (none render an actual conversation UI). Read app/(app)/voice.tsx confirming it calls useChatStore().sendMessage — the same pipeline as text chat — and is turn-based (waits for a full utterance, then a full reply, then reads it) rather than streaming/interruptible. Read side-panel/voice.ts:16-58 confirming it is a plain browser SpeechRecognition-to-textbox binding.

**Files.**

- `apps/web/app/settings/voice/page.tsx:38-62`
- `apps/desktop/src/features/settings/VoiceSettings.tsx`
- `apps/mobile/app/(app)/voice.tsx`
- `apps/extension/src/features/side-panel/voice.ts:16-58`

**Recommendation.** Not immediately actionable as a single slice — this is a genuine new product surface, correctly deferred per P2-003's own framing ('treat full-duplex voice... as a separate product program after the core task engine is reliable'). Filed here to keep the cross-surface capability gap visible in this domain's aggregate rather than only in a strategic doc without file:line detail.

#### VOICE-MEDIA-005

**Composer-integrated voice conversation (orb overlay, listen→transcribe→LLM→speak)** — P1 · Desktop (Tauri) · `dead-code` · prior art `DESKTOP-VOICE-CONVERSATIONS-UNWIRED-01`

_Screen/component:_ Voice mode (never rendered)

**Current state.** VoiceMode.tsx is a genuinely complete full-screen voice-conversation UI (orb, spacebar/tap push-to-talk, transcript, turn history, phase animation) backed by a real `useVoiceModeStore` listen→transcribe→LLM→speak loop, but has zero live render calls anywhere in the app (only its own file and a test reference it). Even if mounted, it would always fail: `stopListeningAndProcess` hardcodes the transcription provider to `local_whisper`, which is an optional Cargo feature (`whisper-rs`) excluded from every shipped build's default feature set (`default = ["shell", "updater", "billing", "vad"]`, Cargo.toml:301) and never enabled by any release workflow — every shipped build would error with 'Local Whisper support not compiled' the instant a user tried it. `useTTS()` (useTTS.ts:59), the hook that would speak an assistant reply aloud, likewise has zero callers outside its own definition — the underlying SystemTts (macOS `say`) works today with no setup at all, but nothing in the live MessageBubble/ChatInterface ever calls it, so the assistant never speaks a reply through any path on Desktop.

**Expected state.** Desktop's already-built voice-conversation UI is mounted behind a real, working transcription backend (managed cloud or BYOK Whisper, per the CLAUDE.md Local/BYOK/Cloud trust-boundary rule — not silently defaulting a Local session to either), and completed assistant replies can at minimum be read aloud via the already-working SystemTts.

**Benchmark.** Claude Desktop and ChatGPT desktop both let a user speak to and hear back from the assistant natively in the app (claude-web-desktop.md SS voice rows; chatgpt-web-desktop.md SS11).

**Evidence.** This finding is independently re-confirmed, in far greater depth than reproduced here, in docs/agent-context/known-flaws.md:3185 under DESKTOP-VOICE-CONVERSATIONS-UNWIRED-01 (High, Open), including a live native WDIO run against the real binary that separately confirmed the browser-native dictation mic (a simpler, different mechanism) IS reachable and real. Cross-checked Cargo.toml:301,318 confirming local-whisper is not in the default feature set and grepped every CI/build workflow for it — only a clippy-lint-only CI lane enables it, never a release build.

**Files.**

- `apps/desktop/src/features/voice/VoiceMode.tsx`
- `apps/desktop/src/stores/settings/voice.ts`
- `apps/desktop/src-tauri/src/features/speech/{local_stt,tts,local_tts,barge_in,vad}.rs`
- `apps/desktop/src-tauri/Cargo.toml:301,318`
- `apps/desktop/src/hooks/useTTS.ts:59`

**Recommendation.** Escalation, not a quick fix, per the known-flaws entry's own assessment: (1) decide and build a non-Local-mode-violating transcription backend for VoiceMode before mounting it (local-whisper as a real, shipped Cargo feature is the trust-boundary-safe option, but is a real native-linkage/binary-size change); (2) as a smaller, immediately shippable increment, wire the already-working SystemTts 'Read aloud' into MessageBubble/ChatInterface — no feature flag, no trust-boundary crossing, and it closes the sibling WEB-VOICE-OUTPUT-01 gap's Desktop equivalent.

#### VOICE-MEDIA-006

**EU AI Act Article 50(2) disclosure accuracy** — P1 · Mobile · `security-gap`

_Screen/component:_ Legal — Article 50 disclosure

**Current state.** Mobile's Article 50 legal screen states: 'every AI-generated text, audio, image or video you export is marked with a C2PA-style provenance claim and an HTML <meta name="agi:ai-generated"> tag so downstream tools can detect it as machine-generated.' The Web module that implements this marking says, in its own top-of-file doc comment: 'Only the two web surfaces that actually produce synthetic artefacts are covered here: generated images and generated video. Streamed chat text is NOT marked on any surface and there is no web audio-generation route -- both are open gaps, not something this module quietly handles.' Two of the four media types the mobile legal copy claims are marked (text, audio) are therefore not marked anywhere in the product, and there is no audio-generation feature to mark in the first place. The same ai-act.ts file states the obligation has applied since 2026-08-02 and AGI has served EU users since 2026-06-27, both dates before this reading.

**Expected state.** Mobile's Article 50 disclosure accurately describes what is actually marked (images and video only) rather than claiming coverage for text and audio that does not exist, or the marking coverage is genuinely extended to match the claim.

**Benchmark.** n/a — this is a self-consistency/regulatory-accuracy gap, not a competitive-parity gap; correctness of a legal disclosure is a baseline requirement regardless of what ChatGPT or Claude do.

**Evidence.** Read article-50.tsx:55-80 for the exact user-facing legal claim. Read ai-act.ts:1-30 for the implementing module's own written scope statement, which directly contradicts the mobile copy on two of the four listed media types. Confirmed via the file's own dates that the obligation is live, not forward-looking.

**Files.**

- `apps/mobile/app/legal/article-50.tsx:66-72`
- `apps/web/lib/compliance/ai-act.ts:1-30`

**Recommendation.** Smallest fix: edit article-50.tsx:66-72 to name only image and video, matching what ai-act.ts actually implements, until (or unless) text-marking and an audio-generation feature with its own marking are built.

#### VOICE-MEDIA-007

**Wake Word Detection** — P2 · Desktop (Tauri) · `dead-code`

_Screen/component:_ Settings > Voice

**Current state.** Clicking 'Enable' under Wake Word Detection calls `voice_wake_enable`, which genuinely starts the native wake-word detector on the real microphone (`wake.start()`), and the button turns green, reading 'Listening.' The Rust command discards whatever the detector's start() call returns with `.map(|_| ())` (voice.rs:896), and no `emit("wake...")` call exists anywhere in the Rust tree, nor does any frontend code listen for one. Saying the configured wake phrase therefore does, and structurally can, nothing at all -- not an occasional bug, a permanently unreachable code path. Unlike the sibling System-wide Dictation control (see the markdown's correction section), this one is not gated behind a false capability flag; it is live and reachable in every shipped build.

**Expected state.** Either the detected-wake-word event is actually wired to a consumer (activating voice input hands-free, as the label promises), or the control is disabled/removed until that wiring exists, matching the honest-gating pattern already used correctly elsewhere on this same settings screen (System-wide Dictation).

**Benchmark.** n/a — no ChatGPT/Claude desktop equivalent found in this research pass to benchmark against; the defect is internal consistency (a control that visibly claims to work and does not), which CLAUDE.md's 'Critical Rules' section names directly: 'unexpected redirects... dead or duplicate controls... must be fixed immediately when reproducible.'

**Evidence.** Read voice.rs:885-897 confirming the discarded return value. Grepped `wake_word_detected`/`emit("wake` across the Rust tree -- zero matches. Read VoiceSettings.tsx:551-566 confirming the button's real, unconditional Enable/Listening state.

**Files.**

- `apps/desktop/src/features/settings/VoiceSettings.tsx:551-566`
- `apps/desktop/src-tauri/src/sys/commands/voice.rs:885-897`

**Recommendation.** Either wire the discarded mpsc::Receiver<WakeWordEvent> to an emit() call and a frontend listener that activates dictation, or gate the control behind a capability probe (mirroring system_dictation_available()'s pattern) until that wiring lands.

#### VOICE-MEDIA-008

**True image editing (region/mask edit)** — P2 · Cross-surface · `missing-capability`

_Screen/component:_ Generated-image result card

**Current state.** The wire contract already defines `operation`/`source_image`/`mask_image` for real edit operations, and the server route has a code path for them (an OpenAI edits form at route.ts:355-378). No client on Web, Mobile, or Desktop ever sends them -- ImageGenerationCard.tsx's own comment states this plainly: 'Region/mask editing is not scheduled and nothing in this client sends mask_image.' The only editing affordance today is 'describe a change,' which regenerates an entirely new image from a modified text prompt, with no pixel continuity guarantee beyond whatever the underlying model does on its own.

**Expected state.** A user can select a region of a generated image and edit only that region, preserving the rest of the image, using the contract's already-defined source_image/mask_image operation.

**Benchmark.** ChatGPT's Images 2.0 shipped an 'expanded image-editing viewer with Canvas and Focused modes' with a real selection tool for targeted edits, per a July 27-31 2026 release note (chatgpt-web-desktop.md SS2/SS11).

**Evidence.** Read managed-media.ts:81-121 for the contract fields. Read generate/route.ts:1033-1050 confirming a real server-side edit code path exists. Read ImageGenerationCard.tsx:556-567's own comment confirming zero client producers. Grepped `source_image`/`mask_image` across ts/tsx files repo-wide -- only the route, the contract, and this comment.

**Files.**

- `packages/contracts/cloud-contracts/src/managed-media.ts:81-121`
- `apps/web/app/api/media/image/generate/route.ts:1033-1050`
- `apps/web/features/chat/components/ImageGenerationCard.tsx:556-567`

**Recommendation.** Build a region-select tool in ImageGenerationCard (or the shared image-result component) that captures a mask and sends it through the already-built operation/source_image/mask_image path -- the server side of this slice is already done.

#### VOICE-MEDIA-009

**Managed audio transcription usage settlement** — P2 · Backend · `backend-gap` · prior art `GAP-P0-008`

_Screen/component:_ n/a (billing)

**Current state.** The route authenticates, CSRF-checks, rate-limits, validates and magic-byte-sniffs the audio, gates on managed-compute eligibility, and forwards to OpenAI Whisper -- but never reserves credits before the call, never settles actual usage/cost on success, never voids/refunds a failed reservation, and emits no UsageRecord. Re-verified directly against current code: no reserve/settle/refund/idempotency logic exists anywhere in the 315-line file.

**Expected state.** Every successful managed transcription produces exactly one settled usage record; retries do not double-charge; provider failures do not charge users beyond documented policy; plan limits and billing dashboards include transcription -- matching the reservation/settlement pattern already used by the sibling image-generation route.

**Benchmark.** n/a — internal billing-integrity gap, not a competitive-feature gap.

**Evidence.** Read the full 315-line route.ts. Grepped for reserve/settle/UsageRecord/credit/refund/void/idempot -- the only hit is an unrelated CSRF comment (line 72). This is a direct re-verification of GAP-P0-008 (docs/current/gap-audit-2026-08-08.md:327-352), still CONFIRMED open on the current commit.

**Files.**

- `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:68-315`

**Recommendation.** Apply the same reserve-before-call / settle-on-success / void-on-failure pattern already used by apps/web/app/api/media/image/generate/route.ts to this route, keyed on audio duration rather than image count.

#### VOICE-MEDIA-010

**Reference/source image input for video generation** — P2 · Shared packages · `missing-capability`

_Screen/component:_ Video generation composer

**Current state.** ManagedMediaVideoGenerationRequestSchema accepts only prompt/duration_secs/resolution/aspect_ratio/generate_audio/provider/model. There is no field for a reference/source/first-frame image, and no video-to-video, extend, or remix operation exists anywhere in the schema or any client.

**Expected state.** A user can supply a reference image (or an existing generated image) as a starting point for video generation, matching the image-to-video and extend/remix capabilities increasingly standard in the category.

**Benchmark.** Sora 2 inside ChatGPT supports remix/extend of existing clips (chatgpt-web-desktop.md SS11; cross-cutting-and-complaints.md SS2); Google's own Veo API supports reference-image input upstream of AGI's adapter.

**Evidence.** Read managed-media.ts:167-186 in full. Cross-referenced against phase4-capability-audit.md PP-19's own claim inventory, which independently confirms 'No surface anywhere claims video-to-video, extend, avatars, sound, music, podcasts, or speech-to-speech' -- i.e. this is honestly unclaimed scope, not a broken promise, but a widening competitive gap.

**Files.**

- `packages/contracts/cloud-contracts/src/managed-media.ts:167-186`

**Recommendation.** Extend the video-generation contract with an optional source_image field (mirroring the image contract's existing source_image shape) and pass it through to the providers that support it (Veo accepts a reference image upstream).

#### VOICE-MEDIA-011

**Image annotation before sending** — P3 · Cross-surface · `missing-capability`

_Screen/component:_ Image attach / camera capture

**Current state.** No surface has a draw/highlight/text annotation tool for an image before it is sent as chat input. Grepped `annotat` across apps/web/features/chat, apps/desktop/src/features, and apps/mobile/src/features -- zero product hits (only unrelated matches in a desktop drill-down component, a mobile generated-licenses file, and a companion pairing-risk disclosure component, none of which are image annotation).

**Expected state.** A user can mark up a screenshot or photo (draw a circle, add text, highlight a region) before sending it, so the model can be pointed at a specific part of a busy image.

**Benchmark.** Claude Desktop's screenshot capture flow includes real annotation (draw pen/shapes/text/color) both for the Browser preview pane and for staged composer images (shots-claude-desktop.md line 268).

**Evidence.** Grepped `annotat` case-insensitively across apps/web/features/chat, apps/desktop/src/features, and apps/mobile/src/features -- three hits, all unrelated to image markup.

**Recommendation.** Add a lightweight canvas-overlay annotation step (pen/shape/text) to the existing camera/screenshot capture dialogs before the image is attached, reusing whatever canvas primitives the existing image lightbox/zoom UI already has available.

#### VOICE-MEDIA-012

**voice_inject_text hardening** — P3 · Desktop (Tauri) · `security-gap` · prior art `DESKTOP-SYSTEM-DICTATION-UNWIRED-01`

_Screen/component:_ n/a (internal command surface)

**Current state.** voice_inject_text is a registered, invokable Tauri command whose own doc comment states it 'must not be wired into an automatic dictation flow' until target-pinning/secure-field-refusal/clipboard-transaction work lands (that work has not landed). Direct verification confirms it is currently NOT reachable from any automatic flow: the JS injectText action chain has zero callers outside its own definition, and the one path that could theoretically reach it (global-source dictation) is refused at admission because system_dictation_available() is a hardcoded false. This is not a live bug today, but the command remains a registered, callable surface with a documented-and-unaddressed unsafe precondition, invokable by any future code (or, in principle, any other IPC-capable caller) without the safety work ever being forced to land first.

**Expected state.** The unsafe command either does not exist until its safety precondition is met, or is itself gated behind the same compile-time-false capability check that already protects the dictation flow around it, so a future accidental wire-up cannot silently reintroduce the exact risk the doc comment warns about.

**Benchmark.** n/a — internal hardening recommendation, not a competitive gap.

**Evidence.** Read voice_global.rs:287-321 for the doc comment and implementation. Grepped `injectText`/`voice_inject_text`/`voiceInjectText` across apps/desktop/src and apps/desktop/src-tauri/src -- confirmed zero callers of the JS action beyond its own definition, and confirmed the Rust command has no internal (non-command) callers either. This entry documents and closes out the specific concern raised in this domain's own task brief, and matches the independent correction already recorded in docs/agent-context/known-flaws.md:505-512 (DESKTOP-SYSTEM-DICTATION-UNWIRED-01).

**Files.**

- `apps/desktop/src-tauri/src/sys/commands/voice_global.rs:287-321`
- `apps/desktop/src/api/voice.ts:436-441`
- `apps/desktop/src/stores/settings/voice.ts:744-751`

**Recommendation.** Gate voice_inject_text itself behind system_dictation_available() (return an error immediately if false, mirroring the coordinator's own admission check) so the command cannot be invoked at all until the deferred safety work lands, rather than relying on 'nothing currently calls it' as the only protection.
