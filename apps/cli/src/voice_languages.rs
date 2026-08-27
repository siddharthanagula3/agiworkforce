//! Voice language table.
//!
//! Split out of `voice` so `/voice <lang>` validation and the supported-language
//! listing stay available in builds without the `voice` feature, where the
//! capture pipeline (and its `libasound` link) is compiled out.

/// Supported voice languages (ISO 639-1 codes).
const SUPPORTED_LANGUAGES: &[(&str, &str)] = &[
    ("en", "English"),
    ("es", "Spanish"),
    ("fr", "French"),
    ("de", "German"),
    ("it", "Italian"),
    ("pt", "Portuguese"),
    ("ja", "Japanese"),
    ("ko", "Korean"),
    ("zh", "Chinese"),
    ("ar", "Arabic"),
    ("hi", "Hindi"),
    ("ru", "Russian"),
    ("nl", "Dutch"),
    ("pl", "Polish"),
    ("sv", "Swedish"),
    ("da", "Danish"),
    ("no", "Norwegian"),
    ("fi", "Finnish"),
    ("tr", "Turkish"),
    ("cs", "Czech"),
];

/// Check whether a voice language code is valid.
pub fn is_valid_language(lang: &str) -> bool {
    SUPPORTED_LANGUAGES.iter().any(|(code, _)| *code == lang)
}

/// Return the list of supported language codes.
pub fn supported_languages() -> Vec<(&'static str, &'static str)> {
    SUPPORTED_LANGUAGES.to_vec()
}

/// Get the human-readable name for a language code.
pub fn language_name(code: &str) -> &'static str {
    SUPPORTED_LANGUAGES
        .iter()
        .find(|(c, _)| *c == code)
        .map(|(_, name)| *name)
        .unwrap_or("Unknown")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_codes_validate_and_name() {
        assert!(is_valid_language("en"));
        assert_eq!(language_name("ja"), "Japanese");
    }

    #[test]
    fn unknown_codes_are_rejected_and_named_unknown() {
        assert!(!is_valid_language("zz"));
        assert_eq!(language_name("zz"), "Unknown");
    }

    #[test]
    fn every_supported_code_round_trips() {
        for (code, name) in supported_languages() {
            assert!(is_valid_language(code), "{code} must validate");
            assert_eq!(language_name(code), name);
        }
    }
}
