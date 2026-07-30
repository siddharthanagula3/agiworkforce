# Desktop Context Handoff Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the explicit review UI for user-selected context crossing a runtime or trust boundary.

## Boundaries

- Keep context preview, selection, redaction status, and consent UI in this folder.
- Keep secret scanning, payload construction, egress policy, and transport enforcement in their privileged service or Rust owners.
- Never initiate Local-to-BYOK or Local-to-Managed transfer from presentation code.
- Import shared UI primitives from `@/components/ui/*`.
