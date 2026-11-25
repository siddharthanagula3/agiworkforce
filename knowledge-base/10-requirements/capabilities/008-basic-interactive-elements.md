---
id: "REQ-AREA-008"
type: "requirements"
title: "Requirement items: Basic interactive elements"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 8. Basic interactive elements

50 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S8.01

**Primary buttons.** The main action in a view uses a visually emphasised primary button style, applied in shipped UI, whose label meets contrast on its fill.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-01 Action buttons](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)

## S8.02

**Secondary buttons.** A less prominent secondary (outline/ghost) button style exists and is used beside primary actions in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-01 Action buttons](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)

## S8.03

**Destructive buttons.** Irreversible actions use a distinct destructive button style (danger colour before hover) whose label meets contrast.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-01 Action buttons](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)

## S8.04

**Icon-only buttons.** Icon-only buttons exist in shipped UI and each carries an accessible name (aria-label or equivalent).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F008-01 Action buttons](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)

## S8.05

**Split buttons.** A split button (main action plus an attached menu of alternative actions) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F008-01 Action buttons](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)

## S8.06

**Toggle buttons.** A toggle button (a button with an on/off pressed state announced to assistive tech) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome unverified
- Feature: [F008-04 Switches, checkboxes and toggle buttons](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)

## S8.07

**Button groups.** Related buttons are grouped into a labelled button group in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile partial, CLI done, VS Code done, Chrome unverified
- Feature: [F008-01 Action buttons](../../20-features/008-basic-interactive-elements/F008-01-action-buttons.md)

## S8.08

**Text links.** Links in text are visibly styled as links and open their destination when activated.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-02 Text links](../../20-features/008-basic-interactive-elements/F008-02-text-links.md)

## S8.09

**Text inputs.** Single-line text inputs with a visible label or accessible name are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-03 Text fields and search](../../20-features/008-basic-interactive-elements/F008-03-text-fields-and-search.md)

## S8.10

**Multiline inputs.** A multi-line text area that accepts newlines is used in shipped UI (e.g. the composer).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-03 Text fields and search](../../20-features/008-basic-interactive-elements/F008-03-text-fields-and-search.md)

## S8.11

**Search fields.** A search field (search semantics, placeholder or label, filters as typed or on submit) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F008-03 Text fields and search](../../20-features/008-basic-interactive-elements/F008-03-text-fields-and-search.md)

## S8.12

**Password fields.** Secret entry (passwords, API keys, tokens) uses a masked field in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-03 Text fields and search](../../20-features/008-basic-interactive-elements/F008-03-text-fields-and-search.md)

## S8.13

**One-time-code fields.** A one-time-code field (short numeric code, one-time-code autofill or paste) is used where the product asks for a code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified, Chrome done
- Feature: [F008-03 Text fields and search](../../20-features/008-basic-interactive-elements/F008-03-text-fields-and-search.md)

## S8.14

**Checkboxes.** Checkboxes (independent on/off choices in a list, with checked state exposed) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F008-04 Switches, checkboxes and toggle buttons](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)

## S8.15

**Radio groups.** A radio group (mutually exclusive options, all visible, with checked state exposed) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F008-04 Switches, checkboxes and toggle buttons](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)

## S8.16

**Switches.** Switches (immediate on/off settings with switch semantics) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-04 Switches, checkboxes and toggle buttons](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)

## S8.17

**Segmented controls.** A segmented control (a small set of mutually exclusive options shown as joined segments) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome unverified
- Feature: [F008-04 Switches, checkboxes and toggle buttons](../../20-features/008-basic-interactive-elements/F008-04-switches-checkboxes-and-toggle-buttons.md)

## S8.18

**Single-select menus.** A single-select menu (choose one value from a list) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-05 Choose one or more from a list](../../20-features/008-basic-interactive-elements/F008-05-choose-one-or-more-from-a-list.md)

## S8.19

**Searchable comboboxes.** A searchable combobox (type to filter a list, then pick one, with listbox semantics or keyboard navigation) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F008-05 Choose one or more from a list](../../20-features/008-basic-interactive-elements/F008-05-choose-one-or-more-from-a-list.md)

## S8.20

**Multiselect controls.** A multiselect control (pick several values from one list, each selection shown and removable) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F008-05 Choose one or more from a list](../../20-features/008-basic-interactive-elements/F008-05-choose-one-or-more-from-a-list.md)

## S8.21

**Token/chip inputs.** A token/chip input (typed entries become removable chips inside or beside the field) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F008-05 Choose one or more from a list](../../20-features/008-basic-interactive-elements/F008-05-choose-one-or-more-from-a-list.md)

## S8.22

**Numeric steppers.** A numeric stepper (number field with increment/decrement) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code done, Chrome done
- Feature: [F008-06 Numeric values and sliders](../../20-features/008-basic-interactive-elements/F008-06-numeric-values-and-sliders.md)

## S8.23

**Sliders.** A slider (drag or arrow keys to set one value on a scale) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Feature: [F008-06 Numeric values and sliders](../../20-features/008-basic-interactive-elements/F008-06-numeric-values-and-sliders.md)

## S8.24

**Range sliders.** A range slider (two thumbs selecting a minimum and maximum) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F008-06 Numeric values and sliders](../../20-features/008-basic-interactive-elements/F008-06-numeric-values-and-sliders.md)

## S8.25

