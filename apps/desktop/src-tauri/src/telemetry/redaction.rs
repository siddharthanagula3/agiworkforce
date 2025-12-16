use once_cell::sync::Lazy;
use regex::Regex;
use std::io::{self, Write};

// Regex patterns for sensitive data
static API_KEY_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"(sk-[a-zA-Z0-9]{20,})").unwrap());
static BEARER_TOKEN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"Bearer\s+([a-zA-Z0-9\-\._~\+\/]+=*)").unwrap());
static GOOGLE_API_KEY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"AIza[0-9A-Za-z-_]{35}").unwrap());
static GITHUB_TOKEN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(ghp_[a-zA-Z0-9]{36})").unwrap());

/// A writer that redacts sensitive information from the output
pub struct RedactingWriter<W: Write> {
    inner: W,
}

impl<W: Write> RedactingWriter<W> {
    pub fn new(inner: W) -> Self {
        Self { inner }
    }

    fn redact(&self, input: &str) -> String {
        let mut result = input.to_string();
        result = API_KEY_REGEX
            .replace_all(&result, "[REDACTED_API_KEY]")
            .to_string();
        result = BEARER_TOKEN_REGEX
            .replace_all(&result, "Bearer [REDACTED_TOKEN]")
            .to_string();
        result = GOOGLE_API_KEY_REGEX
            .replace_all(&result, "[REDACTED_GOOGLE_KEY]")
            .to_string();
        result = GITHUB_TOKEN_REGEX
            .replace_all(&result, "[REDACTED_GITHUB_TOKEN]")
            .to_string();
        result
    }
}

impl<W: Write> Write for RedactingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let s = String::from_utf8_lossy(buf);
        let redacted = self.redact(&s);
        self.inner.write_all(redacted.as_bytes())?;
        // Return original length to satisfy contract
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}
