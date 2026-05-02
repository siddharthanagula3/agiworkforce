//! Multi-model fallback chain.
//!
//! Solves Claude Code's "rate-limit cliff" — when the primary model 429s, we
//! transparently rotate to the next model in a user-specified chain instead
//! of dying. See plan: `~/.claude/plans/even-if-it-is-bubbly-octopus.md`,
//! Day-4 Feature 3.
//!
//! The chain is parsed once from the user's `--model` flag (comma-separated)
//! or from `~/.agiworkforce/config.toml`'s `[routing]` section. The agent
//! consults the chain on classified errors and emits a `FallbackTriggered`
//! event when it rotates.

use crate::errors::CliError;

/// What kinds of errors should trigger a fallback. Hard errors (auth bad
/// payload, config invalid) skip fallback and surface immediately; soft
/// transient errors (rate limit, network, server 5xx) trigger the chain.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum FallbackOn {
    /// Only rotate on rate-limit responses. Default.
    RateLimit,
    /// Rotate on rate-limit + network + server errors.
    Transient,
    /// Rotate on every error. Use sparingly — masks bugs.
    Any,
}

impl Default for FallbackOn {
    fn default() -> Self {
        Self::Transient
    }
}

/// Ordered list of models to try. `primaries[0]` is the user's first choice;
/// each subsequent entry is consulted in order on a classified error.
#[derive(Debug, Clone, Default)]
pub struct FallbackChain {
    pub primaries: Vec<String>,
    pub on: FallbackOn,
}

impl FallbackChain {
    /// Parse a comma-separated `--model` argument like `"claude-opus-4-6,gpt-5.4,llama3.1:8b"`.
    /// Whitespace around each entry is trimmed; empty entries are dropped.
    pub fn parse(spec: &str) -> Self {
        let primaries = spec
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
        Self {
            primaries,
            on: FallbackOn::default(),
        }
    }

    /// The current head model, if any.
    pub fn head(&self) -> Option<&str> {
        self.primaries.first().map(|s| s.as_str())
    }

    /// All fallback models after the head, in order.
    pub fn tail(&self) -> &[String] {
        if self.primaries.is_empty() {
            &[]
        } else {
            &self.primaries[1..]
        }
    }

    /// Whether the supplied error should trigger rotation.
    pub fn should_rotate(&self, err: &CliError) -> bool {
        match self.on {
            FallbackOn::Any => true,
            FallbackOn::RateLimit => matches!(err, CliError::RateLimited { .. }),
            FallbackOn::Transient => match err {
                CliError::RateLimited { .. }
                | CliError::Network { .. }
                | CliError::StreamError { .. } => true,
                CliError::Api { status, .. } => (500..600).contains(status),
                _ => false,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_strips_whitespace_and_empties() {
        let c = FallbackChain::parse(" claude-opus-4-6 , , gpt-5.4 ,  ");
        assert_eq!(c.primaries, vec!["claude-opus-4-6", "gpt-5.4"]);
    }

    #[test]
    fn head_and_tail_decompose_chain() {
        let c = FallbackChain::parse("a,b,c");
        assert_eq!(c.head(), Some("a"));
        assert_eq!(c.tail(), &["b".to_string(), "c".to_string()]);
    }

    #[test]
    fn rotate_only_on_rate_limit_when_configured() {
        let c = FallbackChain {
            primaries: vec!["a".into()],
            on: FallbackOn::RateLimit,
        };
        let rl = CliError::RateLimited {
            provider: "anthropic".into(),
            retry_after: None,
        };
        let net = CliError::Network {
            url: "x".into(),
            message: "y".into(),
        };
        assert!(c.should_rotate(&rl));
        assert!(!c.should_rotate(&net));
    }

    #[test]
    fn transient_rotates_on_5xx_but_not_4xx() {
        let c = FallbackChain {
            primaries: vec!["a".into()],
            on: FallbackOn::Transient,
        };
        let api500 = CliError::Api {
            provider: "p".into(),
            status: 500,
            message: "x".into(),
        };
        let api404 = CliError::Api {
            provider: "p".into(),
            status: 404,
            message: "x".into(),
        };
        assert!(c.should_rotate(&api500));
        assert!(!c.should_rotate(&api404));
    }
}
