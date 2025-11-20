use std::collections::HashMap;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use futures_util::Stream;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::router::cache_manager::CacheManager;
use crate::router::cost_calculator::CostCalculator;
use crate::router::sse_parser::StreamChunk;
use crate::router::token_counter::TokenCounter;
use crate::router::{ChatMessage, LLMProvider, LLMRequest, LLMResponse, Provider};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RoutingStrategy {
    #[default]
    Auto,
    CostOptimized,
    LatencyOptimized,
    LocalFirst,
}

#[derive(Debug, Clone, Default)]
pub struct RouterPreferences {
    pub provider: Option<Provider>,
    pub model: Option<String>,
    pub strategy: RoutingStrategy,
    pub context: Option<RouterContext>,
}

#[derive(Debug, Clone)]
pub struct RouteCandidate {
    pub provider: Provider,
    pub model: String,
    pub reason: &'static str,
}

#[derive(Debug, Clone)]
pub struct RouteOutcome {
    pub provider: Provider,
    pub model: String,
    pub response: LLMResponse,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub cost: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CostPriority {
    Low,
    Balanced,
}

impl Default for CostPriority {
    fn default() -> Self {
        CostPriority::Balanced
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterContext {
    #[serde(default)]
    pub intents: Vec<String>,
    #[serde(default)]
    pub requires_vision: bool,
    #[serde(default)]
    pub token_estimate: u32,
    #[serde(default)]
    pub cost_priority: CostPriority,
}

impl Default for RouterContext {
    fn default() -> Self {
        Self {
            intents: Vec::new(),
            requires_vision: false,
            token_estimate: 0,
            cost_priority: CostPriority::Balanced,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RouterSuggestion {
    pub provider: Provider,
    pub model: String,
    pub reason: String,
}

pub struct LLMRouter {
    providers: HashMap<Provider, Box<dyn LLMProvider>>,
    default_provider: Provider,
    cost_calculator: CostCalculator,
    cache_manager: Option<CacheManager>,
    db_connection: Option<Arc<Mutex<Connection>>>,
}

impl Default for LLMRouter {
    fn default() -> Self {
        Self::new()
    }
}

impl LLMRouter {
    pub fn suggest_for_context(&self, context: &RouterContext) -> RouterSuggestion {
        let normalized_intents: Vec<String> = context
            .intents
            .iter()
            .map(|intent| intent.to_lowercase())
            .collect();

        let mut provider = Provider::OpenAI;
        let mut task_category = TaskCategory::Simple;
        let mut reason = String::from(
            "General developer chat - routing to OpenAI for balanced cost/quality.",
        );

        if context.requires_vision {
            provider = Provider::Google;
            task_category = TaskCategory::Creative;
            reason =
                "Vision or screenshot detected - routing to Google Gemini for multimodal reasoning."
                    .to_string();
        } else if normalized_intents.iter().any(|intent| {
            matches!(
                intent.as_str(),
                "code" | "devops" | "repo" | "terminal" | "automation" | "build" | "test"
            )
        }) {
            provider = Provider::Anthropic;
            task_category = TaskCategory::Complex;
            reason =
                "Developer or automation workflow detected - routing to Anthropic Claude for deep reasoning."
                    .to_string();
        } else if context.cost_priority == CostPriority::Low {
            provider = Provider::Ollama;
            task_category = TaskCategory::Simple;
            reason =
                "Cost priority is low - routing to local Ollama model for inexpensive loops."
                    .to_string();
        }

        if context.token_estimate > 12_000 && provider == Provider::OpenAI {
            task_category = TaskCategory::Complex;
            reason = format!(
                "{} Large context (~{} tokens) detected - upgrading to GPT-4o.",
                reason, context.token_estimate
            );
        }

        self.prepare_context_suggestion(provider, task_category, reason)
    }

    fn prepare_context_suggestion(
        &self,
        preferred: Provider,
        task_category: TaskCategory,
        mut reason: String,
    ) -> RouterSuggestion {
        if self.has_provider(preferred) {
            let model = self.default_model(preferred, task_category);
            return RouterSuggestion {
                provider: preferred,
                model,
                reason,
            };
        }

        let fallback_order = [
            self.default_provider,
            Provider::Anthropic,
            Provider::OpenAI,
            Provider::Google,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Mistral,
            Provider::Ollama,
            Provider::XAI,
        ];

        for fallback in fallback_order {
            if self.has_provider(fallback) {
                if fallback != preferred {
                    reason = format!(
                        "{} ({} unavailable, falling back to {})",
                        reason,
                        preferred.as_string(),
                        fallback.as_string()
                    );
                }
                let model = self.default_model(fallback, task_category);
                return RouterSuggestion {
                    provider: fallback,
                    model,
                    reason,
                };
            }
        }

        RouterSuggestion {
            provider: preferred,
            model: self.default_model(preferred, task_category),
            reason,
        }
    }

    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
            default_provider: Provider::OpenAI,
            cost_calculator: CostCalculator::new(),
            cache_manager: None,
            db_connection: None,
        }
    }

    /// Set cache manager and database connection for LLM response caching
    pub fn set_cache(
        &mut self,
        cache_manager: CacheManager,
        db_connection: Arc<Mutex<Connection>>,
    ) {
        self.cache_manager = Some(cache_manager);
        self.db_connection = Some(db_connection);
    }

    pub fn set_default_provider(&mut self, provider: Provider) {
        self.default_provider = provider;
    }

    pub fn set_provider(&mut self, provider: Provider, instance: Box<dyn LLMProvider>) {
        self.providers.insert(provider, instance);
    }

    pub fn set_openai(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::OpenAI, provider);
    }

    pub fn set_anthropic(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Anthropic, provider);
    }

    pub fn set_google(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Google, provider);
    }

