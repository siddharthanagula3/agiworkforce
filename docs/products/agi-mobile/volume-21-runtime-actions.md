# AGI Mobile — Volume 21 — Runtime Actions

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: grounds in `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and the real surface paths `apps/mobile/services/companion.ts`, `apps/mobile/lib/dispatchHmac.ts`, `apps/mobile/stores/agentStore.ts`, `apps/mobile/stores/agentControlStore.ts`, `apps/mobile/services/companionNotifications.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/src/features/companion/components/`, and `packages/contracts/types/src/models.json`.

## Overview & stance

Runtime Actions are the controls a phone uses to **govern a session that is executing somewhere else** — approve or reject a tool call, pause/resume/cancel a run, read its plan and logs, and receive live status. On AGI Mobile this is the **Remote Control window**, not a fourth trust mode: compute stays on the paired Desktop host, the link is outbound-only, paired by QR + HMAC, and every consequential action is approval-gated. The phone never becomes the executor.

Trust shaping is strict. A **Local** on-device chat has no agentic tool runtime to govern — Runtime Actions do not apply, and Local data is never streamed to a host to "enable" them. **Managed Cloud** sessions may surface server-side status, but the agentic execute-with-tools loop AGI targets runs on Desktop. **Mobile has NO BYOK** — there is no key entry, no provider-credential affordance anywhere in this domain; "provider configuration" on mobile means on-device model management only. Model identity shown in any plan/log view must come from `packages/contracts/types/src/models.json`; never hardcode an ID.

Everything in this volume depends on the companion fabric, which is **feature-flagged off**: `apps/mobile/lib/v1FeatureFlags.ts` ships `companion: false`, `dispatch: false`, and `agents: false`. The transport, HMAC signing, control-message builders, and UI exist, but the last-mile desktop wiring to live task execution is not complete. So the dominant label here is **🟡 Partial**.

## Approvals — approve runtime actions

Approve is the **highest-trust Runtime Action** and must be **explicit and HMAC-verified**. A tap approves exactly one pending request by `requestId`; there is no "approve all," no auto-approve, and no implicit approval on screen dismissal. `apps/mobile/stores/agentStore.ts` holds `pendingApprovals` and `approveRequest(id)`, which calls `sendApprovalResponse(requestId, true)` in `apps/mobile/services/companion.ts`; the outbound envelope is signed via `apps/mobile/lib/dispatchHmac.ts` (HKDF-derived session key, per-message nonce, ±30s replay window, fail-closed on unsigned). The request must show the action, target, and risk level before the user can act. **🟡 Partial** — built and signed, but gated off (`companion/dispatch/agents = false`) and not wired to real desktop tool execution.

## Reject Actions

Reject is the safe default and must be **as reachable as approve**, never buried. `rejectRequest(id, reason?)` updates local state and calls `sendApprovalResponse(requestId, false, reason)` (`apps/mobile/services/companion.ts`), HMAC-signed identically to approve. A rejected action must not run; an unanswered request must **time out closed**, never silently proceed. An optional reason is forwarded to the host for the log. **🟡 Partial** — implemented in `apps/mobile/stores/agentStore.ts`; gated off, desktop enforcement of "rejected ⇒ never executes" is the open last mile.

## Pause Execution

Pause requests the host suspend the active agent without discarding its state, so it can later resume. `sendAgentCommand(agentId, 'pause')` (`apps/mobile/services/companion.ts`) emits a signed `dispatch_request` control message; the host owns the actual suspension. The UI must reflect a _requested → confirmed_ transition from a host acknowledgement, not optimistically claim "paused." **🟡 Partial** — builder exists and is signed; gated off and the host-side pause semantics are not yet wired.

## Resume Execution

Resume continues a paused run on the host. `sendAgentCommand(agentId, 'resume')` sends the signed counterpart command. Resume must only be offered for a session the host reports as paused, and a resume after a stale/dropped link must re-verify connection health (heartbeat/stale detection in `companion.ts`) before sending. **🟡 Partial** — same path and gating as Pause.

## Cancel Execution

Cancel terminates a run; it is destructive and must require explicit intent. `sendAgentCommand(agentId, 'cancel')` emits a signed `cancel` control message scoped to one agent. A separate **emergency stop** — `sendEmergencyStop()` — sends a signed `cancel` with `scope: 'all'` to halt every running task and is allowed even from a `stale` connection. Cancel/stop must show a confirmation and reflect host acknowledgement before claiming the run ended. **🟡 Partial** — both builders exist in `apps/mobile/services/companion.ts`; gated off, host teardown wiring pending.

## View Plans

A plan is the agent's proposed multi-step sequence the user reviews **before** high-risk steps run; on mobile it is read-and-gate, never authored. Today `apps/mobile/src/features/companion/components/ExecutionStream.tsx` renders step progress and the tool-call timeline, and `apps/mobile/src/features/agents/components/ToolTimeline.tsx` shows ordered steps — but there is no discrete "plan object" approval view, and plan steps must each route through the per-step Approvals gate above rather than a single bulk "approve plan." Model labels in any plan view resolve from `packages/contracts/types/src/models.json`. **🔭 Planned** — a dedicated plan-review/approve surface is design intent; only step/tool display exists today (and is gated off).

## View Logs

Logs are the **read-only, append-only** record of what executed: tool calls, step transitions, artifacts, and errors. `ExecutionStream.tsx` plus `apps/mobile/stores/agentStore.ts` (`agents[].toolCalls`, `steps`, `artifacts`) provide the live timeline and the `AgentDashboard.tsx` rollup. Logs must never be editable from the phone and must redact secrets/credentials before display. Because the phone is a window, logs reflect host truth and must not be fabricated when the channel is stale. **🟡 Partial** — timeline UI and store exist in `apps/mobile/src/features/companion/components/`; gated off, fed by mocked/dispatch data until the desktop channel is wired.

## Session Notifications — live updates

Live updates push out-of-app signals for state the user must act on: `approval_request` (high priority), `agent_failed` (critical), `task_completed`, and `emergency_stop`. `apps/mobile/services/companionNotifications.ts` maps inbound control messages to local notifications via `scheduleLocalNotification`, honoring `apps/mobile/stores/notificationPrefsStore.ts`, sanitizing error text (first line, ≤100 chars — no stack traces), and deep-linking approval prompts to `/(app)/companion`. Notifications must not leak conversation content or provider keys (there are none on mobile). **🟡 Partial** — bridge implemented; gated off behind `FEATURES.companion`.

## Repository map

- `apps/mobile/services/companion.ts` — control-message builders: `sendApprovalResponse`, `sendAgentCommand`, `sendEmergencyStop`, `requestAgentRefresh`, heartbeat/health.
- `apps/mobile/lib/dispatchHmac.ts` — HKDF session-key derivation, sign/verify, replay protection (HMAC for all Runtime Actions).
- `apps/mobile/stores/agentStore.ts` — `pendingApprovals`, `approveRequest`, `rejectRequest`, agent timeline/artifacts.
- `apps/mobile/stores/agentControlStore.ts` — per-project/per-conversation mode + effort defaults.
- `apps/mobile/services/companionNotifications.ts` — control-message → local-notification bridge.
- `apps/mobile/src/features/companion/components/` — `AgentDashboard.tsx`, `ExecutionStream.tsx`, `PairingStatus.tsx`, `ConnectionStateViews.tsx`, `StatusBanners.tsx`.
- `apps/mobile/src/features/agents/components/` — `AgentCard.tsx`, `ToolTimeline.tsx`, `AgentStatusBadge.tsx`.
- `apps/mobile/app/(app)/companion/` — companion route and `agent/[id].tsx` detail.
- `apps/mobile/lib/v1FeatureFlags.ts` — `companion`/`dispatch`/`agents` gates (all `false`).
- Shared/host: `crates/agiworkforce-{protocol,task-runtime}`, `packages/client/client-runtime`, `apps/desktop/src-tauri/src/integrations/realtime`, `services/signaling-server`.

## Competitor notes

ChatGPT and Claude mobile increasingly run agentic/"on the web" tasks **in their own cloud** and notify the phone when done. AGI diverges deliberately: Runtime Actions on mobile govern a **locally-running host session** through a paired, HMAC-verified, outbound-only window — compute and data stay on the user's Desktop (mirroring Claude Code Remote Control and Codex remote connections). The phone is multi-provider via the host (models from `models.json`), not single-vendor; approvals are explicit and per-step, not opaque; and **no BYOK keys ever touch mobile**. Cloud-run sessions remain a separate, explicitly Managed-Cloud path, not the default for this domain.

## Acceptance / Definition of Done

Production-ready gate: every Runtime Action is HMAC-signed and replay-protected; approve/reject is explicit and per-request with fail-closed timeouts; pause/resume/cancel reflect host acknowledgement (no optimistic lies); logs are read-only and redacted; notifications honor prefs and leak no content; and the companion fabric is wired to real desktop task execution before any flag flips on.

- [ ] Build: companion screens render with `FEATURES.companion/dispatch/agents` on in a dev build; approve/reject/pause/resume/cancel/emergency-stop each emit a signed envelope verified by the desktop peer.
- [ ] Trust: no BYOK/key affordance anywhere in this domain; Local chats expose no Runtime Actions; model labels resolve only from `packages/contracts/types/src/models.json`.
- [ ] Security: unsigned/expired/replayed control messages rejected; rejected/timed-out approvals never execute on the host; notifications and logs redact secrets and error stacks.

## Anti-patterns

- Adding a BYOK or API-key field to any Runtime Actions screen (mobile is Local + Cloud only).
- Treating Remote Control as a fourth trust mode, or streaming Local data to a host to "enable" actions.
- Auto-approving, bulk-approving a plan, or proceeding on an unanswered/dismissed request.
- Optimistically showing "paused/cancelled/done" before host acknowledgement, or fabricating logs on a stale channel.
- Sending unsigned control messages, or claiming this domain is shipped — it is gated off (`v1FeatureFlags.ts`).
- Hardcoding or inventing model IDs; referencing Supabase (removed — stack is Clerk + Neon + Stripe).
