use once_cell::sync::Lazy;
use regex::Regex;
use std::io::{self, Write};

static API_KEY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(sk-[a-zA-Z0-9]{20,})").expect("valid regex: API key pattern"));
static BEARER_TOKEN_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"Bearer\s+([a-zA-Z0-9\-\._~\+\/]+=*)").expect("valid regex: bearer token pattern")
});
static GOOGLE_API_KEY_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"AIza[0-9A-Za-z-_]{35}").expect("valid regex: Google API key pattern")
});
static GITHUB_TOKEN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(ghp_[a-zA-Z0-9]{36})").expect("valid regex: GitHub token pattern"));

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

        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}
