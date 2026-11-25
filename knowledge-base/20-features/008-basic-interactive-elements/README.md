---
id: "AREA-008"
type: "area"
title: "Basic interactive elements"
features: ["F008-01", "F008-02", "F008-03", "F008-04", "F008-05", "F008-06", "F008-07", "F008-08", "F008-09", "F008-10", "F008-11", "F008-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 8. Basic interactive elements

These are the basic controls a person uses in every app: buttons, text fields, switches, checkboxes, menus, tabs, pickers, file upload areas, and the messages that tell a person something is loading, empty, failed or done. They make the apps usable with a mouse, touch, keyboard and screen reader in the same way. Most of them are shared building blocks, so one fix to a control can fix every screen that uses it.

**Who uses it.** Every user of every app, on every plan. These are generic UI parts, not a paid feature. The code read here shows no plan gate on the shared primitives. Which screens show a given control can depend on plan or role, but that was not checked.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F008-01](F008-01-action-buttons.md) | Action buttons | partly | partly | partly | built | partly | partly |
| [F008-02](F008-02-text-links.md) | Text links | built | built | built | built | built | built |
| [F008-03](F008-03-text-fields-and-search.md) | Text fields and search | built | built | partly | built | built | built |
| [F008-04](F008-04-switches-checkboxes-and-toggle-buttons.md) | Switches, checkboxes and toggle buttons | built | built | built | built | partly | partly |
| [F008-05](F008-05-choose-one-or-more-from-a-list.md) | Choose one or more from a list | built | built | partly | built | partly | partly |
| [F008-06](F008-06-numeric-values-and-sliders.md) | Numeric values and sliders | partly | partly | partly | n/a | partly | partly |
| [F008-07](F008-07-date-time-zone-and-colour-pickers.md) | Date, time, zone and colour pickers | built | built | built | n/a | no | partly |
| [F008-08](F008-08-files-and-drop-areas.md) | Files and drop areas | built | built | built | built | built | built |
| [F008-09](F008-09-tabs-accordions-and-disclosure.md) | Tabs, accordions and disclosure | built | built | built | partly | partly | partly |
| [F008-10](F008-10-menus.md) | Menus | partly | partly | partly | partly | partly | partly |
| [F008-11](F008-11-hints-tags-and-status-markers.md) | Hints, tags and status markers | built | built | built | built | partly | partly |
| [F008-12](F008-12-progress-loading-and-feedback-messages.md) | Progress, loading and feedback messages | built | built | built | built | partly | partly |

Requirement items for this area: [10-requirements/capabilities/008-basic-interactive-elements.md](../../10-requirements/capabilities/008-basic-interactive-elements.md).

## How this area works in the code

