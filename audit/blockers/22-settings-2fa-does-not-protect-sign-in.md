# Settings 2FA doesn't protect sign-in

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

"Two-factor authentication" in Settings is checked only for step-up. Sign-in asks only the identity provider's MFA, which no screen enrolls. Workspace "require MFA" reads the provider flag (`apps/web/lib/mfa-policy-gate.ts:53`), so members who enrolled in Settings count as unenrolled.
