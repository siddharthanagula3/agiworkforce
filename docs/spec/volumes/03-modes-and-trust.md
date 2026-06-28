# Volume 03 — Modes & Trust (Cloud/Local/Hybrid, Privacy)

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 3)
Authority: `docs/current/source-of-truth.md`, `docs/current/trust-mode-surface-matrix.md`, `packages/types/src/suite-contracts.ts`

## Philosophy & Cloud/Local stance

Trust is the product. The single most defensible asset AGI has is a **provably airtight, code-enforced trust boundary** (`docs/strategy/02` §4). Privacy here is not a setting buried in a menu — it is partitioned in code and guarded by contract tests. Any leak is existential, not cosmetic.

Three trust modes, each a distinct boundary that is never silently crossed:

- **Local** (`local_only` / `ProviderMode: Local`) — runs on-device or through a local host/runtime. Never silently routes chats, files, tools, or developer sessions to BYOK or managed cloud.
- **BYOK** (`byok` / `DirectByok`) — the user's own provider key, used directly; payloads go to that provider account. Local→BYOK is an explicit fork.
- **Managed Cloud** (`cloud_managed` / `ManagedGateway` or `ManagedNative`) — AGI-managed provider access or hosted compute. Public alpha, open by default (founder decision 2026-06-27). Still a distinct boundary: Local/BYOK are never silently routed into it.

**Hybrid** is not a fourth mode — it is _consented_ routing across the three, where every boundary crossing is explicit, labeled, and recorded. The original Local thread remains Local forever; a BYOK continuation is a new reviewed branch, not a hidden mode flip.

## Binding rules

1. **Trust boundaries are absolute** (Operating Law 1). A silent cross is a P0. Any networking change must pass the trust-boundary contract tests.
2. **Local→BYOK is an explicit fork ceremony:** context selection, secret scan, payload preview, visible provider label, and user consent — with the Local original preserved.
3. **Privacy labels and copy come from `suite-contracts.ts`** (`PRIVACY_MODE_DISPLAY`, `PROVIDER_MODE_DISPLAY`, `CHAT_EXECUTION_MODE_DISPLAY`). Never hardcode new wording.
4. **`assertSurfaceCanSyncChats` governs sync** (`suite-contracts.ts` line ~185). Only `SyncedAppSurface` (`web`/`desktop`/`mobile`) syncs app chats; `DeveloperSessionSurface` (`cli`/`vscode`/`chrome`) does not.
5. **Web/Mobile v1 expose no BYOK.** Do not add a BYOK path to those surfaces (`source-of-truth.md`).
6. **Every message, session, and artifact carries `PrivacyMode` + provider label.** Generated files carry a trust-boundary-validated manifest (Vol 14, Vol 39).
7. **`ProviderMode` ≠ `PrivacyMode`:** a `ManagedNative` provider is still `managed`; `DirectByok` is always `byok`. Encode both; do not collapse them.

## Repository map

- `packages/types/src/suite-contracts.ts` — the source of truth: `PrivacyMode`, `ProviderMode`, `ChatExecutionMode`, `SourceSurface`, `SyncedAppSurface`, `DeveloperSessionSurface`, `StorageScope`, the `*_DISPLAY` copy maps, `assertSurfaceCanSyncChats`, generated-file manifest contracts, and explicit developer-session handoff types.
- `apps/cli/src/agent/mod.rs` — CLI Local/BYOK/Managed privacy modes; blocks Local sessions from silently using non-local provider modes.
- `apps/mobile/services/remoteChatGate.ts` — fails closed when Cloud sends are disabled.
- `apps/web/` — Neon-backed; structurally no BYOK/free-env-key chat.
- `services/api-gateway` — managed-gateway routing under entitlement; never a Local/BYOK escape hatch.
- `apps/web/db/neon` — RLS-scoped persistence; `StorageScope` mirrored at the DB.

## Per-surface trust matrix

