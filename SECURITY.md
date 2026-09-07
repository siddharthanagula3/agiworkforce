# SECURITY.md

Status: Current
Owner: Repository maintainers
Last updated: 2026-09-07

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

`docs/security/security.md` is the single security document. It holds the agent
authority and connector matrix, the OAuth scope ceilings, the encryption key
rotation procedure, the desktop updater key custody procedure, and the gaps each
of those records rather than papers over. Local, BYOK and Managed Cloud are
separate trust boundaries there, security behavior fails closed, tenant data is
isolated per user, and secrets never enter the repository.

`docs/runbooks/incident-response.md` holds the operational response, and
`apps/extension/docs/threat-model.md` holds the browser extension threat model.
