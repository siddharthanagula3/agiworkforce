# Mobile continuity

## Purpose

Explain the existing Managed Cloud task lifecycle when an account first enters Cloud mode, and
keep the explanation replayable from Settings → Capabilities.

## Boundaries

- Presentation acknowledgement is stored per Clerk owner in encrypted MMKV.
- The automatic gate only opens for a signed-in owner while Managed Cloud mode is active.
- Starting from the explanation switches to Managed Cloud before opening the chat composer.
- Background-work copy is backed by the existing Cloud run lifecycle and `task_completed`
  notification deep link; this feature does not create a second task runtime.
- Local Mode never performs Cloud work or network egress through this feature.
