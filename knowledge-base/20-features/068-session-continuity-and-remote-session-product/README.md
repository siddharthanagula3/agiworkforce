---
id: "AREA-068"
type: "area"
title: "Session continuity and remote-session product"
features: ["F068-01", "F068-02", "F068-03", "F068-04", "F068-05", "F068-06", "F068-07", "F068-08", "F068-09", "F068-10", "F068-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 68. Session continuity and remote-session product

A person starts a coding task on one device and carries on with it on another: the web app, the desktop app, the phone, the command line or the editor extension. The same session keeps its history, branch, repository and model, and an approval waiting in the session can be answered from any attached client. Cloud execution runs the session on a managed machine, and Remote Control lets a phone drive a computer the person owns, so the work does not depend on one device being open. This matters because a coding session is only useful if the person can pick it up where they left it.

**Who uses it.** Every signed-in person can open a session that exists for their account. Remote Control needs the paid-plan capability 'remote_control' and the screen-share switch (apps/web/lib/feature-flags/remote-control-gate.ts:57-78, :97-113). Cloud execution needs the cloud switch and managed-compute access (apps/web/lib/e2b/gate.ts:20-28; apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:98-106). Workspace admins are covered by a workspace feature gate and audit events (apps/web/lib/feature-flags/remote-control-gate.ts:104-111; apps/web/app/api/pair/claim/route.ts:161-170). Developers use the command line and the VS Code extension, which hand sessions to and from the cloud. Which plan tiers hold 'remote_control' was not established.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F068-01](F068-01-one-session-on-every-client.md) | One session on every client | partly | partly | partly | built | built | n/a |
| [F068-02](F068-02-live-view-of-a-running-turn.md) | Live view of a running turn | partly | built | built | built | built | n/a |
| [F068-03](F068-03-answer-approvals-and-drive-a-session-from-another.md) | Answer approvals and drive a session from another client | partly | n/a | built | built | built | n/a |
| [F068-04](F068-04-who-owns-execution-and-handing-control.md) | Who owns execution and handing control | partly | partly | no | built | partly | n/a |
| [F068-05](F068-05-hand-a-local-session-to-the-cloud.md) | Hand a local session to the cloud | no | no | no | built | partly | n/a |
| [F068-06](F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md) | Bring cloud results back and continue cloud work from desktop | partly | partly | n/a | built | built | n/a |
| [F068-07](F068-07-continue-local-work-from-the-phone-and-start-a-tas.md) | Continue local work from the phone and start a task in an allowed folder | no | partly | partly | partly | partly | n/a |
| [F068-08](F068-08-your-machines.md) | Your machines | built | built | built | partly | no | n/a |
| [F068-09](F068-09-pair-and-revoke-a-device.md) | Pair and revoke a device | partly | partly | built | built | built | n/a |
| [F068-10](F068-10-activity-alerts-on-other-clients.md) | Activity alerts on other clients | n/a | built | built | partly | built | n/a |
| [F068-11](F068-11-export-a-session.md) | Export a session | no | no | no | built | partly | n/a |

Requirement items for this area: [10-requirements/capabilities/068-session-continuity-and-remote-session-product.md](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md).

## How this area works in the code

