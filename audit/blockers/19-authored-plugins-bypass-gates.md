# `POST /api/plugins/authored` bypasses the skill and plugin gates

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

`apps/web/app/api/plugins/authored/route.ts:131-145` writes and installs skills inside a self-authored plugin. It skips the personal-skill authoring flag (`AGI_USER_SKILL_AUTHORING`), the workspace "plugins" feature gate and the organization plugin policy. It's the one unflagged route to custom skills, and it ignores admin policy.