**Date pickers.** A date picker (calendar or native date control) is used where a date is entered in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F008-07 Date, time, zone and colour pickers](../../20-features/008-basic-interactive-elements/F008-07-date-time-zone-and-colour-pickers.md)

## S8.26

**Time pickers.** A time picker (native or custom time control) is used where a time is entered in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Feature: [F008-07 Date, time, zone and colour pickers](../../20-features/008-basic-interactive-elements/F008-07-date-time-zone-and-colour-pickers.md)

## S8.27

**Timezone pickers.** A time zone picker (searchable list of zones, defaulting to the device zone) is used where schedules take a zone.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F008-07 Date, time, zone and colour pickers](../../20-features/008-basic-interactive-elements/F008-07-date-time-zone-and-colour-pickers.md)

## S8.28

**Color pickers.** A colour picker (swatches or a colour input) is used where the user chooses a colour.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Feature: [F008-07 Date, time, zone and colour pickers](../../20-features/008-basic-interactive-elements/F008-07-date-time-zone-and-colour-pickers.md)

## S8.29

**File inputs.** A file input (choose files from the device) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-08 Files and drop areas](../../20-features/008-basic-interactive-elements/F008-08-files-and-drop-areas.md)

## S8.30

**Upload dropzones.** An upload drop zone accepts files dragged onto it and shows a drag-over state.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code done, Chrome done
- Feature: [F008-08 Files and drop areas](../../20-features/008-basic-interactive-elements/F008-08-files-and-drop-areas.md)

## S8.31

**Tabs.** Tabs (a tablist switching between panels, with the selected tab exposed) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-09 Tabs, accordions and disclosure](../../20-features/008-basic-interactive-elements/F008-09-tabs-accordions-and-disclosure.md)

## S8.32

**Accordions.** An accordion (a stack of sections that expand and collapse, each with a labelled header) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F008-09 Tabs, accordions and disclosure](../../20-features/008-basic-interactive-elements/F008-09-tabs-accordions-and-disclosure.md)

## S8.33

**Disclosure controls.** A disclosure control (a toggle that shows or hides one block of detail, exposing its expanded state) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-09 Tabs, accordions and disclosure](../../20-features/008-basic-interactive-elements/F008-09-tabs-accordions-and-disclosure.md)

## S8.34

**Dropdown menus.** Dropdown menus (a button that opens a list of actions with menu keyboard behaviour) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-10 Menus](../../20-features/008-basic-interactive-elements/F008-10-menus.md)

## S8.35

**Context menus.** A context menu (right-click or long-press opens actions for the item under the pointer) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, VS Code done, Chrome done
- Feature: [F008-10 Menus](../../20-features/008-basic-interactive-elements/F008-10-menus.md)

## S8.36

**Nested menus.** A nested menu (a menu item that opens a submenu) is used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F008-10 Menus](../../20-features/008-basic-interactive-elements/F008-10-menus.md)

## S8.37

**Tooltips.** Tooltips (short labels shown on hover or focus for controls) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code done, Chrome done
- Feature: [F008-11 Hints, tags and status markers](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)

## S8.38

**Popovers.** Popovers (anchored floating panels that open from a trigger and dismiss on Escape or outside click) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F008-11 Hints, tags and status markers](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)

## S8.39

**Hover cards.** Hover cards (a rich preview that appears when hovering a link, mention or citation) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code missing, Chrome missing
- Feature: [F008-11 Hints, tags and status markers](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)

## S8.40

**Badges.** Badges (small status or count markers attached to an item) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F008-11 Hints, tags and status markers](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)

## S8.41

**Tags.** Tags (small labels that categorise or describe an item, distinct from status badges) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome unverified
- Feature: [F008-11 Hints, tags and status markers](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)

## S8.42

**Avatars.** Message authors are distinguished visually and for assistive technology (R-n: avatar or equivalent marker plus an accessible label).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-11 Hints, tags and status markers](../../20-features/008-basic-interactive-elements/F008-11-hints-tags-and-status-markers.md)

## S8.43

**Progress indicators.** Progress indicators (determinate bars or indeterminate spinners with an accessible name) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-12 Progress, loading and feedback messages](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)

## S8.44

**Skeleton loaders.** Skeleton placeholders stand in for content while it loads.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Feature: [F008-12 Progress, loading and feedback messages](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)

## S8.45

**Toasts.** Toasts (transient, non-blocking notifications that dismiss themselves) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F008-12 Progress, loading and feedback messages](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)

## S8.46

**Inline alerts.** Inline alerts (a message block inside the content, with alert or status semantics, for warnings or errors) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-12 Progress, loading and feedback messages](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)

## S8.47

**Banners.** Banners (a full-width strip at the top or bottom of a view for system or account messages) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-12 Progress, loading and feedback messages](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)

## S8.48

**Pagination controls.** Pagination controls (next/previous, page numbers or an explicit "Load more") let the user move through a long list.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome unverified
- Feature: [F008-12 Progress, loading and feedback messages](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)

## S8.49

**Empty states.** Empty states (a message and next step shown when a list or view has no content) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F008-12 Progress, loading and feedback messages](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)

## S8.50

**Error states.** Error states (a view-level message with a recovery action when content fails to load or a request fails) are used in shipped UI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F008-12 Progress, loading and feedback messages](../../20-features/008-basic-interactive-elements/F008-12-progress-loading-and-feedback-messages.md)
