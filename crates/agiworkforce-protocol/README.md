# agiworkforce-protocol

Status: Current
Owner role: Rust platform
Last updated: 2026-07-14
Kind: rust-crate
Criticality: high

## Purpose

This crate owns Rust wire types shared by AGI runtimes and clients. Its
`developer_session` module defines the canonical local thread/turn protocol
used by `agi app-server` and AGI for VS Code. Selected types are generated into
`@agiworkforce/types` for TypeScript consumers.

This crate should have minimal dependencies.

Keep this crate dependency-light and free of product orchestration. It owns
serialization, schemas, stable method names, and validation-friendly wire
shapes; persistence, authorization, execution, routing, and UI behavior belong
to their runtime or surface owners.

Local developer-session changes must preserve the CLI/VS Code trust boundary,
regenerate TypeScript protocol artifacts when shapes change, and update the
app-server protocol version when an existing client would otherwise fail.