1. **Screen asks for a button.** Screens import the shared Button from the UI package. The look comes from a class-variance table: default (primary fill), destructive (red), outline, secondary, ghost and link. Sizes are default, xs, sm, lg and icon. (`packages/ui/ui/src/primitives/Button.tsx:8`, `packages/ui/ui/src/primitives/Button.tsx:13`, `packages/ui/ui/src/primitives/Button.tsx:14`, `packages/ui/ui/src/primitives/Button.tsx:16`, `packages/ui/ui/src/primitives/Button.tsx:18`, `packages/ui/ui/src/primitives/Button.tsx:20`)
2. **Button renders with loading and disabled state.** The button is inert when disabled or loading. It sets aria-busy while loading and adds a screen-reader text Loading, please wait. (`packages/ui/ui/src/primitives/Button.tsx:58`, `packages/ui/ui/src/primitives/Button.tsx:72`, `packages/ui/ui/src/primitives/Button.tsx:80`, `packages/ui/ui/src/primitives/Button.tsx:97`, `packages/ui/ui/src/primitives/Button.tsx:103`)
3. **Mobile button uses a 44 point touch target.** On phones the button has a minimum touch area of 44 points. Small sizes get extra invisible padding (touch slop) to reach it. It is a native Pressable with the button role and a disabled state. (`apps/mobile/components/ui/button.tsx:23`, `apps/mobile/components/ui/button.tsx:25`, `apps/mobile/components/ui/button.tsx:31`, `apps/mobile/components/ui/button.tsx:43`, `apps/mobile/components/ui/button.tsx:129`, `apps/mobile/components/ui/button.tsx:131`)
4. **Segmented control handles keys and selection.** Each segment shows its selected state with aria-pressed. Left and Right arrows move the selection by one, and Home and End jump to the first and last segment. (`packages/ui/ui/src/primitives/SegmentedControl.tsx:19`, `packages/ui/ui/src/primitives/SegmentedControl.tsx:26`, `packages/ui/ui/src/primitives/SegmentedControl.tsx:39`, `packages/ui/ui/src/primitives/SegmentedControl.tsx:40`, `packages/ui/ui/src/primitives/SegmentedControl.tsx:57`)
5. **Switch and checkbox wrap a headless library.** The web switch and checkbox are thin wrappers around a headless (unstyled, accessible) switch library. On mobile the switch is the native platform switch with an accessibility label. (`packages/ui/ui/src/primitives/Switch.tsx:9`, `packages/ui/ui/src/primitives/Checkbox.tsx:10`, `apps/mobile/components/ui/switch.tsx:13`)
6. **Chip input commits typed values.** Typed text is split on spaces, commas and semicolons, normalised and validated. Accepted values become removable chips, and a limit (maxItems) stops more chips and shows a message. Enter and key presses on chips are handled here. The message is translated. (`packages/ui/ui/src/primitives/ChipInput.tsx:34`, `packages/ui/ui/src/primitives/ChipInput.tsx:57`, `packages/ui/ui/src/primitives/ChipInput.tsx:68`, `packages/ui/ui/src/primitives/ChipInput.tsx:199`, `packages/ui/ui/src/primitives/ChipInput.tsx:224`, `packages/ui/ui/src/primitives/ChipInput.tsx:236`)
7. **Context menu on the desktop file tree.** Right-click on a file or folder opens a menu near the pointer, kept inside the window. Click or right-click anywhere closes it. Keyboard handling for menus is attached. (`apps/desktop/src/features/code/FileTree.tsx:449`, `apps/desktop/src/features/code/FileTree.tsx:488`)
8. **Mobile approval rows are labelled buttons.** Each tool approval row is a button with a label built from the tool summary (Decision for, Guidance for, Add guidance for). The rows are not wrapped in a labelled group. (`apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:260`, `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:342`, `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:374`, `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:409`)
9. **Slider holds one value.** The shared slider is a headless slider with one thumb, marks and an accessible thumb label. No range (two-thumb) variant exists. (`packages/ui/ui/src/primitives/Slider.tsx:27`, `packages/ui/ui/src/primitives/Slider.tsx:97`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/ui/src/primitives/Button.tsx` | Shared web button with its variants, sizes, loading and disabled behaviour. |
| `packages/ui/ui/src/primitives/ChipInput.tsx` | Shared chip (token) input: splits typed text, validates, limits count, removes chips. |
| `packages/ui/ui/src/primitives/SegmentedControl.tsx` | Shared segmented control with arrow, Home and End key handling and aria-pressed. |
| `packages/ui/ui/src/primitives/Slider.tsx` | Shared single-value slider (headless library); no range variant. |
| `packages/ui/ui/src/primitives/Switch.tsx` | Shared web switch wrapper. |
| `packages/ui/ui/src/primitives/Checkbox.tsx` | Shared web checkbox wrapper. |
| apps/mobile/components/ui/button.tsx (not found) | Mobile button: sizes, 44-point touch target, native pressable, haptics import. |
| apps/mobile/components/ui/switch.tsx (not found) | Mobile switch wrapper around the native switch with accessibility label. |
| `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx` | Mobile tool approval rows as labelled buttons (no group wrapper found). |
| `apps/desktop/src/features/code/FileTree.tsx` | Desktop file tree with the only right-click context menu seen in this area. |
| `packages/ui/ui/src/primitives/Tooltip.tsx` | Shared tooltip content component (only the content part was read). |
| `packages/ui/ui/src/primitives/EmptyState.tsx` | Shared empty state: icon, title, description and optional action. |

## What is stored

- Nothing is stored by the shared controls themselves.: packages/ui/ui/src/primitives/ChipInput.tsx:34 (values come in as a prop and go out through onChange).
- Current values of sliders, switches and selects are held by the calling screen, not by the primitive.: packages/ui/ui/src/primitives/Slider.tsx:27 and packages/ui/ui/src/primitives/Switch.tsx:9 take value props; persistence was not traced.
- Mobile button imports the settings store; use of it was not seen in the lines read.: apps/mobile/components/ui/button.tsx:12

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **No plan gate or feature flag in the shared primitives**: The shared buttons, inputs, switches and menus have no on or off switch. Screens that show them may gate them; not checked. (packages/ui/ui/src/primitives/Button.tsx:8 (no flag read))
- **Chip input limit**: maxItems stops more chips and shows a full message. It is set by the caller. (packages/ui/ui/src/primitives/ChipInput.tsx:21 and :57)
- **Button loading state**: isLoading makes the button inert and shows busy state. (packages/ui/ui/src/primitives/Button.tsx:54 and :72)
- **Mobile button touch target**: A constant 44 points sets the minimum touch area; smaller sizes get extra touch slop. (apps/mobile/components/ui/button.tsx:23 and :31)

## Shared between apps

Shared web controls live in packages/ui/ui/src/primitives (Button, ChipInput, SegmentedControl, Slider, Switch, Checkbox, Tooltip, EmptyState and others). Mobile has its own controls in apps/mobile/components/ui and apps/mobile/src (separate React Native code). The CLI has its own terminal widgets in apps/cli/src/tui/widgets (Rust). VS Code uses HTML strings in apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts. The Chrome extension has its own panel code in apps/extension/src/side_panel.ts. Whether the desktop app imports the shared package was not checked.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The Button loading text is hard-coded English. The chip input in the same folder translates its messages. (packages/ui/ui/src/primitives/Button.tsx:103 versus packages/ui/ui/src/primitives/ChipInput.tsx:236)
- The brief says the desktop context menu is missing (S8.35), but the desktop file tree has a right-click menu with keyboard handling. (apps/desktop/src/features/code/FileTree.tsx:449 and :488)
- The brief cites Button.tsx:15 as the secondary style. Line 15 is the destructive style text; the secondary style is at line 18. The brief's line numbers are stale. (packages/ui/ui/src/primitives/Button.tsx:14 to :20 and the brief's S8.02 entry)
- The brief's split button and range slider items are missing. Only a test file mentions a split button, and the shared slider has one thumb. (apps/web/features/schedules/components/SchedulesPage.test.tsx (test mention only); packages/ui/ui/src/primitives/Slider.tsx:27)

## Not established

- Most of the brief's code references were not opened, so their 'done' status is not confirmed from code. This includes the web composer (ChatComposerNew.tsx, ComposerFooter.tsx), ConversationTitleMenu.tsx, the mobile ModelPickerSheet, the CLI model picker and approval overlay, the VS Code webview content, and the Chrome side panel.
- Several brief entries cite apps/web/app/chat/page.tsx:13 and apps/extension-vscode/src/core/chatSetup.ts:60 for unrelated items (for example S8.06, S8.17, S8.25, S8.31, S8.34, S8.37, S8.40, S8.44, S8.46 to S8.50). They look like a shared or wrong reference. Not checked.
- Text link behaviour (S8.08): the link components were not opened, so it is not confirmed that links open their destination.
- Web Button destructive label contrast (S8.03): the colour tokens and theme-contrast test were not read.
- Time zone default to device zone (S8.27), date and time pickers and the schedule form were not read.
- The one-time-code field (S8.13) and its autofill and paste behaviour were not read.
- Whether the desktop app imports the shared packages/ui primitives was not checked.
- Tooltip, popover, hover card, toast, skeleton and pagination primitives were listed in the brief but not read (only the Tooltip content part and EmptyState signature were seen).
- Mobile button group (S8.07) and mobile multiselect (S8.20) status come from the brief only.
- No tests, builds or servers were run, as the task required (read only).
