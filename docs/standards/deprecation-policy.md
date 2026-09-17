# Deprecation policy

Status: Current
Owner: Repository maintainers
Last updated: 2026-09-17

How something stops existing without breaking whoever depended on it. This
covers the public HTTP surface, the CLI, released client surfaces, and the
storage and export formats a customer can hold a copy of.

It does not cover internal code. Inside the repository there is no deprecation
period: an unused abstraction is deleted, and `AGENTS.md` section 9 forbids
keeping a speculative compatibility layer around for one.

## What counts as breaking

| Change                                                | Breaking |
| ------------------------------------------------------ | -------- |
| Adding an endpoint, a command, a response field         | no       |
| Accepting a new optional request field                  | no       |
| Widening an accepted value                              | no       |
| Removing an endpoint, a command, a response field       | yes      |
| Narrowing an accepted value or tightening a scope       | yes      |
| Changing the meaning of an existing field               | yes      |
| Changing a default that alters an existing caller       | yes      |
| Removing a field from an export format                  | yes      |

A change is breaking based on what a caller observes, not on how the code looks.
Renaming a field and keeping the old one populated is not breaking; keeping the
old name and quietly changing what it holds is.

## The stages

1. **Announce.** The replacement exists and works before anything is marked
   deprecated. A deprecation with no migration path is an outage with notice.
   The `CHANGELOG.md` entry names the replacement and the removal date.
2. **Warn in the product, not only in a document.** A deprecated HTTP endpoint
   answers with a `Deprecation` header and a `Sunset` header carrying the removal
   date. A deprecated CLI command prints a one-line notice to stderr, never to
   stdout, so a script that pipes output is not corrupted by the warning.
3. **Wait.** The minimum notice period below runs from the announcement, not from
   the first warning a given caller happens to see.
4. **Remove.** The code is deleted, not left behind guarded by a flag. The
   removal is its own `CHANGELOG.md` entry.

## Minimum notice

| Surface                                 | Minimum notice |
| ---------------------------------------- | -------------- |
| Public HTTP endpoint or response field   | 180 days       |
| API key scope semantics                  | 180 days       |
| CLI command or flag                      | 90 days        |
| Export or import format field            | 180 days       |
| Internal package entrypoint              | none           |

Two things shorten the clock, and nothing else does: a security defect that
cannot be fixed compatibly, and an upstream provider withdrawing something the
surface only ever proxied. Both are announced as removals with the reason stated,
and both still ship the replacement first where one is possible.

## Model lifecycle is not deprecation

A model leaving the catalogue is governed by
`packages/ai/model-registry/catalog/model-families.json` and the promotion gates
in `AGENTS.md` section 4, not by this policy. A newer release in an existing
family is a one-record promotion that retains the predecessor and a bounded
fallback chain, so a caller that named the family slot keeps working and a caller
that named a specific model keeps getting that model until it is withdrawn by its
provider. Do not route a model retirement through the stages above; run the
family promotion and let the fallback chain do its job.

## Data a customer holds

An export format is a contract with a customer who has a file on their own disk,
and they cannot be asked to re-export. A field is therefore never removed from an
export without the full notice period, and an importer accepts every version of
the format it has ever written. `docs/runbooks/vendor-migration.md` covers the
formats and how to move between providers.
