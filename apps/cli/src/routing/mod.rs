//! Model routing for the CLI surface.
//!
//! CLI model selection uses `routing::fallback::FallbackChain` +
//! `routing::classify`; a unified `ExecutionPlan` resolver is adopted when
//! design-doc OQ-1 resolves the canonical resolver (Decision #23). Do not add
//! a bespoke CLI router here.

pub mod classify;
pub mod fallback;
