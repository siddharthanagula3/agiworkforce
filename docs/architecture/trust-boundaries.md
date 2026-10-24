# Trust-Mode × Surface Matrix

Status: Current
Owner: Founder + platform lead
Last updated: 2026-10-23

The authoritative per-surface definition of which **trust modes** (Local / BYOK / Managed Cloud) and **model sources** each surface exposes, and which surfaces **share cloud chats**. Founder-stated 2026-06-20. This refines the Local / BYOK / Managed Cloud boundaries in `AGENTS.md` section 6 into exact per-surface rules. When a surface's code disagrees with this table, the code is the bug.

Vocabulary:

- **Local** = on-device local LLMs; data never leaves the device.
- **BYOK** = user-owned provider API keys; requests go **directly to the user's provider**, never through AGI cloud; provider is labeled. (From AGI's trust view this is a _private_ path, not the AGI-cloud path.)
- **Managed Cloud / Subscription** = AGI-hosted access to API providers,
  admitted through the user's canonical AGI entitlement. It is the only path
  that crosses into AGI Cloud. Managed Free is public alpha and enabled after
  sign-in (2026-06-27, CLOUD-01). Paid-only routes require an existing paid
  entitlement; new paid acquisition on Web remains waitlist/access-code gated
  (2026-09-21), while Mobile store in-app purchase has neither (2026-10-19). Metering and abuse controls keep pace with Free usage, and
  commercial controls gate paid launch. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is an
  incident-response kill-switch only.

## The matrix

This table is **policy**: which trust modes each surface is permitted to expose.
A check mark means allowed, not shipped.

Implementation status is generated from the harness catalog into
[`docs/generated/trust-mode-surface-matrix.md`](../generated/trust-mode-surface-matrix.md)
and will disagree with this table wherever a permitted mode is not finished yet.
The generated matrix still inventories retained and forthcoming implementations.
It does not make a retained Tauri profile a public Desktop capability or an
unpublished extension available to users.

| Surface     | Local LLMs |      BYOK      | Managed Cloud (subscription) | Cloud chat sync                                    |
| ----------- | :--------: | :------------: | :--------------------------: | -------------------------------------------------- |
| **Mobile**  |     ✅     | ❌ **no BYOK** |              ✅              | ✅ shared with web + desktop                       |
| **Web**     |     ❌     |       ❌       |      ✅ **cloud only**       | ✅ shared with desktop + mobile                    |
| **Desktop** |     ❌     |       ❌       |      ✅ **cloud only**       | ✅ shared with web + mobile                        |
| **CLI**     |     ✅     |       ✅       |  ✅ (subscription required)  | separate (coding sessions)                         |
| **VS Code** |     ✅     |       ✅       |  ✅ (subscription required)  | separate (coding sessions)                         |
| **Chrome**  |     ❌     |       ❌       |      ✅ **cloud only**       | ✅ eligible chats mirror to shared account history |

## Per-surface rules (exact)

- **Mobile**: two modes only: **Local** (on-device) and **Cloud** (subscription). **BYOK is NOT offered on mobile** (no direct provider-key entry). Cloud chats sync with web + desktop.
- **Web**: **Cloud only.** No local, no BYOK. Cloud chats sync with desktop + mobile.
- **Desktop**: **Cloud only.** The public Electron application loads the managed
  account surface and rejects local-inference commands. It accepts no provider
  key. Approved folders, computer use, and other device tools do not change the
  conversation's managed-cloud trust boundary. Cloud chats sync with web + mobile.
- **CLI**: local-first coding agent. Model access via **subscription** (must be present to reach managed models), **BYOK**, and **local models**. Coding sessions are separate from the chat app's cloud history.
- **VS Code**: **same as CLI** (subscription + BYOK + local; coding sessions separate).
- **Chrome**: **Cloud only.** `chrome.storage.local` remains authoritative, but a signed-in conversation automatically mirrors into the shared account store when every turn was inferred in Managed Cloud. It then appears in Web, Mobile Cloud, and Desktop. Unknown-provenance or any Local/BYOK turn permanently disqualifies that conversation.

## Invariants to enforce (the "clean separation")

1. **Local never crosses to AGI cloud.** A Local-mode chat/file/tool result must never be routed to managed cloud or have its content/telemetry leave the device.
2. **BYOK is private and surface-scoped.** BYOK requests go direct to the user's provider with a visible provider label; BYOK is available in the released **CLI**, is permitted for the unpublished **VS Code** extension, and must be absent on Mobile, Web, Desktop, and Chrome.
3. **Managed Cloud is the only metered egress** and is gated by subscription/entitlement; it is the only path that writes to the shared cloud chat store.
4. **Cloud chat store is shared by Web + Desktop + Mobile**, and provenance-eligible Chrome Managed Cloud chats automatically mirror into it. Chrome's local store remains authoritative; CLI/VS Code coding sessions are separate from the chat store.
5. **Local→BYOK / Local→Cloud transitions are explicit** (fork/continuation with context selection, secret scan, payload preview, consent, provider label), never silent.

## Model env-gating

Models that **require an execution environment** are grayed out in every model picker until that environment is available. A catalog entry declares it with `requiresEnvironment: 'e2b' | 'local-runtime'` (`packages/contracts/types/src/model-catalog.ts`), `evaluateModelEnvironment` decides selectability, and the web, mobile, VS Code and CLI pickers gate on it. No model in the catalog declares it today (`packages/contracts/types/src/__tests__/model-catalog.test.ts`), so nothing is grayed out yet. The `e2b` environment is the managed code-execution sandbox.

## Verified competitor topology informing this decision

`docs/research/cross-surface-continuity-2026-09-21.md` (verified 2026-09-21) found the separation this matrix requires in the leaders' products:

- ChatGPT keeps Cloud Work conversations synced across web, mobile and desktop while Local conversations stay on the computer.
- Claude's Cloud work follows the account across Web, Desktop, Mobile and the Chrome side panel, while local files, local connectors, browser use and computer use depend on the Desktop host, and memory is not shared with local computer sessions.
- Local coding work in ChatGPT Codex and Claude is steered from another client through a projection, not by copying local authority into the shared chat store.

AGI's exact product decision remains founder-owned and stricter where stated above: Web/Desktop Cloud/Mobile Cloud share the consumer Cloud store; eligible Chrome Managed Cloud conversations mirror into it automatically while Chrome remains locally authoritative; Local never syncs; CLI/VS Code share separate developer sessions.

Evidence:

- `docs/research/cross-surface-continuity-2026-09-21.md`
- `docs/research/chatgpt-claude-ecosystem-delta-2026-09-21.md`
- `docs/product/experience-contract.md`
