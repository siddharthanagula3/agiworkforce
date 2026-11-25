---
id: "COMP-approvals-and-permissions"
type: "competitor-trace"
title: "Approvals and permissions"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Approvals and permissions: competitors to requirements

Both leaders ask before risky actions and let users pick how often. AGI's ledger (area 59) marks most approval basics done on all six apps from code reading. One web run showed Allow once working. Main gaps: model-judged auto approval, per-site browser rules on mobile and desktop, editing a proposed action, named permission profiles, admin limits, and wallet or financial confirmation. Nothing else is seen working by a person.

**How the products divide this topic.** Review date 2026-11-22. Claude (chat, Cowork, Claude in Chrome, Duet) is documented on support.claude.com. Claude Code (code.claude.com) is the separate coding tool; it reaches the chat product through Desktop code sessions, cloud sessions and shared Chrome. ChatGPT is documented on help.openai.com and learn.chatgpt.com (apps, cloud browser, dots, Work). Codex is the separate coding tool, documented on learn.chatgpt.com and help.openai.com; it shares computer-use and plugin permissions with ChatGPT desktop. The catalogue labels both ChatGPT and Codex as chatgpt, so each capability below names which one the page covers. Many Claude and ChatGPT items are plan-gated (Claude Chrome and Cowork: Pro, Max, Ultra, Team, Enterprise; ChatGPT cloud browser: paid plans; some dot and Work items: Business or Enterprise), and several are beta, preview or rolling out. Documentation availability is not account availability. AGI status below comes from the QA ledger and comparison files (code reading), not from live runs, except where stated.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-approvals-and-permissions-01](#cap-approvals-and-permissions-01) | Per-action approval card (allow once or deny) | yes | yes | built | seen working by a person |
| [CAP-approvals-and-permissions-02](#cap-approvals-and-permissions-02) | Remember a choice (this chat, always) and revoke it | yes | yes | built | code inspected only |
| [CAP-approvals-and-permissions-03](#cap-approvals-and-permissions-03) | Permission modes picker | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-04](#cap-approvals-and-permissions-04) | Run read-only actions without asking, ask before writes | yes | yes | built | code inspected only |
| [CAP-approvals-and-permissions-05](#cap-approvals-and-permissions-05) | Model-judged auto approval (classifier or reviewer agent) | yes | yes | partly built | not verified |
| [CAP-approvals-and-permissions-06](#cap-approvals-and-permissions-06) | Skip all approvals, with floor protections | yes | yes | built | code inspected only |
| [CAP-approvals-and-permissions-07](#cap-approvals-and-permissions-07) | Plan mode: review a plan before any change | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-08](#cap-approvals-and-permissions-08) | Allow, ask and deny rules | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-09](#cap-approvals-and-permissions-09) | Per-tool connector permissions | yes | yes | built | code inspected only |
| [CAP-approvals-and-permissions-10](#cap-approvals-and-permissions-10) | Confirm consequential actions with exact details | yes | yes | built | code inspected only |
| [CAP-approvals-and-permissions-11](#cap-approvals-and-permissions-11) | Money actions never get standing consent | partly | yes | partly built | not verified |
| [CAP-approvals-and-permissions-12](#cap-approvals-and-permissions-12) | Actions never taken without the user in the browser | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-13](#cap-approvals-and-permissions-13) | Per-site browser permissions | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-14](#cap-approvals-and-permissions-14) | Browser approval modes | yes | yes | built | code inspected only |
| [CAP-approvals-and-permissions-15](#cap-approvals-and-permissions-15) | Computer-use per-app approval and tiers | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-16](#cap-approvals-and-permissions-16) | User takeover and hand back | partly | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-17](#cap-approvals-and-permissions-17) | Folder and file access grants | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-18](#cap-approvals-and-permissions-18) | Sandbox and network limits for commands | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-19](#cap-approvals-and-permissions-19) | Unattended runs: ask nobody, so deny or wait | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-20](#cap-approvals-and-permissions-20) | Approve from another device, a notification or a chat app | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-21](#cap-approvals-and-permissions-21) | Approval expiry, history and receipts | partly | partly | built | code inspected only |
| [CAP-approvals-and-permissions-22](#cap-approvals-and-permissions-22) | Answer with a note, or say what to do instead | yes | unknown | built | code inspected only |
| [CAP-approvals-and-permissions-23](#cap-approvals-and-permissions-23) | Edit the proposed action before approving | unknown | unknown | not built | not verified |
| [CAP-approvals-and-permissions-24](#cap-approvals-and-permissions-24) | Approval before opening generated links | unknown | yes | partly built | not verified |
| [CAP-approvals-and-permissions-25](#cap-approvals-and-permissions-25) | Standing rules that add approval steps | unknown | yes | partly built | not verified |
| [CAP-approvals-and-permissions-26](#cap-approvals-and-permissions-26) | Hooks on permission requests | yes | yes | partly built | not verified |
| [CAP-approvals-and-permissions-27](#cap-approvals-and-permissions-27) | Subagent and teammate permission inheritance | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-28](#cap-approvals-and-permissions-28) | Trust check for project servers and imports | yes | yes | partly built | code inspected only |
| [CAP-approvals-and-permissions-29](#cap-approvals-and-permissions-29) | Admin controls over approvals | yes | yes | partly built | code inspected only |

## CAP-approvals-and-permissions-01 Per-action approval card (allow once or deny)

Before a risky tool call runs, a card shows the action and the user allows it once or denies it. The run then continues or stops.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code, Claude (connectors): yes**
  - [https://code.claude.com/docs/en/permissions.md](https://code.claude.com/docs/en/permissions.md): Default (Manual) mode prompts before most edits, shell commands and network requests. Apps: cli, ide, desktop.
  - [https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): Connector tool requests ask for approval with an Allow always option. Apps: web, desktop.
- **ChatGPT, Codex: yes**
  - [https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt](https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt): Approval card offers Deny, Allow once, Allow low-risk, Always allow before an app action runs. Some sensitive actions are denied outright. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Codex approval decisions: accept, accept for session, decline, cancel, rule amend. Apps: cli, ide, desktop.

**AGI requirement** (inferred; source: competitor parity; docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-01). Every action that changes something outside the chat waits for an explicit allow or deny on every app, and a denial is reported back to the model.

**With different models, providers and the one subscription.** The gate lives in AGI's runtime, not in the model, so it behaves the same for every model and provider. Approving costs nothing under the AGI Subscription. In Local mode the card and the decision stay on the device with no server call.

**Current implementation, as this trace read it on 2026-11-24: built.** Ledger says done on web, desktop, mobile, CLI, VS Code, Chrome and API; code reading only, one live web run. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.01, S59.19, S59.20, S59.30
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/ToolCallCard.tsx:476`; `apps/web/app/api/llm/v1/chat/completions/approve/route.ts:328`; `apps/desktop/electron/runtime/permissionManager.ts:292`; `apps/cli/src/tui/widgets/approval_overlay.rs:81`

**Gap.** none known

**Acceptance criteria**

1. Ask a model to run a tool that writes; a card appears and nothing runs before a choice.
2. Tap Allow once; the tool runs once and the next call asks again.
3. Tap Deny; the tool does not run and the model's reply says it was denied.
4. Repeat with two different providers; the card and outcome are the same.

**Verification: seen working by a person.** 5-results/basics/scorecards/web.csv W-15: after Start work and two Allow-once approvals the task finished with the correct result (web only). 6-defects row W-15: the card labels a read-only PDF read 'High risk' (cosmetic).

## CAP-approvals-and-permissions-02 Remember a choice (this chat, always) and revoke it

The user can allow a tool for the rest of the session or permanently, and later review and withdraw saved allows.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code, Claude Code desktop: yes**
  - [https://code.claude.com/docs/en/permissions.md](https://code.claude.com/docs/en/permissions.md): 'Yes, don't ask again' saves a rule for that repo; file-edit approvals last only until session end. Apps: cli.
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Site approval card has Allow once, Always allow, Deny; always-allow is per site on the device and revocable in Settings. Apps: desktop.
- **ChatGPT, Codex: yes**
  - [https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt](https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt): Always allow is withheld from managed-workspace members, auto-available connections and actions needing extra safety review. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/computer-use.md](https://learn.chatgpt.com/docs/computer-use.md): Always allow remembers the app and can be revoked in settings. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Offer allow once, allow for this chat, and always allow; show every saved allow in settings and let the user remove it. Some sensitive actions never offer always allow.

**With different models, providers and the one subscription.** Saved rules are keyed to tool and connector, not to a model, so switching model or provider keeps them. They sync with the account; in Local mode they are stored on the device only.

**Current implementation, as this trace read it on 2026-11-24: built.** Ledger done on all apps except VS Code revoke (not listed) and mobile revoke; web in-chat card has the four choices. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.03, S59.07, S59.25
- Comparison list ids: CP184, MP63
- Code: `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx:60`; `apps/web/app/api/connectors/permissions/route.ts:102`; `apps/desktop/electron/runtime/dispatcher.ts:708`

**Gap.** Mobile card is Partial against ChatGPT's card (MP63). VS Code has no revoke row in the ledger.

**Acceptance criteria**

1. Choose Allow for this chat; the same tool does not ask again in that chat but asks in a new chat.
2. Choose Always allow; it appears in settings; remove it; the next call asks again.
3. On a sensitive action, Always allow is not offered.

**Verification: code inspected only.** Ledger S59.03 and S59.25 code lines; no live result.

## CAP-approvals-and-permissions-03 Permission modes picker

A setting that decides how often the agent asks: ask every time, accept edits, plan, auto, or skip approvals.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/permissions.md](https://code.claude.com/docs/en/permissions.md): Modes: default (Manual), acceptEdits, plan, auto, dontAsk, bypassPermissions. Shift+Tab cycles them in the CLI. Apps: cli, ide, desktop.
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Desktop modes: Manual, Accept edits, Plan, Auto, Bypass permissions; default mode and per-folder memory. Apps: desktop.
- **Codex, ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/agent-approvals-security.md](https://learn.chatgpt.com/docs/agent-approvals-security.md): Two layers: sandbox mode and approval policy. Local default has no network and writes only to the workspace. Apps: cli, desktop, ide.
  - [https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt](https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt): App levels: Always ask, Allow read, Allow low-risk, Allow all (per app or connection). Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-01; docs/decisions/2026-11-13-founder-decisions.md (three approval choices keep their full statement in Settings)). Every app has one mode picker with the same three AGI choices (ask before every action, run read-only actions without asking, skip approvals) and the chosen mode is remembered. Coding surfaces may add accept-edits and plan.

**With different models, providers and the one subscription.** Mode wording and behaviour come from one shared contract, so they do not change with model or provider. Mode is not billed. Local mode uses the same modes; skip approvals still asks for destructive actions.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Three-choice picker done on web, mobile, CLI, Chrome; code-session modes (ask, accept edits, auto, bypass) are Partial on desktop and web; VS Code Partial; mobile cloud task mode picker Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.08, S59.10, S59.11
- Comparison list ids: DP46, DP51, M192, MP59, VP36, VP73, WP155, WP256, XP11
- Code: `packages/contracts/types/src/tool-approval-policy.ts:54`; `apps/web/features/code/components/CodeComposer.tsx:1363`; apps/mobile/src/features/chat/components/ComposerApprovalMode.tsx (not found) (not found); `apps/cli/src/cli_options.rs:10`

**Gap.** Code-session mode lists differ by app and are Partial in comparison files; mobile cloud task mode picker missing (M192).

**Acceptance criteria**

1. On each app, open the mode picker; the three AGI choices are listed with the same wording.
2. Pick Ask before every action; even a read asks.
3. Pick Skip approvals; a destructive action still asks.
4. Restart the app; the mode is still selected.

**Verification: code inspected only.** Ledger S59.08; scorecard W-15 shows approvals in use but not the picker.

## CAP-approvals-and-permissions-04 Run read-only actions without asking, ask before writes

Reads, searches and sandboxed code run on their own while writes, sends, purchases and unknown tools still ask.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code, Claude: yes**
  - [https://code.claude.com/docs/en/permissions.md](https://code.claude.com/docs/en/permissions.md): Plan mode explores with reads and read-only shell commands but does not edit source files. Apps: cli, ide.
  - [https://support.claude.com/en/articles/12684923-microsoft-365-connector-security-guide](https://support.claude.com/en/articles/12684923-microsoft-365-connector-security-guide): Outside auto-approve modes Claude asks to confirm sends, forwards and event changes. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: chat, Cowork.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt](https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt): Allow read: read freely but ask to change. Allow low-risk: auto-approve low-risk actions. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-01). In the default mode, non-mutating tools run without asking; writes, sends, purchases, credential changes and actions on the user's machine ask.

**With different models, providers and the one subscription.** Risk class belongs to the tool, not the model, so every provider gets the same split. No billing effect. In Local mode reads on local files still count as device actions and follow the same table.

**Current implementation, as this trace read it on 2026-11-24: built.** Ledger done on all six apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.09, S59.10, S59.11
- Comparison list ids: WP162
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:381`; `packages/contracts/types/src/tool-approval-policy.ts:54`; `apps/mobile/app/(app)/settings/auto-approve.tsx:47`

**Gap.** WP162 account-wide default is Partial.

**Acceptance criteria**

1. In the read-only mode, a web search runs with no card.
2. A file write or email send in the same chat shows a card.
3. An unknown connector tool asks.

**Verification: code inspected only.** Ledger S59.10, S59.11.

## CAP-approvals-and-permissions-05 Model-judged auto approval (classifier or reviewer agent)

A second check decides routine approvals so the user is not interrupted, blocking unsafe actions and asking when blocks repeat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code; Claude in Chrome; Cowork: yes**
  - [https://code.claude.com/docs/en/auto-mode-config.md](https://code.claude.com/docs/en/auto-mode-config.md): A classifier reviews each tool call and blocks irreversible, destructive or out-of-environment actions; deny and ask rules run first. Plans: All users on every provider. Apps: cli, ide, desktop.
  - [https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide): Automatically approve mode: a safety check blocks unsafe actions and falls back to asking if blocks repeat. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: chrome.
- **Codex, ChatGPT desktop browser: yes**
  - [https://learn.chatgpt.com/docs/sandboxing/auto-review.md](https://learn.chatgpt.com/docs/sandboxing/auto-review.md): A separate reviewer agent decides eligible approval requests and returns a rationale; only applies when approvals are interactive and sandbox boundaries exist. Apps: desktop, cli, ide.
  - [https://help.openai.com/en/articles/20001510-manage-browser-and-computer-use-in-your-enterprise-workspace](https://help.openai.com/en/articles/20001510-manage-browser-and-computer-use-in-your-enterprise-workspace): Eligible browser actions can be auto-reviewed at no usage cost when signed in with ChatGPT. Plans: Enterprise. Apps: desktop.

**AGI requirement** (proposed; source: competitor parity; owner has not decided). Proposed: offer an optional reviewer that judges each action, never above explicit deny rules, pausing and asking after repeated blocks.

**With different models, providers and the one subscription.** The reviewer is a model call, so it must be chosen by the registry, work with any provider, and count against the AGI Subscription usage. In Local mode it may only use the local model; it must never send the action to a server without a consent fork.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI Partial (classifier row); desktop Partial; VS Code Missing; web code sessions Partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C152, C160, C167, CP63, CP95, D56, DP58, V35, V74
- Code: `apps/cli/src/safety/approval.rs`; `apps/cli/src/tui/approval_broker.rs:352`; `packages/contracts/types/src/tool-approval-policy.ts:60`

**Gap.** No reviewer agent on desktop or VS Code; CLI lacks custom rules, pause after repeated blocks and classify-all-shell.

**Acceptance criteria**

1. With the reviewer on, a routine read runs with no card and shows a rationale.
2. A destructive command is blocked and the user is asked.
3. Three blocks in a row return control to the user.
4. Its token use appears in AGI Subscription usage.

**Verification: not verified.** Comparison rows only; no live result.

## CAP-approvals-and-permissions-06 Skip all approvals, with floor protections

A mode with no prompts, behind a warning, where a few actions still ask or are blocked.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/permissions.md](https://code.claude.com/docs/en/permissions.md): bypassPermissions skips prompts except for actions no mode auto-approves, including writes to .git and .claude; for containers or VMs. Apps: cli.
  - [https://code.claude.com/docs/en/env-vars.md](https://code.claude.com/docs/en/env-vars.md): Critical-path rm commands get time limits, denials or prompts even in auto and bypass modes. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/agent-approvals-security.md](https://learn.chatgpt.com/docs/agent-approvals-security.md): Full access flag (--yolo / dangerously-bypass) runs without approval prompts. Apps: cli, desktop, ide.
  - [https://learn.chatgpt.com/docs/enterprise/security-cookbook.md](https://learn.chatgpt.com/docs/enterprise/security-cookbook.md): Admins can restrict permission profiles and block Full Access/--yolo. Apps: cli, desktop, ide.

**AGI requirement** (stated requirement; source: packages/contracts/types/src/tool-approval-policy.ts (Skip approvals text); docs/decisions/2026-11-13-founder-decisions.md). Skip approvals exists on every app but still asks for destructive or irreversible actions, unknown connector tools, and sends after untrusted content meets private data. Workspace blocks and Deny choices win.

**With different models, providers and the one subscription.** Floor rules are enforced in AGI code, so a stronger or different model cannot lift them. Same in Local mode.

**Current implementation, as this trace read it on 2026-11-24: built.** Skip choice present on web, mobile, CLI, VS Code, Chrome; Chrome row Partial. CLI bypass behind flag; refuse-as-root Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.08, S59.28
- Comparison list ids: C185, XP11
- Code: `packages/contracts/types/src/tool-approval-policy.ts:54`; `apps/cli/src/lib.rs:310`; `apps/extension-vscode/src/features/permissions/agentModeConsent.ts`

**Gap.** CLI bypass does not refuse to run as root (C185).

**Acceptance criteria**

1. Pick Skip approvals; a safe tool runs with no card.
2. A file deletion still asks.
3. If the workspace forbids autonomous mode, the choice is unavailable to members.

**Verification: code inspected only.** Ledger S59.28; code in tool-approval-policy.ts.

## CAP-approvals-and-permissions-07 Plan mode: review a plan before any change

The agent explores read-only and proposes a plan; the user approves before edits start.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code; Claude in Chrome: yes**
  - [https://code.claude.com/docs/en/permissions.md](https://code.claude.com/docs/en/permissions.md): Plan mode: Claude explores with reads and does not edit source files. Apps: cli, ide.
  - [https://code.claude.com/docs/en/chrome.md](https://code.claude.com/docs/en/chrome.md): Browser tools in plan mode prompt first. Apps: cli.
- **Codex, ChatGPT Work: yes**
  - [https://learn.chatgpt.com/docs/glossary.md](https://learn.chatgpt.com/docs/glossary.md): Plan mode and plan steps are defined terms for Codex. Apps: cli, desktop, ide.
  - [https://chatgpt.com/work/](https://chatgpt.com/work/): Plan mode listed for Work. Apps: unknown.

**AGI requirement** (inferred; source: competitor parity). Plan review before changes on every app that runs multi-step work.

**With different models, providers and the one subscription.** The plan step is a prompt and UI step, so it works with any model; a cheaper model may plan if routing allows it, billed under the subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI, desktop, VS Code Same; Chrome Partial; web plan mode and step limit Partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: V17, VP77, WP149, XP2
- Code: `apps/cli/src/tui/tui_app.rs:5564`; `apps/web/features/code/code-surface.ts:232`; `apps/extension/src/features/side-panel/agiWorkPlanReview.ts`

**Gap.** Plan approval choices and restoring plan mode on resume are missing in VS Code (VP77, V17).

**Acceptance criteria**

1. Turn on plan mode; the agent proposes a plan and makes no edits.
2. Approve the plan; edits then proceed under the current mode.
3. Reject the plan; no file changes.

**Verification: code inspected only.** Comparison rows.

## CAP-approvals-and-permissions-08 Allow, ask and deny rules

Written rules on tools and paths. Deny is checked first, then ask, then allow.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/permissions.md](https://code.claude.com/docs/en/permissions.md): Rules evaluate deny, then ask, then allow; first match wins regardless of specificity. Apps: cli.
  - [https://code.claude.com/docs/en/hooks-guide.md](https://code.claude.com/docs/en/hooks-guide.md): A hook allow does not bypass deny rules; a hook deny blocks even in bypassPermissions. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/agent-configuration/rules.md](https://learn.chatgpt.com/docs/agent-configuration/rules.md): Smart approvals propose prefix rules. Apps: cli, desktop, ide.
  - [https://learn.chatgpt.com/docs/enterprise/security-cookbook.md](https://learn.chatgpt.com/docs/enterprise/security-cookbook.md): Prefix rules can require approval or forbid commands. Apps: cli, desktop, ide.

**AGI requirement** (inferred; source: competitor parity). Users and admins can write allow, ask and deny rules; deny always wins and nothing, including a hook or a model, can loosen it.

**With different models, providers and the one subscription.** Rules are checked before any model output is used, so they bind every provider. Local mode uses the same file on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI has rules and wildcards (Partial for Tool(specifier) syntax); VS Code can view and edit rules (Partial); web and desktop have per-connector rules only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.04, S59.07
- Comparison list ids: C116, CP101, CP184, VP83
- Code: `apps/cli/src/permissions.rs:698`; `apps/cli/src/platform/policy/engine.rs:350`; `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:985`

**Gap.** Rule syntax is Partial against Claude Code; deny rules for named subagents Missing (C116).

**Acceptance criteria**

1. Add a deny rule for a command; the command is refused even in skip mode.
2. Add a narrow allow inside a broad deny; the deny still wins.
3. A hook that returns allow cannot override the deny.

**Verification: code inspected only.** Comparison rows; no live result.

## CAP-approvals-and-permissions-09 Per-tool connector permissions

Each connected app and each of its tools gets always allow, needs approval, always ask, or block.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat, Cowork): yes**
  - [https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Connector tool permissions: Always allow, Needs approval, Always ask (rolling out), Block; set under Customize > Connectors > Permissions. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: unknown.
  - [https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities): A setting makes Claude ask before each use of a chosen connector tool. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt](https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt): Per-connected-account override with reset to Default; levels Always ask, Allow read, Allow low-risk, Allow all. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md (where ChatGPT or Claude ships a connector capability, it is built)). Every connector tool has an allow, ask or block setting and the runtime enforces it, including in scheduled runs.

**With different models, providers and the one subscription.** Enforcement is in the tool gate before the call leaves AGI, for any model. Connector use follows the account's plan limits. Local mode: connectors that need our servers are unavailable and say so.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on web, desktop, mobile, CLI, VS Code and API. Per-account override Missing on web and mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.04, S59.09
- Comparison list ids: M131, MP107, MP61, W245, WP174, WP313
- Code: `apps/web/features/connectors/components/ToolPermissionsPanel.tsx:66`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:67`; `apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:278`

**Gap.** Per-account override with reset (W245, M131); mobile per-role levels Partial.

**Acceptance criteria**

1. Set a connector tool to Block; asking the model to use it fails with a clear reason.
2. Set it to Needs approval; a card appears.
3. Set it to Always allow; no card, including in a scheduled run if allowed.

**Verification: code inspected only.** Ledger S59.04.

## CAP-approvals-and-permissions-10 Confirm consequential actions with exact details

Before sending, booking, buying, signing or deleting, the card names the recipients, destination, amount, command or files affected.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (connectors, Duet); Claude Code: yes**
  - [https://support.claude.com/en/articles/17631495-get-started-with-claude-duet](https://support.claude.com/en/articles/17631495-get-started-with-claude-duet): Shows the planned action and waits for approval before sending, paying, signing or deleting; queues approvals if unavailable. Plans: Pro, Max, Ultra. Apps: ios, android (preview).
  - [https://support.claude.com/en/articles/14730684-how-claude-suggests-connected-apps](https://support.claude.com/en/articles/14730684-how-claude-suggests-connected-apps): Claude checks details before any booking or purchase. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/enterprise/chatgpt-work-overview.md](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-overview.md): Even on allowed sites ChatGPT can ask separately before actions creating a financial, legal or account commitment. Plans: Business, Enterprise, Edu. Apps: web, desktop.
  - [https://learn.chatgpt.com/docs/plugins.md](https://learn.chatgpt.com/docs/plugins.md): Apple Messages sends need approval of message and recipients by default. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md (Gmail send after approval every time); docs/product/definition.md (no fallback bypasses confirmations)). Every send, payment, purchase, booking, signature and deletion shows exact recipient, destination, amount or affected items before it runs, and each such action asks each time unless the owner has chosen otherwise.

**With different models, providers and the one subscription.** Details are taken from the tool call, not the model's wording, so a model cannot hide them. Works the same across providers. In Local mode only device actions apply.

**Current implementation, as this trace read it on 2026-11-24: built.** Ledger done for recipients, destination, amount on all six apps; command, files and diff done on five (not Chrome). Web consequential website actions Partial; mobile approval cards Partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.12, S59.13, S59.14, S59.15, S59.16, S59.17, S59.18, S59.28
- Comparison list ids: MP65, MP90, WP142
- Code: `packages/ui/unified-chat/src/components/ToolCallCard.tsx:324`; `packages/contracts/types/src/tool-approval-stakes.ts:126`; `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:31`

**Gap.** Consequential website actions on web and mobile card gaps are Partial.

**Acceptance criteria**

1. Ask the agent to email someone; the card lists the exact recipients.
2. Ask it to run a command; the card shows the exact command line.
3. Ask it to edit a file; the card shows the diff.
4. Ask it to buy something; the card shows the amount and item.

**Verification: code inspected only.** Ledger S59.12 to S59.18.

## CAP-approvals-and-permissions-11 Money actions never get standing consent

Payments and trades always need a per-transaction confirmation, even if the user chose Allow all, including in scheduled tasks. ChatGPT also documents a wallet with biometric approval.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude, Claude Desktop: partly**
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Claude never buys, creates accounts or bypasses CAPTCHAs on sites; those need user input even on approved sites. Apps: desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt](https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt): For trades via finance plugins a saved permission, even Allow all, never grants standing consent, including for scheduled tasks; the provider's per-transaction confirmation remains required. Apps: unknown.
  - [https://help.openai.com/en/articles/20001654-making-purchases-with-c](https://help.openai.com/en/articles/20001654-making-purchases-with-c) (this address is not in the saved catalogue; treat as unverified): ChatGPT Wallet: the dot pays with a tokenized card after your approval. Apps: unknown.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md (no fallback bypasses confirmations)). Payments, purchases and trades always need a fresh user decision on every surface and in every mode, including skip approvals and scheduled runs. Whether to build a wallet is not decided.

**With different models, providers and the one subscription.** The rule is in the gate, not the model. Spending is the user's own money, not AGI Subscription credit; the two must never be mixed. Local mode has no payment tool.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Exact amount shown in cards (done on six apps). Wallet and trade confirmation Missing on web, desktop, mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.15, S59.28
- Comparison list ids: D157, M215, M9, W261, W262
- Code: `packages/contracts/types/src/tool-approval-stakes.ts:127`; `apps/mobile/lib/v1FeatureFlags.ts:21`

**Gap.** Standing-consent rule for trades and scheduled runs is not confirmed in code reading; wallet Missing.

**Acceptance criteria**

1. With skip approvals on, a purchase tool still asks.
2. A scheduled run that reaches a purchase pauses rather than buying.
3. The card shows exact amount and merchant.

**Verification: not verified.** No live result.

## CAP-approvals-and-permissions-12 Actions never taken without the user in the browser

Even in the most automatic browser mode, some steps always need the user: buying, creating accounts, CAPTCHAs, entering sensitive data, permanent deletion, changing permission settings.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude in Chrome; Claude Code desktop: yes**
  - [https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide): Changing permission settings, granting authorizations, entering sensitive info and permanent deletions require approval in every mode. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: chrome.
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Claude never buys, creates accounts or bypasses CAPTCHAs on sites. Apps: desktop.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/dots/computers-and-apps.md](https://learn.chatgpt.com/docs/dots/computers-and-apps.md): Private website sign-in requests and Take over to sign in. Apps: unknown.
  - [https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs](https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs): Password changes and money transfers require user takeover; deleting data or installing software need approval each time. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (no fallback bypasses permissions or confirmations); docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-01). A fixed list of actions always needs the user in every mode: deletes, permission changes, sensitive input, purchases, account creation, CAPTCHA.

**With different models, providers and the one subscription.** List is held in AGI code and cannot be changed by model output. Same list for every provider and in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chrome extension and desktop have it, marked Partial (Chrome XP12) or Same (desktop browser safeguards). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.28
- Comparison list ids: DP40, XP12, XP20
- Code: `apps/extension/src/features/computer-use/approvalPolicy.ts:1`; `apps/extension/src/features/computer-use/crucialActions.ts:1`

**Gap.** Chrome list is Partial against Claude's (XP12); desktop per-site rules Partial.

**Acceptance criteria**

1. In the most automatic mode, ask the agent to delete a record; it asks.
2. Ask it to change a permission setting; it asks.
3. Ask it to create an account or solve a CAPTCHA; it stops and hands over.

**Verification: code inspected only.** Comparison XP12.

## CAP-approvals-and-permissions-13 Per-site browser permissions

The user allows or blocks specific sites for the agent, once, always or per site, and can review the list.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude in Chrome; Claude Code desktop: yes**
  - [https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide): Per-site prompts: allow once, always allow, decline; extension settings list approved sites and permission history. Always-allow still asks before downloads and sensitive input. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: chrome.
  - [https://support.claude.com/en/articles/16607400-use-the-built-in-bro](https://support.claude.com/en/articles/16607400-use-the-built-in-bro) (this address is not in the saved catalogue; treat as unverified): Browser safeguards: site permission, blocked sites, action checks. Apps: unknown.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt](https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt): Settings > Cloud browser: Always ask, Auto approve (pause only if unsafe) or Always allow, plus per-site overrides; payments still need confirmation. Plans: Paid plans. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Chrome: capture and action approvals)). Each browser-acting surface keeps a per-site allow and block list with a default policy and a list the user can edit.

**With different models, providers and the one subscription.** Site rules apply no matter which model drives the browser. The browser runs on the device or on our servers; the UI must say which. In Local mode only the on-device browser applies.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chrome done (site prompt, approved list); web, desktop Partial or Missing; mobile Missing; CLI Partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.06
- Comparison list ids: CP88, DP40, M59, M66, W140, W323
- Code: `apps/extension/src/options.ts:1291`; `apps/extension/src/features/side-panel/bubbles.ts:1388`; `apps/cli/src/browser_bridge.rs:1`

**Gap.** Mobile has no site permissions (M66, M59); web cloud browser settings Missing (W323); desktop local turns do not read workspace site lists (ledger S59.06 unfinished note).

**Acceptance criteria**

1. On a new site the agent asks; choose Allow once; it asks again next time.
2. Choose Always allow; it does not ask for that site but still asks before a download.
3. Remove the site from the list; it asks again.
4. Block a site; the agent will not act there.

**Verification: code inspected only.** Ledger S59.06 and comparison rows.

## CAP-approvals-and-permissions-14 Browser approval modes

A side-panel setting: review every action, automatic with a safety check, or skip all approvals.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude in Chrome; Cowork: yes**
  - [https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide): Manually approve, Automatically approve and Skip all approvals; skip has no pausing and no automatic checks. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: chrome.
  - [https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely](https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely): Auto mode sees the latest screenshot, which Anthropic may retain. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: chrome.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/browser.md](https://learn.chatgpt.com/docs/browser.md): Cloud browser website permissions: Always ask, Auto approve, Always allow; confirmation before consequential actions like payment. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Chrome: capture and action approvals); docs/product/requirements.md (consent before sending browser data or screenshots to the provider)). The Chrome extension offers ask every action, automatic with pauses for risky steps, and skip all approvals, remembered across sessions, with data retention for any screenshot check disclosed.

**With different models, providers and the one subscription.** Screenshots sent for a safety check go to a provider, so they need consent and a visible provider label. Check cost counts under the AGI Subscription.

**Current implementation, as this trace read it on 2026-11-24: built.** Chrome Same for ask-every-action, remembered mode, default in settings; automatic mode and skip Partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.08
- Comparison list ids: X23, XP11, XP20
- Code: `apps/extension/src/side_panel.ts:14761`; `apps/extension/src/side_panel.ts:14872`

**Gap.** Admin control over modes Missing (X23).

**Acceptance criteria**

1. Switch to ask-every-action; each step pauses.
2. Switch to automatic; a risky step still pauses.
3. Reload the extension; the mode is kept.

**Verification: code inspected only.** Comparison rows.

## CAP-approvals-and-permissions-15 Computer-use per-app approval and tiers

Before the agent controls a native app it asks per app; some app types are view-only or click-only, and a blocklist exists.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code desktop; Cowork: yes**
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Allow for this session or Deny; tiers: view-only for browsers and trading platforms, click-only for terminals and IDEs, full for others; Dispatch approvals expire after 30 minutes. Apps: desktop.
  - [https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork): Per-app permissions, blocklist and app tiers; action review scans for prompt injection. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
- **ChatGPT desktop, Codex: yes**
  - [https://learn.chatgpt.com/docs/computer-use.md](https://learn.chatgpt.com/docs/computer-use.md): Asks before using an app and may ask again before sensitive actions; Always allow can be revoked; stop or take over any time. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (desktop computer use under permission and confirmation rules)). Desktop computer use asks per app, remembers only what the user saves, lets the user revoke, and refuses or limits sensitive app types.

**With different models, providers and the one subscription.** Runs on the device. Screenshots sent to a provider need consent and a provider label; in Local mode they stay on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Per-app ask with Always allow is Same on desktop; tiers Missing (D36); 30 minute expiry Partial; admin app limits Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.25, S59.29
- Comparison list ids: D146, D36, DP27
- Code: `apps/desktop/electron/runtime/applicationControl.ts:56`; `apps/desktop/electron/runtime/computerUseSession.ts:274`

**Gap.** No view-only or click-only tiers (D36); admin limits Missing (D146).

**Acceptance criteria**

1. Ask the agent to use a native app; a per-app prompt appears.
2. Revoke the app in settings; it asks again.
3. A browser or terminal app is not fully controllable.

**Verification: code inspected only.** Comparison D36 searched and found nothing.

## CAP-approvals-and-permissions-16 User takeover and hand back

While the agent drives a screen or browser, the user can take over, type something private, and hand control back.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (cloud session to CLI): partly**
  - [https://support.claude.com/en/articles/12618689-use-claude-code-in-t](https://support.claude.com/en/articles/12618689-use-claude-code-in-t) (this address is not in the saved catalogue; treat as unverified): Open in CLI to take over a cloud session. Apps: unknown.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/browser.md](https://learn.chatgpt.com/docs/browser.md): Take over the cloud computer. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/enterprise/dots-security.md](https://learn.chatgpt.com/docs/enterprise/dots-security.md): Owner can view the dot's cloud computer, Take over, then Return control. Plans: Enterprise. Apps: desktop, web.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md). Wherever the agent controls a screen or browser, the user can take over, stop, and hand back; private typing is not captured in screenshots.

**With different models, providers and the one subscription.** Control handoff is local UI logic and works with any model. Cloud browser sessions run on our servers and count under the subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on desktop and Chrome; web cloud browser takeover Missing (W170). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.29
- Comparison list ids: W170
- Code: `apps/desktop/electron/runtime/computerUseSession.ts:274`; `apps/extension/src/features/side-panel/bubbles.ts:1520`

**Gap.** Web takeover Missing; mobile has no takeover row.

**Acceptance criteria**

1. While the agent controls a page, press Take over; the agent stops.
2. Type into a field; the typing is not in any saved screenshot.
3. Hand back; the same run continues.

**Verification: code inspected only.** Ledger S59.29.

## CAP-approvals-and-permissions-17 Folder and file access grants

The agent can only touch folders the user granted, and denied paths (secrets) stay off limits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/permissions.md](https://code.claude.com/docs/en/permissions.md): Read and Edit deny rules for files; symlink-aware permission checks. Apps: cli.
  - [https://code.claude.com/docs/en/sandboxing.md](https://code.claude.com/docs/en/sandboxing.md): Sandbox filesystem allowWrite, denyWrite, denyRead, allowRead. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/permissions.md](https://learn.chatgpt.com/docs/permissions.md): Permission profiles: filesystem access levels read, write, deny; deny-read globs for secrets such as env files. Apps: cli, desktop, ide.

**AGI requirement** (stated requirement; source: docs/product/definition.md (approved folders on Desktop)). The agent reaches only folders the user attached and can be told to never read secret paths. The user can revoke each folder.

**With different models, providers and the one subscription.** Grants are local and independent of model. In Local mode no file leaves the device. In Cloud mode file content sent to a provider needs consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on desktop, CLI, VS Code; named permission profiles Missing on CLI and VS Code. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.05, S59.25
- Comparison list ids: C200, C225, V45
- Code: `apps/desktop/electron/runtime/dispatcher.ts:704`; `apps/cli/src/path_security.rs:115`; `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1013`

**Gap.** No named profiles (C225, C200, V45).

**Acceptance criteria**

1. Attach one folder; ask the agent to read outside it; it is refused or asks.
2. Revoke the folder; the agent loses access.
3. A deny-read path is never read in any mode.

**Verification: code inspected only.** Ledger S59.05.

## CAP-approvals-and-permissions-18 Sandbox and network limits for commands

Commands run in an OS sandbox with limited files and network; domains can be allowed or denied.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/sandboxing.md](https://code.claude.com/docs/en/sandboxing.md): Auto-allow runs sandboxed commands without prompts (deny rules, critical-path rm, ask rules still apply). Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/agent-approvals-security.md](https://learn.chatgpt.com/docs/agent-approvals-security.md): Optional network proxy with domain allow and deny rules; deny wins; Local default has no network. Apps: cli, desktop, ide.

**AGI requirement** (stated requirement; source: AGENTS.md section 6 and docs/product/definition.md (explicit execution boundaries between device and servers)). Local command execution is sandboxed by default with network off, and the user sees which limits apply.

**With different models, providers and the one subscription.** The sandbox protects the device whatever model proposes the command. Local mode keeps network off unless the user opens it.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI sandbox on by default, network off (Same); VS Code Partial; Windows sandbox Missing; domain lists Partial; web cloud sandbox network levels Same. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: CP274, CP278, CP98, VP37, VP69
- Code: `apps/cli/src/sandbox.rs:8`; `apps/cli/src/sandbox.rs:275`; `packages/contracts/types/src/cloud-code.ts:4`

**Gap.** No sandbox on Windows CLI; VS Code has only a handoff; domain controls Partial.

**Acceptance criteria**

1. Run a command that reaches the internet in the default sandbox; it is blocked.
2. Allow one domain; only that domain works.
3. The sandbox mode is visible in the approval card.

**Verification: code inspected only.** Comparison rows.

## CAP-approvals-and-permissions-19 Unattended runs: ask nobody, so deny or wait

Scheduled or background runs either deny anything that needs a prompt, or wait for approval, and use their own saved permission mode.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code; Claude Code desktop: yes**
  - [https://code.claude.com/docs/en/headless.md](https://code.claude.com/docs/en/headless.md): --permission-prompts none denies anything that would prompt and tells Claude nobody can approve. Apps: cli.
  - [https://code.claude.com/docs/en/desktop-scheduled-tasks.md](https://code.claude.com/docs/en/desktop-scheduled-tasks.md): Each task has its own permission mode and model; saved approvals are reviewable and revocable. Apps: desktop.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Scheduled task sandbox and approval behavior is documented for Codex automations. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 9 (no silent failures)). A scheduled or background run never invents consent: it uses the mode saved with the task, pauses or denies when a prompt is needed, and says so in its result.

**With different models, providers and the one subscription.** Applies to any model. Runs on our servers count under the subscription; runs on a device need the device on.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Schedules use their own mode and saved approvals on desktop (Same); Chrome approve or deny a paused step (Better); print-mode routing of prompts Missing in CLI. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.23, S59.26
- Comparison list ids: C478, WP313
- Code: `apps/web/features/schedules/components/ScheduleAccessFields.tsx`; `apps/cli/src/lib.rs:593`

**Gap.** CLI cannot route prompts to a host tool (C478); always-allow in scheduled tasks Partial.

**Acceptance criteria**

1. Create a scheduled task that needs a write; it pauses or denies and the result says why.
2. It never runs a write the saved mode forbids.

**Verification: code inspected only.** Comparison rows.

## CAP-approvals-and-permissions-20 Approve from another device, a notification or a chat app

A request raised on one device can be answered elsewhere, with notifications and pending approvals that wait while the user is away.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code desktop; Claude Code channels: yes**
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Approval prompts wait on the remote without a time limit and show when Desktop rejoins. Apps: desktop.
  - [https://code.claude.com/docs/en/channels-reference.md](https://code.claude.com/docs/en/channels-reference.md): Permission relay: approve tool use from chat with yes/no and ID. Apps: cli.
- **ChatGPT, Codex: yes**
  - [https://learn.chatgpt.com/docs/third-party/slack.md](https://learn.chatgpt.com/docs/third-party/slack.md): Slack approval card, Follow along and Cancel for cloud tasks. Apps: unknown.

**AGI requirement** (inferred; source: competitor parity). An approval raised on one signed-in device can be answered on another, with a notification the user can act on, and the first device sees the result.

**With different models, providers and the one subscription.** Cross-device approval needs our servers, so it is a cloud feature; it must say it is unavailable for Local-only sessions.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Ledger done on six apps except Chrome unverified; notification approval only in VS Code; phone-to-desktop remote approval is off by decision. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.02, S59.26, S59.27
- Comparison list ids: WP214
- Code: `apps/web/lib/services/cloud-agent-run-service.ts:1407`; `apps/mobile/src/features/tasks/CloudTasksScreen.tsx:573`; `apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts:37`

**Gap.** Approving from a notification exists only in VS Code; coding session notification settings Partial on web.

**Acceptance criteria**

1. Raise an approval on web; approve it on the phone; the web run resumes.
2. A notification links to the pending card.
3. Local-only session shows no remote approval option.

**Verification: code inspected only.** Ledger S59.26, S59.27.

## CAP-approvals-and-permissions-21 Approval expiry, history and receipts

Pending approvals expire, past decisions can be reviewed, and the transcript shows what was decided and what ran.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code desktop; Claude in Chrome: partly**
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Dispatch computer-use approvals expire after 30 minutes. Apps: desktop.
  - [https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide): Extension settings show approved sites and permission history. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: chrome.
- **ChatGPT, Codex: partly**
  - [https://learn.chatgpt.com/docs/sandboxing/auto-review.md](https://learn.chatgpt.com/docs/sandboxing/auto-review.md): Auto-review statuses: Reviewing, Approved, Denied, Aborted, Timed out. Apps: desktop, cli, ide.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 9). An expired approval cannot run the action and says it expired; the user can review past decisions.

**With different models, providers and the one subscription.** History is stored per account (cloud) or on the device (Local) and is independent of model.

**Current implementation, as this trace read it on 2026-11-24: built.** Expiry and history done on all six apps in the ledger; Chrome history Partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.23, S59.24, S59.31
- Comparison list ids: XP19
- Code: `apps/web/lib/services/cloud-agent-run-service.ts:370`; `apps/web/app/api/settings/approvals/route.ts:71`; `apps/web/lib/hooks/useChatStream.ts:4119`

**Gap.** Chrome approval history Partial.

**Acceptance criteria**

1. Leave an approval pending past its limit; the card says expired and the action does not run.
2. Open approval history; recent decisions are listed.
3. After a denial, the transcript shows Denied.

**Verification: code inspected only.** Ledger S59.23, S59.24.

## CAP-approvals-and-permissions-22 Answer with a note, or say what to do instead

When answering a prompt the user can add a comment, or deny and tell the agent an alternative.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/permissions.md](https://code.claude.com/docs/en/permissions.md): Add a comment when answering a permission prompt. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity). Deny can carry a reason or an alternative that the model receives, and the same run continues.

**With different models, providers and the one subscription.** The note is passed as text to any model.

**Current implementation, as this trace read it on 2026-11-24: built.** Alternative done on six apps; attach-a-note Partial on desktop and VS Code, Same on CLI. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.22
- Comparison list ids: DP62, VP40
- Code: `apps/web/features/chat/components/approvals/ApprovalInbox.tsx:230`; `apps/cli/src/tui/approval_broker.rs:364`

**Gap.** Note attach Partial on desktop and VS Code.

**Acceptance criteria**

1. Deny with a note; the model's next message acts on the note.
2. The run resumes without restarting.

**Verification: code inspected only.** Ledger S59.22.

## CAP-approvals-and-permissions-23 Edit the proposed action before approving

The user changes the command, recipient or text in the card and runs the edited version.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: ledger item S59.21). Proposed: let the user edit an action before approval. Neither competitor shows it in the catalogue, so this is an AGI idea, not parity.

**With different models, providers and the one subscription.** The edited action replaces the model's call, so it works for any model and the model is told what ran.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on all six apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.21
- Comparison list ids: none matched
- Code: none cited

**Gap.** Not built anywhere.

**Acceptance criteria**

1. Edit the command in the card; the edited command runs and the transcript shows it.
2. The model is told the call was changed.

**Verification: not verified.** Ledger status only.

## CAP-approvals-and-permissions-24 Approval before opening generated links

The app asks before opening certain links the assistant produced, because links can leak context or carry injected text.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10984597-chatgpt-generated-links](https://help.openai.com/en/articles/10984597-chatgpt-generated-links): The app asks users to approve certain generated links, especially to sites that opted out of cataloguing. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity (one competitor)). Proposed: ask before opening a model-written link that carries context. Only ChatGPT documents this.

**With different models, providers and the one subscription.** Applies to links from any model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web Missing (W301); mobile Partial (MP91). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: MP91, W301
- Code: `apps/mobile/lib/safeOpenURL.ts:31`; `packages/ui/unified-chat/src/components/markdown/assistantFence.ts:63`

**Gap.** Web has no prompt.

**Acceptance criteria**

1. Click a generated link with query data; a prompt names the destination first.
2. Cancel; nothing opens.

**Verification: not verified.** Comparison rows.

## CAP-approvals-and-permissions-25 Standing rules that add approval steps

The owner writes rules such as ask before sending, which add steps but cannot grant more access.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT (dots): yes**
  - [https://learn.chatgpt.com/docs/enterprise/dots-security.md](https://learn.chatgpt.com/docs/enterprise/dots-security.md): Custom Rules add approval steps but cannot grant permissions the account lacks or bypass required safety checks. Plans: Enterprise. Apps: desktop, web.
  - [https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs](https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs): Custom Rules set allow, ask or never per supported action but cannot override core guardrails. Apps: desktop.

**AGI requirement** (proposed; source: competitor parity (one competitor)). Proposed: user-written standing rules that only tighten approvals. Whether to follow ChatGPT's dots is not decided.

**With different models, providers and the one subscription.** Rules are checked in AGI code before any model output is used.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Partial on web (owner rules in workspace policy) and desktop; Missing for per-action dot rules on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: DP29, W155, WP133
- Code: `packages/contracts/types/src/tool-approval-policy.ts:52`

**Gap.** No personal rule editor.

**Acceptance criteria**

1. Add a rule to ask before sending; the next send asks even in a looser mode.
2. A rule cannot allow something the workspace blocks.

**Verification: not verified.** Comparison rows.

## CAP-approvals-and-permissions-26 Hooks on permission requests

Scripts that run on a permission request or denial and can allow or deny, but cannot loosen deny rules.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/hooks.md](https://code.claude.com/docs/en/hooks.md): PermissionRequest and PermissionDenied hooks exist. Apps: cli.
  - [https://code.claude.com/docs/en/hooks-guide.md](https://code.claude.com/docs/en/hooks-guide.md): Hooks cannot loosen permissions; deny wins in every mode. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/hooks.md](https://learn.chatgpt.com/docs/hooks.md): PermissionRequest hook can auto-allow or deny approvals. Apps: cli, desktop, ide.

**AGI requirement** (proposed; source: competitor parity). Proposed for coding surfaces: permission hooks that can tighten but never loosen deny rules.

**With different models, providers and the one subscription.** Hooks run on the device and see only the tool call, not the model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI hook events Same; desktop hooks Missing (D71). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: CP269, D71
- Code: `apps/cli/src/features/hooks/hooks.rs:149`

**Gap.** Desktop has no hooks; CLI notification types Partial.

**Acceptance criteria**

1. A hook that denies blocks a call.
2. A hook that allows cannot override a deny rule.

**Verification: not verified.** Comparison rows.

## CAP-approvals-and-permissions-27 Subagent and teammate permission inheritance

Helper agents start with the lead's mode and prompts surface to the lead; plan-first teammates need plan approval.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/agent-teams.md](https://code.claude.com/docs/en/agent-teams.md): Teammates start in the lead's mode; prompts surface in the lead; plan-first teammates need approval. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/agent-configuration/subagents.md](https://learn.chatgpt.com/docs/agent-configuration/subagents.md): Subagents inherit sandbox and permission mode; /subagents shows an approval source label. Apps: cli, desktop, ide.

**AGI requirement** (inferred; source: competitor parity). A helper agent never has more permission than its parent, and approvals name the helper that asked.

**With different models, providers and the one subscription.** Helpers may use different models; their permissions stay those of the parent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI teammate prompts name the teammate (Same); plan-first teammates and deny by subagent name Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C116, C129
- Code: `apps/cli/src/teams.rs:669`

**Gap.** C129, C116.

**Acceptance criteria**

1. A helper asks in the parent's session and the card names the helper.
2. A helper cannot run a tool the parent mode forbids.

**Verification: code inspected only.** Comparison rows.

## CAP-approvals-and-permissions-28 Trust check for project servers and imports

Project-supplied tool servers and settings need explicit approval before they run.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/mcp.md](https://code.claude.com/docs/en/mcp.md): Project .mcp.json approval and workspace trust. Apps: cli.
  - [https://code.claude.com/docs/en/server-managed-settings.md](https://code.claude.com/docs/en/server-managed-settings.md): Security approval dialog for risky managed settings. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/extend/mcp.md](https://learn.chatgpt.com/docs/extend/mcp.md): MCP tool allow, deny lists and approval modes. Apps: cli, desktop, ide.

**AGI requirement** (inferred; source: competitor parity; docs/decisions/2026-09-15-founder-decisions.md (project servers still need approval)). A server or hook shipped in a repo never runs until the user approves it, and approvals can be reset.

**With different models, providers and the one subscription.** Independent of model; applies to local and cloud sessions.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI consent exists (Same); pre-approve and reset Missing; VS Code Same. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C346, C348, CP144, CP238
- Code: `apps/cli/src/mcp/consent.rs:1`

**Gap.** Reset and pre-approve Missing.

**Acceptance criteria**

1. A new project server asks first.
2. Reset approvals; it asks again.

**Verification: code inspected only.** Comparison rows.

## CAP-approvals-and-permissions-29 Admin controls over approvals

Workspace owners limit modes, disable bypass or auto, set connector rules and managed deny lists.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code; Cowork: yes**
  - [https://code.claude.com/docs/en/settings-reference.md](https://code.claude.com/docs/en/settings-reference.md): Managed-only permission rules; disable bypassPermissions mode. Apps: cli.
  - [https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Admins can disable Auto mode. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: unknown.
- **ChatGPT, Codex: yes**
  - [https://learn.chatgpt.com/docs/enterprise/managed-configuration.md](https://learn.chatgpt.com/docs/enterprise/managed-configuration.md): Approval policy and reviewer guardrails; browser history, saved site approvals and auto-approve admin controls. Plans: Enterprise. Apps: unknown.

**AGI requirement** (stated requirement; source: packages/contracts/types/src/tool-approval-policy.ts (the autonomous switch lives on the workspace policy)). Workspace admins can forbid skip approvals, set connector tool rules and limit saved approvals; members cannot override.

**With different models, providers and the one subscription.** Policy applies to every model and provider. Admin features follow plan entitlements in the one AGI Subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Connector admin rules Same on web and desktop; admin block of bypass Missing on desktop and VS Code; Chrome mode limits Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S59.04
- Comparison list ids: CP348, D142, DP38, V71, VP39, W400, X23, XP38
- Code: `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:293`; `apps/cli/src/platform/policy/managed.rs:43`

**Gap.** Missing admin limits on modes across desktop, VS Code, Chrome, web.

**Acceptance criteria**

1. Admin disables skip approvals; a member cannot select it.
2. Admin sets a connector tool to Block; members cannot allow it.

**Verification: code inspected only.** Comparison rows.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to build a model-judged auto approval (Claude auto mode, Codex auto-review), given it costs tokens and sends actions to a model.
- Whether to build a wallet with biometric approval for purchases (ChatGPT only) and where money-action consent lives.
- Whether to match Claude's per-app tiers for computer use (view-only, click-only) on desktop.
- Whether to add personal standing rules like ChatGPT's dot Custom Rules.
- Whether to add edit-before-approve, which neither competitor documents.
- Whether to add the approve-generated-links prompt on web (ChatGPT only).
- Whether named permission profiles (Codex) are wanted on CLI and VS Code.
- Whether admins may block skip approvals and auto mode on every app, as Claude Code and Codex allow.
- Whether unattended runs deny or wait when a prompt is needed.

## Could not establish

- No live result for any approval flow except web Allow once in scorecard W-15; all other AGI status is code reading.
- Many rows in comparison CSVs have empty list_id, so some are cited by feature name in by_app instead of an id.
- Catalogue labels both ChatGPT and Codex as chatgpt; product attribution of some learn.chatgpt.com pages (dots, Work) is my reading of the url and text.
- Plan and rollout limits are blank for most Claude Code and Codex rows, so plan availability is unknown there.
- Did not open the saved pages; catalogue lines only. Pages chatgpt.com/work and two truncated help.openai.com urls are as shown in the catalogue and may be shortened.
- Whether AGI enforces never-standing-consent for trades and scheduled runs was not found in code.
- Chrome ledger row for batch approval is unverified and VS Code has no revoke row.
