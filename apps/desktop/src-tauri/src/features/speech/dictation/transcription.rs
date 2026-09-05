//! Explicit transcription-mode selection for AGI Dictation.
//!
//! Plan stage 3 (`docs/specs/desktop-global-voice/spec.md`) and the boundary
//! contract: audio is transcribed ONLY through the mode the user explicitly
//! selected, Local (on-device Whisper), BYOK (the user's own provider key),
//! or Managed Cloud. There is no silent fallback between modes:
//!
//! - Before this module, an unknown provider string fell back to the settings
//!   provider, a `deepgram` selection was silently rerouted to managed cloud,
//!   and a BYOK OpenAI selection without a stored key silently sent the audio
//!   to managed cloud instead. Every one of those crossed a trust boundary
//!   without consent; they now fail closed with actionable errors.

use std::fmt;

/// The explicit destinations dictation audio may be sent to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranscriptionMode {
    /// On-device Whisper. No network; no fallback.
    Local,
    /// AGI Managed Cloud transcription (authenticated, metered).
    Managed,
    /// The user's own OpenAI API key, directly to OpenAI. No fallback.
    ByokOpenai,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModeParseError {
    /// The provider string is not a known dictation mode. Fail closed.
    /// never guess or substitute a different boundary.
    Unknown(String),
    /// The provider exists but only supports real-time streaming, not blob
    /// dictation. Refuse explicitly instead of rerouting the audio.
    StreamingOnly(String),
}

impl fmt::Display for ModeParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ModeParseError::Unknown(raw) => write!(
                f,
                "Unknown dictation provider \"{raw}\". Choose Local Whisper, OpenAI Whisper (your key), or AGI Cloud in Voice settings."
            ),
            ModeParseError::StreamingOnly(raw) => write!(
                f,
                "Provider \"{raw}\" only supports real-time streaming and cannot transcribe recorded dictation. Choose Local Whisper, OpenAI Whisper (your key), or AGI Cloud in Voice settings."
            ),
        }
    }
}

/// Parse an explicit provider string from the frontend into a mode.
///
/// Accepts the aliases the desktop clients have historically sent. Anything
/// else is an error, the caller must NOT substitute the settings provider or
/// any other destination for an unrecognized selection.
pub fn parse_transcription_mode(raw: &str) -> Result<TranscriptionMode, ModeParseError> {
    match raw {
        "local" | "local_whisper" => Ok(TranscriptionMode::Local),
        "cloud" | "managed_cloud" | "managedcloud" => Ok(TranscriptionMode::Managed),
        "openai_whisper" => Ok(TranscriptionMode::ByokOpenai),
        "deepgram" => Err(ModeParseError::StreamingOnly(raw.to_string())),
        other => Err(ModeParseError::Unknown(other.to_string())),
    }
}

/// User-facing error for a BYOK selection without a stored key. The audio is
/// NOT sent anywhere in this case.
pub fn missing_byok_openai_key_error() -> String {
    "OpenAI Whisper dictation requires your OpenAI API key. Add one in Settings → Providers, or switch the dictation provider to Local Whisper or AGI Cloud.".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_each_explicit_alias_to_exactly_one_mode() {
        assert_eq!(
            parse_transcription_mode("local"),
            Ok(TranscriptionMode::Local)
        );
        assert_eq!(
            parse_transcription_mode("local_whisper"),
            Ok(TranscriptionMode::Local)
        );
        assert_eq!(
            parse_transcription_mode("cloud"),
            Ok(TranscriptionMode::Managed)
        );
        assert_eq!(
            parse_transcription_mode("managed_cloud"),
            Ok(TranscriptionMode::Managed)
        );
        assert_eq!(
            parse_transcription_mode("managedcloud"),
            Ok(TranscriptionMode::Managed)
        );
        assert_eq!(
            parse_transcription_mode("openai_whisper"),
            Ok(TranscriptionMode::ByokOpenai)
        );
    }

    #[test]
    fn unknown_providers_fail_closed_instead_of_falling_back() {
        for raw in ["", "webspeech", "whisper", "azure", "CLOUD", "Local"] {
            assert_eq!(
                parse_transcription_mode(raw),
                Err(ModeParseError::Unknown(raw.to_string())),
                "provider {raw:?} must fail closed"
            );
        }
    }

    #[test]
    fn deepgram_is_refused_explicitly_not_rerouted() {
        let error = parse_transcription_mode("deepgram").expect_err("must refuse");
        assert_eq!(error, ModeParseError::StreamingOnly("deepgram".to_string()));
        let message = error.to_string();
        assert!(message.contains("real-time streaming"));
        assert!(
            !message.to_lowercase().contains("falling back"),
            "refusal must not describe a fallback"
        );
    }

    #[test]
    fn error_messages_name_the_recoverable_actions() {
        assert!(parse_transcription_mode("nope")
            .expect_err("unknown")
            .to_string()
            .contains("Voice settings"));
        assert!(missing_byok_openai_key_error().contains("Settings → Providers"));
    }
}
