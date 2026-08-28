# SECURITY.md

Status: Current
Owner: Repository maintainers
Last updated: 2026-08-28

## Reporting a vulnerability

Report privately through GitHub's **Report a vulnerability** advisory flow on
this repository. Do not open a public issue, pull request, or discussion for a
security report.

Include what you did, what happened, what you expected, and the affected surface
and version. A proof of concept helps; a working exploit chain is not required
and should be minimized. If a report includes a live credential, say so at the
top so it can be rotated first.

Expect an acknowledgement within three business days. Please give us a
reasonable window to ship a fix before disclosing.

## Scope

The six shipping surfaces (`apps/web`, `apps/desktop`, `apps/mobile`,
`apps/cli`, `apps/extension`, `apps/extension-vscode`), the shared packages and
crates they depend on, `services/signaling-server`, and the release and
deployment tooling under `scripts/` and `.github/workflows/`.

Out of scope: findings that require a compromised developer machine, results
from automated scanners without a demonstrated impact, and third-party provider
infrastructure we do not operate.

## Security model

Details live in `docs/security/`. The properties that matter most:

- **Local, BYOK and Managed Cloud are separate trust boundaries.** Nothing may
  silently route a Local chat, file, or session to BYOK or managed cloud. A
  Local-to-BYOK move is an explicit fork with consent and a visible provider
  label. A finding that crosses a boundary silently is high severity by default.
- **Security behavior fails closed.** Desktop egress funnels through
  `apps/desktop/src/lib/egressGuard.ts`; Rust transports must use the host-owned
  egress policy rather than constructing their own client.
- **Tenant data is isolated per user**, by row level security or by an
  app-enforced owner predicate on every statement.
- **Secrets never enter the repository.** The migration runner reads its
  connection string from the environment and never prints it.

Enforced by `check:trust-boundaries`, `check:rust-egress-boundary`,
`check:db-isolation`, `check:secrets`, `check:secrets:history`, a per-surface
`trust-boundary.test.ts`, and CodeQL.

## Operational response

`docs/runbooks/` holds the incident procedures, including personal-data breach
handling and key rotation. Supply-chain posture is enforced by `deny.toml` for
Cargo and by the license and lockfile guards for npm.
