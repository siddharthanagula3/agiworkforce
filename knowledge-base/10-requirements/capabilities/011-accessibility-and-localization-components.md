---
id: "REQ-AREA-011"
type: "requirements"
title: "Requirement items: Accessibility and localization components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 11. Accessibility and localization components

28 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S11.01

**Accessible control labels.** Every interactive control exposes an accessible name (visible text, aria-label or platform equivalent) that says what it does.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile done, VS Code done, Chrome unverified
- Feature: [F011-01 Screen-reader names, labels and headings](../../20-features/011-accessibility-and-localization-components/F011-01-screen-reader-names-labels-and-headings.md)
- Competitor trace: CAP-settings-28

## S11.02

**Semantic heading hierarchy.** Each screen has a top heading and sections use nested headings, so screen-reader users can jump by heading.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F011-01 Screen-reader names, labels and headings](../../20-features/011-accessibility-and-localization-components/F011-01-screen-reader-names-labels-and-headings.md)

## S11.03

**Keyboard navigation.** Everything can be reached and operated from the keyboard, including menus with arrow keys and Escape.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F011-02 Keyboard operation of menus, dialogs and focus](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md)

## S11.04

**Visible focus indicators.** The focused control always shows a clearly visible focus indicator when navigating by keyboard.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F011-02 Keyboard operation of menus, dialogs and focus](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md)

## S11.05

**Focus management across dialogs.** Opening a dialog moves focus into it, Tab stays inside it, and Escape closes it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F011-02 Keyboard operation of menus, dialogs and focus](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md)

## S11.06

**Focus restoration after panel closure.** Closing a dialog, menu or panel returns focus to the control that opened it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified, VS Code done, Chrome done
- Feature: [F011-02 Keyboard operation of menus, dialogs and focus](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md)

## S11.07

**Screen-reader announcements for completed events.** When something finishes (a reply, a tool step, a save, a connection), a screen reader hears a short announcement without moving focus.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F011-04 Screen-reader announcements for finished work and streaming replies](../../20-features/011-accessibility-and-localization-components/F011-04-screen-reader-announcements-for-finished-work-and.md)

## S11.08

**Non-spammy streaming announcements.** A streaming reply is announced calmly (in word-bounded chunks or once when done), never token by token and never twice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code unverified, Chrome unverified
- Feature: [F011-04 Screen-reader announcements for finished work and streaming replies](../../20-features/011-accessibility-and-localization-components/F011-04-screen-reader-announcements-for-finished-work-and.md)

## S11.09

**Accessible tool and approval status.** Tool steps and approval requests expose their state (running, done, failed, waiting for approval) to assistive tech, with labelled approve and deny controls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F011-01 Screen-reader names, labels and headings](../../20-features/011-accessibility-and-localization-components/F011-01-screen-reader-names-labels-and-headings.md)

## S11.10

**Touch equivalents for hover interactions.** Anything revealed on hover is also reachable by touch (always visible on touch screens or shown on tap).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Chrome done
- Feature: [F011-03 Touch and drag alternatives](../../20-features/011-accessibility-and-localization-components/F011-03-touch-and-drag-alternatives.md)

## S11.11

**Alternatives to drag-only operations.** Every drag operation (drop files, resize, reorder) has a non-drag alternative such as a button, menu or arrow keys.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code done
- Feature: [F011-03 Touch and drag alternatives](../../20-features/011-accessibility-and-localization-components/F011-03-touch-and-drag-alternatives.md)

## S11.12

**Text resizing.** Text scales with the user's text-size setting (browser, OS or app) up to at least 200% without being cut off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome unverified
- Feature: [F011-05 Text size, zoom and long-text layout](../../20-features/011-accessibility-and-localization-components/F011-05-text-size-zoom-and-long-text-layout.md)
- Competitor trace: CAP-settings-04

## S11.13

**Browser-zoom reflow.** At high browser zoom (400%) the layout reflows to one column with no horizontal scrolling.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Chrome unverified
- Feature: [F011-05 Text size, zoom and long-text layout](../../20-features/011-accessibility-and-localization-components/F011-05-text-size-zoom-and-long-text-layout.md)
- Competitor trace: CAP-settings-04

## S11.14

