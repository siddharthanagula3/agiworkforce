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
        self.buf
            .extend(chunk.iter().copied().filter(|byte| *byte != b'\r'));
        let mut events = Vec::new();
        while let Some(pos) = find_subsequence(&self.buf, b"\n\n") {
            let frame: Vec<u8> = self.buf.drain(..pos + 2).collect();
            if let Some(event) = parse_frame(&frame) {
                events.push(event);
            }
        }
        if self.buf.len() > self.max_frame {
            bail!("frame exceeded {} bytes", self.max_frame);
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
