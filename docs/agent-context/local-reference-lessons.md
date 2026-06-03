# Local Reference Lessons For Cloud Agents

Status: Current
Owner: Platform lead
Last updated: 2026-06-03

This file distills lessons from local-only references that may not be available
to cloud agents after this branch is pushed.

Local references inspected in this pass:

- `/Users/siddhartha/Desktop/claude_reference/src`
- `/Users/siddhartha/Desktop/reference/codex-cli`
- `/Users/siddhartha/Desktop/reference/gemini-cli`
- `/Users/siddhartha/Desktop/reference/hermes-agent`
- `/Users/siddhartha/Desktop/reference/opencode`
- `/Users/siddhartha/Desktop/reference/openclaw`

Do not copy proprietary or incompatible code from these references. Use them as
architecture and product-pattern references only.

## Durable Patterns To Preserve

1. **One provider catalog plus overlays.**
   Hermes keeps provider identity in one catalog backed by models.dev and small
   product-specific overlays. AGI should follow the same rule: one canonical
   model/provider catalog, explicit provider overlays, and no parallel model ID
   lists in surfaces.

2. **First-touch onboarding, not blocking setup walls.**
   Hermes uses one-time contextual hints when a user hits a behavior fork. AGI
   should prefer light first-touch hints for local/BYOK/cloud boundaries, tool
   approvals, busy-input behavior, and missing local models instead of long
   first-run questionnaires.

3. **Actions own policy; services own mechanics.**
   The reference CLIs keep domain meaning close to commands/actions and move
   repeated mechanics into shared helpers only when reuse is real. AGI follows
   `docs/engineering/service-layer-architecture.md`: do not rewrite the same
   provider, file, sandbox, browser, or transport mechanics in each surface.

4. **Narrow modules beat broad god files.**
   Codex and opencode both push high-touch CLI/TUI code toward focused modules.
   New AGI CLI/TUI functionality should prefer small owner modules over adding
   unrelated logic to central orchestration files.

5. **No fake provider/model names.**
   Reference CLIs make model/provider onboarding explicit. AGI must verify
   model IDs against official docs or live provider catalogs before exposing
   them. UI labels may be friendly, but API IDs must be real or mapped through a
   clearly documented internal alias.

6. **Public claims need proof.**
   If a page says "live", "notarized", "compliant", "HSTS preload", "RLS on
   every table", "local", "BYOK", "cloud", "free", or "unlimited", the claim
   needs source-code evidence or a dated proof artifact. Otherwise mark it as a
   roadmap/waitlist item.

7. **Permissioned agents need visible boundaries.**
   Browser, VS Code, desktop, CLI, MCP, and computer-use surfaces must validate
   sender/tool arguments and require approval for destructive, external,
   privileged, or expensive actions.

8. **Verification is not only tests.**
   Passing tests is not proof that a feature works. Inspect the actual flow,
   compare public copy to runtime gates, run the smallest relevant check, and
   record any unverified claim as a risk.

## Cloud-Agent Operating Rules

- Read `AGENTS.md`, nearest surface `AGENTS.md`, `TODO.md`, and `PLAN.md`.
- Treat audit/report files as queues, not truth.
- Open source files before making a finding or fix.
- Prefer official docs and live provider catalogs for model/pricing facts.
- Keep public brand copy as `AGI`; keep `AGI Workforce` for the formal platform
  name and internal identifiers.
- Do not introduce new hardcoded model IDs in app code. Use the canonical model
  catalog, provider capabilities, or explicit server-owned config.
- When a surface is intentionally not live, say "waitlist", "private beta", or
  "local-only" in the UI instead of implying it works.
