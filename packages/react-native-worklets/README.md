# react-native-worklets Stub

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-20
Kind: ts-package
Criticality: low

## Purpose

Local stub for `react-native-worklets` so Expo/Jest tests can run without the real native module.

## Consumers

Mobile tests and build tooling that resolve `react-native-worklets`.

## Public API / Exports

`package.json#exports`:

- `.` -> `./index.js`
- `./plugin` -> `./plugin.js`

## What Belongs Here

- Minimal compatibility stubs required by tests.

## What Does Not Belong Here

- Real native worklets implementation.
- Product logic.
- App UI.

## Key Files

- `index.js` - stub module.
- `plugin.js` - empty Babel plugin stub.

## Commands

No package-local commands. Verify through mobile tests.

## Environment / Secrets

No secrets belong in this package.

## Security, Privacy, Data Boundaries

This package should not execute user code or access device capabilities.

## Tests Required For Changes

Run relevant mobile/Jest tests that need the stub.

## Release / Deployment Notes

This package is internal test/build plumbing, not a shipped runtime dependency target.

## Known Caveats

It intentionally does not implement the real native module.

## CODEOWNERS

Primary: Mobile lead.
