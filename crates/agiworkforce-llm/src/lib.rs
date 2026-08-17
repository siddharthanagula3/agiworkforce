//! Shared LLM provider engine for AGI Workforce Rust surfaces.
//!
//! Extracted from `apps/cli/src/models/` (Wave 5, stage c1 of
//! `docs/plans/rust-engine-extraction-2026-07-09.md`). Holds the provider
//! MECHANICS only:
//!
//! - chat wire types ([`Message`], [`ContentBlock`], [`ToolDefinition`])
//! - per-dialect request serialization ([`serialize`])
//! - the five dialect stream drivers (Anthropic Messages, Gemini,
//!   Ollama-native NDJSON, OpenAI Responses, OpenAI-compatible Chat Completions) behind
//!   [`ProviderSpec`] + [`Dialect`]
//! - incremental UTF-8 stream decoding ([`Utf8StreamDecoder`])
//! - tool-call delta assembly ([`ToolCallAssembler`])
//! - the idle watchdog ([`IdleWatchdog`]) and structured error
//!   classification ([`LlmError`], [`classify_error_response`])
//! - the speech transcription endpoint/field contract ([`speech`]) shared by
//!   the desktop and CLI binaries
//!
//! POLICY stays in the apps: provider selection UX, config/key resolution,
//! subscription auth (Copilot/ChatGPT), TUI notices, routing/fallback chains,
//! vault/BYOK storage, and IPC contracts. Apps resolve credentials themselves
//! and pass opaque strings via [`Auth`]; this crate never reads key material
//! from env/config and never logs it ([`Auth`]'s `Debug` redacts).

pub mod assembler;
pub mod decode;
pub mod error;
pub mod events;
pub mod serialize;
pub mod spec;
pub mod speech;
pub mod stream;
pub mod watchdog;
pub mod wire;

pub use assembler::{INVALID_TOOL_ARGS_MARKER, ToolCallAssembler, parse_tool_arguments_json};
pub use decode::Utf8StreamDecoder;
pub use error::{LlmError, PaywallNotice, classify_error_response, parse_paywall_body};
pub use events::{ChatOutcome, StreamEvent, Usage};
pub use serialize::OllamaRequestOpts;
pub use spec::{Auth, Dialect, OpenAiOpts, ProviderSpec};
pub use speech::{TranscriptionRequest, TranscriptionResponseFormat};
pub use stream::{
    AnthropicThinking, ChatRequest, ToolChoice, build_anthropic_request_body,
    build_gemini_request_body, build_ollama_request_body, build_openai_compat_request_body,
    build_openai_responses_body, run_anthropic_stream, run_gemini_stream, run_ollama_stream,
    run_openai_compat_stream, run_openai_responses_stream, stream_chat,
};
pub use watchdog::IdleWatchdog;
pub use wire::{ContentBlock, Message, MessageContent, ToolCall, ToolDefinition};
