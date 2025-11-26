/// Central security policy system
///
/// This module provides the core guardrail/policy engine that makes security decisions
/// for all sensitive operations. The system is designed to:
///
/// 1. Preserve full capability - the agent can do anything a human can
/// 2. Add structured control through risk-based policies
/// 3. Support escalation from Normal → Elevated → FullSystem trust levels
/// 4. Provide transparency through clear decision reasoning
///
/// Philosophy: "Powerful by default, dangerous only with explicit consent"

pub mod actions;
pub mod decisions;
pub mod engine;
pub mod scope;

pub use actions::*;
pub use decisions::*;
pub use engine::*;
pub use scope::*;
