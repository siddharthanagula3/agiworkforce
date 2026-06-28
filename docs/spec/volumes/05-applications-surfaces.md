# Volume 05 — Applications & Surfaces

Status: Canonical depth for Master Spec Vol 5
Authority: `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 5, `docs/current/source-of-truth.md` (Surface Roles), `docs/strategy/12-website-production-plan.md`, `docs/strategy/13-mobile-production-plan.md`, `docs/strategy/14-desktop-production-plan.md`, per-surface `apps/*/AGENTS.md`.

## Philosophy & Cloud/Local stance

AGI is one shared agent runtime under thin clients — never "seven apps." Both incumbents win by building the runtime once and re-skinning it (`docs/strategy/01` §1); AGI's monorepo already encodes that instinct (shared `packages/`, `crates/`, `services/`). A surface's only job is to render the runtime correctly for its OS, input model, and trust posture. The defensible work is the runtime, the trust enforcement, and the contracts — not the chrome.

Cloud/Local stance is **per-surface and declared, not incidental.** Each surface inherits the same Local/BYOK/Managed boundaries but exposes a _different subset_ by product decision: Web and Mobile v1 expose **no BYOK**; Desktop is the full Local-private compute host (Local + BYOK + Managed); CLI/VS Code/Chrome are developer/task-scoped and never auto-sync into app chat. A surface that re-implements trust logic locally instead of consuming `packages/types/src/suite-contracts.ts` is a P0 — the moat lives in shared code, not in each client.

## Binding rules

1. Every surface declares the exact sync/trust boundary it crosses, sourced from `suite-contracts.ts` (`assertSurfaceCanSyncChats`, `PrivacyMode`, `ProviderMode`); never hardcode a new boundary string in a client.
2. A new surface inherits shared runtime + contracts. Re-implementing the agent loop, permission engine, or trust partition inside a client is forbidden.
3. Web is Neon-backed and exposes no BYOK or free env-key chat. Mobile v1 exposes no BYOK. Do not add a BYOK affordance to either without a founder decision recorded in `docs/decisions/`.
4. CLI, VS Code, and Chrome are workspace/task-scoped. Any handoff to app chat must be explicit and redacted — never an automatic sync.
5. Trust labels (Local/BYOK/Managed) must be visible on every surface where routing matters (UX Lock, source-of-truth §UX Lock).
6. Planned surfaces (Safari/Firefox/Edge extensions, JetBrains plugin, public API, SDK, MCP server) are tracked but **tracking is not authorization** — they ship only when a founder enables them and they pass their own gate.
7. Development is serial by surface (Mobile → Website → Desktop → CLI → Chrome → VS Code per source-of-truth); only the active surface gets implementation effort unless the founder asks otherwise.

## Repository map

| Surface | Path                               | Stack                         | Trust exposure                                         |
| ------- | ---------------------------------- | ----------------------------- | ------------------------------------------------------ |
| Web     | `apps/web`                         | Next.js app router            | Neon account/sync; Managed (public alpha); no BYOK     |
| Desktop | `apps/desktop` (`src-tauri/` Rust) | Tauri v2 + React + Vite       | Local + BYOK + Managed; local files stay local         |
| Mobile  | `apps/mobile`                      | Expo / React Native           | On-device Local + Managed (public alpha); no BYOK v1   |
| CLI     | `apps/cli`                         | Rust, Ratatui TUI             | Local/BYOK/Managed; workspace-scoped, no app-chat sync |
| Chrome  | `apps/extension`                   | Chrome MV3                    | Task-scoped page data; native-messaging bridge         |
| VS Code | `apps/extension-vscode`            | VS Code extension             | Workspace-scoped; explicit redacted handoff            |
| Sandbox | `apps/sandbox`                     | Static HTML, postMessage-only | Isolated artifact renderer (Vol 14)                    |

Shared: `packages/unified-chat`, `packages/ui`, `packages/types` (contracts), `packages/providers`, `packages/runtime`; Rust in `crates/agiworkforce-{protocol,command-registry,task-runtime,...}`; backend in `services/api-gateway`, `services/signaling-server`. Per-surface law: see `docs/strategy/12` (web), `13` (mobile), `14` (desktop) and the nearest `apps/*/AGENTS.md`.

## Competitor notes

Anthropic runs every consumer surface off one account, one usage pool, one model set; Claude Code's CLI/IDE/desktop/browser are the same engine re-skinned (`docs/strategy/01` §2). OpenAI fronts the Responses API runtime with ~10 clients (`01` §3). AGI's deliberate divergences: (1) **Rust/Tauri desktop** versus the Electron incumbent (a genuine quality edge, a feature not a moat); (2) **multi-provider + BYOK** versus single-lab clients; (3) **per-surface trust boundaries** as a first-class product concept neither incumbent offers. The standing risk both teardowns flag: spreading effort across six surfaces instead of hardening the one runtime — hence the serial-by-surface lock.

## Checklists

### New-surface bring-up

- [ ] Surface declares its trust/sync boundary via `suite-contracts.ts`, not a local literal.
- [ ] Surface consumes the shared agent loop + permission engine from `packages/`/`crates/`.
- [ ] Empty chat state shows input, plus/add, file attach, model selector, mic, send/stop, and a visible trust/provider label.
- [ ] Model selector reads IDs from `packages/types/src/models.json` only.
- [ ] Surface added to `docs/agent-context/repo-map.json` with owner + primary checks.
- [ ] Nearest `AGENTS.md` written for the surface before non-trivial edits.

### Per-surface trust verification

- [ ] Web: no BYOK affordance reachable; runtime data is Neon-backed; conversation routes IDOR-safe.
- [ ] Mobile: `apps/mobile/services/remoteChatGate.ts` fails closed when Cloud is disabled; Local never auto-sends.
- [ ] Desktop: Local/BYOK/Managed all selectable with correct labels; dormant Rust cloud-sync stays privacy-mode-gated.
- [ ] CLI: Local sessions cannot silently use a non-local provider mode (`apps/cli/src/agent/mod.rs`).
- [ ] Chrome: page data task-scoped; no default global chat-history sync; sync-boundary tests pass.
- [ ] VS Code: handoff to app chat is explicit + redacted; never automatic.

### Cross-surface consistency

- [ ] One headless chat shell (`packages/unified-chat`/`packages/ui`) themed per surface; no forked shell.
- [ ] Settings IA converges toward the locked sections (source-of-truth §UX Lock) per surface capability.
- [ ] Brand renders as `AGI` (no `agi.workforce` drift) in headers/footers.
- [ ] Capability that is unsupported on a surface is hidden, not faked (Operating Law 5).

### Planned surfaces (gate before any work)

- [ ] Safari/Firefox/Edge extensions reuse the Chrome MV3 trust model + native bridge; no new sync path.
- [ ] JetBrains plugin is a client of the shared runtime (mirror the VS Code contract), not a reimplementation.
- [ ] Public API + SDK are first-party contracts in `packages/types`; never expose Managed without entitlement + metering.
- [ ] MCP server surface scopes tools per-agent and passes the untrusted-remote boundary (Vol 19).
- [ ] Founder decision recorded before implementation begins.

## Definition of Done

A surface is production-ready when: every launch-critical flow works end-to-end and is covered by the surface's test toolchain (Playwright/Chrome-MCP for web, Detox/Xcode-MCP for mobile, Playwright+cargo+computer-use-MCP for desktop); its trust/sync boundary is provably enforced by contract tests; trust/provider labels are correct and visible; there are no dead controls and no claims beyond shipped scope; and it meets its plan's exit criteria in `docs/strategy/12–14`. A surface ships only after its predecessor in the serial order has shipped (or the founder explicitly authorizes parallel work).

## Anti-patterns

- Building a surface as a standalone app with its own runtime, agent loop, or trust logic.
- Adding BYOK to Web or Mobile v1, or auto-syncing CLI/VS Code/Chrome into app chat.
- Hardcoding a model ID or a trust-boundary string in a client instead of reading the catalog/contracts.
- Shipping a planned surface because the parity ledger lists it (tracking ≠ authorization).
- Faking an unsupported capability with a dead button instead of hiding it.
- Diverging the chat shell per surface instead of theming one shared shell.
