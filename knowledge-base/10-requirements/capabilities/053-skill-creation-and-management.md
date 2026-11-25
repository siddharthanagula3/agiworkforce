---
id: "REQ-AREA-053"
type: "requirements"
title: "Requirement items: Skill creation and management"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 53. Skill creation and management

36 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S53.01

**Skill directory.** A user can browse a catalogue of available skills, including ones not yet installed, and open any of them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F053-01 Skill directory and installed list](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md)
- Competitor trace: CAP-connectors-apps-and-extensions-18

## S53.02

**Installed Skills.** A user can see the list of skills installed/active for them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F053-01 Skill directory and installed list](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md)
- Competitor trace: CAP-connectors-apps-and-extensions-18

## S53.03

**Personal Skills.** A user can own personal skills that only they have and that they created or added.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile partial, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F053-05 Personal skills (create, edit, delete)](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md)
- Competitor trace: CAP-connectors-apps-and-extensions-18

## S53.04

**Project Skills.** Skills can be scoped to a project so they load only in that project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F053-08 Project and organisation scope](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)

## S53.05

**Organization Skills.** An organization can provide skills that all its members get.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-08 Project and organisation scope](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Competitor trace: CAP-connectors-apps-and-extensions-21

## S53.06

**Skill detail page.** A user can open a skill detail view showing its description, instructions and files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F053-02 Skill detail page and requirements](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md)

## S53.07

**Skill name and description.** Each skill shows its name and a description of what it does.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F053-01 Skill directory and installed list](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md)
- Competitor trace: CAP-connectors-apps-and-extensions-18

## S53.08

**Invocation guidance.** The product tells users how and when a skill is invoked (slash name, button, or automatic matching).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F053-03 Using a skill in chat (manual and automatic)](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Competitor trace: CAP-connectors-apps-and-extensions-19

## S53.09

**Instruction editor.** A user can write and edit a skill's instructions in an editor in the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F053-05 Personal skills (create, edit, delete)](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md)

## S53.10

**Reference-file bundle.** A skill can bundle reference files that the model reads when the skill runs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F053-07 Bundled files and scripts](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Competitor trace: CAP-connectors-apps-and-extensions-18

## S53.11

**Script bundle.** A skill can bundle scripts that run when the skill is used.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F053-07 Bundled files and scripts](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Competitor trace: CAP-connectors-apps-and-extensions-18

## S53.12

**Input parameters.** A skill declares input parameters the user or model fills in when invoking it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-09 Input and output declarations and surfaces](../../20-features/053-skill-creation-and-management/F053-09-input-and-output-declarations-and-surfaces.md)

## S53.13

**Expected outputs.** A skill declares the outputs it is expected to produce.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-09 Input and output declarations and surfaces](../../20-features/053-skill-creation-and-management/F053-09-input-and-output-declarations-and-surfaces.md)

## S53.14

**Required tools.** A skill declares the tools it needs and the product shows or enforces that requirement.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F053-02 Skill detail page and requirements](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md)
- Competitor trace: CAP-connectors-apps-and-extensions-18

## S53.15

**Required connections.** A skill declares the connectors/MCP servers it needs and the product shows or enforces it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-02 Skill detail page and requirements](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md)

## S53.16

**Supported surfaces.** A skill shows which surfaces (web, desktop, CLI...) it works on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-09 Input and output declarations and surfaces](../../20-features/053-skill-creation-and-management/F053-09-input-and-output-declarations-and-surfaces.md)

## S53.17

**Manual invocation.** A user can explicitly pick a skill for a message and the model then uses that skill.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F053-03 Using a skill in chat (manual and automatic)](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Competitor trace: CAP-connectors-apps-and-extensions-10, CAP-connectors-apps-and-extensions-15, CAP-connectors-apps-and-extensions-19

## S53.18

**Automatic relevance-based invocation.** Without being asked, the product loads a skill whose description matches the user's request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F053-03 Using a skill in chat (manual and automatic)](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Competitor trace: CAP-connectors-apps-and-extensions-19

## S53.19

**Skill composition.** A skill can call or build on other skills as part of its workflow.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-10 Skill composition and versions](../../20-features/053-skill-creation-and-management/F053-10-skill-composition-and-versions.md)

## S53.20

**Enable/disable.** A user can turn an installed skill off and back on without deleting it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F053-04 Install, turn on and off](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md)
- Competitor trace: CAP-connectors-apps-and-extensions-18

## S53.21

**Upload/import.** A user can upload or import a skill file/package and use it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F053-06 Upload, import and export](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md)
- Competitor trace: CAP-connectors-apps-and-extensions-18

## S53.22

**Export.** A user can export/download a skill.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-06 Upload, import and export](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md)
- Competitor trace: CAP-connectors-apps-and-extensions-18

## S53.23

**Version selection.** A user can choose which version of a skill to use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-10 Skill composition and versions](../../20-features/053-skill-creation-and-management/F053-10-skill-composition-and-versions.md)

## S53.24

**Update notification.** The product notifies users when an installed skill has an update.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-10 Skill composition and versions](../../20-features/053-skill-creation-and-management/F053-10-skill-composition-and-versions.md)

## S53.25

**Organization sharing.** A user can share a skill with their organization.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-08 Project and organisation scope](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Competitor trace: CAP-connectors-apps-and-extensions-21

## S53.26

**Skill duplication/customization.** A user can duplicate a skill (e.g. a built-in one) and customize the copy.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-10 Skill composition and versions](../../20-features/053-skill-creation-and-management/F053-10-skill-composition-and-versions.md)

## S53.27

**Recorded-demonstration creation.** A user can create a skill by recording a demonstration of the task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F053-11 Recorded skills (demonstration and voice teaching)](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Competitor trace: CAP-connectors-apps-and-extensions-20

## S53.28

**Screen-and-voice teaching flow.** A user can teach a skill by showing the screen and narrating with voice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-11 Recorded skills (demonstration and voice teaching)](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Competitor trace: CAP-connectors-apps-and-extensions-20

## S53.29

**Replay configuration.** A recorded skill has configurable replay settings.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-11 Recorded skills (demonstration and voice teaching)](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Competitor trace: CAP-connectors-apps-and-extensions-20

## S53.30

**Example-based template creation.** A user can create a skill from examples or a template, with the product generating the skill.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-11 Recorded skills (demonstration and voice teaching)](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Competitor trace: CAP-connectors-apps-and-extensions-20

## S53.31

**Test cases.** A skill carries test cases.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-12 Testing, results and measurement](../../20-features/053-skill-creation-and-management/F053-12-testing-results-and-measurement.md)

## S53.32

**Test results.** The product shows results of running a skill's tests.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-12 Testing, results and measurement](../../20-features/053-skill-creation-and-management/F053-12-testing-results-and-measurement.md)

## S53.33

**With-versus-without comparison.** The product compares outputs with and without a skill.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-12 Testing, results and measurement](../../20-features/053-skill-creation-and-management/F053-12-testing-results-and-measurement.md)

## S53.34

**Cost estimate.** The product estimates the cost of running a skill.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-12 Testing, results and measurement](../../20-features/053-skill-creation-and-management/F053-12-testing-results-and-measurement.md)

## S53.35

**Performance history.** The product shows a skill's performance history (usage, success).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-12 Testing, results and measurement](../../20-features/053-skill-creation-and-management/F053-12-testing-results-and-measurement.md)

## S53.36

**Permission and provenance summary.** A skill shows a summary of the permissions it uses and where it came from.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code missing, Chrome missing
- Feature: [F053-02 Skill detail page and requirements](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md)
