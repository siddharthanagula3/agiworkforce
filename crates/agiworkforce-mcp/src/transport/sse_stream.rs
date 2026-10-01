use anyhow::{Result, bail};

use crate::jsonrpc::find_subsequence;

pub(crate) struct SseEvent {
    pub(crate) event: Option<String>,
    pub(crate) data: String,
}

pub(crate) struct SseDecoder {
    buf: Vec<u8>,
    max_frame: usize,
}

impl SseDecoder {
    pub(crate) fn new(max_frame: usize) -> Self {
        Self {
            buf: Vec::new(),
            max_frame,
        }
    }

    pub(crate) fn push(&mut self, chunk: &[u8]) -> Result<Vec<SseEvent>> {
        let mut events = Vec::new();
        for byte in chunk.iter().copied().filter(|byte| *byte != b'\r') {
            if self.buf.len() >= self.max_frame {
                bail!("frame exceeded {} bytes", self.max_frame);
            }
            if self.buf.len() == self.buf.capacity() {
                let capacity = self
                    .buf
                    .capacity()
                    .saturating_mul(2)
                    .max(self.buf.len() + 1)
                    .min(self.max_frame);
                self.buf.try_reserve_exact(capacity - self.buf.len())?;
            }
            self.buf.push(byte);
            let boundary = self.buf.len().saturating_sub(2);
            if find_subsequence(&self.buf[boundary..], b"\n\n").is_some() {
                if let Some(event) = parse_frame(&self.buf) {
                    events.push(event);
                }
                self.buf.clear();
            }
        }
        Ok(events)
    }
}

fn parse_frame(frame: &[u8]) -> Option<SseEvent> {
    let text = String::from_utf8_lossy(frame);
    let mut event = None;
    let mut data: Option<String> = None;
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("event:") {
            event = Some(rest.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("data:") {
            let rest = rest.strip_prefix(' ').unwrap_or(rest);
            match data.as_mut() {
                Some(existing) => {
                    existing.push('\n');
                    existing.push_str(rest);
                }
                None => data = Some(rest.to_string()),
            }
        }
    }
    data.map(|data| SseEvent { event, data })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completed_frames_over_the_cap_are_refused_before_extraction() {
        let mut decoder = SseDecoder::new(8);
        let frame = b"data: 123456789\n\n";
        assert!(frame.len() > decoder.max_frame);
        assert!(
            decoder.push(frame).is_err(),
            "completed frame over configured cap must be refused"
        );
        assert!(decoder.buf.len() <= decoder.max_frame);
        assert!(decoder.buf.capacity() <= decoder.max_frame);
    }

    #[test]
    fn fragmented_exact_frames_preserve_crlf_unicode_and_fields() {
        let frame = "event: message\r\ndata: λ\r\n\r\n".as_bytes();
        let normalized_len = "event: message\ndata: λ\n\n".len();
        for split in 0..=frame.len() {
            let mut decoder = SseDecoder::new(normalized_len);
            let mut events = decoder.push(&frame[..split]).unwrap();
            events.extend(decoder.push(&frame[split..]).unwrap());
            assert_eq!(events.len(), 1);
            assert_eq!(events[0].event.as_deref(), Some("message"));
            assert_eq!(events[0].data, "λ");
            assert!(decoder.buf.is_empty());
            assert!(decoder.buf.capacity() <= normalized_len);
        }
    }

    #[test]
    fn each_event_has_its_own_cap_and_partial_frames_remain_bounded() {
        let frame = b"data: x\n\n";
        let mut decoder = SseDecoder::new(frame.len());
        let events = decoder.push(&[frame.as_slice(), frame].concat()).unwrap();
        assert_eq!(events.len(), 2);
        assert!(events.iter().all(|event| event.data == "x"));
        assert!(decoder.buf.capacity() <= frame.len());
        let mut decoder = SseDecoder::new(frame.len() - 1);
        assert!(decoder.push(&frame[..frame.len() - 1]).is_ok());
        assert!(decoder.push(&frame[frame.len() - 1..]).is_err());
        assert!(decoder.buf.len() <= decoder.max_frame);
        assert!(decoder.buf.capacity() <= decoder.max_frame);
        let mut decoder = SseDecoder::new(0);
        assert!(decoder.push(b"\r\r").unwrap().is_empty());
        assert!(decoder.push(b"x").is_err());
        assert!(decoder.buf.is_empty());
    }
}
