//! Model routing strategies — composable chain-of-responsibility pattern.
//!
//! Inspired by Gemini CLI's 7-strategy routing architecture.
//! Each strategy either returns a model decision or delegates to the next.

pub mod fallback;
mod strategy;

#[allow(unused_imports)]
pub use strategy::{
    CompositeRouter, CostStrategy, DefaultStrategy, FallbackStrategy, RoutingContext,
    RoutingDecision, RoutingStrategy,
};
