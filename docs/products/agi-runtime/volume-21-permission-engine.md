# AGI Runtime — Volume 21 — Permission Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `services/AGENTS.md`, and the real runtime paths this volume grounds in: `crates/agiworkforce-execpolicy/src/{policy,decision,rule,amend}.rs`, `crates/agiworkforce-protocol/src/{protocol,permissions,request_permissions,approvals,network_policy}.rs`, `crates/sandbox-policy/src/lib.rs`, `crates/agiworkforce-network-proxy/src/{network_policy,policy,proxy}.rs`, `services/signaling-server/src/index.ts`, `services/api-gateway/src/routes/mobile.ts`, `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/desktop/src/stores/connectionStore.ts`.

## Overview & stance

The Permission Engine is the trust spine of AGI Runtime. Every destructive, external, or privileged action an agent proposes — writing a file, running a shell command, opening a socket, mutating git state, invoking a tool — passes through one decision surface that returns **Allow / Prompt / Forbidden** (`crates/agiworkforce-execpolicy/src/decision.rs`). The Runtime is an internal shared layer, not a user surface, so this engine must produce identical verdicts whether the caller is the CLI, the Desktop `127.0.0.1` host, or a plugin.

Trust mode shapes the _default posture_, never the code path. **Local** runs on-device with the strictest sandbox and no silent egress. **BYOK** (Desktop/CLI/VS Code only) adds provider-key actions that still require the same approvals plus a visible provider label. **Managed Cloud** carries server-side entitlement checks on top. Remote Control never widens permissions: a paired phone is a _window_ onto a locally running session, so approvals are relayed to the phone and back but the verdict is still enforced on the host (compute stays local; outbound-only; QR + HMAC paired). Because the current host is wired only into the CLI and app-server, most cross-surface enforcement is 🟡 even where the primitive is ✅.

## Filesystem Permissions

The sandbox distinguishes read scope from write scope. `SandboxPolicy` (`crates/agiworkforce-protocol/src/protocol.rs`) offers `read-only`, `workspace-write` (cwd + explicit `writable_roots`), `external-sandbox`, and `danger-full-access`; `ReadOnlyAccess` further restricts reads to `readable_roots` or grants full-disk read. The agent may **never** write workspace-metadata dirs — `.git`, `.agents`, `.agiworkforce`, `.codex` are blocked pre-execution by `forbidden_agent_metadata_write` so the agent cannot self-reconfigure its own sandbox (`crates/agiworkforce-protocol/src/permissions.rs`; `crates/sandbox-policy/src/lib.rs`). **✅ Built** in the runtime crates; **🟡** cross-surface because enforcement is consumed today only by the CLI/app-server host, not Mobile/Web. Testable: a write to a path outside `writable_roots` or into a protected metadata dir must be rejected without prompting; escalation to `danger-full-access` must require explicit approval.

## Terminal Permissions — control command execution

Command execution is gated by execpolicy. Each candidate argv is matched against `prefix_rule`s to yield `Allow`, `Prompt`, or `Forbidden` (`crates/agiworkforce-execpolicy/src/{policy,rule}.rs`). The turn-level posture is `AskForApproval` — `untrusted` (only known read-only-safe commands auto-approve), `on-request` (model asks), `granular` (`GranularApprovalConfig`), and `never` (`crates/agiworkforce-protocol/src/protocol.rs`). **✅ Built.** Requirements: destructive commands (`rm -rf`, `dd`, package publish) always resolve to `Prompt` or `Forbidden`, never silent `Allow`; under `never`, a would-be prompt is a hard reject, not a bypass; unknown binaries default to `Prompt`. A command that mutates state outside the sandbox must escalate through `EscalationPermissions` (`crates/agiworkforce-protocol/src/approvals.rs`), never run unsandboxed silently.

## Network Permissions

Egress defaults to closed. `NetworkAccess` is `Restricted` unless a policy explicitly enables it, and the MITM/SOCKS proxy enforces per-host rules with justification-carrying decisions (`crates/agiworkforce-network-proxy/src/{network_policy,policy,proxy}.rs`; `crates/agiworkforce-protocol/src/network_policy.rs` `NetworkPolicyDecisionPayload`). Execpolicy `network_rule`s bind `host` + protocol + decision (`crates/agiworkforce-execpolicy/src/rule.rs`). **✅ Built** (proxy + policy); **🟡** wiring to non-CLI surfaces. Requirements: no outbound connection without an allow rule or an approved prompt; each network approval records host, protocol, and a non-empty justification; Local-mode sessions never open managed-cloud or BYOK endpoints without the explicit Local→BYOK fork (secret scan, payload preview, consent, visible provider label).

## Git Permissions

Git is protected on two fronts. The `.git` directory is a protected-metadata root the agent cannot write directly (`permissions.rs`), and git _commands_ flow through the same terminal execpolicy — so `git push`, `git reset --hard`, `git clean`, force-push, and history rewrites resolve to `Prompt`/`Forbidden` like any other destructive command. **🟡 Partial**: `.git` write-protection is ✅ (`crates/agiworkforce-protocol/src/permissions.rs`) and command gating rides execpolicy, but git-_semantic_ policy (branch protection, remote allowlists, signed-commit enforcement, "never force-push to main") is design-only. **🔭 Planned**: a git-aware policy layer that classifies operations by blast radius and requires approval for anything touching remotes or protected branches.

## Tool Permissions

