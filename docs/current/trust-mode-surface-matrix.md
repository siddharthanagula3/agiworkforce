# Trust-Mode × Surface Matrix

Status: Current
Owner: Founder + platform lead
Last updated: 2026-06-20

The authoritative per-surface definition of which **trust modes** (Local / BYOK / Managed Cloud) and **model sources** each surface exposes, and which surfaces **share cloud chats**. Founder-stated 2026-06-20. This refines `source-of-truth.md` (Local / BYOK / Managed Cloud) into exact per-surface rules. When a surface's code disagrees with this table, the code is the bug.

Vocabulary:

- **Local** = on-device local LLMs; data never leaves the device.
- **BYOK** = user-owned provider API keys; requests go **directly to the user's provider**, never through AGI cloud; provider is labeled. (From AGI's trust view this is a _private_ path, not the AGI-cloud path.)
- **Managed Cloud / Subscription** = AGI-hosted access to API providers, metered against the user's AGI subscription. The only path that crosses into AGI cloud. (Private beta / waitlist until metering+billing controls proven — CLOUD-01.)

## The matrix

| Surface     | Local LLMs |      BYOK      | Managed Cloud (subscription) | Cloud chat sync                         |
| ----------- | :--------: | :------------: | :--------------------------: | --------------------------------------- |
| **Mobile**  |     ✅     | ❌ **no BYOK** |              ✅              | ✅ shared with web + desktop            |
| **Web**     |     ❌     |       ❌       |      ✅ **cloud only**       | ✅ shared with desktop + mobile         |
| **Desktop** |     ✅     |       ✅       |              ✅              | ✅ shared with web + mobile             |
| **CLI**     |     ✅     |       ✅       |  ✅ (subscription required)  | separate (coding sessions)              |
| **VS Code** |     ✅     |       ✅       |  ✅ (subscription required)  | separate (coding sessions)              |
| **Chrome**  |     ❌     |       ❌       |      ✅ **cloud only**       | ❌ **separate** (own chats, NOT synced) |

## Per-surface rules (exact)

- **Mobile** — two modes only: **Local** (on-device) and **Cloud** (subscription). **BYOK is NOT offered on mobile** (no direct provider-key entry). Cloud chats sync with web + desktop.
- **Web** — **Cloud only.** No local, no BYOK. Cloud chats sync with desktop + mobile.
- **Desktop** — exactly **two top-level modes**:
  - **Local mode** = local LLMs **and** BYOK (both are user-private; BYOK goes direct to the user's provider, not AGI cloud).
  - **Cloud mode** = API providers via the AGI subscription (managed).
  - Cloud chats sync with web + mobile.
- **CLI** — local-first coding agent. Model access via **subscription** (must be present to reach managed models), **BYOK**, and **local models**. Coding sessions are separate from the chat app's cloud history.
- **VS Code** — **same as CLI** (subscription + BYOK + local; coding sessions separate).
- **Chrome** — **Cloud only**, and its chats are **a separate store** — NOT connected to web/mobile/desktop conversations.

## Invariants to enforce (the "clean separation")

1. **Local never crosses to AGI cloud.** A Local-mode chat/file/tool result must never be routed to managed cloud or have its content/telemetry leave the device.
2. **BYOK is private and surface-scoped.** BYOK requests go direct to the user's provider with a visible provider label; BYOK is available **only on Desktop, CLI, VS Code** — and must be **absent on Mobile, Web, Chrome**.
3. **Managed Cloud is the only metered egress** and is gated by subscription/entitlement; it is the only path that writes to the shared cloud chat store.
4. **Cloud chat store is shared by Web + Desktop + Mobile** (one account, server-side conversation storage). **Chrome is isolated.** CLI/VS Code coding sessions are separate from the chat store.
5. **Local→BYOK / Local→Cloud transitions are explicit** (fork/continuation with context selection, secret scan, payload preview, consent, provider label) — never silent.

## Model env-gating (separate workstream)

Models that run standalone are selectable now. Models that **require a code-execution environment** must be **grayed out** in every model picker until the environment is built. The execution environment will be **E2B** (E2B for Startups credits granted 2026-06-15). Needs a `requiresEnvironment` capability flag in `packages/types/src/models.json` + picker gating. Not yet implemented.

## Open items / to verify against Claude (claude-code-guide research in flight)

- Exact subscription-vs-API-key (BYOK) auth switching and coexistence.
- One-account server-side conversation sync mechanics across web/desktop/mobile.
- Confirmation that coding-agent (CLI/VS Code) history is separate from the chat app — mirrors Claude Code vs claude.ai.
