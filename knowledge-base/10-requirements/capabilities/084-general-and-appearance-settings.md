---
id: "REQ-AREA-084"
type: "requirements"
title: "Requirement items: General and appearance settings"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 84. General and appearance settings

27 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S84.01

**Display language.** The user can choose the interface display language and the UI switches to it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code missing
- Seen in a real run: Web UI_ONLY
- Feature: [F084-05 Display language](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Competitor trace: CAP-settings-07

## S84.02

**Timezone.** The user can see and set the timezone used for schedules, reminders and quiet hours.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F084-09 Notifications, quiet hours and timezone](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Competitor trace: CAP-settings-11

## S84.03

**Theme.** The user can choose light, dark or system theme and it applies and persists.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F084-01 Theme (light, dark or system)](../../20-features/084-general-and-appearance-settings/F084-01-theme-light-dark-or-system.md)
- Competitor trace: CAP-settings-01

## S84.04

**Accent color where offered.** Where offered, the user can pick an accent colour that recolours the interface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F084-02 Accent colour](../../20-features/084-general-and-appearance-settings/F084-02-accent-colour.md)
- Competitor trace: CAP-settings-02

## S84.05

**Text size.** The user can change the chat text size and it applies across messages.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F084-03 Chat text size, interface density and motion](../../20-features/084-general-and-appearance-settings/F084-03-chat-text-size-interface-density-and-motion.md)
- Competitor trace: CAP-settings-04

## S84.06

**Interface density.** The user can switch interface density (compact / comfortable).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F084-03 Chat text size, interface density and motion](../../20-features/084-general-and-appearance-settings/F084-03-chat-text-size-interface-density-and-motion.md)

## S84.07

**Reduced motion.** The user can reduce animation (in-app setting or honouring the OS reduce-motion preference).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F084-03 Chat text size, interface density and motion](../../20-features/084-general-and-appearance-settings/F084-03-chat-text-size-interface-density-and-motion.md)
- Competitor trace: CAP-settings-05

## S84.08

**Code theme.** The user can choose the syntax-highlighting theme for code blocks.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F084-04 Code blocks: syntax theme and line wrapping](../../20-features/084-general-and-appearance-settings/F084-04-code-blocks-syntax-theme-and-line-wrapping.md)
- Competitor trace: CAP-settings-06

## S84.09

**Code line wrapping.** The user can turn line wrapping for code blocks on or off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F084-04 Code blocks: syntax theme and line wrapping](../../20-features/084-general-and-appearance-settings/F084-04-code-blocks-syntax-theme-and-line-wrapping.md)
- Competitor trace: CAP-settings-06

## S84.10

**Default model.** The user can set a default model that new conversations start with.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F084-06 New chat defaults: model, reasoning effort, mode and workspace](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)
- Competitor trace: CAP-settings-17

## S84.11

**Default effort.** The user can set a default reasoning effort used for new turns.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F084-06 New chat defaults: model, reasoning effort, mode and workspace](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)
- Competitor trace: CAP-settings-17

## S84.12

**Default mode.** The user can choose the default mode new conversations start in (e.g. chat vs agent/work, ask vs auto).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F084-06 New chat defaults: model, reasoning effort, mode and workspace](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)
- Competitor trace: CAP-settings-17

## S84.13

**Default workspace.** The user can choose which workspace the app opens in by default.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F084-06 New chat defaults: model, reasoning effort, mode and workspace](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)

## S84.14

**Send-key behavior.** The user can choose whether Enter sends or inserts a newline (and which modifier sends).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code missing, Chrome missing
- Feature: [F084-07 Send key and keyboard shortcuts](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Competitor trace: CAP-settings-17

## S84.15

**Keyboard shortcuts.** Settings let the user view and customise (disable or rebind) keyboard shortcuts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PARTIAL
- Feature: [F084-07 Send key and keyboard shortcuts](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Competitor trace: CAP-settings-12, CAP-settings-13

## S84.16

**Sound effects.** The user can turn interface sound effects on or off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F084-08 Sound effects and haptics](../../20-features/084-general-and-appearance-settings/F084-08-sound-effects-and-haptics.md)

## S84.17

**Haptics.** On devices with haptics, the user can turn haptic feedback on or off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F084-08 Sound effects and haptics](../../20-features/084-general-and-appearance-settings/F084-08-sound-effects-and-haptics.md)

## S84.18

**Notification channels.** The user can choose which channels (push, email, in-app/browser) deliver each notification category.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Seen in a real run: Web UI_ONLY
- Feature: [F084-09 Notifications, quiet hours and timezone](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Competitor trace: CAP-settings-16

## S84.19

**Quiet hours.** The user can set quiet hours during which notifications are held.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F084-09 Notifications, quiet hours and timezone](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Competitor trace: CAP-settings-16

## S84.20

**Startup destination.** The user can choose what the app opens to on launch (new chat, last conversation, a project).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F084-11 Desktop launch and quick access](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)

## S84.21

**Launch-at-login preference.** The desktop app can be set to launch at login.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F084-11 Desktop launch and quick access](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)
- Competitor trace: CAP-settings-29

## S84.22

**Companion-window preference.** The user can configure the companion/quick-access window (enable, shortcut, where it appears).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Chrome done
- Feature: [F084-11 Desktop launch and quick access](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)
- Competitor trace: CAP-settings-14

## S84.23

**Sidebar behavior.** The user can configure sidebar behaviour (which items show, collapsed by default, auto-hide).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing
- Seen in a real run: Web UI_ONLY
- Feature: [F084-10 Sidebar items and layout reset](../../20-features/084-general-and-appearance-settings/F084-10-sidebar-items-and-layout-reset.md)

## S84.24

**Layout reset.** The user can reset panel sizes and layout to defaults.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F084-10 Sidebar items and layout reset](../../20-features/084-general-and-appearance-settings/F084-10-sidebar-items-and-layout-reset.md)

## S84.25

**Experimental-feature enrollment.** The user can opt into experimental or preview features from settings.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F084-12 Experimental features and restore defaults](../../20-features/084-general-and-appearance-settings/F084-12-experimental-features-and-restore-defaults.md)

## S84.26

**Restore defaults.** Settings offer a restore-defaults action that resets preferences.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F084-12 Experimental features and restore defaults](../../20-features/084-general-and-appearance-settings/F084-12-experimental-features-and-restore-defaults.md)

## S84.27

**Follow the browser language from display settings.** A user can select automatic display language in Settings. Changing the preferred browser language then changes the interface to the supported language on the next visit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial
- Feature: [F084-99 Other items in General and appearance settings](../../20-features/084-general-and-appearance-settings/F084-99-other-items.md)