1. **Open the session on web.** The /code/<session id> route passes the id to the Cloud Code page. The path prefix /code is one of the product route prefixes shared with the desktop shell. (`apps/web/app/code/[sessionId]/page.tsx:14-16`, `packages/contracts/types/src/product-routes.ts:19-21`)
2. **Phone loads the session and its approvals together.** The phone reads the session and the pending approvals in one step. It reloads when the app comes to the foreground, and polls on a fixed interval only while a turn or the session is busy. (`apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:119-147`, `apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:159-193`)
3. **Approval decision on the server.** The approvals route checks the cloud switch, validates the turn id, step index and decision, then checks the account's managed-compute access and plan. Only then does it apply the decision. (`apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:59-70`, `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:83-107`, `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:109-121`)
4. **Cloud switch.** Cloud execution is on when the environment flag is set to 1 and the sandbox key is present and the rate card is priceable. The private-beta flag is a separate, broader gate. (`apps/web/lib/e2b/gate.ts:6-28`, `apps/web/lib/e2b/gate.ts:35-37`, `apps/web/lib/e2b/compute-metering.ts:89-91`)
5. **Phone to computer commands through the relay.** The phone sends typed requests (start, steer, interrupt, answer, read transcript) to the computer through the relay. On the computer, every request is checked against the folder's allowed agent scope before it runs. The dispatcher maps each file command to a capability. (`apps/mobile/src/features/companion/remote-code/service.ts:30-73`, `apps/desktop/electron/remote/remoteControlService.ts:73-83`, `apps/desktop/electron/remote/remoteControlService.ts:225-263`, `apps/desktop/electron/runtime/dispatcher.ts:668-692`)
6. **Computer confirms sensitive approvals.** An approval the policy reserves for the person at the computer opens a native dialog that names the phone. Without an answer in two minutes, or with the screen locked, the allow is dropped and the agent keeps waiting. (`apps/desktop/electron/remote/remoteControlService.ts:85`, `apps/desktop/electron/remote/remoteControlService.ts:116-140`, `apps/desktop/electron/remote/remoteControlService.ts:141-189`)
7. **Pairing: phone claims a code.** The web claim route checks the relay settings and the signed-in account, then asks the relay to claim the code for that account. The relay refuses a code that belongs to another account, or a role already in use. The result is audited. (`apps/web/app/api/pair/claim/route.ts:69-80`, `apps/web/app/api/pair/claim/route.ts:99-119`, `apps/web/app/api/pair/claim/route.ts:125-153`, `apps/web/app/api/pair/claim/route.ts:161-170`, `services/signaling-server/src/index.ts:787-814`)
8. **Standing refusal for Remote Control.** Creating, claiming and checking a live pairing all ask the same question: workspace policy, the plan's remote_control capability and the screen-share switch. A failed plan lookup is a temporary refusal (503), not a permanent one. (`apps/web/lib/feature-flags/remote-control-gate.ts:34-52`, `apps/web/lib/feature-flags/remote-control-gate.ts:57-78`, `apps/web/lib/feature-flags/remote-control-gate.ts:97-113`)
9. **Command line hands a session to the cloud.** The hand-off reads the git checkout, refuses unpushed commits, checks the session, builds a review of what moves and what stays, asks for confirmation (or needs the yes flag), submits the session, and runs the first cloud turn. (`apps/cli/src/lib.rs:3197-3268`, `apps/cli/src/cloud/code_handoff.rs:209-265`, `apps/cli/src/cloud/code_handoff.rs:318-433`)
10. **Activity alert to other clients.** A device posts a local session event. The server checks the device, builds the notification if the account's push preference is on, and reports whether a push was sent. (`apps/web/app/api/code/local-sessions/activity/route.ts:16-33`, `packages/contracts/cloud-contracts/src/local-code-session-activity.ts:21-30`, `apps/web/lib/services/agent-notification-service.ts:374-414`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/code/[sessionId]/page.tsx` | Web route for one cloud session; passes the session id to the Cloud Code page. |
| `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts` | Lists pending approvals and applies an approve or reject decision; gated by the cloud switch, plan and managed-compute access. |
| `apps/web/lib/e2b/gate.ts` | The cloud execution switch: reads the environment flag and the sandbox key. |
| `apps/web/lib/feature-flags/remote-control-gate.ts` | Decides whether an account may hold a Remote Control pairing (workspace policy, plan capability, screen-share switch). |
| `apps/web/app/api/pair/claim/route.ts` | Lets a phone claim a pairing code for the signed-in account; talks to the relay with the internal secret. |
| `services/signaling-server/src/index.ts` | The relay: looks up pairing codes, mints pair tokens and forwards messages between the computer and the phone. |
| `apps/desktop/electron/remote/remoteControlService.ts` | The computer side of Remote Control: checks each phone command against folder permission and holds sensitive approvals for a native dialog. |
| `apps/mobile/src/features/cloud-code/useCloudCodeSession.ts` | Phone hook for one cloud session: loads it, polls while busy, sends turns and decisions. |
| `apps/mobile/src/features/companion/remote-code/service.ts` | Phone-side wrappers that send session commands (start, steer, interrupt, answer, transcript) to the computer through the relay. |
| `apps/cli/src/lib.rs` | Command line entry for the hand-off to cloud (handle_code_handoff) and the first cloud turn. |
| `apps/cli/src/cloud/code_handoff.rs` | Builds the review of what moves to the cloud and what stays on the machine, and checks GitHub access. |
| `apps/web/app/api/code/local-sessions/activity/route.ts` | Receives activity events from a device and asks the notification service to alert the account's other clients. |

