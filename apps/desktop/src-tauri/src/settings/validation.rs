use thiserror::Error;

/// Validation error types
#[derive(Debug, Error, Clone)]
pub enum ValidationError {
    #[error("Invalid value for key '{key}': {message}")]
    InvalidValue { key: String, message: String },

    #[error("Missing required field: {0}")]
    MissingField(String),

    #[error("Value out of range for '{key}': expected {expected}, got {actual}")]
    OutOfRange {
        key: String,
        expected: String,
        actual: String,
    },

    #[error("Invalid format for '{key}': {message}")]
    InvalidFormat { key: String, message: String },
}

/// Validate API key format
pub fn validate_api_key(provider: &str, key: &str) -> Result<(), ValidationError> {
    if key.is_empty() {
        return Err(ValidationError::InvalidValue {
            key: format!("{}_api_key", provider),
            message: "API key cannot be empty".to_string(),
        });
    }

    match provider {
        "openai" => {
            if !key.starts_with("sk-") {
                return Err(ValidationError::InvalidFormat {
                    key: format!("{}_api_key", provider),
                    message: "OpenAI API key must start with 'sk-'".to_string(),
                });
            }
            if key.len() < 20 {
                return Err(ValidationError::InvalidValue {
                    key: format!("{}_api_key", provider),
                    message: "API key is too short".to_string(),
                });
            }
        }
        "anthropic" => {
            if !key.starts_with("sk-ant-") {
                return Err(ValidationError::InvalidFormat {
                    key: format!("{}_api_key", provider),
                    message: "Anthropic API key must start with 'sk-ant-'".to_string(),
                });
            }
        }
        "google" => {
            if key.len() < 20 {
                return Err(ValidationError::InvalidValue {
                    key: format!("{}_api_key", provider),
                    message: "API key is too short".to_string(),
                });
            }
        }
        _ => {
            // Generic validation for other providers
            if key.len() < 10 {
                return Err(ValidationError::InvalidValue {
                    key: format!("{}_api_key", provider),
                    message: "API key is too short".to_string(),
                });
            }
        }
    }

    Ok(())
}

/// Validate temperature value (0.0 to 2.0)
pub fn validate_temperature(temperature: f64) -> Result<(), ValidationError> {
    if !(0.0..=2.0).contains(&temperature) {
        return Err(ValidationError::OutOfRange {
            key: "temperature".to_string(),
            expected: "0.0 to 2.0".to_string(),
            actual: temperature.to_string(),
        });
    }
    Ok(())
}

/// Validate max_tokens value (1 to 200000)
pub fn validate_max_tokens(max_tokens: u32) -> Result<(), ValidationError> {
    if !(1..=200_000).contains(&max_tokens) {
        return Err(ValidationError::OutOfRange {
            key: "max_tokens".to_string(),
            expected: "1 to 200000".to_string(),
            actual: max_tokens.to_string(),
        });
    }
    Ok(())
}

/// Validate model name (non-empty and reasonable length)
pub fn validate_model_name(model_name: &str) -> Result<(), ValidationError> {
    if model_name.is_empty() {
        return Err(ValidationError::InvalidValue {
            key: "model_name".to_string(),
            message: "Model name cannot be empty".to_string(),
        });
    }

    if model_name.len() > 100 {
        return Err(ValidationError::InvalidValue {
            key: "model_name".to_string(),
            message: "Model name is too long (max 100 characters)".to_string(),
        });
    }

    Ok(())
}

/// Validate theme value
pub fn validate_theme(theme: &str) -> Result<(), ValidationError> {
    match theme {
        "light" | "dark" | "system" => Ok(()),
        _ => Err(ValidationError::InvalidValue {
            key: "theme".to_string(),
            message: format!(
                "Invalid theme '{}'. Must be 'light', 'dark', or 'system'",
                theme
            ),
        }),
    }
}

/// Validate language code (ISO 639-1)
pub fn validate_language_code(lang: &str) -> Result<(), ValidationError> {
    if lang.len() != 2 && lang.len() != 5 {
        return Err(ValidationError::InvalidFormat {
            key: "language".to_string(),
            message: "Language code must be in ISO 639-1 format (e.g., 'en', 'en-US')".to_string(),
        });
    }

    if !lang.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(ValidationError::InvalidFormat {
            key: "language".to_string(),
            message: "Language code contains invalid characters".to_string(),
        });
    }

    Ok(())
}

