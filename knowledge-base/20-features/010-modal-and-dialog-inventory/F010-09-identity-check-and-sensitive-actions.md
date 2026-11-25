---
id: "F010-09"
type: "feature"
title: "Identity check and sensitive actions"
aliases: ["Reauthentication challenge", "Step-up dialog", "Confirm it is you", "Sensitive-data transfer approval", "Egress approval", "S10.33", "S10.39"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S10.33", "S10.39"]
depends_on: ["SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "api:POST /api/auth/step-up", "api:POST /api/llm/v1/chat/completions/approve"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-09 Identity check and sensitive actions

Before a sensitive account action, a dialog asks the person to prove who they are again. The server refuses the action without a fresh signed proof. Separately, when a tool could send private chat data to an outside place, the approval card says so and names the destination. CLI has no such approval.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.33](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1033), [S10.39](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1039).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Step-up asks for a password, email code, passkey or second-factor code and issues a short-lived signed grant that the server demands for listed actions. Data-transfer approval pauses a tool call that could carry private data out and asks the person to allow or deny it.

**Why it exists.** A stolen session should not be able to delete an account or move ownership. A web page or tool result that tricks the model should not be able to send private chat content to a stranger.

**Who uses it.** Account owners, workspace admins, and anyone using tools that reach outside services.

**Problems it solves**

- Session theft turning into account takeover
- Prompt injection making a tool send private data out
- Unattended runs approving risky sends with nobody present

**Use cases**

- Delete the account and be asked to confirm identity
- Transfer workspace ownership
- Approve a web fetch that could carry private data to a site
- Browser assistant stops on a banking site and asks

## 2. User experience

**Where to find it**

- Web and Electron Desktop: a dialog over the settings action (apps/web/features/auth/StepUpDialog.tsx:103)
- Mobile: modal 'Confirm it is you' during account actions such as delete (apps/mobile/src/features/auth/components/StepUpModal.tsx:263)
- Tool approvals: tool card in chat on web and desktop, tool timeline on mobile, side panel on Chrome
- CLI: no data-transfer approval found

**Before you start**

- Signed in
- For the egress prompt: a tool call is proposed while private context exists
- Mobile step-up for account.delete requires the account actions listed in stepUp.ts (apps/mobile/src/features/auth/services/stepUp.ts:20)

**Screens and controls**

- Dialog shows the action's consequence and, depending on the account, a password field, 'Use a passkey instead', an email code step, or a second-factor field with 'Code from your authenticator app' or 'Backup code' (apps/web/features/auth/StepUpDialog.tsx:67, :374)
- Mobile buttons Cancel, Send code, Sign in again, Try again, Confirm (apps/mobile/src/features/auth/components/StepUpModal.tsx:357)
- Tool card notice 'Private data from this chat could be sent outside AGI. Check where it goes before you allow it.' with Allow and Deny (packages/contracts/types/src/tool-approval-policy.ts:38, packages/ui/unified-chat/src/components/ToolCallCard.tsx:408)

**Journey**

1. Start a sensitive action such as delete account
2. The server answers 403 STEP_UP_REQUIRED naming the action and its consequence
3. The dialog opens and asks for the factor the account has
4. On success a grant token is issued and the action is retried once
5. Egress: the model proposes a tool; the loop finds untrusted content, private data and an outbound path and stops for approval
6. Person reads the summary naming the destination and allows or denies

**What the person sees and gets**

- Egress summary lines such as 'Could send private data from this chat to <host>' or 'to a search engine' or 'out of the sandbox' (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1079)
- Dialog error text for wrong code, expired code, dismissed passkey (apps/web/features/auth/StepUpDialog.tsx:91)
- Audit events step_up_challenged and step_up_satisfied (apps/web/lib/server/step-up-auth.ts:77, :99)

**Settings**

- Tool approval policy: ask every time, auto approve read only, skip approvals (packages/contracts/types/src/tool-approval-policy.ts:4)
- Workspace switch allowAutonomousToolApprovals (packages/contracts/types/src/tool-approval-policy.ts:84)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server action table with a freshness window per action (300 seconds, 120 for revealing an API credential) (apps/web/lib/server/step-up/actions.ts:11, :60)
- requireStepUp verifies a signed grant bound to user, action and optional resource, and audits both outcomes (apps/web/lib/server/step-up-auth.ts:52)
- Grant endpoint /api/auth/step-up checks CSRF, rate limit and session proof (apps/web/app/api/auth/step-up/route.ts:40)
- Many routes call it, including delete-account and transfer-ownership (apps/web/app/api/user/delete-account/route.ts:463, apps/web/app/api/settings/organization/transfer-ownership/route.ts)
- Web hook replays the refused request once with the fresh proof (apps/web/features/settings/hooks/useStepUp.tsx:30)
- Web dialog supports password, email code, passkey and second factor (apps/web/features/auth/StepUpDialog.tsx:51)
- Mobile modal supports second factor, password, email code (apps/mobile/src/features/auth/components/StepUpModal.tsx:14)
- Cloud tool loop escalates to approval when untrusted content, private data and an outbound path meet, marks it high risk and names the destination (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:7816, :7842)
- On an unattended run the escalation is denied because nobody can approve (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:7545)
- Web card and mobile controls show the high-risk notice (packages/ui/unified-chat/src/components/ToolCallCard.tsx:408, apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:200)

**Incomplete**

- Mobile step-up has no passkey prompt kind (apps/mobile/src/features/auth/components/StepUpModal.tsx:14); the brief says code or passkey
- Egress summary names the destination but the data only as 'private data from this chat'; it does not list which data
- Chrome's approvalPolicy is an always-ask rule set for browser actions (downloads, uploads, sensitive sites, payments), not a private-data egress check (apps/extension/src/features/computer-use/approvalPolicy.ts:5, :442)
- Desktop: step-up and tool cards reach the Electron window through the hosted web app [inferred from AGENTS.md section 5]

**Present but disconnected or switched off**

- none found

**Not available**

- CLI data-transfer approval: none found (a search of apps/cli/src for egress returned only agents, config, keybindings and a PowerShell tool)
- VS Code step-up: not applicable per brief

## 4. Required behaviour

**Established requirements**

- Before a sensitive account action a dialog asks the user to prove it is them (code or passkey) and only then proceeds. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.33)
- Before private data is sent to an outside destination the user is asked to approve and told what goes where. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.39)
- Security behaviour fails closed; validate at trust boundaries. (source: doc: AGENTS.md section 6)
- The check runs on the server too; a request without a fresh proof is refused. (source: apps/web/lib/server/step-up-auth.ts:75)