## What is stored

- Cloud session turns and approvals (the record the approvals route reads and writes): Server database, through the user-scoped database adapter; the table name was not established (apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:13, :47-60).
- Remote pairing claim, with the account and the code: Workspace audit log, event 'remote_pairing_claimed' (apps/web/app/api/pair/claim/route.ts:161-170).
- Pairing codes and their expiry, and which roles are connected: Relay store read by getSessionByCode (services/signaling-server/src/index.ts:789); active sessions are held in memory in the relay (services/signaling-server/src/index.ts:801).
- Device identity of the requesting device: Read from the request by readRequestingDeviceId and readRequestingDevice (apps/web/app/api/pair/claim/route.ts:99; apps/web/app/api/code/local-sessions/activity/route.ts:26).
- Phone's cloud session view (session detail, approvals, flags): Phone memory only, inside the React hook (apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:95-102). No storage call was seen.
- Sessions and approvals held for a pending phone request on the computer: Computer memory: a pending-approval set and a confirmation set (apps/desktop/electron/remote/remoteControlService.ts:116-189); where they are stored beyond that was not opened.
- Push notification preference: Read by loadAgentPushPreference from the database (apps/web/lib/services/agent-notification-service.ts:391).
- Git checkout facts for a hand-off (branch, remote, unpushed count, changed and untracked files): Read live from git by the command line; not stored (apps/cli/src/cloud/code_handoff.rs:209-280).

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_E2B_EXECUTION**: Turns cloud execution on when set to 1; without it, approvals and cloud session creation refuse with 'Managed Code is not enabled for this deployment'. (apps/web/lib/e2b/gate.ts:6,12,17,23 (read); apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:68-70)
- **E2B_API_KEY**: Sandbox key. Its presence counts as enabled for the general check; cloud provisioning needs it plus the flag. (apps/web/lib/e2b/gate.ts:7,10,21)
- **Sandbox rate card (priceable check)**: Cloud provisioning is ready only when the sandbox rate card declares a vCPU and memory rate pair. (apps/web/lib/e2b/compute-metering.ts:73-91)
- **AGI_MANAGED_COMPUTE_PRIVATE_BETA (managed-compute beta gate)**: Separate, broader managed-compute gate; the brief says it is on when unset. (apps/web/lib/e2b/gate.ts:35-37 (reads apps/web/lib/managed-compute-gate))
- **remote_control plan capability**: Paid-plan check for Remote Control pairings; refusal is 403 with plan_upgrade_required, or 503 if the plan cannot be read. (apps/web/lib/feature-flags/remote-control-gate.ts:57-78)
- **Screen-share switch (SCREEN_SHARE_CAPABILITY)**: Remote Control is refused while this switch is closed; the file says the switch is defined in the feature registry. (apps/web/lib/feature-flags/remote-control-gate.ts:25,46)
- **Workspace feature gate 'remote_control'**: Workspace policy can refuse Remote Control for its members. (apps/web/lib/feature-flags/remote-control-gate.ts:104-111)
- **SIGNALING_HTTP_URL and SIGNALING_INTERNAL_SECRET**: Both required for pairing; without them the claim returns 503 'Pairing is not configured'. (apps/web/app/api/pair/claim/route.ts:69-80)
- **NODE_ENV development (relay URL check)**: Allows an insecure relay address in development only. (apps/web/app/api/pair/claim/route.ts:34, :72)
- **Approval confirmation time limit**: Two minutes for a native approval dialog on the computer before the allow is dropped. (apps/desktop/electron/remote/remoteControlService.ts:85)
- **Insecure loopback relay (not packaged app)**: Allows a non-secure local relay address only when the app is not packaged. (apps/desktop/electron/remote/remoteControlService.ts:226)
- **Agent push preference**: Turns activity pushes on or off per account. (apps/web/lib/services/agent-notification-service.ts:391)
- **--yes flag on the hand-off command**: Skips the confirmation prompt; without it and without a terminal, nothing moves. (apps/cli/src/lib.rs:3202, :3232-3243)