**Reduced motion.** With the OS or app reduced-motion preference on, looping and travelling animation stops or is replaced.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F011-06 Reduced motion](../../20-features/011-accessibility-and-localization-components/F011-06-reduced-motion.md)
- Competitor trace: CAP-settings-05

## S11.15

**Captions.** Spoken audio (voice conversations) can be shown as live captions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F011-07 Voice captions and transcripts](../../20-features/011-accessibility-and-localization-components/F011-07-voice-captions-and-transcripts.md)

## S11.16

**Transcripts.** A voice conversation leaves a readable text transcript kept with the chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F011-07 Voice captions and transcripts](../../20-features/011-accessibility-and-localization-components/F011-07-voice-captions-and-transcripts.md)

## S11.17

**Chart descriptions.** A chart comes with a text description (title, what is plotted, key values) that assistive tech can read.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F011-08 Chart descriptions and data tables](../../20-features/011-accessibility-and-localization-components/F011-08-chart-descriptions-and-data-tables.md)

## S11.18

**Data-table alternatives for charts.** A chart can be viewed as a data table (or its data read in order) as an alternative to the graphic.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F011-08 Chart descriptions and data tables](../../20-features/011-accessibility-and-localization-components/F011-08-chart-descriptions-and-data-tables.md)

## S11.19

**Right-to-left layouts.** In a right-to-left language the whole layout mirrors correctly (direction set and spacing uses logical start/end).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome missing
- Feature: [F011-09 Right-to-left and mixed-direction text, and typing with input methods](../../20-features/011-accessibility-and-localization-components/F011-09-right-to-left-and-mixed-direction-text-and-typing.md)

## S11.20

**Mixed-direction text handling.** Messages mixing left-to-right and right-to-left text render each paragraph in its own direction (e.g. dir="auto").

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified, VS Code missing, Chrome missing
- Feature: [F011-09 Right-to-left and mixed-direction text, and typing with input methods](../../20-features/011-accessibility-and-localization-components/F011-09-right-to-left-and-mixed-direction-text-and-typing.md)

## S11.21

**Input-method composition support.** Typing with an input method (Japanese, Chinese, Korean) never sends the message when Enter confirms a composition.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F011-09 Right-to-left and mixed-direction text, and typing with input methods](../../20-features/011-accessibility-and-localization-components/F011-09-right-to-left-and-mixed-direction-text-and-typing.md)

## S11.22

**Locale-aware dates and numbers.** Dates, times and numbers are formatted for the user's locale rather than a fixed US format.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome unverified
- Feature: [F011-11 Locale-aware dates, numbers and money](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md)
- Competitor trace: CAP-settings-11

## S11.23

**Currency formatting.** Prices and money amounts show the right currency symbol and the user's number format.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F011-11 Locale-aware dates, numbers and money](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md)

## S11.24

**Pluralization.** Counted phrases follow each language's plural rules rather than an English "s" suffix.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F011-10 Languages and translated messages](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md)

## S11.25

**Translated error messages.** Error messages appear in the user's chosen language.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code done, Chrome done
- Feature: [F011-10 Languages and translated messages](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md)
- Competitor trace: CAP-settings-07

## S11.26

**Platform-specific shortcut notation.** Shortcut hints use the platform's notation (⌘ on Apple, Ctrl elsewhere).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code done
- Seen in a real run: Web PARTIAL
- Feature: [F011-02 Keyboard operation of menus, dialogs and focus](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md)
- Competitor trace: CAP-settings-12

## S11.27

**Long-label and translated-copy layouts.** Long labels and longer translated strings wrap or truncate cleanly without overlapping or clipping controls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile unverified, CLI done, VS Code unverified, Chrome done
- Feature: [F011-05 Text size, zoom and long-text layout](../../20-features/011-accessibility-and-localization-components/F011-05-text-size-zoom-and-long-text-layout.md)

## S11.28

**Accessible terminal output mode.** The CLI offers a plain output mode for screen readers (no colour, spinners or redraws) and honours NO_COLOR everywhere.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F011-12 Plain terminal output](../../20-features/011-accessibility-and-localization-components/F011-12-plain-terminal-output.md)
- Competitor trace: CAP-settings-28