**Acceptance criteria**

1. Delete account without a grant token returns 403 STEP_UP_REQUIRED and changes nothing
2. Cancelling the dialog leaves the account untouched and shows no deletion
3. A wrong code shows an error and allows retry
4. A grant for one action does not authorize another action
5. After the freshness window the same action asks again
6. With private context and an injected page, a web fetch to a new host pauses and names the host
7. On an unattended run the same call is denied, not approved
8. The high-risk card offers Allow and Deny only

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile passkey support is expected by the brief but not by the code [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a passkey option to the mobile modal
- [proposed] List the specific data (files, memory facts) in the egress summary
- [proposed] Add an egress approval to the CLI tool overlay

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | StepUpDialog | `apps/web/features/auth/StepUpDialog.tsx` | Web identity check dialog |
| hook | useStepUp | `apps/web/features/settings/hooks/useStepUp.tsx` | Replays a refused request after a challenge |
| service | step-up-fetch | `apps/web/features/auth/step-up-fetch.ts` | Requests the grant token |
| config | STEP_UP_ACTIONS | `apps/web/lib/server/step-up/actions.ts` | Actions, consequence text, freshness |
| service | requireStepUp | `apps/web/lib/server/step-up-auth.ts` | Server check and audit |
| service | grant-token | `apps/web/lib/server/step-up/grant-token.ts` | Signs and verifies grants |
| endpoint | POST /api/auth/step-up | `apps/web/app/api/auth/step-up/route.ts` | Issues grants after session proof |
| endpoint | DELETE /api/user/delete-account | `apps/web/app/api/user/delete-account/route.ts` | Requires account.delete step-up |
| component | StepUpModal (mobile) | `apps/mobile/src/features/auth/components/StepUpModal.tsx` | Mobile modal |
| service | mobile stepUp service | `apps/mobile/src/features/auth/services/stepUp.ts` | Grant request and cancellation |
| config | tool-approval-policy | `packages/contracts/types/src/tool-approval-policy.ts` | Notice text, labels, policies |
| service | tool-loop egress gate | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | hasPrivateContext, escalation, summaries |
| endpoint | POST /api/llm/v1/chat/completions/approve | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Receives the approval answer |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Shared approval card |
| component | CloudToolApprovalControls | `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx` | Mobile approval with high-risk notice |
| service | extension approvalPolicy | `apps/extension/src/features/computer-use/approvalPolicy.ts` | Chrome always-ask reasons |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends the sensitive request; server finds no valid grant header and replies 403 STEP_UP_REQUIRED | our servers | apps/web/lib/server/step-up-auth.ts:74 |
| Dialog collects the factor from the person and verifies it with the identity provider | outside service | apps/web/features/auth/StepUpDialog.tsx:270 |
| Client asks /api/auth/step-up for a signed grant | our servers | apps/web/app/api/auth/step-up/route.ts:40 |
| Client replays the request with header x-step-up-token; server verifies action, user and resource | device and our servers | apps/web/lib/server/step-up-auth.ts:12, :85 |
| Tool loop evaluates the gate for each tool call and emits an approval-requested event with risk level high | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:7842 |
| Person answers on the card; answer goes to the approve route and the loop resumes | device and our servers | apps/web/app/api/llm/v1/chat/completions/approve/route.ts:706 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Step-up grant token (signed, short-lived) | Client memory; not stored server side [inferred] | No | Expires at the action's freshness window (apps/web/lib/server/step-up/grant-token.ts:76) |
| Audit events step_up_challenged, step_up_satisfied | Security audit log (apps/web/lib/security-audit) | Server | unknown |
| Pending approval checkpoint (messages, pending calls) | Server-side checkpoint (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:7866) | Server | unknown |

**Models and providers.** The model proposes the tool call; the gate is code, not a model judgement. The grant is signed with a key derived from a server secret named CSRF_SECRET (value not recorded).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. Step-up needs an identity method on the account (password, email, passkey or second factor). |
| Permissions | Each action is bound to the user, action and optional resource, so a grant for one workspace cannot move another (apps/web/lib/server/step-up-auth.ts:47). |
| Subscription | none found in the code |
| Limits and metering | Grant endpoint is rate limited under 'auth-verify' (apps/web/app/api/auth/step-up/route.ts:48). |
| Feature flags | Tool approval policy per user; workspace switch for autonomous approvals. |
| Model compatibility | none found in the code |
| Provider restrictions | Identity factors come from the sign-in provider (SYS-authentication-and-identity). |
| Local mode | Step-up applies to cloud account actions. Local chat tool approvals run on the device (CLI and desktop). Whether the egress rule applies to Local mode tools: unknown. A Cloud account's default tool policy is autonomous, where destructive and trifecta cases still ask (packages/contracts/types/src/tool-approval-policy.ts:13, :74). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Dialog starts in a loading prompt | apps/web/features/auth/StepUpDialog.tsx:49 |
| Factor unavailable | 'unavailable' prompt, with sign in again offered | apps/web/features/auth/StepUpDialog.tsx:62, :99 |
| Cancel | onCancel settles the pending call with no token; the request is not replayed | apps/web/features/settings/hooks/useStepUp.tsx:43 |
| Component unmounted or session changed | Pending challenge is retired | apps/web/features/settings/hooks/useStepUp.tsx:55 |
| Expired or mismatched grant | Server refuses with cause expired or subject_mismatch | apps/web/lib/server/step-up-auth.ts:39 |
| Unattended run | Egress escalation denied | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:7545 |
| Accessibility | Not assessed beyond the dialog primitives; not verified | apps/web/features/auth/StepUpDialog.tsx:1 (imports Dialog primitives from @agiworkforce/ui); no accessibility test read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/auth/__tests__/StepUpDialog.test.tsx`: Inferred from name: dialog
- `apps/web/features/settings/hooks/__tests__/useStepUp.challenge-ownership.test.tsx`: Inferred from name: hook ownership
- `apps/web/app/api/auth/step-up/__tests__/route.test.ts`: Inferred from name: grant endpoint
- `apps/web/app/api/settings/organization/transfer-ownership/__tests__/route.step-up.test.ts`: Inferred from name: transfer needs step-up
- `apps/web/e2e/step-up.spec.ts`: Inferred from name: browser flow
- `apps/mobile/__tests__/StepUpModalLifecycle.test.tsx`: Inferred from name: mobile modal
- `apps/web/shared/types/toolApprovalPolicy.test.ts`: Inferred from name: approval policy
- `apps/extension/__tests__/computer-use-browser-control-consent.test.ts`: Inferred from name: browser consent

**Test scenarios**

- **Delete without proof**
  1. Call DELETE /api/user/delete-account with no x-step-up-token
  - Expected: 403 STEP_UP_REQUIRED; profile unchanged
- **Wrong then right code**
  1. Open delete account
  2. Enter a wrong email code
  3. Enter the correct code
  - Expected: Error first, then success and the action continues once
- **Cancel the challenge**
  1. Start the action
  2. Cancel the dialog
  - Expected: Nothing changes; no scheduled deletion
- **Injected fetch**
  1. Give the chat private context
  2. Have a page ask to fetch a new host
  - Expected: Approval card names the host with the high-risk notice
- **Unattended egress**
  1. Run a scheduled task that hits the same condition
  - Expected: Call denied with the escalation log line

**Where to look when it fails**

- Audit events step_up_challenged / step_up_satisfied
- Log '[tool-loop] lethal-trifecta escalation: untrusted content + sensitive source + egress path; requiring approval' (tool-loop.ts:7816)
- Log '[tool-loop] egress escalation denied on an unattended run...' (tool-loop.ts:7545)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)
- Chrome: [70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **Mobile modal has no passkey option** Affects: Mobile users with passkeys. Evidence: apps/mobile/src/features/auth/components/StepUpModal.tsx:14. Work needed: Add passkey prompt
- **Egress approval names destination but not the data** Affects: Web, desktop, mobile. Evidence: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1079. Work needed: Include data kinds in the summary
- **CLI has no sensitive-data transfer approval** Affects: CLI. Evidence: none found under apps/cli/src. Work needed: Add overlay rule
- **Chrome's approval policy is an always-ask list, not a private-data check** Affects: Chrome. Evidence: apps/extension/src/features/computer-use/approvalPolicy.ts:5. Work needed: Decide if Chrome needs a data egress rule
- **Cloud account default tool policy is autonomous, so many sends do not ask unless the trifecta gate fires** Affects: Cloud users. Evidence: packages/contracts/types/src/tool-approval-policy.ts:13. Work needed: Confirm this matches the product intent
- Not built on: CLI (from the capability ledger).

**Depends on**

- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- api:POST /api/auth/step-up
- api:POST /api/llm/v1/chat/completions/approve

## Unknown

- Whether desktop Tauri code has its own step-up dialog
- Retention of audit events
- Whether the egress rule applies to Local mode tool calls
- Whether mobile step-up is used for actions beyond those listed in stepUp.ts
- Brief line references for tool-approval-policy.ts:36 and tool-loop.ts:936 do not match the egress code found at tool-loop.ts:1079 and :7816
