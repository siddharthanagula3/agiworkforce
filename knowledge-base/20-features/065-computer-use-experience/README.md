---
id: "AREA-065"
type: "area"
title: "Computer-use experience"
features: ["F065-01", "F065-99"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 65. Computer-use experience

Computer use lets the assistant look at the screen and act in apps. The person stays in charge: they choose apps, watch each step, and can pause or stop it.

**Who uses it.** Signed-in people who turn it on in the desktop app or run a Chrome task. Plan gates not established.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F065-01](F065-01-turn-on-and-permissions.md) | Turn on and permissions | no | built | n/a | no | n/a | built |
| [F065-99](F065-99-other-items.md) | Other items in Computer-use experience | partly | partly | partly | no | no | partly |

Requirement items for this area: [10-requirements/capabilities/065-computer-use-experience.md](../../10-requirements/capabilities/065-computer-use-experience.md).

## How this area works in the code

1. **Turn on.** The toggle saves the preference. (`apps/desktop/electron/runtime/computerUseSession.ts:380-388`)

## Files to know

| File | Role |
|---|---|
| `apps/desktop/electron/runtime/computerUseSession.ts` | Desktop run state machine. |

## What is stored

- Permission decisions: apps/desktop/electron/runtime/permissionManager.ts:49-50

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Computer use on or off**: Off refuses steps. (apps/desktop/electron/runtime/computerUseSession.ts:93)

## Shared between apps

Timeline component is shared; desktop input code is separate.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- nothing noticed

## Not established

- Test payload only.
