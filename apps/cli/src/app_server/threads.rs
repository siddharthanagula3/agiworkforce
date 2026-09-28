use agiworkforce_protocol::developer_session::ThreadSearchMatch;

use crate::models::Message;

const MAX_MATCHES_PER_THREAD: usize = 3;
const SNIPPET_LEAD_CHARS: usize = 60;
const SNIPPET_TRAIL_CHARS: usize = 120;

pub(super) fn is_transcript_message(message: &Message) -> bool {
    !message.role.eq_ignore_ascii_case("system")
}

pub(super) fn transcript_position(messages: &[Message], index: u32) -> Option<usize> {
    messages
        .iter()
        .enumerate()
        .filter(|(_, message)| is_transcript_message(message))
        .nth(usize::try_from(index).ok()?)
        .map(|(position, _)| position)
}

pub(super) fn keep_through_message(messages: &mut Vec<Message>, index: u32) -> bool {
    let Some(position) = transcript_position(messages, index) else {
        return false;
    };
    messages.truncate(position + 1);
    crate::agent::close_orphaned_tool_calls(messages);
    true
}

pub(super) fn lowered(text: &str) -> String {
    text.chars().flat_map(char::to_lowercase).collect()
}

pub(super) fn transcript_matches(messages: &[Message], needle: &str) -> Vec<ThreadSearchMatch> {
    messages
        .iter()
        .filter(|message| is_transcript_message(message))
        .enumerate()
        .filter_map(|(index, message)| {
            let text = message.text_content();
            let (start, end) = find_ignoring_case(&text, needle)?;
            Some(ThreadSearchMatch {
                message_index: u32::try_from(index).ok()?,
                role: message.role.clone(),
                snippet: snippet(&text, start, end),
            })
        })
        .take(MAX_MATCHES_PER_THREAD)
        .collect()
}

fn find_ignoring_case(text: &str, needle: &str) -> Option<(usize, usize)> {
    if needle.is_empty() {
        return None;
    }
    let mut folded = String::with_capacity(text.len());
    let mut origins: Vec<usize> = Vec::with_capacity(text.len());
    for (offset, character) in text.char_indices() {
        for lower in character.to_lowercase() {
            folded.push(lower);
            origins.resize(folded.len(), offset);
        }
    }
    let found = folded.find(needle)?;
    let start = origins[found];
    let end = origins
        .get(found + needle.len())
        .copied()
        .unwrap_or(text.len())
        .max(start);
    Some((start, end))
}

fn snippet(text: &str, start: usize, end: usize) -> String {
    let lead_start = text[..start]
        .char_indices()
        .rev()
        .nth(SNIPPET_LEAD_CHARS - 1)
        .map_or(0, |(offset, _)| offset);
    let trail_end = text[end..]
        .char_indices()
        .nth(SNIPPET_TRAIL_CHARS)
        .map_or(text.len(), |(offset, _)| end + offset);
    let body = text[lead_start..trail_end]
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "{}{body}{}",
        if lead_start > 0 { "…" } else { "" },
        if trail_end < text.len() { "…" } else { "" }
    )
}
