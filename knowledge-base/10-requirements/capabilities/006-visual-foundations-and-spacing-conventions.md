---
id: "REQ-AREA-006"
type: "requirements"
title: "Requirement items: Visual foundations and spacing conventions"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 6. Visual foundations and spacing conventions

35 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S6.01

**Semantic background colors.** The surface paints page and panel backgrounds from named semantic background tokens, per theme, not per-component literals.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-01 Colour roles](../../20-features/006-visual-foundations-and-spacing-conventions/F006-01-colour-roles.md)

## S6.02

**Surface and elevated-surface colors.** Raised surfaces (cards, menus, popovers, dialogs) use a named elevated-surface token distinct from the page ground in each theme.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-01 Colour roles](../../20-features/006-visual-foundations-and-spacing-conventions/F006-01-colour-roles.md)

## S6.03

**Text and muted-text colors.** Primary and muted text use named text tokens that meet 4.5:1 on every surface they land on, without opacity dilution.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-01 Colour roles](../../20-features/006-visual-foundations-and-spacing-conventions/F006-01-colour-roles.md)

## S6.04

**Border and divider colors.** Borders and dividers use named border/rule tokens (subtle and strong) per theme.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-01 Colour roles](../../20-features/006-visual-foundations-and-spacing-conventions/F006-01-colour-roles.md)

## S6.05

**Accent and selection colors.** Accent and selection colours have separate fill, text and on-fill roles that each meet contrast on the backgrounds they are drawn on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-01 Colour roles](../../20-features/006-visual-foundations-and-spacing-conventions/F006-01-colour-roles.md)

## S6.06

**Success, warning, error, and information colors.** Success, warning, error and info each have text and fill roles, and status text meets 4.5:1 on its background in both themes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-01 Colour roles](../../20-features/006-visual-foundations-and-spacing-conventions/F006-01-colour-roles.md)

## S6.07

**Typography families.** The surface declares its UI (sans), editorial and monospace font families once and loads the faces it names.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-02 Type scale and fonts](../../20-features/006-visual-foundations-and-spacing-conventions/F006-02-type-scale-and-fonts.md)

## S6.08

**Heading scale.** Headings use one defined heading scale (named levels pairing size, weight and line-height) applied across the surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-02 Type scale and fonts](../../20-features/006-visual-foundations-and-spacing-conventions/F006-02-type-scale-and-fonts.md)

## S6.09

**Body-text scale.** Body text uses a defined base size (and small variant) applied consistently, respecting the user's text-size preference where offered.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-02 Type scale and fonts](../../20-features/006-visual-foundations-and-spacing-conventions/F006-02-type-scale-and-fonts.md)

## S6.10

**Caption and metadata scale.** Captions and metadata use a named small-text role no smaller than 12px that keeps AA contrast.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-02 Type scale and fonts](../../20-features/006-visual-foundations-and-spacing-conventions/F006-02-type-scale-and-fonts.md)

## S6.11

**Monospace typography.** Code and technical text use a declared monospace family and size distinct from body text.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-02 Type scale and fonts](../../20-features/006-visual-foundations-and-spacing-conventions/F006-02-type-scale-and-fonts.md)

## S6.12

**Line-height rules.** Line height is defined per text role (paired with size) rather than set ad hoc per element.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-02 Type scale and fonts](../../20-features/006-visual-foundations-and-spacing-conventions/F006-02-type-scale-and-fonts.md)

## S6.13

**Paragraph spacing.** Rendered paragraphs in responses are separated by a defined vertical gap set in one rule.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-03 Reply content spacing](../../20-features/006-visual-foundations-and-spacing-conventions/F006-03-reply-content-spacing.md)

## S6.14

**List indentation.** Lists in rendered content use a defined indentation (and nesting step).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-03 Reply content spacing](../../20-features/006-visual-foundations-and-spacing-conventions/F006-03-reply-content-spacing.md)

## S6.15

**Code-block padding.** Code blocks have defined internal padding set in one shared rule.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-03 Reply content spacing](../../20-features/006-visual-foundations-and-spacing-conventions/F006-03-reply-content-spacing.md)

## S6.16

**Table-cell padding.** Table cells (in rendered content and data tables) have defined, consistent padding.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-03 Reply content spacing](../../20-features/006-visual-foundations-and-spacing-conventions/F006-03-reply-content-spacing.md)

## S6.17

**Conversation-turn spacing.** Consecutive conversation turns are separated by one defined vertical spacing value.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-04 Chat layout spacing](../../20-features/006-visual-foundations-and-spacing-conventions/F006-04-chat-layout-spacing.md)

