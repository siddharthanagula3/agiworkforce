#![allow(dead_code)]
//! Composable routing strategies for model selection.
//!
//! Architecture: Chain-of-responsibility. Each strategy returns `Some(decision)`
//! to claim the request or `None` to pass to the next strategy.

use crate::model_catalog::Model;

/// Context passed to routing strategies for decision-making.
#[derive(Debug, Clone)]
pub struct RoutingContext {
    /// User's explicit model override (from --model flag or config).
    pub requested_model: Option<String>,
    /// The provider configured in config.toml.
    pub configured_provider: String,
    /// Default model from config or catalog.
    pub default_model: String,
    /// Fallback chain from config.toml.
    pub fallback_chain: Vec<String>,
    /// Estimated task complexity (0.0 = trivial, 1.0 = very complex).
    /// Set by classifier strategy or left as None.
    pub estimated_complexity: Option<f64>,
    /// Cumulative session cost in dollars (for cost-aware routing).
    pub session_cost_usd: f64,
    /// Maximum cost per session (from config, if set).
    pub max_session_cost_usd: Option<f64>,
}

/// A routing decision with metadata for observability.
#[derive(Debug, Clone)]
pub struct RoutingDecision {
    /// The selected model ID.
    pub model_id: String,
    /// Which strategy made the decision.
    pub source: &'static str,
    /// Human-readable reasoning for the choice.
    pub reasoning: String,
}

/// Trait for composable routing strategies.
pub trait RoutingStrategy: Send + Sync {
    /// Name of this strategy (for logging/observability).
    fn name(&self) -> &'static str;

    /// Attempt to select a model. Return `None` to delegate to next strategy.
    fn route(&self, ctx: &RoutingContext, catalog: &[Model]) -> Option<RoutingDecision>;
}

// ---------------------------------------------------------------------------
// Default strategy — terminal, always returns configured model
// ---------------------------------------------------------------------------

pub struct DefaultStrategy;

impl RoutingStrategy for DefaultStrategy {
    fn name(&self) -> &'static str {
        "default"
    }
    fn route(&self, ctx: &RoutingContext, _catalog: &[Model]) -> Option<RoutingDecision> {
        Some(RoutingDecision {
            model_id: ctx.default_model.clone(),
            source: "default",
            reasoning: format!("Using configured default: {}", ctx.default_model),
        })
    }
}

// ---------------------------------------------------------------------------
// Fallback strategy — try models in fallback chain if primary unavailable
// ---------------------------------------------------------------------------

pub struct FallbackStrategy;

impl RoutingStrategy for FallbackStrategy {
    fn name(&self) -> &'static str {
        "fallback"
    }
    fn route(&self, ctx: &RoutingContext, catalog: &[Model]) -> Option<RoutingDecision> {
        if ctx.fallback_chain.is_empty() {
            return None;
        }
        // Check if the default model exists in catalog
        let default_available = catalog.iter().any(|m| m.id == ctx.default_model);
        if default_available {
            return None; // Default is fine, skip fallback
        }
        // Walk fallback chain
        for model_id in &ctx.fallback_chain {
            if catalog.iter().any(|m| m.id == *model_id) {
                return Some(RoutingDecision {
                    model_id: model_id.clone(),
                    source: "fallback",
                    reasoning: format!(
                        "Primary model '{}' unavailable, falling back to '{}'",
                        ctx.default_model, model_id
                    ),
                });
            }
        }
        None
    }
}

// ---------------------------------------------------------------------------
// Cost strategy — route to cheapest model that meets capability threshold
// ---------------------------------------------------------------------------

pub struct CostStrategy {
    /// Maximum input price per 1M tokens to consider "cheap".
    pub max_input_price: f64,
}

impl RoutingStrategy for CostStrategy {
    fn name(&self) -> &'static str {
        "cost"
    }
    fn route(&self, ctx: &RoutingContext, catalog: &[Model]) -> Option<RoutingDecision> {
        // Only activate if session is approaching cost limit
        let limit = ctx.max_session_cost_usd?;
        if ctx.session_cost_usd < limit * 0.8 {
            return None; // Under 80% of budget, don't cost-optimize yet
        }

        // Find cheapest model that supports tools
        let mut candidates: Vec<&Model> = catalog
            .iter()
            .filter(|m| m.supports_tools && m.input_price_per_1m <= self.max_input_price)
            .collect();
        candidates.sort_by(|a, b| {
            a.input_price_per_1m
                .partial_cmp(&b.input_price_per_1m)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        candidates.first().map(|m| RoutingDecision {
            model_id: m.id.clone(),
            source: "cost",
            reasoning: format!(
                "Session at {:.0}% of ${:.2} budget — routing to cheaper model '{}'",
                (ctx.session_cost_usd / limit) * 100.0,
                limit,
                m.id
            ),
        })
    }
}

// ---------------------------------------------------------------------------
// Composite router — chains strategies in order
// ---------------------------------------------------------------------------

pub struct CompositeRouter {
    strategies: Vec<Box<dyn RoutingStrategy>>,
}

impl CompositeRouter {
    pub fn new(strategies: Vec<Box<dyn RoutingStrategy>>) -> Self {
        Self { strategies }
    }

    /// Build the default router chain: user override → fallback → cost → default.
    pub fn default_chain(_fallback_chain: Vec<String>, max_cost: Option<f64>) -> Self {
        let mut strategies: Vec<Box<dyn RoutingStrategy>> = Vec::new();
        strategies.push(Box::new(FallbackStrategy));
        if max_cost.is_some() {
            strategies.push(Box::new(CostStrategy {
                max_input_price: 5.0, // Models under $5/1M input tokens
            }));
        }
        strategies.push(Box::new(DefaultStrategy));
        Self::new(strategies)
    }

    /// Route a request through the strategy chain.
    pub fn route(&self, ctx: &RoutingContext, catalog: &[Model]) -> RoutingDecision {
        for strategy in &self.strategies {
            if let Some(decision) = strategy.route(ctx, catalog) {
                return decision;
            }
        }
        // Terminal fallback — should never reach here if DefaultStrategy is last
        RoutingDecision {
            model_id: ctx.default_model.clone(),
            source: "terminal_fallback",
            reasoning: "No strategy claimed — using default model".into(),
        }
    }
}
