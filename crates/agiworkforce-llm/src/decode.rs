
/// Accumulates bytes across stream chunks and yields only the valid-UTF-8
/// prefix on each `push`, holding back any partial trailing codepoint until the
/// rest of its bytes arrive.
#[derive(Debug, Default)]
pub struct Utf8StreamDecoder {
    /// Bytes received but not yet emitted because they form an incomplete
    /// trailing codepoint. Empty between codepoint boundaries.
    buf: Vec<u8>,
}

impl Utf8StreamDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Append `bytes` and return the longest valid-UTF-8 string now available.
    /// Any incomplete trailing codepoint is retained for the next call.
    pub fn push(&mut self, bytes: &[u8]) -> String {
        self.buf.extend_from_slice(bytes);
        match std::str::from_utf8(&self.buf) {
            Ok(s) => {
                let out = s.to_string();
                self.buf.clear();
                out
            }
            Err(e) => {
                let valid = e.valid_up_to();
                if valid == 0 {
                    // Nothing complete yet (buffer holds only a partial codepoint).
                    return String::new();
                }
                // SAFETY of unwrap: `valid_up_to()` guarantees `buf[..valid]` is
                // valid UTF-8.
                let out = String::from_utf8(self.buf[..valid].to_vec())
                    .expect("valid_up_to guarantees a valid UTF-8 prefix");
                self.buf.drain(..valid);
                out
            }
        }
    }

    /// Flush any residual bytes at end-of-stream. A well-formed stream ends on a
    /// codepoint boundary and returns `""`; a truncated stream lossily decodes
    /// the dangling bytes so nothing is silently dropped.
    pub fn finish(&mut self) -> String {
        if self.buf.is_empty() {
            return String::new();
        }
        let out = String::from_utf8_lossy(&self.buf).to_string();
        self.buf.clear();
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ascii_passes_through_unchanged() {
        let mut d = Utf8StreamDecoder::new();
        assert_eq!(d.push(b"hello world"), "hello world");
        assert_eq!(d.finish(), "");
    }

    #[test]
    fn four_byte_emoji_split_2_2_reassembles() {
        // "😀" = F0 9F 98 80
        let bytes = "😀".as_bytes();
        let mut d = Utf8StreamDecoder::new();
        assert_eq!(d.push(&bytes[..2]), "");
        assert_eq!(d.push(&bytes[2..]), "😀"); // completed
        assert_eq!(d.finish(), "");
    }

    #[test]
    fn three_byte_cjk_split_2_1_reassembles() {
        // "好" = E5 A5 BD
        let bytes = "好".as_bytes();
        let mut d = Utf8StreamDecoder::new();
        assert_eq!(d.push(&bytes[..2]), "");
        assert_eq!(d.push(&bytes[2..]), "好");
    }

    #[test]
    fn two_byte_accent_split_1_1_reassembles() {
        // "é" = C3 A9
        let bytes = "é".as_bytes();
        let mut d = Utf8StreamDecoder::new();
        assert_eq!(d.push(&bytes[..1]), "");
        assert_eq!(d.push(&bytes[1..]), "é");
    }

    #[test]
    fn sse_line_with_split_multibyte_reassembles_exactly() {
        // A realistic SSE data line whose accented byte is split across chunks.
        let line = "data: {\"x\":\"é\"}\n";
        let bytes = line.as_bytes();
        // Find a split point in the middle of the 'é' (C3 A9) sequence.
        let e_pos = line.find('é').unwrap(); // byte index of the 0xC3
        let split = e_pos + 1; // between C3 and A9
        let mut d = Utf8StreamDecoder::new();
        let mut out = String::new();
        out.push_str(&d.push(&bytes[..split]));
        out.push_str(&d.push(&bytes[split..]));
        out.push_str(&d.finish());
        assert_eq!(out, line);
    }

    #[test]
    fn multibyte_split_across_three_pushes() {
        // "😀" delivered one byte at a time stays buffered until the last byte.
        let bytes = "😀".as_bytes();
        let mut d = Utf8StreamDecoder::new();
        assert_eq!(d.push(&bytes[..1]), "");
        assert_eq!(d.push(&bytes[1..2]), "");
        assert_eq!(d.push(&bytes[2..3]), "");
        assert_eq!(d.push(&bytes[3..]), "😀");
    }

    #[test]
    fn finish_is_empty_on_a_clean_stream() {
        let mut d = Utf8StreamDecoder::new();
        let _ = d.push("complete ✓ text".as_bytes());
        assert_eq!(d.finish(), "");
    }

    #[test]
    fn finish_recovers_truncated_trailing_bytes_lossily() {
        let mut d = Utf8StreamDecoder::new();
        // Only the first 2 bytes of the 4-byte emoji ever arrive.
        let bytes = "😀".as_bytes();
        assert_eq!(d.push(&bytes[..2]), "");
        // finish must not silently drop them.
        assert!(!d.finish().is_empty());
    }
}
