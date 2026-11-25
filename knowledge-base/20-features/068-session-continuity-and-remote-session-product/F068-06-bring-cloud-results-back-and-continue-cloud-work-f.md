---
id: "F068-06"
type: "feature"
title: "Bring cloud results back and continue cloud work from desktop"
aliases: ["Bring cloud results back and continue cloud work from desktop", "Bring cloud results back to local workspace", "Teleport", "agi resume --teleport", "Bring the branch in", "Continue in VS Code (cloud task)", "Continue cloud execution from desktop"]
area: "68 Session continuity and remote-session product"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "n/a", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S68.15", "S68.17"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "SYS-sync-and-continuity", "SYS-execution-boundaries", "SYS-connectors-plugins-and-skills", "api:GET /api/code/sessions", "table:cloud_code_sessions", "file:packages/contracts/types/src/cloud-task-handoff-uri.ts", "F068-01", "F068-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F068-06 Bring cloud results back and continue cloud work from desktop

A cloud session's work comes back as a git branch. The terminal does it with agi resume --teleport (checks out the branch and loads the history). VS Code does it with a cloud-task link or the Sessions sheet 'Bring the branch in'. Web and desktop offer 'Continue in VS Code'; desktop continues cloud sessions through the hosted Code page.

Area: [68. Session continuity and remote-session product](README.md). Requirement items: [S68.15](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6815), [S68.17](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6817).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Moves the result of a cloud Code session into the person's local checkout, and lets the person keep working on a cloud session from the desktop app.

**Why it exists.** Cloud work ends as a branch and a transcript; the person needs both locally to review and finish. The leaders do the same through a terminal command (doc: docs/decisions/2026-09-27-founder-decisions.md:342-350).

**Who uses it.** Developers who start tasks in the cloud and finish in a local editor or terminal.

**Problems it solves**

- Cloud branch and local checkout drift apart.
- Overwriting uncommitted local work when switching branch.
- Starting the local review from scratch.

**Use cases**

- Run agi resume --teleport in the repository to pull the cloud branch and history.
- Click Continue in VS Code on a cloud session's changes panel.
- In VS Code open a cloud session and pick 'Bring the branch in'.
- Continue a cloud session in the desktop app's Code page.

## 2. User experience

**Where to find it**

- CLI: agi resume --teleport [session id] (apps/cli/src/lib.rs:917-927).
- Web and desktop: cloud session changes panel, button 'Continue in VS Code' with help 'Opens it in VS Code and offers to check out its branch. Commit and push first.' (apps/web/features/code/components/CodeChangesPanel.tsx:509-516; apps/web/features/code/code-surface.ts:431-435).
- VS Code: Sessions quick pick rows 'Continue here' and 'Bring the branch in' (apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:213-232), and a vscode link (packages/contracts/types/src/cloud-task-handoff-uri.ts:1-80).
- Desktop: the same hosted Code page in the Electron window (doc: AGENTS.md section 5).

**Before you start**

- The cloud session has a working branch pushed to GitHub and a GitHub repository (apps/cli/src/cloud/code_teleport.rs:134-150,167).
- A local clone of that repository (not a fork) is open (code_teleport.rs:100-115).
- No uncommitted changes for the CLI (code_teleport.rs:154-162); VS Code asks before switching a dirty tree (apps/extension-vscode/src/features/context-handoff/index.ts:112-121).
- CLI: Cloud (managed) mode (apps/cli/src/lib.rs:2629-2630).

**Screens and controls**

- CLI picker 'Teleport which session? ' lists open sessions on this repository (lib.rs:2690-2717).
- VS Code modal button 'Switch anyway' and message 'Switch this workspace to <branch> and risk losing uncommitted changes?' (index.ts:262-268; packages/ui/i18n/locales/en/vscode.json:219).
- VS Code notice with the 'Bring the branch in' button after a link opens (index.ts:327,358-372).

**Journey**

1. 1. The cloud session works and pushes its branch.
2. 2. In the terminal run agi resume --teleport (or in VS Code open the session or the link).
3. 3. The tool checks the repository, the branch name and the working tree.
4. 4. It fetches the branch and checks it out (CLI fast-forwards only).
5. 5. The CLI imports the cloud history into a local session named code-<id> and resumes it.
6. 6. New work stays local until pushed.

**What the person sees and gets**

