# @agiworkforce/react-native-worklets-stub

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-20
Kind: ts-package
Criticality: low

## Purpose

Scoped local stub for `react-native-worklets` compatibility so Expo/Jest tests can run without the real native module. It intentionally does not use the public package name.

## Consumers

Mobile tests and build tooling that explicitly opt into the scoped stub.

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
