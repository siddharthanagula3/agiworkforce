//! Speech-provider transcription contract shared by every Rust surface.
//!
//! The desktop Tauri binary and the CLI binary both post recorded audio to the
//! same speech provider. Each used to carry its own copy of the endpoint URL,
//! the multipart field names, and its own rule for picking the transcription
//! model, so a provider change could land in one binary and silently miss the
//! other. Both now read this module, and both resolve the model through
//! [`TRANSCRIPTION_ROUTING_SLOT`].

/// Canonical routing slot naming the transcription model, resolved through
/// `agiworkforce_model_registry::slot_model`. The managed transcription route
/// in `apps/web` reads the same slot, so all three surfaces move together.
pub const TRANSCRIPTION_ROUTING_SLOT: &str = "voice_transcription";

/// BYOK destination: the user's own key, straight to the provider.
pub const OPENAI_TRANSCRIPTIONS_URL: &str = "https://api.openai.com/v1/audio/transcriptions";

/// Managed Cloud destination, relative to the account API base URL.
pub const MANAGED_TRANSCRIPTIONS_PATH: &str = "api/llm/v1/audio/transcriptions";

/// Multipart field carrying the audio bytes.
pub const TRANSCRIPTION_FILE_FIELD: &str = "file";

pub fn managed_transcriptions_url(api_base: &str) -> String {
    format!(
        "{}/{}",
        api_base.trim_end_matches('/'),
        MANAGED_TRANSCRIPTIONS_PATH
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranscriptionResponseFormat {
    Text,
    Json,
}

impl TranscriptionResponseFormat {
    pub fn wire_value(self) -> &'static str {
        match self {
            TranscriptionResponseFormat::Text => "text",
            TranscriptionResponseFormat::Json => "json",
        }
    }
}

/// The non-audio half of a transcription request: everything both binaries
/// must send identically.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptionRequest {
    pub model: String,
    pub language: Option<String>,
    pub response_format: TranscriptionResponseFormat,
}

impl TranscriptionRequest {
    pub fn new(model: impl Into<String>, response_format: TranscriptionResponseFormat) -> Self {
        Self {
            model: model.into(),
            language: None,
            response_format,
        }
    }

    pub fn with_language(mut self, language: Option<String>) -> Self {
        self.language = language.filter(|value| !value.trim().is_empty());
        self
    }

    pub fn text_fields(&self) -> Vec<(&'static str, String)> {
        let mut fields = vec![
            ("model", self.model.clone()),
            (
                "response_format",
                self.response_format.wire_value().to_string(),
            ),
        ];
        if let Some(language) = &self.language {
            fields.push(("language", language.clone()));
        }
        fields
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn managed_url_joins_the_shared_path_once() {
        assert_eq!(
            managed_transcriptions_url("https://example.invalid"),
            "https://example.invalid/api/llm/v1/audio/transcriptions"
        );
        assert_eq!(
            managed_transcriptions_url("https://example.invalid/"),
            "https://example.invalid/api/llm/v1/audio/transcriptions"
        );
    }

    #[test]
    fn text_fields_always_carry_model_and_response_format() {
        let request = TranscriptionRequest::new(
            "fixture-transcribe-model",
            TranscriptionResponseFormat::Text,
        );
        assert_eq!(
            request.text_fields(),
            vec![
                ("model", "fixture-transcribe-model".to_string()),
                ("response_format", "text".to_string()),
            ]
        );
    }

    #[test]
    fn a_blank_language_is_not_sent() {
        let request = TranscriptionRequest::new(
            "fixture-transcribe-model",
            TranscriptionResponseFormat::Json,
        )
        .with_language(Some("   ".to_string()));
        assert_eq!(request.language, None);
        assert!(!request
            .text_fields()
            .iter()
            .any(|(name, _)| *name == "language"));
    }

    #[test]
    fn a_selected_language_reaches_the_wire() {
        let request =
            TranscriptionRequest::new("fixture-transcribe-model", TranscriptionResponseFormat::Json)
                .with_language(Some("en".to_string()));
        assert!(request
            .text_fields()
            .contains(&("language", "en".to_string())));
        assert_eq!(request.response_format.wire_value(), "json");
    }
}
