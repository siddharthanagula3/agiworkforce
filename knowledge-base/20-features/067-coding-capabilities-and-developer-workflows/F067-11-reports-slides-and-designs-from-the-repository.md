---
id: "F067-11"
type: "feature"
title: "Reports, slides and designs from the repository"
aliases: ["Reports, slides and designs from the repository (S67.35)"]
area: "67 Coding capabilities and developer workflows"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S67.35"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-model-catalog-and-routing", "SYS-agents-tools-and-automation"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F067-11 Reports, slides and designs from the repository

The brief wants the agent to produce a report, slide deck or design grounded in the repository. No code that does this was found in any coding app. The CLI can read a .pptx file as input, which is not producing one. The brief marks every app as missing.

Area: [67. Coding capabilities and developer workflows](README.md). Requirement items: [S67.35](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6735).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Nothing today. The intended feature is a report, slide deck or design built from the repository's contents (brief S67.35).

**Why it exists.** Brief S67.35: 'The agent produces a report, slide deck or design grounded in the repository's contents.' Product requirements also describe deck and design generation in the design area (doc: docs/product/requirements.md around lines 245 and 1483-1488), which is not tied to a repository.

**Who uses it.** Not applicable yet. Intended for developers and team leads.

**Problems it solves**

- Not applicable: nothing implemented.

**Use cases**

- [proposed] Ask the agent for a one-page architecture report of the repository.
- [proposed] Ask for a short deck summarising a release's changes.
- [proposed] Ask for a design mockup grounded in the repository's components.

## 2. User experience

**Where to find it**

- Not found in the code on Web, Desktop, Mobile, CLI or VS Code (doc: brief S67.35 marks all missing).

**Before you start**

- not applicable

**Screens and controls**

- none found

**Journey**

1. None exists. The person can only ask a coding agent in chat for text output; whether the app turns that into a report, deck or design file is not established (unknown).

**What the person sees and gets**

- none found

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The CLI can read .pptx, PDF, Word and spreadsheet files as input to the agent (apps/cli/src/documents.rs:41-77, 262; apps/cli/src/platform/runtime/tool_catalog.rs:509). This is reading, not producing.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Producing a report, slide deck or design from a repository on any app: searched apps/cli/src, apps/web/features/code, apps/web/app/api/code and apps/desktop/electron for slide, deck and pptx; only the reading code above and unrelated mentions were found.

## 4. Required behaviour

**Established requirements**

- The agent produces a report, slide deck or design grounded in the repository's contents. (source: brief S67.35)
- Deck and design generation belong to the Design/artboard product area. (source: (doc: docs/product/requirements.md:245, 1483-1488))

**Acceptance criteria**

1. [proposed] From a repository, the agent returns a report file that cites file paths.
2. [proposed] A deck request returns a deck file whose slides cite repository files.
3. [proposed] The result opens in the same artifact viewer used for other artifacts.
4. [proposed] In Local mode nothing leaves the device unless the person chose a model route that does.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The feature should reuse the shared artifacts and design system rather than add a coding-only one (AGENTS.md section 3, one owner per concept).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide first whether this item is a coding feature or a use of the Artifacts and Design features with a repository as the source; then wire the coding surfaces to it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | document reader (reads pptx, pdf, docx, xlsx) | `apps/cli/src/documents.rs` | Input only; not generation. |
| config | read_file tool description | `apps/cli/src/platform/runtime/tool_catalog.rs` | Says read_file returns text from PDF, Word, PowerPoint and spreadsheet files (line 509). |
| other | Design and artboard requirements | `docs/product/requirements.md` | Project document describing deck and design generation (lines 245, 1483-1488); no code owner identified for repository grounding. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. The brief item has no code path. | device | No implementation found (searches listed in current_implementation.not_available) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None | not applicable | not applicable | not applicable |

**Models and providers.** Not applicable until implemented. Any future generation depends on the model route and on the Artifacts and Design owners (SYS-files-artifacts-and-storage, SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | not applicable: nothing exists; the requirement on Local mode is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code: the feature does not exist. | searched apps/cli/src, apps/web/features/code, apps/web/app/api/code, apps/desktop/electron |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Absence check**
  1. On each coding app, ask the agent: 'Make a slide deck that summarises this repository'.
  - Expected: Today the app either answers in text or declines; record exactly what it does. No deck file is produced.
- **Input-only check**
  1. Give the CLI a .pptx file and ask for a summary.
  - Expected: The agent reads the text of the slides (documents.rs); this shows reading works and generation does not.
- **Future acceptance**
  1. [proposed] After the feature exists, ask for a report grounded in a sample repository.
  - Expected: [proposed] A file is produced citing real file paths.

**Where to look when it fails**

- Check apps/cli/src/documents.rs for reading problems.
- Check audit/registers/known-flaws.md for any row about this item before reporting a bug (not searched for this item).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Whole feature missing** Affects: Web, Desktop, Mobile, CLI, VS Code. Evidence: brief S67.35 'missing' on every app; no code found. Work needed: Decide ownership (coding versus Artifacts and Design), then implement and verify on each app.
- **No defined product requirement text specific to repository-grounded reports** Affects: Planning. Evidence: docs/product/requirements.md describes deck and design generation without a repository source. Work needed: Write the requirement in docs/product.
- Not built on: Web, Desktop, Mobile, CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-model-catalog-and-routing
- SYS-agents-tools-and-automation

## Unknown

- Whether general Artifacts, Slides or Design features on Web or Desktop can already be fed repository content by the person pasting it; not part of this item and not traced.
- Whether the brief intends a coding-surface feature or the shared Artifacts feature.
- The extra relationship and implementation entries normally expected are not provided because only a reading helper and requirement text exist; inventing more would break the evidence rule.
