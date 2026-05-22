# agiworkforce-protocol

Status: Current
Owner role: Rust platform
Last updated: 2026-05-20
Kind: rust-crate
Criticality: high

## Purpose

This crate defines the "types" for the protocol used by Agiworkforce CLI, which includes both "internal types" for communication between `agiworkforce-core` and `agiworkforce-tui`, as well as "external types" used with `codex app-server`.

This crate should have minimal dependencies.

Ideally, we should avoid "material business logic" in this crate, as we can always introduce `Ext`-style traits to add functionality to types in other crates.
