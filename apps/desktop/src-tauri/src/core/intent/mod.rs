//! Intent Detection and Tool Routing Module
//!
//! This module provides intelligent intent detection from user prompts and
//! automatic tool routing based on detected intents. It enables the AGI system
//! to understand what the user wants and select the optimal tools/MCP servers.
//!
//! # Architecture
//!
//! ```text
//! User Prompt -> IntentDetector -> DetectedIntent
//!                                       |
//!                                       v
//!                              QuickWinOptimizer
//!                                       |
//!                                       v
//!                                  ToolRouter -> Required MCP Servers
//!                                             -> Selected Tools
//!                                             -> Execution Plan
//! ```

pub mod detector;
pub mod error;
pub mod patterns;
pub mod quick_win;
pub mod router;
pub mod types;

#[cfg(test)]
mod tests;

pub use detector::{IntentDetector, IntentDetectorConfig};
pub use error::{IntentError, IntentResult};
pub use patterns::{IntentPattern, PatternMatcher};
pub use quick_win::{OptimizationResult, QuickWinOptimizer};
pub use router::{RoutingPlan, ToolRouter, ToolRouterConfig};
pub use types::{
    Complexity, DetectedIntent, IntentCategory, IntentConfidence, RequiredServer, ToolSelection,
};
