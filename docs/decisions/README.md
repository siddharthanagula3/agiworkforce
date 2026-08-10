# Architecture Decision Records

Status: Current
Owner: Platform lead
Last updated: 2026-08-08

Start with [CURRENT_DECISIONS.md](CURRENT_DECISIONS.md) for the cross-doc decision index.

This directory holds ADRs for AGI Workforce, formatted per Michael Nygard. Each ADR has
Status / Context / Decision / Consequences. Once accepted, an ADR is immutable — supersede
it with a new ADR rather than editing.

## Index

- [CURRENT_DECISIONS.md](CURRENT_DECISIONS.md) — the live cross-surface decision index.
- [pending-founder-decisions-2026-08-05.md](pending-founder-decisions-2026-08-05.md) — open
  questions awaiting a founder call.
- [2026-07-30-enterprise-local-verifier-retention.md](2026-07-30-enterprise-local-verifier-retention.md)
  — retain the zero-runtime-consumer TypeScript and Rust Enterprise Local verifiers solely as a
  cross-language contract-test foundation until a complete runtime trust boundary is approved.

## Retired records

The 2026-05 Foundation Sprint and Strategic ADR sets, and the 2026-07 integration ADRs whose
decisions are now stated inline at the code they govern, were retired on 2026-08-08. Their
content is recoverable from git history. Decisions that still bind live code are recorded next
to that code or in `CURRENT_DECISIONS.md`.