| Surface | Modes exposed                                 | Sync boundary                                                                  |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| Web     | Managed (Neon-backed); **no BYOK**            | App-chat sync allowed                                                          |
| Desktop | Local, BYOK, Managed                          | App-chat sync; local files stay local unless explicitly transferred            |
| Mobile  | Local, public-alpha Managed; **no BYOK (v1)** | Cloud app-chat sync only for signed-in entitled Cloud chats; Local stays local |
| CLI     | Local, BYOK, Managed                          | Workspace/session scoped; no auto app-chat sync                                |
| VS Code | Local/BYOK/Managed (IDE-scoped)               | Workspace scoped; handoff to app chat must be explicit + redacted              |
| Chrome  | Task-scoped                                   | Page data task-scoped; no default global chat memory sync                      |

## Competitor notes

- **Claude & ChatGPT are single-lab by definition.** They cannot offer Local/BYOK/Managed choice without conflicting with their inference revenue and data flywheel (`docs/strategy/01` §5). Their "privacy" is policy (no-train toggles), not architecture.
- **Codex** keeps developer (IDE/CLI) sessions workspace-scoped — AGI matches this by making `cli`/`vscode`/`chrome` developer surfaces that never auto-sync into consumer chat history.
- **AGI divergence:** the trust partition is enforced _in code_ (`suite-contracts.ts`, fail-closed `remoteChatGate`/CLI guards) and verified by contract tests — a diligence asset and a wedge incumbents cannot copy without self-harm (`docs/strategy/02` §4).

## Checklists

### Trust-boundary review (any networking/routing change)

- [ ] No code path lets Local content reach BYOK/Managed without the explicit fork.
- [ ] `assertSurfaceCanSyncChats` is consulted before any chat sync; developer surfaces are rejected.
- [ ] The trust-boundary contract tests pass on the changed path.
- [ ] New outbound request carries the correct `ProviderMode` and is attributable to a `PrivacyMode`.
- [ ] Smart/auto routing explains its choice and cannot silently cross a boundary (Vol 6).

### Local→BYOK fork ceremony (every surface where it appears)

- [ ] Context selection UI lets the user pick exactly what crosses.
- [ ] Secret scan runs fail-closed on the selected payload before send.
- [ ] Payload preview shows the user the literal bytes leaving the device.
- [ ] Visible provider label names the destination provider.
- [ ] Explicit consent is captured; the Local original thread is preserved unchanged.
- [ ] The new branch records source + selected context + redaction hash.

### Labeling & copy

- [ ] All trust/provider labels read from `suite-contracts.ts` `*_DISPLAY` maps.
- [ ] Empty chat state shows a visible Local/BYOK/Managed status where routing matters (Vol 23 UX Lock).
- [ ] `ProviderMode` and `PrivacyMode` are not conflated in storage or wire payloads.

### Per-surface guards

- [ ] Web: no BYOK path, no free-env-key chat; runtime data is Neon-backed.
- [ ] Mobile: `remoteChatGate` fails closed when Cloud is off; no v1 BYOK path.
- [ ] CLI: Local sessions cannot select a non-local `ProviderMode` (`agent/mod.rs` guard intact).
- [ ] VS Code/Chrome: any app-chat handoff is explicit and redacted; no default global sync.

## Definition of Done

Trust handling is "production-ready" when: every boundary crossing is explicit, consented, labeled, and recorded; Local content provably cannot leak to BYOK/Managed (contract tests green on the path); sync is gated by `assertSurfaceCanSyncChats`; all labels come from `suite-contracts.ts`; Web/Mobile expose no BYOK; and the Local→BYOK fork ceremony is complete end-to-end on every surface where it appears (`source-of-truth.md` P0 #4).

## Anti-patterns

- A "convenient" silent fallback from Local to a cloud provider when local is offline (show install/run/upgrade guidance instead — Vol 6/15).
- Hardcoding trust-mode strings in a component instead of reading `suite-contracts.ts`.
- Collapsing `ProviderMode` into `PrivacyMode` and losing the Native-vs-Gateway distinction.
- Treating a BYOK continuation as an in-place mode flip on the original Local thread.
- Syncing a developer (CLI/VS Code/Chrome) session into consumer chat history.
- Adding BYOK to Web or Mobile v1.
