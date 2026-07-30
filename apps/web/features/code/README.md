# apps/web/features/code

Status: Current
Owner role: Web lead
Last updated: 2026-07-30
Purpose: Authenticated Managed Cloud code-session UI, bounded terminal history, session lifecycle controls, and the Web API client for code sessions.

## Rules

- The feature is capability-honest when Managed execution, migrations, plan access, or E2B are unavailable.
- Session creation, command execution, and closure go through `services/cloud-code-api.ts`; components do not call infrastructure providers directly.
- Do not add local-file claims, private-repository credentials, arbitrary secret injection, or unrestricted network access without explicit authorization and revocation contracts.