- CLI: 'Checked out `<branch>` from <remote> and loaded '<title>' (N turns). New work here stays on this computer; push the branch to share it.' (lib.rs:2646-2664).
- CLI: 'kept this computer's copy ... ' and a preserved local copy id when the local session has turns the cloud lacks (lib.rs:2655-2668).
- VS Code: '<root> (<repo>) is now on <branch>.' or the failure reason (index.ts:128-134).
- Refusals: no branch, no repository, open a clone first, ambiguous clones (index.ts:90-110).

**Settings**

- None found for the feature.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI teleport: validates the branch name, requires a checkout whose remote matches, refuses a dirty tree, fetches without running repository hooks, fast-forwards an existing branch or creates a tracking branch, then imports history (apps/cli/src/cloud/code_teleport.rs:67-190; apps/cli/src/lib.rs:2626-2671).
- The imported history carries each turn's goal and final message only, not the tool steps (code_teleport.rs:28-44).
- VS Code: a cloud-task link parses and validates run id, branch and repository; opening it never moves the checkout; the branch comes in only when the person asks, with a dirty-tree guard (cloud-task-handoff-uri.ts:35-80; index.ts:87-135,355-372; test apps/extension-vscode/src/__tests__/contextHandoff.test.ts).
- VS Code Sessions sheet builds the same link from a cloud session (cloudCodeSessions.ts:140-150,311-322) and 'Continue here' places a draft with the conversation so far (cloudCodeSessions.ts:106-124,303-309).
- Web builds the VS Code link only when the session has a repository and working branch (code-surface.ts:505-520; CodeChangesPanel.tsx:268); the desktop window lets the vscode: link through (apps/desktop/electron/windowPolicy.ts:54-56).
- Desktop continues a cloud session by showing the same Code page and calling the same session API (doc: AGENTS.md section 5; apps/web/app/code/[sessionId]/page.tsx:14-15).

**Incomplete**

- The brief says CLI 17 is missing, but agi resume --teleport exists in the code; the brief and the code disagree (doc: brief S68.17; apps/cli/src/lib.rs:917-927,2626-2671).
- Web 'Open in > Terminal' only opens the changes panel; no teleport command is shown on web (apps/web/features/code/CloudCodePage.tsx:2587; no 'teleport' text found in apps/web/features).
- Desktop and web continue-cloud depend on the cloud switch (apps/web/lib/e2b/gate.ts:20-28; doc: audit/partial/068-session-continuity-and-remote-session-product.md S68.15).
- The VS Code link carries no plan (plan is an empty list in both builders) (code-surface.ts:511-517; cloudCodeSessions.ts:~148).

**Present but disconnected or switched off**

- When cloud Code is off, web shows 'Managed Code is not configured for this deployment, so no harness can be started.' (apps/web/features/code/code-surface.ts:154) and an unavailable notice (CloudCodePage.tsx:2068-2075).

**Not available**

- Phone: not applicable per brief; no bring-back control.
- Desktop native pull and review of a cloud result: not built by decision; desktop hands to VS Code or terminal (doc: docs/decisions/2026-09-27-founder-decisions.md:342-350).
- Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- Results of cloud work come back into the user's local workspace. (source: brief S68.17)
- From the desktop app, the user continues a coding session that runs in the cloud. (source: brief S68.15)
- A cloud session's result comes local through the CLI and VS Code; the desktop hands a cloud session to VS Code or the terminal and adds no native pull. (source: docs/decisions/2026-09-27-founder-decisions.md:342-350)
- Cloud handoff must not overwrite local context. (source: docs/product/requirements.md:694)
- Anything that could discard local work names the files at risk and asks first. (source: AGENTS.md section 9)

**Acceptance criteria**

