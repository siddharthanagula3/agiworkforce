use crate::sys::security::log_redaction::redact_secrets;
use serde_json::Value;
use std::io::{self, Write};

fn redact_text_value(key: Option<&str>, text: &str) -> String {
    let Some(key) = key else {
        return redact_secrets(text);
    };
    let prefix = format!("{key}=");
    let masked = redact_secrets(&format!("{prefix}{text}"));
    match masked.strip_prefix(&prefix) {
        Some(value) => value.to_owned(),
        None => masked,
    }
}

fn redact_json_value(value: Value, key: Option<&str>) -> Value {
    match value {
        Value::String(text) => Value::String(redact_text_value(key, &text)),
        Value::Array(items) => Value::Array(
            items
                .into_iter()
                .map(|item| redact_json_value(item, key))
                .collect(),
        ),
        Value::Object(fields) => Value::Object(
            fields
                .into_iter()
                .map(|(name, field)| {
                    let redacted = redact_json_value(field, Some(&name));
                    (name, redacted)
                })
                .collect(),
        ),
        other => other,
    }
}

fn redact_json_records(input: &str) -> Option<String> {
    let mut output = String::with_capacity(input.len());
    for line in input.split_inclusive('\n') {
        let body = line.trim_end_matches(['\r', '\n']);
        if body.trim().is_empty() {
            output.push_str(line);
            continue;
        }
        let record = serde_json::from_str::<Value>(body).ok()?;
        if !record.is_object() {
            return None;
        }
        output.push_str(&redact_json_value(record, None).to_string());
        output.push_str(&line[body.len()..]);
    }
    Some(output)
}

pub struct RedactingWriter<W: Write> {
    inner: W,
}

impl<W: Write> RedactingWriter<W> {
    pub fn new(inner: W) -> Self {
        Self { inner }
    }

    fn redact(&self, input: &str) -> String {
        redact_json_records(input).unwrap_or_else(|| redact_secrets(input))
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

    fn write_through(input: &str) -> String {
        let mut sink = Vec::new();
        let mut writer = RedactingWriter::new(&mut sink);
        writer.write_all(input.as_bytes()).unwrap();
        String::from_utf8(sink).unwrap()
    }

    fn json_record(fields: serde_json::Value) -> String {
        let mut record = serde_json::json!({
            "timestamp": "2026-11-18T10:00:00Z",
            "level": "WARN",
            "target": "agiworkforce::security",
        });
        record["fields"] = fields;
        format!("{record}\n")
    }

    #[test]
    fn trace_writer_keeps_json_envelope_when_message_mentions_password() {
        let secret = ["hunter", "2-rotated"].concat();
        let line = json_record(
            serde_json::json!({ "message": format!("password rows missing, stored {secret}") }),
        );
        let written = write_through(&line);
        let record: serde_json::Value =
            serde_json::from_str(written.trim()).expect("record is still JSON");
        assert_eq!(record["timestamp"], "2026-11-18T10:00:00Z");
        assert_eq!(record["level"], "WARN");
        assert_eq!(record["target"], "agiworkforce::security");
        assert!(!written.contains(&secret), "password value survived");
        assert!(written.ends_with('\n'));
    }

    #[test]
    fn trace_writer_masks_provider_keys_in_nested_json_fields() {
        let named_value = ["abcdef", "0123456789", "ghijkl"].concat();
        for (name, shape) in key_shapes() {
            let line = json_record(serde_json::json!({
                "message": "request",
                "request": { "headers": [{ "value": format!("sent {shape}") }] },
                "api_key": named_value,
            }));
            let written = write_through(&line);
            serde_json::from_str::<serde_json::Value>(written.trim())
                .unwrap_or_else(|_| panic!("{name} broke the JSON record"));
            assert!(
                !written.contains(&secret_of(name, &shape)),
                "{name} survived nested trace redaction"
            );
            assert!(
                !written.contains("abcdef0123456789ghijkl"),
                "named field value survived"
            );
        }
    }

    #[test]
    fn trace_writer_redacts_every_record_in_a_multi_line_write() {
        let first = json_record(serde_json::json!({ "message": "password: first-value" }));
        let second = json_record(serde_json::json!({ "message": "ok" }));
        let written = write_through(&[first, second].concat());
        let records: Vec<serde_json::Value> = written
            .lines()
            .map(|line| serde_json::from_str(line).expect("each record is JSON"))
            .collect();
        assert_eq!(records.len(), 2);
        assert!(!written.contains("first-value"));
        assert_eq!(records[1]["fields"]["message"], "ok");
    }

    #[test]
    fn trace_writer_fully_redacts_text_that_is_not_json() {
        let secret = ["sk-", "proj-", FILLER_24].concat();
        let written = write_through(&format!("{{\"fields\":{{\"message\":\"cut {secret}\n"));
        assert!(!written.contains(&secret), "partial record leaked a key");
        assert!(written.contains("[REDACTED"));
    }
}
