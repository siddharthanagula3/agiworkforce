# Baseline Desktop IPC Registrations Without Literal Callers

Status: Accepted — reconciled

Date: 2026-07-29

Owners: Desktop frontend, Desktop native, and product integration

## Context

The corrected Desktop wiring guard parses only the real
`tauri::generate_handler![]` registry and scans production Desktop/shared-client
sources for literal command calls. After removing phantom frontend calls and
unregistered renderer-exposed billing commands, 97 registered commands remain
without a statically discoverable caller.

Some commands were invoked through runtime-selected names, while the rest were
preexisting integration debt to wire or cut in Ticket 1C. The temporary
baseline allowed the guard to land without permitting new orphan registrations.

## Decision

`apps/desktop/wiring-allowlist.json` is the only accepted exception list for a
registered command without a literal production caller.

- Every entry names one registered command and gives a substantive reason.
- Entries with confirmed runtime-selected call sites identify that mechanism.
- The checker rejects duplicate, unregistered, or newly called entries as
  stale.
- Adding a new entry requires updating this decision or superseding it; the
  normal rule is to add the caller in the same change or remove the command.

An allowlist entry is not evidence that a capability is built or reachable.
The integration inventory remains authoritative for product status.

## Consequences

CI now fails on every new frontend-to-native mismatch, every unregistered
Tauri command definition, and every new orphan registration. Ticket 1C is
reconciled: the only reviewed exceptions are three runtime-selected local-model
commands with verified dispatch tables.

## Ticket 1C Progress

- 2026-07-30: cut the six fail-closed native `cloud_*` CRUD registrations and
  the two unconsumed transfer commands that could only call those placeholders.
  The managed-cloud Web API client remains the sole Desktop cloud-persistence
  boundary. The temporary orphan allowance count decreased from 97 to 91.
- 2026-07-30: taught the frontend scanner to recognize imported invoke aliases
  such as `docInvoke`. The live `execute_code` caller in `editingStore.ts` is
  now enforced automatically, reducing the reviewed allowance count to 90.
- 2026-07-30: cut eight legacy native `ai_*` commands and five custom updater
  commands. Mounted AI workflows remain on the agent/workspace/tool paths;
  updates and version reads remain on the signed Tauri plugin APIs. The reviewed
  allowance count decreased from 90 to 77.
- 2026-07-30: cut 22 isolated native wrappers for the unused background-LLM
  queue, debug analysis, native GitHub browser, and `/doctor` endpoints. Mounted
  background-agent/Git paths and sanitized startup diagnostics remain. The
  reviewed allowance count decreased from 77 to 55.
- 2026-07-30: removed the final 52 uncalled Tauri registrations and their
  command attributes, retaining internal Rust functions where they still have
  native callers. Obsolete development mocks were pruned. Ticket 1C closes with
  zero temporary exceptions and three reviewed runtime-dispatch entries.