1. agi resume --teleport in the right repository checks out the cloud branch and opens a session with the cloud turns.
2. It refuses a dirty tree, a fork, an invalid branch name, and a session with no branch, each with its message.
3. Opening a vscode cloud-task link never changes the checkout by itself.
4. Bring the branch in on a dirty tree asks 'Switch anyway' and lists the files; No leaves it untouched.
5. A link with no branch or no repository changes nothing and says why.
6. The web button is absent when the session has no repository or working branch.
7. With cloud Code off, the web Code page shows the unavailable notice.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop 'continue' means opening the cloud session on the hosted page, so S68.15 is met by the same gate as F068-01 [inferred from AGENTS.md section 5].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the agi resume --teleport command beside Continue in VS Code on web and desktop, as the leaders do.
- [proposed] Update the brief so CLI S68.17 reads done.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | agi resume --teleport | `apps/cli/src/lib.rs` | Flag, teleport_code_session, picker |
| service | code_teleport | `apps/cli/src/cloud/code_teleport.rs` | Branch validation, safe fetch, checkout, history import |
| service | code_sessions show | `apps/cli/src/cloud/code_sessions.rs` | Reads the cloud session for teleport |
| schema | cloud-task-handoff-uri | `packages/contracts/types/src/cloud-task-handoff-uri.ts` | Link format, limits, branch and repository patterns |
| service | context-handoff | `apps/extension-vscode/src/features/context-handoff/index.ts` | URI handler, pullCloudResultIntoCheckout, dirty guard |
| service | cloudCodeSessions | `apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts` | Continue here and Bring the branch in rows |
| component | CodeChangesPanel | `apps/web/features/code/components/CodeChangesPanel.tsx` | Continue in VS Code button |
| service | continueInVsCodeHref | `apps/web/features/code/code-surface.ts` | Builds the cloud-task link |
| component | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Hosted Code page used by web and desktop |
| service | windowPolicy | `apps/desktop/electron/windowPolicy.ts` | Lets the vscode: editor hand-off open from the desktop window |
| service | e2b gate | `apps/web/lib/e2b/gate.ts` | Deployment switch for cloud Code |
| endpoint | GET /api/code/sessions/[sessionId]/changes | `apps/web/app/api/code/sessions/[sessionId]/changes/route.ts` | Changes list shown in the panel (body not opened) |
| test | contextHandoff.test.ts | `apps/extension-vscode/src/__tests__/contextHandoff.test.ts` | VS Code bring-in cases |
| test | code_teleport unit tests | `apps/cli/src/cloud/code_teleport.rs` | Branch refusal and fetch argument tests |
| service | sessions import_hosted_session | `apps/cli/src/sessions.rs` | Writes the imported local session (file not opened) |
| config | vscode strings | `packages/ui/i18n/locales/en/vscode.json` | handoff.* text |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The cloud session pushes its working branch to GitHub. | outside service | apps/cli/src/cloud/code_handoff.rs:563-574 (render_session says bring it once the session pushes) |
| The CLI reads the cloud session from our servers. | our servers | apps/cli/src/lib.rs:2634-2637 |
| The CLI checks the repository and branch locally and fetches the branch from GitHub with repository hooks switched off. | device | apps/cli/src/cloud/code_teleport.rs:46-66,134-190 |
| The CLI imports history into the local session store. | device | apps/cli/src/lib.rs:2640-2652 |
| VS Code resolves the link, finds the open clone and runs fetch and checkout through the editor's git support. | device | apps/extension-vscode/src/features/context-handoff/index.ts:87-135 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Imported local session 'code-<cloud id>' with goals and final messages | CLI managed session store on the device | Not synced back to the cloud; new work stays local until the branch is pushed | unknown; a preserved local copy is created when local turns would be lost (lib.rs:2665-2668) |
| Checked-out branch | the local git repository | By git push | Controlled by the person |
| Link query (run id, goal, branch, repository, plan) | the URL only; each field capped at 4000 characters | No | Not stored by the page |