## Shared between apps

Shared: packages/contracts/types/src/product-routes.ts (route prefixes for the web proxy and the desktop shell); packages/contracts/cloud-contracts/src/local-code-session-activity.ts (activity event schema); packages/platform/utils/src/remoteControl/remoteControlHost.ts (the remote-control host the desktop creates, apps/desktop/electron/remote/remoteControlService.ts). The web server gates (apps/web/lib/e2b, apps/web/lib/feature-flags) are used by web API routes. Separate per app: web pages in apps/web/features/code and apps/web/app/api; the phone code in apps/mobile/src/features/cloud-code and apps/mobile/src/features/companion; the desktop Electron runtime in apps/desktop/electron; the command line in apps/cli (Rust); the editor extension in apps/extension-vscode. The relay is a separate service in services/signaling-server.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief cites apps/web/app/code approvals route lines 139-140 for S68.11 (active control). The approvals route file ends at line 130, so those lines do not exist there. (apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:130 (end of file))
- The brief cites apps/web/features/code/CloudCodePage.tsx:124 for active-control attachment. Line 124 is an import line, not control code. (apps/web/features/code/CloudCodePage.tsx:124)
- Brief marks web S68.11 (active control) as done, but its approval decisions are refused unless the cloud switch is on. The same switch is what the brief lists as off in production, and web S68.08 (pending approvals) is partial for that reason. (apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:68-70)
- Approval listing (GET) has no cloud-switch check, while approval decisions (POST) do. A listed approval can be shown and then refused. (apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:46-57 versus :68-70)
- Brief marks phone S68.24 (start a session in an allowed folder) as missing, but the phone already has a start-session request that sends the task and folder to the computer. (apps/mobile/src/features/companion/remote-code/service.ts:62-73)
- Phone setup copy tells people to open Remote Control and pair a phone, while the brief says Remote Control is hidden in the first mobile release. The code that hides it was not found. (apps/mobile/src/features/companion/components/DesktopSetupChecklistView.tsx:52; apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:43)
- Phone pairing claim is a web route, but the brief lists the web pairing status as partial. Its unfinished note says the claim returns 503 until the website deploy is live-checked; the code returns 503 when the relay settings are missing. (apps/web/app/api/pair/claim/route.ts:69-80)

## Not established

- Whether Remote Control is hidden in the first mobile release (stated in the owner's notes and the brief). The hiding code was not found; only the copy that points to it was seen.
- Which plan tiers include the remote_control capability. The check was read; the tier table was not opened.
- The database table or store used for cloud sessions and approvals. Only the access wrapper was seen.
- Where the relay keeps pairing codes (getSessionByCode in the signaling store) and how revocation works (apps/web/app/api/pair/initiate/route.ts:95, apps/mobile/stores/connectionStore.ts:1223, apps/extension-vscode/src/features/remote-control/index.ts:206 were cited by the brief and not opened).
- Whether the command line has any remote-folder start or pairing code (S68.22-S68.25 for the command line are marked missing in the brief; the command line's remote host files apps/cli/src/tui/remote_host.rs and apps/cli/src/tui/tui_app.rs were cited but not opened).
- The export file format and where it is written (apps/cli/src/tui/tui_app.rs:3887 and apps/cli/src/repl/registry.rs:375 were not opened).
- The web, desktop and phone items marked missing (S68.05, S68.07, S68.12, S68.16, S68.18, S68.27) were taken from the brief and not checked in code, except where stated.
- The sessions list and the desktop's stored approval state beyond memory (apps/desktop/electron/runtime/developerSessionService.ts:892 and the desktop-side pending store were not opened).
- Whether a cloud session's history is the same across clients is taken from the brief; the server transcript read path was not followed.
- The VS Code session-sheet and context-handoff code paths beyond the lines cited (apps/extension-vscode/src/features/context-handoff/index.ts:72-202 were partly read; webviewContent.ts and ChatStateManager.ts were not).
- No tests, builds, installs or servers were run, as the task required. The work is read only from the project folder.
