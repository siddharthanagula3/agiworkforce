# AGI Product Specifications — Canon & Index

Status: Current
Owner: Founder + platform lead
Last updated: 2026-06-30

This directory holds the per-product specification volumes for the AGI suite. Each
product is a folder of numbered volume files (`volume-NN-<topic>.md`). This README is
the **canon**: the non-negotiable facts, decisions, and format every volume must obey.
A volume that contradicts this canon is wrong and must be corrected.

These are **target/design specifications**, not claims of shipped state. Every
capability must be labeled (see "Built-vs-Planned labels"). The implementation locks
in `AGENTS.md` and `docs/current/source-of-truth.md` still govern what actually ships
and in what order — writing a spec is not authorization to implement.

## Authority order (read these for ground truth)

1. `AGENTS.md` (repo root) and the nearest path-scoped `apps/*/AGENTS.md`
2. `docs/current/source-of-truth.md`
3. `docs/current/agi-product-requirements.md`
4. `docs/current/parity-implementation-matrix.md`
5. `docs/current/byok-open-model-provider-strategy.md`
6. `docs/agent-context/repo-map.json`

Model IDs come **only** from `packages/types/src/models.json` — never invent or hardcode
one. This SSOT rule binds **LLM / provider-catalog** model IDs. Non-LLM engine
identifiers that are not catalog entries — e.g. speech-to-text engines (Deepgram
`nova-3`), on-device embedding models (`nomic-embed-text`), or third-party image
engines — are **exempt**, but must still be grounded in real repo code and _referenced_
rather than re-listed verbatim where the list would drift from source. Never cite
retired docs (`docs/PRD.md`, `docs/VISION.md`, `docs/ROADMAP.md`,
`docs/PRICING.md`, `docs/ARCHITECTURE.md`, etc.); they are archived. Auth/DB stack is
**Clerk + Neon Postgres + Stripe** — Supabase is fully migrated away; never reference it.

## The suite: six surfaces + one internal runtime layer

AGI is **six** first-class user surfaces — there is **no seventh user-facing product**:

| Surface | Path                               | Stack                               | Trust exposure                                           |
| ------- | ---------------------------------- | ----------------------------------- | -------------------------------------------------------- |
| Mobile  | `apps/mobile`                      | Expo / React Native                 | Local (on-device LLM) + Cloud. **No BYOK.**              |
| Web     | `apps/web`                         | Next.js 16 (App Router, `proxy.ts`) | Cloud only. **No BYOK, no Local.**                       |
| Desktop | `apps/desktop` (`src-tauri/` Rust) | Tauri v2 + React                    | Local + BYOK + Cloud. Local-private compute host.        |
| CLI     | `apps/cli`                         | Rust + Ratatui                      | Local + BYOK + Cloud. Workspace/session-scoped.          |
| Chrome  | `apps/extension`                   | Chrome MV3                          | Browser companion; task-scoped; native-messaging bridge. |
| VS Code | `apps/extension-vscode`            | VS Code extension                   | Local + BYOK + Cloud. Workspace-scoped.                  |

**AGI Runtime** is the **internal shared execution layer**, not a user surface or a
"seventh app." It is the shared Rust/TS that the surfaces compile in plus the local
host and remote-control/companion fabric: `crates/agiworkforce-{protocol,task-runtime,
plugin-runtime,command-registry,app-server}`, `packages/runtime`, the desktop
`127.0.0.1` WebSocket/IPC host (`apps/desktop/src-tauri/src/integrations/realtime`),
the Chrome native-messaging host (`com.agiworkforce.browser`, bridge port 8787), the
`services/signaling-server` relay, and the Neon cloud delta-sync APIs
(`apps/web/app/api/{chat,memory,projects}/sync`). The Runtime spec documents this layer
and its target evolution; it must not invent a monolithic daemon that the repo does not
have.

## Trust modes (exactly three — non-negotiable)

- **Local** (`local_only`): runs locally / on-device / local runtime. Never silently
  routed to BYOK or Cloud.
- **BYOK** (`byok`): user-supplied provider keys, direct. Available **only** on Desktop,
  CLI, VS Code. Local→BYOK is an explicit fork (context selection, secret scan, payload
  preview, visible provider label, consent). Never on Web or Mobile.
- **Managed Cloud** (`cloud_managed`): AGI-managed provider access / hosted compute.
  Public alpha, open by default (founder decision 2026-06-27). A distinct trust boundary;
  never silently fed Local/BYOK data.

**Remote Control is NOT a fourth trust mode.** Mirroring Claude Code Remote Control and
Codex remote connections, a phone/web client acts as a secure **remote window** over a
session that **keeps running locally** — compute stays on the host, the connection is
outbound-only, paired (QR + HMAC), and approval-gated. It does not move local data into
the cloud and does not violate "CLI/VS Code/Desktop sessions stay local." Cloud-run
sessions (Anthropic-style "on the web") are a separate, explicitly Managed-Cloud path.

Normal chat **data sync** (Neon delta-sync) is only Web ↔ Mobile ↔ Desktop and only for
Managed-Cloud chats. CLI, VS Code, and Chrome stay workspace/task-scoped; any handoff to
app chat is explicit and redacted, never automatic.