**Models and providers.** Bringing results back uses no model. Continuing the imported session later uses whatever mode and model the person picks locally; the mode of an imported session is unknown (sessions::import_hosted_session not opened).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI needs a signed-in managed account (lib.rs:2629-2630; client.rs:375-379). VS Code link handling needs no account; reading the cloud session in the Sessions sheet does (cloudCodeSessions.ts:49-55). |
| Permissions | The checkout is the person's own git repository; GitHub access is the person's. Branch names are validated and hooks are kept off during fetch (code_teleport.rs:46-66,67-100). |
| Subscription | Reading a cloud session needs the same managed access as F068-01; bringing a pushed branch local uses git only and needs no subscription [inferred]. Continuing a cloud session on desktop is governed by cloud Code entitlement (apps/web/app/api/code/sessions/route.ts:57-65). |
| Limits and metering | Link fields capped at 4000 characters, at most 40 plan steps and run id 200 characters (cloud-task-handoff-uri.ts:5-8). No usage metering for bring-back found. |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY (gate.ts:20-28) for the cloud session itself. |
| Model compatibility | Not applicable to bring-back. |
| Provider restrictions | GitHub only: the repository must be on github.com (code_teleport.rs:134-142; cloud-task-handoff-uri.ts:9-10). |
| Local mode | The git part works on the device. The CLI teleport needs Cloud mode to read the session (lib.rs:2629-2630). Once imported, it is a local session on the device; its trust mode is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No branch yet | 'This cloud session has no working branch yet.' | apps/cli/src/cloud/code_teleport.rs:143-148 |
| Branch not on GitHub | '... is not on GitHub yet. Commit and push it from the cloud session first'. | code_teleport.rs:165-170 |
| Dirty tree (CLI) | Refused with the changed paths. | code_teleport.rs:154-162 |
| Local branch has extra commits | Fast-forward fails with 'Rename or reset it'. | code_teleport.rs:178-186 |
| Dirty tree (VS Code) | Asks 'Switch anyway' naming the files; No leaves it untouched. | index.ts:112-121,262-275; test contextHandoff.test.ts |
| Several clones open | Refuses and lists the folders. | index.ts:106-110 |
| Checkout fails | Reports the reason rather than claiming success. | index.ts:124-129 |
| Non-interactive teleport | Asks to name the session id. | apps/cli/src/lib.rs:2705-2709 |
| Cloud off | Web unavailable notice; CLI/VS Code reads fail with the server message. | CloudCodePage.tsx:2068-2075 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/contextHandoff.test.ts`: Goal, plan and branch reach the composer; invalid link refused; link never moves the checkout; branch comes in on request; dirty-tree consent; refusals for no repository, no branch, several clones; receipt; failed checkout reported
- `apps/cli/src/cloud/code_teleport.rs`: Unit tests: malicious branch names refused before git runs; hooks folder is new, empty and private; fetch arguments use a pinned refspec after the separator
- `apps/web/features/code/code-surface.test.ts`: Web code surface helpers (VS Code link cases not individually opened)
- `apps/extension-vscode/src/__tests__/cloudSessionsSheet.test.ts`: Cloud sheet listing behaviour

**Test scenarios**

- **Teleport happy path**
  1. Finish a cloud task that pushed a branch.
  2. In a clean clone run agi resume --teleport <id>.
  - Expected: Branch checked out, history loaded, summary line printed.
- **Dirty clone**
  1. Edit a file.
  2. Run agi resume --teleport.
  - Expected: Refused naming the file.
- **VS Code link**
  1. Click Continue in VS Code on web.
  2. Accept the open prompt.
  - Expected: Draft with goal appears; checkout unchanged until Bring the branch in is chosen.
- **No clone open**
  1. Open the link with a different folder open.
  - Expected: 'Open a clone of <repo> ...' message.
- **No branch**
  1. Open a cloud session with no repository.
  - Expected: Web hides the button; VS Code refuses.
- **Cloud off**
  1. Unset the deployment switch.
  2. Open /code.
  - Expected: Unavailable notice.

**Where to look when it fails**

- CLI error texts from code_teleport.rs.
- VS Code information messages with the PRODUCT name prefix (index.ts:255-259).
- Hosted Code page: availability.deploymentEnabled and planEntitled in the list reply (apps/web/app/api/code/sessions/route.ts:60-65).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md)
- Desktop: [70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md)
- CLI: [70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md)
- VS Code: [70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md)

## 10. Gaps and dependencies

- **Brief and code disagree on CLI bring-back (brief missing; code has agi resume --teleport).** Affects: CLI, documentation. Evidence: apps/cli/src/lib.rs:917-927,2626-2671. Work needed: Correct the brief; add tests for the CLI path beyond unit tests.
- **Web and desktop do not show the terminal command, only Continue in VS Code.** Affects: Web, desktop. Evidence: apps/web/features/code/CloudCodePage.tsx:2587; no teleport text in apps/web/features. Work needed: Show the command if parity with the leaders is wanted.
- **Desktop continue needs the cloud switch.** Affects: Web, desktop. Evidence: apps/web/lib/e2b/gate.ts:20-28. Work needed: Owner switch-on and live check.
- **Links carry no plan.** Affects: VS Code. Evidence: apps/web/features/code/code-surface.ts:511-517. Work needed: Pass the plan if the cloud task has one.
- **Teleport imports goals and final messages only.** Affects: CLI. Evidence: apps/cli/src/cloud/code_teleport.rs:28-44. Work needed: Decide if tool steps should come too.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- SYS-sync-and-continuity
- SYS-execution-boundaries
- SYS-connectors-plugins-and-skills
- api:GET /api/code/sessions
- table:cloud_code_sessions
- file:packages/contracts/types/src/cloud-task-handoff-uri.ts
- F068-01
- F068-05

## Unknown

- Trust mode and privacy label of an imported teleport session (sessions::import_hosted_session not opened).
- Whether VS Code Bring the branch in requires the extension to be signed in beyond the Sessions sheet.
- Whether the desktop shell shows its own 'continue cloud session' control beyond the hosted page.
- Contents of the changes endpoint (not opened).
- Whether production has the cloud switch on.
