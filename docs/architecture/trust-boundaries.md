# Trust-Mode × Surface Matrix

Status: Current
Owner: Founder + platform lead
Last updated: 2026-08-13

The authoritative per-surface definition of which **trust modes** (Local / BYOK / Managed Cloud) and **model sources** each surface exposes, and which surfaces **share cloud chats**. Founder-stated 2026-06-20. This refines `source-of-truth.md` (Local / BYOK / Managed Cloud) into exact per-surface rules. When a surface's code disagrees with this table, the code is the bug.

Vocabulary:

- **Local** = on-device local LLMs; data never leaves the device.
- **BYOK** = user-owned provider API keys; requests go **directly to the user's provider**, never through AGI cloud; provider is labeled. (From AGI's trust view this is a _private_ path, not the AGI-cloud path.)
- **Managed Cloud / Subscription** = AGI-hosted access to API providers, metered against the user's AGI subscription. The only path that crosses into AGI cloud. (Public alpha, open by default since 2026-06-27, CLOUD-01; subscription/entitlement-gated, not waitlist-gated. Metering+billing controls keep pace but no longer gate access; `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is an incident-response kill-switch only.)

## The matrix

This table is **policy**: which trust modes each surface is permitted to expose.
A check mark means allowed, not shipped.

Implementation status is generated from the harness catalog into
[`docs/generated/trust-mode-surface-matrix.md`](../generated/trust-mode-surface-matrix.md)
and will disagree with this table wherever a permitted mode is not finished yet.
Five profiles disagree today, `desktop/local-chat`, `mobile/local-chat` and
`cli/local-chat` are `partial`, and `vscode/byok-chat` and `vscode/local-chat`
are `unwired`, while this table shows all five as permitted. Both are correct
answers to different questions, and neither should be edited to match the other.

| Surface     | Local LLMs |      BYOK      | Managed Cloud (subscription) | Cloud chat sync                                    |
| ----------- | :--------: | :------------: | :--------------------------: | -------------------------------------------------- |
| **Mobile**  |     ✅     | ❌ **no BYOK** |              ✅              | ✅ shared with web + desktop                       |
| **Web**     |     ❌     |       ❌       |      ✅ **cloud only**       | ✅ shared with desktop + mobile                    |
| **Desktop** |     ✅     |       ✅       |              ✅              | ✅ shared with web + mobile                        |
| **CLI**     |     ✅     |       ✅       |  ✅ (subscription required)  | separate (coding sessions)                         |
| **VS Code** |     ✅     |       ✅       |  ✅ (subscription required)  | separate (coding sessions)                         |
| **Chrome**  |     ❌     |       ❌       |      ✅ **cloud only**       | ✅ eligible chats mirror to shared account history |

## Per-surface rules (exact)

- **Mobile**: two modes only: **Local** (on-device) and **Cloud** (subscription). **BYOK is NOT offered on mobile** (no direct provider-key entry). Cloud chats sync with web + desktop.
- **Web**: **Cloud only.** No local, no BYOK. Cloud chats sync with desktop + mobile.
- **Desktop**: exactly **two top-level modes**:
  - **Local mode** = local LLMs **and** BYOK (both are user-private; BYOK goes direct to the user's provider, not AGI cloud).
  - **Cloud mode** = API providers via the AGI subscription (managed).
  - Cloud chats sync with web + mobile.
- **CLI**: local-first coding agent. Model access via **subscription** (must be present to reach managed models), **BYOK**, and **local models**. Coding sessions are separate from the chat app's cloud history.
- **VS Code**: **same as CLI** (subscription + BYOK + local; coding sessions separate).
- **Chrome**: **Cloud only.** `chrome.storage.local` remains authoritative, but a signed-in conversation automatically mirrors into the shared account store when every turn was inferred in Managed Cloud. It then appears in Web, Mobile Cloud, Tauri Cloud, and Electron Cloud. Unknown-provenance or any Local/BYOK turn permanently disqualifies that conversation.

## Invariants to enforce (the "clean separation")

1. **Local never crosses to AGI cloud.** A Local-mode chat/file/tool result must never be routed to managed cloud or have its content/telemetry leave the device.
2. **BYOK is private and surface-scoped.** BYOK requests go direct to the user's provider with a visible provider label; BYOK is available **only on Desktop, CLI, VS Code**, and must be **absent on Mobile, Web, Chrome**.
3. **Managed Cloud is the only metered egress** and is gated by subscription/entitlement; it is the only path that writes to the shared cloud chat store.
4. **Cloud chat store is shared by Web + Desktop + Mobile**, and provenance-eligible Chrome Managed Cloud chats automatically mirror into it. Chrome's local store remains authoritative; CLI/VS Code coding sessions are separate from the chat store.
5. **Local→BYOK / Local→Cloud transitions are explicit** (fork/continuation with context selection, secret scan, payload preview, consent, provider label), never silent.

## Model env-gating (separate workstream)

Models that run standalone are selectable now. Models that **require a code-execution environment** must be **grayed out** in every model picker until the environment is built. The execution environment will be **E2B** (E2B for Startups credits granted 2026-06-15). Needs a `requiresEnvironment` capability flag in `packages/contracts/types/src/models.json` + picker gating. Not yet implemented.

## Verified competitor topology informing this decision

The July 2026 live-product and official-documentation review confirmed the separation this matrix requires:

- Claude Chat cloud history, Claude Cowork runs, and Claude Code developer sessions are not one undifferentiated conversation store.
- Claude Code CLI and VS Code share local developer-session/configuration behavior; Remote Control projects that local session to web/mobile without converting it into normal Chat history.
- OpenAI Chat, desktop-local Work, cloud Work, Codex developer tasks, Remote projection, and browser adapters also retain different persistence/runtime authorities despite unified branding.
- Browser-side agents retain site/browser-task context and permissions rather than silently joining consumer chat history.

AGI's exact product decision remains founder-owned and stricter where stated above: Web/Desktop Cloud/Mobile Cloud share the consumer Cloud store; eligible Chrome Managed Cloud conversations mirror into it automatically while Chrome remains locally authoritative; Local never syncs; CLI/VS Code share separate developer sessions.

Evidence:

- `docs/research/competitor-capability-session-architecture-2026-07-15.md`
- `docs/product/experience-contract.md`
