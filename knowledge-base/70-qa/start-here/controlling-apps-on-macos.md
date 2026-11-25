---
id: "DOC-70-qa-start-here-controlling-apps-on-macos"
type: "qa-method"
title: "Controlling the apps on macOS"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Controlling the apps on macOS

For a QA model that can see the screen and use the mouse and keyboard. Written 2026-11-24 from the terminal session; lines marked **confirm** have not been tried from the desktop app and must be checked on first use.

## Before the first test

1. macOS must allow the controlling app to record the screen and to control the computer (System Settings, Privacy & Security: Screen Recording, Accessibility). **confirm**
2. Ask for access to exactly the apps under test. Take a screenshot and look before saying anything about what is on screen.
3. Close windows that hold real personal data. Use only the local test accounts.
4. One heavy job at a time on this computer (16 GB of memory): do not build, start a simulator and run a browser recording together.

## What each app needs

| App              | What to open                                 | How to act on it                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web              | `http://localhost:3000` in a browser         | With a browser tool that can read the page and click by element. Screen control alone can look at a browser but its clicks and typing are blocked there. **confirm**                                                   |
| Desktop          | The AGI desktop app window                   | Mouse and keyboard on the window, menus and shortcuts. Sign-in opens the system browser and must return to the app                                                                                                     |
| Mobile (iOS)     | The Simulator app with the AGI app installed | Click to tap, click-and-drag to swipe, type with the keyboard. Rotate and send to background from the Simulator menus                                                                                                  |
| Mobile (Android) | The Android emulator window                  | Same as iOS; use the emulator's side buttons for back, home and rotate                                                                                                                                                 |
| CLI              | A real terminal                              | Run the commands through a shell tool and read the output. Screen control can click in a terminal window but cannot type into it. **confirm**                                                                          |
| VS Code          | VS Code with the AGI extension installed     | Screen control can click in an editor window but cannot type into it, so typing into the chat panel may not be possible this way. If so, record the item as `blocked` with that reason and tell the owner. **confirm** |
| Chrome           | Google Chrome with the AGI extension loaded  | The side panel belongs to the extension, not to a web page. Check on first use whether the browser tool can reach it; if it cannot, record `blocked` with that reason. **confirm**                                     |

## Things people do that a test must include

- Click the wrong control and recover.
- Stop an answer halfway.
- Reload the page, or quit and reopen the app, in the middle of a task.
- Turn the network off and on (Wi-Fi menu, or airplane mode in a simulator).
- Paste a long text. Drag a file onto the window.
- Switch between light and dark in the app's own settings.
- Resize the window to phone width where the app is responsive; rotate a phone.

## Never

- Follow a link from an email or message with the mouse; open it in the browser tool and read the full address first.
- Complete a purchase, move money or send a real message.
- Type into a password manager or a system password prompt.
- Change anything in the project folder to make a step pass.

## When the control tool cannot do something

Do not work around it with something a person could not do. Record `blocked`, say exactly which action was not possible (for example "typing into the VS Code chat panel"), and continue with the next item. A list of blocked items tells the owner what needs a different way of testing.
