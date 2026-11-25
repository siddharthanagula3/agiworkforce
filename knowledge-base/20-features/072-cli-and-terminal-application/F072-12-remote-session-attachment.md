---
id: "F072-12"
type: "feature"
title: "Remote session attachment"
aliases: ["agi resume --teleport", "teleport", "cloud Code session handoff", "agi remote-control", "agi rc", "Remote Control host", "remote session attachment", "S72.30"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.30"]
depends_on: ["surface:cli", "surface:mobile", "surface:web", "mode:cloud", "api:GET /api/code/sessions", "api:POST /api/pair/initiate", "api:POST /api/code/local-sessions/activity", "file:apps/cli/src/cloud/code_teleport.rs", "file:apps/cli/src/remote_control/mod.rs", "SYS-sync-and-continuity", "SYS-agents-tools-and-automation", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-12 Remote session attachment

The CLI (surface:cli only) can copy a cloud coding session into this repository: `agi resume --teleport [id]` checks out the session's branch and loads its history here. `agi remote-control` makes this folder available to AGI Mobile through a relay. Both need a Cloud account; the phone side is outside this area.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.30](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7230).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Teleport fetches a cloud Code session, checks out its working branch in a matching clone, and imports the cloud turns as a local session (apps/cli/src/lib.rs:2626-2680; apps/cli/src/cloud/code_teleport.rs:119-185). Remote Control registers this folder with a pairing relay and serves the phone's requests to list, start, follow and steer sessions (apps/cli/src/remote_control/mod.rs:743-860; apps/cli/src/lib.rs:6659-6679).

**Why it exists.** People start coding work in the cloud or on a phone and want to continue it where their code and tools are (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.30).

**Who uses it.** Developers who use AGI Cloud Code sessions or AGI Mobile alongside the terminal.

**Problems it solves**

- Moving a cloud session's work onto the local checkout.
- Driving a terminal session from a phone.
- Avoiding unsafe branch names and repository hooks during checkout.

**Use cases**

- `agi resume --teleport` in a clone, pick an open session, keep working locally.
- `agi resume --teleport <id>` from a script that knows the id.
- `agi remote-control` at a desk, then scan the code with the phone.
- A phone starts a session in this folder and approves a command.

## 2. User experience

**Where to find it**

- surface:cli: `agi resume --teleport [SESSION_ID]` (apps/cli/src/lib.rs:915-927), `agi remote-control` alias `rc` (apps/cli/src/lib.rs:894-896). Phone side: AGI Mobile, Remote, Scan (text printed by apps/cli/src/remote_control/mod.rs:700-742). Not on other apps; the surface-feature matrix lists CLI Remote control as absent, which contradicts the code (doc: docs/product/surface-feature-matrix.md:562-570).

**Before you start**

- Cloud account signed in (`agi login`) and the account privacy setting Managed; Local and own-key settings are refused (apps/cli/src/cloud/client.rs:368-373; apps/cli/src/remote_control/mod.rs:767-770).
- Teleport: a clean checkout of the session's GitHub repository with a matching remote, and the branch pushed to GitHub (apps/cli/src/cloud/code_teleport.rs:119-165).
- Remote Control: a paid plan (server check) and a working relay (see unknowns) (apps/web/lib/feature-flags/remote-control-gate.ts:57-75).

**Screens and controls**

- Teleport picker: numbered list `1. <title> <branch>` and `Teleport which session? ` (apps/cli/src/lib.rs:2677-2735); needs a terminal.
- Remote Control text: `Remote Control is on for <folder>.`, a QR code, a pairing line, and warnings that anyone with the code controls sessions until stop (apps/cli/src/remote_control/mod.rs:700-742).

**Journey**

1. Teleport: 1. Open a terminal in a clone of the repository. 2. Run `agi resume --teleport` and pick a session (or pass its id). 3. The CLI fetches and checks out the branch. 4. It imports the history and opens the session. 5. New work stays local; push the branch to share it.
2. Remote Control: 1. Run `agi remote-control`. 2. Scan the QR or paste the code in AGI Mobile. 3. Start or follow sessions from the phone. 4. Press Ctrl+C to stop.

**What the person sees and gets**

- After teleport: `Checked out|Updated <branch> from <remote> and loaded '<title>' (N turns). New work here stays on this computer; push the branch to share it.` (apps/cli/src/lib.rs:2648-2672).
- Remote Control status lines: connected, phone disconnected, reconnecting, phone needs update, off (apps/cli/src/remote_control/mod.rs:700-742).

**Settings**

- AGIWORKFORCE_API_BASE selects the web origin used for pairing (apps/cli/src/remote_control/mod.rs:162-166).
- Account privacy mode in config (apps/cli/src/lib.rs:2617-2622).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Teleport validates the branch name, requires the matching GitHub remote, refuses a dirty tree, fetches with a pinned refspec while disabling the repository's hooks, then checks out or fast-forwards (apps/cli/src/cloud/code_teleport.rs:57-185).
- Teleport imports cloud turns as a local session `code-<id>`, keeps a richer local copy if one exists, and preserves local-only turns (apps/cli/src/lib.rs:2626-2674).
- Without an id it lists the repository's open sessions and asks for a number; without a terminal it refuses and names the id route (apps/cli/src/lib.rs:2677-2735).
- Remote Control requests a pairing from the web app, registers over an encrypted relay URL, serves the phone, reconnects with backoff 1 to 30 seconds, and ends the pairing on a revoked or expired state (apps/cli/src/remote_control/mod.rs:22-35, 743-860).
- Only Managed sessions are shared; Local and own-key sessions stay off the phone (apps/cli/src/remote_control/mod.rs:737-739, 1337-1360).

**Incomplete**

- Teleport is a one-way copy, not a live attachment: the cloud session keeps its own state and local work is not sent back (apps/cli/src/lib.rs:2668-2672). S72.30 says `attach ... and continue it` (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md).
- The relay host reached by the mobile app returns a missing deployment and the Remote Control relay needs a founder action (doc: audit/decisions/founder-actions.md:277-287); the CLI-side check of whether the host in use is the fixed one: unknown.
- docs/product/surface-feature-matrix.md:562-570 says CLI remote control is absent; the code exists (apps/cli/src/remote_control/mod.rs). The doc is stale.

**Present but disconnected or switched off**

- Remote Control may be hidden in the first mobile release (doc: owner decision recorded in project memory, not a repo file; treated as unknown here).

**Not available**

- No attach to a session on another device other than via the cloud Code session list or the phone relay; no direct device-to-device attach (not found).

## 4. Required behaviour

**Established requirements**

- The terminal can attach to a session that lives elsewhere (another device, the cloud or a running remote agent) and continue it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.30)
- Remote Control and connectors come with paid plans only. (source: doc: docs/product/definition.md:303)
- Local and own-key sessions never travel through the account relay. (source: apps/cli/src/remote_control/mod.rs:1337-1360 test; AGENTS.md section 6)
- Pairing credentials must be sent only to a secure origin. (source: apps/cli/src/remote_control/mod.rs:194-230, 1067-1160 tests)

**Acceptance criteria**

1. `agi resume --teleport <id>` in a clean matching clone leaves the repo on the session's branch with its history loaded.
2. A branch name such as `--upload-pack=...` is refused before git runs.
3. A dirty working tree stops teleport with a message listing changed files.
4. Running teleport with a Local or own-key privacy setting is refused with a not-managed message.
5. `agi remote-control` prints a code and QR, and a phone connects and lists sessions.
6. Ctrl+C stops Remote Control and ends the pairing.
7. A free plan account is refused pairing with an upgrade message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Teleport should work without GitHub for non-GitHub repositories; today it requires a GitHub repository URL [inferred from code_teleport.rs:119-128].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a way to push local turns back to the cloud session, or rename the feature `copy` in copy text.
- [proposed] Correct the surface-feature matrix entry for CLI remote control.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | Command::Resume --teleport | `apps/cli/src/lib.rs` | Flag definition (915-927) and dispatch (2492-2535). |
| service | teleport_code_session | `apps/cli/src/lib.rs` | Fetches the session, checks out, imports history (2626-2674). |
| service | pick_code_session | `apps/cli/src/lib.rs` | Lists open sessions for this repo and asks (2677-2735). |
| service | check_out and validate_branch | `apps/cli/src/cloud/code_teleport.rs` | Safe branch checkout (57-185). |
| service | code_sessions client | `apps/cli/src/cloud/code_sessions.rs` | GET /api/code/sessions list and show (1-90). |
| service | CloudClient::admit/connect | `apps/cli/src/cloud/client.rs` | Refuses non-Managed privacy; signed-out check (366-395). |
| command | Command::RemoteControl | `apps/cli/src/lib.rs` | Subcommand (894-896) and handler (6659-6679). |
| service | remote_control::run_with | `apps/cli/src/remote_control/mod.rs` | Pairing, relay loop, reconnect (743-860). |
| service | CodeHost | `apps/cli/src/remote_control/host.rs` | Serves the phone's session requests. |
| schema | envelope | `apps/cli/src/remote_control/envelope.rs` | Signed message verification. |
| endpoint | api:POST /api/pair/initiate | `apps/web/app/api/pair/initiate/route.ts` | Creates the pairing; plan and flag gate. |
| service | remoteControlPlanRefusal | `apps/web/lib/feature-flags/remote-control-gate.ts` | Paid-plan check (57-75). |
| endpoint | api:GET /api/code/sessions | `apps/web/app/api/code/sessions/route.ts` | Session list with plan entitlement. |
| endpoint | api:POST /api/code/local-sessions/activity | `apps/cli/src/remote_control/mod.rs` | Activity report path constant (line 25). |
| service | device registry heartbeat | `apps/cli/src/device_registry.rs` | Marks Remote Control on and sends heartbeats (806-807 in mod.rs). |
| test | code_teleport tests | `apps/cli/src/cloud/code_teleport.rs` | Malicious branches refused; private hooks folder; pinned refspec (190-288). |
| test | remote_control tests | `apps/cli/src/remote_control/mod.rs` | Relay URL policy, reconnect, cancel, Local and own-key refusal (926-1360). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Teleport asks AGI Cloud for the open Code sessions and the chosen session's turns. | our servers | apps/cli/src/cloud/code_sessions.rs:1-90; apps/cli/src/lib.rs:2626-2640 |
| The CLI runs local git commands to fetch from GitHub and check out the branch. | device | apps/cli/src/cloud/code_teleport.rs:119-185 |
| GitHub serves the branch contents. | outside service | apps/cli/src/cloud/code_teleport.rs:131-146 (fetch from the matching remote) |
| The history is written to the local session database. | device | apps/cli/src/lib.rs:2641-2647 |
| Remote Control asks the web app for a pairing code and token; the web app asks the relay host to create it. | our servers | apps/cli/src/remote_control/mod.rs:241-300; apps/web/app/api/pair/initiate/route.ts |
| The CLI connects to the relay over an encrypted WebSocket and serves the phone's requests using the local agent. | device and our servers | apps/cli/src/remote_control/mod.rs:818-860 |
| Model work for phone-started sessions runs through the CLI's own route (Managed only). | device and our servers | apps/cli/src/remote_control/mod.rs:737-739 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Imported teleport session (`code-<id>`) | Local session database on the device | Not sent back to the cloud session | Kept until the user deletes sessions |
| Pairing code and secret | Memory and the terminal screen | Code goes to the relay; secret stays on device and phone | Ends when Remote Control stops or the pairing expires (apps/cli/src/remote_control/mod.rs:32, 110-120) |
| Remote Control activity reports | Posted to our servers (path in mod.rs line 25) | Yes | unknown |

**Models and providers.** Teleport uses no model. Remote Control sessions use the Managed route only; model choice follows the phone's request and the plan [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account required for both (apps/cli/src/cloud/client.rs:375-380; apps/cli/src/remote_control/mod.rs:769-770). |
| Permissions | Teleport must run in a clean checkout of the session's repository; the CLI disables repository hooks during git steps (apps/cli/src/cloud/code_teleport.rs:50-55). Remote Control needs folder trust (apps/cli/src/lib.rs:1849). |
| Subscription | Remote Control needs a paid plan (doc: docs/product/definition.md:303; apps/web/lib/feature-flags/remote-control-gate.ts:57-75). Cloud Code sessions are gated by plan entitlement on the server (apps/web/app/api/code/sessions/route.ts:45-58). Plan lists for each: see plan table (doc: docs/product/definition.md:294-301). |
| Limits and metering | Pairing code lifetime 300 seconds by default, 30 to 900 allowed (apps/web/app/api/pair/initiate/route.ts:25-33); session cap by plan (apps/web/app/api/code/sessions/route.ts:45-46); device-link rate limit (apps/web/app/api/pair/initiate/route.ts:54). |
| Feature flags | The pairing route checks a remote-control capability flag and a plan (apps/web/lib/feature-flags/remote-control-gate.ts:34-75, 97-116). |
| Model compatibility | none found in the code. |
| Provider restrictions | Teleport supports GitHub repositories only (apps/cli/src/cloud/code_teleport.rs:119-128). |
| Local mode | Both are refused unless the account privacy setting is Managed (apps/cli/src/cloud/client.rs:368-373; test apps/cli/src/remote_control/mod.rs:1337). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No open session for this repo | Error with `agi code list` hint. | apps/cli/src/lib.rs:2706-2711 |
| No terminal and no id | Refuses and names `agi resume --teleport <id>`. | apps/cli/src/lib.rs:2713-2718 |
| Branch not pushed | Says to commit and push from the cloud session first. | apps/cli/src/cloud/code_teleport.rs:156-162 |
| Local branch has extra commits | Fast-forward fails; asks to rename or reset. | apps/cli/src/cloud/code_teleport.rs:171-178 |
| Dirty tree | Stops and lists the changed files. | apps/cli/src/cloud/code_teleport.rs:143-150 |
| Invalid branch name | Refused before git runs. | apps/cli/src/cloud/code_teleport.rs:57-85 |
| Relay drops | Reconnects with backoff, status `Reconnecting`. | apps/cli/src/remote_control/mod.rs:121-135, 735-737 |
| Phone too old | Prints the update message. | apps/cli/src/remote_control/mod.rs:731-733 |
| Pairing revoked or expired | Ends pairing and stops. | apps/cli/src/remote_control/mod.rs:32, 110-120 |
| Ctrl+C | Stops cleanly and prints `Remote Control is off.` | apps/cli/src/remote_control/mod.rs:739-742, 69-75 |
| Accessibility | The QR is drawn in text, and the code is also printed as text for pasting. | apps/cli/src/remote_control/mod.rs:705-722 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/cloud/code_teleport.rs`: Malicious branch names are refused before git runs; hooks folder is new, empty and private; a normal branch builds a pinned refspec after `--`.
- `apps/cli/src/remote_control/mod.rs`: Relay URL policy requires TLS, unsafe URLs and pairing base refused before credentials are sent, registration validation, reconnect backoff and cancel, Local and own-key never pair (tests at 926-1360).
- `apps/cli/tests/developer_session_host.rs`: Developer session host used by remote control (file name only; contents not read).

**Test scenarios**

- **Teleport happy path**
  1. Start a cloud Code session on a GitHub repo and push its branch.
  2. In a clean clone run `agi resume --teleport` and pick it.
  - Expected: Branch checked out, history loaded, message `New work here stays on this computer`.
- **Teleport dirty tree**
  1. Modify a tracked file, run the same command.
  - Expected: Refused with the list of changed files.
- **Teleport in Local setting**
  1. Set privacy to Local, run teleport.
  - Expected: Not-managed refusal; no network call.
- **Remote Control pairing**
  1. Sign in on a paid plan, run `agi remote-control`.
  2. Scan with AGI Mobile.
  - Expected: `Remote Control: connected to <phone>.`
- **Free plan**
  1. Sign in on a Free plan; run `agi remote-control`.
  - Expected: Server refusal with an upgrade message.
- **Stop**
  1. Press Ctrl+C during Remote Control.
  - Expected: `Remote Control is off.` and the phone sees the pairing end.

**Where to look when it fails**

- Messages from code_teleport check_out (apps/cli/src/cloud/code_teleport.rs:119-185).
- `Pairing is not configured` 503 from the pairing route when relay settings are missing (apps/web/app/api/pair/initiate/route.ts:75-80).
- Relay errors `The Remote Control relay ...` (apps/cli/src/remote_control/mod.rs:113, 304-317).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **Teleport copies; it does not keep the cloud session and terminal in step.** Affects: surface:cli users expecting `attach`. Evidence: apps/cli/src/lib.rs:2668-2672. Work needed: Define the rule; add a push-back or reword.
- **Relay host reachability for Remote Control is blocked by a founder action.** Affects: surface:cli and surface:mobile Remote Control. Evidence: doc: audit/decisions/founder-actions.md:277-287. Work needed: Point the relay hostname at the working app and verify pairing.
- **Surface-feature matrix says CLI remote control is absent.** Affects: documentation readers. Evidence: doc: docs/product/surface-feature-matrix.md:562-570 vs apps/cli/src/lib.rs:6659. Work needed: Regenerate the matrix.
- **Teleport supports GitHub repositories only.** Affects: surface:cli users of other hosts. Evidence: apps/cli/src/cloud/code_teleport.rs:119-128. Work needed: Extend or document.
- **No run record of a real teleport or pairing in the repo.** Affects: surface:cli. Evidence: no file records one. Work needed: Run both scenarios and record the result.

**Depends on**

- surface:cli
- surface:mobile
- surface:web
- mode:cloud
- api:GET /api/code/sessions
- api:POST /api/pair/initiate
- api:POST /api/code/local-sessions/activity
- file:apps/cli/src/cloud/code_teleport.rs
- file:apps/cli/src/remote_control/mod.rs
- SYS-sync-and-continuity
- SYS-agents-tools-and-automation
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Whether the relay host the CLI reaches is healthy today (the CLI gets the relay URL from the web pairing response; the web host setting was not read).
- Whether Remote Control is hidden in the first mobile release (recorded only in project memory, not read from a repo file).
- What the mobile app shows for a session started from the CLI.
- Retention of activity reports on our servers.
- Whether teleport has ever been run against a real cloud session (no record found).