    pub fn set_ollama(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Ollama, provider);
    }

    pub fn set_xai(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::XAI, provider);
    }

    pub fn set_deepseek(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::DeepSeek, provider);
    }

    pub fn set_qwen(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Qwen, provider);
    }

    pub fn set_mistral(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Mistral, provider);
    }

    pub fn has_provider(&self, provider: Provider) -> bool {
        self.providers
            .get(&provider)
            .map(|p| p.is_configured())
            .unwrap_or(false)
    }

    pub fn candidates(
        &self,
        request: &LLMRequest,
        preferences: &RouterPreferences,
    ) -> Vec<RouteCandidate> {
        let mut order = Vec::new();
        let user_specified_provider = preferences.provider.is_some();

        if let Some(preferred) = preferences.provider {
            if self.has_provider(preferred) {
                order.push(RouteCandidate {
                    provider: preferred,
                    model: preferences
                        .model
                        .clone()
                        .unwrap_or_else(|| self.default_model(preferred, TaskCategory::Simple)),
                    reason: "user-preference",
                });
            }
        }

        if !user_specified_provider {
            if let Some(context) = &preferences.context {
                let suggestion = self.suggest_for_context(context);
                if !order.iter().any(|existing| existing.provider == suggestion.provider) {
                    order.push(RouteCandidate {
                        provider: suggestion.provider,
                        model: suggestion.model,
                        reason: "context-signal",
                    });
                }
            }
        }

        let task_type = classify_request(request);
        let mut strategy_set = self.strategy_order(task_type, preferences.strategy);

        for candidate in strategy_set.drain(..) {
            if order
                .iter()
                .any(|existing| existing.provider == candidate.provider)
            {
                continue;
            }
            if self.has_provider(candidate.provider) {
                order.push(candidate);
            }
        }

        if !user_specified_provider {
            // Ensure default provider is present
            if !order.iter().any(|c| c.provider == self.default_provider)
                && self.has_provider(self.default_provider)
            {
                order.push(RouteCandidate {
                    provider: self.default_provider,
                    model: self.default_model(self.default_provider, task_type),
                    reason: "default-provider",
                });
            }

            // Add any remaining configured providers as fallbacks
            for provider in [
                Provider::OpenAI,
                Provider::Anthropic,
                Provider::Google,
                Provider::Ollama,
                Provider::XAI,
                Provider::DeepSeek,
                Provider::Qwen,
                Provider::Mistral,
            ] {
                if order.iter().any(|c| c.provider == provider) {
                    continue;
                }
                if self.has_provider(provider) {
                    order.push(RouteCandidate {
                        provider,
                        model: self.default_model(provider, task_type),
                        reason: "fallback",
                    });
                }
            }
        }

        order
    }

    pub async fn invoke_candidate(
        &self,
        candidate: &RouteCandidate,
        request: &LLMRequest,
    ) -> Result<RouteOutcome> {
        // Check cache if available
        if let (Some(cache_manager), Some(db_conn)) = (&self.cache_manager, &self.db_connection) {
            let cache_key = CacheManager::compute_cache_key(
                candidate.provider,
                &candidate.model,
                &request.messages,
                request.temperature,
                request.max_tokens,
            );

            // Try to fetch from cache
            if let Ok(conn) = db_conn.lock() {
                if let Ok(Some(cached_entry)) = cache_manager.fetch(&conn, &cache_key) {
                    // Parse cached response
                    if let Ok(cached_response) =
                        serde_json::from_str::<LLMResponse>(&cached_entry.response)
                    {
                        let prompt_tokens = cached_response.prompt_tokens.unwrap_or(0);
                        let completion_tokens = cached_response.completion_tokens.unwrap_or(0);
                        let cost = cached_response.cost.unwrap_or(0.0);

                        // Update cache hit statistics
                        let _ = cache_manager.update_cache_hit(
                            &conn,
                            &cache_key,
                            prompt_tokens + completion_tokens,
                            cost,
                        );

                        tracing::info!(
                            "Cache hit for {}/{} - saved {} tokens, ${:.4}",
                            candidate.provider.as_string(),
                            candidate.model,
                            prompt_tokens + completion_tokens,
                            cost
                        );

                        let mut response = cached_response;
                        response.cached = true;

                        return Ok(RouteOutcome {
                            provider: candidate.provider,
                            model: response.model.clone(),
                            response,
                            prompt_tokens,
                            completion_tokens,
                            cost,
                        });
                    }
                }
            }
        }

        // Cache miss - call provider
        let provider = self
            .providers
            .get(&candidate.provider)
            .ok_or_else(|| anyhow!("Provider {:?} not configured", candidate.provider))?;

        let mut routed_request = request.clone();
        routed_request.model = candidate.model.clone();

        let mut response = provider
            .send_message(&routed_request)
            .await
            .map_err(|e| anyhow!(e.to_string()))?;
        if response.model.is_empty() {
            response.model = candidate.model.clone();
        }

        // Compute token estimates if missing
        let (prompt_tokens, completion_tokens) =
            match (response.prompt_tokens, response.completion_tokens) {
                (Some(input), Some(output)) => (input, output),
                _ => TokenCounter::estimate_for_provider(
                    candidate.provider,
                    &routed_request.messages,
                    &response.content,
                ),
            };

        let total_tokens = response.tokens.unwrap_or(prompt_tokens + completion_tokens);
        response.tokens = Some(total_tokens);
        response.prompt_tokens = Some(prompt_tokens);
        response.completion_tokens = Some(completion_tokens);

        if response.cost.is_none() {
            let cost = self.cost_calculator.calculate(
                candidate.provider,
                &response.model,
                prompt_tokens,
                completion_tokens,
            );
            response.cost = Some(cost);
        }

        let total_cost = response.cost.unwrap_or(0.0);

        // Store in cache if available
        if let (Some(cache_manager), Some(db_conn)) = (&self.cache_manager, &self.db_connection) {
            if let Ok(conn) = db_conn.lock() {
                let cache_key = CacheManager::compute_cache_key(
                    candidate.provider,
                    &candidate.model,
                    &request.messages,
                    request.temperature,
                    request.max_tokens,
                );

                let prompt_hash = CacheManager::compute_hash(&request.messages);
                let expires_at = cache_manager.temperature_aware_expiry(request.temperature);

                if let Ok(response_json) = serde_json::to_string(&response) {
                    let cache_record = crate::router::cache_manager::CacheRecord {
                        cache_key: &cache_key,
                        provider: candidate.provider,
                        model: &candidate.model,
                        prompt_hash: &prompt_hash,
                        response: &response_json,
                        tokens: Some(total_tokens),
                        cost: Some(total_cost),
                        temperature: request.temperature,
                        max_tokens: request.max_tokens,
                        expires_at,
                    };

                    if let Err(e) = cache_manager.upsert(&conn, cache_record) {
                        tracing::warn!("Failed to cache LLM response: {}", e);
                    } else {
                        tracing::debug!(
                            "Cached response for {}/{} (expires: {})",
                            candidate.provider.as_string(),
                            candidate.model,
                            expires_at
                        );
                    }
                }
            }
        }

        Ok(RouteOutcome {
            provider: candidate.provider,
            model: response.model.clone(),
            response,
            prompt_tokens,
            completion_tokens,
            cost: total_cost,
        })
    }

    fn strategy_order(&self, task: TaskCategory, strategy: RoutingStrategy) -> Vec<RouteCandidate> {
        match strategy {
            RoutingStrategy::LocalFirst => {
                vec![RouteCandidate {
                    provider: Provider::Ollama,
                    model: "llama3".to_string(),
                    reason: "strategy-local-first",
                }]
            }
            RoutingStrategy::CostOptimized => match task {
                TaskCategory::Simple => vec![
                    RouteCandidate {
                        provider: Provider::Ollama,
                        model: "llama3".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o-mini".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        provider: Provider::Google,
                        model: "gemini-1.5-flash".to_string(),
                        reason: "strategy-cost",
                    },
                ],
                TaskCategory::Complex => vec![
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        provider: Provider::Anthropic,
                        model: "claude-3-5-sonnet-20241022".to_string(),
                        reason: "strategy-cost",
                    },
                ],
                TaskCategory::Creative => vec![
                    RouteCandidate {
                        provider: Provider::Google,
                        model: "gemini-1.5-pro".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o-mini".to_string(),
                        reason: "strategy-cost",
                    },
                ],
            },
            RoutingStrategy::LatencyOptimized => vec![
                RouteCandidate {
                    provider: Provider::OpenAI,
                    model: "gpt-4o-mini".to_string(),
                    reason: "strategy-latency",
                },
                RouteCandidate {
                    provider: Provider::Google,
                    model: "gemini-1.5-flash".to_string(),
                    reason: "strategy-latency",
                },
            ],
            RoutingStrategy::Auto => match task {
                TaskCategory::Simple => vec![
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o-mini".to_string(),
                        reason: "task-simple",
                    },
                    RouteCandidate {
                        provider: Provider::Anthropic,
                        model: "claude-3-5-haiku-20241022".to_string(),
                        reason: "task-simple",
                    },
                    RouteCandidate {
                        provider: Provider::Google,
                        model: "gemini-1.5-flash".to_string(),
                        reason: "task-simple",
                    },
                ],
                TaskCategory::Complex => vec![
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o".to_string(),
                        reason: "task-complex",
                    },
                    RouteCandidate {
                        provider: Provider::Anthropic,
                        model: "claude-3-5-sonnet-20241022".to_string(),
                        reason: "task-complex",
                    },
                ],
                TaskCategory::Creative => vec![
                    RouteCandidate {
                        provider: Provider::Google,
                        model: "gemini-1.5-pro".to_string(),
                        reason: "task-creative",
                    },
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o-mini".to_string(),
                        reason: "task-creative",
                    },
                ],
            },
        }
    }

    fn default_model(&self, provider: Provider, task: TaskCategory) -> String {
        match provider {
            Provider::OpenAI => match task {
                TaskCategory::Simple => "gpt-4o-mini".to_string(),
                TaskCategory::Complex => "gpt-4o".to_string(),
                TaskCategory::Creative => "gpt-4o-mini".to_string(),
            },
            Provider::Anthropic => match task {
                TaskCategory::Simple => "claude-3-5-haiku-20241022".to_string(),
                TaskCategory::Complex => "claude-3-5-sonnet-20241022".to_string(),
                TaskCategory::Creative => "claude-3-5-sonnet-20241022".to_string(),
            },
            Provider::Google => match task {
                TaskCategory::Simple => "gemini-1.5-flash".to_string(),
                TaskCategory::Complex => "gemini-1.5-pro".to_string(),
                TaskCategory::Creative => "gemini-1.5-pro".to_string(),
            },
            Provider::Ollama => "llama3".to_string(),
            Provider::XAI => match task {
                TaskCategory::Simple => "grok-3".to_string(),
                TaskCategory::Complex => "grok-4".to_string(),
                TaskCategory::Creative => "grok-4".to_string(),
            },
            Provider::DeepSeek => match task {
                TaskCategory::Simple => "deepseek-chat".to_string(),
                TaskCategory::Complex => "deepseek-reasoner".to_string(),
                TaskCategory::Creative => "deepseek-chat".to_string(),
            },
            Provider::Qwen => match task {
                TaskCategory::Simple => "qwen-max-2025-01-25".to_string(),
                TaskCategory::Complex => "qwen-max-2025-01-25".to_string(),
                TaskCategory::Creative => "qwen-max-2025-01-25".to_string(),
            },
            Provider::Mistral => match task {
                TaskCategory::Simple => "mistral-large-2".to_string(),
                TaskCategory::Complex => "mistral-large-2".to_string(),
                TaskCategory::Creative => "mistral-large-2".to_string(),
            },
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TaskCategory {
    Simple,
    Complex,
    Creative,
}

fn classify_request(request: &LLMRequest) -> TaskCategory {
    let last_user_message = request
        .messages
        .iter()
        .rev()
        .find(|message| message.role.eq_ignore_ascii_case("user"));

    if let Some(message) = last_user_message {
        let content = message.content.to_lowercase();
        if content.contains("code") || content.contains("function") || content.contains("debug") {
            return TaskCategory::Complex;
        }

        if content.contains("design")
            || content.contains("story")
            || content.contains("creative")
            || content.contains("write a poem")
        {
            return TaskCategory::Creative;
        }

        if content.contains("analyze") || content.contains("plan") || content.contains("reason") {
            return TaskCategory::Complex;
        }
    }

    TaskCategory::Simple
}

impl LLMRouter {
    /// Send a message using the router (simplified interface)
    pub async fn send_message(
        &self,
        prompt: &str,
        preferences: Option<RouterPreferences>,
    ) -> Result<String> {
        let prefs = preferences.unwrap_or_default();
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "".to_string(), // Will be set by router
            temperature: Some(0.7),
            max_tokens: Some(4000),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        let candidates = self.candidates(&request, &prefs);
        if candidates.is_empty() {
            return Err(anyhow!("No LLM providers configured"));
        }

        // Try first candidate
        let outcome = self.invoke_candidate(&candidates[0], &request).await?;
        Ok(outcome.response.content)
    }

    /// Send a message with streaming support
    /// Returns a stream of chunks from the LLM
    pub async fn send_message_streaming(
        &self,
        request: &LLMRequest,
        preferences: &RouterPreferences,
    ) -> Result<
        Pin<
            Box<
                dyn Stream<Item = Result<StreamChunk, Box<dyn std::error::Error + Send + Sync>>>
                    + Send,
            >,
        >,
    > {
        let candidates = self.candidates(request, preferences);
        if candidates.is_empty() {
            return Err(anyhow!("No LLM providers configured"));
        }

        // Use first candidate for streaming
        let candidate = &candidates[0];
        let provider = self
            .providers
            .get(&candidate.provider)
            .ok_or_else(|| anyhow!("Provider {:?} not configured", candidate.provider))?;

        let mut routed_request = request.clone();
        routed_request.model = candidate.model.clone();
        routed_request.stream = true;

        tracing::info!(
            "Starting streaming request to {} with model {}",
            provider.name(),
            candidate.model
        );

        provider
            .send_message_streaming(&routed_request)
            .await
            .map_err(|e| anyhow!(e.to_string()))
    }
}
