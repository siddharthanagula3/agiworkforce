---
id: "REQ-AREA-078"
type: "requirements"
title: "Requirement items: UI gating and adaptation components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 78. UI gating and adaptation components

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S78.01

**Feature-availability resolver.** One resolver combines model, plan, surface and operator switches to say whether each feature is available here, and the surface's controls read it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-01 Who may use what, and where it runs](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)

## S78.02

**Model-dependent composer controls.** Composer controls (effort, thinking, attachment options) appear, change or disappear according to the selected model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-02 Model-matched composer controls](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)

## S78.03

**Model-dependent accepted-file types.** Which files the composer accepts (or how it reacts to them) depends on what the selected model can read.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F078-02 Model-matched composer controls](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)

## S78.04

**Model-dependent reasoning options.** The reasoning/effort options offered match the selected model, and unsupported levels are not sent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-02 Model-matched composer controls](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)

## S78.05

**Model-dependent sampling options.** Sampling options offered or sent depend on the selected model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F078-02 Model-matched composer controls](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)

## S78.06

**Model-dependent media settings.** Media generation settings (duration, size, aspect) offered depend on the selected media model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing
- Feature: [F078-02 Model-matched composer controls](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)

## S78.07

**Tier-dependent entitlement checks.** Plan entitlements are checked for each gated feature and model, in the UI and again on the server, for every route that runs a model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-01 Who may use what, and where it runs](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)

## S78.08

**Tier-dependent remaining allowance.** Each surface shows how much of the plan allowance remains, read from the server.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-04 Plan allowance shown to the user](../../20-features/078-ui-gating-and-adaptation-components/F078-04-plan-allowance-shown-to-the-user.md)

## S78.09

**Workspace-policy restrictions.** Workspace administrators' policies (feature switches, model policy, retention) restrict what members can use on every surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-01 Who may use what, and where it runs](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)

## S78.10

**Role restrictions.** Controls restricted to workspace roles (owner/admin) are withheld from other members and refused server-side.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F078-01 Who may use what, and where it runs](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)

## S78.11

**Regional restrictions.** Features or routes restricted by region are enforced and the restriction is visible to the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F078-01 Who may use what, and where it runs](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)

## S78.12

**Age or account eligibility restrictions.** Age or account-eligibility rules gate access, with a check at sign-up or first run and restricted behaviour for ineligible users.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-01 Who may use what, and where it runs](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)

## S78.13

**Required-connection detection.** The product detects when a feature needs an account connection that is missing and says which one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F078-06 Connections, devices and runtimes](../../20-features/078-ui-gating-and-adaptation-components/F078-06-connections-devices-and-runtimes.md)

## S78.14

**Required-device detection.** The surface detects whether a required device (paired desktop, phone) is available and says so before the user relies on it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F078-06 Connections, devices and runtimes](../../20-features/078-ui-gating-and-adaptation-components/F078-06-connections-devices-and-runtimes.md)

## S78.15

**Required-runtime detection.** The surface detects whether the runtime a feature needs (sandbox, local model runtime, CLI) is available and gates the feature on it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F078-06 Connections, devices and runtimes](../../20-features/078-ui-gating-and-adaptation-components/F078-06-connections-devices-and-runtimes.md)

## S78.16

**Unsupported versus temporarily unavailable distinction.** The surface tells apart a feature that is unsupported here from one that is only temporarily unavailable.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F078-05 Why something is blocked, and what unlocks it](../../20-features/078-ui-gating-and-adaptation-components/F078-05-why-something-is-blocked-and-what-unlocks-it.md)

## S78.17

**Hidden irrelevant controls.** Controls that cannot apply in the current context (model, host, platform) are hidden instead of shown broken.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-03 Hidden and disabled controls](../../20-features/078-ui-gating-and-adaptation-components/F078-03-hidden-and-disabled-controls.md)

## S78.18

**Disabled but discoverable restricted controls.** Restricted controls stay visible but disabled, with the reason, so users can discover them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-03 Hidden and disabled controls](../../20-features/078-ui-gating-and-adaptation-components/F078-03-hidden-and-disabled-controls.md)

## S78.19

**Upgrade explanation.** When a plan blocks something, the user is told which plan unlocks it and how to upgrade.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-05 Why something is blocked, and what unlocks it](../../20-features/078-ui-gating-and-adaptation-components/F078-05-why-something-is-blocked-and-what-unlocks-it.md)

## S78.20

**Connect-account explanation.** When a feature needs an account connection, the user is told which account to connect and given a way to connect it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing
- Feature: [F078-06 Connections, devices and runtimes](../../20-features/078-ui-gating-and-adaptation-components/F078-06-connections-devices-and-runtimes.md)

## S78.21

**Grant-permission explanation.** When a feature needs a permission (microphone, site access, agent autonomy), the surface explains what it is for before or when asking.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-07 Permission explanations](../../20-features/078-ui-gating-and-adaptation-components/F078-07-permission-explanations.md)

## S78.22

**Use-another-model explanation.** When the selected model cannot do what was asked, the user is told to use another model (ideally which one).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-05 Why something is blocked, and what unlocks it](../../20-features/078-ui-gating-and-adaptation-components/F078-05-why-something-is-blocked-and-what-unlocks-it.md)

## S78.23

**Continue-on-another-device action.** When work fits another device or app better, the surface offers an action that continues it there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F078-06 Connections, devices and runtimes](../../20-features/078-ui-gating-and-adaptation-components/F078-06-connections-devices-and-runtimes.md)

## S78.24

**Explicit processing-path selection.** The user can explicitly choose where a request is processed (local model, own key, managed cloud).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F078-01 Who may use what, and where it runs](../../20-features/078-ui-gating-and-adaptation-components/F078-01-who-may-use-what-and-where-it-runs.md)

## S78.25

**Attachment-preservation choice after model change.** After switching to a model that cannot use the current attachments, the user chooses to keep them (by switching model) or remove them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F078-02 Model-matched composer controls](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)

## S78.26

**Unsupported-parameter removal or correction.** Parameters the chosen model cannot take are removed or corrected before the request is sent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-02 Model-matched composer controls](../../20-features/078-ui-gating-and-adaptation-components/F078-02-model-matched-composer-controls.md)

## S78.27

**Effective-capability inspector.** A view shows what is effectively available to this user on this surface and why anything is not.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F078-99 Other items in UI gating and adaptation components](../../20-features/078-ui-gating-and-adaptation-components/F078-99-other-items.md)

## S78.28

**Live updates after a plan, policy, connection, or device change.** After a plan, policy, connection or device change, gated controls update without reinstalling or restarting.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F078-08 Live refresh after a change](../../20-features/078-ui-gating-and-adaptation-components/F078-08-live-refresh-after-a-change.md)

## S78.29

**Discover bundled artifact and diagram skills in the CLI.** A user can find and invoke the built-in artifact capability and diagramming skills from a fresh CLI installation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing
- Feature: [F078-99 Other items in UI gating and adaptation components](../../20-features/078-ui-gating-and-adaptation-components/F078-99-other-items.md)
- An owner decision is open on this item.

## S78.30

**Author plugins, skills and workflows with discoverable CLI skills.** A user can invoke the bundled authoring skills to produce a plugin, generate a skill or define a workflow.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing
- Feature: [F078-99 Other items in UI gating and adaptation components](../../20-features/078-ui-gating-and-adaptation-components/F078-99-other-items.md)
- An owner decision is open on this item.
