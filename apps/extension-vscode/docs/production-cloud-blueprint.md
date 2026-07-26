# VS Code Runtime and Cloud Integration

Status: Current implementation note

Owner: VS Code + Platform

Last updated: 2026-07-26

This document replaces the superseded cloud-only/private-beta blueprint. The
shipping extension is a developer surface with three explicit trust boundaries:
Local, BYOK, and Managed Cloud. It is not a consumer-chat sync client.

Canonical product policy lives in:

- `AGENTS.md`
- `apps/extension-vscode/AGENTS.md`
- `docs/current/source-of-truth.md`
- `docs/surfaces/vscode-extension.md`

## Shipping architecture

The sidebar, editor panel, and `@agi` participant send developer turns to the
workspace-scoped AGI app-server. The app-server owns threads, model admission,
tools, approvals, MCP, and Local/BYOK/Managed dispatch. The extension does not
silently forward a Local transcript across a provider boundary. A boundary
change starts a new runtime thread and visibly says that earlier transcript
context was not forwarded.

Cloud account sign-in uses the shared RFC 8628-style device flow:

1. `POST /api/auth/device/code` with `{ "surface": "vscode" }`.
2. Open the same-origin `/auth/device` approval page.
3. Poll `POST /api/auth/device/token`.
4. Store the returned revocable developer credential in VS Code
   `SecretStorage`.

The account token is used for percentage-only usage reads and the optional
account-authenticated provider-stream transport for cloud-backed editor
utilities. `agiWorkforce.useProviderStream` does not reroute sidebar, editor, or
`@agi` developer sessions.

## Current product rules

- Managed Cloud is public alpha and open by default for signed-in users. The
  private-beta/waitlist launch gate is retired; the remaining environment flag
  is an incident-response kill switch.
- Local, BYOK, and Managed Cloud are separate trust boundaries.
- VS Code conversations stay local/workspace scoped and are not synced into Web
  or Mobile consumer chat.
- Model IDs and capability metadata come from the shared model registry and
  generated catalog. Do not hardcode current model names.
- Usage UI consumes the public percentage/reset-time contract. It does not
  expose internal credits, provider cost, or currency conversions.
- Account & Usage links to the existing Web usage, billing, Cloud connector,
  and Team administration surfaces. Web connectors do not replace
  workspace-local MCP configuration.
- Settings that apply only to cloud-backed editor utilities say so explicitly.
  Developer-session reasoning is controlled by the Effort control.

## Demo path

1. Install the production `.vsix`.
2. Open a trusted workspace and ensure the AGI CLI/app-server is available.
3. Open the AGI sidebar.
4. Choose a CLI-discovered Local model or a catalog route admitted by the
   configured account/provider boundary.
5. Send with Enter; use Shift+Enter for a newline.
6. Verify the Local host and provider/Auto-routing labels remain visible.
7. For account-backed utilities, run **AGI Workforce: Sign In to AGI Cloud** and
   approve the device labeled **AGI for VS Code** in the browser.

The checked-in Extension Host integration test verifies activation, manifest
version, command registration, and new-conversation dispatch. A real model turn
still requires the local CLI plus a configured local model, provider credential,
or entitled account.

## Deliberate non-features

- No automatic developer-session chat sync.
- No silent Local-to-BYOK or Local-to-Managed continuation.
- No client-driven billing deduction.
- No invite-code or waitlist modal as a launch gate.
- No claim that VS Code's built-in chat participant works in every VS Code fork;
  the extension-owned webview is the portable primary surface.
