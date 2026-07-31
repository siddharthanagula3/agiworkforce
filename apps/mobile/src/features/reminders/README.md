# apps/mobile/src/features/reminders

Status: Current
Owner role: Mobile lead
Last updated: 2026-07-31
Purpose: Explicit-review Apple Reminders creation from iOS App Intents and deep links.

## Public API

- `index.tsx` owns the route-facing reminder review screen.
- `service.ts` owns validation, permission gating, and the `expo-calendar` write boundary.

## Rules

- Never create a reminder before the user presses the review screen's create action.
- Keep Reminders writes iOS-only; Android has no equivalent Expo Reminder API.
- Do not read reminder contents automatically or send reviewed reminder text to a model.
- Use the OS default Reminders list unless a future UI explicitly lets the user select another list.