## Pricing & subscription model (founder decision, 2026-06-30 — resolves register D1)

Access modes (free, not plans): **Local** (on-device/local runtime), **BYOK** (Desktop/
CLI/VS Code only).

Managed-Cloud subscription ladder (use these names **everywhere**):

| Plan       | USD / mo      | INR / mo  | Notes                                          |
| ---------- | ------------- | --------- | ---------------------------------------------- |
| Free       | $0            | ₹0        | Entry cloud chat, limited usage.               |
| Basic      | $8            | ₹399      | ChatGPT-Go-style entry paid tier (US + India). |
| Pro        | $20           | (INR TBD) | Main paid tier.                                |
| Max        | $100 and $200 | (INR TBD) | Two power tiers (higher usage/limits/models).  |
| Enterprise | custom        | custom    | Org controls, SSO, admin, seats, contracts.    |

- **Removed forever:** "Plus", `pro_plus`, "Hobby". Do not mention them.
- "Team" needs are served by **Enterprise / org seats**, not a separate consumer tier.
- Max has **two price points** ($100 and $200) — present as Max tiers, not as "Plus".
- INR is fixed for Basic (₹399); Pro/Max INR are **TBD** — do not invent INR numbers.
- **No credit top-ups** (policy; the code path stays env-gated off). Usage is metered.
- The repo's `packages/types/src/billing-catalog.ts` and pricing UIs still encode older
  tiers; that code reconciliation is a separate tracked task. Specs use the model above.

## Chrome scope (Q3 decision)

The Chrome product is the **AGI Browser Companion / browser agent**, modeled on Claude
for Chrome plus our shipped automation reality — **not** a standalone consumer assistant.

- In scope: page context/capture, read page/DOM/console/network, navigate/click/type/
  fill forms, manage tabs & tab groups, screenshots/region capture, multi-step workflows,
  **record-and-replay** demonstrated workflows, **scheduled** recurring browser tasks,
  "ask before acting" plan-approval + high-risk-action approval, high-risk-site
  detection/intervention, job autofill (LinkedIn/Lever/Greenhouse/Ashby), computer-use
  via CDP with escalation, a **thin bridged chat** (streams through the cloud gateway /
  desktop — the extension holds **no provider keys and runs no inference of its own**),
  native-messaging bridge to Desktop, site allowlist + pairing/bridge token.
- **Out of scope (removed):** consumer conversation sync, global memory sync, Projects,
  image generation, and in-extension Stripe/billing. History and memory are
  `chrome.storage.local` only — device-scoped, never synced. Plans/entitlements are
  verified via the account/server (paywall rendered from server responses), with
  model-by-plan gating; there is no checkout inside the extension.

## Built-vs-Planned labels (mandatory in every volume)

Tag each material capability with one of:

- **✅ Built** — exists today; cite a real repo path (e.g. `apps/mobile/services/remoteChatGate.ts`).
- **🟡 Partial** — exists but incomplete/gated/dormant; cite path + the gap (e.g. the
  Desktop↔Mobile companion protocol exists but is feature-flagged off and not wired to
  task execution).
- **🔭 Planned** — design intent, not yet built. Most parity features are 🔭 today.

Never describe an unbuilt capability as shipped. When unsure, mark 🔭 and add a tracked gap.

## Volume format (every volume follows this)

1. Header `# AGI <Product> — Volume NN — <Title>`, then `Status:` / `Owner:` /
   `Last updated:` lines, then an `Authority:` line citing the docs/paths it grounds in.
2. **Overview & stance** — what this volume covers and how Local/BYOK/Cloud + the trust
   boundary change it on this surface.
3. **Sections** — one `##`/`###` subsection per bullet in the assigned outline, each with
   concrete requirements and Built-vs-Planned labels.
4. **Repository map** — the real paths this domain owns (from `repo-map.json`).
5. **Competitor notes** — what Claude/ChatGPT/Codex do here and AGI's deliberate
   divergence (multi-provider, BYOK, per-surface trust, local-first).
6. **Acceptance / Definition of Done** — the gate before the domain is production-ready,
   plus `- [ ]` checklists (build / review / security / per-trust-mode) where useful.
7. **Anti-patterns** — what not to do (trust-boundary violations, faked capabilities,
   hardcoded model IDs, etc.).

Target length 700–1,400 words per volume. Markdown, kebab-case filenames, US English.

## Products & volume counts

| Product                      | Folder                  | Volumes |
| ---------------------------- | ----------------------- | ------- |
| AGI Runtime (internal layer) | `agi-runtime/`          | 39      |
| AGI Mobile                   | `agi-mobile/`           | 38      |
| AGI Web                      | `agi-web/`              | 26      |
| AGI Desktop                  | `agi-desktop/`          | 32      |
| AGI Chrome Extension         | `agi-chrome-extension/` | 31      |
| AGI CLI                      | `agi-cli/`              | 28      |
| AGI VS Code Extension        | `agi-vscode-extension/` | 28      |

Each product folder has its own `README.md` index listing its volumes.
