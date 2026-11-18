use crate::sys::security::log_redaction::redact_secrets;
use std::io::{self, Write};

pub struct RedactingWriter<W: Write> {
    inner: W,
}

impl<W: Write> RedactingWriter<W> {
    pub fn new(inner: W) -> Self {
        Self { inner }
    }

    fn redact(&self, input: &str) -> String {
        redact_secrets(input)
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

#[cfg(test)]
mod tests {
    use super::*;

    const FILLER_24: &str = "A1b2C3d4E5f6G7h8I9j0K1l2";
    const FILLER_40: &str = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0";

    fn jwt() -> String {
        [
            "eyJ",
            "hbGciOiJIUzI1NiJ9",
            ".eyJ",
            "zdWIiOiIxMjM0NTY3",
            ".",
            FILLER_24,
        ]
        .concat()
    }

    fn key_shapes() -> Vec<(&'static str, String)> {
        vec![
            ("hyphenated sk- key", ["sk-", "proj-", FILLER_24].concat()),
            (
                "anthropic key",
                ["sk-", "ant-", "api03-", FILLER_24].concat(),
            ),
            ("google key", ["AIza", "x", &FILLER_40[..34]].concat()),
            (
                "groq key",
                ["gsk", "_", FILLER_40, &FILLER_40[..16]].concat(),
            ),
            (
                "stripe live key",
                ["sk", "_", "live", "_", FILLER_24].concat(),
            ),
            ("xai key", ["xai", "-", FILLER_24].concat()),
            (
                "slack token",
                ["xox", "b-", "1234567890-", FILLER_24].concat(),
            ),
            (
                "aws access key id",
                ["AK", "IA", "ABCDEFGH12345678"].concat(),
            ),
            (
                "aws temporary key id",
                ["AS", "IA", "ABCDEFGH12345678"].concat(),
            ),
            (
                "aws secret assignment",
                ["aws_secret_access_key", "=", FILLER_40].concat(),
            ),
            (
                "github classic token",
                ["gh", "p_", &FILLER_40[..36]].concat(),
            ),
            (
                "github oauth token",
                ["gh", "o_", &FILLER_40[..36]].concat(),
            ),
            (
                "github fine-grained token",
                ["github", "_pat_", FILLER_24].concat(),
            ),
            (
                "bearer json web token",
                ["Authorization: Bearer ", &jwt()].concat(),
            ),
            ("bearer opaque token", ["Bearer ", "abcd1234efgh"].concat()),
            (
                "private key block",
                [
                    "-----BEGIN ",
                    "PRIVATE KEY-----\\n",
                    FILLER_40,
                    "\\n-----END ",
                    "PRIVATE KEY-----",
                ]
                .concat(),
            ),
        ]
    }

    fn secret_of(name: &str, shape: &str) -> String {
        match name {
            "aws secret assignment" => FILLER_40.to_string(),
            "bearer json web token" => jwt(),
            "bearer opaque token" => "abcd1234efgh".to_string(),
            "private key block" => FILLER_40.to_string(),
            _ => shape.to_string(),
        }
    }

    #[test]
    fn trace_writer_masks_every_provider_key_shape() {
        for (name, shape) in key_shapes() {
            let mut sink = Vec::new();
            let mut writer = RedactingWriter::new(&mut sink);
            let line = format!("{{\"fields\":{{\"message\":\"call with {shape} done\"}}}}\n");
            writer.write_all(line.as_bytes()).unwrap();
            let written = String::from_utf8(sink).unwrap();
            assert!(
                !written.contains(&secret_of(name, &shape)),
                "{name} survived trace redaction"
            );
            assert!(
                written.contains("[REDACTED"),
                "{name} left no redaction marker"
            );
        }
    }
}