## S6.18

**Message-to-toolbar spacing.** The per-message action toolbar sits a defined distance below the message it belongs to.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-04 Chat layout spacing](../../20-features/006-visual-foundations-and-spacing-conventions/F006-04-chat-layout-spacing.md)

## S6.19

**Composer internal padding.** The composer has defined internal padding around the input and its controls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-04 Chat layout spacing](../../20-features/006-visual-foundations-and-spacing-conventions/F006-04-chat-layout-spacing.md)

## S6.20

**Page-edge gutters.** Pages use defined page-edge gutters that step with viewport width.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-04 Chat layout spacing](../../20-features/006-visual-foundations-and-spacing-conventions/F006-04-chat-layout-spacing.md)

## S6.21

**Sidebar row height.** Sidebar/history list rows have one defined row height.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-05 Row, menu, dialog and form sizes](../../20-features/006-visual-foundations-and-spacing-conventions/F006-05-row-menu-dialog-and-form-sizes.md)

## S6.22

**Menu-item height.** Menu items share one defined item height/padding across menus.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-05 Row, menu, dialog and form sizes](../../20-features/006-visual-foundations-and-spacing-conventions/F006-05-row-menu-dialog-and-form-sizes.md)

## S6.23

**Dialog padding.** Dialogs and sheets share one defined inner padding.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-05 Row, menu, dialog and form sizes](../../20-features/006-visual-foundations-and-spacing-conventions/F006-05-row-menu-dialog-and-form-sizes.md)

## S6.24

**Form-field spacing.** Form fields share a defined label-to-input and field-to-field spacing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-05 Row, menu, dialog and form sizes](../../20-features/006-visual-foundations-and-spacing-conventions/F006-05-row-menu-dialog-and-form-sizes.md)

## S6.25

**Icon sizes and stroke conventions.** Icons come from one family with a fixed grid and stroke width, sized from a small set.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-06 Buttons and icons](../../20-features/006-visual-foundations-and-spacing-conventions/F006-06-buttons-and-icons.md)

## S6.26

**Button sizes and density variants.** Buttons come in a defined set of sizes/densities from one component.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-06 Buttons and icons](../../20-features/006-visual-foundations-and-spacing-conventions/F006-06-buttons-and-icons.md)

## S6.27

**Border-radius scale.** Corner radii come from one named radius ladder.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-07 Corners, shadows and stacking](../../20-features/006-visual-foundations-and-spacing-conventions/F006-07-corners-shadows-and-stacking.md)

## S6.28

**Shadow and elevation scale.** Shadows come from a small named elevation scale per theme.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-07 Corners, shadows and stacking](../../20-features/006-visual-foundations-and-spacing-conventions/F006-07-corners-shadows-and-stacking.md)

## S6.29

**Layering and z-index rules.** Stacking order uses one named z-index ladder; components never invent numeric layers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F006-07 Corners, shadows and stacking](../../20-features/006-visual-foundations-and-spacing-conventions/F006-07-corners-shadows-and-stacking.md)

## S6.30

**Motion durations and easing.** Animations and transitions use named durations and easing curves.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-08 Motion and reduced motion](../../20-features/006-visual-foundations-and-spacing-conventions/F006-08-motion-and-reduced-motion.md)

## S6.31

**Reduced-motion alternatives.** When the user asks for reduced motion (OS setting or in-app), looping and travelling animation stops or is replaced with a gentle equivalent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-08 Motion and reduced motion](../../20-features/006-visual-foundations-and-spacing-conventions/F006-08-motion-and-reduced-motion.md)

## S6.32

**Light, dark, and system themes.** The user can use light, dark, or follow-the-system appearance, and the whole surface (including code) follows it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-09 Light, dark and system themes](../../20-features/006-visual-foundations-and-spacing-conventions/F006-09-light-dark-and-system-themes.md)

## S6.33

**High-contrast treatment.** A high-contrast treatment exists (OS setting and/or in-app) that strengthens text, borders and focus.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-10 High contrast](../../20-features/006-visual-foundations-and-spacing-conventions/F006-10-high-contrast.md)

## S6.34

**Selected, focused, hovered, pressed, and disabled states.** Interactive controls show distinct selected, focused, hovered, pressed and disabled states.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-11 Control states](../../20-features/006-visual-foundations-and-spacing-conventions/F006-11-control-states.md)

## S6.35

**Brand assets and application icons.** The surface ships its brand mark and application icons at the sizes the platform needs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F006-12 Brand marks and app icons](../../20-features/006-visual-foundations-and-spacing-conventions/F006-12-brand-marks-and-app-icons.md)
