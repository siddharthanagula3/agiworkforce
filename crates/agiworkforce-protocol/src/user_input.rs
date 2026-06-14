use schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

/// Conservative cap so one user message cannot monopolize a large context window.
pub const MAX_USER_INPUT_TEXT_CHARS: usize = 1 << 20;

/// Clamp user input text to at most [`MAX_USER_INPUT_TEXT_CHARS`] characters,
/// truncating on a `char` boundary so the result stays valid UTF-8.
///
/// This enforces the cap so a single user message cannot monopolize a large
/// context window. It is applied automatically when a [`UserInput::Text`] is
/// deserialized (the untrusted boundary); construction sites that build text
/// from already-trusted sources may call it directly.
pub fn clamp_user_input_text(text: String) -> String {
    if text.chars().count() <= MAX_USER_INPUT_TEXT_CHARS {
        return text;
    }
    text.chars().take(MAX_USER_INPUT_TEXT_CHARS).collect()
}

fn deserialize_clamped_text<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let text = String::deserialize(deserializer)?;
    Ok(clamp_user_input_text(text))
}

/// User input
#[non_exhaustive]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, TS, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum UserInput {
    Text {
        /// User-supplied message text. Capped at [`MAX_USER_INPUT_TEXT_CHARS`]
        /// characters on deserialization (the untrusted boundary) so one message
        /// cannot monopolize a large context window.
        #[serde(deserialize_with = "deserialize_clamped_text")]
        text: String,
        /// UI-defined spans within `text` that should be treated as special elements.
        /// These are byte ranges into the UTF-8 `text` buffer and are used to render
        /// or persist rich input markers (e.g., image placeholders) across history
        /// and resume without mutating the literal text.
        #[serde(default)]
        text_elements: Vec<TextElement>,
    },
    /// Pre‑encoded data: URI image.
    Image { image_url: String },

    /// Local image path provided by the user.  This will be converted to an
    /// `Image` variant (base64 data URL) during request serialization.
    LocalImage { path: std::path::PathBuf },

    /// Skill selected by the user (name + path to SKILL.md).
    Skill {
        name: String,
        path: std::path::PathBuf,
    },
    /// Explicit structured mention selected by the user.
    ///
    /// `path` identifies the exact mention target, for example
    /// `app://<connector-id>` or `plugin://<plugin-name>@<marketplace-name>`.
    Mention { name: String, path: String },
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, TS, JsonSchema)]
pub struct TextElement {
    /// Byte range in the parent `text` buffer that this element occupies.
    pub byte_range: ByteRange,
    /// Optional human-readable placeholder for the element, displayed in the UI.
    placeholder: Option<String>,
}

impl TextElement {
    pub fn new(byte_range: ByteRange, placeholder: Option<String>) -> Self {
        Self {
            byte_range,
            placeholder,
        }
    }

    /// Returns a copy of this element with a remapped byte range.
    ///
    /// The placeholder is preserved as-is; callers must ensure the new range
    /// still refers to the same logical element (and same placeholder)
    /// within the new text.
    pub fn map_range<F>(&self, map: F) -> Self
    where
        F: FnOnce(ByteRange) -> ByteRange,
    {
        Self {
            byte_range: map(self.byte_range),
            placeholder: self.placeholder.clone(),
        }
    }

    pub fn set_placeholder(&mut self, placeholder: Option<String>) {
        self.placeholder = placeholder;
    }

    /// Returns the stored placeholder without falling back to the text buffer.
    ///
    /// This must only be used inside `From<TextElement>` implementations on equivalent
    /// protocol types where the source text is unavailable. Prefer `placeholder(text)`
    /// everywhere else.
    #[doc(hidden)]
    pub fn _placeholder_for_conversion_only(&self) -> Option<&str> {
        self.placeholder.as_deref()
    }

    pub fn placeholder<'a>(&'a self, text: &'a str) -> Option<&'a str> {
        self.placeholder
            .as_deref()
            .or_else(|| text.get(self.byte_range.start..self.byte_range.end))
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, TS, JsonSchema)]
pub struct ByteRange {
    /// Start byte offset (inclusive) within the UTF-8 text buffer.
    pub start: usize,
    /// End byte offset (exclusive) within the UTF-8 text buffer.
    pub end: usize,
}

impl From<std::ops::Range<usize>> for ByteRange {
    fn from(range: std::ops::Range<usize>) -> Self {
        Self {
            start: range.start,
            end: range.end,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_truncates_to_char_cap() {
        let oversized = "x".repeat(MAX_USER_INPUT_TEXT_CHARS + 100);
        let clamped = clamp_user_input_text(oversized);
        assert_eq!(clamped.chars().count(), MAX_USER_INPUT_TEXT_CHARS);
    }

    #[test]
    fn clamp_leaves_short_text_untouched() {
        let short = "hello world".to_string();
        assert_eq!(clamp_user_input_text(short.clone()), short);
    }

    #[test]
    fn clamp_respects_char_boundary_for_multibyte() {
        // Each char is multibyte; clamping must not split a char and must stay
        // valid UTF-8 (collecting from chars() guarantees this).
        let oversized = "é".repeat(MAX_USER_INPUT_TEXT_CHARS + 10);
        let clamped = clamp_user_input_text(oversized);
        assert_eq!(clamped.chars().count(), MAX_USER_INPUT_TEXT_CHARS);
    }

    #[test]
    fn deserialization_enforces_text_cap() {
        // The cap must be enforced at the untrusted deserialization boundary.
        let oversized_text = "y".repeat(MAX_USER_INPUT_TEXT_CHARS + 50);
        let json = serde_json::json!({ "type": "text", "text": oversized_text });
        let input: UserInput = serde_json::from_value(json).expect("should deserialize");
        match input {
            UserInput::Text { text, .. } => {
                assert_eq!(
                    text.chars().count(),
                    MAX_USER_INPUT_TEXT_CHARS,
                    "deserialized text must be clamped to the cap"
                );
            }
            other => panic!("expected Text variant, got {other:?}"),
        }
    }

    #[test]
    fn deserialization_preserves_within_cap_text() {
        let json = serde_json::json!({ "type": "text", "text": "ok" });
        let input: UserInput = serde_json::from_value(json).expect("should deserialize");
        match input {
            UserInput::Text { text, .. } => assert_eq!(text, "ok"),
            other => panic!("expected Text variant, got {other:?}"),
        }
    }
}