Tool/MCP/skill invocations are gated by `GranularApprovalConfig` fields — `sandbox_approval`, `rules`, `skill_approval`, `request_permissions`, `mcp_elicitations` (`crates/agiworkforce-protocol/src/protocol.rs`) — where `false` auto-rejects rather than prompting. Tools request scoped capability via the `request_permissions` flow: `RequestPermissionProfile { network, file_system }` with a `PermissionGrantScope` of `Turn` or `Session` (`crates/agiworkforce-protocol/src/request_permissions.rs`). **🟡 Partial**: the request/grant model and granular gates are ✅ Built; plugin-runtime tool isolation and full MCP-elicitation UX across surfaces are still maturing. Requirements: a tool may only receive the capabilities it requested; a `Turn` grant must not persist past the turn; disabled granular categories reject deterministically.

## Persistent Policies — save permission decisions

"Always allow" must be durable and auditable. `blocking_append_allow_prefix_rule` and `blocking_append_network_rule` append the approved prefix/host rule to the on-disk policy file under advisory file locking (`crates/agiworkforce-execpolicy/src/amend.rs`), and `ExecPolicyAmendment` (`crates/agiworkforce-protocol/src/approvals.rs`) carries the proposed prefix from an approval. The policy file lives inside `.agiworkforce`, which is itself read-only to the agent — so the agent cannot forge its own persistent allow rules. **✅ Built** for the CLI/app-server host; session-scoped grants use `PermissionGrantScope::Session`. **🔭 Planned**: a cross-surface persisted-policy store and a review/revoke UI so a Desktop or Mobile user can see, edit, and expire every saved decision. Requirements: every persisted grant is attributable (who/when/justification); network grants require a non-empty justification (enforced in `amend.rs`); revocation takes effect on the next evaluation.

### Remote approvals ride the companion protocol (🟡)

When a session runs on a host and the operator is on a phone, approval requests relay over the signaling fabric: the `approval_request` / `approval_response` control verbs, with offline queueing and TTL expiry for approvals raised while the phone is disconnected (`services/signaling-server/src/index.ts`), and `companion.ts`'s `sendControl('approval_response', …)` on the mobile side (`apps/mobile/services/companion.ts`). The Runtime also exposes pending-approval polling for background notifications (`services/api-gateway/src/routes/mobile.ts`). **🟡 Partial**: the relay is ✅, but the companion channel is feature-flagged off (`apps/mobile/lib/v1FeatureFlags.ts` `companion:false`, `dispatch:false`) and the Desktop last mile re-emits control events as a window event with no listener wired (`apps/desktop/src/stores/connectionStore.ts`). The verdict is always enforced on the host; the phone only conveys the human decision.

## Repository map

- `crates/agiworkforce-execpolicy/` — command/network policy, `Decision`, prefix/network rules, `amend.rs` persistence.
- `crates/agiworkforce-protocol/src/{protocol,permissions,request_permissions,approvals,network_policy}.rs` — sandbox/approval/permission types.
- `crates/sandbox-policy/src/lib.rs` — read-only vs workspace-write sandbox modes.
- `crates/agiworkforce-network-proxy/` — egress proxy and per-host enforcement.
- `services/signaling-server/src/index.ts`, `services/api-gateway/src/routes/{mobile,pair}.ts` — remote approval relay, pairing, pending-approval polling.
- `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/desktop/src/stores/connectionStore.ts` — companion approval last mile (🟡).

## Competitor notes

Claude Code gates writes/commands/network with per-action approval and "always allow" persistence, and Remote Control relays approvals to the phone while compute stays local. ChatGPT/Codex use a sandbox with approval escalation and QR-paired remote steering of a host. AGI's deliberate divergence: **per-surface trust** (Web/Mobile never touch BYOK; Local never silently egresses), **multi-provider** approvals that name the provider, **local-first** enforcement (the verdict runs on the host, not a cloud service), and a Local→BYOK path that is an _explicit fork_ with secret scan and payload preview rather than a silent widening. Persistent allow rules live on-device in a protected config the agent cannot rewrite — a stronger self-reconfiguration guard than a mutable in-app allowlist.

## Acceptance / Definition of Done

The engine is production-ready when a single evaluation path returns the same verdict for identical actions across every host binding, approvals are enforced host-side regardless of where the human sits, and every persisted grant is reviewable and revocable.

- [ ] **Build**: `read-only`, `workspace-write`, and `danger-full-access` behave per `SandboxPolicy`; execpolicy `Allow/Prompt/Forbidden` verified for destructive command fixtures; persisted rules survive restart.
- [ ] **Trust**: Local sessions never open BYOK/Cloud endpoints without the explicit fork; `.git`/`.agiworkforce` metadata writes are rejected; provider label shown on every BYOK/Cloud approval.
- [ ] **Security**: `never` policy hard-rejects (no silent bypass); network grants carry a non-empty justification; remote approvals never widen the host verdict; companion channel stays disabled until the Desktop last mile is wired.

## Anti-patterns

- Silently routing a Local write, command, or socket to BYOK/Cloud, or treating Remote Control as a fourth trust mode.
- Auto-approving destructive git/shell/network actions, or letting `never` bypass instead of reject.
- Letting the agent write `.agiworkforce`/`.git`/`.agents` or forge its own persistent allow rules.
- Persisting a grant with no attribution or (for network) no justification; skipping revocation.
- Claiming the companion approval loop is shipped (it is 🟡: `companion:false`, Desktop last mile unwired).
- Inventing a monolithic runtime daemon, hardcoding a model ID (use `packages/types/src/models.json`), referencing removed tiers (Plus/Hobby/`pro_plus`) or credit top-ups, or referencing Supabase.
