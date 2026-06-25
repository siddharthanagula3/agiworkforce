# Security Policy

AGI is an AI application platform spanning Web, Desktop, Mobile, CLI, VS Code, and a
Browser Extension. Its security model centers on **trust-boundary isolation** — keeping
each user's data on the boundary the user chose, and never silently moving it.

## Reporting a vulnerability

Report security issues **privately** to **security@agiworkforce.com**, or open a private
advisory via GitHub's "Report a vulnerability" flow (repository **Security** tab). Please
do not open public issues for security problems.

Include: the affected surface (web / desktop / mobile / cli / vscode / extension),
reproduction steps, and impact. We aim to acknowledge within 3 business days. Coordinated
disclosure is appreciated — please give us a reasonable window to ship a fix before any
public disclosure.

## Trust boundaries (the core security model)

Three boundaries that must **never be silently crossed**:

- **Local** — user-owned compute, storage, and models. Chats, files, and sessions never
  leave the device.
- **BYOK** — the user's own provider API keys, used client-direct to the provider. No
  markup, and **no AGI-cloud egress of chats, files, telemetry, or account data**. BYOK
  runs alongside a signed-in account but is a _private_ boundary.
- **Managed Cloud** — AGI-hosted inference, memory, projects, and sync. The only boundary
  where user content reaches AGI infrastructure. It remains **waitlist / private beta**
  until ledger, fraud, refund, dispute, retention, and deletion controls are proven.

Per-surface availability: Web & Browser Extension = Managed Cloud only; Desktop, CLI, and
VS Code = Local + BYOK + Managed; Mobile = Local + Managed (no BYOK). Any Local → BYOK or
Local → Cloud transition is an **explicit, labeled fork** with user consent — never silent.

## What the code enforces

- **Egress chokepoint (Desktop):** our-cloud network calls route through a central guard
  (`apps/desktop/src/lib/egressGuard.ts`) that fails closed whenever the privacy mode is
  not Managed; an ESLint rule blocks raw `fetch()` to our-cloud hosts outside the guard.
- **Boundary enforcement (CLI):** every model stream call site validates the privacy
  boundary and refuses to send when a Local session would route to cloud.
- **Telemetry & analytics** are suppressed in Local **and** BYOK and fail closed.
- **BYOK provider keys** are used client-direct to the user's own provider and are never
  sent to AGI cloud (provider hosts are deliberately excluded from the egress denylist).
- **No secrets in client bundles** — configuration lives in environment files, not source.
- **Computer-use (Browser Extension)** defaults to human-in-the-loop (ask before each
  action); autonomous "autopilot" is an explicit opt-out. The approval gate is
  forgery-resistant (CSPRNG ids, trusted-sender checks) and fails closed.
- **Tool sandboxing (CLI)** runs execution under OS sandboxes (Seatbelt / Bubblewrap) with
  network denied by default; unsupported platforms refuse to execute rather than run
  unsandboxed.

## Known gaps (honest posture)

Security claims here are scoped to what the code actually enforces. Disclosing a gap is
better than overclaiming. Tracked items (see `docs/agent-context/known-flaws.md` and
`docs/agent-context/risk-map.json`):

- The desktop egress guard is **fetch-only**; Rust-transport (Tauri command) egress —
  e.g. account/device calls — is reviewed and gated separately.
- `security_audit_logs` is **not yet immutable** (tracked as `AUDIT-IMMUT-01`).
- Database-level tenant isolation is partially app-filter-based; Row-Level Security
  activation across user-data routes is in progress.

## Where the detail lives

- Per-surface threat models — e.g. `apps/extension/THREAT_MODEL.md`.
- Security notes and audits — `docs/security/`.
- Trust-boundary rules and high-risk areas — `AGENTS.md` and the path-scoped
  `AGENTS.md` files at each surface.
- The machine-readable risk register — `docs/agent-context/risk-map.json`.
