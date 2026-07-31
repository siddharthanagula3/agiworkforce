# Cut the Orphaned Regex Workspace Index

Status: Accepted

Date: 2026-07-30

Owners: Desktop and local code intelligence

## Context

Desktop registered seven `workspace_*` commands and exposed them through two
different renderer clients, but no production component or agent tool called
either client. The implementation was described as a workspace symbol,
definition, reference, and dependency index.

The implementation did not satisfy those claims. It extracted only a few
Rust, TypeScript, and JavaScript declaration shapes even though its public
types advertised more languages and symbol kinds. It never populated exports,
left dependency targets as unresolved import strings, and implemented
reference lookup as a substring match over symbol names. Mounting it would
have advertised shallow regex output as code intelligence.

Desktop already retains separate reachable grep/glob code search and its
registered editor LSP path.

## Decision

Remove the orphaned regex index as one vertical slice: native state and
commands, the duplicate app wrapper, the inaccurate shared command-client
wrapper, and its browser mocks.

Do not add a standalone index UI around this implementation. A future durable
repository index must have one authoritative client and use parser- or
LSP-backed definitions/references with explicit persistence, invalidation, and
workspace-capability boundaries.

## Consequences

Desktop startup no longer allocates unused index state, and the renderer no
longer exposes two incompatible wire shapes for the same commands. Mounted
grep/glob and LSP behavior is unchanged.

Repository-wide semantic indexing remains a separate decision; this ADR does
not authorize sending Local workspace content to a remote embedding provider.