/// Validate font size (8 to 32)
pub fn validate_font_size(size: u32) -> Result<(), ValidationError> {
    if !(8..=32).contains(&size) {
        return Err(ValidationError::OutOfRange {
            key: "font_size".to_string(),
            expected: "8 to 32".to_string(),
            actual: size.to_string(),
        });
    }
    Ok(())
}

/// Validate URL format
pub fn validate_url(url: &str) -> Result<(), ValidationError> {
    if url.is_empty() {
        return Ok(()); // Empty URL is allowed (use default)
    }

    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(ValidationError::InvalidFormat {
            key: "url".to_string(),
            message: "URL must start with http:// or https://".to_string(),
        });
    }

    Ok(())
}

/// Validate timeout value (1 to 300 seconds)
pub fn validate_timeout(timeout_seconds: u64) -> Result<(), ValidationError> {
    if !(1..=300).contains(&timeout_seconds) {
        return Err(ValidationError::OutOfRange {
            key: "timeout_seconds".to_string(),
            expected: "1 to 300".to_string(),
            actual: timeout_seconds.to_string(),
        });
    }
    Ok(())
}

/// Validate retry count (0 to 10)
pub fn validate_max_retries(max_retries: u32) -> Result<(), ValidationError> {
    if max_retries > 10 {
        return Err(ValidationError::OutOfRange {
            key: "max_retries".to_string(),
            expected: "0 to 10".to_string(),
            actual: max_retries.to_string(),
        });
    }
    Ok(())
}

/// Validate session timeout (1 to 1440 minutes)
pub fn validate_session_timeout(timeout_minutes: u32) -> Result<(), ValidationError> {
    if !(1..=1440).contains(&timeout_minutes) {
        return Err(ValidationError::OutOfRange {
            key: "session_timeout_minutes".to_string(),
            expected: "1 to 1440 (24 hours)".to_string(),
            actual: timeout_minutes.to_string(),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_api_key() {
        // Valid keys
        assert!(validate_api_key("openai", "sk-abcdefghijklmnopqrstuvwxyz").is_ok());
        assert!(validate_api_key("anthropic", "sk-ant-abcdefghijklmnopqrstuvwxyz").is_ok());
        assert!(validate_api_key("google", "abcdefghijklmnopqrstuvwxyz").is_ok());

        // Invalid keys
        assert!(validate_api_key("openai", "").is_err());
        assert!(validate_api_key("openai", "invalid").is_err());
        assert!(validate_api_key("anthropic", "sk-wrong").is_err());
    }

    #[test]
    fn test_validate_temperature() {
        assert!(validate_temperature(0.7).is_ok());
        assert!(validate_temperature(0.0).is_ok());
        assert!(validate_temperature(2.0).is_ok());
        assert!(validate_temperature(-0.1).is_err());
        assert!(validate_temperature(2.1).is_err());
    }

    #[test]
    fn test_validate_max_tokens() {
        assert!(validate_max_tokens(1000).is_ok());
        assert!(validate_max_tokens(1).is_ok());
        assert!(validate_max_tokens(200_000).is_ok());
        assert!(validate_max_tokens(0).is_err());
        assert!(validate_max_tokens(200_001).is_err());
    }

    #[test]
    fn test_validate_theme() {
        assert!(validate_theme("light").is_ok());
        assert!(validate_theme("dark").is_ok());
        assert!(validate_theme("system").is_ok());
        assert!(validate_theme("invalid").is_err());
    }

    #[test]
    fn test_validate_language_code() {
        assert!(validate_language_code("en").is_ok());
        assert!(validate_language_code("en-US").is_ok());
        assert!(validate_language_code("invalid").is_err());
        assert!(validate_language_code("e").is_err());
    }

    #[test]
    fn test_validate_font_size() {
        assert!(validate_font_size(14).is_ok());
        assert!(validate_font_size(8).is_ok());
        assert!(validate_font_size(32).is_ok());
        assert!(validate_font_size(7).is_err());
        assert!(validate_font_size(33).is_err());
    }

    #[test]
    fn test_validate_url() {
        assert!(validate_url("").is_ok());
        assert!(validate_url("https://example.com").is_ok());
        assert!(validate_url("http://localhost:8080").is_ok());
        assert!(validate_url("example.com").is_err());
        assert!(validate_url("ftp://example.com").is_err());
    }
}
